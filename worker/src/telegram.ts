import type { Env } from "./types";

// Telegram Bot API: POST https://api.telegram.org/bot{TOKEN}/{method}
//
// Bots can only message users who have already opened a chat with them and
// pressed "Start" (this hands the bot the chat_id). The auth flow handles
// that — by the time we call sendTelegram() we already have a chat_id from
// the /start webhook update.
//
// `parse_mode: HTML` lets us bold names without learning Telegram's MarkdownV2
// escaping, which is finicky.

interface SendResult { ok: boolean; status: number; body: string }

export async function sendTelegram(
  env: Env,
  chatId: number,
  html: string,
): Promise<SendResult> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.log(`[telegram:stub] chat=${chatId} :: ${html}`);
    return { ok: true, status: 200, body: "stubbed" };
  }
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

// Escape <, >, & for HTML parse_mode. Use on any user-supplied text injected
// into a message to avoid breaking the markup or letting through HTML.
export function escHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

// Idempotent: registers the worker URL as Telegram's webhook. Called from a
// post-deploy step in CI. We pass `secret_token` so Telegram includes
// X-Telegram-Bot-Api-Secret-Token on every webhook delivery and we can
// reject spoofed POSTs.
export async function setTelegramWebhook(
  env: Env,
  webhookUrl: string,
): Promise<SendResult> {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, status: 400, body: "no token" };
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
