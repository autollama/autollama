-- Migration: Add source column to processed_content table
-- Date: 2025-08-31
-- Purpose: Fix search functionality that depends on source column

-- Add source column if it doesn't exist
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'unknown';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_processed_content_source 
ON processed_content(source);

-- Install trigram extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add trigram indexes for better search performance
CREATE INDEX IF NOT EXISTS idx_processed_content_title_trgm 
ON processed_content USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_processed_content_tags_trgm 
ON processed_content USING gin (tags gin_trgm_ops);

-- Verify the changes
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'processed_content' 
AND column_name IN ('source', 'upload_source');