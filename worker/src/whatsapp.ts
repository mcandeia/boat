import type { Env } from "./types";

// Kapso (https://kapso.ai) wraps the official Meta WhatsApp Cloud API.
//
// Two modes, controlled by KAPSO_MODE:
//   - "sandbox"   plain-text sends. Sandbox numbers reject templates and only
//                 reach a single pre-activated recipient (the one who texted
//                 the activation code to the sandbox bot). Use this to wire
//                 up + smoke-test against your own WhatsApp.
//   - any other   production WABA. Sends go as a pre-approved utility template
//                 so they work outside Meta's 24h customer-service window.
//                 Recommended template:
//                     name:     mu_alert
//                     language: pt_BR
//                     category: UTILITY
//                     body:     [MU Watcher] {{1}}
//
// If KAPSO_API_KEY is unset, sends are stubbed (logged) so the rest of the
// app still works during development.
export async function sendWhatsApp(
  env: Env,
  to: string,
  message: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  if (!env.KAPSO_API_KEY || !env.KAPSO_PHONE_NUMBER_ID) {
    console.log(`[whatsapp:stub] to=${to} :: ${message}`);
    return { ok: true, status: 200, body: "stubbed" };
  }

  const base = (env.KAPSO_BASE_URL || "https://api.kapso.ai/meta/whatsapp/v24.0").replace(/\/+$/, "");
  const url = `${base}/${env.KAPSO_PHONE_NUMBER_ID}/messages`;
  const isSandbox = (env.KAPSO_MODE ?? "").toLowerCase() === "sandbox";

  const payload = isSandbox
    ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: clip(message, 4000) },
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: env.KAPSO_TEMPLATE_NAME || "mu_alert",
          language: { code: env.KAPSO_TEMPLATE_LANG || "pt_BR" },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: clip(message.replace(/\s+/g, " "), 1000) }],
            },
          ],
        },
      };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.KAPSO_API_KEY,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

