import type { Env, ListingRow, ListingSide, UserRow } from "../types";
import { bad, json, now } from "../util";
import { escHtml, sendTelegram } from "../telegram";
import { ensureCatalog } from "../items-scrape";

// Same-origin proxy for mupatos.com.br item sprites. Some browsers cache
// stale 404s or block cross-origin webps inconsistently — proxying makes
// the image load deterministic and lets us share the CF edge cache.
export async function imgProxy(_env: Env, url: URL): Promise<Response> {
  const target = url.searchParams.get("u") ?? "";
  if (!/^https:\/\/mupatos\.com\.br\/site\/resources\/images\//i.test(target)) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(target, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept": "image/webp,image/*,*/*;q=0.8",
      },
      signal: ctrl.signal,
      cf: { cacheTtl: 86400, cacheEverything: true } as RequestInitCfProperties,
    });
    clearTimeout(t);
    if (!res.ok) return new Response("upstream " + res.status, { status: 502 });
    const ct = res.headers.get("content-type") ?? "image/webp";
    return new Response(res.body, {
      headers: {
        "content-type": ct,
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  } catch (e) {
    return new Response("err: " + (e as Error).message, { status: 502 });
  }
}

export async function warmupCatalog(env: Env): Promise<Response> {
  try {
    const r = await ensureCatalog(env);
    return json(r);
  } catch (e) {
    return bad(500, "warmup falhou: " + (e as Error).message);
  }
}

export async function listItems(env: Env, url: URL): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim();
  const category = (url.searchParams.get("category") ?? "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 30), 1), 100);

  const wheres: string[] = ["1=1"];
  const binds: (string | number)[] = [];
  if (q) {
    wheres.push("name LIKE ? COLLATE NOCASE");
    binds.push("%" + q.replace(/[%_]/g, "") + "%");
  }
  if (category) {
    wheres.push("category = ?");
    binds.push(category);
  }
  const sql =
    "SELECT slug, name, category, image_url FROM items " +
    "WHERE " + wheres.join(" AND ") + " ORDER BY name COLLATE NOCASE LIMIT ?";
  const rs = await env.DB.prepare(sql).bind(...binds, limit).all<{
    slug: string; name: string; category: string | null; image_url: string | null;
  }>();
  return json({ items: rs.results ?? [] });
}

// --- MU Online Fanz itemdb integration (server-side fetch + parse) ---
function normalizeItemNameForFanz(name: string): string {
  // Fanz itemdb uses pages like:
  //   Excellent%20Dark%20Reign%20Blade.php
  // We keep it simple: prefix with "Excellent " and URI-encode spaces.
  return ("Excellent " + name.trim()).replace(/\s+/g, " ").trim();
}

function parseFanzListBlock(html: string, header: string): string[] {
  // Extract lines from a section like "Item details..." where the body is:
  //   * foo
  //   * bar
  // followed by a horizontal rule ("---").
  const re = new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?\\n---", "i");
  const m = html.match(re);
  if (!m) return [];
  const block = m[0];
  const lines = (block.match(/\\*\\s+[^\\n]+/g) ?? []).map((s) => s.replace(/^\\*\\s+/, "").trim());
  return lines.filter(Boolean).slice(0, 30);
}

function parseFanzExcellentOptions(html: string): string[] {
  // In the "Possible additional options..." section, we want only the
  // list of "Excellent option..." bullets (usually 6).
  const sec = html.match(/Possible additional options\\.{3}[\\s\\S]*?(?:Notes & links\\.{3}|About us\\.{3})/i)?.[0];
  if (!sec) return [];
  const exc = sec.match(/Excellent option[\\s\\S]*?(?:\\+Jewel of Life option|\\+Jewel of Harmony option|\\+Luck option|---)/i)?.[0] ?? sec;
  const raw = (exc.match(/\\*\\s+[^\\n]+/g) ?? []).map((s) => s.replace(/^\\*\\s+/, "").trim());
  const cleaned = raw
    .filter((s) => !/^Possible additional options/i.test(s))
    .filter((s) => !/^Excellent option/i.test(s))
    .filter((s) => !/^\\+Jewel of /i.test(s))
    .filter((s) => !/^\\+Luck option/i.test(s))
    .filter((s) => !/^\\*?the item's/i.test(s))
    .filter(Boolean);
  return cleaned.slice(0, 12);
}

function parseFanzAdditionalFlags(html: string): {
  has_life: boolean;
  has_luck: boolean;
  has_skill: boolean;
  has_harmony: boolean;
} {
  const sec = html.match(/Possible additional options\\.{3}[\\s\\S]*?(?:Notes & links\\.{3}|About us\\.{3})/i)?.[0] ?? "";
  return {
    has_life: /\\+Jewel of Life option/i.test(sec),
    has_luck: /\\+Luck option/i.test(sec),
    has_skill: /\\+Skill option/i.test(sec),
    has_harmony: /\\+Jewel of Harmony option/i.test(sec),
  };
}

function suggestedLifeOptions(): number[] {
  // Classic MU: JoL add options commonly go 4..28 in steps of 4.
  return [4, 8, 12, 16, 20, 24, 28];
}

function suggestedHarmonyOptions(): string[] {
  // MU Fanz item pages don't enumerate harmony options per item, only
  // whether Harmony is possible. Provide the common Harmony lines so the
  // UI can pick one quickly.
  return [
    "Increase Damage +2%",
    "Increase Damage +Min",
    "Increase Damage +Max",
    "Increase Damage +Min/Max",
    "Increase Attack Speed",
    "Increase Critical Damage",
    "Increase Skill Damage",
    "Decrease Damage",
    "Increase Defense",
    "Increase Defense Success Rate",
    "Increase HP",
    "Increase Mana",
  ];
}

export async function getItemInfoFanz(env: Env, url: URL): Promise<Response> {
  const name = (url.searchParams.get("name") ?? "").trim();
  if (!name) return bad(400, "name obrigatório");

  const normalized = normalizeItemNameForFanz(name);
  const page = "https://muonlinefanz.com/tools/items/data/itemdb/" + encodeURIComponent(normalized).replace(/%2F/g, "/") + ".php";

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(page, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: ctrl.signal,
      cf: { cacheTtl: 86400, cacheEverything: true } as RequestInitCfProperties,
    });
    clearTimeout(t);
    if (!res.ok) return bad(502, "upstream " + res.status);
    const html = await res.text();

    const details = parseFanzListBlock(html, "Item details...");
    const reqs = parseFanzListBlock(html, "Requirements...");
    const excOptions = parseFanzExcellentOptions(html);
    const flags = parseFanzAdditionalFlags(html);

    return json({
      ok: true,
      name,
      source: page,
      details,
      requirements: reqs,
      excellent_options: excOptions,
      options: {
        life: flags.has_life,
        luck: flags.has_luck,
        skill: flags.has_skill,
        harmony: flags.has_harmony,
        excellent: excOptions.length > 0,
      },
      suggested: {
        life_values: flags.has_life ? suggestedLifeOptions() : [],
        harmony_values: flags.has_harmony ? suggestedHarmonyOptions() : [],
      },
    });
  } catch (e) {
    return bad(502, "falha ao buscar itemdb: " + (e as Error).message);
  }
}

function normalizeItemSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getItemRules(env: Env, url: URL): Promise<Response> {
  const name = (url.searchParams.get("name") ?? "").trim();
  const itemSlug = (url.searchParams.get("slug") ?? "").trim();
  if (!name && !itemSlug) return bad(400, "name ou slug obrigatório");
  const slug = name ? normalizeItemSlug(name) : "";
  const row = await env.DB
    .prepare(
      `SELECT slug, name, kind,
              item_slug,
              allow_excellent, allow_luck, allow_skill, allow_life, allow_harmony,
              life_values, harmony_values, excellent_values, ancient_values, updated_at
         FROM item_rules
        WHERE (${itemSlug ? "item_slug = ?" : "1=0"}) OR (${name ? "slug = ?" : "1=0"})
        LIMIT 1`,
    )
    .bind(...(itemSlug ? [itemSlug] : []), ...(name ? [slug] : []))
    .first<{
      slug: string;
      name: string;
      kind: string | null;
      item_slug: string | null;
      allow_excellent: number;
      allow_luck: number;
      allow_skill: number;
      allow_life: number;
      allow_harmony: number;
      life_values: string | null;
      harmony_values: string | null;
      excellent_values: string | null;
      ancient_values: string | null;
      updated_at: number;
    }>();
  // If no custom rule exists yet, fall back to MU Fanz so the UI can still work
  // while the server-specific rules are being imported.
  if (!row) {
    const fallbackUrl = new URL(url.toString());
    fallbackUrl.pathname = "/api/items/fanz";
    return await getItemInfoFanz(env, fallbackUrl);
  }
  let lifeVals: number[] = [];
  let harmonyVals: string[] = [];
  let excVals: string[] = [];
  let ancientVals: string[] = [];
  try { lifeVals = row.life_values ? JSON.parse(row.life_values) : []; } catch {}
  try { harmonyVals = row.harmony_values ? JSON.parse(row.harmony_values) : []; } catch {}
  try { excVals = row.excellent_values ? JSON.parse(row.excellent_values) : []; } catch {}
  try { ancientVals = row.ancient_values ? JSON.parse(row.ancient_values) : []; } catch {}

  // Load ancient set attributes from local DB (best-effort).
  const ancientSets: Record<string, string[]> = {};
  const canonicalAncients: string[] = [];
  if (ancientVals.length > 0) {
    const uniq = [...new Set(ancientVals.map((s) => String(s).trim()).filter(Boolean))].slice(0, 20);
    if (uniq.length > 0) {
      // The shop sometimes provides short names (e.g. "Evis") while the Fanz
      // DB stores full set names (e.g. "Evis' ... Set"). Try exact first, then
      // prefix match.
      const clauses: string[] = [];
      const binds: string[] = [];
      for (const v of uniq) {
        clauses.push("name = ?");
        binds.push(v);
        clauses.push("name LIKE ?");
        binds.push(v + "%");
      }
      const rs = await env.DB
        .prepare("SELECT name, attrs FROM ancient_sets WHERE " + clauses.join(" OR "))
        .bind(...binds)
        .all<{ name: string; attrs: string | null }>();
      const rows = rs.results ?? [];
      const byName = new Map<string, { name: string; attrs: string | null }>();
      for (const r of rows) {
        byName.set(r.name, r);
      }
      for (const v of uniq) {
        // Pick exact match; otherwise the shortest prefix match.
        let picked: { name: string; attrs: string | null } | null = null;
        if (byName.has(v)) {
          picked = byName.get(v)!;
        } else {
          const candidates = rows.filter((r) => r.name.toLowerCase().startsWith(v.toLowerCase()));
          if (candidates.length > 0) {
            candidates.sort((a, b) => a.name.length - b.name.length);
            picked = candidates[0];
          }
        }
        const canon = picked ? picked.name : v;
        canonicalAncients.push(canon);
        if (picked) {
          try {
            const arr = picked.attrs ? JSON.parse(picked.attrs) : [];
            if (Array.isArray(arr)) {
              const cleaned = arr.map((x) => String(x)).filter(Boolean).slice(0, 12);
              // Key by canonical name, but also by the short/raw value that
              // may be stored on listings (e.g. "Evis").
              ancientSets[canon] = cleaned;
              if (v !== canon) ancientSets[v] = cleaned;
            }
          } catch {}
        }
      }
    }
  }
  return json({
    ok: true,
    source: "rules",
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    options: {
      excellent: !!row.allow_excellent,
      luck: !!row.allow_luck,
      skill: !!row.allow_skill,
      life: !!row.allow_life,
      harmony: !!row.allow_harmony,
      ancient: ancientVals.length > 0,
    },
    suggested: {
      life_values: lifeVals,
      harmony_values: harmonyVals,
      ancient_values: canonicalAncients.length ? canonicalAncients : ancientVals,
    },
    excellent_options: excVals,
    ancient_sets: ancientSets,
    updated_at: row.updated_at,
  });
}

