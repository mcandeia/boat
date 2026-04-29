-- Marketplace offers: buyers can send offers to a listing owner.
-- Seller can accept/reject; pending offers expire after 1 hour.

CREATE TABLE listing_offers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id     INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  seller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bidder_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bidder_char_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  currency       TEXT,      -- zeny | gold | cash | free | null
  price          INTEGER,   -- optional numeric offer
  message        TEXT,      -- optional free text from bidder
  status         TEXT NOT NULL DEFAULT 'pending', -- pending|accepted|rejected|expired
  expires_at     INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  decided_at     INTEGER
);

CREATE INDEX idx_listing_offers_listing ON listing_offers(listing_id, created_at DESC);
CREATE INDEX idx_listing_offers_seller_status ON listing_offers(seller_user_id, status, expires_at DESC);
CREATE INDEX idx_listing_offers_bidder ON listing_offers(bidder_user_id, created_at DESC);
CREATE INDEX idx_listing_offers_pending_exp ON listing_offers(status, expires_at);

