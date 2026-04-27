import type { Env, UserRow } from "../types";
import { bad, json, normalizePhone, now, randomPin, sha256Hex } from "../util";
import { createSession, setCookieHeader, clearCookieHeader } from "../session";
import { sendWhatsApp } from "../whatsapp";

const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN = 30; // seconds between PIN resends

export async function requestPin(env: Env, req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { whatsapp?: string };
  const phone = normalizePhone(body.whatsapp ?? "");
  if (!phone) return bad(400, "número de WhatsApp inválido");

  const ttl = Number(env.PIN_TTL_SECONDS || "600");
  const t = now();

  const existing = await env.DB
    .prepare("SELECT resend_after FROM pins WHERE whatsapp = ?")
    .bind(phone)
    .first<{ resend_after: number }>();
  if (existing && existing.resend_after > t) {
    return bad(429, `aguarde ${existing.resend_after - t}s antes de pedir um novo código`);
  }

  const pin = randomPin();
  const pinHash = await sha256Hex(pin);
  const expiresAt = t + ttl;
  const resendAfter = t + RESEND_COOLDOWN;

  await env.DB
    .prepare(
      `INSERT INTO pins (whatsapp, pin_hash, expires_at, attempts, resend_after)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(whatsapp) DO UPDATE SET
         pin_hash = excluded.pin_hash,
         expires_at = excluded.expires_at,
         attempts = 0,
         resend_after = excluded.resend_after`,
    )
    .bind(phone, pinHash, expiresAt, resendAfter)
    .run();

  const send = await sendWhatsApp(
    env,
    phone,
    `Seu código de acesso ao Painel do jogador Mu Patos é ${pin}. Expira em ${Math.round(ttl / 60)} minutos.`,
  );
  if (!send.ok) {
    // 503 = our preflight detected the bot WhatsApp is disconnected; surface
    // the message verbatim. Other failures get a generic message.
    if (send.status === 503) return bad(503, send.body);
    return bad(502, `falha ao enviar WhatsApp (${send.status})`);
  }
  return json({ ok: true, expires_in: ttl });
}

export async function verifyPin(env: Env, req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { whatsapp?: string; pin?: string };
  const phone = normalizePhone(body.whatsapp ?? "");
  const pin = (body.pin ?? "").trim();
  if (!phone) return bad(400, "número de WhatsApp inválido");
  if (!/^\d{6}$/.test(pin)) return bad(400, "o código deve ter 6 dígitos");

  const row = await env.DB
    .prepare("SELECT pin_hash, expires_at, attempts FROM pins WHERE whatsapp = ?")
    .bind(phone)
    .first<{ pin_hash: string; expires_at: number; attempts: number }>();
  if (!row) return bad(400, "nenhum código pendente — peça um novo");
  if (row.expires_at < now()) return bad(400, "código expirado — peça um novo");
  if (row.attempts >= MAX_ATTEMPTS) return bad(429, "tentativas demais — peça um novo código");

  const submittedHash = await sha256Hex(pin);
  if (submittedHash !== row.pin_hash) {
    await env.DB
      .prepare("UPDATE pins SET attempts = attempts + 1 WHERE whatsapp = ?")
      .bind(phone)
      .run();
    return bad(400, "código incorreto");
  }

  // Upsert user, then issue session.
  await env.DB
    .prepare(
      `INSERT INTO users (whatsapp, created_at) VALUES (?, ?)
       ON CONFLICT(whatsapp) DO NOTHING`,
    )
    .bind(phone, now())
    .run();
  const user = await env.DB
    .prepare("SELECT id, whatsapp, created_at FROM users WHERE whatsapp = ?")
    .bind(phone)
    .first<UserRow>();
  if (!user) return bad(500, "não foi possível carregar o usuário");

  await env.DB.prepare("DELETE FROM pins WHERE whatsapp = ?").bind(phone).run();

  const token = await createSession(env, user.id);
  return json(
    { ok: true, user: { id: user.id, whatsapp: user.whatsapp } },
    { headers: { "set-cookie": setCookieHeader(env, token) } },
  );
}

export function logout(env: Env): Response {
  return json({ ok: true }, { headers: { "set-cookie": clearCookieHeader(env) } });
}