// Allowed reaction kinds. Telegram-friendly emoji.
const REACTION_KINDS = new Set(["👍", "❤️", "🔥", "👀", "🤝"]);
const SIDE_VALUES: ReadonlySet<ListingSide> = new Set(["buy", "sell", "donate"]);
const KIND_VALUES = new Set(["item", "char"]);
const CURRENCY_VALUES = new Set(["zeny", "gold", "cash", "free"]);
const STATUS_VALUES = new Set(["open", "held", "closed"]);

// Render an item_attrs JSON blob as a one-line summary. Used in Telegram
// pings — sending raw JSON looks ugly. Mirrors the UI's fmtAttrs.
function formatAttrsLine(attrsJson: string | null): string | null {
  if (!attrsJson) return null;
  try {
    const a = JSON.parse(attrsJson) as Record<string, unknown>;
    const parts: string[] = [];
    if (a.full) {
      // Full implies Excellent + opt 28 + luck + skill — collapse to one tag.
      parts.push("Full");
    } else {
      if (a.excellent) parts.push("Excellent");
      if (a.option != null) parts.push("opt+" + a.option);
      if (a.luck) parts.push("luck");
      if (a.skill) parts.push("skill");
    }
    if (a.refinement != null) parts.push("+" + a.refinement);
    if (a.harmony) parts.push("harmony: " + String(a.harmony));
    if (a.ancient) parts.push("ancient: " + String(a.ancient));
    if (a.extras) parts.push(String(a.extras));
    return parts.length > 0 ? parts.join(" · ") : null;
  } catch { return null; }
}
const PING_RATE_LIMIT_SEC = 3600;
const COMMENT_MAX = 500;
const NOTES_MAX = 1000;
const ITEM_NAME_MAX = 80;
const ATTRS_MAX = 1500;
const PING_MSG_MAX = 280;
const OFFER_MSG_MAX = 280;
const OFFER_TTL_SEC = 3600;

// Hot ranking — engagement scaled by recency. Open listings always rank
// above held/closed; tie-break by created_at desc.
//   score = (reactions + 2*comments) / ((age_days) + 2)
function buildHotOrder(t: number): { sql: string; binds: (string | number)[] } {
  return {
    sql:
      "ORDER BY CASE l.status WHEN 'open' THEN 1 WHEN 'held' THEN 0 ELSE -1 END DESC, " +
      "(react_count + 2 * comment_count) * 1.0 / (((? - l.created_at) / 86400.0) + 2) DESC, " +
      "l.created_at DESC",
    binds: [t],
  };
}

interface ListingDTO extends ListingRow {
  nickname: string | null;
  char_name: string | null;
  char_level: number | null;
  char_resets: number | null;
  react_count: number;
  comment_count: number;
  reactions: { kind: string; count: number; mine: boolean }[];
}

async function loadListings(
  env: Env,
  userId: number | null,
  where: string,
  binds: (string | number)[],
  orderClause: string,
  orderBinds: (string | number)[],
  limit: number,
): Promise<ListingDTO[]> {
  // Status comes from the listing's linked "contact char" — picked
  // per-listing by the seller so the buyer knows who to PM in-game.
  // Anything older than 5 min is stale; the cron runs every minute so
  // this is comfortably generous.
  const sql =
    "SELECT l.*, " +
    "  u.nickname AS nickname, " +
    "  c.name AS char_name, c.last_level AS char_level, c.resets AS char_resets, " +
    "  c.last_status AS char_status, c.last_map AS char_map, c.last_checked_at AS char_checked_at, " +
    "  COALESCE(rc.cnt, 0) AS react_count, " +
    "  COALESCE(cc.cnt, 0) AS comment_count " +
    "FROM listings l " +
    "JOIN users u ON u.id = l.user_id " +
    "LEFT JOIN characters c ON c.id = l.char_id " +
    "LEFT JOIN (SELECT listing_id, COUNT(*) cnt FROM listing_reactions GROUP BY listing_id) rc ON rc.listing_id = l.id " +
    "LEFT JOIN (SELECT listing_id, COUNT(*) cnt FROM listing_comments GROUP BY listing_id) cc ON cc.listing_id = l.id " +
    where + " " + orderClause + " LIMIT ?";

  type Row = ListingRow & {
    nickname: string | null;
    char_name: string | null;
    char_level: number | null;
    char_resets: number | null;
    char_status: string | null;
    char_map: string | null;
    char_checked_at: number | null;
    react_count: number;
    comment_count: number;
  };
  const rs = await env.DB.prepare(sql)
    .bind(...binds, ...orderBinds, limit)
    .all<Row>();
  const rows = rs.results ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const reactRs = await env.DB
    .prepare("SELECT listing_id, kind, COUNT(*) AS cnt FROM listing_reactions WHERE listing_id IN (" + placeholders + ") GROUP BY listing_id, kind")
    .bind(...ids)
    .all<{ listing_id: number; kind: string; cnt: number }>();
  // Anonymous viewers see no "mine" highlights — skip the lookup entirely.
  const mineSet = new Set<string>();
  if (userId != null) {
    const mineRs = await env.DB
      .prepare("SELECT listing_id, kind FROM listing_reactions WHERE user_id = ? AND listing_id IN (" + placeholders + ")")
      .bind(userId, ...ids)
      .all<{ listing_id: number; kind: string }>();
    for (const r of mineRs.results ?? []) mineSet.add(r.listing_id + ":" + r.kind);
  }

  const reactsByListing = new Map<number, Map<string, number>>();
  for (const r of reactRs.results ?? []) {
    let m = reactsByListing.get(r.listing_id);
    if (!m) { m = new Map(); reactsByListing.set(r.listing_id, m); }
    m.set(r.kind, r.cnt);
  }

  return rows.map((r) => ({
    ...r,
    reactions: [...REACTION_KINDS].map((kind) => ({
      kind,
      count: reactsByListing.get(r.id)?.get(kind) ?? 0,
      mine: mineSet.has(r.id + ":" + kind),
    })),
  }));
}

