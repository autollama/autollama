-- Migration: Create background_jobs table for queue persistence
-- This table stores background processing jobs for URLs and files
-- Enables processing to continue even when users disconnect

CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('url_processing', 'file_processing', 'batch_processing', 'reprocessing')),
    
    -- Job data
    url TEXT,
    file_data JSONB,
    options JSONB NOT NULL DEFAULT '{}',
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled', 'retrying')),
    priority INTEGER NOT NULL DEFAULT 5,
    retries INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    
    -- Results and errors
    result JSONB,
    error JSONB,
    duration INTEGER, -- Processing duration in milliseconds
    
    -- Indexes for efficient querying
    CONSTRAINT background_jobs_retries_check CHECK (retries >= 0),
    CONSTRAINT background_jobs_priority_check CHECK (priority >= 1 AND priority <= 10)
);

-- Indexes for efficient job queue operations
CREATE INDEX IF NOT EXISTS idx_background_jobs_status_priority ON background_jobs (status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_background_jobs_session_id ON background_jobs (session_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_type ON background_jobs (type);
CREATE INDEX IF NOT EXISTS idx_background_jobs_created_at ON background_jobs (created_at);
CREATE INDEX IF NOT EXISTS idx_background_jobs_next_retry_at ON background_jobs (next_retry_at) WHERE next_retry_at IS NOT NULL;

-- Partial indexes for active job monitoring
CREATE INDEX IF NOT EXISTS idx_background_jobs_active ON background_jobs (id, status, updated_at) 
WHERE status IN ('queued', 'processing', 'retrying');

-- Add comments for documentation
COMMENT ON TABLE background_jobs IS 'Background processing job queue for persistent, connection-independent processing';
COMMENT ON COLUMN background_jobs.session_id IS 'Links to upload_sessions table for tracking';
COMMENT ON COLUMN background_jobs.type IS 'Type of processing job (url_processing, file_processing, etc.)';
COMMENT ON COLUMN background_jobs.priority IS 'Job priority (1=highest, 10=lowest)';
COMMENT ON COLUMN background_jobs.options IS 'Processing configuration (chunkSize, contextual embeddings, etc.)';
COMMENT ON COLUMN background_jobs.file_data IS 'File metadata for file processing jobs';
COMMENT ON COLUMN background_jobs.result IS 'Processing results (documents created, chunks processed, etc.)';
COMMENT ON COLUMN background_jobs.error IS 'Error details for failed jobs';
COMMENT ON COLUMN background_jobs.duration IS 'Total processing time in milliseconds';

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_background_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_background_jobs_updated_at
    BEFORE UPDATE ON background_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_background_jobs_updated_at();

-- Create function to clean up old completed/failed jobs (run via cron or cleanup service)
CREATE OR REPLACE FUNCTION cleanup_old_background_jobs(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM background_jobs 
    WHERE status IN ('completed', 'failed', 'cancelled')
    AND completed_at < NOW() - INTERVAL '1 day' * retention_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log cleanup activity
    INSERT INTO system_logs (level, component, message, metadata, created_at)
    VALUES (
        'info',
        'background-queue-cleanup',
        'Cleaned up old background jobs',
        jsonb_build_object('deleted_jobs', deleted_count, 'retention_days', retention_days),
        NOW()
    );
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create view for job queue monitoring
CREATE OR REPLACE VIEW background_jobs_stats AS
SELECT 
    COUNT(*) FILTER (WHERE status = 'queued') as queued_jobs,
    COUNT(*) FILTER (WHERE status = 'processing') as processing_jobs,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_jobs,
    COUNT(*) as total_jobs,
    AVG(duration) FILTER (WHERE status = 'completed' AND duration IS NOT NULL) as avg_processing_time_ms,
    MAX(duration) FILTER (WHERE status = 'completed' AND duration IS NOT NULL) as max_processing_time_ms,
    MIN(created_at) as oldest_job_created,
    MAX(updated_at) as most_recent_update
FROM background_jobs;

COMMENT ON VIEW background_jobs_stats IS 'Real-time statistics for background job queue monitoring';

-- Grant permissions (adjust as needed for your user setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON background_jobs TO autollama_user;
-- GRANT SELECT ON background_jobs_stats TO autollama_user;
-- GRANT EXECUTE ON FUNCTION cleanup_old_background_jobs TO autollama_user;