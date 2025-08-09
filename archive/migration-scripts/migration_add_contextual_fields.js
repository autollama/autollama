const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/autollama',
});

async function runMigration() {
    console.log('Starting migration: Add contextual embedding fields...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Add contextual_summary column
        console.log('Adding column: contextual_summary...');
        await client.query(`
            ALTER TABLE processed_content
            ADD COLUMN IF NOT EXISTS contextual_summary TEXT;
        `);
        console.log('Column contextual_summary added or already exists.');

        // Add uses_contextual_embedding column
        console.log('Adding column: uses_contextual_embedding...');
        await client.query(`
            ALTER TABLE processed_content
            ADD COLUMN IF NOT EXISTS uses_contextual_embedding BOOLEAN DEFAULT FALSE;
        `);
        console.log('Column uses_contextual_embedding added or already exists.');

        // Update the document_summaries view to include the new field
        console.log('Updating view: document_summaries...');
        await client.query(`
            CREATE OR REPLACE VIEW document_summaries AS
            SELECT 
                url,
                MAX(title) as document_title,
                MAX(summary) as document_summary,
                COUNT(*) as total_chunks,
                COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as completed_chunks,
                COUNT(CASE WHEN embedding_status = 'complete' THEN 1 END) as embedded_chunks,
                MAX(created_time) as latest_chunk_time,
                MAX(processed_date) as latest_processed_time,
                CASE 
                    WHEN COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) = COUNT(*) THEN 'completed'
                    WHEN COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) > 0 THEN 'failed'
                    ELSE 'processing'
                END as document_status,
                MAX(category) as category,
                MAX(content_type) as content_type,
                MAX(sentiment) as overall_sentiment,
                BOOL_OR(uses_contextual_embedding) as uses_contextual_embedding
            FROM processed_content 
            GROUP BY url;
        `);
        console.log('View document_summaries updated successfully.');

        await client.query('COMMIT');
        console.log('✅ Migration completed successfully!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        client.release();
        pool.end();
    }
}

runMigration();
