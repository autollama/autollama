-- Migration: Comprehensive v2.3 Schema Fixes
-- Date: 2025-09-01
-- Purpose: Consolidate all schema fixes from fix-schema.sh into a single migration
-- This migration includes all the fixes that users previously had to run manually

-- Add missing v2.3 columns to processed_content table
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS document_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS chunking_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS boundaries_respected TEXT[],
ADD COLUMN IF NOT EXISTS semantic_boundary_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS structural_context TEXT,
ADD COLUMN IF NOT EXISTS document_position FLOAT,
ADD COLUMN IF NOT EXISTS section_title TEXT,
ADD COLUMN IF NOT EXISTS section_level INTEGER,
ADD COLUMN IF NOT EXISTS context_generation_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS context_generation_time INTEGER,
ADD COLUMN IF NOT EXISTS context_cache_hit BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS record_type VARCHAR(20) DEFAULT 'chunk',
ADD COLUMN IF NOT EXISTS parent_document_id INTEGER,
ADD COLUMN IF NOT EXISTS upload_source VARCHAR(50) DEFAULT 'user';

-- Add missing column to upload_sessions if needed
ALTER TABLE upload_sessions 
ADD COLUMN IF NOT EXISTS duration INTEGER;

-- Create performance indexes for v2.3 features
CREATE INDEX IF NOT EXISTS idx_processed_content_parent_document_id ON processed_content(parent_document_id);
CREATE INDEX IF NOT EXISTS idx_processed_content_record_type ON processed_content(record_type);
CREATE INDEX IF NOT EXISTS idx_processed_content_updated_at ON processed_content(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_processed_content_upload_source ON processed_content(upload_source);
CREATE INDEX IF NOT EXISTS idx_processed_content_document_type ON processed_content(document_type);
CREATE INDEX IF NOT EXISTS idx_processed_content_chunking_method ON processed_content(chunking_method);
CREATE INDEX IF NOT EXISTS idx_processed_content_context_method ON processed_content(context_generation_method);
CREATE INDEX IF NOT EXISTS idx_processed_content_document_position ON processed_content(document_position);
CREATE INDEX IF NOT EXISTS idx_processed_content_section_level ON processed_content(section_level);

-- Add GIN index for boundaries_respected array
CREATE INDEX IF NOT EXISTS idx_processed_content_boundaries ON processed_content USING GIN (boundaries_respected);

-- Update the recent_records view to include new fields
DROP VIEW IF EXISTS recent_records;
CREATE OR REPLACE VIEW recent_records AS
SELECT DISTINCT ON (url) 
    id,
    airtable_id,
    url,
    title,
    summary,
    sentiment,
    emotions,
    category,
    content_type,
    technical_level,
    main_topics,
    tags,
    key_entities,
    embedding_status,
    processing_status,
    created_time,
    processed_date,
    sent_to_li,
    contextual_summary,
    uses_contextual_embedding,
    document_type,
    chunking_method,
    context_generation_method,
    upload_source,
    record_type
FROM processed_content
WHERE created_time >= NOW() - INTERVAL '24 hours'
ORDER BY url, created_time DESC;

-- Confirm the additions
SELECT 'v2.3 comprehensive schema migration completed successfully' as status;