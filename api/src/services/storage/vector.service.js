/**
 * Vector Service
 * Handles Qdrant vector database operations for embeddings storage and retrieval
 */

const axios = require('axios');
const { logPerformanceMetric, logError } = require('../../utils/logger');
const { ERROR_CODES, HEALTH_STATUS } = require('../../utils/constants');

class VectorService {
  constructor(config = {}) {
    this.config = {
      url: config.url || 'http://localhost:6333',
      apiKey: config.apiKey,
      collection: config.collection || 'autollama-content',
      timeoutMs: config.timeoutMs || 30000,
      retries: config.retries || 3,
      dimensions: config.dimensions || 1536
    };

    this.isInitialized = false;
    this.logger = require('../../utils/logger').createChildLogger({ component: 'vector-service' });

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: this.config.url,
      timeout: this.config.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'api-key': this.config.apiKey })
      }
    });

    this.logger.info('Vector service initialized', {
      url: this.config.url,
      collection: this.config.collection,
      hasApiKey: !!this.config.apiKey
    });
  }

  /**
   * Initialize collection if it doesn't exist
   * @returns {Promise<boolean>} True if collection is ready
   */
  async initializeCollection() {
    try {
      // Check if collection exists
      const exists = await this.collectionExists();
      
      if (!exists) {
        await this.createCollection();
        this.logger.info('Created new Qdrant collection', { collection: this.config.collection });
      } else {
        this.logger.info('Qdrant collection already exists', { collection: this.config.collection });
      }

      this.isInitialized = true;
      return true;

    } catch (error) {
      this.logger.error('Failed to initialize Qdrant collection', {
        error: error.message,
        collection: this.config.collection
      });
      throw error;
    }
  }

  /**
   * Store chunk data with embedding in Qdrant
   * @param {Object} chunkData - Chunk information
   * @param {Array} embedding - Embedding vector
   * @param {Object} analysis - Analysis metadata
   * @param {string} contextualSummary - Optional contextual summary
   * @returns {Promise<Object>} Storage result
   */
  async storeInQdrant(chunkData, embedding, analysis, contextualSummary = null) {
    const startTime = Date.now();

    try {
      // Debug logging for contextual embeddings
      this.logger.debug('Storing in Qdrant', {
        chunkId: chunkData.chunk_id,
        hasContextualSummary: !!contextualSummary,
        usesContextualEmbedding: contextualSummary !== null,
        embeddingDimensions: embedding.length
      });

      if (contextualSummary) {
        this.logger.debug('Contextual summary preview', {
          chunkId: chunkData.chunk_id,
          contextPreview: contextualSummary.substring(0, 100) + '...'
        });
      }

      // Prepare point data for Qdrant
      const pointData = {
        id: this._generatePointId(chunkData.chunk_id),
        vector: embedding,
        payload: {
          // Core identifiers
          chunk_id: chunkData.chunk_id,
          url: chunkData.original_url,
          chunk_index: chunkData.chunk_index,
          
          // Content
          chunk_text: chunkData.chunk_text,
          title: analysis.title,
          summary: analysis.summary,
          
          // Analysis metadata
          category: analysis.category,
          content_type: analysis.content_type,
          technical_level: analysis.technical_level,
          sentiment: analysis.sentiment,
          emotions: analysis.emotions,
          
          // Structured data
          tags: analysis.tags,
          key_concepts: analysis.key_concepts,
          main_topics: analysis.main_topics,
          key_entities: analysis.key_entities,
          
          // Contextual embedding metadata
          contextual_summary: contextualSummary,
          uses_contextual_embedding: contextualSummary !== null,
          
          // Processing metadata
          created_at: new Date().toISOString(),
          chunk_size_used: chunkData.chunk_size_used || null,
          overlap_used: chunkData.overlap_used || null,
          total_chunks: chunkData.total_chunks || null
        }
      };

      // Store point in Qdrant
      const response = await this._upsertPoints([pointData]);
      
      const duration = Date.now() - startTime;
      
      logPerformanceMetric('qdrant_store', duration, 'ms', {
        chunkId: chunkData.chunk_id,
        hasContext: !!contextualSummary,
        embeddingDimensions: embedding.length,
        success: response.status === 'ok'
      });

      this.logger.debug('Successfully stored in Qdrant', {
        chunkId: chunkData.chunk_id,
        duration,
        operationId: response.result?.operation_id,
        hasContext: !!contextualSummary
      });

      return {
        success: true,
        chunkId: chunkData.chunk_id,
        operationId: response.result?.operation_id,
        duration,
        usesContextualEmbedding: !!contextualSummary
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'qdrant_store',
        chunkId: chunkData.chunk_id,
        duration,
        collection: this.config.collection
      });

      throw new Error(`Qdrant storage failed: ${error.message}`);
    }
  }

  /**
   * Search for similar content using vector similarity
   * @param {Array} queryEmbedding - Query embedding vector
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  async searchSimilar(queryEmbedding, options = {}) {
    const startTime = Date.now();

    try {
      const {
        limit = 10,
        scoreThreshold = 0.7,
        filter = null,
        withPayload = true,
        withVector = false
      } = options;

      const searchParams = {
        vector: queryEmbedding,
        limit,
        score_threshold: scoreThreshold,
        with_payload: withPayload,
        with_vector: withVector
      };

      if (filter) {
        searchParams.filter = filter;
      }

      const response = await this.httpClient.post(
        `/collections/${this.config.collection}/points/search`,
        searchParams
      );

      const duration = Date.now() - startTime;
      const results = response.data.result || [];

      logPerformanceMetric('qdrant_search', duration, 'ms', {
        queryDimensions: queryEmbedding.length,
        limit,
        resultsCount: results.length,
        scoreThreshold
      });

      this.logger.debug('Vector search completed', {
        duration,
        resultsCount: results.length,
        avgScore: results.length > 0 
          ? Math.round((results.reduce((sum, r) => sum + r.score, 0) / results.length) * 1000) / 1000
          : 0
      });

      return results.map(result => ({
        id: result.id,
        score: result.score,
        payload: result.payload,
        vector: result.vector
      }));

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'qdrant_search',
        duration,
        collection: this.config.collection,
        queryDimensions: queryEmbedding.length
      });

      throw new Error(`Qdrant search failed: ${error.message}`);
    }
  }

  /**
   * Get point by ID
   * @param {string} pointId - Point ID to retrieve
   * @param {Object} options - Retrieval options
   * @returns {Promise<Object|null>} Point data or null if not found
   */
  async getPoint(pointId, options = {}) {
    try {
      const { withPayload = true, withVector = false } = options;
      
      const response = await this.httpClient.get(
        `/collections/${this.config.collection}/points/${pointId}`,
        {
          params: {
            with_payload: withPayload,
            with_vector: withVector
          }
        }
      );

      return response.data.result || null;

    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      
      logError(error, {
        operation: 'qdrant_get_point',
        pointId,
        collection: this.config.collection
      });

      throw new Error(`Failed to get point: ${error.message}`);
    }
  }

  /**
   * Delete points by IDs or filter
   * @param {Array|Object} selector - Point IDs array or filter object
   * @returns {Promise<Object>} Deletion result
   */
  async deletePoints(selector) {
    try {
      const deleteParams = Array.isArray(selector)
        ? { points: selector }
        : { filter: selector };

      const response = await this.httpClient.post(
        `/collections/${this.config.collection}/points/delete`,
        deleteParams
      );

      this.logger.info('Points deleted from Qdrant', {
        collection: this.config.collection,
        selector: Array.isArray(selector) ? `${selector.length} point IDs` : 'filter',
        operationId: response.data.result?.operation_id
      });

      return response.data.result;

    } catch (error) {
      logError(error, {
        operation: 'qdrant_delete_points',
        collection: this.config.collection,
        selectorType: Array.isArray(selector) ? 'ids' : 'filter'
      });

      throw new Error(`Failed to delete points: ${error.message}`);
    }
  }

  /**
   * Get collection information
   * @returns {Promise<Object>} Collection info
   */
  async getCollectionInfo() {
    try {
      const response = await this.httpClient.get(`/collections/${this.config.collection}`);
      return response.data.result;
    } catch (error) {
      throw new Error(`Failed to get collection info: ${error.message}`);
    }
  }

  /**
   * Check if collection exists
   * @returns {Promise<boolean>} True if collection exists
   */
  async collectionExists() {
    try {
      await this.getCollectionInfo();
      return true;
    } catch (error) {
      if (error.message.includes('Not found') || error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Create collection with proper configuration
   * @returns {Promise<Object>} Creation result
   */
  async createCollection() {
    try {
      const collectionConfig = {
        vectors: {
          size: this.config.dimensions,
          distance: 'Cosine'
        },
        optimizers_config: {
          default_segment_number: 2
        },
        replication_factor: 1
      };

      const response = await this.httpClient.put(
        `/collections/${this.config.collection}`,
        collectionConfig
      );

      this.logger.info('Created Qdrant collection', {
        collection: this.config.collection,
        dimensions: this.config.dimensions,
        operationId: response.data.result?.operation_id
      });

      return response.data.result;

    } catch (error) {
      logError(error, {
        operation: 'create_collection',
        collection: this.config.collection,
        dimensions: this.config.dimensions
      });

      throw new Error(`Failed to create collection: ${error.message}`);
    }
  }

  /**
   * Test Qdrant connectivity and health
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      // Test basic connectivity
      const healthResponse = await this.httpClient.get('/health');
      const connectivityOk = healthResponse.status === 200;

      // Test collection access if initialized
      let collectionOk = false;
      let collectionInfo = null;
      
      if (this.isInitialized) {
        try {
          collectionInfo = await this.getCollectionInfo();
          collectionOk = true;
        } catch (error) {
          this.logger.warn('Collection health check failed', {
            collection: this.config.collection,
            error: error.message
          });
        }
      }

      const duration = Date.now() - startTime;
      const overallStatus = connectivityOk && (this.isInitialized ? collectionOk : true)
        ? HEALTH_STATUS.HEALTHY 
        : HEALTH_STATUS.UNHEALTHY;

      return {
        status: overallStatus,
        connectivity: connectivityOk,
        collection: {
          initialized: this.isInitialized,
          accessible: collectionOk,
          name: this.config.collection,
          info: collectionInfo
        },
        responseTime: duration,
        url: this.config.url
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'qdrant_health_check',
        duration,
        url: this.config.url
      });

      return {
        status: HEALTH_STATUS.UNHEALTHY,
        connectivity: false,
        error: error.message,
        responseTime: duration,
        url: this.config.url
      };
    }
  }

  /**
   * Get Qdrant collection statistics including vector count and storage size
   * @returns {Promise<Object>} Collection statistics
   */
  async getCollectionStats() {
    try {
      // Get collection information with statistics
      const collectionInfo = await this.getCollectionInfo();
      
      // Extract relevant statistics from collection info
      const vectorCount = collectionInfo?.points_count || 0;
      const segments = collectionInfo?.segments_count || 0;
      const indexedVectors = collectionInfo?.indexed_vectors_count || 0;
      
      // Calculate approximate storage size in bytes (rough estimation)
      // Each vector is typically ~6KB (1536 dimensions * 4 bytes + metadata)
      const estimatedSizeBytes = vectorCount * 6144; // 6KB per vector
      const estimatedSizeMB = (estimatedSizeBytes / (1024 * 1024)).toFixed(1);
      
      return {
        vector_count: vectorCount,
        segments_count: segments,
        indexed_vectors_count: indexedVectors,
        estimated_size_bytes: estimatedSizeBytes,
        estimated_size_mb: `${estimatedSizeMB}MB`,
        collection_name: this.config.collection,
        status: collectionInfo?.status || 'unknown'
      };
    } catch (error) {
      this.logger.error('Failed to get Qdrant collection stats', {
        error: error.message,
        collection: this.config.collection
      });
      
      return {
        vector_count: 0,
        segments_count: 0,
        indexed_vectors_count: 0,
        estimated_size_bytes: 0,
        estimated_size_mb: 'Unknown',
        collection_name: this.config.collection,
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      config: {
        url: this.config.url,
        collection: this.config.collection,
        hasApiKey: !!this.config.apiKey,
        dimensions: this.config.dimensions,
        timeoutMs: this.config.timeoutMs,
        retries: this.config.retries
      }
    };
  }

  /**
   * Upsert multiple points in batch
   * @private
   */
  async _upsertPoints(points) {
    const response = await this.httpClient.put(
      `/collections/${this.config.collection}/points`,
      { points }
    );

    if (response.data.status !== 'ok') {
      throw new Error(`Qdrant upsert failed: ${response.data.result || 'Unknown error'}`);
    }

    return response.data;
  }

  /**
   * Generate consistent point ID from chunk ID
   * @private
   */
  _generatePointId(chunkId) {
    // Use chunk ID directly or hash it if needed
    // Qdrant supports string IDs
    return chunkId;
  }

  /**
   * Update service configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Update HTTP client if needed
    if (newConfig.url || newConfig.apiKey || newConfig.timeoutMs) {
      this.httpClient = axios.create({
        baseURL: this.config.url,
        timeout: this.config.timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'api-key': this.config.apiKey })
        }
      });
    }

    this.logger.info('Vector service configuration updated', {
      changedFields: Object.keys(newConfig),
      reinitializedClient: !!(newConfig.url || newConfig.apiKey || newConfig.timeoutMs)
    });
  }
}

module.exports = VectorService;