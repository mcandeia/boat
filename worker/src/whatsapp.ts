import type { Env } from "./types";

// Placeholder integration. The user will plug in their bot's HTTP API later.
// Convention used here: POST {WHATSAPP_API_URL} with JSON {to, message},
// Bearer-authenticated by WHATSAPP_API_TOKEN. Adjust `payload` once the real
// bot's contract is known — keep the function signature stable.
export async function sendWhatsApp(
  env: Env,
  to: string,
  message: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const url = env.WHATSAPP_API_URL || "https://placeholder.invalid/send";
  const token = env.WHATSAPP_API_TOKEN ?? "";

  if (!token || url.includes("placeholder.invalid")) {
    // Dev/no-bot mode: log instead of sending so the rest of the app works.
    console.log(`[whatsapp:stub] to=${to} :: ${message}`);
    return { ok: true, status: 200, body: "stubbed" };
  }

  const payload: Record<string, unknown> = { to, message };
  if (env.WHATSAPP_FROM) payload.from = env.WHATSAPP_FROM;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
