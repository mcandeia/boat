# mu-level-watcher (Cloudflare Worker)

WhatsApp alerts for MuPatos characters: level milestones, map changes,
online/offline transitions, GM online. Built on Cloudflare Workers + D1 +
Browser Rendering, polled every 5 minutes by a Cron Trigger.

## Architecture

- **Worker** (`src/index.ts`) serves the single-page UI and the JSON API.
- **D1** stores users, characters, subscriptions, pending PINs.
- **Browser Rendering** (`@cloudflare/puppeteer`) launches a real Chromium
  every poll because `mupatos.com.br` 403s plain `fetch()`.
- **Cron** runs `*/5 * * * *` and calls `pollOnce()`.
- **Auth** is WhatsApp PIN + HMAC-signed session cookie (no PII besides
  the phone number, no extra DB lookups per request).

## One-time setup

```bash
cd worker
npm install
npx wrangler login

# Create D1 and copy the printed database_id into wrangler.toml.
npx wrangler d1 create mu-watcher

# Apply migrations locally (for `wrangler dev`) and on prod.
npx wrangler d1 migrations apply mu-watcher --local
npx wrangler d1 migrations apply mu-watcher --remote

# Secrets.
# Strong random for session HMAC.
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET

# WhatsApp via Kapso (https://kapso.ai) — free plan includes a managed bot
# number, so you don't need to expose your personal number.
#   1. Sign up at kapso.ai and finish onboarding (Meta Business Account
#      created/linked, managed phone number provisioned).
#   2. Create a UTILITY template:
#         name:     mu_alert
#         language: pt_BR (or en_US — must match KAPSO_TEMPLATE_LANG)
#         body:     [MU Watcher] {{1}}
#      Wait for Meta to approve it (usually minutes).
#   3. Grab the project API key and the phone_number_id of your managed number.
echo "kpso_..."                   | npx wrangler secret put KAPSO_API_KEY
echo "1234567890"                 | npx wrangler secret put KAPSO_PHONE_NUMBER_ID
```

Browser Rendering needs to be enabled on the account
(<https://dash.cloudflare.com> → Workers & Pages → Browser Rendering). It
requires the Workers Paid plan; usage from cron is small.

## Run locally

```bash
npx wrangler dev
# open http://localhost:8787
```

In dev with `KAPSO_API_KEY` unset, PINs are printed to the wrangler log
instead of being sent — copy the 6-digit code from there.

## Deploy

```bash
npx wrangler deploy
```

## Manual poll (for testing)

```bash
curl -X POST https://<your-worker>.workers.dev/admin/poll \
  -H "authorization: Bearer $SESSION_SECRET"
```

## Event types

| event_type     | threshold              | needs character | fires when                              |
| -------------- | ---------------------- | --------------- | --------------------------------------- |
| `level_gte`    | integer (e.g. `360`)   | yes             | level crosses up through threshold      |
| `map_eq`       | map name (`Stadium`)   | yes             | character enters that map               |
| `status_eq`    | `Online` / `Offline`   | yes             | character transitions into that status  |
| `gm_online`    | (none)                 | yes (GM-flagged)| GM character comes online               |
| `server_event` | event name             | no              | (placeholder — needs a data source)     |

Every fire sets a 6h cooldown so a flapping value can't spam. The check is
edge-triggered too: `level_gte 360` only fires on the level 359 → 360
crossing, not every poll while ≥ 360.

## How WhatsApp sends actually work

Every outbound message goes through the Kapso send endpoint as the
`mu_alert` template (or whatever you set `KAPSO_TEMPLATE_NAME` to) with the
alert body as `{{1}}`. Free-form text would only work inside Meta's 24h
"customer service window", which we can't rely on for proactive alerts —
hence the template.

If you want to swap providers later (Twilio, Evolution API, Z-API, etc.),
edit only `src/whatsapp.ts` — the rest of the code calls
`sendWhatsApp(env, to, msg)` and doesn't care.

### Costs

Kapso's free plan: 2,000 messages/month + 1 managed number. Beyond that
plan tiers exist. **Meta bills separately** per delivered template (utility
category in Brazil ≈ R$0.04 / msg as of writing). For personal +
small-friend-group scale this is pennies/month, but it's not literally
zero.

## Things deliberately deferred

- **PIX payments** — the brief said free for v1.
- **Server events feed** (Chaos Castle / Blood Castle / etc.) — the
  profile page doesn't expose these. Hook a separate scrape (server status
  page, a Discord webhook, or the in-game schedule) into the
  `server_event` branch in `src/poll.ts`.
- **Reusing the original Playwright watcher** — `../watch.ts` still works
  for your personal `daddy` Pushover loop and is untouched.
