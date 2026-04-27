-- Users keyed by WhatsApp number (E.164, digits only).
CREATE TABLE users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  whatsapp     TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL
);

-- One pending PIN per WhatsApp number. Replaces previous PIN on resend.
CREATE TABLE pins (
  whatsapp      TEXT PRIMARY KEY,
  pin_hash      TEXT NOT NULL,        -- SHA-256(hex) of the 6-digit code
  expires_at    INTEGER NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  resend_after  INTEGER NOT NULL DEFAULT 0
);

-- Registered characters belonging to a user.
CREATE TABLE characters (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  class           TEXT,
  resets          INTEGER,
  is_gm           INTEGER NOT NULL DEFAULT 0,    -- set by user when registering
  last_level      INTEGER,
  last_map        TEXT,
  last_status     TEXT,                          -- "Online" | "Offline"
  last_checked_at INTEGER,
  created_at      INTEGER NOT NULL,
  UNIQUE(user_id, name)
);
CREATE INDEX idx_characters_name ON characters(name);

-- Subscription = "notify me when this character/event meets condition".
-- event_type values:
--   level_gte        threshold = "360"                 character_id required
--   map_eq           threshold = "Stadium"             character_id required
--   coords_in        threshold = "Stadium:60-90:80-100" character_id required (entered box)
--   status_eq        threshold = "Online"              character_id required
--   gm_online        threshold = NULL                  character_id required (must be a GM char)
--   server_event     threshold = "Chaos Castle"        character_id NULL (placeholder; needs source)
CREATE TABLE subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id    INTEGER REFERENCES characters(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  threshold       TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  cooldown_until  INTEGER NOT NULL DEFAULT 0,
  last_fired_at   INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_subs_active ON subscriptions(active, character_id);
CREATE INDEX idx_subs_user   ON subscriptions(user_id);
