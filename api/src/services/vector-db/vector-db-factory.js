/**
 * Vector Database Factory
 * Creates vendor-specific vector database instances based on configuration
 * Supports multiple vendors: Qdrant, Pinecone, Weaviate, Chroma, Milvus, etc.
 * Enables AutoLlama to work with any vector database deployment
 */

const QdrantConnector = require('./connectors/qdrant-connector');
// Future imports for additional vector database vendors
// const PineconeConnector = require('./connectors/pinecone-connector');
// const WeaviateConnector = require('./connectors/weaviate-connector');
// const ChromaConnector = require('./connectors/chroma-connector');

/**
 * Supported vector database vendors
 */
const SUPPORTED_VENDORS = {
  QDRANT: 'qdrant',
  PINECONE: 'pinecone',
  WEAVIATE: 'weaviate', 
  CHROMA: 'chroma',
  MILVUS: 'milvus',
  ELASTICSEARCH: 'elasticsearch'
};

/**
 * Supported deployment modes
 */
const SUPPORTED_MODES = {
  LOCAL: 'local',
  CLOUD: 'cloud',
  HYBRID: 'hybrid',
  EDGE: 'edge'
};

/**
 * Vector Database Factory
 * Creates appropriate connector instances based on vendor and mode
 */
class VectorDbFactory {
  constructor() {
    this.connectors = new Map();
    this.defaultConfig = this._loadDefaultConfig();
  }

  /**
   * Create vector database connector instance
   * @param {string} vendor - Vector database vendor (qdrant, pinecone, etc.)
   * @param {string} mode - Deployment mode (local, cloud, hybrid, edge)
   * @param {Object} config - Vendor-specific configuration
   * @returns {Object} Vector database connector instance
   */
  createConnector(vendor, mode, config = {}) {
    const key = `${vendor}-${mode}`;
    
    // Return cached connector if available
    if (this.connectors.has(key)) {
      return this.connectors.get(key);
    }

    // Validate vendor and mode
    this._validateVendorAndMode(vendor, mode);

    // Merge with default configuration
    const fullConfig = this._mergeConfig(vendor, mode, config);

    let connector;
    
    switch (vendor) {
      case SUPPORTED_VENDORS.QDRANT:
        connector = new QdrantConnector(mode, fullConfig);
        break;
        
      // Future vendor implementations
      // case SUPPORTED_VENDORS.PINECONE:
      //   connector = new PineconeConnector(mode, fullConfig);
      //   break;
      //
      // case SUPPORTED_VENDORS.WEAVIATE:
      //   connector = new WeaviateConnector(mode, fullConfig);
      //   break;
      //
      // case SUPPORTED_VENDORS.CHROMA:
      //   connector = new ChromaConnector(mode, fullConfig);
      //   break;

      default:
        throw new Error(`Unsupported vector database vendor: ${vendor}`);
    }

    // Cache the connector for reuse
    this.connectors.set(key, connector);
    
    console.log(`✅ Created ${vendor} connector for ${mode} mode`);
    return connector;
  }

  /**
   * Get current vector database configuration
   * Reads from environment variables and configuration files
   * @returns {Object} Current vector database configuration
   */
  getCurrentConfig() {
    const vendor = process.env.VECTOR_DB_VENDOR || 'qdrant';
    const mode = process.env.VECTOR_DB_MODE || 'cloud';
    
    return {
      vendor,
      mode,
      config: this._getVendorConfig(vendor, mode)
    };
  }

  /**
   * Get connector for current configuration
   * @returns {Object} Current vector database connector
   */
  getCurrentConnector() {
    const { vendor, mode, config } = this.getCurrentConfig();
    return this.createConnector(vendor, mode, config);
  }

  /**
   * List all supported vendors
   * @returns {Array} Array of supported vendor names
   */
  getSupportedVendors() {
    return Object.values(SUPPORTED_VENDORS);
  }

  /**
   * List all supported modes
   * @returns {Array} Array of supported deployment modes
   */
  getSupportedModes() {
    return Object.values(SUPPORTED_MODES);
  }

  /**
   * Check if vendor and mode combination is supported
   * @param {string} vendor - Vector database vendor
   * @param {string} mode - Deployment mode
   * @returns {boolean} True if combination is supported
   */
  isSupported(vendor, mode) {
    return Object.values(SUPPORTED_VENDORS).includes(vendor) &&
           Object.values(SUPPORTED_MODES).includes(mode);
  }

  /**
   * Validate vendor and mode parameters
   * @private
   */
  _validateVendorAndMode(vendor, mode) {
    if (!Object.values(SUPPORTED_VENDORS).includes(vendor)) {
      throw new Error(`Unsupported vendor: ${vendor}. Supported vendors: ${Object.values(SUPPORTED_VENDORS).join(', ')}`);
    }

    if (!Object.values(SUPPORTED_MODES).includes(mode)) {
      throw new Error(`Unsupported mode: ${mode}. Supported modes: ${Object.values(SUPPORTED_MODES).join(', ')}`);
    }
  }

  /**
   * Load default configuration from environment
   * @private
   */
  _loadDefaultConfig() {
    return {
      qdrant: {
        local: {
          url: process.env.QDRANT_LOCAL_URL || 'http://localhost:6333',
          apiKey: null, // Local Qdrant typically doesn't need API key
          timeout: 30000
        },
        cloud: {
          url: process.env.QDRANT_URL,
          apiKey: process.env.QDRANT_API_KEY,
          timeout: 30000
        }
      },
      // Future vendor default configurations
      pinecone: {
        cloud: {
          apiKey: process.env.PINECONE_API_KEY,
          environment: process.env.PINECONE_ENVIRONMENT,
          timeout: 30000
        }
      },
      weaviate: {
        local: {
          url: process.env.WEAVIATE_LOCAL_URL || 'http://localhost:8080',
          timeout: 30000
        },
        cloud: {
          url: process.env.WEAVIATE_URL,
          apiKey: process.env.WEAVIATE_API_KEY,
          timeout: 30000
        }
      }
    };
  }

  /**
   * Get vendor-specific configuration for mode
   * @private
   */
  _getVendorConfig(vendor, mode) {
    const vendorConfig = this.defaultConfig[vendor];
    if (!vendorConfig) {
      return {};
    }

    const modeConfig = vendorConfig[mode];
    if (!modeConfig) {
      return {};
    }

    return modeConfig;
  }

  /**
   * Merge default configuration with provided config
   * @private
   */
  _mergeConfig(vendor, mode, providedConfig) {
    const defaultConfig = this._getVendorConfig(vendor, mode);
    return {
      ...defaultConfig,
      ...providedConfig,
      vendor,
      mode
    };
  }

  /**
   * Clear all cached connectors
   * Useful for configuration changes or testing
   */
  clearCache() {
    console.log('🧹 Clearing vector database connector cache');
    this.connectors.clear();
  }

  /**
   * Get connection status for all cached connectors
   * @returns {Object} Status of all connectors
   */
  async getConnectionStatus() {
    const status = {};
    
    for (const [key, connector] of this.connectors) {
      try {
        await connector.ping();
        status[key] = 'connected';
      } catch (error) {
        status[key] = 'disconnected';
      }
    }
    
    return status;
  }
}

// Export singleton instance
const vectorDbFactory = new VectorDbFactory();

module.exports = {
  VectorDbFactory,
  vectorDbFactory,
  SUPPORTED_VENDORS,
  SUPPORTED_MODES
};