import type { Env, ItemRulesBackfillParams, UserRow } from "../types";
import { bad, json, now } from "../util";
import { scrapeOne } from "../scraper";
import { pollOnce } from "../poll";
import { buildHistoryResponse } from "./characters";
import { refreshCatalog } from "../items-scrape";
import { pokeWatcher, spawnWatcher } from "../char-watcher";
import { refreshServerEvents } from "../server-events";

/** Max parallel ops for admin import (D1 upserts) and backfill scrape when no cookie. */
const ADMIN_PARALLEL_CONCURRENCY = 12;
/** Parallel shop HTML fetches per backfill batch (cookie path — upstream is the bottleneck). */
const BACKFILL_SCRAPE_CONCURRENCY_WITH_COOKIE = 10;
/**
 * Ceiling on concurrent shop fetches across all category threads.
 * Without this, N threads × per-batch concurrency can stampede mupatos (timeouts / 429 → most scrapes fail).
 */
/** Keeps `N threads × scrapeConcurrency` shop fetches near this ceiling (helps stay under Worker subrequest limits). */
const BACKFILL_SCRAPE_GLOBAL_MAX = 36;
/** Scrape + import this many items per wave (cookie refresh between waves when authed). */
export const BACKFILL_SCRAPE_BATCH_SIZE = 40;

/** How many distinct items to process when `limit` is omitted (full-catalog backfill). */
const BACKFILL_DEFAULT_LIMIT = 10_000;
const BACKFILL_MAX_LIMIT = 50_000;

/** Single place for limit so HTTP + Workflow + core agree (avoids stale UI still sending 40). */
export function normalizeBackfillLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return BACKFILL_DEFAULT_LIMIT;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return BACKFILL_DEFAULT_LIMIT;
  // Older UI defaulted to 40 per run; treat as "use server default" so logs don’t stay stuck at 40.
  if (n === 40) return BACKFILL_DEFAULT_LIMIT;
  return Math.min(Math.max(n, 1), BACKFILL_MAX_LIMIT);
}

/** Free-tier Workflow instances: ~50 external `fetch` subrequests per instance (login + shop pages). */
const WORKFLOW_BACKFILL_DEFAULT_SQL_LIMIT = 45;
/** Cap how many category-scoped workflow steps we enqueue in one instance (safety). */
const BACKFILL_WORKFLOW_MAX_CATEGORY_STEPS = 200;

function resolveWorkflowBackfillSqlLimit(env: Env, wid: string | undefined, requested: number): number {
  if (!wid?.trim()) return requested;
  const raw = env.BACKFILL_WORKFLOW_ITEM_CAP;
  let cap: number;
  if (raw != null && String(raw).trim() !== "") {
    cap = Math.floor(Number(String(raw).trim()));
    if (!Number.isFinite(cap) || cap < 1) cap = WORKFLOW_BACKFILL_DEFAULT_SQL_LIMIT;
  } else {
    cap = WORKFLOW_BACKFILL_DEFAULT_SQL_LIMIT;
  }
  cap = Math.min(Math.max(cap, 1), BACKFILL_MAX_LIMIT);
  return Math.min(requested, cap);
}

/** Workflow `create` / `get` return RPC stubs; must dispose to avoid runtime warnings. */
function disposeWorkflowHandle(handle: unknown): void {
  if (handle == null) return;
  const h = handle as { dispose?: () => void };
  const symDispose = (Symbol as unknown as { dispose?: symbol }).dispose;
  try {
    if (typeof h.dispose === "function") {
      h.dispose();
      return;
    }
    if (symDispose !== undefined) {
      const fn = (handle as Record<symbol, unknown>)[symDispose];
      if (typeof fn === "function") (fn as () => void)();
    }
  } catch {
    /* ignore */
  }
}

/** Append one line for admin UI (`GET .../backfill/output?id=`). */
async function backfillLiveLog(env: Env, instanceId: string | undefined, line: string): Promise<void> {
  const id = (instanceId ?? "").trim();
  if (!id) return;
  const ts = Math.floor(Date.now() / 1000);
  const text = line.length > 1800 ? line.slice(0, 1800) + "…" : line;
  try {
    await env.DB.prepare(
      `INSERT INTO backfill_workflow_output_line (instance_id, ts, line) VALUES (?, ?, ?)`,
    ).bind(id, ts, text).run();
  } catch {
    /* migration missing or D1 error */
  }
}

/**
 * Pool (not fixed waves): keep up to `concurrency` tasks in flight; as soon as one
 * finishes, the next item starts. Avoids one slow URL blocking an entire "wave".
 */
async function asyncPoolSettled<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const n = Math.max(1, concurrency);
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        const value = await fn(items[i]!);
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  const pool = Math.min(n, items.length);
  await Promise.all(Array.from({ length: pool }, () => worker()));
  return results;
}

async function asyncPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const n = Math.max(1, concurrency);
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
  return results;
}

