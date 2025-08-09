# AutoLlama Database Guide

## Overview
AutoLlama uses two databases that work together:

1. **Qdrant** - Vector database for AI-powered semantic search
2. **Airtable** - Structured database for metadata and content management

## Database Purposes

### Qdrant (Vector Database)
- **Purpose**: Stores text embeddings for semantic/similarity search
- **URL**: https://c4c8ee46-d9dd-4c0f-a00e-9215675351da.us-west-1-0.aws.cloud.qdrant.io
- **Collection**: autollama-content
- **What it stores**: 
  - Text chunks as 1536-dimensional vectors
  - Metadata (title, URL, tags, summary, etc.)
- **Used for**: Finding similar content based on meaning, not just keywords

### Airtable (Structured Database)
- **Purpose**: Human-readable content storage and management
- **Base ID**: appi5lnDWjvstGsqr
- **Table ID**: tblrO3XjykQIqURb4
- **What it stores**: Same content but in spreadsheet format
- **Used for**: Browsing, filtering, manual review, and traditional queries

## Viewing Qdrant Contents

To see what's stored in Qdrant:
```bash
./view_qdrant.sh
```

This shows:
- Collection status and configuration
- All stored points with their metadata
- Total number of points in the database

## Keeping Qdrant Active

Qdrant free tier suspends after inactivity. To prevent suspension:
```bash
# Run any API request, like viewing collections
curl -X GET "https://c4c8ee46-d9dd-4c0f-a00e-9215675351da.us-west-1-0.aws.cloud.qdrant.io/collections" \
  -H "api-key: [QDRANT_API_KEY_REMOVED]"
```

## How They Work Together

1. Content is processed through the n8n workflow
2. Text is chunked and analyzed by AI
3. Each chunk gets:
   - Embedded into a vector (stored in Qdrant)
   - Saved with metadata (stored in both Qdrant and Airtable)
4. Users can:
   - Search semantically via Qdrant
   - Browse/manage via Airtable UI