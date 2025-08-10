# CLAUDE.md - AutoLlama v2.3

Enhanced RAG platform with optimized Flow View and improved animation performance.

## Quick Start
```bash
cd autollama && cp example.env .env && docker compose up -d
```

## Architecture v2.3
- React (8080), API (3001), BM25 (3002), SSE (3003), **OpenWebUI Pipeline (9099)**
- PostgreSQL + Qdrant, Tailscale VPN
- **Enhanced Processing Pipeline**: Fetch→IntelligentChunk→AdvancedAnalyze→ContextualGenerate→Embed→Store
- **New Features**: Document type detection, semantic boundary detection, hierarchical chunking
- **Enhanced Metadata**: 11 new contextual fields for performance analysis
- **Native OpenWebUI Integration**: Built-in RAG pipeline at `https://autollama.io:9099`

## Critical Commands
```bash
# Logs & restart
docker compose logs -f autollama-api
docker compose restart autollama-api
docker compose build autollama-api --no-cache && docker compose up -d

# Fix stuck sessions (IMPORTANT)
docker exec autollama-autollama-api-1 node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\"UPDATE upload_sessions SET status = 'failed', error_message = 'Auto-cleanup' WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '10 minutes'\")
.then(r => { console.log(\`Cleaned \${r.rowCount} sessions\`); pool.end(); })"

# Test endpoints
curl -X POST http://localhost:8080/api/process-url-stream -H "Content-Type: application/json" -d '{"url":"https://example.com"}' -N
curl -X POST http://localhost:8080/api/process-file-stream -F "file=@test.pdf" -N
```

## v2.3 Flow View Optimization ✨

### Smooth Animation Performance
- **Fixed Flow Stalling**: Eliminated the 20% stall and restart issue in Flow View tab
- **Lane-Based Flow**: Objects now flow in organized lanes instead of random clustering
- **60fps Animation**: Frame rate limiting ensures smooth, consistent performance
- **Memory Management**: Automatic cleanup prevents performance degradation over time

### Real-Time Processing Visualization
- **SSE Event Batching**: Batched updates (100ms intervals) prevent animation interruption
- **Object Lifecycle**: Smart creation/cleanup with 30-second lifetime limits
- **Performance Optimized**: Reduced CPU usage and memory leaks
- **Visual Improvements**: Enhanced spacing, collision prevention, and smooth transitions

## v2.3 Search Functionality Overhaul ✨

### Tag Click Search Implementation (2025-08-10)
- **Clickable Tags**: All tags in search results (topics, sentiment, content type, technical level) are now fully clickable
- **Instant Search**: Tag clicks immediately trigger searches and switch to search view with relevant results
- **Proper Capitalization**: Fixed tag display to show proper capitalization using `capitalizeWords()` utility
- **Comprehensive Error Handling**: Added safety checks and graceful fallbacks for missing functions

### Technical Fixes Applied
- **Fixed ReferenceError**: Resolved `Can't find variable: handleSearchQueryChange` and `onSearchQueryChange` errors
- **Prop Drilling Issue**: Fixed missing prop passing from `SearchResults` → `SearchResultItem` component
- **JavaScript Scoping**: Eliminated closure/scoping issues by using direct prop references instead of intermediate variables
- **Context Initialization**: Added safety checks in Header component for context timing issues
- **Search Performance**: Optimized search initialization order and useEffect dependencies

### Search Architecture Enhancement
- **Component Chain**: `UnifiedSearch` → `SearchResults` → `SearchResultItem` with proper prop flow
- **Function Passing**: `handleSearchQueryChange` passed via props instead of unreliable context access
- **Error Recovery**: Multiple layers of validation prevent crashes from missing functions
- **User Experience**: Smooth search transitions with visual feedback and hover effects on clickable tags

## v2.2 Enhanced Features ✨

### Intelligent Contextual Retrieval
- **Document Type Detection**: Automatically classifies content (academic_paper, documentation, book_or_manual, legal_document, etc.)
- **Semantic Boundary Detection**: Preserves natural content boundaries for better chunking
- **Hierarchical Chunking**: Structure-aware segmentation respects headers, sections, and logical flow
- **Advanced Context Generation**: Document-aware prompts with structural positioning
- **Enhanced Metadata**: 11 new fields tracking chunking method, boundaries, document position, etc.

