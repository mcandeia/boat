-- Admin-managed dynamic events (GM events, calendar events, etc).
-- Distinct from `server_events` (which is the scraped Chaos/Blood/Devil
-- schedule) — these are first-class rows the staff creates by hand.
--
-- Schedule kinds:
--   'once'   → fires at schedule_at (unix seconds, BR-local converted server-side)
--   'daily'  → fires at schedule_time HH:MM every day
--   'weekly' → fires at schedule_time HH:MM on schedule_dow (0=Sun..6=Sat)
--
-- Gifts are stored as JSON: [{kind:'rarius',qty:5},
--                            {kind:'kundun',tier:3},
--                            {kind:'custom',name:'Cape of Lord'}].
-- Free-form so we can add new kinds without a migration.

CREATE TABLE custom_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  gm_name       TEXT,
  description   TEXT,
  gifts         TEXT,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('once','daily','weekly')),
  schedule_at   INTEGER,
  schedule_time TEXT,
  schedule_dow  INTEGER,
  active        INTEGER NOT NULL DEFAULT 1,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX idx_custom_events_active ON custom_events(active);

CREATE TABLE custom_event_subs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  custom_event_id INTEGER NOT NULL REFERENCES custom_events(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_minutes    INTEGER NOT NULL DEFAULT 5,
  last_fired_at   INTEGER,
  cooldown_until  INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  UNIQUE(custom_event_id, user_id)
);
CREATE INDEX idx_custom_event_subs_event ON custom_event_subs(custom_event_id);
CREATE INDEX idx_custom_event_subs_user  ON custom_event_subs(user_id);

-- Subscribe by gift kind, not by event. Fires whenever an active custom
-- event whose gifts include `gift_kind` is scheduled. Lets a user say
-- "ping me on ANY event that drops rarius" without picking each one.
-- Cooldown is per (user, event) tuple — see pollCustomEvents — so a
-- single user with both a per-event sub and a gift-kind sub on the same
-- event still only gets one ping per fire window.
CREATE TABLE custom_event_gift_subs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gift_kind       TEXT NOT NULL,        -- 'rarius' | 'kundun' | 'custom' | 'any'
  lead_minutes    INTEGER NOT NULL DEFAULT 5,
  created_at      INTEGER NOT NULL,
  UNIQUE(user_id, gift_kind)
);
CREATE INDEX idx_custom_event_gift_subs_user ON custom_event_gift_subs(user_id);

-- Tracks "we already pinged user U about event E" so per-event subs and
-- gift-kind subs don't double-fire and so daily/weekly events don't
-- re-fire within their cooldown window.
CREATE TABLE custom_event_fired (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  custom_event_id INTEGER NOT NULL REFERENCES custom_events(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ts              INTEGER NOT NULL,
  UNIQUE(custom_event_id, user_id, ts)
);
CREATE INDEX idx_custom_event_fired_lookup ON custom_event_fired(custom_event_id, user_id, ts);
