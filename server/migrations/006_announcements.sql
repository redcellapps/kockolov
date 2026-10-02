-- News e-mails the admin sends to every user ("what's new on Kockolov")

-- users can turn news off (account settings or the link in every news e-mail)
ALTER TABLE users ADD COLUMN news_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE announcements (
  id          bigserial PRIMARY KEY,
  subject     text NOT NULL,
  body        text NOT NULL,
  created_by  bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent')),
  finished_at timestamptz
);

-- one row per recipient, written when the admin presses send; sending works through the rows
-- that have neither sent_at nor error, so it can resume after a restart without sending twice
CREATE TABLE announcement_deliveries (
  announcement_id bigint NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at         timestamptz,
  error           text,
  PRIMARY KEY (announcement_id, user_id)
);
CREATE INDEX announcement_deliveries_pending ON announcement_deliveries (announcement_id) WHERE sent_at IS NULL AND error IS NULL;
