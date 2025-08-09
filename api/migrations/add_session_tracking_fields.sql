-- Enhanced Session Tracking Fields
-- Add columns to upload_sessions table for improved tracking

-- Add new tracking fields
ALTER TABLE upload_sessions 
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS tracking_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS process_id INTEGER,
ADD COLUMN IF NOT EXISTS node_instance VARCHAR(255),
ADD COLUMN IF NOT EXISTS emergency_recovered BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS orphan_cleanup BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS orphan_type VARCHAR(50);

-- Create index for efficient orphan detection
CREATE INDEX IF NOT EXISTS idx_upload_sessions_tracking 
ON upload_sessions (status, tracking_enabled, last_activity);

-- Create index for session lookup
CREATE INDEX IF NOT EXISTS idx_upload_sessions_session_id 
ON upload_sessions (session_id) WHERE status = 'processing';

-- Create index for orphan detection
CREATE INDEX IF NOT EXISTS idx_upload_sessions_orphan_detection 
ON upload_sessions (status, last_activity, tracking_enabled) 
WHERE status = 'processing';

-- Update existing sessions to have tracking enabled
UPDATE upload_sessions 
SET 
  tracking_enabled = true,
  last_activity = COALESCE(updated_at, created_at)
WHERE tracking_enabled IS NULL;

-- Add a constraint to ensure session_id is not null for tracked sessions
ALTER TABLE upload_sessions 
ADD CONSTRAINT chk_tracked_session_id 
CHECK (
  (tracking_enabled = false) OR 
  (tracking_enabled = true AND session_id IS NOT NULL)
);

-- Create function to automatically update last_activity
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update last_activity on any update
DROP TRIGGER IF EXISTS trg_update_session_activity ON upload_sessions;
CREATE TRIGGER trg_update_session_activity
  BEFORE UPDATE ON upload_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_session_activity();

-- Create view for active tracked sessions
CREATE OR REPLACE VIEW active_tracked_sessions AS
SELECT 
  session_id,
  filename,
  status,
  total_chunks,
  completed_chunks,
  CASE 
    WHEN total_chunks > 0 THEN ROUND((completed_chunks::DECIMAL / total_chunks) * 100, 2)
    ELSE 0 
  END as progress_percent,
  created_at,
  updated_at,
  last_activity,
  EXTRACT(EPOCH FROM (NOW() - COALESCE(last_activity, updated_at)))/60 as minutes_since_activity,
  process_id,
  node_instance,
  emergency_recovered,
  orphan_cleanup
FROM upload_sessions
WHERE status = 'processing' 
AND tracking_enabled = true
ORDER BY last_activity DESC;

-- Create view for orphaned sessions
CREATE OR REPLACE VIEW orphaned_sessions AS
SELECT 
  session_id,
  filename,
  status,
  created_at,
  updated_at,
  last_activity,
  EXTRACT(EPOCH FROM (NOW() - COALESCE(last_activity, updated_at)))/60 as minutes_since_activity,
  process_id,
  node_instance
FROM upload_sessions
WHERE status = 'processing' 
AND tracking_enabled = true
AND (
  last_activity < NOW() - INTERVAL '30 minutes' OR
  (last_activity IS NULL AND updated_at < NOW() - INTERVAL '30 minutes')
)
ORDER BY COALESCE(last_activity, updated_at) ASC;

-- Add comments
COMMENT ON COLUMN upload_sessions.last_activity IS 'Timestamp of last session activity/heartbeat';
COMMENT ON COLUMN upload_sessions.tracking_enabled IS 'Whether this session is actively tracked for orphan detection';
COMMENT ON COLUMN upload_sessions.process_id IS 'OS process ID handling this session';
COMMENT ON COLUMN upload_sessions.node_instance IS 'Node instance identifier for multi-instance deployments';
COMMENT ON COLUMN upload_sessions.emergency_recovered IS 'Whether this session was recovered from emergency state';
COMMENT ON COLUMN upload_sessions.orphan_cleanup IS 'Whether this session was cleaned up as an orphan';
COMMENT ON COLUMN upload_sessions.orphan_type IS 'Type of orphan detection that triggered cleanup';

COMMENT ON VIEW active_tracked_sessions IS 'Active processing sessions with tracking enabled';
COMMENT ON VIEW orphaned_sessions IS 'Sessions that appear to be orphaned (no activity for 30+ minutes)';

-- Create cleanup function for manual orphan cleanup
CREATE OR REPLACE FUNCTION cleanup_orphaned_sessions(
  timeout_minutes INTEGER DEFAULT 30,
  dry_run BOOLEAN DEFAULT true
)
RETURNS TABLE (
  session_id VARCHAR,
  filename VARCHAR,
  minutes_inactive NUMERIC,
  action VARCHAR
) AS $$
DECLARE
  session_record RECORD;
  cleanup_count INTEGER := 0;
BEGIN
  FOR session_record IN 
    SELECT s.session_id, s.filename, 
           EXTRACT(EPOCH FROM (NOW() - COALESCE(s.last_activity, s.updated_at)))/60 as minutes_inactive
    FROM upload_sessions s
    WHERE s.status = 'processing' 
    AND s.tracking_enabled = true
    AND (
      s.last_activity < NOW() - INTERVAL concat(timeout_minutes, ' minutes') OR
      (s.last_activity IS NULL AND s.updated_at < NOW() - INTERVAL concat(timeout_minutes, ' minutes'))
    )
  LOOP
    session_id := session_record.session_id;
    filename := session_record.filename;
    minutes_inactive := session_record.minutes_inactive;
    
    IF dry_run THEN
      action := 'DRY_RUN_WOULD_CLEANUP';
    ELSE
      UPDATE upload_sessions 
      SET status = 'failed',
          error_message = 'Cleaned up as orphaned session',
          orphan_cleanup = true,
          orphan_type = 'manual_cleanup',
          updated_at = NOW()
      WHERE upload_sessions.session_id = session_record.session_id;
      
      cleanup_count := cleanup_count + 1;
      action := 'CLEANED_UP';
    END IF;
    
    RETURN NEXT;
  END LOOP;
  
  IF NOT dry_run THEN
    RAISE NOTICE 'Cleaned up % orphaned sessions', cleanup_count;
  ELSE
    RAISE NOTICE 'DRY RUN: Would clean up % orphaned sessions', cleanup_count;
  END IF;
END;
$$ LANGUAGE plpgsql;