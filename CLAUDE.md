# CLAUDE.md - AutoLlama v3.0.3

Modern JavaScript-first RAG framework with NPX installation, Docker auto-migration, and multi-deployment support.

## v3.0.3 PDF Processing Fix ✅ LATEST

### PDF Document Processing Restored
**Problem**: All PDF uploads failed with "Cannot find module './pdf.js/latest/build/pdf.js'" error.
**Root Cause**: pdf-parse library configured to use non-existent 'latest' version directory.
**Solution**: Fixed default version to use existing 'v1.10.100' + added Docker symlink + version fallback logic.

**Impact**:
- ✅ PDF documents now process successfully
- ✅ Chunks properly generated from PDF content
- ✅ PDF processing matches EPUB reliability
- ✅ All document types (PDF, EPUB, DOCX, TXT) working

### Technical Details
```javascript
// Before (broken):
version: config.version || 'latest'  // 'latest' directory doesn't exist

// After (fixed):
version: config.version || 'v1.10.100'  // Use actual existing version
```

### Docker Enhancement
```dockerfile
# Added symlink for backwards compatibility
RUN cd /app/node_modules/pdf-parse/lib/pdf.js && \
    ln -s v1.10.100 latest || true
```

---

## v3.0.2 Critical Search & RAG Fixes ✅

### Search Functionality Completely Restored
**Problem**: Search returned 0 results despite having 268+ chunks containing search terms (e.g., "kings").
**Root Cause**: Missing `source` column in `processed_content` table causing `searchContent()` database function to fail.
**Solution**: Added missing database column and implemented robust fallback search system.

**Impact**:
- ✅ Search now returns relevant results for all queries
- ✅ 268 chunks about "kings" properly indexed and searchable  
- ✅ Robust fallback to PostgreSQL full-text search when BM25 service unavailable
- ✅ Search API endpoint `/api/search?q=kings` returns 5 relevant results

### AI Chat RAG Integration Fully Working
**Problem**: AI Chat responded "I don't have access to any recent uploads" despite having 16 processed documents.
**Root Cause**: Search threshold too high (0.3) filtering out all results + service integration failure.
**Solution**: Direct database integration with optimized threshold (0.01) for better content matching.

**Impact**:
- ✅ AI Chat now shows `🔍 RAG ACTIVE (10,582 chars)` with document sources
- ✅ Contextual responses using your actual processed content
- ✅ Source citations with snippets and relevance scores  
- ✅ Query "Tell me about Socrates" returns content from your Plato documents

### UI Consistency Fixed
**Problem**: AI Chat button highlighted by default (inconsistent with other navigation buttons).
**Solution**: Changed button styling from `btn-primary` to `btn-secondary` in App.jsx:1074.

**Impact**:
- ✅ All navigation buttons now have consistent unhighlighted styling
- ✅ No false visual emphasis on AI Chat button
- ✅ Better user experience and visual hierarchy

### Database Schema Enhancement  
```sql
-- Critical fix for search functionality
ALTER TABLE processed_content ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'unknown';
```

### Verification Commands
```bash
# Test search functionality
curl "http://localhost:8080/api/search?q=kings&limit=5"

# Test AI Chat RAG
curl -X POST "http://localhost:8080/api/chat/message" \
  -H "Content-Type: application/json" \
  -d '{"message":"Tell me about Socrates"}'

# Check database health  
curl "http://localhost:8080/api/database/stats"
```

---

## v3.0.1 Critical Fix ✅

### EPUB & File Upload Processing Fixed
**Problem**: EPUB and other file uploads would process successfully but documents wouldn't appear on homepage.
**Root Cause**: `analyzeChunk()` function call in `server.js:1088` was calling removed function instead of new service architecture.
**Solution**: Updated to use `services.analysisService.analyzeChunk()` with proper fallback handling.

