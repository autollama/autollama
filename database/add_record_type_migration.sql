-- Migration: Add record_type to distinguish Documents from Chunks
-- This follows LangChain's Document/Chunk pattern

-- Add record_type column to processed_content table
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS record_type VARCHAR(20) DEFAULT 'chunk';

-- Update existing records to be 'chunk' type (they are all chunks currently)
UPDATE processed_content 
SET record_type = 'chunk' 
WHERE record_type IS NULL;

-- Add constraint to ensure valid record types
ALTER TABLE processed_content 
ADD CONSTRAINT check_record_type 
CHECK (record_type IN ('document', 'chunk'));

-- Add parent_document_id to link chunks to their parent document
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS parent_document_id UUID;

-- Add foreign key constraint for parent_document_id
ALTER TABLE processed_content 
ADD CONSTRAINT fk_parent_document 
FOREIGN KEY (parent_document_id) 
REFERENCES processed_content(id) 
ON DELETE CASCADE;

-- Create index for faster chunk queries by parent document
CREATE INDEX IF NOT EXISTS idx_parent_document_id 
ON processed_content(parent_document_id) 
WHERE record_type = 'chunk';

-- Create index for record type queries
CREATE INDEX IF NOT EXISTS idx_record_type 
ON processed_content(record_type);

-- Drop existing views in correct dependency order
DROP VIEW IF EXISTS document_summaries;
DROP VIEW IF EXISTS chunks_with_document;
DROP VIEW IF EXISTS documents_view;

-- Create view for documents only
CREATE OR REPLACE VIEW documents_view AS
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
    processing_status,
    created_time,
    processed_date,
    upload_source,
    chunk_text as full_content
FROM processed_content
WHERE record_type = 'document'
ORDER BY created_time DESC;

-- Create view for chunks with document info
CREATE OR REPLACE VIEW chunks_with_document AS
SELECT 
    c.id as chunk_id,
    c.chunk_text,
    c.chunk_index,
    c.contextual_summary,
    c.embedding_status as chunk_embedding_status,
    c.uses_contextual_embedding,
    d.id as document_id,
    d.url,
    d.title as document_title,
    d.summary as document_summary,
    d.category,
    d.content_type,
    d.upload_source,
    d.created_time as document_created_time
FROM processed_content c
JOIN processed_content d ON c.parent_document_id = d.id
WHERE c.record_type = 'chunk' AND d.record_type = 'document'
ORDER BY d.created_time DESC, c.chunk_index ASC;

CREATE OR REPLACE VIEW document_summaries AS
SELECT 
    d.id as document_id,
    d.url,
    d.title as document_title,
    d.summary as document_summary,
    COUNT(c.id) as total_chunks,
    SUM(CASE WHEN c.embedding_status = 'complete' THEN 1 ELSE 0 END) as embedded_chunks,
    d.sentiment,
    d.category,
    d.content_type,
    d.technical_level,
    d.main_topics,
    d.tags,
    d.key_entities,
    d.created_time,
    d.upload_source,
    d.processing_status
FROM processed_content d
LEFT JOIN processed_content c ON c.parent_document_id = d.id AND c.record_type = 'chunk'
WHERE d.record_type = 'document'
GROUP BY d.id, d.url, d.title, d.summary, d.sentiment, d.category, 
         d.content_type, d.technical_level, d.main_topics, d.tags, 
         d.key_entities, d.created_time, d.upload_source, d.processing_status
ORDER BY d.created_time DESC;

-- Function to create a document record
CREATE OR REPLACE FUNCTION create_document_record(
    p_url TEXT,
    p_title TEXT,
    p_summary TEXT,
    p_full_content TEXT,
    p_metadata JSONB,
    p_upload_source VARCHAR DEFAULT 'user'
) RETURNS UUID AS $$
DECLARE
    v_document_id UUID;
BEGIN
    INSERT INTO processed_content (
        url, title, summary, chunk_text, record_type,
        sentiment, emotions, category, content_type, technical_level,
        main_topics, tags, key_entities, embedding_status,
        processing_status, upload_source, chunk_id
    ) VALUES (
        p_url, 
        p_title, 
        p_summary, 
        p_full_content, 
        'document',
        COALESCE(p_metadata->>'sentiment', 'Neutral'),
        COALESCE((p_metadata->'emotions')::text[], ARRAY[]::text[]),
        p_metadata->>'category',
        COALESCE(p_metadata->>'content_type', 'article'),
        COALESCE(p_metadata->>'technical_level', 'intermediate'),
        COALESCE((p_metadata->'main_topics')::text[], ARRAY[]::text[]),
        p_metadata->>'tags',
        COALESCE(p_metadata->'key_entities', '{}'::jsonb),
        'pending',
        'processing',
        p_upload_source,
        'doc_' || gen_random_uuid()::text  -- Unique ID for document
    )
    RETURNING id INTO v_document_id;
    
    RETURN v_document_id;
END;
$$ LANGUAGE plpgsql;

-- Success message
SELECT 'Document/Chunk categorization schema added successfully!' as result;