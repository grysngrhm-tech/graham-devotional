-- Migration: Verify and fix RLS on user_primary_images table
-- This ensures the table has RLS enabled and proper policies

-- Enable RLS (safe to run even if already enabled)
ALTER TABLE IF EXISTS public.user_primary_images ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to ensure they're correct
-- (Using IF EXISTS to avoid errors if they don't exist)

DROP POLICY IF EXISTS "Users can view own image selections" ON public.user_primary_images;
DROP POLICY IF EXISTS "Users can insert own image selections" ON public.user_primary_images;
DROP POLICY IF EXISTS "Users can update own image selections" ON public.user_primary_images;
DROP POLICY IF EXISTS "Users can delete own image selections" ON public.user_primary_images;

-- Recreate policies
CREATE POLICY "Users can view own image selections"
    ON public.user_primary_images FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own image selections"
    ON public.user_primary_images FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own image selections"
    ON public.user_primary_images FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own image selections"
    ON public.user_primary_images FOR DELETE
    USING (auth.uid() = user_id);

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_primary_images TO authenticated;

-- Verify table structure (should have these columns)
-- id, user_id, spread_code, image_slot, created_at
COMMENT ON TABLE public.user_primary_images IS 'Per-user image selections overriding global defaults. RLS verified.';

