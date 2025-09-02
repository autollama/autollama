/**
 * PostgreSQL Database Layer for AutoLlama
 * This replaces Airtable completely for better performance and reliability
 */

const { Pool } = require('pg');

// Connection leak tracking
let connectionMetrics = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    waitingRequests: 0,
    connectionLeaks: 0,
    lastLeakCheck: Date.now()
};

// PostgreSQL connection with enhanced monitoring
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/autollama',
    max: 15, // Reduced from 20 for better resource management
    idleTimeoutMillis: 20000, // Reduced from 30s to 20s for faster cleanup
    connectionTimeoutMillis: 5000, // Increased to 5s for better reliability
    allowExitOnIdle: true, // Allow pool to exit when idle
});

// Enhanced connection monitoring
pool.on('connect', (client) => {
    connectionMetrics.totalConnections++;
    connectionMetrics.activeConnections++;
    console.log(`📊 DB connection established. Active: ${connectionMetrics.activeConnections}`);
});

pool.on('acquire', (client) => {
    connectionMetrics.activeConnections++;
    console.log(`📊 DB connection acquired. Active: ${connectionMetrics.activeConnections}`);
});

pool.on('release', (client) => {
    connectionMetrics.activeConnections--;
    console.log(`📊 DB connection released. Active: ${connectionMetrics.activeConnections}`);
});

pool.on('error', (err, client) => {
    console.error('❌ Unexpected database error:', err);
    connectionMetrics.connectionLeaks++;
});

pool.on('remove', (client) => {
    connectionMetrics.totalConnections--;
    console.log(`📊 DB connection removed. Total: ${connectionMetrics.totalConnections}`);
});

// Simple in-memory cache for query results
const queryCache = new Map();
const CACHE_TTL = 300000; // 5 minutes

function getCacheKey(query, params = []) {
    return JSON.stringify({ query: query.replace(/\s+/g, ' ').trim(), params });
}

function getFromCache(cacheKey) {
    const cached = queryCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    if (cached) {
        queryCache.delete(cacheKey); // Remove expired cache
    }
    return null;
}

function setCache(cacheKey, data) {
    queryCache.set(cacheKey, {
        data,
        timestamp: Date.now()
    });
    
    // Simple cache cleanup - remove old entries when cache gets large
    if (queryCache.size > 100) {
        const entries = Array.from(queryCache.entries());
        const now = Date.now();
        entries.forEach(([key, value]) => {
            if (now - value.timestamp > CACHE_TTL) {
                queryCache.delete(key);
            }
        });
    }
}

// Cache invalidation functions for real-time updates
function clearDocumentsCache() {
    // Clear all document-related cache entries
    const keysToDelete = [];
    for (const [key] of queryCache.entries()) {
        const parsedKey = JSON.parse(key);
        if (parsedKey.query.includes('latest_documents') || 
            parsedKey.query.includes('processed_content') ||
            parsedKey.query.includes('getSmartContentMix')) {
            keysToDelete.push(key);
        }
    }
    keysToDelete.forEach(key => queryCache.delete(key));
    console.log(`🔄 Invalidated ${keysToDelete.length} document cache entries`);
}

function clearAllCache() {
    queryCache.clear();
    console.log('🔄 All cache cleared');
}

// Enhanced query function with caching
async function cachedQuery(query, params = [], cacheable = true) {
    const cacheKey = getCacheKey(query, params);
    
    if (cacheable) {
        const cached = getFromCache(cacheKey);
        if (cached) {
            console.log('🚀 Cache hit for query');
            return cached;
        }
    }
    
    const result = await pool.query(query, params);
    
    if (cacheable) {
        setCache(cacheKey, result);
        console.log('💾 Query result cached');
    }
    
    return result;
}

// Connection leak detection
function checkConnectionLeaks() {
    const now = Date.now();
    const timeSinceLastCheck = now - connectionMetrics.lastLeakCheck;
    
    // Update current pool stats
    connectionMetrics.idleConnections = pool.idleCount;
    connectionMetrics.waitingRequests = pool.waitingCount;
    
    // Check for potential leaks
    const potentialLeak = connectionMetrics.activeConnections > 10 && timeSinceLastCheck > 30000; // 30s
    
    if (potentialLeak) {
        console.warn('⚠️ Potential connection leak detected:', {
            activeConnections: connectionMetrics.activeConnections,
            idleConnections: connectionMetrics.idleConnections,
            waitingRequests: connectionMetrics.waitingRequests,
            totalConnections: connectionMetrics.totalConnections
        });
        connectionMetrics.connectionLeaks++;
    }
    
    connectionMetrics.lastLeakCheck = now;
    return connectionMetrics;
}

// Get connection pool statistics
function getConnectionStats() {
    return {
        ...connectionMetrics,
        poolStats: {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount
        },
        healthy: connectionMetrics.activeConnections < 10 && connectionMetrics.connectionLeaks < 5
    };
}

// Periodic connection health monitoring
setInterval(() => {
    const stats = checkConnectionLeaks();
    
    // Log stats every 5 minutes if there are active connections
    if (stats.activeConnections > 0 || stats.connectionLeaks > 0) {
        console.log('📊 DB Connection Health:', {
            active: stats.activeConnections,
            idle: stats.idleConnections,
            waiting: stats.waitingRequests,
            leaks: stats.connectionLeaks,
            total: pool.totalCount
        });
    }
}, 300000); // Every 5 minutes

// Test database connection
async function testConnection() {
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('✅ PostgreSQL connected successfully:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('❌ PostgreSQL connection failed:', error.message);
        return false;
    }
}

/**
 * Initialize database tables if they don't exist
 */
