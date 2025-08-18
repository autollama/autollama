-- Simple migration: Add vector database mode and vendor tracking
-- This enables data isolation between deployment modes and multiple vector database vendors
-- Created: 2025-08-18
-- Purpose: AutoLlama v2.3.4 Pure Local Mode data isolation + future multi-vendor support

-- Add vector_db_mode column to track deployment mode (local, cloud, hybrid, edge)
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS vector_db_mode VARCHAR(20) DEFAULT 'cloud';

-- Add vector_db_vendor column to track which vector database vendor
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS vector_db_vendor VARCHAR(20) DEFAULT 'qdrant';

-- Add vector_db_config column for vendor-specific configuration data
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS vector_db_config JSONB DEFAULT '{}';

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

-- Add constraints to ensure valid mode and vendor values (future-compatible)
ALTER TABLE processed_content 
ADD CONSTRAINT chk_vector_db_mode 
CHECK (vector_db_mode IN ('local', 'cloud', 'hybrid', 'edge'));

ALTER TABLE processed_content 
ADD CONSTRAINT chk_vector_db_vendor 
CHECK (vector_db_vendor IN ('qdrant', 'pinecone', 'weaviate', 'chroma', 'milvus', 'elasticsearch'));

-- Add comments for documentation
COMMENT ON COLUMN processed_content.vector_db_mode IS 'Tracks vector database deployment mode: local, cloud, hybrid, edge';
COMMENT ON COLUMN processed_content.vector_db_vendor IS 'Tracks vector database vendor: qdrant, pinecone, weaviate, chroma, milvus';
COMMENT ON COLUMN processed_content.vector_db_config IS 'Vendor-specific configuration data (JSON)';