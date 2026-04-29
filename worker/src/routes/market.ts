import type { Env, ListingRow, ListingSide, UserRow } from "../types";
import { bad, json, now } from "../util";
import { escHtml, sendTelegram } from "../telegram";
import { ensureCatalog } from "../items-scrape";

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
    if (a.excellent) parts.push("Excellent");
    if (a.refinement != null) parts.push("+" + a.refinement);
    if (a.option != null) parts.push("opt+" + a.option);
    if (a.luck) parts.push("luck");
    if (a.skill) parts.push("skill");
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
  userId: number,
  where: string,
  binds: (string | number)[],
  orderClause: string,
  orderBinds: (string | number)[],
  limit: number,
): Promise<ListingDTO[]> {
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
  const rs = await env.DB.prepare(sql).bind(...binds, ...orderBinds, limit).all<Row>();
  const rows = rs.results ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const reactRs = await env.DB
    .prepare("SELECT listing_id, kind, COUNT(*) AS cnt FROM listing_reactions WHERE listing_id IN (" + placeholders + ") GROUP BY listing_id, kind")
    .bind(...ids)
    .all<{ listing_id: number; kind: string; cnt: number }>();
  const mineRs = await env.DB
    .prepare("SELECT listing_id, kind FROM listing_reactions WHERE user_id = ? AND listing_id IN (" + placeholders + ")")
    .bind(userId, ...ids)
    .all<{ listing_id: number; kind: string }>();
  const mineSet = new Set((mineRs.results ?? []).map((r) => r.listing_id + ":" + r.kind));

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

export async function listListings(env: Env, userId: number, url: URL): Promise<Response> {
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

export async function getListing(env: Env, userId: number, listingId: number): Promise<Response> {
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
  if (obj.skill != null) out.skill = !!obj.skill;
  if (obj.luck != null) out.luck = !!obj.luck;
  if (obj.excellent != null) out.excellent = !!obj.excellent;
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
  // Char listings don't have item attributes — pure free-form.
  const attrs = kind === "char" ? null : sanitizeAttrs(body.item_attrs);

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
  const itemLine = "<b>" + escHtml(listing.item_name) + "</b>" + (attrsTxt ? " — " + escHtml(attrsTxt) : "");
  const priceLine = listing.currency
    ? "\n💰 " + (listing.currency === "free"
        ? "grátis"
        : (listing.price != null ? listing.price.toLocaleString("pt-BR") + " " : "") + listing.currency)
    : "";
  const customMsg = messageRaw ? "\n💬 “" + escHtml(messageRaw) + "”" : "";
  const link = deps.buildAppUrl(deps.origin, listingId);

  const html =
    "🛒 <b>Interesse no seu anúncio #" + listingId + "</b>\n" +
    "👤 De: <b>" + escHtml(u.nickname ?? "?") + "</b> (você está " + sideLabel + ")\n" +
    "📦 Item: " + itemLine +
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
