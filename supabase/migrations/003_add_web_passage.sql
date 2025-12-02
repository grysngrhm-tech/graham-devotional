-- ============================================================================
-- Migration 003: Add WEB (World English Bible) passage text column
-- For providing modern English context to AI summary generation
-- ============================================================================

-- Add WEB passage text column
ALTER TABLE public.grahams_devotional_spreads
ADD COLUMN IF NOT EXISTS web_passage_text TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.grahams_devotional_spreads.web_passage_text IS 'World English Bible passage text (modern English translation for AI context)';

-- ============================================================================
-- Update v_completed_spreads view to include new column
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
    web_passage_text,
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
