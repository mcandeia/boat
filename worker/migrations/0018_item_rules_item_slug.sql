-- Add stable item_slug key so rules can be seeded from catalog reliably.
ALTER TABLE item_rules ADD COLUMN item_slug TEXT;
CREATE UNIQUE INDEX idx_item_rules_item_slug ON item_rules(item_slug) WHERE item_slug IS NOT NULL;

