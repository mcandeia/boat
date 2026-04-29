import type { CustomEventRow, CustomEventScheduleType, Env } from "../types";
import { bad, json, now } from "../util";

const SCHED_TYPES: ReadonlySet<CustomEventScheduleType> = new Set(["once", "daily", "weekly"]);
const GIFT_KINDS = new Set(["rarius", "kundun", "custom"]);
const NAME_MAX = 80;
const GM_NAME_MAX = 40;
const DESCRIPTION_MAX = 1000;
const GIFTS_JSON_MAX = 1500;
const TIME_RE = /^([0-1]\d|2[0-3]):([0-5]\d)$/;

interface GiftIn {
  kind?: string;
  qty?: number;
  tier?: number;
  name?: string;
}

// Sanitise + normalise the gifts payload. Drops unknown kinds / shape
// oddities; bumps over the JSON-size cap fail the request.
function sanitizeGifts(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return null; }
    if (!Array.isArray(arr)) return null;
  } else return null;

  const out: Array<Record<string, unknown>> = [];
  for (const g of arr.slice(0, 20) as GiftIn[]) {
    if (!g || typeof g !== "object") continue;
    const kind = String(g.kind ?? "").trim();
    if (!GIFT_KINDS.has(kind)) continue;
    if (kind === "rarius") {
      const qty = Number(g.qty);
      if (Number.isInteger(qty) && qty > 0 && qty <= 100000) out.push({ kind, qty });
    } else if (kind === "kundun") {
      const tier = Number(g.tier);
      if (Number.isInteger(tier) && tier >= 1 && tier <= 5) out.push({ kind, tier });
    } else if (kind === "custom") {
      const nm = String(g.name ?? "").trim();
      if (nm) out.push({ kind, name: nm.slice(0, 60) });
    }
  }
  if (out.length === 0) return null;
  const j = JSON.stringify(out);
  if (j.length > GIFTS_JSON_MAX) return null;
  return j;
}

interface CustomEventInput {
  name?: string;
  gm_name?: string | null;
  description?: string | null;
  gifts?: unknown;
  schedule_type?: string;
  schedule_at?: number | null;     // unix seconds
  schedule_time?: string | null;   // "HH:MM"
  schedule_dow?: number | null;    // 0..6
  active?: boolean;
}

function validateAndPick(body: CustomEventInput): { ok: true; row: Omit<CustomEventRow, "id" | "created_by" | "created_at" | "updated_at"> } | { ok: false; err: string } {
  const name = (body.name ?? "").trim();
  if (!name || name.length > NAME_MAX) return { ok: false, err: "nome obrigatório (1–" + NAME_MAX + " chars)" };

  const gmName = body.gm_name ? String(body.gm_name).trim().slice(0, GM_NAME_MAX) : null;
  const description = body.description ? String(body.description).slice(0, DESCRIPTION_MAX) : null;
  const gifts = sanitizeGifts(body.gifts);

  const schedType = body.schedule_type as CustomEventScheduleType;
  if (!SCHED_TYPES.has(schedType)) return { ok: false, err: "schedule_type inválido (use once|daily|weekly)" };

  let schedule_at: number | null = null;
  let schedule_time: string | null = null;
  let schedule_dow: number | null = null;

  if (schedType === "once") {
    const ts = Number(body.schedule_at);
    if (!Number.isInteger(ts) || ts < 0) return { ok: false, err: "schedule_at obrigatório (unix seconds)" };
    schedule_at = ts;
  } else if (schedType === "daily" || schedType === "weekly") {
    const t = String(body.schedule_time ?? "").trim();
    if (!TIME_RE.test(t)) return { ok: false, err: "schedule_time inválido (use HH:MM)" };
    schedule_time = t;
    if (schedType === "weekly") {
      const dow = Number(body.schedule_dow);
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) return { ok: false, err: "schedule_dow inválido (0=domingo…6=sábado)" };
      schedule_dow = dow;
    }
  }

  return {
    ok: true,
    row: {
      name,
      gm_name: gmName,
      description,
      gifts,
      schedule_type: schedType,
      schedule_at,
      schedule_time,
      schedule_dow,
      active: body.active === false ? 0 : 1,
    },
  };
}

// ---- Public reads ----

interface CustomEventDTO extends CustomEventRow {
  subscribed: boolean;
  sub_lead_minutes: number | null;
  sub_count: number;
}

export async function listCustomEvents(env: Env, userId: number | null): Promise<Response> {
  const sql =
    "SELECT e.*, " +
    "  COALESCE(s.cnt, 0) AS sub_count, " +
    "  CASE WHEN m.id IS NULL THEN 0 ELSE 1 END AS subscribed, " +
    "  m.lead_minutes AS sub_lead_minutes " +
    "FROM custom_events e " +
    "LEFT JOIN (SELECT custom_event_id, COUNT(*) cnt FROM custom_event_subs GROUP BY custom_event_id) s " +
    "       ON s.custom_event_id = e.id " +
    "LEFT JOIN custom_event_subs m " +
    "       ON m.custom_event_id = e.id AND m.user_id = ? " +
    "ORDER BY e.active DESC, e.id DESC";
  const rs = await env.DB.prepare(sql).bind(userId ?? 0).all<CustomEventDTO>();
  return json({ events: rs.results ?? [] });
}

