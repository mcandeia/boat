import type { Env, PendingLoginRow, UserRow } from "../types";
import { bad, json, now } from "../util";
import { createSession, setCookieHeader, clearCookieHeader } from "../session";

// ---- Telegram deep-link auth ----
//
// Flow:
//   1. Browser POSTs /api/auth/telegram/start. We mint a random token,
//      insert a pending_logins row with TTL, return { token, deeplink }.
//   2. Browser opens the deeplink (t.me/<bot>?start=<token>) — Telegram opens.
//      User taps "Start". Telegram pushes /start <token> to our webhook.
//   3. Webhook handler fills in chat_id + names, sets redeemed_at.
//   4. Browser polls /api/auth/telegram/status?token=<token>. As soon as the
//      row is redeemed, we upsert the user, issue a session cookie, and
//      delete the pending row.

const TOKEN_BYTES = 16;

function randomToken(): string {
  const buf = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function startTelegramLogin(env: Env): Promise<Response> {
  const token = randomToken();
  const t = now();
  const ttl = Number(env.LOGIN_TOKEN_TTL_SECONDS || "600");
  await env.DB
    .prepare("INSERT INTO pending_logins (token, created_at, expires_at) VALUES (?, ?, ?)")
    .bind(token, t, t + ttl)
    .run();
  const deeplink = `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${token}`;
  return json({ token, deeplink, expires_in: ttl });
}

export async function pollTelegramLogin(env: Env, token: string): Promise<Response> {
  if (!/^[0-9a-f]{32}$/.test(token)) return bad(400, "token inválido");

  const row = await env.DB
    .prepare("SELECT * FROM pending_logins WHERE token = ?")
    .bind(token)
    .first<PendingLoginRow>();
  if (!row) return bad(404, "token não encontrado");

  if (row.expires_at < now()) {
    await env.DB.prepare("DELETE FROM pending_logins WHERE token = ?").bind(token).run();
    return bad(410, "token expirado — recomece o login");
  }

  if (row.redeemed_at == null || row.chat_id == null) {
    return json({ pending: true });
  }

  // Upsert the user, issue a session cookie, and clean up the pending row.
  await env.DB
    .prepare(
      `INSERT INTO users (telegram_chat_id, telegram_username, first_name, created_at)
         VALUES (?, ?, ?, ?)
       ON CONFLICT(telegram_chat_id) DO UPDATE SET
         telegram_username = excluded.telegram_username,
         first_name = excluded.first_name`,
    )
    .bind(row.chat_id, row.username, row.first_name, now())
    .run();

  const user = await env.DB
    .prepare("SELECT * FROM users WHERE telegram_chat_id = ?")
    .bind(row.chat_id)
    .first<UserRow>();
  if (!user) return bad(500, "não foi possível carregar o usuário");

  await env.DB.prepare("DELETE FROM pending_logins WHERE token = ?").bind(token).run();

  const sessionToken = await createSession(env, user.id);
  return json(
    {
      ok: true,
      user: {
        id: user.id,
        first_name: user.first_name,
        username: user.telegram_username,
      },
    },
    { headers: { "set-cookie": setCookieHeader(env, sessionToken) } },
  );
}

export function logout(env: Env): Response {
  return json({ ok: true }, { headers: { "set-cookie": clearCookieHeader(env) } });
}
