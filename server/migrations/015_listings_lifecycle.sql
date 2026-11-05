-- Oglasi lifecycle: reminders before an ad expires, expired ads are kept for 30 days and then deleted,
-- conversations outlive the ad they were about.
ALTER TABLE listings ADD COLUMN expired_at timestamptz;                       -- when the ad ran out (deleted 30 days later unless renewed)
ALTER TABLE listings ADD COLUMN notified_stage smallint NOT NULL DEFAULT 0;   -- reminder e-mails sent for this run: 1 = 7 days, 2 = 3 days, 3 = 1 day before
UPDATE listings SET expired_at = updated_at WHERE status = 'expired';
CREATE INDEX listings_expired ON listings (expired_at) WHERE status = 'expired';

-- messages are never deleted on a timer: the conversation stays when its ad is deleted
ALTER TABLE conversations ADD COLUMN listing_title text;
UPDATE conversations c SET listing_title = l.title FROM listings l WHERE l.id = c.listing_id;
ALTER TABLE conversations ALTER COLUMN listing_id DROP NOT NULL;
ALTER TABLE conversations DROP CONSTRAINT conversations_listing_id_fkey;
ALTER TABLE conversations ADD CONSTRAINT conversations_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
