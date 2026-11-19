-- 19 Nov 2026: every shop's prices are public. Visitors, search engines and link previews see all
-- shops, not only LEGO Store, Kockarium and Ananas; an account is for the watchlist, notifications,
-- the morning e-mail and the classifieds. The members_only column and the public_offers view stay, so a
-- shop could be made members-only again by setting membersOnly in its adapter.
UPDATE shops SET members_only = false WHERE members_only;
