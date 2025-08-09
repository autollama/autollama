#!/bin/bash

# Script to apply Document/Chunk distinction migration to AutoLlama database

echo "=== AutoLlama Document/Chunk Migration ==="
echo "This will add support for distinguishing between Documents and Chunks"
echo ""

echo "This migration will:"
echo "1. Add record_type column to processed_content table"
echo "2. Add parent_document_id column for linking chunks to documents"
echo "3. Create views for documents and chunks"
echo "4. Add helper functions for document management"
echo ""
read -p "Continue with migration? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Running migration..."
    
    # Get the directory of this script
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    
    # Use the generic migration runner
    "$SCRIPT_DIR/run_migration_psql.sh" database/add_record_type_migration.sql
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "Next steps:"
        echo "1. Review the update_server_for_documents.js file for implementation guidance"
        echo "2. Update server.js to create document records when processing content"
        echo "3. Ensure chunks are linked to their parent documents"
        echo "4. Update UI to show documents vs chunks separately if needed"
    else
        echo "❌ Migration failed. Please check the error messages above."
    fi
else
    echo "Migration cancelled."
fi