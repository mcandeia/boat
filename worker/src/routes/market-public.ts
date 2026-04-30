import type { Env } from "../types";
import { bad, json, now } from "../util";
import { escHtml, sendTelegram } from "../telegram";

const PUBLIC_RL_WINDOW_SEC = 3600; // 1h per IP hash + listing + kind
const PUBLIC_NAME_MAX = 32;
const PUBLIC_MSG_MAX = 500;

const CURRENCY_VALUES = new Set(["zeny", "gold", "cash", "free"]);

function parseIp(req: Request): string | null {
  const h =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "";
  const first = h.split(",")[0]?.trim();
  return first || null;
}

async function hashIp(env: Env, ip: string): Promise<string> {
  const salt = String(env.SESSION_SECRET ?? "");
  const bytes = new TextEncoder().encode(salt + "|" + ip);
  const dig = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(dig);
  // short stable key is enough for rate limit; not for security-sensitive use.
  return Array.from(arr.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function publicRateLimit(
  env: Env,
  listingId: number,
  kind: "ping" | "offer",
  ipHash: string,
): Promise<Response | null> {
  const t = now();
  const since = t - PUBLIC_RL_WINDOW_SEC;
  const recent = await env.DB
    .prepare(
      "SELECT created_at FROM listing_public_messages WHERE listing_id = ? AND kind = ? AND ip_hash = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(listingId, kind, ipHash, since)
    .first<{ created_at: number }>();
  if (recent?.created_at) {
    const mins = Math.max(1, Math.ceil((recent.created_at + PUBLIC_RL_WINDOW_SEC - t) / 60));
    return bad(429, "aguarde ~" + mins + " min antes de enviar novamente");
  }
  return null;
}

async function loadListingAndSeller(env: Env, listingId: number): Promise<{
  listing_id: number;
  item_name: string;
  side: string;
  status: string;
  seller_user_id: number;
  seller_chat_id: number | null;
  seller_nickname: string | null;
} | null> {
  const row = await env.DB.prepare(
    `SELECT
       l.id AS listing_id,
       l.item_name AS item_name,
       l.side AS side,
       l.status AS status,
       l.user_id AS seller_user_id,
       u.telegram_chat_id AS seller_chat_id,
       u.nickname AS seller_nickname
     FROM listings l
     JOIN users u ON u.id = l.user_id
    WHERE l.id = ?
    LIMIT 1`,
  ).bind(listingId).first<{
    listing_id: number;
    item_name: string;
    side: string;
    status: string;
    seller_user_id: number;
    seller_chat_id: number | null;
    seller_nickname: string | null;
  }>();
  return row ?? null;
}

export async function publicListingPing(env: Env, req: Request, origin: string, listingId: number): Promise<Response> {
  const ip = parseIp(req);
  if (!ip) return bad(400, "ip ausente");
  const ipHash = await hashIp(env, ip);

  const listing = await loadListingAndSeller(env, listingId);
  if (!listing) return bad(404, "anúncio não encontrado");
  if (listing.status === "closed") return bad(400, "anúncio fechado");
  if (!listing.seller_chat_id) return bad(409, "anunciante sem Telegram configurado");

  const body = (await req.json().catch(() => ({}))) as { name?: string; message?: string };
  const name = String(body.name ?? "").trim().slice(0, PUBLIC_NAME_MAX);
  const message = String(body.message ?? "").trim();
  if (message.length > PUBLIC_MSG_MAX) return bad(400, "mensagem máx " + PUBLIC_MSG_MAX + " chars");

  const rl = await publicRateLimit(env, listingId, "ping", ipHash);
  if (rl) return rl;

  const t = now();
  await env.DB.prepare(
    "INSERT INTO listing_public_messages (listing_id, kind, ip_hash, name, message, created_at) VALUES (?, 'ping', ?, ?, ?, ?)",
  ).bind(listingId, ipHash, name || null, message || null, t).run();

  const from = name ? ("Anônimo (" + escHtml(name) + ")") : "Anônimo";
  const link = origin + "/s/" + String(listingId);
  const html =
    "🛒 <b>Interesse no seu anúncio #" + listingId + "</b>\n" +
    "📦 Item: <b>" + escHtml(listing.item_name) + "</b>\n" +
    "👤 De: <b>" + from + "</b>\n" +
    (message ? ("💬 “" + escHtml(message) + "”\n") : "") +
    "\n🔗 " + escHtml(link) + "\n" +
    "\n(Enviado via link público / anônimo — não aparece no histórico do app)";

  const send = await sendTelegram(env, listing.seller_chat_id, html);
  if (!send.ok) return bad(502, "falha ao enviar no Telegram");
  return json({ ok: true });
}

export async function publicListingOffer(env: Env, req: Request, origin: string, listingId: number): Promise<Response> {
  const ip = parseIp(req);
  if (!ip) return bad(400, "ip ausente");
  const ipHash = await hashIp(env, ip);

  const listing = await loadListingAndSeller(env, listingId);
  if (!listing) return bad(404, "anúncio não encontrado");
  if (listing.status === "closed") return bad(400, "anúncio fechado");
  if (!listing.seller_chat_id) return bad(409, "anunciante sem Telegram configurado");

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    currency?: string | null;
    price?: unknown;
    message?: string | null;
  };
  const name = String(body.name ?? "").trim().slice(0, PUBLIC_NAME_MAX);
  const currency = body.currency != null && String(body.currency).trim() !== "" ? String(body.currency).trim() : null;
  if (currency != null && !CURRENCY_VALUES.has(currency)) return bad(400, "currency inválida");
  const price = body.price == null || String(body.price).trim() === "" ? null : Number(body.price);
  if (price != null && (!Number.isFinite(price) || price < 0)) return bad(400, "price inválido");
  const message = String(body.message ?? "").trim();
  if (message.length > PUBLIC_MSG_MAX) return bad(400, "mensagem máx " + PUBLIC_MSG_MAX + " chars");
  if (!currency && price == null && !message) return bad(400, "informe valor, moeda ou mensagem da oferta");

  const rl = await publicRateLimit(env, listingId, "offer", ipHash);
  if (rl) return rl;

  const t = now();
  await env.DB.prepare(
    "INSERT INTO listing_public_messages (listing_id, kind, ip_hash, name, currency, price, message, created_at) VALUES (?, 'offer', ?, ?, ?, ?, ?, ?)",
  ).bind(listingId, ipHash, name || null, currency, price, message || null, t).run();

  const from = name ? ("Anônimo (" + escHtml(name) + ")") : "Anônimo";
  const offerValue = currency === "free"
    ? "grátis"
    : ((price != null ? Number(price).toLocaleString("pt-BR") + " " : "") + (currency ?? "")).trim() || "—";
  const link = origin + "/s/" + String(listingId);
  const msgLine = message ? ("💬 “" + escHtml(message) + "”\n") : "";
  const html =
    "💸 <b>Oferta anônima recebida</b>\n" +
    "🛒 Anúncio: <b>" + escHtml(listing.item_name) + "</b>\n" +
    "👤 De: <b>" + from + "</b>\n" +
    "💰 Oferta: <b>" + escHtml(offerValue) + "</b>\n" +
    msgLine +
    "\n🔗 " + escHtml(link) + "\n" +
    "\n(Enviado via link público / anônimo — não aparece na aba Ofertas do app)";

  const send = await sendTelegram(env, listing.seller_chat_id, html);
  if (!send.ok) return bad(502, "falha ao enviar no Telegram");
  return json({ ok: true });
}

