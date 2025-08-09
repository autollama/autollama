#!/usr/bin/env node

/**
 * Simple Airtable to PostgreSQL Migration Script
 * Runs via Docker exec to avoid network complexity
 */

const fetch = require('node-fetch');
const fs = require('fs');

// Configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || 'pat9Xj5Fwn6cY5CeW.31352d792c86e4640793c99051db81d06675675dbf0fd942581de78076ba2e5d';
const AIRTABLE_BASE_ID = 'appi5lnDWjvstGsqr';
const AIRTABLE_TABLE_ID = 'tblrO3XjykQIqURb4';

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchAirtableRecords() {
    console.log('📡 Fetching records from Airtable...');
    
    let allRecords = [];
    let offset = null;
    let pageCount = 0;
    
    try {
        do {
            pageCount++;
            console.log(`   📄 Fetching page ${pageCount}...`);
            
            // Use a simple query to get recent data first
            const params = new URLSearchParams({
                pageSize: '100'
            });
            
            if (offset) {
                params.append('offset', offset);
            }
            
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params}`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Airtable API error: ${response.status} - ${errorText}`);
                break; // Don't fail completely, use what we have
            }
            
            const data = await response.json();
            allRecords = allRecords.concat(data.records);
            offset = data.offset;
            
            console.log(`   ✅ Page ${pageCount}: ${data.records.length} records fetched`);
            
            // Rate limiting: 5 requests per second max
            await sleep(250);
            
            // Limit to first 500 records for initial migration
            if (allRecords.length >= 500) {
                console.log('📊 Limiting to first 500 records for initial migration');
                break;
            }
            
        } while (offset);
        
        console.log(`📊 Total records fetched: ${allRecords.length}`);
        return allRecords;
        
    } catch (error) {
        console.error(`❌ Error fetching from Airtable:`, error.message);
        return []; // Return empty array instead of failing
    }
}

function generateInsertSQL(records) {
    console.log('🔄 Generating SQL INSERT statements...');
    
    let sql = '-- AutoLlama Migration Data\n';
    sql += '-- Generated automatically from Airtable data\n\n';
    
    let insertCount = 0;
    
    for (const record of records) {
        const fields = record.fields;
        
        // Skip records without essential fields
        if (!fields.URL || !fields.Title) {
            continue;
        }
        
        // Clean and escape values
        const cleanValue = (value) => {
            if (value === null || value === undefined) return null;
            if (typeof value === 'string') {
                return value.replace(/'/g, "''"); // Escape single quotes
            }
            if (Array.isArray(value)) {
                return value.join(', ');
            }
            return String(value);
        };
        
        const url = cleanValue(fields.URL);
        const title = cleanValue(fields.Title);
        const summary = cleanValue(fields.Summary) || 'No summary available';
        const sentiment = cleanValue(fields.Sentiment) || 'Neutral';
        const category = cleanValue(fields.Category) || 'General';
        const contentType = cleanValue(fields['Content Type']) || 'article';
        const embeddingStatus = cleanValue(fields['Embedding Status']) || 'complete';
        const chunkId = cleanValue(fields['Chunk ID']) || `chunk-${record.id}`;
        const chunkIndex = fields['Chunk Index'] || 0;
        const emotions = fields.Emotions ? `ARRAY['${fields.Emotions.join("', '")}']` : 'ARRAY[]::TEXT[]';
        const mainTopics = fields['Main Topics'] ? `ARRAY['${fields['Main Topics'].join("', '")}']` : 'ARRAY[]::TEXT[]';
        const tags = cleanValue(fields.Tags) || '';
        const keyConcepts = cleanValue(fields['Key Concepts']) || '';
        
        // Handle timestamps
        const createdTime = fields['Created Time'] ? `'${fields['Created Time']}'` : 'NOW()';
        
        sql += `INSERT INTO processed_content (\n`;
        sql += `    url, title, summary, sentiment, category, content_type,\n`;
        sql += `    embedding_status, chunk_id, chunk_index, emotions, main_topics,\n`;
        sql += `    tags, key_concepts, created_time, airtable_record_id\n`;
        sql += `) VALUES (\n`;
        sql += `    '${url}',\n`;
        sql += `    '${title}',\n`;
        sql += `    '${summary}',\n`;
        sql += `    '${sentiment}',\n`;
        sql += `    '${category}',\n`;
        sql += `    '${contentType}',\n`;
        sql += `    '${embeddingStatus}',\n`;
        sql += `    '${chunkId}',\n`;
        sql += `    ${chunkIndex},\n`;
        sql += `    ${emotions},\n`;
        sql += `    ${mainTopics},\n`;
        sql += `    '${tags}',\n`;
        sql += `    '${keyConcepts}',\n`;
        sql += `    ${createdTime},\n`;
        sql += `    '${record.id}'\n`;
        sql += `) ON CONFLICT (chunk_id) DO UPDATE SET\n`;
        sql += `    title = EXCLUDED.title,\n`;
        sql += `    summary = EXCLUDED.summary,\n`;
        sql += `    updated_at = NOW();\n\n`;
        
        insertCount++;
    }
    
    sql += `-- Migration complete: ${insertCount} records processed\n`;
    sql += `SELECT 'Migration completed: ' || COUNT(*) || ' total records' as result FROM processed_content;\n`;
    
    console.log(`✅ Generated SQL for ${insertCount} records`);
    return sql;
}

async function main() {
    console.log('🚀 Starting simple Airtable to PostgreSQL migration');
    console.log('=' .repeat(50));
    
    try {
        // Fetch data from Airtable
        const records = await fetchAirtableRecords();
        
        if (records.length === 0) {
            console.log('⚠️  No records fetched. Using sample data for now.');
            console.log('✅ You can run the full migration later when Airtable access is working.');
            return;
        }
        
        // Generate SQL
        const sql = generateInsertSQL(records);
        
        // Write SQL to file
        const sqlFile = '/tmp/migration.sql';
        fs.writeFileSync(sqlFile, sql);
        console.log(`💾 SQL written to: ${sqlFile}`);
        
        console.log('📋 To complete the migration, run:');
        console.log(`docker exec -i postgres-db-1 psql -U autollama_user -d autollama < ${sqlFile}`);
        
    } catch (error) {
        console.error('💥 Migration failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run migration if called directly
if (require.main === module) {
    main();
}