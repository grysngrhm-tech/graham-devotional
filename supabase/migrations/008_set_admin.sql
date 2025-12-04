-- ============================================================================
-- Set Admin Status for grysngrhm@gmail.com
-- Run this in Supabase SQL Editor
-- ============================================================================

-- First, check if the user exists and their current admin status
SELECT 
    id, 
    email, 
    is_admin, 
    created_at 
FROM user_profiles 
WHERE email = 'grysngrhm@gmail.com';

-- Set admin status to TRUE for grysngrhm@gmail.com
UPDATE user_profiles 
SET is_admin = true 
WHERE email = 'grysngrhm@gmail.com';

-- Verify the update
SELECT 
    id, 
    email, 
    is_admin, 
    created_at 
FROM user_profiles 
WHERE email = 'grysngrhm@gmail.com';

-- ============================================================================
-- If the user doesn't exist in user_profiles, you may need to:
-- 1. First, find their auth.users id
-- ============================================================================

-- Find user ID from auth.users (run this if user_profiles doesn't have the user)
-- SELECT id, email FROM auth.users WHERE email = 'grysngrhm@gmail.com';

-- If found but not in user_profiles, insert them:
-- INSERT INTO user_profiles (id, email, is_admin)
-- SELECT id, email, true FROM auth.users WHERE email = 'grysngrhm@gmail.com'
-- ON CONFLICT (id) DO UPDATE SET is_admin = true;

-- ============================================================================
-- List all admin users
-- ============================================================================
SELECT 
    id, 
    email, 
    is_admin, 
    created_at 
FROM user_profiles 
WHERE is_admin = true;

