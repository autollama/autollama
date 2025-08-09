-- Migration: Add settings table for storing API configuration
-- This allows the frontend to store API keys and other settings in the database
-- instead of relying on environment variables

CREATE TABLE IF NOT EXISTS api_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(255) UNIQUE NOT NULL,
    setting_value TEXT,
    encrypted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_api_settings_key ON api_settings(setting_key);

-- Insert default settings (with placeholder values)
INSERT INTO api_settings (setting_key, setting_value, encrypted) VALUES
    ('openai_api_key', '', TRUE),
    ('qdrant_url', 'https://c4c8ee46-d9dd-4c0f-a00e-9215675351da.us-west-1-0.aws.cloud.qdrant.io', FALSE),
    ('qdrant_api_key', '', TRUE),
    ('anthropic_api_key', '', TRUE),
    ('google_api_key', '', TRUE),
    ('enable_contextual_embeddings', 'true', FALSE),
    ('contextual_embedding_model', 'gpt-4o-mini', FALSE)
ON CONFLICT (setting_key) DO NOTHING;

-- Update function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS update_api_settings_timestamp ON api_settings;
CREATE TRIGGER update_api_settings_timestamp
    BEFORE UPDATE ON api_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_settings_timestamp();