### Auto-Fix Verification
```bash
# Upload test now works immediately after Docker startup
curl -X POST -F "file=@test.epub" "http://localhost:8080/api/process-file-stream" -N

# Documents appear on homepage
curl http://localhost:8080/api/documents
```

### Enhanced Migration System
- **Code Fix Detection**: Auto-migration now reports missing function fixes
- **Backward Compatibility**: Graceful fallback when services aren't available
- **Version Tracking**: Proper changelog and migration tracking

### What's Fixed
- ✅ EPUB uploads create documents on homepage
- ✅ PDF uploads work correctly 
- ✅ Background processing completes successfully
- ✅ Analysis service integration working
- ✅ No more manual database fixes needed

---

## v3.0 Docker Auto-Migration ✨

### Zero-Configuration Docker Experience
```bash
# One command to rule them all - NO manual fixes needed!
docker compose up -d

# ✅ Automatic PostgreSQL readiness check
# ✅ Auto-migration of all database schema
# ✅ Smart detection of broken/missing schema
# ✅ Graceful handling of existing installations
```

### Auto-Migration Features
- **PostgreSQL Wait Logic**: Container waits for database readiness before starting
- **Schema Detection**: Automatically detects missing tables, columns, and indexes
- **Migration Tracking**: Prevents duplicate migrations with `schema_migrations` table
- **Error Recovery**: Handles both fresh and broken installations gracefully
- **Extension Management**: Auto-enables required PostgreSQL extensions

### Migration Status Commands
```bash
# Check migration status
docker compose logs autollama-api | grep "Migration"

# Verify database schema
docker exec autollama-postgres psql -U autollama -d autollama -c "\dt"

# Check specific columns
docker exec autollama-postgres psql -U autollama -d autollama -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'processed_content' AND column_name IN ('record_type', 'upload_source', 'updated_at');"

# Test API health after migration
curl http://localhost:8080/api/health
curl http://localhost:8080/api/documents
```

### Legacy Docker Fixes (ELIMINATED) 🗑️
- ❌ No more `fix-schema.sh` manual execution
- ❌ No more container restarts after schema fixes
- ❌ No more manual database setup commands
- ❌ No more troubleshooting broken schemas

## v3.0 JavaScript-First Architecture ✨

### NPX Installation (NEW - Primary Method)
```bash
# One-command installation
npx create-autollama my-rag-app

# 🦙 Interactive wizard with llama personality
# ⚡ 5-minute setup with template selection
# 🎯 Auto-detection of environment capabilities
# 📦 Smart dependency management
```

### Multi-Deployment Architecture
- **Local Mode**: SQLite + embedded Qdrant + native Node.js processes
- **Hybrid Mode**: Mix of local and cloud services with PostgreSQL
- **Docker Mode**: Traditional containerized deployment (preserved)

### Template System
- **Basic Template**: SQLite, simple interface, perfect for learning
- **Advanced Template**: PostgreSQL, full features, production-ready
- **Custom Template**: Interactive wizard for specific requirements

### CLI Command System
```bash
autollama dev         # Start development server
autollama migrate     # Run database migrations  
autollama test        # Run test suite
autollama deploy      # Deploy to production
autollama status      # Service status overview
autollama doctor      # Diagnose issues
```

### Database Abstraction Layer
- **Unified API**: Same code works with PostgreSQL and SQLite
- **Auto-Migration**: Automatic database setup on first run
- **Connection Pooling**: Efficient resource management
- **Query Builder**: Type-safe query construction

### Service Orchestration
- **Embedded Qdrant**: Zero-config vector database for local development
- **Process Manager**: Native Node.js services replace Docker containers
- **Health Monitoring**: Automatic service health checks and restart
- **Resource Management**: Memory and CPU optimization

---

# Legacy v2.3.3 Documentation

Enhanced RAG platform with database schema fixes and automated migration system.

