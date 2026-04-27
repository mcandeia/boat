import type { Env } from "./types";

// Z-API (https://z-api.io) — Brazilian WhatsApp Web wrapper. Each Z-API
// "instance" is one linked WhatsApp account; we send through that account.
//
// Endpoint:
//   POST {ZAPI_BASE_URL}/instances/{INSTANCE_ID}/token/{INSTANCE_TOKEN}/send-text
//   body  : { phone: "5583999998888", message: "..." }
//
// Z-API returns 200 with a messageId even when the instance's WhatsApp is
// disconnected — the message just sits in a queue and never gets delivered.
// So before sending we hit /status and return a friendly error if the
// smartphone is offline. One extra request per send, low traffic anyway.

interface SendResult { ok: boolean; status: number; body: string }

async function zapiBase(env: Env): Promise<{ id: string; tok: string; baseUrl: string; headers: Record<string, string> } | null> {
  const { ZAPI_INSTANCE_ID: id, ZAPI_INSTANCE_TOKEN: tok, ZAPI_CLIENT_TOKEN: clientTok } = env;
  if (!id || !tok) return null;
  const baseUrl = (env.ZAPI_BASE_URL || "https://api.z-api.io").replace(/\/+$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (clientTok) headers["client-token"] = clientTok;
  return { id, tok, baseUrl, headers };
}

// Returns null on success, an error message on failure (instance offline etc).
async function zapiPreflight(c: { id: string; tok: string; baseUrl: string; headers: Record<string, string> }): Promise<string | null> {
  try {
    const r = await fetch(`${c.baseUrl}/instances/${c.id}/token/${c.tok}/status`, { headers: c.headers });
    const j = (await r.json().catch(() => null)) as { connected?: boolean; smartphoneConnected?: boolean; error?: string } | null;
    if (!j) return `Z-API status ${r.status}`;
    if (j.connected === false || j.smartphoneConnected === false) {
      return "o WhatsApp do bot está desconectado — peça ao admin pra religar";
    }
    return null;
  } catch (e) {
    return `falha consultando status: ${(e as Error).message}`;
  }
}

export async function sendWhatsApp(env: Env, to: string, message: string): Promise<SendResult> {
  const cfg = await zapiBase(env);
  if (!cfg) {
    console.log(`[whatsapp:stub] to=${to} :: ${message}`);
    return { ok: true, status: 200, body: "stubbed" };
  }

  const offline = await zapiPreflight(cfg);
  if (offline) {
    console.log(`[whatsapp] preflight failed: ${offline}`);
    return { ok: false, status: 503, body: offline };
  }

  const res = await fetch(`${cfg.baseUrl}/instances/${cfg.id}/token/${cfg.tok}/send-text`, {
    method: "POST",
    headers: cfg.headers,
    body: JSON.stringify({ phone: to, message }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}
