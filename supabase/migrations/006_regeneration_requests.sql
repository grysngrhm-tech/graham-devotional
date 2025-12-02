-- Migration: Create regeneration_requests table for in-app image regeneration
-- This table tracks image regeneration requests initiated from the web app

CREATE TABLE regeneration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spread_code TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 4),
  option_urls TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for efficient polling by status
CREATE INDEX idx_regen_status ON regeneration_requests(status, created_at);

-- Index for looking up requests by spread
CREATE INDEX idx_regen_spread ON regeneration_requests(spread_code);

COMMENT ON TABLE regeneration_requests IS 'Tracks image regeneration requests from the web app UI';
COMMENT ON COLUMN regeneration_requests.slot IS 'Which image slot (1-4) is being regenerated';
COMMENT ON COLUMN regeneration_requests.option_urls IS 'Array of 4 temporary image URLs for user to choose from';
COMMENT ON COLUMN regeneration_requests.status IS 'processing=generating, ready=options available, completed=user selected, failed=error';
