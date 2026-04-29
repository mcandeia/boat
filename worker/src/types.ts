export interface Env {
  DB: D1Database;

  PROFILE_BASE_URL: string;
  LOGIN_TOKEN_TTL_SECONDS: string;  // pending_logins TTL (deep-link auth)
  SESSION_TTL_DAYS: string;
  COOLDOWN_SECONDS: string;
  COOKIE_NAME: string;
  TELEGRAM_BOT_USERNAME: string;    // e.g. "mu_patos_bot" — public, no @

  // Set with `wrangler secret put`
  SESSION_SECRET?: string;          // HMAC key for the session cookie
  TELEGRAM_BOT_TOKEN?: string;      // BotFather token; stub mode if missing
  TELEGRAM_WEBHOOK_SECRET?: string; // checked against X-Telegram-Bot-Api-Secret-Token
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

export interface ListingRow {
  id: number;
  user_id: number;
  char_id: number | null;
  side: ListingSide;
  item_name: string;
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
