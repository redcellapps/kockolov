-- Admin can suspend an account: it can't sign in or use an existing session until it is restored
ALTER TABLE users ADD COLUMN suspended_at timestamptz;
