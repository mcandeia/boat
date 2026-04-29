-- Ancient set definitions: name -> attribute lines (JSON array).
CREATE TABLE ancient_sets (
  name       TEXT PRIMARY KEY,
  attrs      TEXT,              -- JSON array of strings
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_ancient_sets_updated ON ancient_sets(updated_at);

