-- ============================================================================
-- THE GRAHAMS' DEVOTIONAL - Database Schema
-- Migration 001: Create devotional spreads table and storage
-- ============================================================================

-- Create the main table for devotional spreads
CREATE TABLE IF NOT EXISTS public.grahams_devotional_spreads (
    -- Primary identifiers
    id                      SERIAL PRIMARY KEY,
    spread_code             TEXT UNIQUE NOT NULL,      -- e.g., "GEN-001"
    testament               TEXT NOT NULL,              -- "OT" or "NT"
    book                    TEXT NOT NULL,              -- e.g., "Genesis"
    
    -- Verse range
    start_chapter           INT NOT NULL,
    start_verse             INT NOT NULL,
    end_chapter             INT NOT NULL,
    end_verse               INT NOT NULL,
    
    -- Spread title
    title                   TEXT,
    
    -- KJV Scripture (primary - used in final output)
    kjv_passage_ref         TEXT,                       -- e.g., "Genesis 1:1-31"
    kjv_passage_text        TEXT,                       -- Full KJV passage text
    kjv_key_verse_ref       TEXT,                       -- e.g., "Genesis 1:1"
    kjv_key_verse_text      TEXT,                       -- Key verse in KJV
    
    -- NIV Scripture (internal context only - not for output)
    niv_passage_ref         TEXT,
    niv_passage_text        TEXT,
    niv_key_verse_ref       TEXT,
    niv_key_verse_text      TEXT,
    
    -- Generated content
    paraphrase_text         TEXT,                       -- 440-520 word summary
    mood_category           TEXT,                       -- COSMIC|DRAMATIC|INTIMATE|PROPHETIC|TRIUMPHANT|SOLEMN
    image_abstract          TEXT,                       -- Theological concept for art
    image_prompt            TEXT,                       -- Final DALL-E prompt
    image_url               TEXT,                       -- Supabase Storage URL
    
    -- Status tracking (pending/done/error)
    status_outline          TEXT DEFAULT 'pending',
    status_scripture        TEXT DEFAULT 'pending',
    status_text             TEXT DEFAULT 'pending',
    status_image            TEXT DEFAULT 'pending',
    
    -- Resilience fields
    error_message           TEXT,                       -- Last error if status='error'
    retry_count             INT DEFAULT 0,              -- Track retry attempts
    last_processed_at       TIMESTAMPTZ,                -- When last touched by pipeline
    
    -- Timestamps
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_spreads_status 
ON public.grahams_devotional_spreads (status_outline, status_scripture, status_text, status_image);

-- Create index for spread_code lookups
CREATE INDEX IF NOT EXISTS idx_spreads_code 
ON public.grahams_devotional_spreads (spread_code);

-- Create index for book/chapter ordering
CREATE INDEX IF NOT EXISTS idx_spreads_order 
ON public.grahams_devotional_spreads (testament, book, start_chapter, start_verse);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_spreads_updated_at ON public.grahams_devotional_spreads;
CREATE TRIGGER update_spreads_updated_at
    BEFORE UPDATE ON public.grahams_devotional_spreads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Storage Bucket for Devotional Artwork
-- ============================================================================
-- Note: Run this in Supabase Dashboard > Storage > Create Bucket
-- Or use the Supabase client SDK to create programmatically

-- The bucket should be named: devotional-artwork
-- Settings:
--   - Public bucket: YES (for easy image URL access)
--   - File size limit: 10MB
--   - Allowed MIME types: image/png, image/jpeg, image/webp

-- ============================================================================
-- Row Level Security (RLS) - Optional but recommended
-- ============================================================================

-- Enable RLS
ALTER TABLE public.grahams_devotional_spreads ENABLE ROW LEVEL SECURITY;

-- Policy for service role (n8n workflows) - full access
CREATE POLICY "Service role has full access" 
ON public.grahams_devotional_spreads
FOR ALL 
USING (true)
WITH CHECK (true);

-- ============================================================================
-- Helper Views
-- ============================================================================

-- View for pending items (what needs processing)
CREATE OR REPLACE VIEW public.v_pending_spreads AS
SELECT 
    id,
    spread_code,
    title,
    book,
    start_chapter,
    status_outline,
    status_scripture,
    status_text,
    status_image,
    retry_count,
    CASE 
        WHEN status_scripture = 'pending' THEN 'scripture'
        WHEN status_text = 'pending' THEN 'text'
        WHEN status_image = 'pending' THEN 'image'
        ELSE 'complete'
    END as next_stage
FROM public.grahams_devotional_spreads
WHERE status_outline = 'done'
  AND (status_scripture = 'pending' 
       OR status_text = 'pending' 
       OR status_image = 'pending')
ORDER BY 
    CASE testament WHEN 'OT' THEN 1 ELSE 2 END,
    book,
    start_chapter,
    start_verse
LIMIT 5;

-- View for completed spreads (ready for export)
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

-- View for error tracking
CREATE OR REPLACE VIEW public.v_error_spreads AS
SELECT 
    id,
    spread_code,
    title,
    status_scripture,
    status_text,
    status_image,
    error_message,
    retry_count,
    last_processed_at
FROM public.grahams_devotional_spreads
WHERE status_scripture = 'error'
   OR status_text = 'error'
   OR status_image = 'error';
