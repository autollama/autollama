# AutoLlama Admin CLI Utilities

Enhanced session cleanup and background job management utilities for AutoLlama v2.2.

## Overview

These CLI utilities provide comprehensive session management, cleanup operations, and system monitoring capabilities. All utilities are designed with safety-first principles, including dry-run modes, validation checks, and confirmation prompts.

## Prerequisites

- Node.js environment with access to AutoLlama API
- PostgreSQL database connection configured
- Run from the `/api` directory: `cd /home/chuck/homelab/autollama/api`

## CLI Utilities

### 1. Session Admin CLI (`session-admin.js`)

Comprehensive session management and cleanup tool.

#### Basic Usage
```bash
# Show current session status
node src/utils/cli/session-admin.js status

# Show detailed statistics  
node src/utils/cli/session-admin.js stats

# Analyze memory usage
node src/utils/cli/session-admin.js memory

# Safe cleanup (dry run first)
node src/utils/cli/session-admin.js cleanup --dry-run
node src/utils/cli/session-admin.js cleanup --confirm

# Force cleanup (minimal validation)
node src/utils/cli/session-admin.js force-cleanup --confirm

# Real-time monitoring
node src/utils/cli/session-admin.js monitor
```

#### Advanced Options
```bash
# Custom cleanup parameters
node src/utils/cli/session-admin.js cleanup --max-age 300000 --no-timeout --dry-run

# Verbose output
node src/utils/cli/session-admin.js cleanup --verbose --confirm

# Monitor with custom interval
node src/utils/cli/session-admin.js monitor --interval 3000
```

### 2. Background Job Admin CLI (`background-admin.js`)

Background job queue management tool.

#### Basic Usage
```bash
# Show queue status
node src/utils/cli/background-admin.js status

# Show detailed queue statistics
node src/utils/cli/background-admin.js queue-stats

# Cancel jobs (dry run first)
node src/utils/cli/background-admin.js cancel --session-id abc123 --dry-run
node src/utils/cli/background-admin.js cancel --status queued,processing --confirm

# Retry failed jobs
node src/utils/cli/background-admin.js retry-failed --max-retries 2

# Purge old jobs
node src/utils/cli/background-admin.js purge-old --older-than "7 days" --confirm

# Real-time queue monitoring
node src/utils/cli/background-admin.js monitor
```

## API Endpoints

The following API endpoints are now available for programmatic access:

### Session Management
- `GET /api/cleanup-status` - Get cleanup recommendations
- `GET /api/upload-sessions/check-stuck` - Check for stuck sessions  
- `POST /api/cleanup-sessions` - Perform safe session cleanup
- `POST /api/cleanup-sessions/advanced` - Advanced cleanup with options
- `POST /api/upload-sessions/cleanup-stuck` - Clean only stuck sessions

### Admin Monitoring
- `GET /api/admin/session-stats` - Comprehensive session statistics
- `GET /api/admin/system-health` - System health analysis

#### API Examples
```bash
# Check stuck sessions
curl "http://localhost:8080/api/upload-sessions/check-stuck"

# Dry run cleanup
curl -X POST -H "Content-Type: application/json" -d '{"dryRun": true}' \
  "http://localhost:8080/api/cleanup-sessions"

# Advanced cleanup with options
curl -X POST -H "Content-Type: application/json" \
  -d '{"enableHealthCheck": true, "enableOrphanCleanup": true, "dryRun": false}' \
  "http://localhost:8080/api/cleanup-sessions/advanced"
```

## Safety Features

### Validation and Safeguards
- **Pre-cleanup validation**: Checks for high session counts and recent activity
- **Dry-run mode**: Preview all changes before applying
- **Confirmation prompts**: Interactive confirmation for destructive operations
- **Force bypass**: Override safety checks when necessary (use with caution)

### Error Handling
- Comprehensive error logging and reporting
- Graceful degradation on service failures
- Automatic resource cleanup on exit

### Performance Monitoring
- Operation timing and performance metrics
- Memory usage analysis and recommendations
- Database connection optimization

## Command Examples

### Emergency Cleanup Scenarios

```bash
# Quick status check
node src/utils/cli/session-admin.js status

# If stuck sessions found, preview cleanup
node src/utils/cli/session-admin.js cleanup --dry-run

# Perform cleanup after review
node src/utils/cli/session-admin.js cleanup --confirm

# For critical situations (bypass safety checks)
node src/utils/cli/session-admin.js force-cleanup --confirm
```

### Routine Maintenance

```bash
# Weekly cleanup of old jobs
node src/utils/cli/background-admin.js purge-old --older-than "7 days" --confirm

# Monitor system during high load
node src/utils/cli/session-admin.js monitor --interval 2000

# Memory analysis during issues
node src/utils/cli/session-admin.js memory
```

### Queue Management

```bash
# Check queue backlog
node src/utils/cli/background-admin.js status

# Cancel problematic jobs
node src/utils/cli/background-admin.js cancel --status failed --older-than "1 hour" --confirm

# Retry failed jobs with limits
node src/utils/cli/background-admin.js retry-failed --max-retries 1 --confirm
```

## Integration with CLAUDE.md

These utilities complement the existing CLAUDE.md cleanup commands:

```bash
# Existing emergency command (still works)
docker exec autollama-autollama-api-1 node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\"UPDATE upload_sessions SET status = 'failed', error_message = 'Auto-cleanup' WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '10 minutes'\")
.then(r => { console.log(\`Cleaned \${r.rowCount} sessions\`); pool.end(); })"

# New enhanced approach
docker exec autollama-autollama-api-1 node src/utils/cli/session-admin.js status
docker exec autollama-autollama-api-1 node src/utils/cli/session-admin.js cleanup --confirm
```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Ensure DATABASE_URL is configured
   - Check PostgreSQL service is running
   - Verify API container has database access

2. **Permission Errors**
   - Run from correct directory: `/home/chuck/homelab/autollama/api`
   - Ensure CLI files are executable: `chmod +x src/utils/cli/*.js`

3. **High Memory Usage**
   - Use memory analysis: `node src/utils/cli/session-admin.js memory`
   - Consider force cleanup: `node src/utils/cli/session-admin.js force-cleanup --confirm`

### Logging and Debugging

- Use `--verbose` flag for detailed output
- Check Docker logs: `docker compose logs -f autollama-api`
- Monitor system health via API: `curl http://localhost:8080/api/admin/system-health`

## Security Considerations

- **Production Use**: Always test with `--dry-run` first
- **Force Operations**: Use `--force` only in emergency situations
- **API Access**: Admin endpoints should be restricted in production
- **Database Access**: Utilities require full database access for cleanup operations

## Version

These utilities are part of AutoLlama v2.2 and are designed to work with the enhanced contextual retrieval system. They safely handle both legacy and v2.2 database schemas.