async function initializeDatabase() {
    try {
        // Create processed_content table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS processed_content (
                id SERIAL PRIMARY KEY,
                airtable_id VARCHAR(255) UNIQUE,
                url TEXT NOT NULL,
                title VARCHAR(500),
                summary TEXT,
                chunk_text TEXT,
                chunk_id VARCHAR(255) UNIQUE NOT NULL,
                chunk_index INTEGER,
                sentiment VARCHAR(50),
                emotions TEXT[],
                category VARCHAR(100),
                content_type VARCHAR(50),
                technical_level VARCHAR(50),
                main_topics TEXT[],
                key_concepts TEXT[],
                tags TEXT,
                key_entities JSONB,
                embedding_status VARCHAR(50) DEFAULT 'pending',
                processing_status VARCHAR(50) DEFAULT 'processing',
                created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sent_to_li BOOLEAN DEFAULT FALSE
            )
        `);

        // Check if contextual embeddings columns already exist
        const columnCheck = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'processed_content' 
            AND column_name IN ('contextual_summary', 'uses_contextual_embedding')
        `);
        
        if (columnCheck.rows.length >= 2) {
            console.log('✅ Contextual embeddings columns already exist');
        } else {
            // Add contextual embeddings columns if they don't exist
            try {
                await pool.query(`
                    ALTER TABLE processed_content 
                    ADD COLUMN IF NOT EXISTS contextual_summary TEXT,
                    ADD COLUMN IF NOT EXISTS uses_contextual_embedding BOOLEAN DEFAULT FALSE
                `);
                console.log('✅ Contextual embeddings columns added to processed_content table');
            } catch (error) {
                console.log('ℹ️ Failed to add contextual embeddings columns:', error.message);
            }
        }

        // Note: record_type and parent_document_id columns are added by migration script
        console.log('✅ Record type columns handled by migration script');

        // Create upload_sessions table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS upload_sessions (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(255) UNIQUE NOT NULL,
                filename VARCHAR(500),
                url TEXT,
                total_chunks INTEGER,
                processed_chunks INTEGER DEFAULT 0,
                completed_chunks INTEGER DEFAULT 0,
                status VARCHAR(50) DEFAULT 'processing',
                file_path TEXT,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Note: document_summaries view is now created by migration script
        // to handle Document/Chunk distinction properly
        console.log('✅ Views are handled by migration script');

        // Create indexes for performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_processed_content_url ON processed_content(url)',
            'CREATE INDEX IF NOT EXISTS idx_processed_content_created ON processed_content(created_time DESC)',
            'CREATE INDEX IF NOT EXISTS idx_processed_content_chunk_id ON processed_content(chunk_id)',
            'CREATE INDEX IF NOT EXISTS idx_processed_content_chunk_index ON processed_content(url, chunk_index)',
            'CREATE INDEX IF NOT EXISTS idx_processed_content_status ON processed_content(processing_status)',
            'CREATE INDEX IF NOT EXISTS idx_processed_content_embedding ON processed_content(embedding_status)',
            'CREATE INDEX IF NOT EXISTS idx_upload_sessions_session_id ON upload_sessions(session_id)',
            'CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status)',
        ];

        for (const index of indexes) {
            await pool.query(index);
        }

        // Run database migrations to ensure v2.3 compatibility
        console.log('🔄 Running database migrations...');
        try {
            const MigrationRunner = require('./run-migrations');
            const migrationRunner = new MigrationRunner();
            
            const needsMigrations = await migrationRunner.checkMigrationsNeeded();
            if (needsMigrations) {
                await migrationRunner.runMigrations();
            }
            await migrationRunner.close();
            
            console.log('✅ Database migrations completed');
        } catch (error) {
            console.error('⚠️ Migration error (continuing anyway):', error.message);
        }

        console.log('✅ Database tables initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize database:', error.message);
        return false;
    }
}

/**
 * Get recent content (last 24 hours)
 */
async function getRecentContent(hoursBack = 24) {
    try {
        // OPTIMIZED: Use window functions and indexes for better performance
        const query = `
            WITH recent_docs AS (
                SELECT 
                    id, airtable_id, url, title, summary, sentiment, emotions, category,
                    content_type, technical_level, main_topics, tags, key_entities,
                    embedding_status, processing_status, created_time, processed_date,
                    sent_to_li, upload_source,
                    ROW_NUMBER() OVER (PARTITION BY url ORDER BY created_time DESC) as rn
                FROM processed_content
                WHERE created_time >= NOW() - INTERVAL '${hoursBack} hours'
                    AND (record_type IN ('document', 'chunk') OR record_type IS NULL)
            ),
            chunk_counts AS (
                SELECT 
                    url,
                    COUNT(*) as chunk_count
                FROM processed_content 
                WHERE record_type = 'chunk' OR record_type IS NULL
                GROUP BY url
            )
            SELECT 
                rd.id, rd.airtable_id, rd.url, rd.title, rd.summary, rd.sentiment,
                rd.emotions, rd.category, rd.content_type, rd.technical_level,
                rd.main_topics, rd.tags, rd.key_entities,
                rd.embedding_status as "embeddingStatus",
                rd.processing_status, rd.created_time, rd.processed_date,
                rd.sent_to_li, rd.upload_source,
                COALESCE(cc.chunk_count, 0) as chunk_count
            FROM recent_docs rd
            LEFT JOIN chunk_counts cc ON rd.url = cc.url
            WHERE rd.rn = 1
            ORDER BY rd.created_time DESC
            LIMIT 100
        `;
        
        const result = await cachedQuery(query, [], true);
        console.log(`✅ Fetched ${result.rows.length} recent records from PostgreSQL`);
        
        return result.rows.map(row => ({
            ...row,
            createdTime: row.created_time,
            processedDate: row.processed_date,
            contentType: row.content_type,
            technicalLevel: row.technical_level,
            mainTopics: row.main_topics,
            keyEntities: row.key_entities || {},
            sentToLi: row.sent_to_li,
            uploadSource: row.upload_source || 'user', // Default to user for backwards compatibility
            chunkCount: row.chunk_count || 0 // Include chunk count for frontend
        }));
    } catch (error) {
        console.error('❌ Error fetching recent content:', error.message);
        return [];
    }
}

/**
 * Get historical content (older than 24 hours)
 */
