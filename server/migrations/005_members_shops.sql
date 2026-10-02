-- Shops whose prices only signed-in users see, and a separate best-buy list for them
ALTER TABLE shops ADD COLUMN members_only boolean NOT NULL DEFAULT false;

-- Offers everyone may see (anonymous visitors, search engines, link previews)
CREATE VIEW public_offers AS
  SELECT o.* FROM offers o JOIN shops sh ON sh.id = o.shop_id WHERE NOT sh.members_only;

-- "public" is computed from public shops only, "members" from every shop
ALTER TABLE deals ADD COLUMN audience text NOT NULL DEFAULT 'public' CHECK (audience IN ('public', 'members'));
ALTER TABLE deals DROP CONSTRAINT deals_pkey;
ALTER TABLE deals ADD PRIMARY KEY (day, audience, set_num);
DROP INDEX IF EXISTS deals_day_rank;
CREATE INDEX deals_day_rank ON deals (day DESC, audience, rank);
