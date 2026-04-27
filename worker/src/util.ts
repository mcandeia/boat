export const now = (): number => Math.floor(Date.now() / 1000);

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

export function bad(status: number, msg: string): Response {
  return json({ error: msg }, { status });
}

// Strip everything except digits — phone numbers are stored as digits-only E.164.
export function normalizePhone(input: string): string | null {
  const digits = (input ?? "").replace(/\D+/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomPin(): string {
  // Six-digit PIN, leading-zero allowed.
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

export function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
