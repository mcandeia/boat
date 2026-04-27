import type { CharacterRow, Env } from "../types";
import { bad, json, now } from "../util";
import { scrapeOne } from "../scraper";

const VALID_NAME = /^[A-Za-z0-9_-]{1,15}$/;
const INVALID_NAME = "nome de personagem inválido";

export async function listCharacters(env: Env, userId: number): Promise<Response> {
  const rows = await env.DB
    .prepare("SELECT * FROM characters WHERE user_id = ? ORDER BY name COLLATE NOCASE")
    .bind(userId)
    .all<CharacterRow>();
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

  const dup = await env.DB
    .prepare("SELECT id FROM characters WHERE user_id = ? AND name = ?")
    .bind(userId, name)
    .first<{ id: number }>();
  if (dup) return bad(409, "personagem já cadastrado");

  // Best-effort scrape with a tight budget. If it succeeds we prefill the
  // row; if it times out we register the char anyway and let the cron's
  // next pass fill in stats. Only a *successful* scrape that found no
  // profile table blocks creation.
  const snap = await scrapeOne(env, name, { totalTimeoutMs: 25_000 });
  if (snap.scraped && !snap.exists) {
    return bad(404, "personagem não encontrado no Mu Patos");
  }

  const t = now();
  const result = await env.DB
    .prepare(
      `INSERT INTO characters
        (user_id, name, class, resets, is_gm, last_level, last_map, last_status, last_checked_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      userId,
      name,
      snap.class,
      snap.resets,
      body.is_gm ? 1 : 0,
      snap.level,
      snap.map,
      snap.status,
      snap.exists ? t : null,
      t,
    )
    .run();

  const id = result.meta.last_row_id;
  return json({ ok: true, id, snapshot: snap });
}

export async function deleteCharacter(env: Env, userId: number, id: number): Promise<Response> {
  const r = await env.DB
    .prepare("DELETE FROM characters WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  if (r.meta.changes === 0) return bad(404, "não encontrado");
  return json({ ok: true });
}

// On-demand re-scrape for a single character. Used by the dashboard to fill
// in stats lazily after a slow add, or when the user taps "Atualizar".
// Returns the freshly stored row so the UI can redraw.
export async function refreshCharacter(env: Env, userId: number, id: number): Promise<Response> {
  const owned = await env.DB
    .prepare("SELECT * FROM characters WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<CharacterRow>();
  if (!owned) return bad(404, "não encontrado");

  const snap = await scrapeOne(env, owned.name, { totalTimeoutMs: 25_000 });
  if (!snap.scraped) {
    return json({ scraped: false, character: owned });
  }
  if (!snap.exists) {
    // Char vanished from the server (renamed, deleted). Don't touch the row;
    // just tell the caller.
    return json({ scraped: true, exists: false, character: owned });
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
