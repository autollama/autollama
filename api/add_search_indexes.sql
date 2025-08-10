-- Search Performance Optimization Indexes
-- Run this script to dramatically improve search performance

-- 1. Full-Text Search Index (Most Important)
-- Creates a GIN index for full-text search on title, summary, and tags
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_content_fts 
ON processed_content 
USING GIN (to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(tags, '')));

-- 2. URL Index for Window Functions
-- Speeds up ROW_NUMBER() OVER (PARTITION BY url) operations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_content_url_time 
ON processed_content (url, created_time DESC);

-- 3. Search Field Indexes
-- B-tree indexes for common search fields
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_content_title 
ON processed_content USING GIN (title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_content_category 
ON processed_content (category);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_content_content_type 
ON processed_content (content_type);

-- 4. Composite Index for Tag Searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_content_tags_gin 
ON processed_content USING GIN (tags gin_trgm_ops);

-- 5. Performance Index for Sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_content_created_time 
ON processed_content (created_time DESC);

-- Enable the trigram extension if not already enabled (for fuzzy matching)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Analyze tables to update statistics for query planner
ANALYZE processed_content;

-- Show index creation progress
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'processed_content' 
AND indexname LIKE 'idx_processed_content_%'
ORDER BY indexname;

-- Performance statistics
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE tablename = 'processed_content'
ORDER BY idx_tup_read DESC;