-- Smart TV sign-in without typing a password: the TV shows a short code (and a QR link), the user
-- confirms it on kockolov.rs while signed in, and the TV picks up a long-lived session token.
CREATE TABLE tv_pairings (
  code          text PRIMARY KEY,            -- 6 characters shown on the TV (no 0/O/1/I)
  secret_hash   text NOT NULL UNIQUE,        -- sha256 of the secret only the TV knows; polling needs it, so a seen code can't be hijacked
  platform      text,                        -- 'tizen' | 'webos' | 'browser'
  device_name   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  user_id       bigint REFERENCES users(id) ON DELETE CASCADE,
  confirmed_at  timestamptz,
  claimed_at    timestamptz                  -- the TV has taken its token; the row only waits for cleanup
);
CREATE INDEX tv_pairings_expires ON tv_pairings (expires_at);

-- Sessions get an id and a kind so the account page can list "Televizor" devices and remove them.
ALTER TABLE sessions
  ADD COLUMN id bigserial,
  ADD COLUMN kind text NOT NULL DEFAULT 'web',   -- 'web' | 'app' | 'tv'
  ADD COLUMN device_name text,
  ADD COLUMN last_used_at timestamptz;
CREATE UNIQUE INDEX sessions_id ON sessions (id);