async function getHistoricalContent(hoursBack = 24, limit = 500) {
    try {
        const query = `
            WITH historical_docs AS (
                SELECT DISTINCT ON (url) 
                    id,
                    airtable_id,
                    url,
                    title,
                    summary,
                    sentiment,
                    emotions,
                    category,
                    content_type,
                    technical_level,
                    main_topics,
                    tags,
                    key_entities,
                    embedding_status as "embeddingStatus",
                    processing_status,
                    created_time,
                    processed_date,
                    sent_to_li,
                    upload_source
                FROM processed_content
                WHERE created_time < NOW() - INTERVAL '${hoursBack} hours'
                ORDER BY url, created_time DESC
                LIMIT ${limit}
            ),
            chunk_counts AS (
                SELECT 
                    url,
                    COUNT(*) as chunk_count
                FROM processed_content 
                WHERE record_type = 'chunk' OR record_type IS NULL
                GROUP BY url
            )
            SELECT 
                hd.*,
                COALESCE(cc.chunk_count, 0) as chunk_count
            FROM historical_docs hd
            LEFT JOIN chunk_counts cc ON hd.url = cc.url
            ORDER BY hd.created_time DESC
        `;
        
        const result = await pool.query(query);
        console.log(`✅ Fetched ${result.rows.length} historical records from PostgreSQL`);
        
        return result.rows.map(row => ({
            ...row,
            createdTime: row.created_time,
            processedDate: row.processed_date,
            contentType: row.content_type,
            technicalLevel: row.technical_level,
            mainTopics: row.main_topics,
            keyEntities: row.key_entities || {},
            sentToLi: row.sent_to_li,
            uploadSource: row.upload_source || 'user', // Default to user for backwards compatibility
            chunkCount: row.chunk_count || 0 // Include chunk count for frontend
        }));
    } catch (error) {
        console.error('❌ Error fetching historical content:', error.message);
        return [];
    }
}

/**
 * Get smart content mix - combines recent and historical
 */
async function getSmartContentMix() {
    console.log('⚡ Getting documents from PostgreSQL (optimized query)');
    
    try {
        // OPTIMIZED: Use the new URL + record_type index for better performance
        const query = `
            WITH latest_documents AS (
                SELECT 
                    id, url, title, summary, created_time, category, content_type, uses_contextual_embedding,
                    ROW_NUMBER() OVER (PARTITION BY url ORDER BY created_time DESC) as rn
                FROM processed_content 
                WHERE record_type IN ('document', 'chunk') OR record_type IS NULL
            ),
            chunk_counts AS (
                SELECT 
                    url,
                    COUNT(*) as chunk_count
                FROM processed_content 
                WHERE record_type = 'chunk' OR record_type IS NULL
                GROUP BY url
            )
            SELECT 
                ld.id,
                ld.url,
                ld.title,
                ld.summary,
                ld.created_time,
                ld.category,
                ld.content_type,
                ld.uses_contextual_embedding,
                'documents' as data_source,
                (ld.created_time >= NOW() - INTERVAL '24 hours') as is_fresh,
                COALESCE(cc.chunk_count, 0) as chunk_count
            FROM latest_documents ld
            LEFT JOIN chunk_counts cc ON ld.url = cc.url
            WHERE ld.rn = 1
        `;
        
        const result = await cachedQuery(query, [], false); // DISABLE CACHE - invalidation not working properly
        const records = result.rows;
        
        // Sort by created_time DESC (newest first)
        records.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));
        
        const recentCount = records.filter(r => r.is_fresh).length;
        const historicalCount = records.length - recentCount;
        
        console.log(`📊 Chronological order: ${recentCount} recent + ${historicalCount} historical = ${records.length} total`);
        
        return {
            records: records,
            metadata: {
                recent_count: recentCount,
                historical_count: historicalCount,
                total_count: records.length,
                cache_status: 'direct-db',
                fresh_cutoff_hours: 24
            }
        };
    } catch (error) {
        console.error('❌ Error in getSmartContentMix:', error);
        throw error;
    }
}

/**
 * Get active upload sessions
 */
async function getActiveUploadSessions() {
    try {
        const query = `
            SELECT * FROM upload_sessions
            WHERE status = 'processing'
               OR (status != 'completed' AND last_activity >= NOW() - INTERVAL '1 hour')
            ORDER BY last_activity DESC
        `;
        
        const result = await pool.query(query);
        console.log(`✅ Found ${result.rows.length} active upload sessions`);
        
        return result.rows.map(row => ({
            id: row.session_id,
            sessionId: row.session_id,
            url: row.url,
            filename: row.filename,
            title: row.filename,
            total_chunks: row.total_chunks,
            processed_chunks: row.processed_chunks,
            completed_chunks: row.completed_chunks,
            status: row.status,
            created_at: row.created_at,
            last_activity: row.last_activity
        }));
    } catch (error) {
        console.error('❌ Error fetching active sessions:', error.message);
        return [];
    }
}

/**
 * Add new content record (Document or Chunk)
 */
async function addContentRecord(contentData) {
    const query = `
        INSERT INTO processed_content (
            url, title, summary, chunk_text, chunk_id, chunk_index,
            sentiment, emotions, category, content_type, technical_level,
            main_topics, key_concepts, tags, key_entities, embedding_status,
            processing_status, contextual_summary, uses_contextual_embedding,
            created_time, processed_date, upload_source, record_type, parent_document_id
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        )
        ON CONFLICT (chunk_id) DO UPDATE SET
            title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            sentiment = EXCLUDED.sentiment,
            emotions = EXCLUDED.emotions,
            category = EXCLUDED.category,
            embedding_status = EXCLUDED.embedding_status,
            processing_status = EXCLUDED.processing_status,
            contextual_summary = EXCLUDED.contextual_summary,
            uses_contextual_embedding = EXCLUDED.uses_contextual_embedding,
            processed_date = CURRENT_TIMESTAMP
        RETURNING *
    `;
    
    const values = [
        contentData.url,
        contentData.title,
        contentData.summary,
        contentData.chunk_text,
        contentData.chunk_id,
        contentData.chunk_index || 0,
        contentData.sentiment,
        contentData.emotions || [],
        contentData.category,
        contentData.content_type || 'article',
        contentData.technical_level || 'intermediate',
        contentData.main_topics || [],
        contentData.key_concepts || [],
        contentData.tags || '',
        contentData.key_entities || {},
        contentData.embedding_status || 'pending',
        contentData.processing_status || 'completed',
        contentData.contextual_summary || null,
        contentData.uses_contextual_embedding || false,
        new Date(),
        new Date(),
        contentData.upload_source || 'user', // Default to 'user' for manual uploads
        contentData.record_type || 'chunk', // Default to 'chunk' for backward compatibility
        contentData.parent_document_id || null // Link to parent document if this is a chunk
    ];
    
    try {
        const result = await pool.query(query, values);
        console.log('✅ Content record added to PostgreSQL');
        
        // Invalidate documents cache when new content is added for real-time updates
        clearDocumentsCache();
        
        return result.rows[0];
    } catch (error) {
        console.error('❌ Error adding content record:', error.message);
        throw error;
    }
}

/**
 * Create upload session
 */
