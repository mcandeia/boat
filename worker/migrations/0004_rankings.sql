-- Resets-ranking columns. Filled by the cron from
-- https://mupatos.com.br/site/rankings/resets and the per-class variants
-- (?class=mg|fe|dk|dw|dl). All nullable because a character may not be in
-- the top 99 of either ranking.
ALTER TABLE characters ADD COLUMN rank_overall       INTEGER;
ALTER TABLE characters ADD COLUMN rank_class         INTEGER;
ALTER TABLE characters ADD COLUMN class_code         TEXT;     -- mg|fe|dk|dw|dl
ALTER TABLE characters ADD COLUMN next_target_name   TEXT;     -- char one rank above in class
ALTER TABLE characters ADD COLUMN next_target_resets INTEGER;