// ---- Admin CRUD ----

export async function adminCreateCustomEvent(env: Env, userId: number, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as CustomEventInput;
  const v = validateAndPick(body);
  if (!v.ok) return bad(400, v.err);
  const t = now();
  const r = await env.DB
    .prepare(
      "INSERT INTO custom_events (name, gm_name, description, gifts, schedule_type, schedule_at, schedule_time, schedule_dow, active, created_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      v.row.name, v.row.gm_name, v.row.description, v.row.gifts,
      v.row.schedule_type, v.row.schedule_at, v.row.schedule_time, v.row.schedule_dow,
      v.row.active, userId, t, t,
    )
    .run();
  return json({ ok: true, id: r.meta.last_row_id });
}

export async function adminUpdateCustomEvent(env: Env, eventId: number, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as CustomEventInput;
  const v = validateAndPick(body);
  if (!v.ok) return bad(400, v.err);
  const r = await env.DB
    .prepare(
      "UPDATE custom_events SET name = ?, gm_name = ?, description = ?, gifts = ?, " +
      "schedule_type = ?, schedule_at = ?, schedule_time = ?, schedule_dow = ?, " +
      "active = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      v.row.name, v.row.gm_name, v.row.description, v.row.gifts,
      v.row.schedule_type, v.row.schedule_at, v.row.schedule_time, v.row.schedule_dow,
      v.row.active, now(), eventId,
    )
    .run();
  if (r.meta.changes === 0) return bad(404, "evento não encontrado");
  return json({ ok: true });
}

export async function adminDeleteCustomEvent(env: Env, eventId: number): Promise<Response> {
  const r = await env.DB
    .prepare("DELETE FROM custom_events WHERE id = ?")
    .bind(eventId)
    .run();
  if (r.meta.changes === 0) return bad(404, "evento não encontrado");
  return json({ ok: true });
}

// ---- User subscribe / unsubscribe ----

export async function subscribeCustomEvent(env: Env, userId: number, eventId: number, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { lead_minutes?: number };
  const lead = body.lead_minutes == null ? 5 : Number(body.lead_minutes);
  if (!Number.isInteger(lead) || lead < 0 || lead > 1440) return bad(400, "lead_minutes deve estar entre 0 e 1440");

  const ev = await env.DB
    .prepare("SELECT id FROM custom_events WHERE id = ? AND active = 1")
    .bind(eventId)
    .first<{ id: number }>();
  if (!ev) return bad(404, "evento não encontrado ou inativo");

  const t = now();
  await env.DB
    .prepare(
      "INSERT INTO custom_event_subs (custom_event_id, user_id, lead_minutes, created_at) " +
      "VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(custom_event_id, user_id) DO UPDATE SET lead_minutes = excluded.lead_minutes",
    )
    .bind(eventId, userId, lead, t)
    .run();
  return json({ ok: true });
}

export async function unsubscribeCustomEvent(env: Env, userId: number, eventId: number): Promise<Response> {
  await env.DB
    .prepare("DELETE FROM custom_event_subs WHERE custom_event_id = ? AND user_id = ?")
    .bind(eventId, userId)
    .run();
  return json({ ok: true });
}

// ---- Gift-kind subscribe ("ping me on ANY event that drops rarius") ----

const GIFT_SUB_KINDS = new Set(["rarius", "kundun", "custom", "any"]);

export async function listMyGiftSubs(env: Env, userId: number): Promise<Response> {
  const rs = await env.DB
    .prepare("SELECT id, gift_kind, lead_minutes, created_at FROM custom_event_gift_subs WHERE user_id = ? ORDER BY id")
    .bind(userId)
    .all<{ id: number; gift_kind: string; lead_minutes: number; created_at: number }>();
  return json({ gift_subs: rs.results ?? [] });
}

export async function subscribeGiftKind(env: Env, userId: number, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { gift_kind?: string; lead_minutes?: number };
  const kind = String(body.gift_kind ?? "").trim();
  if (!GIFT_SUB_KINDS.has(kind)) return bad(400, "gift_kind inválido (use rarius|kundun|custom|any)");
  const lead = body.lead_minutes == null ? 5 : Number(body.lead_minutes);
  if (!Number.isInteger(lead) || lead < 0 || lead > 1440) return bad(400, "lead_minutes deve estar entre 0 e 1440");

  await env.DB
    .prepare(
      "INSERT INTO custom_event_gift_subs (user_id, gift_kind, lead_minutes, created_at) " +
      "VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(user_id, gift_kind) DO UPDATE SET lead_minutes = excluded.lead_minutes",
    )
    .bind(userId, kind, lead, now())
    .run();
  return json({ ok: true });
}

export async function unsubscribeGiftKind(env: Env, userId: number, kind: string): Promise<Response> {
  if (!GIFT_SUB_KINDS.has(kind)) return bad(400, "gift_kind inválido");
  await env.DB
    .prepare("DELETE FROM custom_event_gift_subs WHERE user_id = ? AND gift_kind = ?")
    .bind(userId, kind)
    .run();
  return json({ ok: true });
}