async function createUploadSession(sessionData) {
    const query = `
        INSERT INTO upload_sessions (
            session_id, filename, url, total_chunks, file_path, status, upload_source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `;
    
    const values = [
        sessionData.sessionId,
        sessionData.filename,
        sessionData.url || `file://${sessionData.filename}`,
        sessionData.totalChunks,
        sessionData.filePath,
        'processing',
        sessionData.upload_source || 'user' // Default to 'user' for manual uploads
    ];
    
    try {
        const result = await pool.query(query, values);
        console.log('✅ Upload session created in PostgreSQL');
        return {
            id: result.rows[0].id,
            sessionId: result.rows[0].session_id,
            ...result.rows[0]
        };
    } catch (error) {
        console.error('❌ Error creating upload session:', error.message);
        throw error;
    }
}

/**
 * Update upload session
 */
async function updateUploadSession(sessionId, updateData) {
    const query = `
        UPDATE upload_sessions 
        SET 
            processed_chunks = COALESCE($2, processed_chunks),
            completed_chunks = COALESCE($3, completed_chunks),
            status = COALESCE($4, status),
            last_activity = NOW(),
            completed_at = CASE WHEN $4 = 'completed' THEN NOW() ELSE completed_at END
        WHERE session_id = $1
        RETURNING *
    `;
    
    const values = [
        sessionId,
        updateData.processed_chunks,
        updateData.completed_chunks,
        updateData.status
    ];
    
    try {
        const result = await pool.query(query, values);
        if (result.rows.length > 0) {
            console.log('✅ Upload session updated');
            return result.rows[0];
        }
        return null;
    } catch (error) {
        console.error('❌ Error updating upload session:', error.message);
        throw error;
    }
}

/**
 * Get record by ID
 */
async function getRecordById(recordId) {
    try {
        // First try to find by numeric ID
        let query = `
            SELECT * FROM processed_content 
            WHERE id = $1 
            LIMIT 1
        `;
        let result = await pool.query(query, [recordId]);
        
        // If not found, try by airtable_id
        if (result.rows.length === 0) {
            query = `
                SELECT * FROM processed_content 
                WHERE airtable_id = $1 
                LIMIT 1
            `;
            result = await pool.query(query, [recordId]);
        }
        
        if (result.rows.length > 0) {
            const row = result.rows[0];
            return {
                ...row,
                createdTime: row.created_time,
                processedDate: row.processed_date,
                contentType: row.content_type,
                technicalLevel: row.technical_level,
                mainTopics: row.main_topics,
                keyEntities: row.key_entities || {},
                embeddingStatus: row.embedding_status,
                // 🧠 v2.0 Contextual Embeddings fields
                uses_contextual_embedding: row.uses_contextual_embedding,
                contextual_summary: row.contextual_summary
            };
        }
        
        return null;
    } catch (error) {
        console.error('❌ Error fetching record by ID:', error.message);
        return null;
    }
}

/**
 * Enhanced search content with full-text search capabilities
 */
async function searchContent(searchQuery, limit = 50) {
    try {
        console.log(`🔍 OPTIMIZED search for: "${searchQuery}"`);
        
        // ULTRA-OPTIMIZED: Use indexes, minimal data, fast queries
        const query = `
            WITH ranked_results AS (
                SELECT DISTINCT ON (url)
                    -- Only essential fields for search results (reduce I/O)
                    url, title, summary, chunk_text, chunk_id, chunk_index,
                    sentiment, category, content_type, technical_level, main_topics,
                    tags, key_entities, processing_status, created_time, source, contextual_summary,
                    -- Use indexed full-text search with ranking (including chunk_text)
                    ts_rank_cd(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(tags, '') || ' ' || COALESCE(chunk_text, '')), plainto_tsquery('english', $1)) as rank
                FROM processed_content
                WHERE 
                    -- Primary: Use GIN full-text search index (fastest) - including chunk_text
                    to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(tags, '') || ' ' || COALESCE(chunk_text, '')) @@ plainto_tsquery('english', $1)
                    -- Secondary: Use trigram indexes for fuzzy matching
                    OR title % $1
                    OR tags % $1
                    OR chunk_text % $1
                ORDER BY url, created_time DESC
            )
            SELECT 
                url, title, summary, chunk_text, chunk_id, chunk_index,
                sentiment, category, content_type, technical_level, main_topics,
                tags, key_entities, processing_status, created_time, source, contextual_summary,
                -- Add score for frontend sorting
                rank as score
            FROM ranked_results
            WHERE rank > 0.01  -- Filter very low relevance results
            ORDER BY rank DESC, created_time DESC
            LIMIT $2
        `;
        
        const result = await cachedQuery(query, [searchQuery, limit], false); // No cache for search results
        
        console.log(`✅ OPTIMIZED search found ${result.rows.length} results`);
        
        return result.rows.map(row => ({
            // Essential fields with optimized naming for frontend
            url: row.url,
            title: row.title,
            summary: row.summary,
            chunk_text: row.chunk_text,
            chunk_id: row.chunk_id,
            chunk_index: row.chunk_index,
            sentiment: row.sentiment,
            category: row.category,
            content_type: row.content_type,
            technical_level: row.technical_level,
            main_topics: row.main_topics,
            tags: row.tags,
            key_entities: row.key_entities || {},
            processing_status: row.processing_status,
            created_time: row.created_time,
            source: row.source,
            contextual_summary: row.contextual_summary,
            score: row.score || 0 // Relevance score for sorting
        }));
    } catch (error) {
        console.error('❌ Error searching content:', error.message);
        return [];
    }
}

/**
 * Search content by tag match - returns only documents that have the exact tag
 * @param {string} tag - Tag to search for
 * @param {string} tagField - Which field to search in (tags, main_topics, sentiment, content_type, technical_level)
 * @param {number} limit - Maximum number of results to return
 */
