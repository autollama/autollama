/**
 * Database Service
 * Handles PostgreSQL database operations for content and session management
 */

const { Pool } = require('pg');
const { logDatabaseQuery, logError, logPerformanceMetric } = require('../../utils/logger');
const { PROCESSING_STATUS, EMBEDDING_STATUS, RECORD_TYPES, HEALTH_STATUS } = require('../../utils/constants');

class DatabaseService {
  constructor(config = {}) {
    console.log('🔧 DatabaseService constructor received config:', JSON.stringify(config, null, 2));
    this.config = {
      connectionString: config.url || config.connectionString,
      max: config.maxConnections || 20,
      min: config.minConnections || 5,
      idleTimeoutMillis: config.idleTimeoutMs || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMs || 5000,
      acquireTimeoutMillis: config.acquireTimeoutMs || 10000
    };
    console.log('🔧 DatabaseService final config:', JSON.stringify(this.config, null, 2));

    this.pool = null;
    this.isInitialized = false;
    this.logger = require('../../utils/logger').createChildLogger({ component: 'database-service' });

    // Initialize pool
    this.initializePool();
  }

  /**
   * Initialize database connection pool
   */
  initializePool() {
    try {
      this.pool = new Pool({
        connectionString: this.config.connectionString,
        max: this.config.max,
        min: this.config.min,
        idleTimeoutMillis: this.config.idleTimeoutMillis,
        connectionTimeoutMillis: this.config.connectionTimeoutMs,
        acquireTimeoutMillis: this.config.acquireTimeoutMs,
        createTimeoutMillis: 3000,
        destroyTimeoutMillis: 5000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 200
      });

      // Set up event handlers
      this.pool.on('error', (err, client) => {
        this.logger.error('PostgreSQL pool error', {
          error: err.message,
          client: client ? 'connected' : 'disconnected'
        });
      });

      this.pool.on('connect', (client) => {
        this.logger.debug('New PostgreSQL client connected');
      });

      this.pool.on('remove', (client) => {
        this.logger.debug('PostgreSQL client removed from pool');
      });

      this.isInitialized = true;
      this.logger.info('Database service initialized', {
        maxConnections: this.config.max,
        minConnections: this.config.min
      });

    } catch (error) {
      this.logger.error('Failed to initialize database pool', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Test database connection
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    const startTime = Date.now();

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query('SELECT NOW() as current_time, version() as version');
        const duration = Date.now() - startTime;

        logPerformanceMetric('db_connection_test', duration, 'ms');

        this.logger.info('Database connection test successful', {
          duration,
          currentTime: result.rows[0].current_time,
          version: result.rows[0].version.split(' ')[0]
        });

        return {
          success: true,
          duration,
          currentTime: result.rows[0].current_time,
          version: result.rows[0].version.split(' ')[0]
        };

      } finally {
        client.release();
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'database_connection_test',
        duration
      });

      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Create a document record
   * @param {Object} documentData - Document information
   * @returns {Promise<Object>} Created document record
   */
  async createDocumentRecord(documentData) {
    const startTime = Date.now();

    try {
      const {
        url,
        title,
        summary,
        full_content = null,
        upload_source = 'user',
        metadata = {}
      } = documentData;

      const query = `
        INSERT INTO processed_content (
          url, title, summary, chunk_text, chunk_id, chunk_index,
          upload_source, record_type, created_time, processed_date, updated_at,
          processing_status, embedding_status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW(), $9, $10
        ) RETURNING *
      `;

      const values = [
        url,
        title,
        summary,
        full_content, // Store as chunk_text for document records
        `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Generate document ID
        -1, // Use -1 to indicate this is a document record, not a chunk
        upload_source,
        RECORD_TYPES.DOCUMENT,
        PROCESSING_STATUS.COMPLETED,
        EMBEDDING_STATUS.SKIPPED // Documents don't get embedded directly
      ];

      const result = await this.pool.query(query, values);
      const duration = Date.now() - startTime;

      logDatabaseQuery(query, values, duration);
      logPerformanceMetric('create_document_record', duration, 'ms');

      this.logger.info('Created document record', {
        documentId: result.rows[0].id,
        title,
        url,
        duration
      });

      return result.rows[0];

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'create_document_record',
        duration,
        url: documentData.url
      });

      throw new Error(`Failed to create document record: ${error.message}`);
    }
  }

  /**
   * Store chunk record with analysis data
   * @param {Object} chunkData - Chunk information
   * @param {Object} analysis - Analysis results
   * @param {string} contextualSummary - Optional contextual summary
   * @param {number} documentId - Parent document ID
   * @returns {Promise<Object>} Created chunk record
   */
  async storeChunkRecord(chunkData, analysis, contextualSummary = null, documentId = null, enhancedMetadata = {}) {
    const startTime = Date.now();

    try {
      const query = `
        INSERT INTO processed_content (
          url, title, summary, chunk_text, chunk_id, chunk_index,
          sentiment, emotions, category, content_type, technical_level,
          main_topics, key_concepts, tags, key_entities,
          contextual_summary, uses_contextual_embedding,
          upload_source, record_type, parent_document_id,
          processing_status, embedding_status,
          document_type, chunking_method, boundaries_respected,
          semantic_boundary_type, structural_context, document_position,
          section_title, section_level, context_generation_method,
          context_generation_time, context_cache_hit,
          created_time, processed_date, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
          $29, $30, $31, $32, $33, NOW(), NOW(), NOW()
        ) RETURNING *
      `;

      const values = [
        chunkData.original_url,
        analysis.title,
        analysis.summary,
        chunkData.chunk_text,
        chunkData.chunk_id,
        chunkData.chunk_index,
        analysis.sentiment,
        analysis.emotions,
        analysis.category,
        analysis.content_type,
        analysis.technical_level,
        analysis.main_topics,
        analysis.key_concepts,
        analysis.tags,
        JSON.stringify(analysis.key_entities),
        contextualSummary,
        contextualSummary !== null,
        'user',
        RECORD_TYPES.CHUNK,
        documentId,
        PROCESSING_STATUS.COMPLETED,
        EMBEDDING_STATUS.COMPLETED,
        // Enhanced metadata fields
        enhancedMetadata.document_type || null,
        enhancedMetadata.chunking_method || null,
        enhancedMetadata.boundaries_respected || null,
        enhancedMetadata.semantic_boundary_type || null,
        enhancedMetadata.structural_context || null,
        enhancedMetadata.document_position || null,
        enhancedMetadata.section_title || null,
        enhancedMetadata.section_level || null,
        enhancedMetadata.context_generation_method || null,
        enhancedMetadata.context_generation_time || null,
        enhancedMetadata.context_cache_hit || false
      ];

      const result = await this.pool.query(query, values);
      const duration = Date.now() - startTime;

      logDatabaseQuery(query, values, duration);
      logPerformanceMetric('store_chunk_record', duration, 'ms', {
        chunkId: chunkData.chunk_id,
        hasContext: !!contextualSummary
      });

      this.logger.debug('Stored chunk record', {
        chunkId: chunkData.chunk_id,
        chunkIndex: chunkData.chunk_index,
        hasContext: !!contextualSummary,
        duration
      });

      return result.rows[0];

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'store_chunk_record',
        duration,
        chunkId: chunkData.chunk_id
      });

      throw new Error(`Failed to store chunk record: ${error.message}`);
    }
  }

  /**
   * Get documents with pagination
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Documents and pagination info
   */
  async getDocuments(options = {}) {
    const startTime = Date.now();

    try {
      const {
        limit = 50,
        offset = 0,
        sortBy = 'created_time',
        sortOrder = 'DESC',
        search = null,
        recordType = null
      } = options;

      let whereClause = 'WHERE 1=1';
      const values = [];

      if (search) {
        whereClause += ` AND (title ILIKE $${values.length + 1} OR summary ILIKE $${values.length + 1})`;
        values.push(`%${search}%`);
      }

      if (recordType) {
        whereClause += ` AND record_type = $${values.length + 1}`;
        values.push(recordType);
      }

      const query = `
        SELECT 
          id, url, title, summary, created_time, processed_date,
          upload_source, record_type, processing_status, embedding_status,
          uses_contextual_embedding, parent_document_id,
          (SELECT COUNT(*) FROM processed_content pc2 
           WHERE pc2.parent_document_id = processed_content.id 
           AND pc2.record_type = 'chunk') as chunk_count
        FROM processed_content
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `;

      values.push(limit, offset);

      const result = await this.pool.query(query, values);
      const duration = Date.now() - startTime;

      logDatabaseQuery(query, values, duration);

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM processed_content ${whereClause}`;
      const countResult = await this.pool.query(countQuery, values.slice(0, -2));
      const totalCount = parseInt(countResult.rows[0].count);

      return {
        documents: result.rows,
        pagination: {
          total: totalCount,
          limit,
          offset,
          pages: Math.ceil(totalCount / limit),
          currentPage: Math.floor(offset / limit) + 1
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'get_documents',
        duration,
        options
      });

      throw new Error(`Failed to get documents: ${error.message}`);
    }
  }

  /**
   * Get chunks for a specific document
   * @param {number} documentId - Document ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Document chunks
   */
  async getDocumentChunks(documentId, options = {}) {
    const startTime = Date.now();

    try {
      const {
        limit = 100,
        offset = 0,
        includeContextual = true
      } = options;

      let selectFields = `
        id, chunk_id, chunk_index, chunk_text, title, summary,
        sentiment, emotions, category, content_type, technical_level,
        main_topics, key_concepts, tags, key_entities,
        processing_status, embedding_status, uses_contextual_embedding,
        created_time, processed_date
      `;

      if (includeContextual) {
        selectFields += ', contextual_summary';
      }

      const query = `
        SELECT ${selectFields}
        FROM processed_content
        WHERE parent_document_id = $1 AND record_type = 'chunk'
        ORDER BY chunk_index ASC
        LIMIT $2 OFFSET $3
      `;

      const values = [documentId, limit, offset];
      const result = await this.pool.query(query, values);
      const duration = Date.now() - startTime;

      logDatabaseQuery(query, values, duration);

      this.logger.debug('Retrieved document chunks', {
        documentId,
        chunkCount: result.rows.length,
        duration
      });

      return result.rows;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'get_document_chunks',
        duration,
        documentId
      });

      throw new Error(`Failed to get document chunks: ${error.message}`);
    }
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>} Database statistics
   */
  async getDatabaseStats() {
    const startTime = Date.now();

    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_records,
          COUNT(*) FILTER (WHERE record_type = 'document') as document_count,
          COUNT(*) FILTER (WHERE record_type = 'chunk') as chunk_count,
          COUNT(*) FILTER (WHERE uses_contextual_embedding = true) as contextual_count,
          COUNT(*) FILTER (WHERE processing_status = 'completed') as completed_count,
          COUNT(*) FILTER (WHERE processing_status = 'failed') as failed_count,
          COUNT(*) FILTER (WHERE embedding_status = 'completed') as embedded_count
        FROM processed_content
      `;

      const connectionStatsQuery = `
        SELECT 
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `;

      const [statsResult, connectionResult] = await Promise.all([
        this.pool.query(statsQuery),
        this.pool.query(connectionStatsQuery)
      ]);

      const duration = Date.now() - startTime;

      return {
        content: statsResult.rows[0],
        connections: connectionResult.rows[0],
        pool: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount
        },
        responseTime: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'get_database_stats',
        duration
      });

      throw new Error(`Failed to get database stats: ${error.message}`);
    }
  }

  /**
   * Health check for database
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const connectionTest = await this.testConnection();
      
      if (!connectionTest.success) {
        return {
          status: HEALTH_STATUS.UNHEALTHY,
          connectivity: false,
          error: connectionTest.error,
          responseTime: connectionTest.duration
        };
      }

      const stats = await this.getDatabaseStats();
      
      // Check for any concerning metrics
      const warnings = [];
      if (stats.connections.active_connections > 15) {
        warnings.push('High number of active connections');
      }
      if (stats.pool.waiting > 0) {
        warnings.push('Connections waiting in pool');
      }

      return {
        status: warnings.length > 0 ? HEALTH_STATUS.DEGRADED : HEALTH_STATUS.HEALTHY,
        connectivity: true,
        stats,
        warnings,
        responseTime: connectionTest.duration
      };

    } catch (error) {
      logError(error, {
        operation: 'database_health_check'
      });

      return {
        status: HEALTH_STATUS.UNHEALTHY,
        connectivity: false,
        error: error.message
      };
    }
  }

  /**
   * Search content by text
   * @param {string} searchTerm - Search term
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  async searchContent(searchTerm, options = {}) {
    const startTime = Date.now();

    try {
      const {
        limit = 20,
        offset = 0,
        recordTypes = ['chunk'],
        includeContextual = false
      } = options;

      let selectFields = `
        id, chunk_id, chunk_index, url, title, summary, chunk_text,
        category, content_type, sentiment, tags, main_topics,
        uses_contextual_embedding, created_time,
        ts_rank(to_tsvector('english', title || ' ' || summary || ' ' || chunk_text), 
                plainto_tsquery('english', $1)) as rank
      `;

      if (includeContextual) {
        selectFields += ', contextual_summary';
      }

      const query = `
        SELECT ${selectFields}
        FROM processed_content
        WHERE record_type = ANY($2)
        AND (
          to_tsvector('english', title || ' ' || summary || ' ' || chunk_text) 
          @@ plainto_tsquery('english', $1)
          OR title ILIKE $3
          OR summary ILIKE $3
          OR chunk_text ILIKE $3
        )
        ORDER BY rank DESC, created_time DESC
        LIMIT $4 OFFSET $5
      `;

      const values = [
        searchTerm,
        recordTypes,
        `%${searchTerm}%`,
        limit,
        offset
      ];

      const result = await this.pool.query(query, values);
      const duration = Date.now() - startTime;

      logDatabaseQuery(query, values, duration);
      logPerformanceMetric('text_search', duration, 'ms', {
        searchTerm: searchTerm.substring(0, 50),
        resultsCount: result.rows.length
      });

      return result.rows;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'search_content',
        duration,
        searchTerm: searchTerm.substring(0, 50)
      });

      throw new Error(`Content search failed: ${error.message}`);
    }
  }

  /**
   * Execute query with transaction support
   * @param {Function} queryFunction - Function that executes queries with client
   * @returns {Promise} Query result
   */
  async runTransaction(queryFunction) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await queryFunction(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      poolStats: {
        totalCount: this.pool?.totalCount || 0,
        idleCount: this.pool?.idleCount || 0,
        waitingCount: this.pool?.waitingCount || 0
      },
      config: {
        maxConnections: this.config.max,
        minConnections: this.config.min,
        idleTimeoutMs: this.config.idleTimeoutMillis,
        connectionTimeoutMs: this.config.connectionTimeoutMillis
      }
    };
  }

  /**
   * Close database connections
   * @returns {Promise<void>}
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.logger.info('Database pool closed');
    }
  }
}

module.exports = DatabaseService;