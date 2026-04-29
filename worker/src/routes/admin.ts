import type { Env, UserRow } from "../types";
import { bad, json, now } from "../util";
import { scrapeOne } from "../scraper";
import { pollOnce } from "../poll";
import { buildHistoryResponse } from "./characters";
import { refreshCatalog } from "../items-scrape";
import { pokeWatcher, spawnWatcher } from "../char-watcher";
import { refreshServerEvents } from "../server-events";

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
  ancient_values?: string[];
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

export async function adminImportItemRules(env: Env, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { rules?: ItemRuleImport[] } | ItemRuleImport[] | null;
  const rules = Array.isArray(body) ? body : (body && Array.isArray(body.rules) ? body.rules : null);
  if (!rules) return bad(400, "envie { rules: [...] }");
  if (rules.length > 5000) return bad(400, "muitas regras (max 5000)");

  const t = now();
  let upserted = 0;
  const ancientNamesToEnsure: string[] = [];
  for (const r of rules) {
    const name = (r?.name ?? "").trim();
    if (!name) continue;
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
    if (ancientVals.length > 0) ancientNamesToEnsure.push(...ancientVals);

    // For partial imports/backfills, allow omitting excellent_values/ancient_values
    // so we don't overwrite existing DB values with [].
    // Also: if the property exists but the array is empty, treat it as "no update".
    const excJsonOrNull = (hasExcProp && excVals.length > 0) ? JSON.stringify(excVals) : null;
    const ancJsonOrNull = (hasAncProp && ancientVals.length > 0) ? JSON.stringify(ancientVals) : null;
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
    upserted++;
  }

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
  const one = {
    name: r.rule.name,
    item_slug: r.rule.item_slug ?? null,
    kind: r.rule.kind ?? null,
    options: r.rule.options ?? {},
    suggested: r.rule.suggested ?? {},
    excellent_values: r.rule.excellent_values ?? [],
    ancient_values: (r.rule as unknown as { ancient_values?: string[] }).ancient_values ?? [],
  };
  // Upsert exactly one.
  const fakeReq = new Request("http://local/import", { method: "POST", body: JSON.stringify({ rules: [one] }) });
  return await adminImportItemRules(env, fakeReq);
}

