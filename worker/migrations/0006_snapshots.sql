-- Per-tick character snapshots so we can plot evolution over time
-- (level by reset cycle, time spent in each map, etc.). Cron only inserts
-- a row when something visible changes (level, resets, map, or status)
-- so an idle char doesn't bloat the table.
CREATE TABLE char_snapshots (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  ts      INTEGER NOT NULL,
  level   INTEGER,
  resets  INTEGER,
  map     TEXT,
  status  TEXT
);
CREATE INDEX idx_char_snapshots_char_ts ON char_snapshots(char_id, ts);