export async function listListings(env: Env, userId: number | null, url: URL): Promise<Response> {
  const t = now();
  const sort = url.searchParams.get("sort") === "hot" ? "hot" : "new";
  const side = url.searchParams.get("side");
  const currency = url.searchParams.get("currency");
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 100);

  const wheres: string[] = ["1=1"];
  const binds: (string | number)[] = [];
  if (side && SIDE_VALUES.has(side as ListingSide)) {
    wheres.push("l.side = ?");
    binds.push(side);
  }
  if (currency && CURRENCY_VALUES.has(currency)) {
    wheres.push("l.currency = ?");
    binds.push(currency);
  }
  if (q) {
    wheres.push("(l.item_name LIKE ? OR l.notes LIKE ?)");
    const like = "%" + q.replace(/[%_]/g, "") + "%";
    binds.push(like, like);
  }

  const orderHot = buildHotOrder(t);
  const orderClause = sort === "hot"
    ? orderHot.sql
    : "ORDER BY CASE l.status WHEN 'open' THEN 1 WHEN 'held' THEN 0 ELSE -1 END DESC, l.created_at DESC";
  const orderBinds = sort === "hot" ? orderHot.binds : [];

  const listings = await loadListings(
    env,
    userId,
    "WHERE " + wheres.join(" AND "),
    binds,
    orderClause,
    orderBinds,
    limit,
  );
  return json({ listings });
}

export async function getListing(env: Env, userId: number | null, listingId: number): Promise<Response> {
  const list = await loadListings(env, userId, "WHERE l.id = ?", [listingId], "", [], 1);
  if (list.length === 0) return bad(404, "anúncio não encontrado");
  const listing = list[0];

  const comments = (
    await env.DB
      .prepare(
        "SELECT lc.*, u.nickname AS nickname FROM listing_comments lc " +
        "JOIN users u ON u.id = lc.user_id WHERE lc.listing_id = ? ORDER BY lc.created_at ASC",
      )
      .bind(listingId)
      .all<{ id: number; user_id: number; body: string; created_at: number; nickname: string | null }>()
  ).results ?? [];

  return json({ listing, comments });
}

async function requireNickname(env: Env, userId: number): Promise<UserRow | Response> {
  const u = await env.DB
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();
  if (!u) return bad(401, "sessão inválida");
  if (!u.nickname) return bad(409, "defina um apelido (nickname) para usar o Mercado");
  return u;
}

function sanitizeAttrs(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { return null; }
  } else if (typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  } else {
    return null;
  }
  const out: Record<string, unknown> = {};
  if (obj.refinement != null) {
    const n = Number(obj.refinement);
    if (Number.isInteger(n) && n >= 0 && n <= 13) out.refinement = n;
  }
  if (obj.option != null) {
    const n = Number(obj.option);
    if (Number.isInteger(n) && n >= 0 && n <= 28) out.option = n;
  }
  // Char listings carry their own structured fields here too — most
  // importantly resets, which buyers care about more than anything else.
  if (obj.resets != null) {
    const n = Number(obj.resets);
    if (Number.isInteger(n) && n >= 0 && n <= 9999) out.resets = n;
  }
  if (obj.level != null) {
    const n = Number(obj.level);
    if (Number.isInteger(n) && n >= 0 && n <= 9999) out.level = n;
  }
  if (typeof obj.charClass === "string" && obj.charClass.trim()) {
    out.charClass = obj.charClass.trim().slice(0, 40);
  }
  if (obj.skill != null) out.skill = !!obj.skill;
  if (obj.luck != null) out.luck = !!obj.luck;
  if (obj.excellent != null) out.excellent = !!obj.excellent;
  // "Item Full" — MU shorthand for fully-optioned (Excellent + opt 28 +
  // skill + luck). Stored separately so we can render it as a single
  // "Full" tag instead of repeating each flag.
  if (obj.full != null) out.full = !!obj.full;
  if (typeof obj.harmony === "string" && obj.harmony.trim()) {
    out.harmony = obj.harmony.trim().slice(0, 60);
  }
  if (typeof obj.ancient === "string" && obj.ancient.trim()) {
    out.ancient = obj.ancient.trim().slice(0, 40);
  }
  if (typeof obj.extras === "string" && obj.extras.trim()) {
    out.extras = obj.extras.trim().slice(0, 240);
  }
  const json = JSON.stringify(out);
  if (json.length > ATTRS_MAX) return null;
  return json === "{}" ? null : json;
}

