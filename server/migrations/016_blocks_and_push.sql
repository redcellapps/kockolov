-- App 1.2: blocking other users (Google Play asks for it in apps with user content and messages),
-- notification choices per kind, and what followers / set watchers were already told about ads.

-- "Blokiraj": the blocked person can't write to the blocker, and the blocker no longer sees their ads.
-- The blocked person is never told; id is what the account page uses to unblock.
CREATE TABLE user_blocks (
  id          bigserial UNIQUE,
  blocker_id  bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX user_blocks_blocked ON user_blocks (blocked_id);

-- which notifications the person wants on their phone: {"messages": false, ...}; a missing key means yes
-- (kinds: prices, messages, watched_ads, my_ads, new_ads)
ALTER TABLE users ADD COLUMN push_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- the lowest price of a followed ad a notification already went out for (null = none yet)
ALTER TABLE listing_watches ADD COLUMN pushed_price integer;

-- people watching the ad's set were told about it (once per ad); ads posted before this version are not announced
ALTER TABLE listings ADD COLUMN set_alerted boolean NOT NULL DEFAULT false;
UPDATE listings SET set_alerted = true;