async function searchContentByTag(tag, tagField = 'tags', limit = 50) {
    try {
        console.log(`🏷️ Searching for tag: "${tag}" in field: "${tagField}"`);
        
        let whereClause;
        let queryParams = [tag, limit];
        
        switch (tagField) {
            case 'tags':
                // Tags is stored as JSON string like '{"wisdom","spirituality"}'
                whereClause = `tags LIKE $1`;
                queryParams[0] = `%"${tag}"%`;
                break;
            case 'main_topics':
                // main_topics is stored as PostgreSQL text array
                whereClause = `$1 = ANY(main_topics)`;
                break;
            case 'sentiment':
                whereClause = `sentiment = $1`;
                break;
            case 'content_type':
                whereClause = `content_type = $1`;
                break;
            case 'technical_level':
                whereClause = `technical_level = $1`;
                break;
            default:
                throw new Error(`Unsupported tag field: ${tagField}`);
        }
        
        const query = `
            WITH tag_results AS (
                SELECT 
                    id, airtable_id, url, title, summary, chunk_text, chunk_id, chunk_index,
                    sentiment, emotions, category, content_type, technical_level, main_topics,
                    key_concepts, tags, key_entities, embedding_status, processing_status,
                    created_time, processed_date, sent_to_li, source, contextual_summary, uses_contextual_embedding,
                    ROW_NUMBER() OVER (PARTITION BY url ORDER BY created_time DESC) as rn
                FROM processed_content
                WHERE ${whereClause}
            )
            SELECT 
                id, airtable_id, url, title, summary, chunk_text, chunk_id, chunk_index,
                sentiment, emotions, category, content_type, technical_level, main_topics,
                key_concepts, tags, key_entities, 
                embedding_status as "embeddingStatus",
                processing_status, created_time, processed_date, sent_to_li, source, contextual_summary, uses_contextual_embedding
            FROM tag_results
            WHERE rn = 1
            ORDER BY created_time DESC
            LIMIT $2
        `;
        
        const result = await cachedQuery(query, queryParams, true);
        
        console.log(`✅ Found ${result.rows.length} results for tag "${tag}" in field "${tagField}"`);
        
        return result.rows.map(row => ({
            ...row,
            createdTime: row.created_time,
            processedDate: row.processed_date,
            contentType: row.content_type,
            technicalLevel: row.technical_level,
            mainTopics: row.main_topics,
            keyEntities: row.key_entities || {},
            embeddingStatus: row.embedding_status,
            processingStatus: row.processing_status,
            sentToLi: row.sent_to_li,
            chunkText: row.chunk_text,
            chunkId: row.chunk_id,
            chunkIndex: row.chunk_index,
            airtableId: row.airtable_id,
            contextualSummary: row.contextual_summary,
            usesContextualEmbedding: row.uses_contextual_embedding
        }));
    } catch (error) {
        console.error('❌ Error searching content by tag:', error.message);
        return [];
    }
}

/**
 * Get database statistics
 */
async function getDatabaseStats() {
    try {
        // Get comprehensive database statistics including database size
        const [docStats, chunkStats, contextualStats, embeddedStats, sessionStats, recentStats, dbSizeStats] = await Promise.all([
            // Count unique documents (URLs) regardless of record_type
            pool.query(`SELECT COUNT(DISTINCT url) as document_count FROM processed_content`),
            // Count total chunks
            pool.query(`SELECT COUNT(*) as chunk_count FROM processed_content`),
            // Count contextual embeddings (chunks with contextual_summary)
            pool.query(`SELECT COUNT(*) as contextual_count FROM processed_content WHERE contextual_summary IS NOT NULL AND contextual_summary != ''`),
            // Count embedded chunks (with embedding_status = 'complete')
            pool.query(`SELECT COUNT(*) as embedded_count FROM processed_content WHERE embedding_status = 'complete'`),
            // Count active sessions
            pool.query(`SELECT COUNT(*) as active_sessions FROM upload_sessions WHERE status = 'processing'`),
            // Count recent documents (last 7 days)
            pool.query(`SELECT COUNT(DISTINCT url) as recent_count FROM processed_content WHERE created_time >= NOW() - INTERVAL '7 days'`),
            // Get PostgreSQL database size
            pool.query(`SELECT 
                pg_database_size(current_database()) as size_bytes,
                pg_size_pretty(pg_database_size(current_database())) as size_pretty
            `)
        ]);
        
        return {
            total_urls: parseInt(docStats.rows[0].document_count) || 0,
            total_chunks: parseInt(chunkStats.rows[0].chunk_count) || 0,
            embedded_count: parseInt(embeddedStats.rows[0].embedded_count) || 0,
            contextual_count: parseInt(contextualStats.rows[0].contextual_count) || 0,
            recent_count: parseInt(recentStats.rows[0].recent_count) || 0,
            latest_content: new Date().toISOString(),
            active_sessions: parseInt(sessionStats.rows[0].active_sessions) || 0,
            // PostgreSQL database size metrics
            postgres_size_bytes: parseInt(dbSizeStats.rows[0].size_bytes) || 0,
            postgres_size_pretty: dbSizeStats.rows[0].size_pretty || 'Unknown'
        };
    } catch (error) {
        console.error('❌ Error getting database stats:', error.message);
        return {
            total_urls: 0,
            total_chunks: 0,
            embedded_count: 0,
            recent_count: 0,
            contextual_count: 0,
            latest_content: null,
            active_sessions: 0,
            postgres_size_bytes: 0,
            postgres_size_pretty: 'Unknown'
        };
    }
}

/**
 * Get all documents with chunk counts and processing status
 */
async function getAllDocuments(limit = 100, offset = 0) {
    try {
        const query = `
            SELECT 
                url,
                document_title,
                document_summary,
                total_chunks,
                completed_chunks,
                embedded_chunks,
                latest_chunk_time,
                latest_processed_time,
                document_status,
                category,
                content_type,
                overall_sentiment
            FROM document_summaries
            ORDER BY latest_chunk_time DESC
            LIMIT $1 OFFSET $2
        `;
        
        const result = await pool.query(query, [limit, offset]);
        console.log(`✅ Fetched ${result.rows.length} documents from PostgreSQL`);
        
        return result.rows.map(row => ({
            url: row.url,
            title: row.document_title,
            summary: row.document_summary,
            totalChunks: row.total_chunks,
            completedChunks: row.completed_chunks,
            embeddedChunks: row.embedded_chunks,
            latestChunkTime: row.latest_chunk_time,
            latestProcessedTime: row.latest_processed_time,
            status: row.document_status,
            category: row.category,
            contentType: row.content_type,
            sentiment: row.overall_sentiment,
            progressPercent: row.total_chunks > 0 ? Math.round((row.completed_chunks / row.total_chunks) * 100) : 0
        }));
    } catch (error) {
        console.error('❌ Error fetching documents:', error.message);
        return [];
    }
}

/**
 * Get all chunks for a specific document with pagination
 */
