-- Map catalog item_slug -> shop detail URL (logged page).
CREATE TABLE item_sources (
  item_slug   TEXT PRIMARY KEY,     -- items.slug
  detail_url  TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_item_sources_updated ON item_sources(updated_at);

