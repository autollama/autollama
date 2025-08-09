#!/usr/bin/env node

/**
 * Create synthetic document records for legacy chunks
 * This script creates parent document records for all unique URLs
 * that have chunks but no parent document
 */

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://autollama_user:autollama_secure_password_2024@100.92.210.53:5432/autollama'
});

async function createLegacyDocuments() {
    try {
        console.log('🔍 Starting legacy document creation process...');
        
        // Step 1: Find all unique URLs that have chunks but no document record
        // Use a simpler approach - get basic info and then fetch detailed info per URL
        const uniqueUrlsQuery = `
            SELECT DISTINCT
                url,
                COUNT(*) as chunk_count
            FROM processed_content 
            WHERE (record_type = 'chunk' OR record_type IS NULL)
            AND url NOT IN (
                SELECT DISTINCT url FROM processed_content WHERE record_type = 'document'
            )
            GROUP BY url
            ORDER BY chunk_count DESC
        `;
        
        const uniqueUrls = await pool.query(uniqueUrlsQuery);
        console.log(`📊 Found ${uniqueUrls.rows.length} unique documents that need parent records`);
        
        if (uniqueUrls.rows.length === 0) {
            console.log('✅ No legacy documents need to be created');
            return;
        }
        
        // Step 2: Create document records for each unique URL
        let createdCount = 0;
        
        for (const urlData of uniqueUrls.rows) {
            const documentId = 'doc_' + uuidv4();
            
            // Get detailed info for this URL
            const detailQuery = `
                SELECT title, summary, category, content_type, technical_level, 
                       main_topics, tags, key_entities, sentiment, emotions,
                       created_time, processed_date, upload_source
                FROM processed_content 
                WHERE url = $1 AND (record_type = 'chunk' OR record_type IS NULL)
                ORDER BY created_time 
                LIMIT 1
            `;
            
            const detailResult = await pool.query(detailQuery, [urlData.url]);
            const firstChunk = detailResult.rows[0] || {};
            
            // Extract a clean title from the URL or use the first chunk title
            let cleanTitle = firstChunk.title || 'Untitled Document';
            
            // If it's a file URL, try to extract filename for better title
            if (urlData.url.startsWith('file://')) {
                const filename = urlData.url.split('/').pop().split('.')[0];
                if (filename && filename.length > 3) {
                    cleanTitle = filename.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
                    // Limit title length
                    if (cleanTitle.length > 100) {
                        cleanTitle = cleanTitle.substring(0, 97) + '...';
                    }
                }
            }
            
            // Create summary based on first chunk or generate one
            let documentSummary = firstChunk.summary || `This document contains ${urlData.chunk_count} processed chunks covering various topics.`;
            if (documentSummary.length > 500) {
                documentSummary = documentSummary.substring(0, 497) + '...';
            }
            
            const insertDocumentQuery = `
                INSERT INTO processed_content (
                    url, title, summary, chunk_text, chunk_id,
                    sentiment, emotions, category, content_type, technical_level,
                    main_topics, tags, key_entities, embedding_status,
                    processing_status, created_time, processed_date,
                    upload_source, record_type, chunk_index
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
                )
                RETURNING id, chunk_id
            `;
            
            const documentValues = [
                urlData.url,
                cleanTitle,
                documentSummary,
                '', // Empty chunk_text for documents
                documentId,
                firstChunk.sentiment || 'Neutral',
                firstChunk.emotions || [],
                firstChunk.category || 'General',
                firstChunk.content_type || 'document',
                firstChunk.technical_level || 'intermediate',
                firstChunk.main_topics || [],
                firstChunk.tags || '',
                firstChunk.key_entities || {},
                'pending', // embedding_status
                'completed', // processing_status
                firstChunk.created_time || new Date(),
                firstChunk.processed_date || new Date(),
                firstChunk.upload_source || 'user',
                'document', // record_type
                -1 // chunk_index (-1 for document records)
            ];
            
            try {
                const result = await pool.query(insertDocumentQuery, documentValues);
                const createdDoc = result.rows[0];
                
                console.log(`✅ Created document: ${cleanTitle} (${urlData.chunk_count} chunks) - ID: ${createdDoc.id}`);
                createdCount++;
                
                // Step 3: Link all chunks for this URL to the new document
                const linkChunksQuery = `
                    UPDATE processed_content 
                    SET parent_document_id = $1
                    WHERE url = $2 AND (record_type = 'chunk' OR record_type IS NULL)
                    AND parent_document_id IS NULL
                `;
                
                const linkResult = await pool.query(linkChunksQuery, [createdDoc.id, urlData.url]);
                console.log(`🔗 Linked ${linkResult.rowCount} chunks to document ${createdDoc.id}`);
                
            } catch (error) {
                console.error(`❌ Error creating document for ${urlData.url}:`, error.message);
            }
        }
        
        console.log(`🎉 Successfully created ${createdCount} document records and linked their chunks`);
        
        // Step 4: Verify the results
        const verificationQuery = `
            SELECT 
                COUNT(CASE WHEN record_type = 'document' THEN 1 END) as document_count,
                COUNT(CASE WHEN record_type = 'chunk' AND parent_document_id IS NOT NULL THEN 1 END) as linked_chunks,
                COUNT(CASE WHEN record_type = 'chunk' AND parent_document_id IS NULL THEN 1 END) as orphaned_chunks
            FROM processed_content
        `;
        
        const verification = await pool.query(verificationQuery);
        const stats = verification.rows[0];
        
        console.log('\n📈 Final Statistics:');
        console.log(`- Documents: ${stats.document_count}`);
        console.log(`- Linked chunks: ${stats.linked_chunks}`);
        console.log(`- Orphaned chunks: ${stats.orphaned_chunks}`);
        
        if (parseInt(stats.orphaned_chunks) > 0) {
            console.log('⚠️  Some chunks remain orphaned - this may indicate an issue');
        } else {
            console.log('✅ All chunks are now properly linked to documents');
        }
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run the script
createLegacyDocuments();