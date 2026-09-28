-- Kockolov: initial schema
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Prodavnice (shops). Marketplaces (Ananas) carry many sellers per shop.
CREATE TABLE shops (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  url         text NOT NULL,
  kind        text NOT NULL DEFAULT 'shop' CHECK (kind IN ('official', 'shop', 'marketplace')),
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Canonical LEGO themes (Harry Potter, Marvel, City...)
CREATE TABLE themes (
  slug        text PRIMARY KEY,
  name        text NOT NULL,
  sort_order  int NOT NULL DEFAULT 100
);

-- One row per LEGO set (keyed by official set number, e.g. 75192)
CREATE TABLE sets (
  set_num      text PRIMARY KEY,
  name         text NOT NULL,
  name_en      text,
  theme_slug   text REFERENCES themes(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  theme_locked boolean NOT NULL DEFAULT false,
  year         int,
  pieces       int,
  age_min      numeric(3,1),
  image_url    text,
  rrp_rsd      int,              -- price at the official LEGO Store Srbija (reference price)
  search_text  text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sets_search_trgm ON sets USING gin (search_text gin_trgm_ops);
CREATE INDEX sets_theme ON sets (theme_slug);

-- One row per listing in a shop (per seller on marketplaces)
CREATE TABLE offers (
  id                 bigserial PRIMARY KEY,
  shop_id            text NOT NULL REFERENCES shops(id),
  external_id        text NOT NULL,
  seller             text NOT NULL DEFAULT '',
  set_num            text REFERENCES sets(set_num) ON DELETE SET NULL,
  match_method       text,        -- sku | title | name | manual
  title              text NOT NULL,
  url                text NOT NULL,
  image_url          text,
  price_rsd          int NOT NULL,
  regular_price_rsd  int,         -- shop's "old" price when on sale
  in_stock           boolean NOT NULL,
  stock_qty          int,
  theme_raw          text[] NOT NULL DEFAULT '{}',
  age_min            numeric(3,1),
  active             boolean NOT NULL DEFAULT true,
  first_seen         timestamptz NOT NULL DEFAULT now(),
  last_seen          timestamptz NOT NULL DEFAULT now(),
  price_changed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, external_id)
);
CREATE INDEX offers_set ON offers (set_num);
CREATE INDEX offers_unmatched ON offers (shop_id) WHERE set_num IS NULL AND active;

-- Append-only log; a row is written only when price / stock changes
CREATE TABLE price_history (
  id                 bigserial PRIMARY KEY,
  offer_id           bigint NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  price_rsd          int NOT NULL,
  regular_price_rsd  int,
  in_stock           boolean NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_history_offer ON price_history (offer_id, recorded_at);

CREATE TABLE crawl_runs (
  id             bigserial PRIMARY KEY,
  shop_id        text NOT NULL REFERENCES shops(id),
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed', 'suspicious')),
  pages          int NOT NULL DEFAULT 0,
  items          int NOT NULL DEFAULT 0,
  matched        int NOT NULL DEFAULT 0,
  new_items      int NOT NULL DEFAULT 0,
  price_changes  int NOT NULL DEFAULT 0,
  deactivated    int NOT NULL DEFAULT 0,
  error          text
);
CREATE INDEX crawl_runs_shop ON crawl_runs (shop_id, started_at DESC);

-- Daily "best buy" list
CREATE TABLE deals (
  day                  date NOT NULL,
  set_num              text NOT NULL REFERENCES sets(set_num) ON DELETE CASCADE,
  rank                 int NOT NULL,
  score                numeric(6,2) NOT NULL,
  best_offer_id        bigint REFERENCES offers(id) ON DELETE SET NULL,
  best_price_rsd       int NOT NULL,
  reference_price_rsd  int,
  reasons              jsonb NOT NULL DEFAULT '[]',
  PRIMARY KEY (day, set_num)
);
CREATE INDEX deals_day_rank ON deals (day DESC, rank);

CREATE TABLE users (
  id              bigserial PRIMARY KEY,
  email           text NOT NULL UNIQUE,
  name            text NOT NULL DEFAULT '',
  password_hash   text NOT NULL,
  role            text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  digest_enabled  boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_login_at   timestamptz
);

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE watchlist (
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_num     text NOT NULL REFERENCES sets(set_num) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, set_num)
);

CREATE TABLE digest_log (
  id        bigserial PRIMARY KEY,
  user_id   bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day       date NOT NULL,
  sent_at   timestamptz NOT NULL DEFAULT now(),
  status    text NOT NULL,
  error     text,
  UNIQUE (user_id, day)
);
