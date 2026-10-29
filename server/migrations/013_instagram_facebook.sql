-- Instagram through Facebook login: the account is reached through the Facebook Page it is linked to
-- (graph.facebook.com, a Page token that doesn't expire), for Meta accounts that aren't offered
-- "API setup with Instagram login"
ALTER TABLE instagram_account
  ADD COLUMN api text NOT NULL DEFAULT 'instagram' CHECK (api IN ('instagram', 'facebook')),
  ADD COLUMN page_name text NOT NULL DEFAULT '';
