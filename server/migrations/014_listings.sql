-- Oglasi: classifieds from private persons (used LEGO only), separate from the shops' offers.
ALTER TABLE users
  ADD COLUMN phone text,                                  -- needed to post an ad; shown to a buyer only on request
  ADD COLUMN msg_email_enabled boolean NOT NULL DEFAULT true;  -- e-mail when someone sends a message

CREATE TABLE listings (
  id            bigserial PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  set_num       text,                                     -- not a foreign key: any LEGO set, also ones we don't track
  theme_slug    text,
  theme_name    text,
  year          smallint,
  pieces        integer,
  minifigs      smallint,
  condition     text NOT NULL CHECK (condition IN ('like_new', 'used_complete', 'used_incomplete', 'parts')),
  has_box       boolean NOT NULL DEFAULT false,
  has_manual    boolean NOT NULL DEFAULT false,
  price_rsd     integer NOT NULL CHECK (price_rsd > 0),
  negotiable    boolean NOT NULL DEFAULT false,
  city          text NOT NULL,
  shipping      text NOT NULL DEFAULT 'pickup' CHECK (shipping IN ('pickup', 'ships')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'sold', 'expired', 'removed')),
  removed_reason text,                                    -- set by a moderator
  views         integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX listings_active ON listings (created_at DESC) WHERE status = 'active';
CREATE INDEX listings_user ON listings (user_id);
CREATE INDEX listings_expiry ON listings (expires_at) WHERE status = 'active';

-- pictures are uploaded first (listing_id null), then attached when the ad is saved
CREATE TABLE listing_images (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  bigint REFERENCES listings(id) ON DELETE CASCADE,
  position    smallint NOT NULL DEFAULT 0,
  file        text NOT NULL UNIQUE,                       -- name of the JPEG in LISTINGS_DIR
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_images_listing ON listing_images (listing_id, position);

CREATE TABLE listing_prices (
  id          bigserial PRIMARY KEY,
  listing_id  bigint NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price_rsd   integer NOT NULL,                           -- the price that was replaced
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_prices_listing ON listing_prices (listing_id, changed_at);

-- followed ads: seen_price / seen_status are what the user was last shown, so we can tell what changed
CREATE TABLE listing_watches (
  user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id   bigint NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  seen_price   integer NOT NULL,
  seen_status  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE conversations (
  id               bigserial PRIMARY KEY,
  listing_id       bigint NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id         bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id        bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_message_at  timestamptz NOT NULL DEFAULT now(),
  buyer_mailed_at  timestamptz,                           -- last "you have a message" e-mail (at most one per 15 min)
  seller_mailed_at timestamptz,
  UNIQUE (listing_id, buyer_id),
  CHECK (buyer_id <> seller_id)
);
CREATE INDEX conversations_buyer ON conversations (buyer_id, last_message_at DESC);
CREATE INDEX conversations_seller ON conversations (seller_id, last_message_at DESC);

CREATE TABLE messages (
  id               bigserial PRIMARY KEY,
  conversation_id  bigint NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  read_at          timestamptz
);
CREATE INDEX messages_conv ON messages (conversation_id, id);
CREATE INDEX messages_unread ON messages (conversation_id) WHERE read_at IS NULL;

CREATE TABLE listing_reports (
  id               bigserial PRIMARY KEY,
  reporter_id      bigint REFERENCES users(id) ON DELETE SET NULL,
  listing_id       bigint REFERENCES listings(id) ON DELETE CASCADE,
  conversation_id  bigint REFERENCES conversations(id) ON DELETE CASCADE,
  reason           text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  CHECK (listing_id IS NOT NULL OR conversation_id IS NOT NULL)
);
CREATE INDEX listing_reports_open ON listing_reports (created_at) WHERE resolved_at IS NULL;
