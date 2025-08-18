-- Migration: Add vector database mode and vendor tracking for future-compatible data isolation
-- This enables data isolation between deployment modes and multiple vector database vendors
-- Created: 2025-08-18
-- Purpose: AutoLlama v2.3.4 Pure Local Mode data isolation + future multi-vendor support

-- Add vector_db_mode column to track deployment mode (local, cloud, hybrid, edge)
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS vector_db_mode VARCHAR(20) DEFAULT 'cloud';

-- Add vector_db_vendor column to track which vector database vendor (qdrant, pinecone, weaviate, etc.)
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS vector_db_vendor VARCHAR(20) DEFAULT 'qdrant';

-- Add vector_db_config column for vendor-specific configuration data
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS vector_db_config JSONB DEFAULT '{}';

-- Add comments for documentation
COMMENT ON COLUMN processed_content.vector_db_mode IS 'Tracks vector database deployment mode: local, cloud, hybrid, edge';
COMMENT ON COLUMN processed_content.vector_db_vendor IS 'Tracks vector database vendor: qdrant, pinecone, weaviate, chroma, milvus';
COMMENT ON COLUMN processed_content.vector_db_config IS 'Vendor-specific configuration data (JSON)';

-- Update all existing records to cloud mode with qdrant vendor (user requirement)
UPDATE processed_content 
SET vector_db_mode = 'cloud', 
    vector_db_vendor = 'qdrant',
    vector_db_config = '{}'
WHERE vector_db_mode IS NULL 
   OR vector_db_vendor IS NULL 
   OR vector_db_config IS NULL;

-- Add indexes for efficient mode and vendor-based queries
CREATE INDEX IF NOT EXISTS idx_processed_content_vector_db_mode 
ON processed_content(vector_db_mode);

CREATE INDEX IF NOT EXISTS idx_processed_content_vector_db_vendor 
ON processed_content(vector_db_vendor);

-- Add composite index for mode + vendor queries (most common future pattern)
CREATE INDEX IF NOT EXISTS idx_processed_content_mode_vendor 
ON processed_content(vector_db_mode, vector_db_vendor);

-- Add composite index for mode + vendor + creation time for document listing
CREATE INDEX IF NOT EXISTS idx_processed_content_mode_vendor_created 
ON processed_content(vector_db_mode, vector_db_vendor, created_time DESC);

-- Add composite index for mode + vendor + URL for document lookups
CREATE INDEX IF NOT EXISTS idx_processed_content_mode_vendor_url 
ON processed_content(vector_db_mode, vector_db_vendor, url);

-- Add GIN index for vector_db_config JSON queries (future vendor-specific searches)
CREATE INDEX IF NOT EXISTS idx_processed_content_vector_db_config 
ON processed_content USING GIN (vector_db_config);

-- Update the recent_records view to be mode and vendor aware
CREATE OR REPLACE VIEW recent_records AS
SELECT DISTINCT ON (url, vector_db_mode, vector_db_vendor) 
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
    vector_db_mode,
    vector_db_vendor,
    vector_db_config
FROM processed_content
WHERE created_time >= NOW() - INTERVAL '24 hours'
ORDER BY url, vector_db_mode, vector_db_vendor, created_time DESC;

-- Add constraints to ensure valid mode and vendor values (future-compatible)
ALTER TABLE processed_content 
ADD CONSTRAINT chk_vector_db_mode 
CHECK (vector_db_mode IN ('local', 'cloud', 'hybrid', 'edge'));

ALTER TABLE processed_content 
ADD CONSTRAINT chk_vector_db_vendor 
CHECK (vector_db_vendor IN ('qdrant', 'pinecone', 'weaviate', 'chroma', 'milvus', 'elasticsearch'));

-- Migration verification query
-- Run this to verify the migration completed successfully
/*
SELECT 
    vector_db_mode,
    vector_db_vendor,
    COUNT(*) as document_count,
    COUNT(DISTINCT url) as unique_documents,
    MIN(created_time) as earliest_document,
    MAX(created_time) as latest_document
FROM processed_content 
GROUP BY vector_db_mode, vector_db_vendor
ORDER BY vector_db_mode, vector_db_vendor;
*/

-- Rollback instructions (if needed)
/*
To rollback this migration:

-- Remove indexes
DROP INDEX IF EXISTS idx_processed_content_vector_db_mode;
DROP INDEX IF EXISTS idx_processed_content_vector_db_vendor;
DROP INDEX IF EXISTS idx_processed_content_mode_vendor;
DROP INDEX IF EXISTS idx_processed_content_mode_vendor_created;
DROP INDEX IF EXISTS idx_processed_content_mode_vendor_url;
DROP INDEX IF EXISTS idx_processed_content_vector_db_config;

-- Remove constraints
ALTER TABLE processed_content DROP CONSTRAINT IF EXISTS chk_vector_db_mode;
ALTER TABLE processed_content DROP CONSTRAINT IF EXISTS chk_vector_db_vendor;

-- Remove columns
ALTER TABLE processed_content DROP COLUMN IF EXISTS vector_db_mode;
ALTER TABLE processed_content DROP COLUMN IF EXISTS vector_db_vendor;
ALTER TABLE processed_content DROP COLUMN IF EXISTS vector_db_config;

-- Restore original recent_records view
CREATE OR REPLACE VIEW recent_records AS
SELECT DISTINCT ON (url) 
    id, airtable_id, url, title, summary, sentiment, emotions,
    category, content_type, technical_level, main_topics, tags,
    key_entities, embedding_status, processing_status,
    created_time, processed_date, sent_to_li
FROM processed_content
WHERE created_time >= NOW() - INTERVAL '24 hours'
ORDER BY url, created_time DESC;
*/