async function getDocumentChunks(url, page = 1, limit = 10) {
    try {
        const offset = (page - 1) * limit;
        
        const query = `
            SELECT 
                id,
                chunk_id,
                chunk_index,
                title,
                summary,
                chunk_text,
                sentiment,
                emotions,
                category,
                content_type,
                technical_level,
                main_topics,
                key_concepts,
                tags,
                key_entities,
                embedding_status,
                processing_status,
                created_time,
                processed_date,
                contextual_summary,
                uses_contextual_embedding
            FROM processed_content
            WHERE url = $1 AND record_type = 'chunk'
            ORDER BY chunk_index ASC
            LIMIT $2 OFFSET $3
        `;
        
        // Also get total count for pagination
        const countQuery = `SELECT COUNT(*) as total FROM processed_content WHERE url = $1`;
        
        const [chunksResult, countResult] = await Promise.all([
            pool.query(query, [url, limit, offset]),
            pool.query(countQuery, [url])
        ]);
        
        const totalChunks = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalChunks / limit);
        
        console.log(`✅ Fetched ${chunksResult.rows.length} chunks for document (page ${page}/${totalPages})`);
        
        return {
            chunks: chunksResult.rows.map(row => ({
                id: row.id,
                chunkId: row.chunk_id,
                chunkIndex: row.chunk_index,
                title: row.title,
                summary: row.summary,
                chunkText: row.chunk_text,
                sentiment: row.sentiment,
                emotions: row.emotions,
                category: row.category,
                contentType: row.content_type,
                technicalLevel: row.technical_level,
                mainTopics: row.main_topics,
                keyConcepts: row.key_concepts,
                tags: row.tags,
                keyEntities: row.key_entities,
                embeddingStatus: row.embedding_status,
                processingStatus: row.processing_status,
                createdTime: row.created_time,
                processedDate: row.processed_date,
                contextualSummary: row.contextual_summary,
                usesContextualEmbedding: row.uses_contextual_embedding
            })),
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalChunks: totalChunks,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            }
        };
    } catch (error) {
        console.error('❌ Error fetching document chunks:', error.message);
        return {
            chunks: [],
            pagination: {
                currentPage: 1,
                totalPages: 0,
                totalChunks: 0,
                hasNextPage: false,
                hasPreviousPage: false
            }
        };
    }
}

/**
 * Search content grouped by document
 */
async function searchContentGrouped(searchQuery, limit = 50) {
    try {
        console.log(`🔍 Searching for: "${searchQuery}" (grouped by document)`);
        
        const query = `
            WITH search_results AS (
                SELECT 
                    id,
                    url,
                    title,
                    summary,
                    chunk_text,
                    chunk_id,
                    chunk_index,
                    sentiment,
                    emotions,
                    category,
                    content_type,
                    technical_level,
                    main_topics,
                    key_concepts,
                    tags,
                    key_entities,
                    embedding_status,
                    processing_status,
                    created_time,
                    processed_date,
                    contextual_summary,
                    uses_contextual_embedding,
                    CASE 
                        WHEN title ILIKE $1 THEN 1
                        WHEN summary ILIKE $1 THEN 2
                        WHEN tags ILIKE $1 THEN 3
                        WHEN category ILIKE $1 THEN 4
                        WHEN key_entities::text ILIKE $1 THEN 5
                        WHEN chunk_text ILIKE $1 THEN 6
                        ELSE 7
                    END as match_priority
                FROM processed_content
                WHERE 
                    title ILIKE $1 OR
                    summary ILIKE $1 OR
                    chunk_text ILIKE $1 OR
                    tags ILIKE $1 OR
                    category ILIKE $1 OR
                    key_entities::text ILIKE $1 OR
                    main_topics::text ILIKE $1 OR
                    key_concepts ILIKE $1 OR
                    (key_entities->>'people')::text ILIKE $1 OR
                    (key_entities->>'organizations')::text ILIKE $1 OR
                    (key_entities->>'locations')::text ILIKE $1
                ORDER BY match_priority, created_time DESC
                LIMIT $2
            ),
            document_stats AS (
                SELECT 
                    url,
                    MAX(title) as document_title,
                    MAX(summary) as document_summary,
                    COUNT(*) as total_matching_chunks
                FROM search_results
                GROUP BY url
            )
            SELECT 
                sr.*,
                ds.document_title,
                ds.document_summary,
                ds.total_matching_chunks,
                doc_sum.total_chunks,
                doc_sum.document_status
            FROM search_results sr
            JOIN document_stats ds ON sr.url = ds.url
            JOIN document_summaries doc_sum ON sr.url = doc_sum.url
            ORDER BY ds.total_matching_chunks DESC, sr.match_priority, sr.created_time DESC
        `;
        
        const searchPattern = `%${searchQuery}%`;
        const result = await pool.query(query, [searchPattern, limit]);
        
        // Group results by document
        const groupedResults = {};
        result.rows.forEach(row => {
            if (!groupedResults[row.url]) {
                groupedResults[row.url] = {
                    url: row.url,
                    documentTitle: row.document_title,
                    documentSummary: row.document_summary,
                    totalChunks: row.total_chunks,
                    matchingChunks: row.total_matching_chunks,
                    status: row.document_status,
                    chunks: []
                };
            }
            
            groupedResults[row.url].chunks.push({
                id: row.id,
                chunkId: row.chunk_id,
                chunkIndex: row.chunk_index,
                title: row.title,
                summary: row.summary,
                chunkText: row.chunk_text,
                sentiment: row.sentiment,
                emotions: row.emotions,
                category: row.category,
                contentType: row.content_type,
                technicalLevel: row.technical_level,
                mainTopics: row.main_topics,
                keyConcepts: row.key_concepts,
                tags: row.tags,
                keyEntities: row.key_entities,
                embeddingStatus: row.embedding_status,
                processingStatus: row.processing_status,
                createdTime: row.created_time,
                processedDate: row.processed_date
            });
        });
        
        const groupedArray = Object.values(groupedResults);
        console.log(`✅ Found ${result.rows.length} chunks across ${groupedArray.length} documents`);
        
        return groupedArray;
    } catch (error) {
        console.error('❌ Error searching content (grouped):', error.message);
        return [];
    }
}

/**
 * Get document summary by URL
 */
