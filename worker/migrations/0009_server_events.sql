-- Server-wide event + invasion schedules scraped from
--   https://www.mupatos.net/eventos
--   https://www.mupatos.net/invasoes
--
-- One row per (category, name, room). Free + VIP have separate schedules.
-- Castle Siege and other weekly entries put their cadence in `meta`.
CREATE TABLE server_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category    TEXT NOT NULL,                  -- "event" | "invasion"
  name        TEXT NOT NULL,                  -- "Devil Square", "Red Dragon", ...
  room        TEXT NOT NULL,                  -- "free" | "vip" | "special"
  schedule    TEXT NOT NULL DEFAULT '',       -- "13:30,19:30,21:30" comma-separated HH:MM (BR local)
  meta        TEXT,                           -- "Domingo" / freeform note
  updated_at  INTEGER NOT NULL,
  UNIQUE(category, name, room)
);
CREATE INDEX idx_server_events_room ON server_events(room);
