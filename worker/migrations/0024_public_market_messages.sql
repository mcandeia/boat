-- Public (anonymous) Mercado actions coming from /s/:id share pages.
-- We store a minimal audit trail + rate-limit keys (per IP hash).

CREATE TABLE IF NOT EXISTS listing_public_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('ping','offer')),
  ip_hash     TEXT NOT NULL,
  name        TEXT,
  currency    TEXT,
  price       INTEGER,
  message     TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_public_msg_listing ON listing_public_messages(listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_msg_rl ON listing_public_messages(listing_id, kind, ip_hash, created_at DESC);

