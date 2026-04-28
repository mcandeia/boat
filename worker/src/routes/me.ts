import type { CharacterRow, Env, SubscriptionRow, UserRow } from "../types";
import { bad, json } from "../util";

export async function me(env: Env, userId: number): Promise<Response> {
  const user = await env.DB
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();
  if (!user) return bad(401, "sessão inválida");

  const characters = (
    await env.DB
      .prepare("SELECT * FROM characters WHERE user_id = ? ORDER BY name COLLATE NOCASE")
      .bind(userId)
      .all<CharacterRow>()
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
