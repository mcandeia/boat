import type { Env, UserRow } from "../types";
import { bad, json, now } from "../util";
import { scrapeOne } from "../scraper";
import { pollOnce } from "../poll";
import { buildHistoryResponse } from "./characters";

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
  is_gm: number;
  created_at: number;
  user_id: number;
  owner_first_name: string | null;
  owner_username: string | null;
  sub_count: number;
}

export async function adminListChars(env: Env): Promise<Response> {
  const rs = await env.DB
    .prepare(
      `SELECT
         c.id, c.name, c.blocked, c.class, c.resets, c.last_level,
         c.last_status, c.last_checked_at, c.rank_overall, c.rank_class,
         c.class_code, c.is_gm, c.created_at, c.user_id,
         u.first_name AS owner_first_name,
         u.telegram_username AS owner_username,
         (SELECT COUNT(*) FROM subscriptions s WHERE s.character_id = c.id AND s.active = 1) AS sub_count
       FROM characters c
       JOIN users u ON u.id = c.user_id
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
