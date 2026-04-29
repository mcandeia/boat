-- Market: buy/sell/donate listings with comments + reactions, plus
-- "tenho interesse" pings that DM the listing owner via the bot.
--
-- Nicknames: required only when a user takes a Market action. We add
-- the column here; the API rejects market writes from users without one.

ALTER TABLE users ADD COLUMN nickname TEXT;
CREATE UNIQUE INDEX idx_users_nickname ON users(nickname COLLATE NOCASE) WHERE nickname IS NOT NULL;

CREATE TABLE listings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  char_id       INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  side          TEXT NOT NULL CHECK (side IN ('buy','sell','donate')),
  item_name     TEXT NOT NULL,
  item_attrs    TEXT,             -- JSON: refinement, option, skill, luck, ancient, extras
  currency      TEXT,             -- zeny | gold | cash | free
  price         INTEGER,
  notes         TEXT,
  allow_message INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'open',  -- open | held | closed
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_listings_user    ON listings(user_id);
CREATE INDEX idx_listings_status  ON listings(status, created_at DESC);
CREATE INDEX idx_listings_side    ON listings(side, created_at DESC);

CREATE TABLE listing_reactions (
  listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  PRIMARY KEY (listing_id, user_id, kind)
);
CREATE INDEX idx_listing_reactions_listing ON listing_reactions(listing_id);

CREATE TABLE listing_comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_listing_comments_listing ON listing_comments(listing_id, created_at);

-- One ping row per "tenho interesse" send. Used to rate-limit (1/hour per
-- buyer×listing pair) AND to keep an audit trail of who reached out.
CREATE TABLE listing_pings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id      INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_char_id   INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  message         TEXT,
  ts              INTEGER NOT NULL
);
CREATE INDEX idx_listing_pings_pair ON listing_pings(listing_id, buyer_user_id, ts);