async function getDocumentSummary(url) {
    try {
        const query = `
            SELECT * FROM document_summaries WHERE url = $1
        `;
        
        const result = await pool.query(query, [url]);
        
        if (result.rows.length > 0) {
            const row = result.rows[0];
            return {
                url: row.url,
                title: row.document_title,
                summary: row.document_summary,
                totalChunks: row.total_chunks,
                completedChunks: row.completed_chunks,
                embeddedChunks: row.embedded_chunks,
                latestChunkTime: row.latest_chunk_time,
                latestProcessedTime: row.latest_processed_time,
                status: row.document_status,
                category: row.category,
                contentType: row.content_type,
                sentiment: row.overall_sentiment,
                progressPercent: row.total_chunks > 0 ? Math.round((row.completed_chunks / row.total_chunks) * 100) : 0
            };
        }
        
        return null;
    } catch (error) {
        console.error('❌ Error fetching document summary:', error.message);
        return null;
    }
}

// Export functions
/**
 * Get all chunks
 */
async function getAllChunks(limit = 100, offset = 0) {
    try {
        const query = `
            SELECT 
                id,
                chunk_id,
                chunk_index,
                url,
                title,
                summary,
                chunk_text,
                sentiment,
                emotions,
                category,
                content_type,
                technical_level,
                main_topics,
                key_concepts,
                tags,
                key_entities,
                embedding_status,
                processing_status,
                created_time,
                processed_date
            FROM processed_content
            ORDER BY created_time DESC
            LIMIT $1 OFFSET $2
        `;
        
        const result = await pool.query(query, [limit, offset]);
        console.log(`✅ Fetched ${result.rows.length} chunks from PostgreSQL`);
        
        return result.rows.map(row => ({
            id: row.id,
            chunkId: row.chunk_id,
            chunkIndex: row.chunk_index,
            url: row.url,
            title: row.title,
            summary: row.summary,
            chunkText: row.chunk_text,
            sentiment: row.sentiment,
            emotions: row.emotions || [],
            category: row.category,
            contentType: row.content_type,
            technicalLevel: row.technical_level,
            mainTopics: row.main_topics || [],
            keyConcepts: row.key_concepts || [],
            tags: row.tags,
            keyEntities: row.key_entities || {},
            embeddingStatus: row.embedding_status,
            processingStatus: row.processing_status,
            createdTime: row.created_time,
            processedDate: row.processed_date
        }));
    } catch (error) {
        console.error('❌ Error fetching all chunks:', error.message);
        return [];
    }
}

/**
 * Create a new document record (not a chunk)
 */
async function createDocumentRecord(documentData) {
    const query = `
        INSERT INTO processed_content (
            url, title, summary, chunk_text, chunk_id,
            sentiment, emotions, category, content_type, technical_level,
            main_topics, tags, key_entities, embedding_status,
            processing_status, created_time, processed_date, 
            upload_source, record_type
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        )
        RETURNING *
    `;
    
    const { v4: uuidv4 } = require('uuid');
    const values = [
        documentData.url,
        documentData.title,
        documentData.summary,
        documentData.full_content || documentData.chunk_text, // Full document content
        'doc_' + (documentData.chunk_id || uuidv4()), // Unique document ID
        documentData.sentiment || 'Neutral',
        documentData.emotions || [],
        documentData.category,
        documentData.content_type || 'article',
        documentData.technical_level || 'intermediate',
        documentData.main_topics || [],
        documentData.tags || '',
        documentData.key_entities || {},
        'pending',
        'processing',
        new Date(),
        new Date(),
        documentData.upload_source || 'user',
        'document' // This is a document, not a chunk
    ];
    
    try {
        const result = await pool.query(query, values);
        console.log('📄 Document record created:', result.rows[0].id);
        return result.rows[0];
    } catch (error) {
        console.error('❌ Error creating document record:', error.message);
        throw error;
    }
}

/**
 * Get all documents (not chunks)
 */
async function getDocumentsOnly(limit = 100, offset = 0) {
    const query = `
        SELECT 
            id, url, title, summary, chunk_text, chunk_id, chunk_index,
            sentiment, emotions, category, content_type, technical_level,
            main_topics, key_concepts, tags, key_entities, embedding_status,
            processing_status, created_time, processed_date, updated_at,
            source, airtable_record_id, airtable_id, sent_to_li, vector_id,
            sessions_link, contextual_summary, uses_contextual_embedding,
            upload_source, record_type, parent_document_id
        FROM processed_content 
        WHERE record_type IN ('document', 'chunk')
        ORDER BY updated_at DESC
        LIMIT $1 OFFSET $2
    `;
    
    try {
        const result = await pool.query(query, [limit, offset]);
        return result.rows;
    } catch (error) {
        console.error('Error fetching documents:', error);
        throw error;
    }
}

/**
 * Get chunks for a specific document
 */
async function getChunksByDocumentId(documentId) {
    const query = `
        SELECT * FROM processed_content 
        WHERE parent_document_id = $1 AND record_type = 'chunk'
        ORDER BY chunk_index ASC
    `;
    
    try {
        const result = await pool.query(query, [documentId]);
        return result.rows;
    } catch (error) {
        console.error('Error fetching chunks for document:', error);
        throw error;
    }
}

/**
 * Link existing chunks to a document
 */
async function linkChunksToDocument(documentId, chunkIds) {
    const query = `
        UPDATE processed_content 
        SET parent_document_id = $1 
        WHERE chunk_id = ANY($2::text[]) AND record_type = 'chunk'
        RETURNING *
    `;
    
    try {
        const result = await pool.query(query, [documentId, chunkIds]);
        console.log(`🔗 Linked ${result.rowCount} chunks to document ${documentId}`);
        return result.rows;
    } catch (error) {
        console.error('Error linking chunks to document:', error);
        throw error;
    }
}

/**
 * Settings management functions for API configuration
 */

/**
 * Get all API settings
 */
async function getApiSettings() {
    try {
        const query = 'SELECT setting_key, setting_value, encrypted FROM api_settings ORDER BY setting_key';
        const result = await pool.query(query);
        
        const settings = {};
        result.rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        
        console.log(`✅ Retrieved ${result.rows.length} API settings from database`);
        return settings;
    } catch (error) {
        console.error('❌ Error fetching API settings:', error.message);
        return {};
    }
}

/**
 * Get a specific API setting
 */
