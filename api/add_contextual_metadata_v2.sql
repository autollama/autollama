-- Add enhanced contextual metadata fields for AutoLlama v2.2
-- These fields support the advanced contextual retrieval methodology

-- Add fields for intelligent document segmentation
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS document_type VARCHAR(50), -- e.g., 'academic_paper', 'documentation', etc.
ADD COLUMN IF NOT EXISTS chunking_method VARCHAR(50), -- e.g., 'semantic', 'structural', 'hierarchical'
ADD COLUMN IF NOT EXISTS boundaries_respected TEXT[], -- array of boundary types respected
ADD COLUMN IF NOT EXISTS semantic_boundary_type VARCHAR(50), -- type of semantic boundary if applicable
ADD COLUMN IF NOT EXISTS structural_context TEXT, -- nearby headers or structural elements
ADD COLUMN IF NOT EXISTS document_position FLOAT, -- relative position in document (0.0 to 1.0)
ADD COLUMN IF NOT EXISTS section_title TEXT, -- title of the section this chunk belongs to
ADD COLUMN IF NOT EXISTS section_level INTEGER, -- hierarchical level (1=chapter, 2=section, etc.)
ADD COLUMN IF NOT EXISTS context_generation_method VARCHAR(50), -- 'enhanced_v2' vs 'legacy'
ADD COLUMN IF NOT EXISTS context_generation_time INTEGER, -- milliseconds to generate context
ADD COLUMN IF NOT EXISTS context_cache_hit BOOLEAN DEFAULT FALSE; -- whether context was cached

-- Add indexes for performance on new fields
CREATE INDEX IF NOT EXISTS idx_processed_content_document_type ON processed_content(document_type);
CREATE INDEX IF NOT EXISTS idx_processed_content_chunking_method ON processed_content(chunking_method);
CREATE INDEX IF NOT EXISTS idx_processed_content_context_method ON processed_content(context_generation_method);
CREATE INDEX IF NOT EXISTS idx_processed_content_document_position ON processed_content(document_position);
CREATE INDEX IF NOT EXISTS idx_processed_content_section_level ON processed_content(section_level);

-- Add GIN index for boundaries_respected array
CREATE INDEX IF NOT EXISTS idx_processed_content_boundaries ON processed_content USING GIN (boundaries_respected);

-- Update view for recent records to include new fields
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
    context_generation_method
FROM processed_content
WHERE created_time >= NOW() - INTERVAL '24 hours'
ORDER BY url, created_time DESC;

-- Confirm the additions
SELECT 'Enhanced contextual metadata fields added successfully' as status;