-- Mercado: a listing can describe an item OR a character. Char listings
-- are pure free-form (no catalog, no refinement/option/etc).
ALTER TABLE listings ADD COLUMN kind TEXT NOT NULL DEFAULT 'item';
CREATE INDEX idx_listings_kind ON listings(kind);
