#!/bin/bash
set -e

echo "🦙 AutoLlama Docker Starting..."

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
until pg_isready -h ${DB_HOST:-postgres} -p ${DB_PORT:-5432} -U ${DB_USER:-postgres}; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done
echo "✅ PostgreSQL is ready!"

# Run migrations automatically
echo "🔄 Running database migrations..."
cd /app/api
node migrate-docker.js --auto --docker
MIGRATION_EXIT_CODE=$?

if [ $MIGRATION_EXIT_CODE -ne 0 ]; then
  echo "❌ Migration failed! Please check logs."
  exit 1
fi

echo "✅ Migrations complete!"

# Start the application
echo "🚀 Starting AutoLlama API..."
exec "$@"