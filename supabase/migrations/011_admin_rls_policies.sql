-- ============================================================================
-- Migration 011: Admin RLS Policies (FIXED)
-- Allows admin users to read all user data for dashboard statistics
-- 
-- NOTE: The user_profiles policy was removed because it creates circular
-- dependency (checking admin status requires reading user_profiles, which
-- requires checking admin status). Admin user listing will use a SECURITY
-- DEFINER function instead.
-- ============================================================================

-- ============================================================================
-- IMPORTANT: First drop the broken policy that causes infinite recursion
-- ============================================================================

DROP POLICY IF EXISTS "Admins can read all profiles" ON public.user_profiles;

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
-- SECURITY DEFINER function for admin to list all users
-- This bypasses RLS safely because it's a trusted function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_all_profiles()
RETURNS TABLE (
    id UUID,
    email TEXT,
    is_admin BOOLEAN,
    created_at TIMESTAMPTZ
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- First verify the caller is an admin
    IF NOT EXISTS (
        SELECT 1 FROM public.user_profiles 
        WHERE user_profiles.id = auth.uid() AND user_profiles.is_admin = TRUE
    ) THEN
        RAISE EXCEPTION 'Access denied: admin privileges required';
    END IF;
    
    -- Return all profiles
    RETURN QUERY SELECT 
        user_profiles.id,
        user_profiles.email,
        user_profiles.is_admin,
        user_profiles.created_at
    FROM public.user_profiles
    ORDER BY user_profiles.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute to authenticated users (function does its own admin check)
GRANT EXECUTE ON FUNCTION public.admin_get_all_profiles() TO authenticated;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON POLICY "Admins can read all image selections" ON public.user_primary_images 
    IS 'Allows admin users to view all user image selections for dashboard statistics';

COMMENT ON POLICY "Admins can read all favorites" ON public.user_favorites 
    IS 'Allows admin users to view all favorites for dashboard statistics';

COMMENT ON POLICY "Admins can read all read stories" ON public.user_read_stories 
    IS 'Allows admin users to view all read story records for dashboard statistics';

COMMENT ON FUNCTION public.admin_get_all_profiles() 
    IS 'SECURITY DEFINER function allowing admins to list all user profiles without RLS recursion';

