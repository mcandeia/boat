-- Global next-target ranking — currently `next_target_*` only stores the
-- char one slot above on the *per-class* leaderboard. Add a parallel pair
-- for the overall (cross-class) leaderboard so the dashboard can show both.

ALTER TABLE characters ADD COLUMN global_next_target_name   TEXT;
ALTER TABLE characters ADD COLUMN global_next_target_resets INTEGER;
