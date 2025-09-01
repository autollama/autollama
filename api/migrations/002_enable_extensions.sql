-- Migration: Enable Required PostgreSQL Extensions
-- Date: 2025-09-01
-- Purpose: Enable all PostgreSQL extensions required by AutoLlama

-- Enable UUID generation functions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable vector operations for embeddings (if available)
CREATE EXTENSION IF NOT EXISTS "vector";

-- Enable trigram search for better text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Confirm extensions are enabled
SELECT 'PostgreSQL extensions enabled successfully' as status;