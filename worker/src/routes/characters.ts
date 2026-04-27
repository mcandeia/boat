import type { CharacterRow, Env } from "../types";
import { bad, json, now } from "../util";
import { scrapeOne } from "../scraper";

const VALID_NAME = /^[A-Za-z0-9_-]{1,15}$/;

// Personal-grudge denylist. Case-insensitive exact match.
const BLOCKED_NAMES = new Set(["xibata"]);
const BLOCKED_MESSAGE = "Gosta de me matar né? agora vai ficar sem o bot 😘";
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
  if (BLOCKED_NAMES.has(name.toLowerCase())) return bad(403, BLOCKED_MESSAGE);
  const snap = await scrapeOne(env, name);
  if (!snap.exists) return json({ exists: false });
  return json({ exists: true, snapshot: snap });
}

export async function createCharacter(env: Env, userId: number, req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { name?: string; is_gm?: boolean };
  const name = (body.name ?? "").trim();
  if (!VALID_NAME.test(name)) return bad(400, INVALID_NAME);
  if (BLOCKED_NAMES.has(name.toLowerCase())) return bad(403, BLOCKED_MESSAGE);

  const dup = await env.DB
    .prepare("SELECT id FROM characters WHERE user_id = ? AND name = ?")
    .bind(userId, name)
    .first<{ id: number }>();
  if (dup) return bad(409, "personagem já cadastrado");

  const snap = await scrapeOne(env, name);
  if (!snap.exists) return bad(404, "personagem não encontrado no Mu Patos");

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
      t,
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
