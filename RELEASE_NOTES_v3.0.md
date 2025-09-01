# AutoLlama v3.0.0 Release Notes
## NPX Installation + Docker Auto-Migration

**Release Date**: September 1, 2025  
**Branch**: `release/v3.0-npx-docker-automigration`

---

## 🎉 Major Features

### 🚀 NPX Installation System
- **One-Command Setup**: `npx create-autollama my-rag-app`
- **Interactive Wizard**: Llama-personality guided setup process
- **Template Selection**: Basic, Advanced, and Custom templates
- **Environment Detection**: Auto-detects capabilities and dependencies
- **5-Minute Setup**: From zero to running RAG in minutes

### 🐳 Docker Auto-Migration Revolution

**PROBLEM SOLVED**: Docker users previously had to run manual `fix-schema.sh` scripts after container startup. This was unacceptable for v3.0.

**SOLUTION**: Complete auto-migration system integrated into Docker startup.

#### Auto-Migration Features
- ✅ **Zero Manual Intervention**: No more `fix-schema.sh` scripts
- ✅ **PostgreSQL Readiness Check**: Container waits for database before starting
- ✅ **Smart Schema Detection**: Automatically detects missing/broken schema elements
- ✅ **Migration Tracking**: `schema_migrations` table prevents duplicate runs
- ✅ **Error Recovery**: Handles fresh installs AND broken existing installations
- ✅ **Extension Management**: Auto-enables `uuid-ossp`, `vector`, `pg_trgm`

#### Technical Implementation
- **Migration Runner**: New `migrate-docker.js` with comprehensive schema fixes
- **Startup Integration**: Migrations run automatically during `npm start`
- **Health Dependencies**: `docker-compose.yml` updated with proper service dependencies
- **PostgreSQL Client**: Added to Dockerfile for readiness checks

---

## 📋 Breaking Changes

### Docker Experience Transformation
- **REMOVED**: Manual `fix-schema.sh` execution requirement
- **REMOVED**: Container restart necessity after schema fixes
- **REMOVED**: Manual database setup commands
- **CHANGED**: Docker startup now includes automatic migration

### User Impact
- **Existing Users**: No action required - auto-migration handles everything
- **New Users**: Seamless one-command Docker experience
- **Documentation**: Updated to reflect zero-configuration process

---

## 🛠️ Technical Details

### Migration System Architecture

#### Core Components
1. **`migrate-docker.js`**: Main migration runner with Docker-specific logic
2. **`migrations/000_initial_schema.sql`**: Base schema for fresh installations
3. **`migrations/001_v23_comprehensive_schema.sql`**: All v2.3 enhancements consolidated
4. **`migrations/002_enable_extensions.sql`**: PostgreSQL extension management

#### Migration Flow
```
Container Start → PostgreSQL Wait → Run Migrations → Start API Server
```

#### Schema Elements Created/Fixed
- **Core Tables**: `processed_content`, `upload_sessions`, `background_jobs`, `api_settings`
- **v2.3 Columns**: `upload_source`, `record_type`, `updated_at`, `document_type`, etc.
- **Performance Indexes**: 15+ indexes for optimal query performance
- **PostgreSQL Extensions**: UUID, trigram search, vector operations (if available)

### Database Migration Logic
- **Fresh Installs**: Creates complete schema from scratch
- **Existing Installs**: Detects missing elements and applies only needed fixes
- **Broken Installs**: Recovers from missing columns/tables automatically
- **Already-Fixed**: Skips migrations already applied

---

## 🧪 Testing Completed

### Test Scenarios Verified ✅

1. **Fresh Docker Installation**
   ```bash
   docker compose down -v  # Clean slate
   docker compose up -d    # Auto-migration creates everything
   curl http://localhost:8080/api/health  # ✅ healthy
   ```

2. **Broken Installation Recovery**
   ```bash
   # Simulate missing columns
   docker exec autollama-postgres psql -U autollama -d autollama -c "ALTER TABLE processed_content DROP COLUMN upload_source;"
   docker compose restart autollama-api  # Auto-recovery
   # ✅ Column automatically restored
   ```

3. **Already-Fixed Installation**
   ```bash
   docker compose restart autollama-api
   # ✅ Detects existing schema, skips applied migrations
   ```

---

## 📊 Performance Impact

### Container Startup
- **Before**: Manual intervention required, ~5-10 minutes setup time
- **After**: Fully automated, ~2-3 minutes total startup time
- **Migration Time**: ~10-15 seconds for complete schema setup

### Resource Usage
- **Memory**: No additional overhead (migrations run once at startup)
- **Storage**: Minimal - migration tracking table adds <1KB
- **Network**: No impact - all operations are local

---

## 🔄 Migration Commands

### For Troubleshooting
```bash
# Check migration status
docker compose logs autollama-api | grep "Migration"

# Verify all tables exist
docker exec autollama-postgres psql -U autollama -d autollama -c "\dt"

# Check specific v2.3 columns
docker exec autollama-postgres psql -U autollama -d autollama -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'processed_content' AND column_name IN ('record_type', 'upload_source', 'updated_at');"

# Test API health
curl http://localhost:8080/api/health
curl http://localhost:8080/api/documents
```

### Manual Migration (Emergency Only)
```bash
# If auto-migration fails, run manually:
docker exec autollama-api node migrate-docker.js --auto --docker
```

---

## 📁 Files Changed

### New Files
- `docker/entrypoint.sh` - PostgreSQL wait script
- `api/migrate-docker.js` - Docker-specific migration runner
- `api/start-with-migration.sh` - Startup script with migration
- `api/migrations/000_initial_schema.sql` - Base schema for fresh installs
- `api/migrations/001_v23_comprehensive_schema.sql` - v2.3 enhancements
- `api/migrations/002_enable_extensions.sql` - PostgreSQL extensions

### Modified Files
- `api/Dockerfile` - Added PostgreSQL client and migration integration
- `api/package.json` - Updated start script to include migration
- `docker-compose.yaml` - Added health check dependencies and auto-migration env vars
- `CLAUDE.md` - Added Docker auto-migration documentation
- `README.md` - Updated Docker installation section

### Deprecated Files
- `fix-schema.sh` - No longer needed (moved to `/deprecated/`)

---

## 🚀 Next Steps

1. **Test Fresh Installation**: Verify on clean systems
2. **Performance Testing**: Monitor migration performance under load
3. **Documentation Review**: Ensure all docs reflect new zero-config experience
4. **Community Testing**: Get feedback from Docker users
5. **Main Branch Merge**: After thorough testing and validation

---

## 🎯 User Impact Summary

**Before v3.0**:
```bash
docker compose up -d
# Wait for containers...
./fix-schema.sh
# Restart containers...
docker compose restart autollama-api
# Finally ready to use!
```

**After v3.0**:
```bash
docker compose up -d
# Done! 🎉
```

**The Docker experience is now as smooth as NPX** - exactly what v3.0 demanded.