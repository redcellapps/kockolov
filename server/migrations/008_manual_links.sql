-- The admin's table of all offers.
-- manual_at / manual_by: who linked an offer to a set by hand, and when, so a wrong number typed
-- yesterday is easy to find and fix.
-- sku / sku_guess: the shop's product code and the number guessed from its picture, kept so an
-- offer can be linked automatically again right away (not only at the next crawl).
ALTER TABLE offers
  ADD COLUMN manual_at timestamptz,
  ADD COLUMN manual_by bigint REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN sku text,
  ADD COLUMN sku_guess text;
