-- Offers the admin keeps off the site and out of the review list (not LEGO sets, used items…).
-- offers.match_method: 'hidden' = hidden one by one by the admin (stays hidden on every crawl),
-- 'hidden_rule' = hidden by a phrase rule below (checked again on every crawl).
CREATE TABLE hide_rules (
  id          bigserial PRIMARY KEY,
  phrase      text NOT NULL,                                   -- normalized: lowercase, no diacritics
  shop_id     text REFERENCES shops(id) ON DELETE CASCADE,     -- NULL = every shop
  created_by  bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hide_rules_phrase_shop ON hide_rules (phrase, coalesce(shop_id, ''));
