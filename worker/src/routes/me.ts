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
    },
    characters,
    subscriptions,
  });
}
