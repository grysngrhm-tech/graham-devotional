-- ============================================================================
-- Migration 007: User Accounts System
-- Adds user profiles, favorites, read tracking, and per-user image selections
-- ============================================================================

-- ============================================================================
-- User Profiles Table
-- Stores user role (admin/user) and basic profile info
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    is_admin BOOLEAN DEFAULT FALSE,
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for admin lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_admin ON public.user_profiles(is_admin);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto-creating profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- User Favorites Table
-- Per-user favorite stories
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_favorites (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    spread_code TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, spread_code)
);

-- Index for efficient user favorites lookup
CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON public.user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_spread ON public.user_favorites(spread_code);

-- ============================================================================
-- User Read Stories Table
-- Tracks which stories each user has read
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_read_stories (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    spread_code TEXT NOT NULL,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, spread_code)
);

-- Index for efficient read status lookup
CREATE INDEX IF NOT EXISTS idx_user_read_user ON public.user_read_stories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_read_spread ON public.user_read_stories(spread_code);

-- ============================================================================
-- User Primary Images Table
-- Per-user image selections for each story
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_primary_images (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    spread_code TEXT NOT NULL,
    image_slot INTEGER NOT NULL CHECK (image_slot BETWEEN 1 AND 4),
    selected_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, spread_code)
);

-- Index for efficient image selection lookup
CREATE INDEX IF NOT EXISTS idx_user_images_user ON public.user_primary_images(user_id);
CREATE INDEX IF NOT EXISTS idx_user_images_spread ON public.user_primary_images(spread_code);

-- ============================================================================
-- Image Popularity View
-- Aggregates how many users have selected each image as their primary
-- ============================================================================

CREATE OR REPLACE VIEW public.image_popularity AS
SELECT 
    spread_code, 
    image_slot, 
    COUNT(*) as selection_count
FROM public.user_primary_images
GROUP BY spread_code, image_slot
ORDER BY spread_code, selection_count DESC;

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all user tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_read_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_primary_images ENABLE ROW LEVEL SECURITY;

-- User Profiles: Users can read/update their own profile
CREATE POLICY "Users can view own profile"
    ON public.user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.user_profiles FOR UPDATE
    USING (auth.uid() = id);

-- Allow service role full access to user_profiles (for admin checks)
CREATE POLICY "Service role full access to profiles"
    ON public.user_profiles FOR ALL
    USING (true)
    WITH CHECK (true);

-- User Favorites: Users can manage their own favorites
CREATE POLICY "Users can view own favorites"
    ON public.user_favorites FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites"
    ON public.user_favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
    ON public.user_favorites FOR DELETE
    USING (auth.uid() = user_id);

-- User Read Stories: Users can manage their own read status
CREATE POLICY "Users can view own read stories"
    ON public.user_read_stories FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own read stories"
    ON public.user_read_stories FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own read stories"
    ON public.user_read_stories FOR DELETE
    USING (auth.uid() = user_id);

-- User Primary Images: Users can manage their own image selections
CREATE POLICY "Users can view own image selections"
    ON public.user_primary_images FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own image selections"
    ON public.user_primary_images FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own image selections"
    ON public.user_primary_images FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own image selections"
    ON public.user_primary_images FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND is_admin = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's primary image for a story (or NULL if none selected)
CREATE OR REPLACE FUNCTION public.get_user_primary_image(p_spread_code TEXT)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT image_slot FROM public.user_primary_images
        WHERE user_id = auth.uid() AND spread_code = p_spread_code
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.user_profiles IS 'User profiles with role information';
COMMENT ON COLUMN public.user_profiles.is_admin IS 'Admin users can regenerate images and set global defaults';

COMMENT ON TABLE public.user_favorites IS 'Per-user favorite stories';
COMMENT ON TABLE public.user_read_stories IS 'Tracks which stories each user has read';
COMMENT ON TABLE public.user_primary_images IS 'Per-user image selections overriding global defaults';

COMMENT ON VIEW public.image_popularity IS 'Aggregates how many users selected each image as primary';