export async function createListing(env: Env, userId: number, req: Request): Promise<Response> {
  const u = await requireNickname(env, userId);
  if (u instanceof Response) return u;

  const body = (await req.json().catch(() => ({}))) as {
    side?: string;
    kind?: string;
    char_id?: number | null;
    item_name?: string;
    item_slug?: string | null;
    item_attrs?: unknown;
    currency?: string;
    price?: number | null;
    notes?: string;
    allow_message?: boolean;
  };

  const side = body.side as ListingSide;
  if (!SIDE_VALUES.has(side)) return bad(400, "side inválido");
  const kind = (body.kind ?? "item") as "item" | "char";
  if (!KIND_VALUES.has(kind)) return bad(400, "kind inválido");
  const itemName = (body.item_name ?? "").trim();
  if (!itemName || itemName.length > ITEM_NAME_MAX) return bad(400, "campo obrigatório (1–" + ITEM_NAME_MAX + " chars)");

  const currency = body.currency ?? null;
  if (currency != null && !CURRENCY_VALUES.has(currency)) return bad(400, "currency inválida");
  let price: number | null = body.price == null ? null : Number(body.price);
  if (price != null && (!Number.isFinite(price) || price < 0 || price > 1_000_000_000_000)) {
    return bad(400, "price inválido");
  }
  if (currency === "free") price = null;

  const notes = body.notes ? String(body.notes).slice(0, NOTES_MAX) : null;
  // Char listings carry resets/class/level instead of refinement/option.
  // Same sanitizer — keys not relevant to a kind are simply absent.
  const attrs = sanitizeAttrs(body.item_attrs);

  let charId: number | null = body.char_id ?? null;
  if (charId != null) {
    const owned = await env.DB
      .prepare("SELECT character_id FROM user_characters WHERE user_id = ? AND character_id = ?")
      .bind(userId, charId)
      .first<{ character_id: number }>();
    if (!owned) return bad(404, "personagem não encontrado");
  }

  // Resolve item_slug → image_url if a slug was supplied. Slug is just a
  // hint; we don't fail when it's stale. Char listings never use a slug.
  let itemSlug: string | null = kind === "char" ? null : (body.item_slug ?? null);
  let itemImageUrl: string | null = null;
  if (itemSlug) {
    const it = await env.DB
      .prepare("SELECT image_url FROM items WHERE slug = ?")
      .bind(itemSlug)
      .first<{ image_url: string | null }>();
    if (it) itemImageUrl = it.image_url;
    else itemSlug = null;
  }

  const allowMessage = body.allow_message === false ? 0 : 1;
  const t = now();
  const r = await env.DB
    .prepare(
      "INSERT INTO listings (user_id, char_id, kind, side, item_name, item_slug, item_image_url, item_attrs, currency, price, notes, allow_message, status, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)",
    )
    .bind(userId, charId, kind, side, itemName, itemSlug, itemImageUrl, attrs, currency, price, notes, allowMessage, t)
    .run();
  return json({ ok: true, id: r.meta.last_row_id });
}

export async function updateListing(env: Env, userId: number, listingId: number, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    notes?: string;
    item_name?: string;
    item_attrs?: unknown;
    price?: number | null;
    currency?: string;
    allow_message?: boolean;
  };
  const own = await env.DB
    .prepare("SELECT id FROM listings WHERE id = ? AND user_id = ?")
    .bind(listingId, userId)
    .first<{ id: number }>();
  if (!own) return bad(404, "anúncio não encontrado");

  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  if (body.status != null) {
    if (!STATUS_VALUES.has(body.status)) return bad(400, "status inválido");
    sets.push("status = ?"); binds.push(body.status);
  }
  if (body.notes !== undefined) {
    sets.push("notes = ?"); binds.push(body.notes ? String(body.notes).slice(0, NOTES_MAX) : null);
  }
  if (body.item_name !== undefined) {
    const name = String(body.item_name).trim();
    if (!name || name.length > ITEM_NAME_MAX) return bad(400, "item_name inválido");
    sets.push("item_name = ?"); binds.push(name);
  }
  if (body.item_attrs !== undefined) {
    sets.push("item_attrs = ?"); binds.push(sanitizeAttrs(body.item_attrs));
  }
  if ((body as { item_slug?: string | null }).item_slug !== undefined) {
    let slug: string | null = (body as { item_slug?: string | null }).item_slug ?? null;
    let imgUrl: string | null = null;
    if (slug) {
      const it = await env.DB
        .prepare("SELECT image_url FROM items WHERE slug = ?")
        .bind(slug)
        .first<{ image_url: string | null }>();
      if (it) imgUrl = it.image_url;
      else slug = null;
    }
    sets.push("item_slug = ?"); binds.push(slug);
    sets.push("item_image_url = ?"); binds.push(imgUrl);
  }
  if (body.currency !== undefined) {
    if (body.currency != null && !CURRENCY_VALUES.has(body.currency)) return bad(400, "currency inválida");
    sets.push("currency = ?"); binds.push(body.currency ?? null);
  }
  if (body.price !== undefined) {
    let price: number | null = body.price == null ? null : Number(body.price);
    if (price != null && (!Number.isFinite(price) || price < 0)) return bad(400, "price inválido");
    sets.push("price = ?"); binds.push(price);
  }
  if (body.allow_message !== undefined) {
    sets.push("allow_message = ?"); binds.push(body.allow_message ? 1 : 0);
  }
  if (sets.length === 0) return bad(400, "nada para atualizar");

  binds.push(listingId);
  await env.DB.prepare("UPDATE listings SET " + sets.join(", ") + " WHERE id = ?").bind(...binds).run();
  return json({ ok: true });
}

