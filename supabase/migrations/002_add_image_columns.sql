-- ============================================================================
-- Migration 002: Add multiple image URL columns
-- For storing 3 unique artistic variations per spread
-- ============================================================================

-- Add 3 new image URL columns
ALTER TABLE public.grahams_devotional_spreads
ADD COLUMN IF NOT EXISTS image_url_1 TEXT,
ADD COLUMN IF NOT EXISTS image_url_2 TEXT,
ADD COLUMN IF NOT EXISTS image_url_3 TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.grahams_devotional_spreads.image_url_1 IS 'First artistic variation URL';
COMMENT ON COLUMN public.grahams_devotional_spreads.image_url_2 IS 'Second artistic variation URL';
COMMENT ON COLUMN public.grahams_devotional_spreads.image_url_3 IS 'Third artistic variation URL';

-- Keep existing image_url column for backwards compatibility (can store selected image)
COMMENT ON COLUMN public.grahams_devotional_spreads.image_url IS 'Selected/primary image URL (legacy or user-selected)';

-- ============================================================================
-- Update v_completed_spreads view to include new columns
-- ============================================================================

CREATE OR REPLACE VIEW public.v_completed_spreads AS
SELECT 
    spread_code,
    testament,
    book,
    start_chapter,
    start_verse,
    end_chapter,
    end_verse,
    title,
    kjv_passage_ref,
    kjv_key_verse_ref,
    kjv_key_verse_text,
    paraphrase_text,
    image_url,
    image_url_1,
    image_url_2,
    image_url_3,
    updated_at
FROM public.grahams_devotional_spreads
WHERE status_outline = 'done'
  AND status_scripture = 'done'
  AND status_text = 'done'
  AND status_image = 'done'
ORDER BY 
    CASE testament WHEN 'OT' THEN 1 ELSE 2 END,
    book,
    start_chapter,
    start_verse;
