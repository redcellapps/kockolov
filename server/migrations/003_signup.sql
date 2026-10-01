-- Self sign-up: e-mail confirmation links, one-click unsubscribe, cleanup of unconfirmed sign-ups
ALTER TABLE user_tokens DROP CONSTRAINT IF EXISTS user_tokens_kind_check;
ALTER TABLE user_tokens ADD CONSTRAINT user_tokens_kind_check CHECK (kind IN ('invite', 'reset', 'verify'));

-- true for accounts people opened themselves (unconfirmed ones are removed after 30 days)
ALTER TABLE users ADD COLUMN self_signup boolean NOT NULL DEFAULT false;

-- secret per user for the unsubscribe link in the morning e-mail
ALTER TABLE users ADD COLUMN unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX users_unsubscribe_token ON users (unsubscribe_token);