async function getApiSetting(key) {
    try {
        const query = 'SELECT setting_value FROM api_settings WHERE setting_key = $1';
        const result = await pool.query(query, [key]);
        
        if (result.rows.length > 0) {
            return result.rows[0].setting_value;
        }
        return null;
    } catch (error) {
        console.error(`❌ Error fetching API setting ${key}:`, error.message);
        return null;
    }
}

/**
 * Get RAG configuration settings with defaults
 */
async function getRagSettings() {
    try {
        const settings = await getApiSettings();
        
        // Return RAG settings with defaults
        return {
            ragModel: settings.ragModel || 'gpt-4o-mini',
            ragMaxTokens: parseInt(settings.ragMaxTokens) || 1000,
            ragTemperature: parseFloat(settings.ragTemperature) || 0.7,
            searchLimit: parseInt(settings.searchLimit) || 5
        };
    } catch (error) {
        console.error('❌ Error fetching RAG settings:', error.message);
        // Return defaults if error
        return {
            ragModel: 'gpt-4o-mini',
            ragMaxTokens: 1000,
            ragTemperature: 0.7,
            searchLimit: 5
        };
    }
}

/**
 * Update RAG configuration settings
 */
async function updateRagSettings(settings) {
    try {
        const validModels = ['gpt-4o-mini', 'gpt-4o', 'gpt-4', 'gpt-3.5-turbo'];
        const updates = [];
        
        // Validate and set RAG model
        if (settings.ragModel && validModels.includes(settings.ragModel)) {
            await setApiSetting('ragModel', settings.ragModel);
            updates.push('ragModel');
        }
        
        // Validate and set max tokens (100-4000)
        if (settings.ragMaxTokens && settings.ragMaxTokens >= 100 && settings.ragMaxTokens <= 4000) {
            await setApiSetting('ragMaxTokens', settings.ragMaxTokens.toString());
            updates.push('ragMaxTokens');
        }
        
        // Validate and set temperature (0.0-1.0)
        if (settings.ragTemperature !== undefined && settings.ragTemperature >= 0.0 && settings.ragTemperature <= 1.0) {
            await setApiSetting('ragTemperature', settings.ragTemperature.toString());
            updates.push('ragTemperature');
        }
        
        // Validate and set search limit (1-20)
        if (settings.searchLimit && settings.searchLimit >= 1 && settings.searchLimit <= 20) {
            await setApiSetting('searchLimit', settings.searchLimit.toString());
            updates.push('searchLimit');
        }
        
        console.log(`✅ Updated RAG settings: ${updates.join(', ')}`);
        return { success: true, updated: updates };
        
    } catch (error) {
        console.error('❌ Error updating RAG settings:', error.message);
        throw error;
    }
}

/**
 * Set/update an API setting and sync to environment variable
 */
async function setApiSetting(key, value, encrypted = false) {
    try {
        const query = `
            INSERT INTO api_settings (setting_key, setting_value, encrypted) 
            VALUES ($1, $2, $3)
            ON CONFLICT (setting_key) 
            DO UPDATE SET 
                setting_value = EXCLUDED.setting_value,
                encrypted = EXCLUDED.encrypted,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;
        
        const result = await pool.query(query, [key, value, encrypted]);
        
        // Sync critical settings to environment variables for runtime access
        syncSettingToEnvironment(key, value);
        
        console.log(`✅ Updated API setting: ${key} (synced to environment)`);
        return result.rows[0];
    } catch (error) {
        console.error(`❌ Error setting API setting ${key}:`, error.message);
        throw error;
    }
}

/**
 * Sync database settings to environment variables for runtime access
 */
function syncSettingToEnvironment(key, value) {
    const envMapping = {
        'openai_api_key': 'OPENAI_API_KEY',
        'claude_api_key': 'CLAUDE_API_KEY', 
        'qdrant_url': 'QDRANT_URL',
        'qdrant_api_key': 'QDRANT_API_KEY',
        'database_url': 'DATABASE_URL'
    };
    
    const envVarName = envMapping[key];
    if (envVarName && value && value.trim() !== '') {
        process.env[envVarName] = value;
        console.log(`🔄 Synced ${key} to environment variable ${envVarName}`);
    }
}

/**
 * Sync all database settings to environment variables
 */
async function syncAllSettingsToEnvironment() {
    try {
        const settings = await getApiSettings();
        console.log('🔄 Syncing all database settings to environment variables...');
        
        Object.entries(settings).forEach(([key, value]) => {
            syncSettingToEnvironment(key, value);
        });
        
        console.log('✅ All database settings synced to environment');
        return true;
    } catch (error) {
        console.error('❌ Failed to sync settings to environment:', error);
        return false;
    }
}

/**
 * Update multiple API settings at once
 */
async function updateApiSettings(settings) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const results = [];
        for (const [key, value] of Object.entries(settings)) {
            // Determine if this should be encrypted based on the key name
            const encrypted = key.toLowerCase().includes('key') || key.toLowerCase().includes('token');
            
            const query = `
                INSERT INTO api_settings (setting_key, setting_value, encrypted) 
                VALUES ($1, $2, $3)
                ON CONFLICT (setting_key) 
                DO UPDATE SET 
                    setting_value = EXCLUDED.setting_value,
                    encrypted = EXCLUDED.encrypted,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `;
            
            const result = await client.query(query, [key, value, encrypted]);
            results.push(result.rows[0]);
        }
        
        await client.query('COMMIT');
        console.log(`✅ Updated ${results.length} API settings in batch`);
        return results;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error updating API settings batch:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    testConnection,
    initializeDatabase,
    getRecentContent,
    getHistoricalContent,
    getSmartContentMix,
    getActiveUploadSessions,
    addContentRecord,
    createUploadSession,
    updateUploadSession,
    getRecordById,
    searchContent,
    searchContentByTag,
    getDatabaseStats,
    // New chunk explorer functions
    getAllDocuments,
    getDocumentChunks,
    searchContentGrouped,
    getDocumentSummary,
    getAllChunks,
    // Document/Chunk distinction functions
    createDocumentRecord,
    getDocumentsOnly,
    getChunksByDocumentId,
    linkChunksToDocument,
    // Settings management functions
    getApiSettings,
    getApiSetting,
    setApiSetting,
    syncAllSettingsToEnvironment,
    updateApiSettings,
    getRagSettings,
    updateRagSettings,
    // Cache management functions
    clearDocumentsCache,
    clearAllCache,
    // Connection monitoring functions
    checkConnectionLeaks,
    getConnectionStats
};