export async function deleteListing(env: Env, userId: number, listingId: number): Promise<Response> {
  const r = await env.DB
    .prepare("DELETE FROM listings WHERE id = ? AND user_id = ?")
    .bind(listingId, userId)
    .run();
  if (r.meta.changes === 0) return bad(404, "anúncio não encontrado");
  return json({ ok: true });
}

export async function reactListing(env: Env, userId: number, listingId: number, req: Request): Promise<Response> {
  const u = await requireNickname(env, userId);
  if (u instanceof Response) return u;

  const body = (await req.json().catch(() => ({}))) as { kind?: string };
  const kind = body.kind ?? "";
  if (!REACTION_KINDS.has(kind)) return bad(400, "reação inválida");

  const exists = await env.DB
    .prepare("SELECT 1 AS x FROM listings WHERE id = ?")
    .bind(listingId)
    .first<{ x: number }>();
  if (!exists) return bad(404, "anúncio não encontrado");

  const had = await env.DB
    .prepare("SELECT 1 AS x FROM listing_reactions WHERE listing_id = ? AND user_id = ? AND kind = ?")
    .bind(listingId, userId, kind)
    .first<{ x: number }>();
  if (had) {
    await env.DB
      .prepare("DELETE FROM listing_reactions WHERE listing_id = ? AND user_id = ? AND kind = ?")
      .bind(listingId, userId, kind)
      .run();
    return json({ ok: true, mine: false });
  }
  await env.DB
    .prepare("INSERT INTO listing_reactions (listing_id, user_id, kind, ts) VALUES (?, ?, ?, ?)")
    .bind(listingId, userId, kind, now())
    .run();
  return json({ ok: true, mine: true });
}

export async function commentListing(env: Env, userId: number, listingId: number, req: Request): Promise<Response> {
  const u = await requireNickname(env, userId);
  if (u instanceof Response) return u;

  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const txt = (body.body ?? "").trim();
  if (!txt || txt.length > COMMENT_MAX) return bad(400, "comentário 1–" + COMMENT_MAX + " chars");

  const exists = await env.DB
    .prepare("SELECT 1 AS x FROM listings WHERE id = ?")
    .bind(listingId)
    .first<{ x: number }>();
  if (!exists) return bad(404, "anúncio não encontrado");

  const r = await env.DB
    .prepare("INSERT INTO listing_comments (listing_id, user_id, body, created_at) VALUES (?, ?, ?, ?)")
    .bind(listingId, userId, txt, now())
    .run();
  return json({ ok: true, id: r.meta.last_row_id });
}

export async function deleteComment(env: Env, userId: number, commentId: number): Promise<Response> {
  // Allow comment author OR listing owner to remove.
  const row = await env.DB
    .prepare(
      "SELECT lc.id, lc.user_id AS commenter, l.user_id AS owner " +
      "FROM listing_comments lc JOIN listings l ON l.id = lc.listing_id WHERE lc.id = ?",
    )
    .bind(commentId)
    .first<{ id: number; commenter: number; owner: number }>();
  if (!row) return bad(404, "comentário não encontrado");
  if (row.commenter !== userId && row.owner !== userId) return bad(403, "sem permissão");
  await env.DB.prepare("DELETE FROM listing_comments WHERE id = ?").bind(commentId).run();
  return json({ ok: true });
}

interface PingDeps {
  buildAppUrl: (origin: string, listingId: number) => string;
  origin: string;
}

