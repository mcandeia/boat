import type { Env } from "./types";
import { constantTimeEq } from "./util";

// Stateless signed-cookie sessions: payload = `${userId}.${expiresAt}`,
// cookie value = `${payload}.${hmacBase64Url(payload)}`.
// No DB lookup on every request — the HMAC is the auth.

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

export async function createSession(env: Env, userId: number): Promise<string> {
  const secret = env.SESSION_SECRET ?? "dev-only-insecure-secret";
  const ttlDays = Number(env.SESSION_TTL_DAYS || "30");
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const payload = `${userId}.${exp}`;
  const sig = await sign(payload, secret);
  return `${payload}.${sig}`;
}

export async function readSession(
  env: Env,
  cookieHeader: string | null,
): Promise<{ userId: number; exp: number } | null> {
  if (!cookieHeader) return null;
  const cookieName = env.COOKIE_NAME;
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(cookieName + "="));
  if (!match) return null;
  const raw = decodeURIComponent(match.slice(cookieName.length + 1));
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  const payload = `${uid}.${exp}`;
  const expected = await sign(payload, env.SESSION_SECRET ?? "dev-only-insecure-secret");
  if (!constantTimeEq(sig, expected)) return null;
  const expNum = Number(exp);
  if (!expNum || expNum < Math.floor(Date.now() / 1000)) return null;
  const userId = Number(uid);
  if (!userId) return null;
  return { userId, exp: expNum };
}

export function setCookieHeader(env: Env, value: string): string {
  const ttlDays = Number(env.SESSION_TTL_DAYS || "30");
  const maxAge = ttlDays * 86400;
  return `${env.COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookieHeader(env: Env): string {
  return `${env.COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
