-- Custom item rules (99z + custom): deterministic allowed attributes per item.
-- This table is seeded/imported from the server's own item data.

CREATE TABLE item_rules (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT NOT NULL,                 -- normalized key (lowercase)
  name           TEXT NOT NULL,
  kind           TEXT,                          -- weapon|armor|shield|etc (optional)
  allow_excellent INTEGER NOT NULL DEFAULT 1,
  allow_luck      INTEGER NOT NULL DEFAULT 1,
  allow_skill     INTEGER NOT NULL DEFAULT 1,
  allow_life      INTEGER NOT NULL DEFAULT 1,
  allow_harmony   INTEGER NOT NULL DEFAULT 0,
  life_values     TEXT,                         -- JSON array of ints
  harmony_values  TEXT,                         -- JSON array of strings
  updated_at      INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_item_rules_slug ON item_rules(slug);

