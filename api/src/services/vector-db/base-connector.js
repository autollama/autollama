/**
 * Base Vector Database Connector
 * Abstract base class that defines the interface for all vector database connectors
 * Ensures consistent API across different vector database vendors
 */

class BaseVectorDbConnector {
  constructor(mode, config) {
    this.mode = mode;
    this.config = config;
    this.vendor = config.vendor;
    this.isConnected = false;
  }

  /**
   * Initialize connection to vector database
   * Must be implemented by each vendor connector
   * @returns {Promise<boolean>} True if connection successful
   */
  async connect() {
    throw new Error('connect() method must be implemented by vendor connector');
  }

  /**
   * Close connection to vector database
   * @returns {Promise<boolean>} True if disconnection successful
   */
  async disconnect() {
    throw new Error('disconnect() method must be implemented by vendor connector');
  }

  /**
   * Test connection to vector database
   * @returns {Promise<boolean>} True if ping successful
   */
  async ping() {
    throw new Error('ping() method must be implemented by vendor connector');
  }

  /**
   * Create a collection/index in the vector database
   * @param {string} collectionName - Name of the collection
   * @param {Object} schema - Collection schema definition
   * @returns {Promise<boolean>} True if creation successful
   */
  async createCollection(collectionName, schema) {
    throw new Error('createCollection() method must be implemented by vendor connector');
  }

  /**
   * Delete a collection/index from the vector database
   * @param {string} collectionName - Name of the collection
   * @returns {Promise<boolean>} True if deletion successful
   */
  async deleteCollection(collectionName) {
    throw new Error('deleteCollection() method must be implemented by vendor connector');
  }

  /**
   * Check if collection exists
   * @param {string} collectionName - Name of the collection
   * @returns {Promise<boolean>} True if collection exists
   */
  async collectionExists(collectionName) {
    throw new Error('collectionExists() method must be implemented by vendor connector');
  }

  /**
   * Insert/upsert vectors into the database
   * @param {string} collectionName - Name of the collection
   * @param {Array} vectors - Array of vector objects with id, vector, and metadata
   * @returns {Promise<Object>} Result of the insertion
   */
  async upsertVectors(collectionName, vectors) {
    throw new Error('upsertVectors() method must be implemented by vendor connector');
  }

  /**
   * Search for similar vectors
   * @param {string} collectionName - Name of the collection
   * @param {Array} queryVector - Query vector
   * @param {Object} options - Search options (limit, filter, etc.)
   * @returns {Promise<Array>} Array of search results
   */
  async searchVectors(collectionName, queryVector, options = {}) {
    throw new Error('searchVectors() method must be implemented by vendor connector');
  }

  /**
   * Delete vectors by IDs
   * @param {string} collectionName - Name of the collection
   * @param {Array} vectorIds - Array of vector IDs to delete
   * @returns {Promise<Object>} Result of the deletion
   */
  async deleteVectors(collectionName, vectorIds) {
    throw new Error('deleteVectors() method must be implemented by vendor connector');
  }

  /**
   * Get vector by ID
   * @param {string} collectionName - Name of the collection
   * @param {string} vectorId - ID of the vector
   * @returns {Promise<Object>} Vector object or null if not found
   */
  async getVector(collectionName, vectorId) {
    throw new Error('getVector() method must be implemented by vendor connector');
  }

  /**
   * Get collection statistics
   * @param {string} collectionName - Name of the collection
   * @returns {Promise<Object>} Collection statistics
   */
  async getCollectionStats(collectionName) {
    throw new Error('getCollectionStats() method must be implemented by vendor connector');
  }

  /**
   * List all collections
   * @returns {Promise<Array>} Array of collection names
   */
  async listCollections() {
    throw new Error('listCollections() method must be implemented by vendor connector');
  }

  /**
   * Get database health/status
   * @returns {Promise<Object>} Health status object
   */
  async getHealth() {
    throw new Error('getHealth() method must be implemented by vendor connector');
  }

  /**
   * Batch operations for better performance
   * @param {Array} operations - Array of operation objects
   * @returns {Promise<Array>} Array of operation results
   */
  async batchOperations(operations) {
    throw new Error('batchOperations() method must be implemented by vendor connector');
  }

  /**
   * Get connector information
   * @returns {Object} Connector information
   */
  getInfo() {
    return {
      vendor: this.vendor,
      mode: this.mode,
      isConnected: this.isConnected,
      config: {
        // Return safe config without sensitive data
        vendor: this.config.vendor,
        mode: this.config.mode,
        url: this.config.url ? this._maskUrl(this.config.url) : null,
        hasApiKey: !!this.config.apiKey,
        timeout: this.config.timeout
      }
    };
  }

  /**
   * Mask sensitive parts of URL for logging
   * @private
   */
  _maskUrl(url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.password) {
        urlObj.password = '***';
      }
      if (urlObj.username) {
        urlObj.username = '***';
      }
      return urlObj.toString();
    } catch {
      return 'invalid-url';
    }
  }

  /**
   * Log connector activity
   * @private
   */
  _log(level, message, data = {}) {
    const prefix = `[${this.vendor.toUpperCase()}-${this.mode.toUpperCase()}]`;
    const logData = {
      vendor: this.vendor,
      mode: this.mode,
      timestamp: new Date().toISOString(),
      ...data
    };

    switch (level) {
      case 'info':
        console.log(`ℹ️ ${prefix} ${message}`, logData);
        break;
      case 'warn':
        console.warn(`⚠️ ${prefix} ${message}`, logData);
        break;
      case 'error':
        console.error(`❌ ${prefix} ${message}`, logData);
        break;
      default:
        console.log(`📝 ${prefix} ${message}`, logData);
    }
  }

  /**
   * Validate configuration
   * @protected
   */
  _validateConfig() {
    if (!this.config) {
      throw new Error('Configuration is required');
    }

    if (!this.config.vendor) {
      throw new Error('Vendor must be specified in configuration');
    }

    if (!this.config.mode) {
      throw new Error('Mode must be specified in configuration');
    }

    // Mode-specific validation
    if (this.mode === 'cloud' && !this.config.url) {
      throw new Error('URL is required for cloud mode');
    }

    // Let each vendor implement additional validation
    this._validateVendorConfig();
  }

  /**
   * Vendor-specific configuration validation
   * Override in vendor connectors if needed
   * @protected
   */
  _validateVendorConfig() {
    // Override in vendor connectors
  }

  /**
   * Handle errors consistently across connectors
   * @protected
   */
  _handleError(error, operation) {
    const errorInfo = {
      operation,
      vendor: this.vendor,
      mode: this.mode,
      message: error.message,
      stack: error.stack
    };

    this._log('error', `Operation failed: ${operation}`, errorInfo);
    
    // Re-throw with additional context
    const enhancedError = new Error(`${this.vendor} ${operation} failed: ${error.message}`);
    enhancedError.vendor = this.vendor;
    enhancedError.mode = this.mode;
    enhancedError.operation = operation;
    enhancedError.originalError = error;
    
    throw enhancedError;
  }
}

module.exports = BaseVectorDbConnector;