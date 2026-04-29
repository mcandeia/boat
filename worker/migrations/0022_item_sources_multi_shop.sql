-- Store one shop detail URL per (item, shop) so backfill can try all shops.
-- Previous schema used item_slug as PRIMARY KEY (single source), which caused
-- whichever shop scraped last to overwrite the URL.

PRAGMA foreign_keys=off;

CREATE TABLE IF NOT EXISTS item_sources_new (
  item_slug   TEXT NOT NULL,     -- items.slug
  shop        TEXT NOT NULL,     -- e.g. "shop-gold", "rarius", "rings-pendants"
  category    TEXT NOT NULL,     -- e.g. "sets-armors"
  detail_url  TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (item_slug, shop)
);

CREATE INDEX IF NOT EXISTS idx_item_sources_new_updated ON item_sources_new(updated_at);

-- Best-effort migrate existing single-source rows.
-- We keep the URL and mark shop/category as unknown; the next catalog refresh
-- will repopulate proper rows for all shops.
INSERT INTO item_sources_new (item_slug, shop, category, detail_url, updated_at)
SELECT item_slug, 'unknown' AS shop, '' AS category, detail_url, updated_at
  FROM item_sources;

DROP TABLE item_sources;
ALTER TABLE item_sources_new RENAME TO item_sources;

DROP INDEX IF EXISTS idx_item_sources_updated;
CREATE INDEX IF NOT EXISTS idx_item_sources_updated ON item_sources(updated_at);

PRAGMA foreign_keys=on;

