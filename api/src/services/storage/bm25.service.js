/**
 * BM25 Service
 * Handles BM25 full-text search indexing and retrieval via external service
 */

const axios = require('axios');
const { logPerformanceMetric, logError } = require('../../utils/logger');
const { ERROR_CODES, HEALTH_STATUS } = require('../../utils/constants');

class BM25Service {
  constructor(config = {}) {
    this.config = {
      url: config.url || 'http://localhost:3002',
      timeoutMs: config.timeoutMs || 30000,
      retries: config.retries || 3,
      maxRetryDelay: config.maxRetryDelay || 5000
    };

    this.isInitialized = false;
    this.logger = require('../../utils/logger').createChildLogger({ component: 'bm25-service' });

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: this.config.url,
      timeout: this.config.timeoutMs,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.logger.info('BM25 service initialized', {
      url: this.config.url,
      timeoutMs: this.config.timeoutMs
    });
  }

  /**
   * Store chunks in BM25 index for full-text search
   * @param {Array} chunks - Array of chunk objects
   * @param {string} filename - Document filename for index naming
   * @param {Object} options - Indexing options
   * @returns {Promise<Object>} Indexing result
   */
  async storeBM25Index(chunks, filename, options = {}) {
    const {
      overwrite = true,
      batchSize = 100
    } = options;

    const startTime = Date.now();

    try {
      logPerformanceMetric('bm25_indexing_start', Date.now(), 'timestamp', {
        chunksCount: chunks.length,
        filename
      });

      // Prepare chunks for BM25 service
      const bm25Chunks = chunks.map(chunk => ({
        id: chunk.chunk_id || chunk.id,
        text: chunk.chunk_text || chunk.text,
        metadata: {
          chunk_index: chunk.chunk_index || 0,
          url: chunk.original_url || chunk.url,
          title: chunk.title || 'Untitled',
          category: chunk.category || 'general',
          processed_date: chunk.processed_date || new Date().toISOString()
        }
      }));

      this.logger.debug('Preparing BM25 indexing request', {
        filename,
        chunksCount: chunks.length,
        bm25ChunksCount: bm25Chunks.length
      });

      // Send to BM25 service
      const response = await this.httpClient.post(`/index/${encodeURIComponent(filename)}`, {
        chunks: bm25Chunks,
        options: {
          overwrite,
          batch_size: batchSize
        }
      });

      const duration = Date.now() - startTime;

      logPerformanceMetric('bm25_indexing_completed', duration, 'ms', {
        chunksCount: chunks.length,
        filename,
        processingTime: response.data.processing_time_seconds,
        indexedChunks: response.data.chunks
      });

      this.logger.info('BM25 index created successfully', {
        filename,
        chunksIndexed: response.data.chunks,
        processingTime: response.data.processing_time_seconds + 's',
        duration
      });

      return {
        success: true,
        chunksIndexed: response.data.chunks,
        processingTime: response.data.processing_time_seconds,
        filename,
        indexName: response.data.index_name || filename,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'bm25_indexing',
        filename,
        chunksCount: chunks.length,
        duration
      });

      this.logger.error('BM25 indexing failed', {
        filename,
        error: error.message,
        duration,
        responseData: error.response?.data
      });

      throw new Error(`BM25 indexing failed: ${error.message}`);
    }
  }

  /**
   * Search BM25 index for relevant documents
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  async searchBM25(query, options = {}) {
    const {
      limit = 10,
      threshold = 0.1,
      filename = null,
      includeMetadata = true
    } = options;

    const startTime = Date.now();

    try {
      const searchParams = {
        query,
        limit,
        threshold,
        include_metadata: includeMetadata,
        ...(filename && { index_name: filename })
      };

      logPerformanceMetric('bm25_search_start', Date.now(), 'timestamp', {
        query: query.substring(0, 100),
        limit,
        filename
      });

      const response = await this.httpClient.post('/search', searchParams);
      const duration = Date.now() - startTime;

      logPerformanceMetric('bm25_search_completed', duration, 'ms', {
        query: query.substring(0, 100),
        resultsCount: response.data.results?.length || 0,
        searchTime: response.data.search_time_seconds
      });

      this.logger.debug('BM25 search completed', {
        query: query.substring(0, 100),
        resultsCount: response.data.results?.length || 0,
        searchTime: response.data.search_time_seconds + 's',
        duration
      });

      return {
        results: response.data.results || [],
        searchTime: response.data.search_time_seconds,
        totalResults: response.data.total_results || 0,
        query
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'bm25_search',
        query: query.substring(0, 100),
        duration
      });

      this.logger.error('BM25 search failed', {
        query: query.substring(0, 100),
        error: error.message,
        duration
      });

      throw new Error(`BM25 search failed: ${error.message}`);
    }
  }

  /**
   * Delete BM25 index
   * @param {string} filename - Index name to delete
   * @returns {Promise<Object>} Deletion result
   */
  async deleteIndex(filename) {
    try {
      const response = await this.httpClient.delete(`/index/${encodeURIComponent(filename)}`);
      
      this.logger.info('BM25 index deleted', {
        filename,
        result: response.data
      });

      return {
        success: true,
        filename,
        message: response.data.message
      };

    } catch (error) {
      logError(error, {
        operation: 'bm25_delete_index',
        filename
      });

      throw new Error(`Failed to delete BM25 index: ${error.message}`);
    }
  }

  /**
   * List available BM25 indexes
   * @returns {Promise<Array>} List of indexes
   */
  async listIndexes() {
    try {
      const response = await this.httpClient.get('/indexes');
      
      this.logger.debug('BM25 indexes retrieved', {
        indexCount: response.data.indexes?.length || 0
      });

      return response.data.indexes || [];

    } catch (error) {
      logError(error, {
        operation: 'bm25_list_indexes'
      });

      throw new Error(`Failed to list BM25 indexes: ${error.message}`);
    }
  }

  /**
   * Health check for BM25 service
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      const response = await this.httpClient.get('/health');
      const duration = Date.now() - startTime;

      const healthResult = {
        status: response.status === 200 ? HEALTH_STATUS.HEALTHY : HEALTH_STATUS.UNHEALTHY,
        responseTime: duration,
        httpStatus: response.status,
        details: response.data || { message: 'Service operational' }
      };

      this.logger.debug('BM25 health check completed', healthResult);
      return healthResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'bm25_health_check',
        duration
      });

      return {
        status: HEALTH_STATUS.UNHEALTHY,
        responseTime: duration,
        error: error.message,
        details: { errorType: error.code || 'unknown' }
      };
    }
  }

  /**
   * Get BM25 service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      serviceUrl: this.config.url,
      timeoutMs: this.config.timeoutMs,
      retries: this.config.retries,
      isInitialized: this.isInitialized,
      supportedFeatures: {
        indexing: true,
        searching: true,
        indexManagement: true,
        healthChecks: true,
        batchProcessing: true
      }
    };
  }

  /**
   * Update BM25 service configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Recreate HTTP client if URL changed
    if (newConfig.url || newConfig.timeoutMs) {
      this.httpClient = axios.create({
        baseURL: this.config.url,
        timeout: this.config.timeoutMs,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    this.logger.info('BM25 service configuration updated', {
      changedFields: Object.keys(newConfig)
    });
  }

  /**
   * Test BM25 service with a simple query
   * @returns {Promise<Object>} Test results
   */
  async testService() {
    try {
      const healthResult = await this.healthCheck();
      
      if (healthResult.status === HEALTH_STATUS.HEALTHY) {
        // Try a simple search to verify functionality
        try {
          await this.searchBM25('test query', { limit: 1 });
          return {
            success: true,
            health: healthResult,
            searchFunctional: true
          };
        } catch (searchError) {
          return {
            success: false,
            health: healthResult,
            searchFunctional: false,
            searchError: searchError.message
          };
        }
      } else {
        return {
          success: false,
          health: healthResult,
          searchFunctional: false
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if service is ready for use
   * @returns {boolean} True if service is ready
   */
  isReady() {
    return this.isInitialized;
  }
}

module.exports = BM25Service;