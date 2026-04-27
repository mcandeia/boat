import type { Env, UserRow } from "../types";
import { bad, json, normalizePhone, now, randomPin, sha256Hex } from "../util";
import { createSession, setCookieHeader, clearCookieHeader } from "../session";
import { sendWhatsApp } from "../whatsapp";

const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN = 30; // seconds between PIN resends

export async function requestPin(env: Env, req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { whatsapp?: string };
  const phone = normalizePhone(body.whatsapp ?? "");
  if (!phone) return bad(400, "invalid whatsapp number");

  const ttl = Number(env.PIN_TTL_SECONDS || "600");
  const t = now();

  const existing = await env.DB
    .prepare("SELECT resend_after FROM pins WHERE whatsapp = ?")
    .bind(phone)
    .first<{ resend_after: number }>();
  if (existing && existing.resend_after > t) {
    return bad(429, `wait ${existing.resend_after - t}s before requesting a new pin`);
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
    `Your MU Level Watcher login code is ${pin}. Expires in ${Math.round(ttl / 60)} minutes.`,
  );
  if (!send.ok) {
    return bad(502, `whatsapp send failed: ${send.status}`);
  }
  return json({ ok: true, expires_in: ttl });
}

export async function verifyPin(env: Env, req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { whatsapp?: string; pin?: string };
  const phone = normalizePhone(body.whatsapp ?? "");
  const pin = (body.pin ?? "").trim();
  if (!phone) return bad(400, "invalid whatsapp number");
  if (!/^\d{6}$/.test(pin)) return bad(400, "pin must be 6 digits");

  const row = await env.DB
    .prepare("SELECT pin_hash, expires_at, attempts FROM pins WHERE whatsapp = ?")
    .bind(phone)
    .first<{ pin_hash: string; expires_at: number; attempts: number }>();
  if (!row) return bad(400, "no pending pin — request a new one");
  if (row.expires_at < now()) return bad(400, "pin expired — request a new one");
  if (row.attempts >= MAX_ATTEMPTS) return bad(429, "too many attempts — request a new pin");

  const submittedHash = await sha256Hex(pin);
  if (submittedHash !== row.pin_hash) {
    await env.DB
      .prepare("UPDATE pins SET attempts = attempts + 1 WHERE whatsapp = ?")
      .bind(phone)
      .run();
    return bad(400, "wrong pin");
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
  if (!user) return bad(500, "could not load user");

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
