-- Shop promotions (gift with purchase, spend thresholds, online-only, multi-set discounts).
-- The crawler only proposes them ('pending'); an admin approves before anyone else sees one.
CREATE TABLE promos (
  id             serial PRIMARY KEY,
  shop_id        text NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('gift', 'sale', 'online_only', 'multi_buy', 'code', 'other')),
  title          text NOT NULL,
  details        text NOT NULL DEFAULT '',
  min_basket_rsd integer,
  discount_pct   integer,
  -- empty = every set; otherwise theme slugs the promotion is limited to
  themes         text[] NOT NULL DEFAULT '{}',
  valid_from     date,
  valid_until    date,
  source_url     text NOT NULL,
  source         text NOT NULL DEFAULT 'crawler' CHECK (source IN ('crawler', 'manual')),
  -- hash of the text the crawler read: a change on an approved promotion sends it back for review
  fingerprint    text,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  changed        boolean NOT NULL DEFAULT false,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz,
  reviewed_by    integer REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX promos_key ON promos (shop_id, source_url, kind, lower(title));
CREATE INDEX promos_status ON promos (status, valid_until);
