-- AutoLlama PostgreSQL Database Schema (Final)
-- Optimized for real-time recent data + fast historical queries

-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing objects if they exist (clean start)
DROP VIEW IF EXISTS recent_content_realtime CASCADE;
DROP VIEW IF EXISTS historical_content_cacheable CASCADE;
DROP VIEW IF EXISTS active_sessions_realtime CASCADE;
DROP VIEW IF EXISTS content_stats CASCADE;
DROP FUNCTION IF EXISTS get_smart_content_mix CASCADE;
DROP TABLE IF EXISTS processed_content CASCADE;
DROP TABLE IF EXISTS upload_sessions CASCADE;

-- Main processed content table (replaces Airtable main table)
CREATE TABLE processed_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Content identification
    url TEXT NOT NULL,
    title TEXT,
    summary TEXT,
    chunk_text TEXT,
    chunk_id TEXT UNIQUE,
    chunk_index INTEGER DEFAULT 0,
    
    -- AI Analysis results
    sentiment VARCHAR(20) DEFAULT 'Neutral',
    emotions TEXT[], -- Array of emotion strings
    category VARCHAR(100),
    content_type VARCHAR(50),
    technical_level VARCHAR(20) DEFAULT 'intermediate',
    main_topics TEXT[], -- Array of topic strings
    key_concepts TEXT,
    tags TEXT, -- Comma-separated tags
    key_entities JSONB, -- JSON object with people, organizations, locations
    
    -- Processing status
    embedding_status VARCHAR(20) DEFAULT 'pending',
    processing_status VARCHAR(20) DEFAULT 'complete',
    
    -- Timestamps - CRITICAL for real-time performance
    created_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata
    source VARCHAR(50) DEFAULT 'autollama.io',
    airtable_record_id TEXT, -- For sync tracking
    
    -- Constraints
    CONSTRAINT unique_chunk_id UNIQUE(chunk_id)
);

-- Upload sessions table (replaces Airtable upload sessions)
CREATE TABLE upload_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Session details
    url TEXT NOT NULL,
    filename TEXT,
    title TEXT,
    
    -- Progress tracking
    total_chunks INTEGER DEFAULT 0,
    processed_chunks INTEGER DEFAULT 0,
    completed_chunks INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'processing', -- processing, completed, failed
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    airtable_session_id TEXT -- For sync tracking  
);

-- Performance indexes - OPTIMIZED FOR TIME-BASED QUERIES
CREATE INDEX idx_processed_content_all_time ON processed_content(created_time DESC);
CREATE INDEX idx_processed_content_url ON processed_content(url);
CREATE INDEX idx_processed_content_embedding_status ON processed_content(embedding_status);
CREATE INDEX idx_processed_content_chunk_id ON processed_content(chunk_id);

-- Text search indexes for title and summary
CREATE INDEX idx_processed_content_title_search ON processed_content 
    USING gin(to_tsvector('english', COALESCE(title, '')));
CREATE INDEX idx_processed_content_summary_search ON processed_content 
    USING gin(to_tsvector('english', COALESCE(summary, '')));

-- Upload sessions indexes
CREATE INDEX idx_upload_sessions_last_activity ON upload_sessions(last_activity DESC);
CREATE INDEX idx_upload_sessions_status ON upload_sessions(status);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at trigger
CREATE TRIGGER update_processed_content_updated_at 
    BEFORE UPDATE ON processed_content 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- VIEWS FOR REAL-TIME PERFORMANCE

-- Recent content view (last 24 hours) - NO CACHING
CREATE VIEW recent_content_realtime AS
SELECT 
    id,
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
    created_time,
    processed_date,
    'recent' as data_source
FROM processed_content
WHERE created_time > NOW() - INTERVAL '24 hours'
AND processing_status = 'complete'
ORDER BY created_time DESC;

-- Historical content view (24+ hours) - FOR CACHING
CREATE VIEW historical_content_cacheable AS
SELECT 
    id,
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
    created_time,
    processed_date,
    'historical' as data_source
FROM processed_content
WHERE created_time <= NOW() - INTERVAL '24 hours'
AND processing_status = 'complete'
ORDER BY created_time DESC;

-- Active sessions view for real-time in-progress tracking
CREATE VIEW active_sessions_realtime AS
SELECT 
    id,
    url,
    filename,
    title,
    total_chunks,
    processed_chunks,
    completed_chunks,
    status,
    created_at,
    last_activity,
    EXTRACT(EPOCH FROM (NOW() - last_activity)) as seconds_since_activity
FROM upload_sessions
WHERE status = 'processing' 
AND last_activity > NOW() - INTERVAL '1 hour'
ORDER BY last_activity DESC;

