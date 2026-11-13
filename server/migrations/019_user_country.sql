-- Where an account signs in from: only the two-letter country code, never the IP address
ALTER TABLE users ADD COLUMN country char(2);
ALTER TABLE users ADD COLUMN country_at timestamptz;
