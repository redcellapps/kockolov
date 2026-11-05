-- Welcome e-mail, sent once, 10 minutes after the account is confirmed (e-mail link, invitation or Google).
-- Everyone who already has a confirmed account is marked as done, so only new sign-ups get it.
ALTER TABLE users ADD COLUMN welcome_sent_at timestamptz;
ALTER TABLE users ADD COLUMN welcome_tries smallint NOT NULL DEFAULT 0;
UPDATE users SET welcome_sent_at = now() WHERE accepted_at IS NOT NULL;