-- Statistics view for performance monitoring
CREATE VIEW content_stats AS
SELECT 
    COUNT(*) FILTER (WHERE created_time > NOW() - INTERVAL '24 hours') as recent_count,
    COUNT(*) FILTER (WHERE created_time <= NOW() - INTERVAL '24 hours') as historical_count,
    COUNT(*) as total_count,
    MAX(created_time) as latest_content,
    COUNT(*) FILTER (WHERE embedding_status = 'complete') as embedded_count
FROM processed_content
WHERE processing_status = 'complete';

-- Function to get recent content (real-time, no caching)
CREATE OR REPLACE FUNCTION get_recent_content(hours_back INTEGER DEFAULT 24)
RETURNS TABLE (
    id UUID,
    url TEXT,
    title TEXT,
    summary TEXT,
    sentiment VARCHAR(20),
    emotions TEXT[],
    category VARCHAR(100),
    content_type VARCHAR(50),
    technical_level VARCHAR(20),
    main_topics TEXT[],
    tags TEXT,
    key_entities JSONB,
    embedding_status VARCHAR(20),
    created_time TIMESTAMP WITH TIME ZONE,
    processed_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pc.id, pc.url, pc.title, pc.summary, pc.sentiment, pc.emotions,
        pc.category, pc.content_type, pc.technical_level, pc.main_topics,
        pc.tags, pc.key_entities, pc.embedding_status, pc.created_time,
        pc.processed_date
    FROM processed_content pc
    WHERE pc.created_time > NOW() - (hours_back || ' hours')::INTERVAL
    AND pc.processing_status = 'complete'
    ORDER BY pc.created_time DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get historical content (cacheable)
CREATE OR REPLACE FUNCTION get_historical_content(
    hours_cutoff INTEGER DEFAULT 24,
    result_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
    id UUID,
    url TEXT,
    title TEXT,
    summary TEXT,
    sentiment VARCHAR(20),
    emotions TEXT[],
    category VARCHAR(100),
    content_type VARCHAR(50),
    technical_level VARCHAR(20),
    main_topics TEXT[],
    tags TEXT,
    key_entities JSONB,
    embedding_status VARCHAR(20),
    created_time TIMESTAMP WITH TIME ZONE,
    processed_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pc.id, pc.url, pc.title, pc.summary, pc.sentiment, pc.emotions,
        pc.category, pc.content_type, pc.technical_level, pc.main_topics,
        pc.tags, pc.key_entities, pc.embedding_status, pc.created_time,
        pc.processed_date
    FROM processed_content pc
    WHERE pc.created_time <= NOW() - (hours_cutoff || ' hours')::INTERVAL
    AND pc.processing_status = 'complete'
    ORDER BY pc.created_time DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Insert sample data for testing
INSERT INTO processed_content (
    url, title, summary, sentiment, category, content_type, 
    embedding_status, chunk_id, chunk_index, created_time
) VALUES 
(
    'https://example.com/recent-test', 
    'Recent Sample Article', 
    'This is a recent sample article for testing real-time performance.', 
    'Positive', 
    'Technology', 
    'article',
    'complete',
    'recent-sample-chunk-1',
    0,
    NOW() - INTERVAL '1 hour'
),
(
    'https://example.com/historical-test', 
    'Historical Sample Article', 
    'This is a historical sample article for testing cached performance.', 
    'Neutral', 
    'General', 
    'article',
    'complete',
    'historical-sample-chunk-1',
    0,
    NOW() - INTERVAL '48 hours'
),
(
    'https://example.com/another-recent', 
    'Another Recent Article', 
    'Another recent article to test the sidebar real-time updates.', 
    'Positive', 
    'Development', 
    'tutorial',
    'complete',
    'recent-sample-chunk-2',
    0,
    NOW() - INTERVAL '2 hours'
)
ON CONFLICT (chunk_id) DO NOTHING;

-- Insert sample session for testing in-progress functionality
INSERT INTO upload_sessions (
    url, filename, title, total_chunks, processed_chunks, completed_chunks,
    status, created_at, last_activity
) VALUES 
(
    'https://example.com/processing-test',
    'processing-test.pdf',
    'Sample Processing Document',
    20,
    12,
    12,
    'processing',
    NOW() - INTERVAL '5 minutes',
    NOW() - INTERVAL '30 seconds'
);

-- Test the views and functions
SELECT 'Testing views...' as step;
SELECT COUNT(*) as recent_count FROM recent_content_realtime;
SELECT COUNT(*) as historical_count FROM historical_content_cacheable;
SELECT COUNT(*) as active_sessions FROM active_sessions_realtime;

-- Success message
SELECT 'AutoLlama real-time optimized database schema created successfully!' as result;