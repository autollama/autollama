# AutoLlama Database Configuration

This directory contains database initialization scripts and migration tools for AutoLlama.

## Contents

- `init/` - Database initialization scripts for first-time setup
- `migrations/` - Versioned database schema migrations
- `performance_optimization.sql` - Performance tuning indexes and optimizations

## Usage

### Automatic Initialization

When using `docker-compose.public.yaml`, the database is automatically initialized with:
- Required schema and tables
- Initial indexes for optimal performance
- Default configuration values

### Manual Setup

For external PostgreSQL databases:

```bash
# Run initialization scripts
psql -U username -d autollama -f init/00-init.sql

# Apply performance optimizations
psql -U username -d autollama -f performance_optimization.sql
```

## Migration System

Database migrations are handled automatically by the API service on startup. Manual migration:

```bash
cd database
node migrate.js
```

See `migrations/README.md` for detailed migration information.