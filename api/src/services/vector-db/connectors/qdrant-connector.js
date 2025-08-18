/**
 * Qdrant Vector Database Connector
 * Implements BaseVectorDbConnector for Qdrant vector database
 * Supports both local and cloud deployments
 */

const BaseVectorDbConnector = require('../base-connector');
const axios = require('axios');

class QdrantConnector extends BaseVectorDbConnector {
  constructor(mode, config) {
    super(mode, config);
    this._validateConfig();
    
    // Create axios instance for Qdrant API
    this.client = axios.create({
      baseURL: this.config.url,
      timeout: this.config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'api-key': this.config.apiKey })
      }
    });

    this._log('info', 'Qdrant connector initialized');
  }

  /**
   * Initialize connection to Qdrant
   */
  async connect() {
    try {
      await this.ping();
      this.isConnected = true;
      this._log('info', 'Connected to Qdrant successfully');
      return true;
    } catch (error) {
      this.isConnected = false;
      this._handleError(error, 'connect');
    }
  }

  /**
   * Close connection to Qdrant
   */
  async disconnect() {
    this.isConnected = false;
    this._log('info', 'Disconnected from Qdrant');
    return true;
  }

  /**
   * Test connection to Qdrant
   */
  async ping() {
    try {
      const response = await this.client.get('/');
      if (response.status === 200) {
        return true;
      }
      throw new Error(`Unexpected response status: ${response.status}`);
    } catch (error) {
      this._handleError(error, 'ping');
    }
  }

  /**
   * Create a collection in Qdrant
   */
  async createCollection(collectionName, schema = {}) {
    try {
      const config = {
        vectors: {
          size: schema.vectorSize || 1536, // Default OpenAI embedding size
          distance: schema.distance || 'Cosine'
        },
        ...schema
      };

      const response = await this.client.put(`/collections/${collectionName}`, config);
      
      if (response.data.result) {
        this._log('info', `Collection created: ${collectionName}`);
        return true;
      }
      
      throw new Error(`Failed to create collection: ${response.data.status}`);
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.status?.error?.includes('already exists')) {
        this._log('info', `Collection already exists: ${collectionName}`);
        return true;
      }
      this._handleError(error, 'createCollection');
    }
  }

  /**
   * Delete a collection from Qdrant
   */
  async deleteCollection(collectionName) {
    try {
      const response = await this.client.delete(`/collections/${collectionName}`);
      
      if (response.data.result) {
        this._log('info', `Collection deleted: ${collectionName}`);
        return true;
      }
      
      throw new Error(`Failed to delete collection: ${response.data.status}`);
    } catch (error) {
      this._handleError(error, 'deleteCollection');
    }
  }

  /**
   * Check if collection exists in Qdrant
   */
  async collectionExists(collectionName) {
    try {
      const response = await this.client.get(`/collections/${collectionName}`);
      return response.status === 200 && response.data.result;
    } catch (error) {
      if (error.response?.status === 404) {
        return false;
      }
      this._handleError(error, 'collectionExists');
    }
  }

  /**
   * Insert/upsert vectors into Qdrant
   */
  async upsertVectors(collectionName, vectors) {
    try {
      // Transform vectors to Qdrant format
      const points = vectors.map(vector => ({
        id: vector.id,
        vector: vector.vector,
        payload: vector.metadata || {}
      }));

      const response = await this.client.put(`/collections/${collectionName}/points`, {
        points
      });

      if (response.data.result) {
        this._log('info', `Upserted ${vectors.length} vectors to ${collectionName}`);
        return {
          success: true,
          count: vectors.length,
          status: response.data.result.operation_id
        };
      }

      throw new Error(`Failed to upsert vectors: ${response.data.status}`);
    } catch (error) {
      this._handleError(error, 'upsertVectors');
    }
  }

  /**
   * Search for similar vectors in Qdrant
   */
  async searchVectors(collectionName, queryVector, options = {}) {
    try {
      const searchParams = {
        vector: queryVector,
        limit: options.limit || 10,
        with_payload: options.withPayload !== false,
        with_vector: options.withVector || false,
        ...(options.filter && { filter: options.filter }),
        ...(options.params && { params: options.params })
      };

      const response = await this.client.post(`/collections/${collectionName}/points/search`, searchParams);

      if (response.data.result) {
        const results = response.data.result.map(hit => ({
          id: hit.id,
          score: hit.score,
          metadata: hit.payload || {},
          ...(hit.vector && { vector: hit.vector })
        }));

        this._log('info', `Found ${results.length} similar vectors in ${collectionName}`);
        return results;
      }

      throw new Error(`Search failed: ${response.data.status}`);
    } catch (error) {
      this._handleError(error, 'searchVectors');
    }
  }

  /**
   * Delete vectors by IDs from Qdrant
   */
  async deleteVectors(collectionName, vectorIds) {
    try {
      const response = await this.client.post(`/collections/${collectionName}/points/delete`, {
        points: vectorIds
      });

      if (response.data.result) {
        this._log('info', `Deleted ${vectorIds.length} vectors from ${collectionName}`);
        return {
          success: true,
          count: vectorIds.length,
          status: response.data.result.operation_id
        };
      }

      throw new Error(`Failed to delete vectors: ${response.data.status}`);
    } catch (error) {
      this._handleError(error, 'deleteVectors');
    }
  }

  /**
   * Get vector by ID from Qdrant
   */
  async getVector(collectionName, vectorId) {
    try {
      const response = await this.client.get(`/collections/${collectionName}/points/${vectorId}`);

      if (response.data.result) {
        const point = response.data.result;
        return {
          id: point.id,
          vector: point.vector,
          metadata: point.payload || {}
        };
      }

      return null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      this._handleError(error, 'getVector');
    }
  }

  /**
   * Get collection statistics from Qdrant
   */
  async getCollectionStats(collectionName) {
    try {
      const response = await this.client.get(`/collections/${collectionName}`);

      if (response.data.result) {
        const info = response.data.result;
        return {
          pointsCount: info.points_count || 0,
          indexedVectorsCount: info.indexed_vectors_count || 0,
          status: info.status,
          optimizer: info.optimizer_status,
          vectorsConfig: info.config?.params?.vectors,
          payloadSchema: info.payload_schema || {}
        };
      }

      throw new Error(`Failed to get collection stats: ${response.data.status}`);
    } catch (error) {
      this._handleError(error, 'getCollectionStats');
    }
  }

  /**
   * List all collections in Qdrant
   */
  async listCollections() {
    try {
      const response = await this.client.get('/collections');

      if (response.data.result && response.data.result.collections) {
        return response.data.result.collections.map(collection => collection.name);
      }

      return [];
    } catch (error) {
      this._handleError(error, 'listCollections');
    }
  }

  /**
   * Get Qdrant health status
   */
  async getHealth() {
    try {
      const response = await this.client.get('/');
      
      return {
        status: 'healthy',
        vendor: 'qdrant',
        mode: this.mode,
        version: response.data?.version || 'unknown',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        vendor: 'qdrant',
        mode: this.mode,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Batch operations for Qdrant
   */
  async batchOperations(operations) {
    const results = [];
    
    for (const operation of operations) {
      try {
        let result;
        
        switch (operation.type) {
          case 'upsert':
            result = await this.upsertVectors(operation.collection, operation.vectors);
            break;
          case 'search':
            result = await this.searchVectors(operation.collection, operation.vector, operation.options);
            break;
          case 'delete':
            result = await this.deleteVectors(operation.collection, operation.ids);
            break;
          default:
            throw new Error(`Unsupported operation type: ${operation.type}`);
        }
        
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Qdrant-specific configuration validation
   */
  _validateVendorConfig() {
    if (this.mode === 'cloud') {
      if (!this.config.url) {
        throw new Error('URL is required for Qdrant cloud mode');
      }
      
      if (!this.config.apiKey) {
        console.warn('⚠️ No API key provided for Qdrant cloud mode');
      }
    }

    if (this.mode === 'local') {
      // For local mode, use default URL if not provided
      if (!this.config.url) {
        this.config.url = 'http://localhost:6333';
      }
    }
  }
}

module.exports = QdrantConnector;