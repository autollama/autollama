#!/usr/bin/env node

/**
 * AutoLlama Data Migration Script
 * Migrates existing data from Airtable to PostgreSQL
 * This maintains business continuity while enabling real-time performance
 */

const { Client } = require('pg');
const fetch = require('node-fetch');

// Configuration from environment
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appi5lnDWjvstGsqr';
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID || 'tblrO3XjykQIqURb4';
const AIRTABLE_UPLOAD_SESSIONS_TABLE_ID = process.env.AIRTABLE_UPLOAD_SESSIONS_TABLE_ID || 'tblMF9mGUIf5vkOEB';

// PostgreSQL connection
const pgClient = new Client({
    host: 'localhost',
    port: 5432,
    database: 'autollama',
    user: 'autollama_user',
    password: 'autollama_secure_password_2024',
});

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Map Airtable field names to PostgreSQL columns
const fieldMapping = {
    // Content fields
    'URL': 'url',
    'Title': 'title',
    'Summary': 'summary',
    'Chunk Text': 'chunk_text',
    'Chunk ID': 'chunk_id',
    'Chunk Index': 'chunk_index',
    
    // AI Analysis
    'Sentiment': 'sentiment',
    'Emotions': 'emotions',
    'Category': 'category',
    'Content Type': 'content_type',
    'Technical Level': 'technical_level',
    'Main Topics': 'main_topics',
    'Key Concepts': 'key_concepts',
    'Tags': 'tags',
    'Key Entities': 'key_entities',
    
    // Status
    'Embedding Status': 'embedding_status',
    'Status': 'processing_status',
    
    // Timestamps
    'Created Time': 'created_time',
    'Processed Date': 'processed_date',
    'Source': 'source'
};

// Session field mapping
const sessionFieldMapping = {
    'URL': 'url',
    'Filename': 'filename',
    'Title': 'title',
    'Total Chunks': 'total_chunks',
    'Processed Chunks': 'processed_chunks',
    'Completed Chunks': 'completed_chunks',
    'Status': 'status',
    'Created At': 'created_at',
    'Last Activity': 'last_activity',
    'Completed At': 'completed_at'
};

async function connectToPostgreSQL() {
    console.log('🔌 Connecting to PostgreSQL...');
    await pgClient.connect();
    console.log('✅ Connected to PostgreSQL successfully');
}

