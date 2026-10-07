-- Push notifications on phones and computers (the installed site, or a browser that allows them).
-- One row per device that said yes; the browser's push service gives us the endpoint and the keys.
CREATE TABLE push_subscriptions (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_ok_at  timestamptz,
  failures    int NOT NULL DEFAULT 0
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

-- Secrets the server makes for itself once (the push key pair), shared by the web app and the worker
CREATE TABLE app_secrets (
  name        text PRIMARY KEY,
  value       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- What the watcher was last told about the set: the next alert compares with this.
-- seen_price is the last in-stock best price; NULL seen_in_stock = not looked at yet.
ALTER TABLE watchlist
  ADD COLUMN seen_price int,
  ADD COLUMN seen_in_stock boolean;
