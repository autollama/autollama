#!/bin/bash

# Enhanced migration script that handles psql client availability

set -e  # Exit on error

echo "=== AutoLlama PostgreSQL Migration Runner ==="
echo ""

# Check if a SQL file is provided
if [ "$#" -eq 0 ]; then
    echo "Usage: $0 <migration_file.sql>"
    echo "Example: $0 database/add_record_type_migration.sql"
    exit 1
fi

MIGRATION_FILE="$1"

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "Error: Migration file '$MIGRATION_FILE' not found"
    exit 1
fi

# Get database connection details from the autollama-api container
DB_URL=$(docker exec autollama-autollama-api-1 printenv DATABASE_URL 2>/dev/null)

if [ -z "$DB_URL" ]; then
    echo "Error: Could not get DATABASE_URL from autollama-api container"
    echo "Make sure the autollama-api container is running with: docker compose up -d"
    exit 1
fi

echo "Migration file: $MIGRATION_FILE"
echo "Database URL: ${DB_URL//:*@/:****@}"  # Hide password in output
echo ""

# Method 1: Try using the postgres container directly
if docker exec postgres-db-1 psql --version &>/dev/null; then
    echo "Using postgres container (postgres-db-1) to run migration..."
    docker exec -i postgres-db-1 psql "$DB_URL" < "$MIGRATION_FILE"
    RESULT=$?

# Method 2: Use a temporary postgres client container
else
    echo "Postgres container not accessible, using temporary client container..."
    
    # Get the directory of this script
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    
    # Run postgres client in a temporary container
    docker run --rm -i \
        -v "$SCRIPT_DIR:/workspace:ro" \
        postgres:alpine \
        psql "$DB_URL" < "/workspace/$MIGRATION_FILE"
    RESULT=$?
fi

if [ $RESULT -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
else
    echo ""
    echo "❌ Migration failed with exit code $RESULT"
    exit $RESULT
fi