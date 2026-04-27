-- Adaptive polling: only scrape characters whose `next_check_at` has passed.
-- Online chars are checked every ~10 minutes; offline chars roll forward 1h
-- so we don't burn Browser Rendering quota on chars who aren't logging in.
ALTER TABLE characters ADD COLUMN next_check_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_characters_due ON characters(next_check_at);
