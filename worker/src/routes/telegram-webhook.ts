import type { Env } from "../types";
import { bad, json, now } from "../util";
import { sendTelegram } from "../telegram";

// Telegram webhook handler.
//
// We register the webhook with `secret_token` set to TELEGRAM_WEBHOOK_SECRET;
// Telegram includes that value in `X-Telegram-Bot-Api-Secret-Token` on every
// delivery. We reject anything that doesn't match.
//
// We only care about /start commands here — everything else is acknowledged
// and ignored. /start <token> claims a pending_logins row.

interface TgChat { id: number; type: string }
interface TgUser { id: number; username?: string; first_name?: string }
interface TgMessage { chat: TgChat; from?: TgUser; text?: string }
interface TgUpdate { update_id: number; message?: TgMessage }

export async function telegramWebhook(env: Env, req: Request): Promise<Response> {
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const incoming = req.headers.get("x-telegram-bot-api-secret-token");
    if (incoming !== env.TELEGRAM_WEBHOOK_SECRET) {
      return bad(401, "bad secret");
    }
  }

  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (!update?.message) return json({ ok: true });

  const msg = update.message;
  const text = (msg.text ?? "").trim();
  const chat = msg.chat;

  // Only react to /start [<token>] from a private (one-on-one) chat.
  if (chat.type !== "private" || !text.startsWith("/start")) {
    return json({ ok: true });
  }

  const argMatch = text.match(/^\/start(?:\s+([A-Za-z0-9_-]+))?$/);
  const startToken = argMatch?.[1];
  const userInfo = msg.from;

  if (startToken) {
    const row = await env.DB
      .prepare("SELECT token, expires_at, redeemed_at FROM pending_logins WHERE token = ?")
      .bind(startToken)
      .first<{ token: string; expires_at: number; redeemed_at: number | null }>();

    if (!row) {
      await sendTelegram(env, chat.id, "❌ Esse link de login é inválido. Volte ao site e gere um novo.");
      return json({ ok: true });
    }
    if (row.expires_at < now()) {
      await env.DB.prepare("DELETE FROM pending_logins WHERE token = ?").bind(startToken).run();
      await sendTelegram(env, chat.id, "⌛ Esse link de login expirou. Volte ao site e gere um novo.");
      return json({ ok: true });
    }
    if (row.redeemed_at != null) {
      await sendTelegram(env, chat.id, "Esse link já foi usado. Tudo certo, pode voltar pro site.");
      return json({ ok: true });
    }

    await env.DB
      .prepare(
        `UPDATE pending_logins
            SET redeemed_at = ?, chat_id = ?, username = ?, first_name = ?
          WHERE token = ?`,
      )
      .bind(now(), chat.id, userInfo?.username ?? null, userInfo?.first_name ?? null, startToken)
      .run();

    await sendTelegram(
      env,
      chat.id,
      `✅ Conectado! Volte para o site — o painel já liberou.\n\nDaqui pra frente, é por aqui que vão chegar os alertas.`,
    );
  } else {
    // Plain /start without a token. Greet the user. Panel URL comes from the
    // incoming request so it tracks whatever name the worker deploys under.
    const panelUrl = new URL(req.url).origin;
    await sendTelegram(
      env,
      chat.id,
      `<b>Painel do jogador Mu Patos</b>\n\nEsse bot manda alertas dos seus chars (level, mapa, online/offline). Pra começar, abra <a href="${panelUrl}/">o painel</a> e clique em <b>Conectar com Telegram</b>.`,
    );
  }

  return json({ ok: true });
}
