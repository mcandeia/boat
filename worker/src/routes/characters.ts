import type { CharacterRow, Env } from "../types";
import { bad, json, now } from "../util";
import { scrapeOne } from "../scraper";

const VALID_NAME = /^[A-Za-z0-9_-]{1,15}$/;
const INVALID_NAME = "nome de personagem inválido";

export async function listCharacters(env: Env, userId: number): Promise<Response> {
  type Row = CharacterRow & { is_gm: number; avg_reset_time?: number | null };
  const rows = await env.DB
    .prepare(`
      SELECT c.*,
        uc.is_gm AS is_gm,
        (SELECT (MAX(start_ts) - MIN(start_ts)) / NULLIF(MAX(resets) - MIN(resets), 0)
         FROM (SELECT resets, MIN(ts) as start_ts FROM char_snapshots WHERE char_id = c.id GROUP BY resets)
        ) AS avg_reset_time
      FROM user_characters uc
      JOIN characters c ON c.id = uc.character_id
      WHERE uc.user_id = ?
      ORDER BY c.name COLLATE NOCASE
    `)
    .bind(userId)
    .all<Row>();
  return json({ characters: rows.results ?? [] });
}

// Server-side preview lookup: confirm the character exists and pull initial
// stats. Doesn't write to the DB — used by the "Add character" form.
export async function lookupCharacter(env: Env, name: string): Promise<Response> {
  if (!VALID_NAME.test(name)) return bad(400, INVALID_NAME);
  const snap = await scrapeOne(env, name, { totalTimeoutMs: 25_000 });
  if (!snap.scraped) return json({ scraped: false });
  if (!snap.exists) return json({ scraped: true, exists: false });
  return json({ scraped: true, exists: true, snapshot: snap });
}

export async function createCharacter(env: Env, userId: number, req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { name?: string; is_gm?: boolean };
  const name = (body.name ?? "").trim();
  if (!VALID_NAME.test(name)) return bad(400, INVALID_NAME);

  const t = now();
  // Find or create the global character row.
  const existing = await env.DB
    .prepare("SELECT * FROM characters WHERE name = ? COLLATE NOCASE")
    .bind(name)
    .first<CharacterRow>();

  // Best-effort scrape with a tight budget. If it succeeds we prefill the
  // row; if it times out we register the char anyway and let the cron's
  // next pass fill in stats. Only a *successful* scrape that found no
  // profile table blocks creation.
  let id: number;
  let snapshot = null as unknown;
  if (existing) {
    id = existing.id;
  } else {
    const snap = await scrapeOne(env, name, { totalTimeoutMs: 25_000 });
    snapshot = snap;
    if (snap.scraped && !snap.exists) {
      return bad(404, "personagem não encontrado no Mu Patos");
    }

    const result = await env.DB
      .prepare(
        `INSERT INTO characters
          (name, class, resets, last_level, last_map, last_status, last_checked_at, last_level_change_at, next_check_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .bind(
        name,
        snap.class,
        snap.resets,
        snap.level,
        snap.map,
        snap.status,
        snap.exists ? t : null,
        snap.exists ? t : null,
        t,
      )
      .run();
    id = Number(result.meta.last_row_id);
  }

  // Create the user<->character link (idempotent).
  await env.DB
    .prepare(
      `INSERT OR IGNORE INTO user_characters (user_id, character_id, is_gm, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(userId, id, body.is_gm ? 1 : 0, t)
    .run();

  return json({ ok: true, id, snapshot });
}

export async function deleteCharacter(env: Env, userId: number, id: number): Promise<Response> {
  // Remove the link for this user.
  const r = await env.DB
    .prepare("DELETE FROM user_characters WHERE character_id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  if (r.meta.changes === 0) return bad(404, "não encontrado");

  // Optional cleanup: if no more users link this character, delete it.
  const stillLinked = await env.DB
    .prepare("SELECT 1 AS ok FROM user_characters WHERE character_id = ? LIMIT 1")
    .bind(id)
    .first<{ ok: number }>();
  if (!stillLinked) {
    await env.DB.prepare("DELETE FROM characters WHERE id = ?").bind(id).run();
  }

  return json({ ok: true });
}

// Snapshot history for a single character, scoped to the caller's
// ownership. Mirrors the admin variant but enforces the user_id check
// here so we don't have to duplicate the auth in two places.
export async function userCharHistory(
  env: Env,
  userId: number,
  charId: number,
  req: Request,
): Promise<Response> {
  const owned = await env.DB
    .prepare("SELECT id FROM user_characters WHERE character_id = ? AND user_id = ?")
    .bind(charId, userId)
    .first<{ id: number }>();
  if (!owned) return bad(404, "personagem não encontrado");
  return await buildHistoryResponse(env, charId, req);
}

// Shared between the user-facing /api/characters/:id/history and the
// admin route. Same shape as before: cycles[] grouped by reset count.
export async function buildHistoryResponse(env: Env, charId: number, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 7), 1), 90);
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  type Snap = { ts: number; level: number | null; resets: number | null; map: string | null; status: string | null };
  const rs = await env.DB
    .prepare(
      `SELECT ts, level, resets, map, status
         FROM char_snapshots
        WHERE char_id = ? AND ts >= ?
        ORDER BY ts ASC`,
    )
    .bind(charId, since)
    .all<Snap>();
  const snaps = rs.results ?? [];
  const cycles: Array<{ resets: number; start_ts: number; samples: Snap[] }> = [];
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

// On-demand re-scrape for a single character. Used by the dashboard to fill
// in stats lazily after a slow add, or when the user taps "Atualizar".
// Returns the freshly stored row so the UI can redraw.
export async function refreshCharacter(env: Env, userId: number, id: number): Promise<Response> {
  const linked = await env.DB
    .prepare("SELECT 1 AS ok FROM user_characters WHERE character_id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ ok: number }>();
  if (!linked) return bad(404, "não encontrado");

  const row = await env.DB
    .prepare("SELECT * FROM characters WHERE id = ?")
    .bind(id)
    .first<CharacterRow>();
  if (!row) return bad(404, "não encontrado");

  const snap = await scrapeOne(env, row.name, { totalTimeoutMs: 25_000 });
  if (!snap.scraped) {
    return json({ scraped: false, character: row });
  }
  if (!snap.exists) {
    // Char vanished from the server (renamed, deleted). Don't touch the row;
    // just tell the caller.
    return json({ scraped: true, exists: false, character: row });
  }

  const t = now();
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
    .bind(snap.class, snap.resets, snap.level, snap.map, snap.status, t, id)
    .run();

  const updated = await env.DB
    .prepare("SELECT * FROM characters WHERE id = ?")
    .bind(id)
    .first<CharacterRow>();
  return json({ scraped: true, exists: true, character: updated });
}
