import type { BrowserWorker } from "@cloudflare/puppeteer";

export interface Env {
  DB: D1Database;
  BROWSER: BrowserWorker;

  PROFILE_BASE_URL: string;
  PIN_TTL_SECONDS: string;
  SESSION_TTL_DAYS: string;
  COOLDOWN_SECONDS: string;
  COOKIE_NAME: string;

  // Set with `wrangler secret put`
  SESSION_SECRET?: string;          // HMAC key for the session cookie

  // Z-API (https://z-api.io) — pinned to a single instance, plain-text sends.
  // Stub mode (logs to console) when ZAPI_INSTANCE_ID is unset.
  ZAPI_BASE_URL?: string;           // default https://api.z-api.io
  ZAPI_INSTANCE_ID?: string;        // per-instance id, in the URL
  ZAPI_INSTANCE_TOKEN?: string;     // per-instance token, in the URL (secret)
  ZAPI_CLIENT_TOKEN?: string;       // account-level Client-Token header (secret)
}

export type EventType =
  | "level_gte"
  | "map_eq"
  | "coords_in"
  | "status_eq"
  | "gm_online"
  | "server_event";

export interface UserRow {
  id: number;
  whatsapp: string;
  created_at: number;
}

export interface CharacterRow {
  id: number;
  user_id: number;
  name: string;
  class: string | null;
  resets: number | null;
  is_gm: number;
  last_level: number | null;
  last_map: string | null;
  last_status: string | null;
  last_checked_at: number | null;
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
  exists: boolean;
}
