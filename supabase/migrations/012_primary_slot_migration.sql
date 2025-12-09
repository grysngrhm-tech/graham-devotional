-- Migration: Replace image_url (URL) with primary_slot (integer 1-4)
-- This aligns the global default with the user selection pattern
-- Run this in Supabase SQL Editor

-- Step 1: Add new column with default
ALTER TABLE grahams_devotional_spreads 
ADD COLUMN IF NOT EXISTS primary_slot INTEGER DEFAULT 1;

-- Step 2: Migrate existing data
-- Match image_url to the corresponding slot, or default to 1
UPDATE grahams_devotional_spreads SET primary_slot = 
  CASE 
    WHEN image_url IS NOT NULL AND image_url = image_url_1 THEN 1
    WHEN image_url IS NOT NULL AND image_url = image_url_2 THEN 2
    WHEN image_url IS NOT NULL AND image_url = image_url_3 THEN 3
    WHEN image_url IS NOT NULL AND image_url = image_url_4 THEN 4
    ELSE 1  -- Default to slot 1
  END;

-- Step 3: Add constraint to ensure valid slot values
ALTER TABLE grahams_devotional_spreads 
ADD CONSTRAINT primary_slot_range CHECK (primary_slot >= 1 AND primary_slot <= 4);

-- Verify migration results
SELECT 
  COUNT(*) as total_stories,
  COUNT(CASE WHEN primary_slot = 1 THEN 1 END) as slot_1_default,
  COUNT(CASE WHEN primary_slot = 2 THEN 1 END) as slot_2_default,
  COUNT(CASE WHEN primary_slot = 3 THEN 1 END) as slot_3_default,
  COUNT(CASE WHEN primary_slot = 4 THEN 1 END) as slot_4_default
FROM grahams_devotional_spreads;

-- NOTE: Run this AFTER verifying app works with new model:
-- ALTER TABLE grahams_devotional_spreads DROP COLUMN image_url;

