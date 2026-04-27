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

# WhatsApp via Z-API (https://z-api.io).
#   1. Get a Brazilian SIM (or eSIM) registered to a phone of your choice
#      and install WhatsApp on that line.
#   2. Sign up at z-api.io, create an instance, scan its QR with the bot
#      WhatsApp's "Linked Devices."
#   3. From the Z-API dashboard, grab:
#        - the instance ID (goes in wrangler.toml as ZAPI_INSTANCE_ID)
#        - the instance token
#        - your account-level Client-Token (Account Security Token)
echo "REPLACE_WITH_INSTANCE_TOKEN" | npx wrangler secret put ZAPI_INSTANCE_TOKEN
echo "REPLACE_WITH_CLIENT_TOKEN"   | npx wrangler secret put ZAPI_CLIENT_TOKEN
# Then edit ZAPI_INSTANCE_ID in wrangler.toml.
```

Browser Rendering needs to be enabled on the account
(<https://dash.cloudflare.com> → Workers & Pages → Browser Rendering). It
requires the Workers Paid plan; usage from cron is small.

## Run locally

```bash
npx wrangler dev
# open http://localhost:8787
```

In dev with the Z-API secrets unset, PINs are printed to the wrangler log
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

Every outbound message goes through Z-API's `send-text` endpoint as plain
text — Z-API uses the WhatsApp Web protocol so there's no template
approval and no 24h customer-service window.

If you swap providers later, edit only `src/whatsapp.ts` — the rest of
the code calls `sendWhatsApp(env, to, msg)` and doesn't care.

### Operational notes

- The bot's number must keep WhatsApp linked to Z-API. The phone holding
  the SIM only needs to come online roughly every 14 days to keep the
  multi-device session alive.
- Z-API charges a monthly fee per instance; check their site for current
  pricing. There's no per-message Meta fee since this isn't the official
  Cloud API.
- Risk: Z-API uses unofficial WhatsApp Web protocol, so Meta can ban the
  number if usage looks abusive. Personal-scale alerts are normally fine.

## Things deliberately deferred

- **PIX payments** — the brief said free for v1.
- **Server events feed** (Chaos Castle / Blood Castle / etc.) — the
  profile page doesn't expose these. Hook a separate scrape (server status
  page, a Discord webhook, or the in-game schedule) into the
  `server_event` branch in `src/poll.ts`.
- **Reusing the original Playwright watcher** — `../watch.ts` still works
  for your personal `daddy` Pushover loop and is untouched.
