#!/usr/bin/env node

/**
 * Comprehensive Airtable to PostgreSQL Migration Script
 * Migrates all data from AutoLlama Airtable base to PostgreSQL database
 */

const axios = require('axios');
const { Pool } = require('pg');

// Configuration - get from environment variables
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || 'pat9Xj5Fwn6cY5CeW.31352d792c86e4640793c99051db81d06675675dbf0fd942581de78076ba2e5d';
const AIRTABLE_BASE_ID = 'appi5lnDWjvstGsqr';
const PROCESSED_TABLE_ID = 'tblrO3XjykQIqURb4';
const SESSIONS_TABLE_ID = 'tblMF9mGUIf5vkOEB';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://autollama_user:autollama_secure_password_2024@100.92.210.53:5432/autollama',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Rate limiting for Airtable API (5 requests per second)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const RATE_LIMIT_DELAY = 250; // 4 requests per second to be safe

/**
 * Fetch all records from an Airtable table with pagination
 */
async function fetchAllAirtableRecords(tableId, tableName) {
    console.log(`📥 Fetching all records from ${tableName}...`);
    
    let allRecords = [];
    let offset = null;
    let page = 1;
    
    do {
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}`;
        const params = {
            pageSize: 100
        };
        
        if (offset) {
            params.offset = offset;
        }
        
        try {
            console.log(`   Fetching page ${page}...`);
            
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_API_KEY}`
                },
                params
            });
            
            const records = response.data.records || [];
            allRecords = allRecords.concat(records);
            offset = response.data.offset;
            page++;
            
            console.log(`   Got ${records.length} records (total: ${allRecords.length})`);
            
            // Rate limiting
            if (offset) {
                await sleep(RATE_LIMIT_DELAY);
            }
            
        } catch (error) {
            console.error(`❌ Error fetching ${tableName} page ${page}:`, error.response?.data || error.message);
            throw error;
        }
        
    } while (offset);
    
    console.log(`✅ Fetched ${allRecords.length} total records from ${tableName}`);
    return allRecords;
}

/**
 * Parse JSON string safely
 */
function safeJsonParse(jsonString, defaultValue = null) {
    if (!jsonString || typeof jsonString !== 'string') {
        return defaultValue;
    }
    
    try {
        // Handle double-encoded JSON strings
        if (jsonString.startsWith('"[') || jsonString.startsWith('"{')) {
            jsonString = JSON.parse(jsonString);
        }
        
        const parsed = JSON.parse(jsonString);
        return parsed;
    } catch (error) {
        console.warn('⚠️ Failed to parse JSON:', jsonString.substring(0, 100) + '...');
        return defaultValue;
    }
}

/**
 * Transform Airtable processed record to PostgreSQL format
 */
function transformProcessedRecord(airtableRecord) {
    const fields = airtableRecord.fields;
    
    // Parse complex fields
    const links = safeJsonParse(fields.Links, []);
    const keyEntities = safeJsonParse(fields['Key Entities'], {});
    const mainTopics = safeJsonParse(fields['Main Topics'], []);
    
    // Convert status values
    const processingStatus = (fields.Select || 'Processing').toLowerCase()
        .replace('complete', 'completed');
    
    const embeddingStatus = (fields['Embedding Status'] || 'pending').toLowerCase();
    
    // Handle emotions array
    const emotions = Array.isArray(fields.Emotions) ? fields.Emotions : [];
    
    return {
        airtable_id: airtableRecord.id,
        url: fields.URL || '',
        title: fields.Title || '',
        summary: fields.Summary || '',
        chunk_text: fields['Chunk Text'] || fields.Content || '',
        chunk_id: fields['Chunk ID'] || `migrated-${airtableRecord.id}`,
        chunk_index: fields['Chunk Index'] || 0,
        sentiment: fields.Sentiment || null,
        emotions: emotions,
        category: fields.Category || null,
        content_type: fields['Content Type'] || 'article',
        technical_level: fields['Technical Level'] || 'intermediate',
        main_topics: Array.isArray(mainTopics) ? mainTopics : [mainTopics].filter(Boolean),
        key_concepts: fields['Key Concepts'] ? fields['Key Concepts'].split(',').map(s => s.trim()) : [],
        tags: fields.Tags || '',
        key_entities: keyEntities,
        embedding_status: embeddingStatus,
        processing_status: processingStatus,
        created_time: new Date(airtableRecord.createdTime),
        processed_date: fields['Date Processed'] ? new Date(fields['Date Processed']) : new Date(airtableRecord.createdTime),
        sent_to_li: false,
        source: fields.Source || 'autollama.io',
        vector_id: fields['Vector ID'] || null,
        sessions_link: Array.isArray(fields.Sessions) ? fields.Sessions.join(',') : null
    };
}