async function fetchAirtableRecords(tableId, tableName) {
    console.log(`📡 Fetching records from Airtable table: ${tableName}`);
    
    let allRecords = [];
    let offset = null;
    let pageCount = 0;
    
    try {
        do {
            pageCount++;
            console.log(`   📄 Fetching page ${pageCount}...`);
            
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}${offset ? `?offset=${offset}` : ''}`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            allRecords = allRecords.concat(data.records);
            offset = data.offset;
            
            console.log(`   ✅ Page ${pageCount}: ${data.records.length} records fetched`);
            
            // Rate limiting: 5 requests per second max
            await sleep(250);
            
        } while (offset);
        
        console.log(`📊 Total records fetched from ${tableName}: ${allRecords.length}`);
        return allRecords;
        
    } catch (error) {
        console.error(`❌ Error fetching from Airtable table ${tableName}:`, error.message);
        throw error;
    }
}

function transformAirtableRecord(record, mapping) {
    const transformed = {
        airtable_record_id: record.id
    };
    
    // Map fields according to the provided mapping
    for (const [airtableField, pgColumn] of Object.entries(mapping)) {
        const value = record.fields[airtableField];
        
        if (value !== undefined && value !== null) {
            // Handle different data types
            if (Array.isArray(value)) {
                if (pgColumn === 'emotions' || pgColumn === 'main_topics') {
                    transformed[pgColumn] = value; // PostgreSQL TEXT[] array
                } else {
                    transformed[pgColumn] = value.join(', '); // Convert to comma-separated string
                }
            } else if (typeof value === 'object') {
                transformed[pgColumn] = JSON.stringify(value); // Convert objects to JSON
            } else if (pgColumn.includes('time') || pgColumn.includes('date') || pgColumn.includes('at')) {
                // Handle date/time fields
                transformed[pgColumn] = new Date(value).toISOString();
            } else {
                transformed[pgColumn] = value;
            }
        }
    }
    
    return transformed;
}

async function migrateProcessedContent(records) {
    console.log('🔄 Migrating processed content records...');
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const record of records) {
        try {
            const transformed = transformAirtableRecord(record, fieldMapping);
            
            // Skip records without essential fields
            if (!transformed.chunk_id || !transformed.url) {
                console.log(`   ⚠️  Skipping record ${record.id}: missing chunk_id or url`);
                skippedCount++;
                continue;
            }
            
            // Build INSERT query dynamically
            const columns = Object.keys(transformed);
            const values = Object.values(transformed);
            const placeholders = values.map((_, i) => `$${i + 1}`);
            
            const query = `
                INSERT INTO processed_content (${columns.join(', ')})
                VALUES (${placeholders.join(', ')})
                ON CONFLICT (chunk_id) DO UPDATE SET
                    ${columns.filter(col => col !== 'chunk_id').map(col => `${col} = EXCLUDED.${col}`).join(', ')},
                    updated_at = NOW()
            `;
            
            await pgClient.query(query, values);
            migratedCount++;
            
            if (migratedCount % 100 === 0) {
                console.log(`   📈 Progress: ${migratedCount} records migrated...`);
            }
            
        } catch (error) {
            console.error(`   ❌ Error migrating record ${record.id}:`, error.message);
            errorCount++;
        }
    }
    
    console.log(`✅ Processed content migration complete:`);
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⚠️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
}

async function migrateUploadSessions(records) {
    console.log('🔄 Migrating upload session records...');
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const record of records) {
        try {
            const transformed = transformAirtableRecord(record, sessionFieldMapping);
            transformed.airtable_session_id = record.id;
            
            // Skip records without essential fields
            if (!transformed.url) {
                console.log(`   ⚠️  Skipping session ${record.id}: missing url`);
                skippedCount++;
                continue;
            }
            
            // Build INSERT query dynamically
            const columns = Object.keys(transformed);
            const values = Object.values(transformed);
            const placeholders = values.map((_, i) => `$${i + 1}`);
            
            const query = `
                INSERT INTO upload_sessions (${columns.join(', ')})
                VALUES (${placeholders.join(', ')})
                ON CONFLICT (id) DO UPDATE SET
                    ${columns.map(col => `${col} = EXCLUDED.${col}`).join(', ')}
            `;
            
            await pgClient.query(query, values);
            migratedCount++;
            
        } catch (error) {
            console.error(`   ❌ Error migrating session ${record.id}:`, error.message);
            errorCount++;
        }
    }
    
    console.log(`✅ Upload sessions migration complete:`);
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⚠️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
}

async function validateMigration() {
    console.log('🔍 Validating migration...');
    
    // Check record counts
    const contentCountResult = await pgClient.query('SELECT COUNT(*) as count FROM processed_content');
    const sessionsCountResult = await pgClient.query('SELECT COUNT(*) as count FROM upload_sessions');
    const recentCountResult = await pgClient.query('SELECT COUNT(*) as count FROM recent_content_realtime');
    const historicalCountResult = await pgClient.query('SELECT COUNT(*) as count FROM historical_content_cacheable');
    
    console.log('📊 Migration validation results:');
    console.log(`   📄 Total processed content: ${contentCountResult.rows[0].count}`);
    console.log(`   📄 Total upload sessions: ${sessionsCountResult.rows[0].count}`);
    console.log(`   🕐 Recent content (24h): ${recentCountResult.rows[0].count}`);
    console.log(`   📚 Historical content: ${historicalCountResult.rows[0].count}`);
    
    // Test the real-time functions
    const recentTest = await pgClient.query('SELECT * FROM get_recent_content(24) LIMIT 5');
    console.log(`   ⚡ Recent content function test: ${recentTest.rows.length} records`);
    
    console.log('✅ Migration validation complete!');
}

async function main() {
    console.log('🚀 Starting AutoLlama data migration from Airtable to PostgreSQL');
    console.log('=' .repeat(70));
    
    try {
        // Verify environment variables
        if (!AIRTABLE_API_KEY) {
            throw new Error('AIRTABLE_API_KEY environment variable is required');
        }
        
        console.log(`📋 Configuration:`);
        console.log(`   Airtable Base ID: ${AIRTABLE_BASE_ID}`);
        console.log(`   Content Table ID: ${AIRTABLE_TABLE_ID}`);
        console.log(`   Sessions Table ID: ${AIRTABLE_UPLOAD_SESSIONS_TABLE_ID}`);
        console.log('');
        
        // Connect to PostgreSQL
        await connectToPostgreSQL();
        
        // Fetch data from Airtable
        const contentRecords = await fetchAirtableRecords(AIRTABLE_TABLE_ID, 'Processed Content');
        const sessionRecords = await fetchAirtableRecords(AIRTABLE_UPLOAD_SESSIONS_TABLE_ID, 'Upload Sessions');
        
        // Migrate to PostgreSQL
        await migrateProcessedContent(contentRecords);
        await migrateUploadSessions(sessionRecords);
        
        // Validate migration
        await validateMigration();
        
        console.log('');
        console.log('🎉 Migration completed successfully!');
        console.log('🚀 Your AutoLlama instance is now ready for real-time performance!');
        
    } catch (error) {
        console.error('💥 Migration failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await pgClient.end();
    }
}

// Run migration if called directly
if (require.main === module) {
    main();
}

module.exports = { main };