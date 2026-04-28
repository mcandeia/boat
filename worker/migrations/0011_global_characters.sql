-- Global character source of truth.
--
-- Before: `characters` was per-user (UNIQUE(user_id, name)).
-- After:  `characters` is global (UNIQUE(name)), and users link to it via
--         `user_characters` (UNIQUE(user_id, character_id)).
--
-- Snapshots and subscriptions now point at the global character id.

-- 1) New global table (same columns as existing + a UNIQUE(name)).
CREATE TABLE characters_new (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL,
  class                TEXT,
  resets               INTEGER,
  last_level           INTEGER,
  last_map             TEXT,
  last_status          TEXT,
  last_checked_at      INTEGER,
  last_level_change_at INTEGER,
  next_check_at        INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL,

  rank_overall         INTEGER,
  rank_class           INTEGER,
  class_code           TEXT,
  next_target_name     TEXT,
  next_target_resets   INTEGER,

  blocked              INTEGER NOT NULL DEFAULT 0,

  UNIQUE(name COLLATE NOCASE)
);
-- Use temporary index names to avoid colliding with existing indexes on the
-- current `characters` table during the migration.
CREATE INDEX idx_characters_new_name    ON characters_new(name);
CREATE INDEX idx_characters_new_due     ON characters_new(next_check_at);
CREATE INDEX idx_characters_new_blocked ON characters_new(blocked);

-- 2) New link table (per-user properties).
CREATE TABLE user_characters (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters_new(id) ON DELETE CASCADE,
  is_gm        INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  UNIQUE(user_id, character_id)
);
CREATE INDEX idx_user_characters_user ON user_characters(user_id);
CREATE INDEX idx_user_characters_char ON user_characters(character_id);

-- 3) Build global characters from existing rows.
-- Pick "best" row per name by newest last_checked_at, then created_at.
INSERT INTO characters_new (
  name,
  class,
  resets,
  last_level,
  last_map,
  last_status,
  last_checked_at,
  last_level_change_at,
  next_check_at,
  created_at,
  rank_overall,
  rank_class,
  class_code,
  next_target_name,
  next_target_resets,
  blocked
)
SELECT
  c.name,
  c.class,
  c.resets,
  c.last_level,
  c.last_map,
  c.last_status,
  c.last_checked_at,
  c.last_level_change_at,
  c.next_check_at,
  c.created_at,
  c.rank_overall,
  c.rank_class,
  c.class_code,
  c.next_target_name,
  c.next_target_resets,
  c.blocked
FROM characters c
JOIN (
  SELECT
    name,
    MAX(COALESCE(last_checked_at, 0)) AS best_checked,
    MAX(created_at) AS best_created
  FROM characters
  GROUP BY name COLLATE NOCASE
) pick
  ON pick.name = c.name
 AND COALESCE(c.last_checked_at, 0) = pick.best_checked
 AND c.created_at = pick.best_created;

-- If there were multiple rows tied on both fields (rare), the UNIQUE(name)
-- would drop extras. Ensure every distinct name is present at least once.
INSERT OR IGNORE INTO characters_new (name, created_at)
SELECT DISTINCT name, MIN(created_at)
  FROM characters
 GROUP BY name COLLATE NOCASE;

-- 4) Create links for every (user_id, name).
INSERT OR IGNORE INTO user_characters (user_id, character_id, is_gm, created_at)
SELECT
  c.user_id,
  cn.id AS character_id,
  MAX(c.is_gm) AS is_gm,
  MIN(c.created_at) AS created_at
FROM characters c
JOIN characters_new cn ON cn.name = c.name COLLATE NOCASE
GROUP BY c.user_id, cn.id;

-- 5) Remap snapshots: old char_id -> global character_id by name.
CREATE TABLE char_snapshots_new (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  char_id INTEGER NOT NULL REFERENCES characters_new(id) ON DELETE CASCADE,
  ts      INTEGER NOT NULL,
  level   INTEGER,
  resets  INTEGER,
  map     TEXT,
  status  TEXT
);
CREATE INDEX idx_char_snapshots_char_ts_new ON char_snapshots_new(char_id, ts);

INSERT INTO char_snapshots_new (char_id, ts, level, resets, map, status)
SELECT
  cn.id AS char_id,
  s.ts, s.level, s.resets, s.map, s.status
FROM char_snapshots s
JOIN characters c ON c.id = s.char_id
JOIN characters_new cn ON cn.name = c.name COLLATE NOCASE;

DROP TABLE char_snapshots;
ALTER TABLE char_snapshots_new RENAME TO char_snapshots;
DROP INDEX IF EXISTS idx_char_snapshots_char_ts_new;
CREATE INDEX idx_char_snapshots_char_ts ON char_snapshots(char_id, ts);

-- 6) Remap subscriptions: old character_id -> global character_id by name.
CREATE TABLE subscriptions_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id    INTEGER REFERENCES characters_new(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  threshold       TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  cooldown_until  INTEGER NOT NULL DEFAULT 0,
  last_fired_at   INTEGER,
  created_at      INTEGER NOT NULL,
  custom_message  TEXT
);
CREATE INDEX idx_subs_active_new ON subscriptions_new(active, character_id);
CREATE INDEX idx_subs_user_new   ON subscriptions_new(user_id);

INSERT INTO subscriptions_new (
  id, user_id, character_id, event_type, threshold, active,
  cooldown_until, last_fired_at, created_at, custom_message
)
SELECT
  s.id,
  s.user_id,
  CASE
    WHEN s.character_id IS NULL THEN NULL
    ELSE (SELECT cn.id
            FROM characters c
            JOIN characters_new cn ON cn.name = c.name COLLATE NOCASE
           WHERE c.id = s.character_id
           LIMIT 1)
  END AS character_id,
  s.event_type,
  s.threshold,
  s.active,
  s.cooldown_until,
  s.last_fired_at,
  s.created_at,
  s.custom_message
FROM subscriptions s;

DROP TABLE subscriptions;
ALTER TABLE subscriptions_new RENAME TO subscriptions;
DROP INDEX IF EXISTS idx_subs_active_new;
DROP INDEX IF EXISTS idx_subs_user_new;
CREATE INDEX idx_subs_active ON subscriptions(active, character_id);
CREATE INDEX idx_subs_user   ON subscriptions(user_id);

-- 7) Swap characters tables.
ALTER TABLE characters RENAME TO characters_old;
ALTER TABLE characters_new RENAME TO characters;

-- Recreate indexes under canonical names.
DROP INDEX IF EXISTS idx_characters_name;
DROP INDEX IF EXISTS idx_characters_due;
DROP INDEX IF EXISTS idx_characters_blocked;
DROP INDEX IF EXISTS idx_characters_new_name;
DROP INDEX IF EXISTS idx_characters_new_due;
DROP INDEX IF EXISTS idx_characters_new_blocked;
CREATE INDEX idx_characters_name ON characters(name);
CREATE INDEX idx_characters_due  ON characters(next_check_at);
CREATE INDEX idx_characters_blocked ON characters(blocked);

-- Keep old table for manual inspection; can be dropped later.
-- DROP TABLE characters_old;

