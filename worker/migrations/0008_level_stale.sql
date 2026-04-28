-- "Sem progresso (idle)" event support: track when each char's level last
-- changed so we can fire alerts after N minutes of no level gain (char
-- AFK / dead / disconnected). Backfill to last_checked_at so existing
-- chars don't immediately false-positive after the migration.
ALTER TABLE characters ADD COLUMN last_level_change_at INTEGER;
UPDATE characters SET last_level_change_at = COALESCE(last_checked_at, created_at);
