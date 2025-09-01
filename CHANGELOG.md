# AutoLlama Changelog

## v3.0.1 (2025-09-01)

### 🐛 Fixed
- **CRITICAL**: Fixed EPUB and file uploads not creating documents on homepage
  - Root cause: `analyzeChunk()` function call in `server.js:1088` was calling removed function
  - Solution: Updated to use `services.analysisService.analyzeChunk()` with proper fallback
  - Impact: All file uploads (EPUB, PDF, TXT, etc.) now work correctly

### 🔧 Enhanced
- **Auto-Migration**: Enhanced Docker startup migration to detect and report code fixes
- **Version Management**: Updated to v3.0.1 with proper changelog tracking
- **Docker Compose**: Removed obsolete `version: '3.8'` to eliminate warnings

### 📋 Verification
- ✅ Documents appear on homepage after upload processing
- ✅ Background job processing works correctly with new service container
- ✅ Chunks created with proper contextual embeddings
- ✅ Analysis service integration working properly

---

## v3.0.0 (2025-08-31)

### ✨ Major Features
- **NPX Installation**: One-command setup with `npx create-autollama`
- **JavaScript-First Architecture**: Native Node.js processes replace some Docker containers
- **Multi-Deployment Support**: Local, Hybrid, and Docker modes
- **Auto-Migration System**: Zero-config Docker experience

### 🔧 Docker Auto-Migration
- **PostgreSQL Wait Logic**: Container waits for database readiness
- **Schema Detection**: Automatically detects missing tables and columns
- **Migration Tracking**: Prevents duplicate migrations
- **Error Recovery**: Handles broken installations gracefully

### 🏗️ Architecture
- **Service Container**: Dependency injection for all services
- **Background Processing**: Jobs run independently of HTTP connections
- **Memory Optimization**: Container limits and monitoring
- **Enhanced Error Handling**: Better user feedback and recovery

---

## v2.3.3 (2025-08-31)

### 🐛 Fixed
- HTTP 502 Bad Gateway on file uploads (nginx proxy configuration)
- Documents not appearing after processing (missing `upload_source` column)
- Search returning no results (BM25 indexing and pg_trgm extension)
- High memory usage (Docker build cache cleanup + container limits)

### ✨ Enhanced
- **Flow View Optimization**: Fixed stalling and performance issues
- **Real-Time Visualization**: Better SSE event handling
- **Direct AI Chat Access**: Eliminated intermediary screens
- **Custom Favicon Upload**: Settings UI for branding

### 🔧 Infrastructure
- **Memory Monitoring**: Comprehensive tracking and cleanup
- **Session Management**: Enhanced cleanup and recovery
- **Database Indexing**: Performance improvements for search
- **Container Health**: Better health checks and monitoring