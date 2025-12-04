-- Migration: Add user_library table for offline story downloads
-- This table tracks which stories a user has saved to their offline library.
-- The actual story data is stored locally on the user's device (IndexedDB),
-- but we sync the list to Supabase so it persists across devices.

-- Create the user_library table
CREATE TABLE IF NOT EXISTS user_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    spread_code TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, spread_code)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_library_user_id ON user_library(user_id);
CREATE INDEX IF NOT EXISTS idx_user_library_spread_code ON user_library(spread_code);

-- Enable Row Level Security
ALTER TABLE user_library ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only manage their own library entries
CREATE POLICY "Users can view own library entries"
    ON user_library FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can add to own library"
    ON user_library FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from own library"
    ON user_library FOR DELETE
    USING (auth.uid() = user_id);

-- Comment on table
COMMENT ON TABLE user_library IS 'Tracks stories saved to user offline library. Story data stored locally on device.';

