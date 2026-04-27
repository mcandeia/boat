import type { Env } from "./types";

// Z-API (https://z-api.io) — Brazilian WhatsApp Web wrapper. Each Z-API
// "instance" is one linked WhatsApp account; we send through that account.
//
// Endpoint:
//   POST {ZAPI_BASE_URL}/instances/{INSTANCE_ID}/token/{INSTANCE_TOKEN}/send-text
//   header: Client-Token: {ACCOUNT_LEVEL_TOKEN}
//   body  : { phone: "5583999998888", message: "..." }
//
// "phone" must be E.164 digits only (no +, no separators), country code
// included. The account-level Client-Token is separate from the per-instance
// token — both are required.
//
// If ZAPI_INSTANCE_ID is unset we stub-log the send so dev still works.
export async function sendWhatsApp(
  env: Env,
  to: string,
  message: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const { ZAPI_INSTANCE_ID: id, ZAPI_INSTANCE_TOKEN: tok, ZAPI_CLIENT_TOKEN: clientTok } = env;
  if (!id || !tok || !clientTok) {
    console.log(`[whatsapp:stub] to=${to} :: ${message}`);
    return { ok: true, status: 200, body: "stubbed" };
  }

  const base = (env.ZAPI_BASE_URL || "https://api.z-api.io").replace(/\/+$/, "");
  const url = `${base}/instances/${id}/token/${tok}/send-text`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "client-token": clientTok,
    },
    body: JSON.stringify({ phone: to, message }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