/**
 * Transform Airtable session record to PostgreSQL format
 */
function transformSessionRecord(airtableRecord) {
    const fields = airtableRecord.fields;
    
    // Convert status
    const status = (fields.Status || 'Processing').toLowerCase();
    
    return {
        airtable_session_id: airtableRecord.id,
        session_id: fields['Session ID'] || `migrated-session-${airtableRecord.id}`,
        filename: fields.Filename || null,
        title: fields.Filename || null,
        url: `file://${fields.Filename || 'unknown'}`,
        total_chunks: fields['Total Chunks'] || 0,
        processed_chunks: fields['Completed Chunks'] || 0,
        completed_chunks: fields['Completed Chunks'] || 0,
        status: status,
        file_path: fields['File Path'] || null,
        created_at: fields['Created At'] ? new Date(fields['Created At']) : new Date(airtableRecord.createdTime),
        last_activity: fields['Updated At'] ? new Date(fields['Updated At']) : new Date(airtableRecord.createdTime),
        completed_at: status === 'completed' ? (fields['Updated At'] ? new Date(fields['Updated At']) : new Date()) : null,
        associated_urls: Array.isArray(fields['Associated URLs']) ? fields['Associated URLs'] : []
    };
}

/**
 * Insert processed records into PostgreSQL
 */
async function insertProcessedRecords(records) {
    console.log(`📝 Inserting ${records.length} processed records into PostgreSQL...`);
    
    const query = `
        INSERT INTO processed_content (
            airtable_id, url, title, summary, chunk_text, chunk_id, chunk_index,
            sentiment, emotions, category, content_type, technical_level,
            main_topics, key_concepts, tags, key_entities, embedding_status,
            processing_status, created_time, processed_date, sent_to_li,
            source, vector_id, sessions_link
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 
            $16, $17, $18, $19, $20, $21, $22, $23, $24
        )
        ON CONFLICT (chunk_id) DO UPDATE SET
            title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            sentiment = EXCLUDED.sentiment,
            emotions = EXCLUDED.emotions,
            category = EXCLUDED.category,
            embedding_status = EXCLUDED.embedding_status,
            processing_status = EXCLUDED.processing_status,
            processed_date = EXCLUDED.processed_date,
            vector_id = EXCLUDED.vector_id,
            sessions_link = EXCLUDED.sessions_link
    `;
    
    let successful = 0;
    let failed = 0;
    
    for (const record of records) {
        try {
            const values = [
                record.airtable_id,
                record.url,
                record.title,
                record.summary,
                record.chunk_text,
                record.chunk_id,
                record.chunk_index,
                record.sentiment,
                record.emotions,
                record.category,
                record.content_type,
                record.technical_level,
                record.main_topics,
                record.key_concepts,
                record.tags,
                record.key_entities,
                record.embedding_status,
                record.processing_status,
                record.created_time,
                record.processed_date,
                record.sent_to_li,
                record.source,
                record.vector_id,
                record.sessions_link
            ];
            
            await pool.query(query, values);
            successful++;
            
            if (successful % 10 === 0) {
                console.log(`   Inserted ${successful}/${records.length} records...`);
            }
            
        } catch (error) {
            console.error(`❌ Failed to insert record ${record.chunk_id}:`, error.message);
            failed++;
        }
    }
    
    console.log(`✅ Processed records migration complete: ${successful} successful, ${failed} failed`);
    return { successful, failed };
}

/**
 * Insert session records into PostgreSQL
 */
async function insertSessionRecords(records) {
    console.log(`📝 Inserting ${records.length} session records into PostgreSQL...`);
    
    const query = `
        INSERT INTO upload_sessions (
            airtable_session_id, session_id, filename, title, url, total_chunks,
            processed_chunks, completed_chunks, status, file_path, created_at,
            last_activity, completed_at, associated_urls
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        ON CONFLICT (session_id) DO UPDATE SET
            filename = EXCLUDED.filename,
            title = EXCLUDED.title,
            total_chunks = EXCLUDED.total_chunks,
            processed_chunks = EXCLUDED.processed_chunks,
            completed_chunks = EXCLUDED.completed_chunks,
            status = EXCLUDED.status,
            last_activity = EXCLUDED.last_activity,
            completed_at = EXCLUDED.completed_at,
            associated_urls = EXCLUDED.associated_urls
    `;
    
    let successful = 0;
    let failed = 0;
    
    for (const record of records) {
        try {
            const values = [
                record.airtable_session_id,
                record.session_id,
                record.filename,
                record.title,
                record.url,
                record.total_chunks,
                record.processed_chunks,
                record.completed_chunks,
                record.status,
                record.file_path,
                record.created_at,
                record.last_activity,
                record.completed_at,
                record.associated_urls
            ];
            
            await pool.query(query, values);
            successful++;
            
        } catch (error) {
            console.error(`❌ Failed to insert session ${record.session_id}:`, error.message);
            failed++;
        }
    }
    
    console.log(`✅ Session records migration complete: ${successful} successful, ${failed} failed`);
    return { successful, failed };
}

