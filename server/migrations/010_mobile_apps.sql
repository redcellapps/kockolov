-- The Android and iOS apps.
-- Phone notifications through Firebase Cloud Messaging: the app registers a token instead of a browser
-- subscription. endpoint holds the browser's push address (kind 'web') or the FCM token (kind 'fcm').
ALTER TABLE push_subscriptions
  ADD COLUMN kind text NOT NULL DEFAULT 'web',
  ADD COLUMN platform text,
  ALTER COLUMN p256dh DROP NOT NULL,
  ALTER COLUMN auth DROP NOT NULL;

-- Barcode (EAN) printed on the box, so the app can open a set by scanning it.
-- Filled from the LEGO Store's product pages a few hundred at a time; ean_checked_at avoids asking twice.
ALTER TABLE offers
  ADD COLUMN ean text,
  ADD COLUMN ean_checked_at timestamptz;
CREATE INDEX offers_ean ON offers (ean) WHERE ean IS NOT NULL;
