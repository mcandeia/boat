/** Payload for Workflow `item-rules-backfill` / internal backfill runner. */
export type ItemRulesBackfillParams = {
  /** 1–50000; omit → 10000. Legacy UI sent 40 → server maps to default. */
  limit?: number;
  cookie?: string;
  /** Set only by `ItemRulesBackfillWorkflow` for live log lines in D1; never send from clients. */
  _workflow_instance_id?: string;
  /** Set only by the workflow runner: process one `item_sources.category` per step (internal). */
  _category?: string;
};

export interface Env {
  DB: D1Database;
  CHAR_WATCHERS: DurableObjectNamespace;  // one DO per character (timer + per-char tick)
  PING_TEST?: DurableObjectNamespace;     // diagnostic-only — see ping-test-do.ts

  /** Shop → item_rules backfill; optional when wrangler has no [[workflows]] binding. */
  BACKFILL_ITEM_RULES?: Workflow<ItemRulesBackfillParams>;

  PROFILE_BASE_URL: string;
  LOGIN_TOKEN_TTL_SECONDS: string;  // pending_logins TTL (deep-link auth)
  SESSION_TTL_DAYS: string;
  COOLDOWN_SECONDS: string;
  COOKIE_NAME: string;
  TELEGRAM_BOT_USERNAME: string;    // e.g. "mu_patos_bot" — public, no @
  DO_ALARM_INTERVAL_SECS?: string;  // optional override for the DO alarm cadence (default 60)

  // Set with `wrangler secret put`
  SESSION_SECRET?: string;          // HMAC key for the session cookie
  TELEGRAM_BOT_TOKEN?: string;      // BotFather token; stub mode if missing
  TELEGRAM_WEBHOOK_SECRET?: string; // checked against X-Telegram-Bot-Api-Secret-Token
  // Optional shop scraper credentials (MuPatos webshop).
  // Prefer setting as secrets (wrangler secret put ...).
  SHOP_SCRAPER_USERNAME?: string;   // mupatos shop login (for options-page scraping)
  SHOP_SCRAPER_PASSWORD?: string;
  /** First shop `fetch()` attempt timeout (ms); retries use ~1.5× and 2×. Plain var, default 30000; clamp 5000–120000. */
  SHOP_FETCH_TIMEOUT_MS?: string;
  /**
   * When `item-rules-backfill` runs (has `_workflow_instance_id`), caps how many distinct items the SQL picks per step.
   * Free-tier Workflows hit ~50 external subrequests per instance; omit this var → default cap in code (~45).
   * On paid plans, set high (e.g. 20000) or raise Worker `[limits].subrequests`.
   */
  BACKFILL_WORKFLOW_ITEM_CAP?: string;
}

export type EventType =
  | "level_gte"
  | "map_eq"
  | "coords_in"
  | "status_eq"
  | "gm_online"
  | "server_event"
  | "level_stale";

export interface UserRow {
  id: number;
  telegram_chat_id: number;
  telegram_username: string | null;
  first_name: string | null;
  created_at: number;
  admin: number;
  nickname: string | null;
}

export type ListingSide = "buy" | "sell" | "donate";
export type ListingStatus = "open" | "held" | "closed";
export type ListingKind = "item" | "char";

export interface ListingRow {
  id: number;
  user_id: number;
  char_id: number | null;
  kind: ListingKind;
  side: ListingSide;
  item_name: string;
  item_slug: string | null;
  item_image_url: string | null;
  item_attrs: string | null;
  currency: string | null;
  price: number | null;
  notes: string | null;
  allow_message: number;
  status: ListingStatus;
  created_at: number;
}

export interface ListingCommentRow {
  id: number;
  listing_id: number;
  user_id: number;
  body: string;
  created_at: number;
}

export type CustomEventScheduleType = "once" | "daily" | "weekly";

export interface CustomEventRow {
  id: number;
  name: string;
  gm_name: string | null;
  description: string | null;
  gifts: string | null;          // JSON array
  schedule_type: CustomEventScheduleType;
  schedule_at: number | null;    // unix seconds (UTC) for 'once'
  schedule_time: string | null;  // "HH:MM" BR-local for 'daily' and 'weekly'
  schedule_dow: number | null;   // 0..6 (Sun..Sat) for 'weekly'
  active: number;
  created_by: number | null;
  created_at: number;
  updated_at: number;
}

export interface CustomEventSubRow {
  id: number;
  custom_event_id: number;
  user_id: number;
  lead_minutes: number;
  last_fired_at: number | null;
  cooldown_until: number;
  created_at: number;
}

export type GiftKind = "rarius" | "kundun" | "custom" | "any";

export interface CustomEventGiftSubRow {
  id: number;
  user_id: number;
  gift_kind: GiftKind;
  lead_minutes: number;
  created_at: number;
}

export interface PendingLoginRow {
  token: string;
  created_at: number;
  expires_at: number;
  redeemed_at: number | null;
  chat_id: number | null;
  username: string | null;
  first_name: string | null;
}

export interface CharacterRow {
  id: number;
  name: string;
  class: string | null;
  resets: number | null;
  last_level: number | null;
  last_map: string | null;
  last_status: string | null;
  last_checked_at: number | null;
  next_check_at: number;
  created_at: number;
  rank_overall: number | null;
  rank_class: number | null;
  class_code: string | null;
  next_target_name: string | null;
  next_target_resets: number | null;
  blocked: number;
  avg_reset_time?: number | null;
  last_level_change_at: number | null;
}

export interface UserCharacterRow {
  id: number;
  user_id: number;
  character_id: number;
  is_gm: number;
  created_at: number;
}

export interface SubscriptionRow {
  id: number;
  user_id: number;
  character_id: number | null;
  event_type: EventType;
  threshold: string | null;
  active: number;
  cooldown_until: number;
  last_fired_at: number | null;
  created_at: number;
  custom_message: string | null;
}

export interface ProfileSnapshot {
  name: string;
  class: string | null;
  resets: number | null;
  level: number | null;
  map: string | null;          // full string as scraped, e.g. "Stadium (47/35)"
  mapName: string | null;      // "Stadium"
  mapX: number | null;
  mapY: number | null;
  status: "Online" | "Offline" | null;
  // True iff we successfully fetched HTML and parsed a profile table. Used
  // to distinguish "char definitely doesn't exist" from "we couldn't scrape
  // right now."
  exists: boolean;
  // True iff the scrape actually completed (timeout/error makes this false
  // even when exists is also false — caller can fall back gracefully).
  scraped: boolean;
}