/**
 * Verify migration results
 */
async function verifyMigration() {
    console.log(`🔍 Verifying migration results...`);
    
    try {
        // Count records
        const contentCount = await pool.query('SELECT COUNT(*) FROM processed_content');
        const sessionCount = await pool.query('SELECT COUNT(*) FROM upload_sessions');
        const uniqueUrls = await pool.query('SELECT COUNT(DISTINCT url) FROM processed_content');
        
        console.log(`📊 Migration Results:`);
        console.log(`   Content records: ${contentCount.rows[0].count}`);
        console.log(`   Session records: ${sessionCount.rows[0].count}`);
        console.log(`   Unique URLs: ${uniqueUrls.rows[0].count}`);
        
        // Sample verification
        const sample = await pool.query(`
            SELECT airtable_id, url, title, chunk_id, embedding_status, processing_status
            FROM processed_content 
            ORDER BY created_time DESC 
            LIMIT 3
        `);
        
        console.log(`📋 Sample records:`);
        sample.rows.forEach((row, i) => {
            console.log(`   ${i + 1}. ${row.title?.substring(0, 50)}...`);
            console.log(`      URL: ${row.url}`);
            console.log(`      Status: ${row.processing_status} / ${row.embedding_status}`);
            console.log(`      Airtable ID: ${row.airtable_id}`);
            console.log('');
        });
        
        return {
            contentRecords: parseInt(contentCount.rows[0].count),
            sessionRecords: parseInt(sessionCount.rows[0].count),
            uniqueUrls: parseInt(uniqueUrls.rows[0].count)
        };
        
    } catch (error) {
        console.error('❌ Verification failed:', error.message);
        throw error;
    }
}

/**
 * Main migration function
 */
async function runMigration() {
    console.log('🚀 Starting Airtable to PostgreSQL Migration...\n');
    
    try {
        // Test database connection
        console.log('🔌 Testing PostgreSQL connection...');
        await pool.query('SELECT NOW()');
        console.log('✅ PostgreSQL connection successful\n');
        
        // Fetch data from Airtable
        const [processedRecords, sessionRecords] = await Promise.all([
            fetchAllAirtableRecords(PROCESSED_TABLE_ID, 'Processed'),
            fetchAllAirtableRecords(SESSIONS_TABLE_ID, 'Sessions')
        ]);
        
        console.log('\n📊 Migration Summary:');
        console.log(`   Processed records to migrate: ${processedRecords.length}`);
        console.log(`   Session records to migrate: ${sessionRecords.length}\n`);
        
        // Transform records
        console.log('🔄 Transforming records...');
        const transformedProcessed = processedRecords.map(transformProcessedRecord);
        const transformedSessions = sessionRecords.filter(r => r.fields && Object.keys(r.fields).length > 0).map(transformSessionRecord);
        
        console.log(`✅ Transformed ${transformedProcessed.length} processed records`);
        console.log(`✅ Transformed ${transformedSessions.length} session records\n`);
        
        // Insert into PostgreSQL
        const processedResults = await insertProcessedRecords(transformedProcessed);
        const sessionResults = await insertSessionRecords(transformedSessions);
        
        console.log('\n📈 Migration Results:');
        console.log(`   Processed records: ${processedResults.successful} successful, ${processedResults.failed} failed`);
        console.log(`   Session records: ${sessionResults.successful} successful, ${sessionResults.failed} failed\n`);
        
        // Verify migration
        const verification = await verifyMigration();
        
        console.log('\n🎉 Migration completed successfully!');
        console.log(`✅ Total records migrated: ${verification.contentRecords + verification.sessionRecords}`);
        
        return verification;
        
    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run migration if called directly
if (require.main === module) {
    runMigration()
        .then((results) => {
            console.log('\n✅ Migration script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { runMigration, fetchAllAirtableRecords, transformProcessedRecord, transformSessionRecord };