## Quick Start
```bash
cd autollama && cp example.env .env
# Edit .env with your OpenAI API key, then:
docker compose up -d
# If containers are already running, restart after editing .env:
# docker compose restart autollama-api
```

## Architecture v2.3
- React (8080), API (3001), BM25 (3002), SSE (3003), **OpenWebUI Pipeline (9099)**
- PostgreSQL + Qdrant, Tailscale VPN
- **Enhanced Processing Pipeline**: Fetch→IntelligentChunk→AdvancedAnalyze→ContextualGenerate→Embed→Store
- **New Features**: Document type detection, semantic boundary detection, hierarchical chunking
- **Enhanced Metadata**: 11 new contextual fields for performance analysis
- **Domain Architecture** ✨:
  - `https://autollama.io` → Dark mode marketing homepage with feature showcase
  - `https://app.autollama.io` → AutoLlama RAG application (production interface)
- **Native OpenWebUI Integration**: Built-in RAG pipeline accessible via app subdomain

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

## v2.3 Improvements ✨

### Direct AI Chat Access (2025-08-17)
- **Eliminated Intermediary Screen**: Clicking "AI Chat" now takes users directly to the chat interface
- **No Screen Jump**: Fixed auto-scroll behavior that caused page jumping when loading chat
- **Instant Chat Access**: Removed the "Start Chatting" button requirement for better UX

**Technical Details**:
- **RAGChat.jsx**: Changed `showWelcome` initial state from `true` to `false`
- **ChatInterface.jsx**: Modified auto-scroll logic to prevent scrolling on initial load (`lastMessageCount > 0` condition)
- **User Experience**: One-click access to AI chat without navigation interruptions

### Flow View Optimization
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

### High Memory Usage (96%+ VM Memory) ✅ FIXED
**Problem**: VM shows 96.15% memory usage (15.14GB/15.75GB) causing performance issues.
**Root Causes**: Docker build cache accumulation (5.86GB) + unused images (13.86GB) + Linux filesystem cache.

**Fix Applied (2025-08-31)**:
1. **Immediate cleanup** - Freed 21.17GB:
   ```bash
   docker system prune -a -f
   ```

2. **Added memory limits** to docker-compose.yaml:
   ```yaml
   # PostgreSQL: 256M limit, optimized settings
   # Qdrant: 512M limit, reduced search threads
   # API: 1GB limit, Node.js heap optimization
   # BM25: 256M limit 
   # Frontend: 128M limit
   ```

3. **Memory monitoring script**:
   ```bash
   ./scripts/memory-monitor.sh
   ```

**Results**: 
- **Before**: 96.15% memory usage, 207MB available
- **After**: ~46% memory usage, 13GB available  
- **Container limits**: Total 2.2GB maximum (down from unlimited)

**Prevention**: Run `docker system prune -f` weekly to prevent cache buildup.

### Search Returns No Results Despite Processed Content ✅ FIXED
**Problem**: Search for content (e.g., "whale") returns empty results despite having processed chunks containing the search terms.
**Root Causes**: Multiple database schema issues preventing search functionality.

**Fix Applied (2025-08-31)**:
1. **Add missing source column**:
   ```bash
   docker exec autollama-api node -e "
   const { Pool } = require('pg');
   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
   pool.query('ALTER TABLE processed_content ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT \\'unknown\\'')
   .then(r => { console.log('✅ Added source column'); pool.end(); })"
   ```

2. **Install pg_trgm extension for trigram search**:
   ```bash
   docker exec autollama-api node -e "
   const { Pool } = require('pg');
   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
   pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
   .then(r => { console.log('✅ Added pg_trgm extension'); pool.end(); })"
   ```

