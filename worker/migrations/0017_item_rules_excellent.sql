-- Store per-item Excellent option labels (read-only).
ALTER TABLE item_rules ADD COLUMN excellent_values TEXT; -- JSON array of strings

