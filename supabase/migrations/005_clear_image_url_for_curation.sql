-- Migration: Clear image_url column for manual curation
-- This sets image_url to NULL for all spreads so users can manually select their preferred image
-- The workflow now only populates image_url_1 through image_url_4

UPDATE grahams_devotional_spreads
SET image_url = NULL
WHERE image_url IS NOT NULL;

COMMENT ON COLUMN grahams_devotional_spreads.image_url IS 'User-selected primary image URL. NULL until manually selected via web app.';
