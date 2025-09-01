-- Migration: Initial Database Schema
-- Date: 2025-09-01
-- Purpose: Create base tables for fresh AutoLlama installations
-- This must run BEFORE all other migrations

-- Enable required extensions first
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Main content table
CREATE TABLE IF NOT EXISTS processed_content (
    id SERIAL PRIMARY KEY,
    airtable_id VARCHAR(255) UNIQUE, -- Keep for backward compatibility during migration
    url TEXT NOT NULL,
    title VARCHAR(500),
    summary TEXT,
    chunk_text TEXT,
    chunk_id VARCHAR(255) UNIQUE NOT NULL,
    chunk_index INTEGER,
    sentiment VARCHAR(50),
    emotions TEXT[], -- Array of emotions
    category VARCHAR(100),
    content_type VARCHAR(50),
    technical_level VARCHAR(50),
    main_topics TEXT[], -- Array of topics
    key_concepts TEXT[], -- Array of concepts
    tags TEXT,
    key_entities JSONB, -- Stores people, organizations, locations
    embedding_status VARCHAR(50) DEFAULT 'pending',
    processing_status VARCHAR(50) DEFAULT 'processing',
    created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_to_li BOOLEAN DEFAULT FALSE,
    CONSTRAINT unique_chunk_id UNIQUE (chunk_id)
);

-- Upload sessions table
CREATE TABLE IF NOT EXISTS upload_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    filename VARCHAR(500),
    url TEXT,
    total_chunks INTEGER,
    processed_chunks INTEGER DEFAULT 0,
    completed_chunks INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'processing', -- processing, completed, failed
    file_path TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API settings table for configuration
CREATE TABLE IF NOT EXISTS api_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_processed_content_url ON processed_content(url);
CREATE INDEX IF NOT EXISTS idx_processed_content_created ON processed_content(created_time DESC);
CREATE INDEX IF NOT EXISTS idx_processed_content_processed ON processed_content(processed_date DESC);
CREATE INDEX IF NOT EXISTS idx_processed_content_chunk_id ON processed_content(chunk_id);
CREATE INDEX IF NOT EXISTS idx_processed_content_embedding_status ON processed_content(embedding_status);
CREATE INDEX IF NOT EXISTS idx_processed_content_category ON processed_content(category);
CREATE INDEX IF NOT EXISTS idx_processed_content_sentiment ON processed_content(sentiment);
CREATE INDEX IF NOT EXISTS idx_processed_content_sent_to_li ON processed_content(sent_to_li);

-- GIN indexes for JSON and array fields (for fast searching)
CREATE INDEX IF NOT EXISTS idx_processed_content_key_entities ON processed_content USING GIN (key_entities);
CREATE INDEX IF NOT EXISTS idx_processed_content_emotions ON processed_content USING GIN (emotions);
CREATE INDEX IF NOT EXISTS idx_processed_content_main_topics ON processed_content USING GIN (main_topics);

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_processed_content_fulltext ON processed_content 
USING GIN (to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(tags, '')));

-- Upload sessions indexes
CREATE INDEX IF NOT EXISTS idx_upload_sessions_session_id ON upload_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_created ON upload_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_last_activity ON upload_sessions(last_activity DESC);

-- API settings indexes
CREATE INDEX IF NOT EXISTS idx_api_settings_key ON api_settings(setting_key);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for upload_sessions
CREATE TRIGGER update_upload_sessions_updated_at BEFORE UPDATE
    ON upload_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for api_settings
CREATE TRIGGER update_api_settings_updated_at BEFORE UPDATE
    ON api_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for recent records (last 24 hours) - for performance
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
    sent_to_li
FROM processed_content
WHERE created_time >= NOW() - INTERVAL '24 hours'
ORDER BY url, created_time DESC;

-- View for active upload sessions
CREATE OR REPLACE VIEW active_upload_sessions AS
SELECT * FROM upload_sessions
WHERE status = 'processing'
   OR (status != 'completed' AND last_activity >= NOW() - INTERVAL '1 hour')
ORDER BY last_activity DESC;

-- Confirm initial schema creation
SELECT 'Initial database schema created successfully' as status;