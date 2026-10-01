-- Invitations: an admin adds someone, they get an e-mail link and set their own password.
-- The same links double as "set a new password" links for existing accounts.

ALTER TABLE users ADD COLUMN accepted_at timestamptz;
-- accounts that have already logged in count as accepted; never-used ones wait for an invite
UPDATE users SET accepted_at = last_login_at;

CREATE TABLE user_tokens (
  token_hash  text PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('invite', 'reset')),
  created_by  bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX user_tokens_user ON user_tokens (user_id);