function normalizeItemSlug(name: string): string {
  // Keep this compatible with item `slug` style used across the app (kebab-case).
  // Note: D1/SQLite uniqueness is case-sensitive-ish depending on collation; we
  // enforce lowercase here for stable keys.
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

type ItemRuleImport = {
  name: string;
  item_slug?: string | null;
  kind?: string | null;
  options?: {
    excellent?: boolean;
    luck?: boolean;
    skill?: boolean;
    life?: boolean;
    harmony?: boolean;
  };
  suggested?: {
    life_values?: number[];
    harmony_values?: string[];
  };
  excellent_values?: string[];
  ancient_values?: string[];
  /**
   * Shop backfill only: when true, empty `excellent_values` / `ancient_values` arrays are stored as JSON `[]`
   * so the row is not re-queued (imports omitting keys still use COALESCE / no-touch semantics).
   */
  persist_empty_excellent_ancient?: boolean;
};

function normalizeAncientSetName(raw: string): string {
  // Shop UI sometimes appends "+5" or "+10" (ancient stat roll). Fanz set names don't.
  // Keep only the base set name.
  return String(raw || "")
    .replace(/\s*\+\s*(?:5|10)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

let lastAncientFanzSyncAt = 0;
const ANCIENT_FANZ_SYNC_MIN_INTERVAL_SEC = 6 * 3600; // throttle: at most once per 6h per isolate

async function syncAncientSetsFromFanzIntoDb(env: Env): Promise<{ ok: true; source: string; upserted: number } | { ok: false; error: string }> {
  const source = "https://muonlinefanz.com/guide/items/ancient/";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(source, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: ctrl.signal,
      cf: { cacheTtl: 86400, cacheEverything: true } as RequestInitCfProperties,
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: "upstream " + res.status };
    const html = await res.text();
    const lines = stripTagsToLines(html);
    const sets = parseAncientSetsFromFanzLines(lines);
    if (sets.length === 0) return { ok: false, error: "não consegui extrair ancient sets do Fanz (layout mudou?)" };

    const tNow = now();
    let upserted = 0;
    for (const s of sets) {
      await env.DB.prepare(
        `INSERT INTO ancient_sets (name, attrs, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           attrs = excluded.attrs,
           updated_at = excluded.updated_at`,
      ).bind(s.name, JSON.stringify(s.attrs.slice(0, 30)), tNow).run();
      upserted++;
    }
    lastAncientFanzSyncAt = tNow;
    return { ok: true, source, upserted };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function ensureAncientSetsExist(env: Env, names: string[]): Promise<{ synced: boolean; upserted: number; reason?: string }> {
  const uniq = [...new Set((names || []).map((s) => normalizeAncientSetName(String(s))).filter(Boolean))].slice(0, 50);
  if (uniq.length === 0) return { synced: false, upserted: 0 };

  // Check which ones are missing.
  const placeholders = uniq.map(() => "?").join(",");
  const rs = await env.DB
    .prepare("SELECT name FROM ancient_sets WHERE name IN (" + placeholders + ")")
    .bind(...uniq)
    .all<{ name: string }>();
  const have = new Set((rs.results ?? []).map((r) => r.name));
  const missing = uniq.filter((n) => !have.has(n));
  if (missing.length === 0) return { synced: false, upserted: 0 };

  const tNow = now();
  if (lastAncientFanzSyncAt && (tNow - lastAncientFanzSyncAt) < ANCIENT_FANZ_SYNC_MIN_INTERVAL_SEC) {
    return { synced: false, upserted: 0, reason: "throttled" };
  }
  const synced = await syncAncientSetsFromFanzIntoDb(env);
  if (!synced.ok) return { synced: false, upserted: 0, reason: synced.error };
  return { synced: true, upserted: synced.upserted };
}

async function upsertOneImportedItemRule(
  env: Env,
  r: ItemRuleImport,
  t: number,
): Promise<{ upserted: 0 | 1; ancientNames: string[] }> {
  const name = (r?.name ?? "").trim();
  if (!name) return { upserted: 0, ancientNames: [] };

  const slug = normalizeItemSlug(name);
  const itemSlug = (r.item_slug ?? null) ? String(r.item_slug).trim() : null;
  const opts = r.options ?? {};
  const sug = r.suggested ?? {};
  const lifeVals = Array.isArray(sug.life_values) ? sug.life_values.filter((n) => Number.isInteger(n) && n >= 0 && n <= 28) : [];
  const harmonyVals = Array.isArray(sug.harmony_values) ? sug.harmony_values.map((s) => String(s).trim()).filter(Boolean).slice(0, 50) : [];
  const rawExc = (r as unknown as { excellent_values?: unknown }).excellent_values;
  const hasExcProp = Object.prototype.hasOwnProperty.call((r as unknown as Record<string, unknown>), "excellent_values");
  const excVals = Array.isArray(rawExc)
    ? (rawExc as unknown[])
      .map((s: unknown) => String(s).trim())
      .filter(Boolean)
      .slice(0, 30)
    : [];
  const rawAnc = (r as unknown as { ancient_values?: unknown }).ancient_values;
  const hasAncProp = Object.prototype.hasOwnProperty.call((r as unknown as Record<string, unknown>), "ancient_values");
  const ancientVals = Array.isArray(rawAnc)
    ? (rawAnc as unknown[])
      .map((s: unknown) => normalizeAncientSetName(String(s)))
      .filter(Boolean)
      .slice(0, 20)
    : [];
  const ancientNames = ancientVals.length > 0 ? [...ancientVals] : [];

  const persistEmpty = Boolean(r.persist_empty_excellent_ancient);
  // For partial JSON imports: omit keys or send [] → do not overwrite DB (COALESCE keeps prior).
  // Shop backfill sets `persist_empty_excellent_ancient` so a successful scrape stores [] and leaves the queue.
  const excJsonOrNull = !hasExcProp
    ? null
    : excVals.length > 0
      ? JSON.stringify(excVals)
      : persistEmpty
        ? JSON.stringify([])
        : null;
  const ancJsonOrNull = !hasAncProp
    ? null
    : ancientVals.length > 0
      ? JSON.stringify(ancientVals)
      : persistEmpty
        ? JSON.stringify([])
        : null;
  const baseBinds = [
    name,
    r.kind ?? null,
    opts.excellent === false ? 0 : 1,
    opts.luck === false ? 0 : 1,
    opts.skill === false ? 0 : 1,
    opts.life === false ? 0 : 1,
    opts.harmony ? 1 : 0,
    JSON.stringify(lifeVals),
    JSON.stringify(harmonyVals),
    excJsonOrNull,
    ancJsonOrNull,
    t,
  ] as const;

  if (itemSlug) {
    const bySlug = await env.DB
      .prepare("SELECT id, item_slug FROM item_rules WHERE slug = ? LIMIT 1")
      .bind(slug)
      .first<{ id: number; item_slug: string | null }>();
    const byItem = await env.DB
      .prepare("SELECT id, slug FROM item_rules WHERE item_slug = ? LIMIT 1")
      .bind(itemSlug)
      .first<{ id: number; slug: string }>();

    // If both exist but point to different rows, merge into the slug row
    // (slug is the natural unique key by name).
    if (bySlug && byItem && bySlug.id !== byItem.id) {
      await env.DB.prepare("DELETE FROM item_rules WHERE id = ?").bind(byItem.id).run();
    }

    if (bySlug) {
      await env.DB.prepare(
        `UPDATE item_rules
            SET item_slug = ?,
                name = ?,
                kind = ?,
                allow_excellent = ?,
                allow_luck = ?,
                allow_skill = ?,
                allow_life = ?,
                allow_harmony = ?,
                life_values = ?,
                harmony_values = ?,
                excellent_values = COALESCE(?, excellent_values),
                ancient_values = COALESCE(?, ancient_values),
                updated_at = ?
          WHERE id = ?`,
      ).bind(itemSlug, ...baseBinds, bySlug.id).run();
    } else if (byItem) {
      await env.DB.prepare(
        `UPDATE item_rules
            SET slug = ?,
                name = ?,
                kind = ?,
                allow_excellent = ?,
                allow_luck = ?,
                allow_skill = ?,
                allow_life = ?,
                allow_harmony = ?,
                life_values = ?,
                harmony_values = ?,
                excellent_values = COALESCE(?, excellent_values),
                ancient_values = COALESCE(?, ancient_values),
                updated_at = ?
          WHERE id = ?`,
      ).bind(slug, ...baseBinds, byItem.id).run();
    } else {
      const excIns = (hasExcProp && excVals.length > 0) ? JSON.stringify(excVals) : JSON.stringify([]);
      const ancIns = (hasAncProp && ancientVals.length > 0) ? JSON.stringify(ancientVals) : JSON.stringify([]);
      await env.DB.prepare(
        `INSERT INTO item_rules
           (slug, item_slug, name, kind, allow_excellent, allow_luck, allow_skill, allow_life, allow_harmony, life_values, harmony_values, excellent_values, ancient_values, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        slug,
        itemSlug,
        name,
        r.kind ?? null,
        opts.excellent === false ? 0 : 1,
        opts.luck === false ? 0 : 1,
        opts.skill === false ? 0 : 1,
        opts.life === false ? 0 : 1,
        opts.harmony ? 1 : 0,
        JSON.stringify(lifeVals),
        JSON.stringify(harmonyVals),
        excIns,
        ancIns,
        t,
      ).run();
    }
  } else {
    const excIns = (hasExcProp && excVals.length > 0) ? JSON.stringify(excVals) : JSON.stringify([]);
    const ancIns = (hasAncProp && ancientVals.length > 0) ? JSON.stringify(ancientVals) : JSON.stringify([]);
    await env.DB.prepare(
      `INSERT INTO item_rules
         (slug, name, kind, allow_excellent, allow_luck, allow_skill, allow_life, allow_harmony, life_values, harmony_values, excellent_values, ancient_values, updated_at)
       VALUES
         (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         name = excluded.name,
         kind = excluded.kind,
         allow_excellent = excluded.allow_excellent,
         allow_luck = excluded.allow_luck,
         allow_skill = excluded.allow_skill,
         allow_life = excluded.allow_life,
         allow_harmony = excluded.allow_harmony,
         life_values = excluded.life_values,
         harmony_values = excluded.harmony_values,
         excellent_values = COALESCE(excluded.excellent_values, item_rules.excellent_values),
         ancient_values = COALESCE(excluded.ancient_values, item_rules.ancient_values),
         updated_at = excluded.updated_at`,
    ).bind(
      slug,
      name,
      r.kind ?? null,
      opts.excellent === false ? 0 : 1,
      opts.luck === false ? 0 : 1,
      opts.skill === false ? 0 : 1,
      opts.life === false ? 0 : 1,
      opts.harmony ? 1 : 0,
      JSON.stringify(lifeVals),
      JSON.stringify(harmonyVals),
      (hasExcProp && excVals.length > 0) ? JSON.stringify(excVals) : null,
      (hasAncProp && ancientVals.length > 0) ? JSON.stringify(ancientVals) : null,
      t,
    ).run();
  }
  return { upserted: 1, ancientNames };
}

export async function adminImportItemRules(env: Env, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { rules?: ItemRuleImport[] } | ItemRuleImport[] | null;
  const rules = Array.isArray(body) ? body : (body && Array.isArray(body.rules) ? body.rules : null);
  if (!rules) return bad(400, "envie { rules: [...] }");
  if (rules.length > 5000) return bad(400, "muitas regras (max 5000)");

  const t = now();
  const outcomes = await asyncPool(rules, ADMIN_PARALLEL_CONCURRENCY, (r) => upsertOneImportedItemRule(env, r, t));
  const upserted = outcomes.reduce((acc, o) => acc + o.upserted, 0);
  const ancientNamesToEnsure = outcomes.flatMap((o) => o.ancientNames);

  // If the crawler added Ancient sets for any item, ensure we have the
  // corresponding set attributes in ancient_sets (auto-sync from Fanz).
  const ensured = await ensureAncientSetsExist(env, ancientNamesToEnsure);
  return json({
    ok: true,
    upserted,
    ancient_sync: ensured,
  });
}

export async function adminScrapeShopItemRule(env: Env, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { url?: string; html?: string; name?: string; cookie?: string };
  const { scrapeShopItemRule } = await import("../shop-scrape");
  const r = await scrapeShopItemRule(env, { url: body.url, html: body.html, name: body.name, cookie: body.cookie } as never);
  if ("error" in r) return bad(409, r.error);
  // Reuse the bulk-import upsert logic shape.
  const one: ItemRuleImport = {
    name: r.rule.name,
    item_slug: r.rule.item_slug ?? null,
    kind: r.rule.kind ?? null,
    options: r.rule.options ?? {},
    suggested: r.rule.suggested ?? {},
    excellent_values: Array.isArray(r.rule.excellent_values) ? r.rule.excellent_values : [],
    ancient_values: Array.isArray((r.rule as { ancient_values?: string[] }).ancient_values)
      ? (r.rule as { ancient_values: string[] }).ancient_values
      : [],
    persist_empty_excellent_ancient: true,
  };
  // Upsert exactly one.
  const fakeReq = new Request("http://local/import", { method: "POST", body: JSON.stringify({ rules: [one] }) });
  return await adminImportItemRules(env, fakeReq);
}

/** Serializable result (Workflow step output + HTTP JSON). */
export type ItemRulesBackfillCoreResult = {
  ok: true;
  attempted: number;
  imported: number;
  with_ancient: number;
  with_excellent: number;
  batches: number;
  batch_size: number;
  /** One parallel branch per `item_sources.category` (shop shelf). */
  category_threads?: number;
  used_cookie: boolean;
  cookie_source: "provided" | "authed" | "none";
  errors: string[];
};

type BackfillPickRow = { item_slug: string; detail_url: string; name: string; category: string };

type ScrapeShopItemRuleFn = typeof import("../shop-scrape").scrapeShopItemRule;

/** Distinct `item_sources.category` values that still have backfill work (for workflow step fan-out). */
export async function listPendingBackfillCategories(
  env: Env,
  liveInstanceId?: string,
): Promise<string[]> {
  const rs = await env.DB.prepare(
    `SELECT DISTINCT TRIM(s.category) AS category
       FROM item_sources s
       JOIN items i ON i.slug = s.item_slug
       LEFT JOIN item_rules r ON r.item_slug = s.item_slug
      WHERE r.item_slug IS NULL
         OR r.excellent_values IS NULL
         OR r.ancient_values IS NULL
      ORDER BY category COLLATE NOCASE
      LIMIT ?`,
  )
    .bind(BACKFILL_WORKFLOW_MAX_CATEGORY_STEPS)
    .all<{ category: string }>();
  const out = (rs.results ?? [])
    .map((row) => (row.category ?? "").trim())
    .filter(Boolean);
  await backfillLiveLog(
    env,
    liveInstanceId,
    "workflow discover categories=" + out.length + " (max_steps=" + BACKFILL_WORKFLOW_MAX_CATEGORY_STEPS + ")",
  );
  return out;
}

/** Stable, URL-safe fragment for Cloudflare Workflow `step.do` names. */
export function backfillWorkflowStepNameForCategory(category: string, index: number): string {
  const raw = (category || "cat").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = raw
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 72);
  return ("backfill-" + (slug || "cat") + "-" + index).slice(0, 120);
}

/** Scrape + import all rows for one category (runs in parallel with other categories). */
async function runBackfillCategoryThread(
  env: Env,
  category: string,
  catRows: Array<{ item_slug: string; detail_url: string; name: string }>,
  cookieForFetch: string | undefined,
  scrapeConcurrency: number,
  scrapeShopItemRule: ScrapeShopItemRuleFn,
  liveInstanceId?: string,
): Promise<{
  attempted: number;
  imported: number;
  with_ancient: number;
  with_excellent: number;
  batches: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let attempted = 0;
  let imported = 0;
  let with_ancient = 0;
  let with_excellent = 0;
  let batches = 0;

  await backfillLiveLog(env, liveInstanceId, "[" + category + "] start rows=" + catRows.length);

  const parseOnly = async (row: { item_slug: string; detail_url: string; name: string }) => {
    const scraped = await scrapeShopItemRule(env, {
      url: row.detail_url,
      name: row.name,
      cookie: cookieForFetch,
    } as never);
    if ("error" in scraped) throw new Error(row.name + ": " + scraped.error);
    const ancientVals = Array.isArray((scraped.rule as { ancient_values?: unknown }).ancient_values)
      ? ((scraped.rule as { ancient_values: string[] }).ancient_values)
      : [];
    const excellentVals = Array.isArray(scraped.rule.excellent_values) ? scraped.rule.excellent_values : [];
    const one: ItemRuleImport = {
      name: scraped.rule.name,
      item_slug: row.item_slug,
      kind: scraped.rule.kind ?? null,
      options: scraped.rule.options ?? {},
      suggested: scraped.rule.suggested ?? {},
      excellent_values: excellentVals,
      ancient_values: ancientVals,
      persist_empty_excellent_ancient: true,
    };
    const hasExcellent = excellentVals.length > 0;
    const hasAncient = ancientVals.length > 0;
    return { rule: one, hasAncient, hasExcellent };
  };

  for (let i = 0; i < catRows.length; i += BACKFILL_SCRAPE_BATCH_SIZE) {
    batches++;
    const batch = catRows.slice(i, i + BACKFILL_SCRAPE_BATCH_SIZE);
    attempted += batch.length;
    const parsed = await asyncPoolSettled(batch, scrapeConcurrency, parseOnly);
    const rules: ItemRuleImport[] = [];
    const flags: Array<{ hasAncient: boolean; hasExcellent: boolean }> = [];
    let scrapeFail = 0;
    for (let k = 0; k < parsed.length; k++) {
      const s = parsed[k]!;
      const row = batch[k]!;
      if (s.status === "rejected") {
        scrapeFail++;
        const msg = String(s.reason && (s.reason as Error)?.message ? (s.reason as Error).message : s.reason);
        const line = "[" + category + "] item_slug=" + row.item_slug + " " + msg;
        errors.push(line);
        continue;
      }
      rules.push(s.value.rule);
      flags.push({ hasAncient: s.value.hasAncient, hasExcellent: s.value.hasExcellent });
    }

    await backfillLiveLog(
      env,
      liveInstanceId,
      "[" + category + "] batch " + batches + " scrape_ok=" + rules.length + " scrape_fail=" + scrapeFail,
    );

    if (rules.length > 0) {
      try {
        const fakeReq = new Request("http://local/import", { method: "POST", body: JSON.stringify({ rules }) });
        const res = await adminImportItemRules(env, fakeReq);
        if (res.status >= 200 && res.status < 300) {
          imported += flags.length;
          for (const f of flags) {
            if (f.hasAncient) with_ancient++;
            if (f.hasExcellent) with_excellent++;
          }
          await backfillLiveLog(
            env,
            liveInstanceId,
            "[" + category + "] batch " + batches + " import_ok count=" + rules.length,
          );
        } else {
          const errText = await res.text().catch(() => "");
          const line =
            "[" + category + "] import batch " + batches + " HTTP " + res.status +
              (errText ? ": " + errText.slice(0, 500) : "");
          errors.push(line.slice(0, 600));
          await backfillLiveLog(env, liveInstanceId, line.slice(0, 400));
        }
      } catch (e) {
        const line =
          "[" + category + "] import batch " + batches + ": " + ((e as Error)?.message ?? String(e));
        errors.push(line);
        await backfillLiveLog(env, liveInstanceId, line.slice(0, 400));
      }
    }
  }

  await backfillLiveLog(
    env,
    liveInstanceId,
    "[" + category + "] done attempted=" + attempted + " imported=" + imported + " errLines=" + errors.length,
  );
  return { attempted, imported, with_ancient, with_excellent, batches, errors };
}

/** Shared by HTTP handler and Cloudflare Workflow — does not return a Response. */
export async function runBackfillItemRulesFromSourcesCore(
  env: Env,
  input: ItemRulesBackfillParams,
): Promise<ItemRulesBackfillCoreResult> {
  const limit = normalizeBackfillLimit(input.limit);
  const sqlLimit = resolveWorkflowBackfillSqlLimit(env, input._workflow_instance_id, limit);
  const wid = input._workflow_instance_id;
  const cookieIn = (input.cookie ?? "").trim();
  const { scrapeShopItemRule, getShopAuthCookie } = await import("../shop-scrape");

  const cookieSource: "provided" | "authed" | "none" = cookieIn
    ? "provided"
    : env.SHOP_SCRAPER_USERNAME && env.SHOP_SCRAPER_PASSWORD
      ? "authed"
      : "none";

  const categoryScope = (input._category ?? "").trim();

  const backfillPickSql = (categoryClause: string) =>
    `SELECT picked.item_slug AS item_slug, picked.shop AS shop, picked.category AS category, picked.detail_url AS detail_url, picked.name AS name
       FROM (
         SELECT
           s.item_slug AS item_slug,
           s.shop AS shop,
           s.category AS category,
           s.detail_url AS detail_url,
           i.name AS name,
           ROW_NUMBER() OVER (
             PARTITION BY s.item_slug
             ORDER BY
               CASE s.shop
                 WHEN 'shop-gold' THEN 0
                 WHEN 'rarius' THEN 1
                 WHEN 'rings-pendants' THEN 2
                 ELSE 9
               END,
               s.category COLLATE NOCASE,
               s.item_slug COLLATE NOCASE
           ) AS rn
         FROM item_sources s
         JOIN items i ON i.slug = s.item_slug
         LEFT JOIN item_rules r ON r.item_slug = s.item_slug
        WHERE (r.item_slug IS NULL
           OR r.excellent_values IS NULL
           OR r.ancient_values IS NULL)
           ${categoryClause}
       ) AS picked
      WHERE picked.rn = 1
      ORDER BY
        CASE picked.shop
          WHEN 'shop-gold' THEN 0
          WHEN 'rarius' THEN 1
          WHEN 'rings-pendants' THEN 2
          ELSE 9
        END,
        picked.shop COLLATE NOCASE,
        picked.item_slug COLLATE NOCASE
      LIMIT ?`;

  // One row per item_slug: ROW_NUMBER sees *all* matching source rows (no LIMIT*25 truncation),
  // then we cap how many distinct items to scrape this run with outer LIMIT.
  // Queue = no rule yet, or shop lists never persisted (NULL). JSON [] means "scraped / confirmed empty" — skip.
  const rs = categoryScope
    ? await env.DB
        .prepare(backfillPickSql(`AND LOWER(TRIM(COALESCE(s.category, ''))) = LOWER(TRIM(?))`))
        .bind(categoryScope, sqlLimit)
        .all<{ item_slug: string; shop: string; detail_url: string; name: string }>()
    : await env.DB.prepare(backfillPickSql("")).bind(sqlLimit).all<{ item_slug: string; shop: string; detail_url: string; name: string }>();

  let attempted = 0;
  let imported = 0;
  let with_ancient = 0;
  let with_excellent = 0;
  const errors: string[] = [];
  const picked: BackfillPickRow[] = (rs.results ?? []).map((r) => ({
    item_slug: r.item_slug,
    detail_url: r.detail_url,
    name: r.name,
    category: (r as { category?: string }).category?.trim() || "unknown",
  }));

  const byCategory = new Map<string, Array<{ item_slug: string; detail_url: string; name: string }>>();
  for (const r of picked) {
    let list = byCategory.get(r.category);
    if (!list) {
      list = [];
      byCategory.set(r.category, list);
    }
    list.push({ item_slug: r.item_slug, detail_url: r.detail_url, name: r.name });
  }

  const scrapeConcDesired =
    cookieSource === "provided" || cookieSource === "authed"
      ? BACKFILL_SCRAPE_CONCURRENCY_WITH_COOKIE
      : ADMIN_PARALLEL_CONCURRENCY;
  const nCategoryThreads = Math.max(1, byCategory.size);
  const scrapeConcurrency = categoryScope
    ? Math.min(scrapeConcDesired, BACKFILL_SCRAPE_GLOBAL_MAX)
    : Math.max(1, Math.min(scrapeConcDesired, Math.floor(BACKFILL_SCRAPE_GLOBAL_MAX / nCategoryThreads)));

  await backfillLiveLog(
    env,
    wid,
    "run start items=" +
      picked.length +
      " categories=" +
      byCategory.size +
      (categoryScope ? " category_scope=" + categoryScope : "") +
      " limit_requested=" +
      limit +
      (sqlLimit < limit ? " limit_effective=" + sqlLimit + " (workflow cap)" : "") +
      " cookie_source=" +
      cookieSource +
      " scrape_concurrency=" +
      scrapeConcurrency,
  );

  // One login for the whole run: N× parallel `createShopSessionCookie` blows the Worker subrequest budget (esp. free tier).
  let sharedAuthedCookie: string | undefined;
  if (cookieSource === "authed") {
    const auth = await getShopAuthCookie(env);
    if (!auth.ok) {
      await backfillLiveLog(env, wid, "run aborted shop_login_failed " + auth.error);
      return {
        ok: true,
        attempted: picked.length,
        imported: 0,
        with_ancient: 0,
        with_excellent: 0,
        batches: 0,
        batch_size: BACKFILL_SCRAPE_BATCH_SIZE,
        category_threads: byCategory.size,
        used_cookie: false,
        cookie_source: cookieSource,
        errors: ["shop login: " + auth.error],
      };
    }
    sharedAuthedCookie = auth.cookie;
    await backfillLiveLog(env, wid, "shop session ready (shared across category threads)");
  }

  const threadCookieBase = cookieSource === "provided" ? (cookieIn || undefined) : sharedAuthedCookie;

  // Workflow + `_category`: one category per Worker invocation (Workflow step). Otherwise parallel per category.
  const settled = categoryScope
    ? await Promise.allSettled([
        (async () => {
          const catRows = byCategory.get(categoryScope) ?? [];
          return runBackfillCategoryThread(
            env,
            categoryScope,
            catRows,
            threadCookieBase,
            scrapeConcurrency,
            scrapeShopItemRule,
            wid,
          );
        })(),
      ])
    : await Promise.allSettled(
        [...byCategory.entries()].map(async ([category, catRows]) => {
          return runBackfillCategoryThread(
            env,
            category,
            catRows,
            threadCookieBase,
            scrapeConcurrency,
            scrapeShopItemRule,
            wid,
          );
        }),
      );

  let batches = 0;
  for (let ti = 0; ti < settled.length; ti++) {
    const s = settled[ti]!;
    if (s.status === "rejected") {
      const cat = categoryScope || [...byCategory.keys()][ti] || "?";
      const line = "[" + cat + "] thread: " + String((s.reason as Error)?.message ?? s.reason);
      errors.push(line);
      continue;
    }
    const p = s.value;
    attempted += p.attempted;
    imported += p.imported;
    with_ancient += p.with_ancient;
    with_excellent += p.with_excellent;
    batches += p.batches;
    errors.push(...p.errors);
  }

  await backfillLiveLog(
    env,
    wid,
    "run complete attempted=" + attempted + " imported=" + imported + " with_excellent=" + with_excellent + " errCount=" + errors.length + " batches=" + batches,
  );

  return {
    ok: true,
    attempted,
    imported,
    with_ancient,
    with_excellent,
    batches,
    batch_size: BACKFILL_SCRAPE_BATCH_SIZE,
    category_threads: byCategory.size,
    used_cookie: cookieSource === "provided" || cookieSource === "authed",
    cookie_source: cookieSource,
    errors: errors.slice(0, 20),
  };
}

export async function adminBackfillItemRulesFromSources(env: Env, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    limit?: number;
    concurrency?: number;
    cookie?: string;
    /** If true, run inline in the Worker (legacy). Default: use Workflow when configured. */
    sync?: boolean;
  };
  void body.concurrency;
  const params: ItemRulesBackfillParams = {
    limit: normalizeBackfillLimit(body.limit),
    cookie: (body.cookie ?? "").trim() || undefined,
  };

  if (body.sync === true || !env.BACKFILL_ITEM_RULES) {
    const out = await runBackfillItemRulesFromSourcesCore(env, params);
    return json(out);
  }

  // One workflow per category: spawn one scoped instance for each distinct
  // `item_sources.category` that still has missing rules.
  const categories = await listPendingBackfillCategories(env);
  if (categories.length === 0) {
    return json({
      ok: true,
      workflow: true as const,
      per_category: true as const,
      category_count: 0,
      instances: [],
      message: "Nenhuma categoria pendente para backfill.",
    });
  }

  const instancePairs: Array<{ category: string; instance_id: string }> = [];
  for (const cat of categories) {
    const instance = await env.BACKFILL_ITEM_RULES.create({
      params: {
        ...params,
        _category: cat,
      },
    });
    try {
      instancePairs.push({ category: cat, instance_id: instance.id });
    } finally {
      disposeWorkflowHandle(instance);
    }
  }

  try {
    return json({
      ok: true,
      workflow: true as const,
      per_category: true as const,
      category_count: instancePairs.length,
      instances: instancePairs,
      message:
        "Backfill disparado como 1 Workflow por categoria. Consulte o status de cada instância ou o dashboard da Cloudflare.",
    });
  } finally {
    // instances were disposed in-loop
  }
}

/** GET ?id= instance id */
export async function adminBackfillWorkflowStatus(env: Env, req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  if (!id?.trim()) return bad(400, "query id obrigatória");
  if (!env.BACKFILL_ITEM_RULES) return bad(503, "workflow não configurado");
  let instance: unknown;
  try {
    instance = await env.BACKFILL_ITEM_RULES.get(id.trim());
    const st = await (instance as { status: () => Promise<unknown> }).status();
    disposeWorkflowHandle(st);
    const wid = (instance as { id: string }).id;
    return json({ ok: true, instance_id: wid, status: st });
  } catch (e) {
    return bad(404, "instância não encontrada: " + (e as Error).message);
  } finally {
    disposeWorkflowHandle(instance);
  }
}

/** GET ?id= — live lines written during `runBackfillItemRulesFromSourcesCore` (workflow). */
export async function adminBackfillWorkflowOutput(env: Env, req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  if (!id?.trim()) return bad(400, "query id obrigatória");
  try {
    const rs = await env.DB.prepare(
      `SELECT line FROM backfill_workflow_output_line WHERE instance_id = ? ORDER BY id ASC LIMIT 800`,
    )
      .bind(id.trim())
      .all<{ line: string }>();
    return json({ ok: true, instance_id: id.trim(), lines: (rs.results ?? []).map((r) => r.line) });
  } catch {
    return json({ ok: true, instance_id: id.trim(), lines: [] });
  }
}

type AncientSetImport = { name: string; attrs?: string[] };
export async function adminImportAncientSets(env: Env, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { sets?: AncientSetImport[] } | AncientSetImport[] | null;
  const sets = Array.isArray(body) ? body : (body && Array.isArray(body.sets) ? body.sets : null);
  if (!sets) return bad(400, "envie { sets: [...] }");
  if (sets.length > 2000) return bad(400, "muitos sets (max 2000)");

  const t = now();
  const deltas = await asyncPool(sets, ADMIN_PARALLEL_CONCURRENCY, async (s) => {
    const name = String(s?.name ?? "").trim();
    if (!name) return 0;
    const attrs = Array.isArray(s.attrs)
      ? s.attrs.map((x) => String(x).trim()).filter(Boolean).slice(0, 30)
      : [];
    await env.DB.prepare(
      `INSERT INTO ancient_sets (name, attrs, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         attrs = excluded.attrs,
         updated_at = excluded.updated_at`,
    ).bind(name, JSON.stringify(attrs), t).run();
    return 1;
  });
  const upserted = deltas.reduce<number>((a, n) => a + n, 0);
  return json({ ok: true, upserted });
}

function stripTagsToLines(html: string): string[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h\d|br|tr|td)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}

function parseAncientSetsFromFanzLines(lines: string[]): Array<{ name: string; attrs: string[] }> {
  // The page repeats blocks like:
  //   <Set Name>
  //   Base Set DEF: ...
  //   +Set Options...
  //   x2 items: ...
  //   x3 items: ...
  //   ---
  //   Skill DMG +25
  //   ---
  //   Excellent DMG chance +10%
  // We capture everything between "+Set Options..." and the next set header.
  const out: Array<{ name: string; attrs: string[] }> = [];
  const isHeader = (l: string) => {
    // Heuristic: headers are short-ish and end with "Set".
    return /\bset$/i.test(l) && l.length >= 6 && l.length <= 60 && !/^base set/i.test(l);
  };
  for (let i = 0; i < lines.length; i++) {
    const name = lines[i];
    if (!isHeader(name)) continue;
    // Seek "+Set Options..." within the next ~20 lines.
    let j = i + 1;
    let found = -1;
    for (; j < Math.min(lines.length, i + 25); j++) {
      if (/^\+set options/i.test(lines[j])) { found = j; break; }
    }
    if (found < 0) continue;
    const attrs: string[] = [];
    let tier: string | null = null;
    for (let k = found + 1; k < lines.length; k++) {
      const l = lines[k];
      if (isHeader(l)) break;
      if (/^base set/i.test(l)) continue;
      if (/^\+set options/i.test(l)) continue;
      if (/^you can click an ancient set/i.test(l)) continue;
      if (/^advertisement/i.test(l)) continue;
      if (/^filter ancient sets/i.test(l)) continue;
      if (/^[-•]/.test(l)) continue;
      if (/^\[.*\]\(http/i.test(l)) continue; // markdown links in extracted text
      if (/^https?:\/\//i.test(l)) continue;
      if (/^\w.+\.php$/i.test(l)) continue;
      if (/^---+$/.test(l)) continue;
        // Drop obvious item-stat lines that sometimes leak into the capture.
        if (/^def:\s*\+/i.test(l)) continue;
        if (/^(one|two)-handed dmg:/i.test(l)) continue;
      const tierOnly = l.match(/^x(\d+)\s*items:\s*$/i);
      if (tierOnly) {
        tier = tierOnly[1];
        continue; // don't store the header-only line
      }
      const tierInline = l.match(/^x(\d+)\s*items:\s*(.+)$/i);
      if (tierInline) {
        tier = tierInline[1];
        const rest = (tierInline[2] || "").trim();
        if (rest && rest.length <= 120) attrs.push("x" + tier + " items: " + rest);
        continue;
      }
      if (/chance|\+|\bDMG\b|\bDEF\b|\bAG\b|\bHP\b|\bMana\b|\bEnergy\b|\bStrength\b|\bAgility\b|\bStamina\b|\bWIZ\b/i.test(l)) {
        // Keep compact bonus lines; if we're inside a tier block, prefix it.
        if (l.length <= 120) attrs.push(tier ? ("x" + tier + " items: " + l) : l);
      }
      // Stop runaway collection.
      if (attrs.length >= 30) break;
    }
    if (attrs.length > 0) out.push({ name, attrs: [...new Set(attrs)] });
  }
  // De-dupe by name, prefer the first (page order) but merge attrs.
  const by = new Map<string, Set<string>>();
  for (const s of out) {
    let set = by.get(s.name);
    if (!set) { set = new Set(); by.set(s.name, set); }
    for (const a of s.attrs) set.add(a);
  }
  return [...by.entries()].map(([name, set]) => ({ name, attrs: [...set] }));
}

export async function adminSyncAncientSetsFromFanz(env: Env): Promise<Response> {
  const r = await syncAncientSetsFromFanzIntoDb(env);
  if (!r.ok) return bad(502, "falha ao sync ancients: " + r.error);
  return json(r);
}

// Every admin route assumes the gate in index.ts already verified the
// caller has users.admin = 1.

interface AdminCharRow {
  id: number;
  name: string;
  blocked: number;
  class: string | null;
  resets: number | null;
  last_level: number | null;
  last_status: string | null;
  last_checked_at: number | null;
  rank_overall: number | null;
  rank_class: number | null;
  class_code: string | null;
  created_at: number;
  owner_user_id: number | null;
  owner_first_name: string | null;
  owner_username: string | null;
  /** JSON array of {id, first_name, username, is_gm, linked_at} — every user linked to this char. */
  owners_json: string | null;
  sub_count: number;
  avg_reset_time?: number | null;
}

export async function adminListChars(env: Env): Promise<Response> {
  const rs = await env.DB
    .prepare(
      `SELECT
         c.id, c.name, c.blocked, c.class, c.resets, c.last_level,
         c.last_status, c.last_checked_at, c.rank_overall, c.rank_class,
         c.class_code, c.created_at,
         -- All linked users (chars are global; multiple users can register the same name).
         -- owner_* fields kept for backward compat — they pick the OLDEST link
         -- ("first to register"), which is more useful than the newest for
         -- attribution. owners_json carries the full list for the admin UI.
         (SELECT u.id
            FROM user_characters uc
            JOIN users u ON u.id = uc.user_id
           WHERE uc.character_id = c.id
           ORDER BY uc.created_at ASC
           LIMIT 1) AS owner_user_id,
         (SELECT u.first_name
            FROM user_characters uc
            JOIN users u ON u.id = uc.user_id
           WHERE uc.character_id = c.id
           ORDER BY uc.created_at ASC
           LIMIT 1) AS owner_first_name,
         (SELECT u.telegram_username
            FROM user_characters uc
            JOIN users u ON u.id = uc.user_id
           WHERE uc.character_id = c.id
           ORDER BY uc.created_at ASC
           LIMIT 1) AS owner_username,
         (SELECT json_group_array(json_object(
                   'id', u.id,
                   'first_name', u.first_name,
                   'username', u.telegram_username,
                   'is_gm', uc.is_gm,
                   'linked_at', uc.created_at
                 ))
            FROM user_characters uc
            JOIN users u ON u.id = uc.user_id
           WHERE uc.character_id = c.id) AS owners_json,
         (SELECT COUNT(*) FROM subscriptions s WHERE s.character_id = c.id AND s.active = 1) AS sub_count,
         (SELECT (MAX(start_ts) - MIN(start_ts)) / NULLIF(MAX(resets) - MIN(resets), 0)
          FROM (SELECT resets, MIN(ts) as start_ts FROM char_snapshots WHERE char_id = c.id GROUP BY resets)
         ) AS avg_reset_time
       FROM characters c
       ORDER BY c.id DESC`,
    )
    .all<AdminCharRow>();
  return json({ characters: rs.results ?? [] });
}

export async function adminSetBlocked(
  env: Env,
  charId: number,
  req: Request,
): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { blocked?: boolean };
  if (typeof body.blocked !== "boolean") return bad(400, "blocked boolean obrigatório");
  const r = await env.DB
    .prepare("UPDATE characters SET blocked = ? WHERE id = ?")
    .bind(body.blocked ? 1 : 0, charId)
    .run();
  if (r.meta.changes === 0) return bad(404, "personagem não encontrado");
  return json({ ok: true });
}

export async function adminRefreshChar(env: Env, charId: number): Promise<Response> {
  const row = await env.DB
    .prepare("SELECT id, name, blocked FROM characters WHERE id = ?")
    .bind(charId)
    .first<{ id: number; name: string; blocked: number }>();
  if (!row) return bad(404, "personagem não encontrado");
  if (row.blocked) return bad(409, "personagem está bloqueado");
  const snap = await scrapeOne(env, row.name, { totalTimeoutMs: 25_000 });
  if (snap.scraped) {
    await env.DB
      .prepare(
        `UPDATE characters
            SET class = COALESCE(?, class),
                resets = COALESCE(?, resets),
                last_level = COALESCE(?, last_level),
                last_map = COALESCE(?, last_map),
                last_status = COALESCE(?, last_status),
                last_checked_at = ?
          WHERE id = ?`,
      )
      .bind(snap.class, snap.resets, snap.level, snap.map, snap.status, now(), charId)
      .run();
  }
  return json({ ok: snap.scraped, snapshot: snap });
}

export async function adminRunCron(env: Env): Promise<Response> {
  const r = await pollOnce(env);
  return json({ ok: true, ...r });
}

export async function adminHealth(env: Env): Promise<Response> {
  const nowTs = now();

  const counts = await env.DB
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users_count,
         (SELECT COUNT(*) FROM characters) AS chars_count,
         (SELECT COUNT(*) FROM user_characters) AS links_count,
         (SELECT COUNT(*) FROM characters WHERE blocked = 1) AS blocked_count,
         (SELECT COUNT(*) FROM subscriptions WHERE active = 1) AS active_subs_count,
         (SELECT COUNT(*) FROM subscriptions WHERE active = 1 AND event_type = 'server_event') AS server_event_subs_count,
         (SELECT COUNT(*) FROM server_events WHERE manual = 1) AS manual_events_count`
    )
    .first<{
      users_count: number;
      chars_count: number;
      links_count: number;
      blocked_count: number;
      active_subs_count: number;
      server_event_subs_count: number;
      manual_events_count: number;
    }>();

  const latestSnapshot = await env.DB
    .prepare("SELECT MAX(ts) AS ts FROM char_snapshots")
    .first<{ ts: number | null }>();
  const latestCharCheck = await env.DB
    .prepare("SELECT MAX(last_checked_at) AS ts FROM characters")
    .first<{ ts: number | null }>();
  const latestEventSync = await env.DB
    .prepare("SELECT MAX(updated_at) AS ts FROM server_events")
    .first<{ ts: number | null }>();

  const checkedChars = await env.DB
    .prepare("SELECT COUNT(*) AS c FROM characters WHERE last_checked_at IS NOT NULL")
    .first<{ c: number }>();

  return json({
    now: nowTs,
    shop_scraper: {
      has_username: !!env.SHOP_SCRAPER_USERNAME,
      has_password: !!env.SHOP_SCRAPER_PASSWORD,
    },
    counts: counts ?? {
      users_count: 0,
      chars_count: 0,
      links_count: 0,
      blocked_count: 0,
      active_subs_count: 0,
      server_event_subs_count: 0,
      manual_events_count: 0,
    },
    freshness: {
      latest_snapshot_ts: latestSnapshot?.ts ?? null,
      latest_char_check_ts: latestCharCheck?.ts ?? null,
      latest_event_sync_ts: latestEventSync?.ts ?? null,
    },
    coverage: {
      checked_chars: checkedChars?.c ?? 0,
      total_chars: counts?.chars_count ?? 0,
    },
  });
}

interface AdminSubRow {
  id: number;
  event_type: string;
  threshold: string | null;
  active: number;
  cooldown_until: number;
  last_fired_at: number | null;
  created_at: number;
  user_id: number;
  owner_first_name: string | null;
  owner_username: string | null;
}

// Admin variant — no ownership check, can view any char's history.
export async function adminCharHistory(env: Env, charId: number, req: Request): Promise<Response> {
  return await buildHistoryResponse(env, charId, req);
}

export async function adminClearCharSnapshots(env: Env, charId: number): Promise<Response> {
  const r = await env.DB
    .prepare("DELETE FROM char_snapshots WHERE char_id = ?")
    .bind(charId)
    .run();
  return json({ ok: true, deleted: r.meta.changes });
}

export async function adminRefreshItems(env: Env): Promise<Response> {
  try {
    const r = await refreshCatalog(env);
    return json({ ok: true, ...r });
  } catch (e) {
    return bad(500, "scrape falhou: " + (e as Error).message);
  }
}

export async function adminWipeCatalog(env: Env): Promise<Response> {
  try {
    // Catalog tables only. Leaves market listings/users untouched.
    const r1 = await env.DB.prepare("DELETE FROM item_sources").run();
    const r2 = await env.DB.prepare("DELETE FROM item_rules").run();
    const r3 = await env.DB.prepare("DELETE FROM items").run();
    return json({
      ok: true,
      deleted: {
        item_sources: r1.meta.changes,
        item_rules: r2.meta.changes,
        items: r3.meta.changes,
      },
    });
  } catch (e) {
    return bad(500, "wipe falhou: " + (e as Error).message);
  }
}

// One-shot bulk spawn — initialises a CharWatcher DO for every existing
// character. Safe to re-run: /init resets the alarm, no duplicates.
// Use this once after deploying the DO migration so legacy chars start
// ticking under the new architecture.
export async function adminSpawnAllWatchers(env: Env): Promise<Response> {
  const rs = await env.DB
    .prepare("SELECT id FROM characters WHERE blocked = 0 ORDER BY id")
    .all<{ id: number }>();
  const ids = (rs.results ?? []).map((r) => r.id);

  let spawned = 0;
  let failed = 0;
  // Capture the FIRST few error messages so the response surfaces what
  // went wrong (was: silent swallow → "{spawned:0,failed:20}" with no
  // diagnostic).
  const errors: Array<{ char_id: number; error: string }> = [];
  // Modest concurrency — each spawn is one DO RPC call.
  const CONC = 10;
  for (let i = 0; i < ids.length; i += CONC) {
    const batch = ids.slice(i, i + CONC);
    const out = await Promise.all(
      batch.map(async (id) => {
        try {
          await spawnWatcher(env, id);
          return { ok: true as const };
        } catch (e) {
          const msg = (e as Error)?.message || String(e);
          console.log(`spawnWatcher failed char=${id}: ${msg}`);
          return { ok: false as const, char_id: id, error: msg };
        }
      }),
    );
    for (const r of out) {
      if (r.ok) spawned++;
      else { failed++; if (errors.length < 5) errors.push({ char_id: r.char_id, error: r.error }); }
    }
  }
  return json({ ok: true, total: ids.length, spawned, failed, errors });
}

// Trigger one immediate alarm run on a specific char's DO — handy for
// debugging without waiting for the next 60s tick.
export async function adminPokeWatcher(env: Env, charId: number): Promise<Response> {
  try {
    await pokeWatcher(env, charId);
    return json({ ok: true });
  } catch (e) {
    return bad(500, "poke falhou: " + (e as Error).message);
  }
}

interface AdminEventRow {
  id: number;
  category: string;
  name: string;
  room: string;
  schedule: string;
  meta: string | null;
  manual: number;
  updated_at: number;
}

export async function adminListEvents(env: Env): Promise<Response> {
  const rs = await env.DB
    .prepare(
      `SELECT id, category, name, room, schedule, meta, manual, updated_at
         FROM server_events
        ORDER BY category, name, room`,
    )
    .all<AdminEventRow>();
  return json({ events: rs.results ?? [] });
}

// Force-refresh the scraped server events table — bypasses the 1h gate
// in shouldRefreshServerEvents so admins can verify a parser fix
// immediately. Manual-flagged rows keep their hand-edited schedule
// (refreshServerEvents already ON CONFLICT-skips those).
export async function adminRefreshEvents(env: Env): Promise<Response> {
  try {
    const r = await refreshServerEvents(env);
    return json({ ok: true, ...r });
  } catch (e) {
    return bad(500, "refresh falhou: " + (e as Error).message);
  }
}

// PATCH body: { schedule: "13:30,19:30,21:30", manual: true } — schedule
// validation = comma-separated HH:MM. Setting manual=true makes the row
// survive subsequent scrapes; setting manual=false hands control back to
// the scraper (next refresh will sync from mupatos.net).
const SCHED_RE = /^(\d{1,2}:\d{2})(,\d{1,2}:\d{2})*$/;
export async function adminUpdateEvent(env: Env, id: number, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { schedule?: string; manual?: boolean };
  const sets: string[] = [];
  const args: unknown[] = [];
  if (typeof body.schedule === "string") {
    const cleaned = body.schedule.replace(/\s+/g, "");
    if (cleaned && !SCHED_RE.test(cleaned)) {
      return bad(400, "schedule deve estar no formato 'HH:MM,HH:MM,…'");
    }
    sets.push("schedule = ?");
    args.push(cleaned);
  }
  if (typeof body.manual === "boolean") {
    sets.push("manual = ?");
    args.push(body.manual ? 1 : 0);
  }
  if (sets.length === 0) return bad(400, "nada pra atualizar");
  sets.push("updated_at = ?");
  args.push(now());
  args.push(id);
  const r = await env.DB
    .prepare(`UPDATE server_events SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...args)
    .run();
  if (r.meta.changes === 0) return bad(404, "evento não encontrado");
  return json({ ok: true });
}

export async function adminListCharSubs(env: Env, charId: number): Promise<Response> {
  const owner = await env.DB
    .prepare("SELECT id FROM characters WHERE id = ?")
    .bind(charId)
    .first<{ id: number }>();
  if (!owner) return bad(404, "personagem não encontrado");
  const rs = await env.DB
    .prepare(
      `SELECT
         s.id, s.event_type, s.threshold, s.active,
         s.cooldown_until, s.last_fired_at, s.created_at,
         s.user_id,
         u.first_name AS owner_first_name,
         u.telegram_username AS owner_username
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE s.character_id = ?
       ORDER BY s.id DESC`,
    )
    .bind(charId)
    .all<AdminSubRow>();
  return json({ subscriptions: rs.results ?? [] });
}