export async function adminBackfillItemRulesFromSources(env: Env, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { limit?: number; concurrency?: number; cookie?: string };
  const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 200);
  const concurrency = Math.min(Math.max(Number(body.concurrency ?? 50), 1), 100);
  const cookie = (body.cookie ?? "").trim();
  const { scrapeShopItemRule, getShopAuthCookie } = await import("../shop-scrape");

  // Avoid "Too many subrequests" by logging in once and reusing the cookie across items.
  let cookieToUse = cookie;
  let cookieSource: "provided" | "authed" | "none" = cookieToUse ? "provided" : "none";
  if (!cookieToUse) {
    const auth = await getShopAuthCookie(env);
    if (auth.ok) {
      cookieToUse = auth.cookie;
      cookieSource = "authed";
    } else {
      console.log("backfill auth cookie failed: " + auth.error);
    }
  }

  console.log(
    "adminBackfillItemRulesFromSources start limit=" + limit +
      " concurrency=" + concurrency +
      " used_cookie=" + (!!cookieToUse) +
      " cookie_source=" + cookieSource,
  );

  // Pick items that have at least one source url but don't yet have excellent_values and/or ancient_values populated.
  // We keep multiple sources per item (one per shop) — try preferred shops first.
  const rs = await env.DB.prepare(
    `SELECT s.item_slug, s.shop, s.detail_url, i.name
       FROM item_sources s
       JOIN items i ON i.slug = s.item_slug
       LEFT JOIN item_rules r ON r.item_slug = s.item_slug
      WHERE r.item_slug IS NULL
         OR r.excellent_values IS NULL OR r.excellent_values = '[]'
         OR r.ancient_values IS NULL OR r.ancient_values = '[]'
      ORDER BY
        CASE s.shop
          WHEN 'shop-gold' THEN 0
          WHEN 'rarius' THEN 1
          WHEN 'rings-pendants' THEN 2
          ELSE 9
        END,
        s.updated_at DESC
      LIMIT ?`,
  ).bind(limit * 5).all<{ item_slug: string; shop: string; detail_url: string; name: string }>();

  let attempted = 0;
  let imported = 0;
  let with_ancient = 0;
  let with_excellent = 0;
  const errors: string[] = [];
  const rawRows = rs.results ?? [];
  // De-dup to at most one source per item for this run (preferred shop ordering above).
  const rows: Array<{ item_slug: string; detail_url: string; name: string }> = [];
  const seen = new Set<string>();
  for (const r of rawRows) {
    if (seen.has(r.item_slug)) continue;
    seen.add(r.item_slug);
    rows.push({ item_slug: r.item_slug, detail_url: r.detail_url, name: r.name });
    if (rows.length >= limit) break;
  }

  console.log("adminBackfillItemRulesFromSources picked rows=" + rows.length + " sources_scanned=" + rawRows.length);

  const worker = async (row: { item_slug: string; detail_url: string; name: string }) => {
    console.log("backfill scrape item_slug=" + row.item_slug + " url=" + row.detail_url);
    const r = await scrapeShopItemRule(env, { url: row.detail_url, name: row.name, cookie: cookieToUse } as never);
    if ("error" in r) return { ok: false as const, err: row.name + ": " + r.error };
    const ancientVals = ((r.rule as unknown as { ancient_values?: unknown }).ancient_values);
    const excellentVals = (r.rule.excellent_values ?? null);
    const one: Record<string, unknown> = {
      name: r.rule.name,
      item_slug: row.item_slug,
      kind: r.rule.kind ?? null,
      options: r.rule.options ?? {},
      suggested: r.rule.suggested ?? {},
    };
    const hasExcellent = Array.isArray(excellentVals) && excellentVals.length > 0;
    const hasAncient = Array.isArray(ancientVals) && ancientVals.length > 0;
    if (Array.isArray(excellentVals) && excellentVals.length > 0) {
      one.excellent_values = excellentVals;
    }
    if (Array.isArray(ancientVals) && ancientVals.length > 0) {
      one.ancient_values = ancientVals;
    }
    console.log(
      "backfill parsed item_slug=" + row.item_slug +
        " excellent=" + (hasExcellent ? String((excellentVals as unknown[]).length) : "0") +
        " ancient=" + (hasAncient ? String((ancientVals as unknown[]).length) : "0"),
    );
    const fakeReq = new Request("http://local/import", { method: "POST", body: JSON.stringify({ rules: [one] }) });
    const res = await adminImportItemRules(env, fakeReq);
    if (res.status >= 200 && res.status < 300) {
      console.log("backfill import ok item_slug=" + row.item_slug);
      return { ok: true as const, hasAncient, hasExcellent };
    }
    console.log("backfill import failed item_slug=" + row.item_slug + " status=" + res.status);
    return { ok: false as const, err: row.name + ": import HTTP " + res.status };
  };

  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    attempted += batch.length;
    console.log("backfill batch from=" + i + " size=" + batch.length);
    const settled = await Promise.allSettled(batch.map(worker));
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value.ok) {
        imported++;
        if (s.value.hasAncient) with_ancient++;
        if (s.value.hasExcellent) with_excellent++;
      }
      else {
        const err = s.status === "fulfilled" ? s.value.err : String(s.reason?.message || s.reason || "erro desconhecido");
        if (err) errors.push(err);
      }
    }
    if (errors.length) console.log("backfill batch errors_so_far=" + errors.length + " first=" + errors[0]);
  }
  console.log(
    "adminBackfillItemRulesFromSources done attempted=" + attempted +
      " imported=" + imported +
      " with_excellent=" + with_excellent +
      " with_ancient=" + with_ancient +
      " errors=" + errors.length,
  );
  return json({
    ok: true,
    attempted,
    imported,
    with_ancient,
    with_excellent,
    concurrency,
    used_cookie: !!cookieToUse,
    cookie_source: cookieSource,
    errors: errors.slice(0, 20),
  });
}

type AncientSetImport = { name: string; attrs?: string[] };
export async function adminImportAncientSets(env: Env, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { sets?: AncientSetImport[] } | AncientSetImport[] | null;
  const sets = Array.isArray(body) ? body : (body && Array.isArray(body.sets) ? body.sets : null);
  if (!sets) return bad(400, "envie { sets: [...] }");
  if (sets.length > 2000) return bad(400, "muitos sets (max 2000)");

  const t = now();
  let upserted = 0;
  for (const s of sets) {
    const name = String(s?.name ?? "").trim();
    if (!name) continue;
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
    upserted++;
  }
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
         -- best-effort: show one owner (latest link) for display
         (SELECT u.id
            FROM user_characters uc
            JOIN users u ON u.id = uc.user_id
           WHERE uc.character_id = c.id
           ORDER BY uc.created_at DESC
           LIMIT 1) AS owner_user_id,
         (SELECT u.first_name
            FROM user_characters uc
            JOIN users u ON u.id = uc.user_id
           WHERE uc.character_id = c.id
           ORDER BY uc.created_at DESC
           LIMIT 1) AS owner_first_name,
         (SELECT u.telegram_username
            FROM user_characters uc
            JOIN users u ON u.id = uc.user_id
           WHERE uc.character_id = c.id
           ORDER BY uc.created_at DESC
           LIMIT 1) AS owner_username,
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
  // Modest concurrency — each spawn is one DO RPC call.
  const CONC = 10;
  for (let i = 0; i < ids.length; i += CONC) {
    const batch = ids.slice(i, i + CONC);
    const out = await Promise.all(
      batch.map((id) => spawnWatcher(env, id).then(() => true).catch(() => false)),
    );
    for (const ok of out) (ok ? spawned++ : failed++);
  }
  return json({ ok: true, total: ids.length, spawned, failed });
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
