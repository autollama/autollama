# AutoLlama Database Migrations

This directory contains SQL migration files for the AutoLlama database.

## Running Migrations

### Method 1: Using the Generic Migration Runner (Recommended)

The `run_migration_psql.sh` script handles the complexity of finding a PostgreSQL client:

```bash
# From the autollama directory
./run_migration_psql.sh database/your_migration.sql
```

This script will:
1. Try to use the postgres container if available
2. Fall back to a temporary postgres:alpine container if needed
3. Automatically handle the database connection from the autollama-api container

### Method 2: Using Specific Migration Scripts

Some migrations have dedicated runner scripts:

```bash
# For the document/chunk migration
./run_document_migration.sh
```

### Method 3: Manual Execution

If you need to run migrations manually:

```bash
# Using the postgres container
docker exec -i postgres-db-1 psql "$(docker exec autollama-autollama-api-1 printenv DATABASE_URL)" < database/migration.sql

# Using a temporary container
docker run --rm -i \
  -v "$PWD/database:/migrations:ro" \
  postgres:alpine \
  psql "$(docker exec autollama-autollama-api-1 printenv DATABASE_URL)" < /migrations/migration.sql
```

## Migration Files

- `schema_final.sql` - Initial database schema
- `add_record_type_migration.sql` - Adds document/chunk distinction support
- Additional migrations should be added here with descriptive names

## Best Practices

1. Always backup your database before running migrations
2. Test migrations on a development database first
3. Name migration files with timestamps if order matters (e.g., `2024_01_15_add_feature.sql`)
4. Include both UP and DOWN migrations when possible
5. Document what each migration does in the SQL file itself

## Troubleshooting

### "psql: command not found"
The autollama-api container doesn't include PostgreSQL client tools. Use the provided migration scripts which handle this automatically.

### Connection refused
Ensure the PostgreSQL service is running and accessible via Tailscale:
```bash
docker exec autollama-on-hstgr-1 tailscale status | grep pg-on-hstgr
```

### Permission denied
Make sure the migration scripts are executable:
```bash
chmod +x run_migration_psql.sh
chmod +x run_document_migration.sh
```