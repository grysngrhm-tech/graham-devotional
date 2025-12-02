-- Migration 004: Add image_url_4 Column
-- Adds support for 4 candidate images per spread (previously 3)

ALTER TABLE grahams_devotional_spreads
ADD COLUMN IF NOT EXISTS image_url_4 TEXT;

COMMENT ON COLUMN grahams_devotional_spreads.image_url_4 IS 'Fourth candidate image URL for 2x2 grid display';