export async function pingListing(
  env: Env,
  userId: number,
  listingId: number,
  req: Request,
  deps: PingDeps,
): Promise<Response> {
  const u = await requireNickname(env, userId);
  if (u instanceof Response) return u;

  const body = (await req.json().catch(() => ({}))) as { char_id?: number; message?: string };
  const buyerCharId: number | null = body.char_id ?? null;
  const messageRaw = (body.message ?? "").trim();
  if (messageRaw.length > PING_MSG_MAX) return bad(400, "mensagem máx " + PING_MSG_MAX + " chars");

  // Verify char ownership when supplied (optional).
  if (buyerCharId != null) {
    const owned = await env.DB
      .prepare("SELECT character_id FROM user_characters WHERE user_id = ? AND character_id = ?")
      .bind(userId, buyerCharId)
      .first<{ character_id: number }>();
    if (!owned) return bad(404, "personagem não encontrado");
  }

  const listing = await env.DB
    .prepare("SELECT * FROM listings WHERE id = ?")
    .bind(listingId)
    .first<ListingRow>();
  if (!listing) return bad(404, "anúncio não encontrado");
  if (listing.user_id === userId) return bad(400, "você é o dono do anúncio");
  if (listing.status === "closed") return bad(400, "anúncio fechado");
  if (!listing.allow_message && messageRaw) {
    return bad(400, "anunciante não permite mensagens — envie sem texto");
  }

  // Rate-limit: 1 ping per (listing × buyer) per hour.
  const t = now();
  const last = await env.DB
    .prepare("SELECT MAX(ts) AS last_ts FROM listing_pings WHERE listing_id = ? AND buyer_user_id = ?")
    .bind(listingId, userId)
    .first<{ last_ts: number | null }>();
  const lastTs = last?.last_ts ?? 0;
  if (t - lastTs < PING_RATE_LIMIT_SEC) {
    const wait = Math.ceil((PING_RATE_LIMIT_SEC - (t - lastTs)) / 60);
    return bad(429, "aguarde " + wait + " min antes de pingar de novo");
  }

  const seller = await env.DB
    .prepare("SELECT id, telegram_chat_id, nickname FROM users WHERE id = ?")
    .bind(listing.user_id)
    .first<{ id: number; telegram_chat_id: number; nickname: string | null }>();
  if (!seller) return bad(500, "anunciante não encontrado");

  let buyerCharLine = "";
  if (buyerCharId != null) {
    const ch = await env.DB
      .prepare("SELECT name, last_level, resets, class FROM characters WHERE id = ?")
      .bind(buyerCharId)
      .first<{ name: string; last_level: number | null; resets: number | null; class: string | null }>();
    if (ch) {
      const lv = ch.last_level != null ? ch.last_level : "?";
      const rr = ch.resets != null ? ch.resets : "?";
      buyerCharLine = "\n🎮 Char no jogo: <b>" + escHtml(ch.name) + "</b> (" + escHtml(ch.class ?? "?") + ", lvl " + lv + " / " + rr + " rr)";
    }
  }

  // Status emoji per side.
  const sideLabel = listing.side === "buy" ? "querendo comprar" : listing.side === "donate" ? "doando" : "vendendo";
  const attrsTxt = formatAttrsLine(listing.item_attrs);
  const isChar = (listing as { kind?: string }).kind === "char";
  let itemLine: string;
  if (isChar) {
    let charBits = "";
    try {
      const a = JSON.parse(listing.item_attrs ?? "{}") as { resets?: number; level?: number; charClass?: string };
      const bits: string[] = [];
      if (a.charClass) bits.push(escHtml(a.charClass));
      if (a.resets != null) bits.push("<b>" + a.resets + " resets</b>");
      if (a.level != null) bits.push("lvl " + a.level);
      if (bits.length) charBits = " — " + bits.join(" · ");
    } catch {}
    itemLine = "<b>" + escHtml(listing.item_name) + "</b>" + charBits;
  } else {
    itemLine = "<b>" + escHtml(listing.item_name) + "</b>" + (attrsTxt ? " — " + escHtml(attrsTxt) : "");
  }
  const lineLabel = isChar ? "🎮 Char:" : "📦 Item:";
  const priceLine = listing.currency
    ? "\n💰 " + (listing.currency === "free"
        ? "grátis"
        : listing.currency === "cash"
        ? "R$ " + (listing.price != null ? listing.price.toLocaleString("pt-BR") : "?")
        : (listing.price != null ? listing.price.toLocaleString("pt-BR") + " " : "") + listing.currency)
    : "";
  const customMsg = messageRaw ? "\n💬 “" + escHtml(messageRaw) + "”" : "";
  const link = deps.buildAppUrl(deps.origin, listingId);

  const html =
    "🛒 <b>Interesse no seu anúncio #" + listingId + "</b>\n" +
    "👤 De: <b>" + escHtml(u.nickname ?? "?") + "</b> (você está " + sideLabel + ")\n" +
    lineLabel + " " + itemLine +
    priceLine +
    buyerCharLine +
    customMsg +
    "\n🔗 " + escHtml(link);

  const send = await sendTelegram(env, seller.telegram_chat_id, html);
  if (!send.ok) {
    console.log("ping send failed listing=" + listingId + " status=" + send.status + " body=" + send.body);
    return bad(502, "falha ao enviar ping no Telegram");
  }

  await env.DB
    .prepare(
      "INSERT INTO listing_pings (listing_id, buyer_user_id, seller_user_id, buyer_char_id, message, ts) " +
      "VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(listingId, userId, listing.user_id, buyerCharId, messageRaw || null, t)
    .run();

  // Auto-set held when first ping arrives — owner can flip back to open.
  if (listing.status === "open") {
    await env.DB.prepare("UPDATE listings SET status = 'held' WHERE id = ?").bind(listingId).run();
  }

  return json({ ok: true });
}

type OfferStatus = "pending" | "accepted" | "rejected" | "expired";

type OfferRow = {
  id: number;
  listing_id: number;
  seller_user_id: number;
  bidder_user_id: number;
  bidder_char_id: number | null;
  currency: string | null;
  price: number | null;
  message: string | null;
  status: OfferStatus;
  expires_at: number;
  created_at: number;
  decided_at: number | null;
};

async function notifyOfferDecision(
  env: Env,
  offer: OfferRow & { listing_item_name: string; seller_nickname: string | null },
  decision: "accepted" | "rejected" | "expired",
): Promise<void> {
  const bidder = await env.DB
    .prepare("SELECT telegram_chat_id, nickname FROM users WHERE id = ?")
    .bind(offer.bidder_user_id)
    .first<{ telegram_chat_id: number; nickname: string | null }>();
  if (!bidder?.telegram_chat_id) return;

  const listingLabel = escHtml(offer.listing_item_name || ("#" + offer.listing_id));
  const sellerLabel = escHtml(offer.seller_nickname || ("user " + offer.seller_user_id));
  const offerLine = (offer.currency || offer.price != null)
    ? ("💰 Oferta: <b>" + escHtml(
        offer.currency === "free"
          ? "grátis"
          : ((offer.price != null ? Number(offer.price).toLocaleString("pt-BR") + " " : "") + (offer.currency ?? ""))
      ) + "</b>\n")
    : "";
  const stateLabel =
    decision === "accepted" ? "✅ <b>aceita</b>"
    : decision === "rejected" ? "❌ <b>recusada</b>"
    : "⌛ <b>expirada</b>";

  const html =
    "📨 Sua oferta foi " + stateLabel + "\n" +
    "🛒 Anúncio: <b>" + listingLabel + "</b>\n" +
    "👤 Vendedor: <b>" + sellerLabel + "</b>\n" +
    offerLine;

  await sendTelegram(env, bidder.telegram_chat_id, html);
}

export async function createOffer(
  env: Env,
  userId: number,
  listingId: number,
  req: Request,
): Promise<Response> {
  const u = await requireNickname(env, userId);
  if (u instanceof Response) return u;

  const body = (await req.json().catch(() => ({}))) as {
    char_id?: number | null;
    currency?: string | null;
    price?: number | null;
    message?: string | null;
  };

  const listing = await env.DB
    .prepare("SELECT id, user_id, item_name, status FROM listings WHERE id = ?")
    .bind(listingId)
    .first<{ id: number; user_id: number; item_name: string; status: string }>();
  if (!listing) return bad(404, "anúncio não encontrado");
  if (listing.user_id === userId) return bad(400, "você é o dono do anúncio");
  if (listing.status === "closed") return bad(400, "anúncio fechado");

  const bidderCharId = body.char_id ?? null;
  if (bidderCharId != null) {
    const owned = await env.DB
      .prepare("SELECT character_id FROM user_characters WHERE user_id = ? AND character_id = ?")
      .bind(userId, bidderCharId)
      .first<{ character_id: number }>();
    if (!owned) return bad(404, "personagem não encontrado");
  }

  const currency = body.currency ?? null;
  if (currency != null && !CURRENCY_VALUES.has(currency)) return bad(400, "currency inválida");
  const price = body.price == null ? null : Number(body.price);
  if (price != null && (!Number.isFinite(price) || price < 0)) return bad(400, "price inválido");
  const message = (body.message ?? "").trim();
  if (message.length > OFFER_MSG_MAX) return bad(400, "mensagem máx " + OFFER_MSG_MAX + " chars");
  if (!currency && price == null && !message) {
    return bad(400, "informe valor, moeda ou mensagem da oferta");
  }

  const t = now();
  const expiresAt = t + OFFER_TTL_SEC;
  const r = await env.DB
    .prepare(
      `INSERT INTO listing_offers
         (listing_id, seller_user_id, bidder_user_id, bidder_char_id, currency, price, message, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(listingId, listing.user_id, userId, bidderCharId, currency, price, message || null, expiresAt, t)
    .run();

  return json({ ok: true, id: r.meta.last_row_id, expires_at: expiresAt });
}

export async function listReceivedOffers(env: Env, userId: number): Promise<Response> {
  await expireListingOffers(env);
  const rs = await env.DB
    .prepare(
      `SELECT
         o.*,
         l.item_name AS listing_item_name,
         l.status AS listing_status,
         u.nickname AS bidder_nickname,
         c.name AS bidder_char_name
       FROM listing_offers o
       LEFT JOIN listings l ON l.id = o.listing_id
       LEFT JOIN users u ON u.id = o.bidder_user_id
       LEFT JOIN characters c ON c.id = o.bidder_char_id
      WHERE o.seller_user_id = ? AND o.status != 'expired'
      ORDER BY
        CASE o.status
          WHEN 'pending' THEN 3
          WHEN 'accepted' THEN 2
          WHEN 'rejected' THEN 1
          ELSE 0
        END DESC,
        o.created_at DESC
      LIMIT 200`,
    )
    .bind(userId)
    .all<
      OfferRow & {
        listing_item_name: string | null;
        listing_status: string | null;
        bidder_nickname: string | null;
        bidder_char_name: string | null;
      }
    >();
  return json({ offers: rs.results ?? [] });
}

export async function decideOffer(
  env: Env,
  userId: number,
  offerId: number,
  req: Request,
): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = (body.action ?? "").toLowerCase();
  if (action !== "accept" && action !== "reject") {
    return bad(400, "ação inválida");
  }

  await expireListingOffers(env);

  const offer = await env.DB
    .prepare(
      `SELECT o.*, l.item_name AS listing_item_name, su.nickname AS seller_nickname
       FROM listing_offers o
       JOIN listings l ON l.id = o.listing_id
       LEFT JOIN users su ON su.id = o.seller_user_id
       WHERE o.id = ? AND o.seller_user_id = ?`,
    )
    .bind(offerId, userId)
    .first<OfferRow & { listing_item_name: string; seller_nickname: string | null }>();
  if (!offer) return bad(404, "oferta não encontrada");
  if (offer.status !== "pending") return bad(409, "oferta já finalizada");

  const t = now();
  const status: OfferStatus = action === "accept" ? "accepted" : "rejected";
  await env.DB
    .prepare("UPDATE listing_offers SET status = ?, decided_at = ? WHERE id = ?")
    .bind(status, t, offer.id)
    .run();

  if (status === "accepted") {
    await env.DB
      .prepare("UPDATE listings SET status = 'held' WHERE id = ? AND status = 'open'")
      .bind(offer.listing_id)
      .run();
  }

  await notifyOfferDecision(env, offer, status);
  return json({ ok: true, status });
}

export async function expireListingOffers(env: Env): Promise<{ expired: number }> {
  const t = now();
  const due = await env.DB
    .prepare(
      `SELECT o.*, l.item_name AS listing_item_name, su.nickname AS seller_nickname
       FROM listing_offers o
       JOIN listings l ON l.id = o.listing_id
       LEFT JOIN users su ON su.id = o.seller_user_id
       WHERE o.status = 'pending' AND o.expires_at <= ?`,
    )
    .bind(t)
    .all<OfferRow & { listing_item_name: string; seller_nickname: string | null }>();

  let expired = 0;
  for (const o of due.results ?? []) {
    // Mark + notify, then delete so expired offers disappear from the UI.
    const r = await env.DB
      .prepare("UPDATE listing_offers SET status = 'expired', decided_at = ? WHERE id = ? AND status = 'pending'")
      .bind(t, o.id)
      .run();
    if ((r.meta as unknown as { changes?: number }).changes === 0) continue;
    await notifyOfferDecision(env, o, "expired");
    await env.DB.prepare("DELETE FROM listing_offers WHERE id = ? AND status = 'expired'").bind(o.id).run();
    expired++;
  }
  return { expired };
}
