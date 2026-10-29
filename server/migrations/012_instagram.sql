-- Instagram "set dana": every morning one post about a popular set (a 1080×1350 picture and a caption).
-- The worker publishes it when an Instagram account is connected; otherwise it waits in the admin
-- page, ready to post by hand.

CREATE TABLE instagram_posts (
  id            bigserial PRIMARY KEY,
  day           date NOT NULL,
  set_num       text NOT NULL REFERENCES sets(set_num) ON DELETE CASCADE,
  -- what the picture shows, frozen when the post is made (the picture and caption always agree)
  card          jsonb NOT NULL,
  caption       text NOT NULL,
  -- skipped: the admin asked for another set that day; posted_by_hand: posted from the phone
  status        text NOT NULL DEFAULT 'ready'
                CHECK (status IN ('ready', 'publishing', 'published', 'posted_by_hand', 'failed', 'skipped')),
  media_id      text,
  permalink     text,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);
CREATE INDEX instagram_posts_day ON instagram_posts (day DESC, id DESC);
CREATE INDEX instagram_posts_set ON instagram_posts (set_num, day DESC);

-- The connected account (at most one): a long-lived token pasted on the admin page, which the
-- worker renews every week (it lasts 60 days)
CREATE TABLE instagram_account (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token         text NOT NULL,
  user_id       text NOT NULL,
  username      text NOT NULL DEFAULT '',
  refreshed_at  timestamptz NOT NULL DEFAULT now(),
  paused        boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
