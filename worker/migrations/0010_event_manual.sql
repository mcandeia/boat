-- Admin override flag: when manual=1, the scraper won't replace this row's
-- schedule on its next run, and the prune step won't delete it. Used when
-- the published mupatos.net schedule is wrong and an admin fixes it by hand.
ALTER TABLE server_events ADD COLUMN manual INTEGER NOT NULL DEFAULT 0;
