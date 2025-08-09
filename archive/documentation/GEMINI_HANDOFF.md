# AutoLlama Chunk Explorer - Gemini Handoff Document

## 🎯 Current Status

**ALMOST COMPLETE** - The AutoLlama Chunk Explorer implementation is 95% done. All backend APIs work, all database changes are complete, and most frontend features work. 

**REMAINING ISSUE**: The new document detail view isn't displaying correctly - user still sees old individual chunk view instead of the new document overview with all chunks listed.

## 📋 Project Context

### What is AutoLlama?
AutoLlama.io is an intelligent content analysis platform that processes URLs and PDFs, extracts meaningful content, and structures it using AI for knowledge management. It runs as part of a homelab infrastructure with Docker and Tailscale VPN.

### Original Problem
User reported confusion about the relationship between:
- **Chunks**: Individual text segments (1200 chars each) stored in database/vector DB
- **Documents**: URLs/files that contain many chunks (e.g., 1 PDF = 200+ chunks)
- **Sidebar entries**: Showed document summaries, not individual chunks

User saw "690/1219 chunks in progress" but only ~37 sidebar entries, creating confusion about the one-to-many relationship.

## 🏗️ Architecture Overview

### Docker Infrastructure
```yaml
# Location: /home/chuck/homelab/autollama/docker-compose.yaml
Services:
- autollama-on-hstgr: Tailscale VPN sidecar
- autollama-api: Node.js Express API (port 3001)
- autollama: Nginx reverse proxy (serves static files)
- autollama-proxy: Exposes Tailscale network to localhost:8080
- autollama-pipelines: Qdrant vector database
```

### Network Architecture
- **External Access**: http://localhost:8080 (via autollama-proxy)
- **Internal API**: http://localhost:3001 (autollama-api container)
- **Tailscale IP**: 100.113.173.55 (internal VPN network)
- **All services except proxy use**: `network_mode: service:autollama-on-hstgr`

### Database Schema
**PostgreSQL Database**: `autollama` 
**Connection**: `postgresql://postgres:postgres@localhost:5432/autollama`

Key tables:
```sql
-- Main content storage (one row per chunk)
processed_content (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,                    -- Document URL/file path
    title VARCHAR(500),                   -- Chunk title
    summary TEXT,                         -- Chunk summary  
    chunk_text TEXT,                      -- Raw chunk content
    chunk_id VARCHAR(255) UNIQUE,        -- Unique chunk identifier
    chunk_index INTEGER,                  -- Order within document
    sentiment VARCHAR(50),
    category VARCHAR(100),
    content_type VARCHAR(50),
    processing_status VARCHAR(50),        -- 'completed', 'processing', 'failed'
    embedding_status VARCHAR(50),         -- 'complete', 'pending'
    created_time TIMESTAMP,
    processed_date TIMESTAMP
);

-- Aggregated document view (NEW - added for chunk explorer)
CREATE VIEW document_summaries AS
SELECT 
    url,
    MAX(title) as document_title,
    MAX(summary) as document_summary,
    COUNT(*) as total_chunks,
    COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as completed_chunks,
    COUNT(CASE WHEN embedding_status = 'complete' THEN 1 END) as embedded_chunks,
    CASE 
        WHEN COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) = COUNT(*) THEN 'completed'
        WHEN COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) > 0 THEN 'failed'
        ELSE 'processing'
    END as document_status,
    MAX(category) as category,
    MAX(content_type) as content_type,
    MAX(sentiment) as overall_sentiment
FROM processed_content 
GROUP BY url;
```

## 🔧 Implementation Completed

### ✅ Phase 1: Database & API Foundation
**Files Modified:**
- `/home/chuck/homelab/autollama/api/database.js` - Added new functions
- `/home/chuck/homelab/autollama/api/server.js` - Added new endpoints  
- `/home/chuck/homelab/autollama/config/nginx.conf` - Added proxy rules

**New API Endpoints:**
```javascript
GET /api/documents                           // List all documents with chunk counts
GET /api/document/:encodedUrl/chunks         // Get chunks for specific document  
GET /api/document/:encodedUrl/summary        // Get document summary
GET /api/search/grouped                      // Search results grouped by document
```

**New Database Functions:**
```javascript
// In /home/chuck/homelab/autollama/api/database.js
getAllDocuments(limit, offset)              // Get document list with statistics
getDocumentChunks(url, page, limit)         // Get paginated chunks for document
searchContentGrouped(searchQuery, limit)    // Search grouped by document
getDocumentSummary(url)                      // Get single document summary
```

### ✅ Phase 2: Frontend Implementation  
**Files Modified:**
- `/home/chuck/homelab/autollama/config/view-manager.js` - Main UI logic
- `/home/chuck/homelab/autollama/config/index.html` - Web interface (static)

**Completed Features:**
1. **Document-centric sidebar**: Shows documents with chunk counts and status
2. **Expandable chunk lists**: Click arrows to see chunks within documents  
3. **Visual status indicators**: ✓ (completed), ⟳ (processing), ✗ (failed)
4. **Grouped search results**: Search shows documents with matching chunks
5. **Progress bars**: For documents still being processed

## 🐛 CURRENT BUG - Last Remaining Issue

### Problem Description
When user clicks on a document title, they still see the **old individual chunk detail view** instead of the **new document overview**. 

The old view shows:
```
Visions of Fear and Contemplation
file:// C. G. Jung - The Red Book...
Summary: [single chunk summary]
[individual chunk details]
```

