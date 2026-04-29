-- Item catalog scraped from mupatos.com.br/site/shop/shop-gold.
-- Used for autocomplete + image previews in the Mercado listing form.
-- Free-form item names still allowed; the catalog is just a helper.

CREATE TABLE items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,           -- "adamantine-mask"
  name        TEXT NOT NULL,                  -- "Adamantine Mask"
  category    TEXT,                           -- "sets-helms"
  image_url   TEXT,                           -- absolute URL on mupatos.com.br
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_items_name     ON items(name COLLATE NOCASE);
CREATE INDEX idx_items_category ON items(category);

-- Cache the item the listing references — non-FK so listings survive a
-- catalog refresh that reshuffles ids.
ALTER TABLE listings ADD COLUMN item_slug TEXT;
ALTER TABLE listings ADD COLUMN item_image_url TEXT;
CREATE INDEX idx_listings_item_slug ON listings(item_slug);
