import type { Env, UserRow } from "../types";
import { bad, json, now } from "../util";
import { scrapeOne } from "../scraper";
import { pollOnce } from "../poll";

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
  avg_reset_time?: number | null;
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
         (SELECT COUNT(*) FROM subscriptions s WHERE s.character_id = c.id AND s.active = 1) AS sub_count,
         (SELECT (MAX(start_ts) - MIN(start_ts)) / NULLIF(MAX(resets) - MIN(resets), 0)
          FROM (SELECT resets, MIN(ts) as start_ts FROM char_snapshots WHERE char_id = c.id GROUP BY resets)
         ) AS avg_reset_time
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

interface SnapshotRow {
  ts: number;
  level: number | null;
  resets: number | null;
  map: string | null;
  status: string | null;
}

// Default window is the last 7 days. Caller can override with ?days=N
// (capped at 90). We bucket the response by reset cycle so the UI can
// plot one line per reset run.
export async function adminCharHistory(env: Env, charId: number, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 7), 1), 90);
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const rs = await env.DB
    .prepare(
      `SELECT ts, level, resets, map, status
         FROM char_snapshots
        WHERE char_id = ? AND ts >= ?
        ORDER BY ts ASC`,
    )
    .bind(charId, since)
    .all<SnapshotRow>();
  const snaps = rs.results ?? [];

  // Group by reset count. Each cycle gets startTs (first sample's ts) so
  // the client can plot "minutes since reset start" on the X axis to
  // compare leveling speed cycle-vs-cycle.
  const cycles: Array<{ resets: number; start_ts: number; samples: SnapshotRow[] }> = [];
  for (const s of snaps) {
    const r = s.resets ?? 0;
    let cur = cycles[cycles.length - 1];
    if (!cur || cur.resets !== r) {
      cur = { resets: r, start_ts: s.ts, samples: [] };
      cycles.push(cur);
    }
    cur.samples.push(s);
  }
  return json({ days, count: snaps.length, cycles });
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
