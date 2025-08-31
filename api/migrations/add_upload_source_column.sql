-- Migration: Add upload_source column to processed_content table
-- Date: 2025-08-31
-- Purpose: Fix document creation failures when upload_source column is missing

-- Add upload_source column if it doesn't exist
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS upload_source VARCHAR(50) DEFAULT 'user';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_processed_content_upload_source 
ON processed_content(upload_source);

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'processed_content' 
AND column_name = 'upload_source';