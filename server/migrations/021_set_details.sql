-- The set's description from the LEGO Store (Serbian product text), shown on the set page and to
-- search engines; pieces and age_min are filled from it when no shop gave them.
ALTER TABLE sets ADD COLUMN IF NOT EXISTS description text;
