-- Fix processing status constraint to allow modern status values
-- This fixes the constraint violation: "new row for relation processed_content violates check constraint processing_status_check"

-- Drop the old constraint
ALTER TABLE processed_content DROP CONSTRAINT IF EXISTS processing_status_check;

-- Add the updated constraint with modern status values
ALTER TABLE processed_content ADD CONSTRAINT processing_status_check 
CHECK (processing_status::text = ANY (ARRAY[
    'pending'::character varying,
    'processing'::character varying, 
    'completed'::character varying,
    'failed'::character varying,    -- Modern: replaces 'error'
    'cancelled'::character varying,
    'retrying'::character varying
]::text[]));

-- For backward compatibility, also update any existing 'error' status to 'failed'
UPDATE processed_content SET processing_status = 'failed' WHERE processing_status = 'error';

-- Confirm the fix
SELECT 'Constraint updated successfully' as status;