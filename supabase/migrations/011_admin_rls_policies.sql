-- ============================================================================
-- Migration 011: Admin RLS Policies
-- Allows admin users to read all user data for dashboard statistics
-- ============================================================================

-- Note: There's already an is_admin() function defined in migration 007.
-- These policies use a subquery instead to avoid potential issues with 
-- function caching in RLS policies.

-- ============================================================================
-- Admin Policy: Read ALL user_primary_images for statistics
-- ============================================================================

DROP POLICY IF EXISTS "Admins can read all image selections" ON public.user_primary_images;
CREATE POLICY "Admins can read all image selections"
    ON public.user_primary_images FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- ============================================================================
-- Admin Policy: Read ALL user_favorites for statistics
-- ============================================================================

DROP POLICY IF EXISTS "Admins can read all favorites" ON public.user_favorites;
CREATE POLICY "Admins can read all favorites"
    ON public.user_favorites FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- ============================================================================
-- Admin Policy: Read ALL user_read_stories for statistics
-- ============================================================================

DROP POLICY IF EXISTS "Admins can read all read stories" ON public.user_read_stories;
CREATE POLICY "Admins can read all read stories"
    ON public.user_read_stories FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- ============================================================================
-- Admin Policy: Read ALL user_profiles for user management
-- ============================================================================

DROP POLICY IF EXISTS "Admins can read all profiles" ON public.user_profiles;
CREATE POLICY "Admins can read all profiles"
    ON public.user_profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON POLICY "Admins can read all image selections" ON public.user_primary_images 
    IS 'Allows admin users to view all user image selections for dashboard statistics';

COMMENT ON POLICY "Admins can read all favorites" ON public.user_favorites 
    IS 'Allows admin users to view all favorites for dashboard statistics';

COMMENT ON POLICY "Admins can read all read stories" ON public.user_read_stories 
    IS 'Allows admin users to view all read story records for dashboard statistics';

COMMENT ON POLICY "Admins can read all profiles" ON public.user_profiles 
    IS 'Allows admin users to view all user profiles for user management';

