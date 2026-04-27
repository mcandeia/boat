-- Pivot from WhatsApp/Z-API to Telegram. The earlier schema is fully dropped
-- and recreated — we have no production users, so a clean reset is simpler
-- than ALTER-ing the existing tables.

DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS characters;
DROP TABLE IF EXISTS pins;
DROP TABLE IF EXISTS users;

-- Users are now keyed by Telegram chat_id (the numeric id Telegram assigns
-- to a user-bot conversation). username/first_name are denormalised from the
-- /start update for display.
CREATE TABLE users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_chat_id  INTEGER NOT NULL UNIQUE,
  telegram_username TEXT,
  first_name        TEXT,
  created_at        INTEGER NOT NULL
);

-- One-time login tokens used by the deep-link flow:
--   1. Browser asks server for a token.
--   2. Browser opens t.me/<bot>?start=<token>.
--   3. Bot's webhook receives /start <token>, fills in chat_id + names,
--      sets redeemed_at.
--   4. Browser polls /api/auth/telegram/status?token=...; once redeemed,
--      server issues a session cookie.
CREATE TABLE pending_logins (
  token        TEXT PRIMARY KEY,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  redeemed_at  INTEGER,
  chat_id      INTEGER,
  username     TEXT,
  first_name   TEXT
);
CREATE INDEX idx_pending_logins_expires ON pending_logins(expires_at);

-- Same character + subscription model as before. user_id ties to the new
-- users table.
CREATE TABLE characters (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  class           TEXT,
  resets          INTEGER,
  is_gm           INTEGER NOT NULL DEFAULT 0,
  last_level      INTEGER,
  last_map        TEXT,
  last_status     TEXT,
  last_checked_at INTEGER,
  next_check_at   INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  UNIQUE(user_id, name)
);
CREATE INDEX idx_characters_name ON characters(name);
CREATE INDEX idx_characters_due  ON characters(next_check_at);

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
