-- Migration to add upload_source field for tracking user vs AI generated content
-- Date: 2025-01-27

-- Add upload_source column to processed_content table
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS upload_source VARCHAR(20) DEFAULT 'user';

-- Update existing records based on patterns
-- Set all existing records as 'user' for now since we don't have historical data
UPDATE processed_content 
SET upload_source = 'user' 
WHERE upload_source IS NULL;

-- Add upload_source column to upload_sessions table
ALTER TABLE upload_sessions 
ADD COLUMN IF NOT EXISTS upload_source VARCHAR(20) DEFAULT 'user';

-- Update existing sessions
UPDATE upload_sessions 
SET upload_source = 'user' 
WHERE upload_source IS NULL;

-- Add comment explaining the values
COMMENT ON COLUMN processed_content.upload_source IS 'Source of the upload: user (human-initiated) or ai (system-generated)';
COMMENT ON COLUMN upload_sessions.upload_source IS 'Source of the upload: user (human-initiated) or ai (system-generated)';

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_processed_content_upload_source ON processed_content(upload_source);