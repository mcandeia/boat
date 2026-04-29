import type { CharacterRow, Env, SubscriptionRow, UserRow } from "../types";
import { bad, json } from "../util";

export async function me(env: Env, userId: number): Promise<Response> {
  const user = await env.DB
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();
  if (!user) return bad(401, "sessão inválida");

  type Row = CharacterRow & { is_gm: number; avg_reset_time?: number | null };
  const characters = (
    await env.DB
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
      .all<Row>()
  ).results ?? [];

  const subscriptions = (
    await env.DB
      .prepare("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC")
      .bind(userId)
      .all<SubscriptionRow>()
  ).results ?? [];

  return json({
    user: {
      id: user.id,
      first_name: user.first_name,
      username: user.telegram_username,
      is_admin: !!user.admin,
      nickname: user.nickname ?? null,
    },
    characters,
    subscriptions,
  });
}

const NICKNAME_RE = /^[A-Za-z0-9_\-\.]{2,20}$/;

export async function setNickname(env: Env, userId: number, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { nickname?: string };
  const raw = (body.nickname ?? "").trim();
  if (!NICKNAME_RE.test(raw)) {
    return bad(400, "apelido deve ter 2–20 caracteres (letras, números, _ - .)");
  }
  // Case-insensitive uniqueness — let the unique index enforce it but
  // give a friendly message when it collides.
  const collision = await env.DB
    .prepare("SELECT id FROM users WHERE nickname = ? COLLATE NOCASE AND id <> ?")
    .bind(raw, userId)
    .first<{ id: number }>();
  if (collision) return bad(409, "apelido já está em uso");

  try {
    await env.DB
      .prepare("UPDATE users SET nickname = ? WHERE id = ?")
      .bind(raw, userId)
      .run();
  } catch (e) {
    return bad(409, "apelido já está em uso");
  }
  return json({ ok: true, nickname: raw });
}