The NEW view should show:
```
[Document Title] 
[Document URL]
[X total chunks, Y completed, Z% processed]
Document Summary: [document-level summary]
All Chunks (X):
  - Chunk 1: [title] [summary] ✓
  - Chunk 2: [title] [summary] ✓  
  - Chunk 3: [title] [summary] ⟳
  [etc...]
```

### Technical Analysis

**Functions Involved:**
1. `showDocumentDetail(url)` - SHOULD show new document view
2. `showDetail(recordId)` - Shows old individual chunk view  
3. `displayDocumentDetailView(documentSummary, chunks)` - Renders new layout

**Click Handler in HTML:**
```javascript
// This SHOULD call showDocumentDetail() for new view
onclick="viewManager.showDocumentDetail('${encodeURIComponent(document.url)}')"

// This calls showDetail() for old individual chunk view  
onclick="viewManager.showChunkDetail('${chunk.id}')"
```

**Current Status:**
- ✅ API endpoints work (tested via curl)
- ✅ Database queries work  
- ✅ `showDocumentDetail()` function exists and has debug logging
- ❌ User still sees old view when clicking documents

### Debugging Added
I added console logging to `showDocumentDetail()`:
```javascript
console.log('🔍 showDocumentDetail called with URL:', url);
console.log('📡 Loading document data for:', encodedUrl);
console.log('📊 Document summary:', summaryResponse);
console.log('📚 Document chunks:', chunksResponse);
```

## 🔍 Debugging Steps for Gemini

### Step 1: Verify Function Calls
1. Open browser to http://localhost:8080
2. Go to Search tab
3. Open browser console (F12 → Console)
4. Click on a document title (main clickable area, not expand arrow)
5. Check if console shows the debug logs starting with 🔍

**If NO logs appear**: The click handler isn't calling `showDocumentDetail()`
**If logs appear**: The function runs but `displayDocumentDetailView()` might not render correctly

### Step 2: Test API Endpoints Directly
```bash
# Test document summary endpoint
curl -s "http://localhost:8080/api/document/https%253A%252F%252Fwww.google.com/summary"

# Test document chunks endpoint  
curl -s "http://localhost:8080/api/document/https%253A%252F%252Fwww.google.com/chunks?limit=3"

# Test documents list
curl -s "http://localhost:8080/api/documents" | head -50
```

### Step 3: Inspect Click Handlers
Check the generated HTML in browser dev tools. Document cards should have:
```html
<div onclick="viewManager.showDocumentDetail('...')">
  <!-- Document title and info -->
</div>
```

NOT:
```html  
<div onclick="viewManager.showDetail('...')">
```

### Step 4: Check View Routing
The `showView('detail', url)` function might be routing incorrectly. Check if there's conflict between:
- Individual chunk details (old): `showDetail(chunkId)`
- Document details (new): `showDocumentDetail(url)`

## 🎯 Completion Tasks for Gemini

### Primary Task: Fix Document Detail View
**Goal**: Make clicking on document titles show the new document overview instead of individual chunk view.

**Possible Causes:**
1. **Click handler not working**: `onclick` attribute not calling `showDocumentDetail()`
2. **View routing issue**: `showView()` function routing to wrong display function
3. **JavaScript errors**: Check browser console for errors preventing new view
4. **Caching issue**: Old JavaScript cached in browser
5. **Template rendering**: `displayDocuments()` generating wrong click handlers

### Secondary Tasks (if time permits):
1. **Add navigation between chunks** in document detail view
2. **Add "Back to Documents" button** in detail view
3. **Improve error handling** for missing documents
4. **Add loading states** during navigation

## 📁 Key Files Reference

### Configuration Files
- `CLAUDE.md` - Project instructions and patterns
- `docker-compose.yaml` - Service definitions
- `example.env` - Environment template

### API Layer  
- `api/server.js` - Express routes and business logic
- `api/database.js` - PostgreSQL queries and data access
- `api/package.json` - Node.js dependencies

### Frontend Layer
- `config/index.html` - Main web interface 
- `config/view-manager.js` - JavaScript UI logic (MAIN FILE TO DEBUG)
- `config/nginx.conf` - Reverse proxy configuration

### Database
- `api/create_tables.sql` - Schema definitions
- Connection: `postgresql://postgres:postgres@localhost:5432/autollama`

## 🧪 Testing Commands

```bash
# Container management
cd /home/chuck/homelab/autollama
docker compose ps                    # Check container status
docker compose logs -f autollama-api # Check API logs  
docker compose restart autollama     # Restart nginx (for JS changes)

# API testing
curl http://localhost:8080/health
curl http://localhost:8080/api/documents | head -20
curl "http://localhost:8080/api/search/grouped?q=jesus" | head -30

# Database testing (if needed)
docker exec -it postgres-postgres-1 psql -U postgres -d autollama
```

## 🎯 Success Criteria

When fixed, user should be able to:
1. Click on any document title in the search view
2. See a new layout with:
   - Document title in gradient header
   - Total chunks, completed chunks, progress percentage
   - Document summary section  
   - "All Chunks" list showing every chunk in the document
   - Each chunk clickable to see individual chunk details

**The document overview should look completely different from the current individual chunk view.**

## 💡 Debugging Tips

1. **Start with browser console** - Check for JavaScript errors and debug logs
2. **Inspect generated HTML** - Verify click handlers point to correct functions  
3. **Test with simple document** - Try Google.com (only 2 chunks) for easier debugging
4. **Check network requests** - Verify API calls are made when clicking documents
5. **Compare working vs broken** - Individual chunk links work, document links don't

The implementation is 95% complete - this is just a routing/click handler issue preventing the final feature from displaying correctly.