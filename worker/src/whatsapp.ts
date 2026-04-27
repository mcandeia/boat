import type { Env } from "./types";

// Kapso (https://kapso.ai) sits on top of the official Meta WhatsApp Cloud API
// and provides a managed bot number on the free plan, so this app doesn't need
// the operator's personal WhatsApp number.
//
// Outbound messages to a recipient who hasn't messaged the bot in the last 24h
// MUST be a pre-approved template — that's a Meta rule, not a Kapso one. The
// recommended setup is one generic utility template, e.g.:
//
//   Name:     mu_alert
//   Language: pt_BR
//   Category: UTILITY
//   Body:     [MU Watcher] {{1}}
//
// We send every message through this template with `{{1}}` = the alert text.
//
// If KAPSO_API_KEY is unset, sends are stubbed (logged) so dev works without
// any WhatsApp wiring.
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
  const templateName = env.KAPSO_TEMPLATE_NAME || "mu_alert";
  const templateLang = env.KAPSO_TEMPLATE_LANG || "pt_BR";

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: truncateForTemplate(message) }],
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

// WhatsApp template body parameters have a 1024-char limit and cannot contain
// newlines/tabs. Strip them and clip — alerts are short anyway.
function truncateForTemplate(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 1000);
}
