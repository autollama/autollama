#!/bin/bash
# AutoLlama Schema Fix Script
# Fixes database schema issues for document tiles not displaying

echo "🔧 AutoLlama Schema Fix Script"
echo "This will fix database schema issues preventing document tiles from displaying"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if docker compose is running
if ! docker compose ps | grep -q "autollama-api.*Up"; then
    echo -e "${RED}❌ AutoLlama containers are not running${NC}"
    echo "Please start AutoLlama first:"
    echo "  docker compose up -d"
    exit 1
fi

echo -e "${BLUE}🔍 Checking database schema...${NC}"

# Function to run SQL in the database
run_sql() {
    docker exec autollama-postgres psql -U autollama -d autollama -c "$1"
}

# Function to run SQL from API container
run_migration() {
    docker exec autollama-api node /app/run-migrations.js
}

echo -e "${YELLOW}📊 Adding missing columns to processed_content table...${NC}"

# Add missing v2.3 columns
run_sql "
ALTER TABLE processed_content 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS document_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS chunking_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS boundaries_respected TEXT[],
ADD COLUMN IF NOT EXISTS semantic_boundary_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS structural_context TEXT,
ADD COLUMN IF NOT EXISTS document_position FLOAT,
ADD COLUMN IF NOT EXISTS section_title TEXT,
ADD COLUMN IF NOT EXISTS section_level INTEGER,
ADD COLUMN IF NOT EXISTS context_generation_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS context_generation_time INTEGER,
ADD COLUMN IF NOT EXISTS context_cache_hit BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS record_type VARCHAR(20) DEFAULT 'chunk',
ADD COLUMN IF NOT EXISTS parent_document_id INTEGER;
"

echo -e "${YELLOW}🏗️ Creating background_jobs table...${NC}"

# Create background_jobs table
run_sql "
CREATE TABLE IF NOT EXISTS background_jobs (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  data JSONB,
  error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  session_id VARCHAR(255),
  job_id VARCHAR(255),
  url TEXT,
  file_data JSONB,
  retries INTEGER DEFAULT 0,
  duration INTEGER
);
"

echo -e "${YELLOW}📋 Updating upload_sessions table...${NC}"

# Add missing columns to upload_sessions
run_sql "
ALTER TABLE upload_sessions 
ADD COLUMN IF NOT EXISTS duration INTEGER;
"

echo -e "${YELLOW}🔍 Creating indexes for performance...${NC}"

# Create performance indexes
run_sql "
CREATE INDEX IF NOT EXISTS idx_processed_content_parent_document_id ON processed_content(parent_document_id);
CREATE INDEX IF NOT EXISTS idx_processed_content_record_type ON processed_content(record_type);
CREATE INDEX IF NOT EXISTS idx_processed_content_updated_at ON processed_content(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_session_id ON background_jobs(session_id);
"

echo -e "${BLUE}🔄 Restarting API container to apply changes...${NC}"
docker compose restart autollama-api

# Wait for API to restart
echo -e "${YELLOW}⏳ Waiting for API to restart...${NC}"
sleep 8

echo -e "${BLUE}✅ Testing API endpoints...${NC}"

# Test if API is responding
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/documents)
if [ "$API_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ API is responding correctly${NC}"
    
    # Check if documents are now visible
    DOC_COUNT=$(curl -s http://localhost:8080/api/documents | grep -o '"total":[0-9]*' | cut -d: -f2)
    echo -e "${GREEN}📄 Found $DOC_COUNT documents${NC}"
    
    if [ "$DOC_COUNT" -gt 0 ]; then
        echo -e "${GREEN}🎉 SUCCESS! Document tiles should now be visible${NC}"
        echo ""
        echo -e "${BLUE}Next steps:${NC}"
        echo "1. Open http://localhost:8080 in your browser"
        echo "2. Your document tiles should now be visible"
        echo "3. Upload a new file to test the complete pipeline"
        echo ""
        echo -e "${YELLOW}💡 Pro tip: Make sure to populate your OpenAI API key in the .env file for best results${NC}"
        echo "   Edit .env and replace 'your_openai_api_key_here' with your actual API key"
    else
        echo -e "${YELLOW}⚠️ No documents found. Try uploading a file to test the system.${NC}"
    fi
else
    echo -e "${RED}❌ API not responding. Check logs with: docker compose logs autollama-api${NC}"
fi

echo ""
echo -e "${BLUE}🔧 Schema fix completed!${NC}"