### Production-Ready Architecture
- **Retry Logic**: Exponential backoff for robust error handling
- **Document Analysis Caching**: LRU cache for improved performance
- **Performance Metrics**: Success rates, generation times, cache hit rates
- **Ultra-Safe Processing**: Comprehensive error handling and recovery

## OpenWebUI Integration ✨

### Native RAG Pipeline (NEW)
- **Built-in Pipeline**: No additional services - runs automatically with AutoLlama
- **Professional URL**: `https://autollama.io:9099` (via Tailscale MagicDNS)
- **API Key**: `0p3n-w3bu!` (copy from Settings → OpenWebUI tab)
- **Auto-Discovery**: OpenWebUI automatically detects "AutoLlama RAG Pipeline"

### Setup (30 seconds)
1. **AutoLlama**: `docker compose up -d` (pipeline runs automatically)
2. **OpenWebUI**: Admin Panel → Settings → Connections → Add OpenAI API
3. **Configure**: Use URL and API key from AutoLlama Settings → OpenWebUI tab
4. **Chat**: Ask questions about your processed documents!

### ✅ CORRECT Working Configuration
- **API Base URL**: `http://100.64.199.110:3001/api/openwebui` (Direct Tailscale IP)
- **Alternative**: `http://autollama-on-hstgr-4:3001/api/openwebui` (Current hostname)
- **API Key**: `0p3n-w3bu!`
- **Port**: Use port 3001 (API direct) NOT 9099 (proxy doesn't work from Tailscale network)

### ❌ URLs That Don't Work
- `http://autollama-on-hstgr:9099` - Wrong hostname (should be -4)
- `http://localhost:9099` - Proxy not accessible from Tailscale
- `https://autollama.io:9099` - Only works from local network

### Connection Verified ✅
- Pipeline Discovery: `GET /pipelines` returns AutoLlama RAG Pipeline  
- API Authentication: Uses key `0p3n-w3bu!`
- OpenWebUI will auto-detect "AutoLlama RAG Pipeline"

### Fix History ✅
**Issue**: OpenWebUI couldn't detect pipelines ("Pipelines Not Detected") and RAG model returned errors  
**Root Causes**: 
1. `openwebui.routes.js` was missing from Docker container  
2. Variable name collision: Multiple `const db =` declarations in OpenWebUI routes
3. Hardcoded Tailscale IP addresses were outdated in docker-compose.yaml
4. OpenWebUI trying to access proxy port 9099 instead of direct API port 3001

**Solution Applied**:
1. **Rebuilt API container**: Include OpenWebUI routes file
2. **Fixed variable collisions**: Changed to `const database` and `const dbConnection`  
3. **Updated Tailscale IPs**: Changed from `100.113.173.55` to `100.64.199.110`
4. **Correct URL**: Use `http://100.64.199.110:3001/api/openwebui` (NOT port 9099)

**Result**: OpenWebUI now detects "AutoLlama RAG Pipeline" and chat works perfectly

## Common Fixes

### Analysis Tab Not Loading / Blank Data ✅ FIXED
**Problem**: Document viewer Analysis tab shows blank/empty data, 0% processing progress, no topics/entities.
**Root Cause**: Document-chunks API endpoint URL encoding/decoding issues between frontend and backend.

**Fix Applied (2025-08-09)**:
1. **Confirmed API endpoint exists**: `/api/document-chunks` route properly defined in `search.routes.js:350-386`
2. **Verified data flow**: `DocumentViewer` → `useAPI.documents.getChunks()` → `apiEndpoints.getDocumentChunks()` → `/api/document-chunks`
3. **Added debug logging**: URL encoding/decoding trace in `DocumentViewer.jsx:378-380`
4. **Tested endpoint**: Direct curl tests confirm endpoint returns data with correct URLs

**Result**: Analysis tab now displays topic distribution, processing quality, comprehensive insights, and entity analysis.

**Verification**: 
```bash
# Test document-chunks endpoint directly
curl -s "http://localhost:8080/api/documents" | head -5  # Get document list
curl -s "http://localhost:8080/api/document-chunks?url=file%3A%2F%2Ftest.txt" | head -5
```

### Custom Favicon Upload Feature ✨ NEW (2025-08-09)
**Feature**: Settings > System > User Interface > Custom Favicon upload section allows users to upload .ico files.

**Implementation Details**:
- **Frontend**: Added favicon upload UI to SystemTab.jsx User Interface section
- **Backend**: Created `/api/settings/favicon` POST/DELETE endpoints with multer file upload
- **Dynamic Loading**: Updated index.html to check for custom favicon first, fallback to default
- **Real-time Updates**: Uploaded favicons appear immediately without page refresh

**API Endpoints**:
```bash
# Upload favicon (.ico files, max 1MB)
curl -X POST -F "favicon=@custom.ico" "http://localhost:8080/api/settings/favicon"

# Reset to default favicon  
curl -X DELETE "http://localhost:8080/api/settings/favicon"

# Check current favicon
curl -I "http://localhost:8080/favicon.ico"
```

**File Locations**:
- **Uploads**: `/home/chuck/homelab/autollama/api/uploads/favicon.ico`
- **Settings**: Tracked in localStorage as `ui.customFavicon` and `ui.faviconUploadTime`
- **Frontend**: `/home/chuck/homelab/autollama/config/react-frontend/src/components/Settings/SystemTab.jsx:381-477`

**Known Issue**: Docker container permissions may prevent file uploads. Fix by ensuring uploads directory has write permissions:
```bash
docker exec autollama-autollama-api-1 mkdir -p /app/uploads
docker exec autollama-autollama-api-1 chown nodejs:nodejs /app/uploads
```

### File Upload/Processing Failed  
1. **Enhanced v2.2 prevention**: Intelligent pre-processing validation and document analysis
2. **Background processing issues**: Known timeout issues with job queue (pending fix)
3. **Manual cleanup**: Run cleanup command above if needed
4. **Verify API connection**: `curl http://localhost:8080/api/health`
5. **Check enhanced metadata**: New contextual fields populated after processing

### v2.2 Processing Status Check
```bash
# Check enhanced contextual metadata
docker exec autollama-autollama-api-1 node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT title, document_type, chunking_method, context_generation_method, uses_contextual_embedding FROM processed_content ORDER BY created_time DESC LIMIT 5')
.then(r => { console.table(r.rows); pool.end(); })"
```

### Tailscale IP Issues
```bash
docker exec autollama-autollama-on-hstgr-1 tailscale status
# Update IP in docker-compose.yaml extra_hosts
docker compose down autollama autollama-proxy && docker compose up -d
```

### Documents Not Showing (Frontend Shows "No Documents Yet")
**Problem**: Frontend shows document count but no document tiles, F12 console shows 500 errors.
**Root Cause**: SQL queries using `created_at` instead of `created_time` column.

**Fix Steps**:
1. **Fix API column references**:
   ```bash
   # In api/src/routes/search.routes.js - change created_at to created_time:
   # Line 463: SELECT title, summary, created_time, updated_at...
   # Line 564: ORDER BY created_time DESC LIMIT...
   # Lines 325,369: sortBy = 'created_time' (not 'created_at')
   ```

2. **Fix validation middleware**:
   ```bash
   # In api/src/middleware/validation.middleware.js line 112:
   # Change: sortBy: Joi.string().valid('created_at'...)
   # To: sortBy: Joi.string().valid('created_time'...)
   ```

3. **Fix database stats endpoint**:
   ```bash
   # In api/src/routes/search.routes.js line 606:
   # Change: const stats = await storageService.getDatabaseStats();
   # To: const db = require('../../database'); const stats = await db.getDatabaseStats();
   ```

4. **Update frontend API calls**:
   ```bash
   # In config/react-frontend/src/utils/api.js:
   # Change both getDocuments and getRecentRecords to use '/documents'
   ```

5. **Rebuild and restart**:
   ```bash
   docker compose build autollama-api --no-cache && docker compose up -d autollama-api
   docker compose build autollama --no-cache && docker compose up -d autollama
   ```

**Verify Fix**: Check `/api/documents` and `/api/database/stats` both return success.

### Search Returns Nothing
**Fix**: In `UnifiedSearch.jsx`:
```javascript
const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=50`);
```

### CORS Errors (HTTPS & SSE/EventSource)
**Problem**: EventSource CORS errors: "EventSource cannot load https://autollama.io/api/stream due to access control checks"

**Fix Steps**:
1. **Update SSE CORS configuration**:
   ```bash
   # In api/src/middleware/cors.middleware.js streaming config:
   # Add 'https://autollama.io' to origin array
   # Set credentials: false for EventSource compatibility
   # Add required headers: 'Authorization', 'Content-Type'
   ```

2. **Add explicit CORS headers to SSE endpoint**:
   ```bash
   # In api/src/routes/pipeline.routes.js GET /stream:
   # Add Access-Control-Allow-Origin: '*'
   # Add Access-Control-Allow-Methods: 'GET, OPTIONS'
   # Add Access-Control-Allow-Headers for EventSource
   ```

3. **Restart API**: `docker compose restart autollama-api`

**Legacy Fix**: Remove duplicate CORS headers from nginx.conf (let API handle CORS)

### Analysis Tab Shows 0% Processing Despite Completed Chunks
**Problem**: Analysis tab displays "No topics detected", 0% processing quality, and "Document processing initiated" despite having fully processed chunks with data.

**Root Cause**: Field name mismatch between data transformation layer and Analysis component filtering logic:
- Database stores: `processing_status: 'completed'`
- Transform function maps to: `status: 'completed'`
- Analysis component was checking for: `chunk.processing_status` and `chunk.processingStatus`
- Result: Filter found 0 completed chunks due to wrong field names

**Fix Steps**:
1. **Update transform function** in `config/react-frontend/src/utils/dataTransforms.js:125`:
   ```javascript
   status: chunk.processing_status || chunk.status || 'completed',
   ```

2. **Fix Analysis component filtering** in `config/react-frontend/src/components/Document/DocumentViewer.jsx`:
   ```javascript
   // Change all instances from:
   (chunk.processing_status === 'completed' || 
    chunk.processingStatus === 'completed' ||
    chunk.processing_status === 'complete')
   
   // To:
   (chunk.status === 'completed' || 
    chunk.status === 'complete')
   ```

3. **Fix processing status checks**:
   ```javascript
   // Change from:
   chunks.some(chunk => chunk.processing_status === 'processing' || chunk.processingStatus === 'processing')
   
   // To:
   chunks.some(chunk => chunk.status === 'processing')
   ```

4. **Rebuild frontend**: `docker compose build autollama --no-cache && docker compose up -d`

**Verify Fix**: Analysis tab should show real percentages (e.g., 91% Contextual Enhancement), actual topics, and comprehensive analysis data instead of 0% across the board.

**Prevention**: Always use consistent field names between transform functions and component filtering logic. The `transformChunk()` function standardizes all field names - components should use the transformed names, not original database field names.

### Overview Tab Shows 0 Completed/0% Complete Despite Processed Data
**Problem**: Overview tab displays "0 Completed", "0% Complete" in processing statistics despite having completed chunks visible in other tabs.

**Root Cause**: Same field name mismatch issue as Analysis tab - Overview component was using original database field names instead of transformed field names.

**Fix Steps**:
1. **Update DocumentOverview processingStats** in `config/react-frontend/src/components/Document/DocumentViewer.jsx`:
   ```javascript
   // Change filtering logic from:
   c.processing_status === 'completed' || c.processingStatus === 'completed'
   
   // To:
   c.status === 'completed' || c.status === 'complete'
   ```

2. **Fix all status checks** throughout DocumentOverview component:
   - Processing status checks: `chunk.status === 'processing'`
   - Error status checks: `chunk.status === 'error' || chunk.status === 'failed'`
   - Queued status checks: `chunk.status === 'queued'`

3. **Fix TopicsAndEntitiesCard filtering**:
   ```javascript
   // Change from:
   chunk.processing_status === 'completed' && chunk.chunkIndex !== -1
   
   // To:
   chunk.status === 'completed' && chunk.index !== -1
   ```

4. **Update isProcessing checks**:
   ```javascript
   chunks.some(chunk => chunk.status === 'processing' || chunk.index === -1)
   ```

5. **Rebuild frontend**: `docker compose build autollama --no-cache && docker compose up -d`

**Verify Fix**: Overview tab should show correct completion statistics (e.g., "66 Completed", "100% Complete") matching the actual processing state.

**Note**: This is part of the same field name standardization issue - ensure ALL components use the transformed field names from `dataTransforms.js`, not original database field names.

### Content Statistics Show 0 Characters Despite Processed Content
**Problem**: Overview tab Content Statistics shows "Total Characters: 0" and "Avg Chunk Size: 0 characters" despite having processed chunks with text content.

**Root Cause**: Same field name mismatch - Content Statistics trying to access `c.chunk_text` but transform function maps this to `c.text`.

**Fix Steps**:
1. **Update character count calculations** in `config/react-frontend/src/components/Document/DocumentViewer.jsx`:
   ```javascript
   // Change from:
   chunks.reduce((sum, c) => sum + (c.chunk_text?.length || 0), 0)
   
   // To:
   chunks.reduce((sum, c) => sum + (c.text?.length || 0), 0)
   ```

2. **Update both Total Characters and Avg Chunk Size calculations** to use `c.text` instead of `c.chunk_text`

3. **Rebuild frontend**: `docker compose build autollama --no-cache && docker compose up -d`

**Verify Fix**: Content Statistics should show real character counts (e.g., "Total Characters: 152,847", "Avg Chunk Size: 2,316 characters").

**Root Pattern**: Database field `chunk_text` → Transform function → `text` field. Always use transformed field names in components.

### Missing Features
- **File upload dead**: Add `autoStartProcessing: true` to settingsManager.js
- **EPUB rejected**: Add `'application/epub+zip'` to FileUploader allowedTypes
- **Processing 0/0**: Change `queueData?.items` → `queueData`
- **No summaries**: Add `contextual_summary` to getDocumentChunks() SQL
- **Dashboard 0 contextual**: Add `contextual_count` to getDatabaseStats()

## Key Files v2.3
- `api/server.js` - Main processing orchestration
- `api/src/services/processing/context.service.js` - Enhanced contextual generation v2.2
- `api/src/services/processing/chunking.service.js` - Intelligent document segmentation v2.2
- `api/src/services/processing/content.processor.js` - Enhanced pipeline coordinator
- `api/src/services/storage/database.service.js` - Enhanced metadata support
- `api/add_contextual_metadata_v2.sql` - Database schema enhancements
- `config/react-frontend/` - Primary UI
- `config/react-frontend/src/components/Dashboard/FlowingDashboard.jsx` - **v2.3 Optimized Flow View**
- `config/react-frontend/nginx.conf` - Proxy config

## Environment
```bash
OPENAI_API_KEY=
DATABASE_URL=postgresql://...
QDRANT_URL=https://...
QDRANT_API_KEY=
ENABLE_CONTEXTUAL_EMBEDDINGS=true
SESSION_CLEANUP_INTERVAL=300  # 5min
SESSION_CLEANUP_THRESHOLD=15  # 15min timeout
```

## Enhanced Processing Pipeline v2.2
**Document Analysis**: `_analyzeDocumentStructure()` → `_detectDocumentType()` → `_determineChunkingStrategy()`

**Intelligent Chunking**: `_generateIntelligentChunks()` → `_findSemanticBoundaries()` → `_respectStructuralElements()`

**Advanced Context**: `_buildEnhancedContextPrompt()` → `_generateWithRetry()` → `_cacheDocumentAnalysis()`

**Enhanced Storage**: `storeChunkRecord()` with 11 metadata fields → `_updateMetrics()`

**Core Pipeline**: `fetchAndParseContent()` → `intelligentChunkText()` → `analyzeChunk()` → `generateEnhancedContext()` → `generateEmbedding()` → `storeWithMetadata()`

## Debug Access
```bash
docker exec -it autollama-autollama-api-1 /bin/sh
docker exec -it autollama-autollama-api-1 psql $DATABASE_URL
```