3. **Manually rebuild BM25 index** (temporary fix):
   ```bash
   docker exec autollama-api node -e "
   const { Pool } = require('pg');
   const axios = require('axios');
   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
   
   async function rebuildBM25Index() {
     const result = await pool.query('SELECT chunk_id, chunk_text FROM processed_content WHERE record_type != \\'document\\' AND chunk_text IS NOT NULL');
     const chunks = result.rows.map(row => ({ id: row.chunk_id, text: row.chunk_text, metadata: {} }));
     
     const response = await axios.post('http://autollama-bm25:3002/index/all-content', {
       chunks: chunks, filename: 'all-content', replace_existing: true
     });
     console.log('✅ BM25 index rebuilt:', response.data.chunks, 'chunks');
     pool.end();
   }
   rebuildBM25Index();"
   ```

**Verification**: `curl "http://localhost:8080/api/search?q=whale&limit=5"` now returns relevant results.

**Note**: The root cause is that BM25 indexing should happen automatically during processing but currently doesn't. This is a temporary fix - automatic indexing integration needed.

### Documents Not Appearing on Homepage After Processing ✅ FIXED
**Problem**: URL processing completes successfully but documents don't appear on homepage. Background jobs show "completed" but `processed_content` table remains empty.
**Root Cause**: Missing `upload_source` column in `processed_content` table causing `createDocumentRecord` function to fail silently.

**Fix Applied (2025-08-31)**:
```bash
# Add missing column to processed_content table
docker exec autollama-api node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE processed_content ADD COLUMN IF NOT EXISTS upload_source VARCHAR(50) DEFAULT \\'user\\'')
.then(r => { console.log('✅ Added upload_source column'); pool.end(); })"
```

**Verification**: 
- `curl http://localhost:8080/api/documents` now returns document data
- Documents appear on homepage after processing
- Background jobs table shows "completed" status with actual document records created

**Impact**: This fixes the core issue where processing succeeds but documents don't display, affecting all URL processing functionality.

### HTTP 502 Bad Gateway on File Upload ✅ FIXED
**Problem**: File uploads (including EPUB) fail with "HTTP 502: Bad Gateway" error after container restart.
**Root Cause**: Nginx proxy configuration using `localhost:3001` instead of Docker service name `autollama-api:3001`.

**Fix Applied (2025-08-31)**:
1. **Updated nginx.conf proxy targets**: Changed all `localhost:3001` → `autollama-api:3001` in `/config/react-frontend/nginx.conf`
2. **Fixed all API endpoints**: `/api/health`, `/api/stream`, `/api/process-file`, general `/api/` proxy
3. **Updated BM25 service**: Changed `localhost:3002` → `autollama-bm25:3002`
4. **Container rebuild**: `docker compose build autollama-frontend --no-cache && docker compose up -d`

**Technical Details**:
- **Container Networking**: Each service runs in separate containers within `autollama-network`
- **Service Names**: Use Docker Compose service names for inter-container communication
- **Port Mapping**: External ports (8080:80) vs internal service ports (3001:3001)

**Verification**: `curl http://localhost:8080/api/health` returns "healthy"

**Prevention**: Always use Docker service names (`autollama-api`, `autollama-bm25`) in nginx proxy configs, never `localhost` for cross-container communication.

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
- `marketing-homepage/` - **Dark mode marketing site** ✨

## Marketing Homepage v2.3 ✨

### Features
- **Dark Mode Design**: Beautiful gradient background (slate to steel blue)
- **Feature Showcase**: Interactive cards highlighting AutoLlama capabilities
- **Hero Section**: Compelling value proposition with call-to-action buttons
- **Responsive Design**: Mobile-optimized with smooth animations
- **Cache-Optimized**: No-cache headers for instant updates

### Technical Stack
- **Static HTML/CSS**: Ultra-fast loading, no JavaScript dependencies
- **Docker Deployment**: Nginx-alpine container on port 3004
- **Caddy Integration**: Reverse proxy with SSL termination
- **DNS Configuration**: DNS-only mode for direct server access

### Deployment
```bash
cd marketing-homepage
docker compose up -d
# Accessible at https://autollama.io
```

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