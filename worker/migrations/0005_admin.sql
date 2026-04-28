-- Admin tooling.
--
-- 1) characters.blocked: skip in cron, marks the char untouchable. Replaces
--    the old hardcoded Xibata denylist with a dynamic, admin-managed list.
-- 2) users.admin: flag for admin-only routes + the Admin tab in the UI.
--    Seeded for Marcos (id=1) and Juan (id=2) — adjust manually if user
--    ids ever shift.
ALTER TABLE characters ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_characters_blocked ON characters(blocked);

ALTER TABLE users ADD COLUMN admin INTEGER NOT NULL DEFAULT 0;
UPDATE users SET admin = 1 WHERE id IN (1, 2);
