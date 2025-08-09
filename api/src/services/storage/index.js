/**
 * Storage Services Index
 * Exports all storage-related services for dependency injection
 */

const DatabaseService = require('./database.service');
const VectorService = require('./vector.service');
const BM25Service = require('./bm25.service');

/**
 * Initialize all storage services with proper dependencies
 * @param {Object} config - Configuration object
 * @returns {Object} Initialized storage services
 */
function initializeStorageServices(config = {}) {
  // Initialize Database Service - match parameter names expected by DatabaseService
  const dbConfig = {
    maxConnections: config.database?.maxConnections || 50,
    minConnections: config.database?.minConnections || 5,
    idleTimeoutMs: config.database?.idleTimeoutMs || 30000,
    connectionTimeoutMs: config.database?.connectionTimeoutMs || 5000,
    acquireTimeoutMs: config.database?.acquireTimeoutMs || 10000
  };
  
  // Use connectionString if provided, otherwise use individual components
  if (config.database?.connectionString || process.env.DATABASE_URL) {
    dbConfig.connectionString = config.database?.connectionString || process.env.DATABASE_URL;
  } else {
    dbConfig.host = config.database?.host || process.env.DB_HOST;
    dbConfig.port = config.database?.port || process.env.DB_PORT || 5432;
    dbConfig.database = config.database?.database || process.env.DB_NAME;
    dbConfig.user = config.database?.user || process.env.DB_USER;
    dbConfig.password = config.database?.password || process.env.DB_PASSWORD;
    dbConfig.ssl = config.database?.ssl || false;
  }
  
  const databaseService = new DatabaseService(dbConfig);

  // Initialize Vector Service (Qdrant)
  const vectorService = new VectorService({
    url: config.vector?.url || process.env.QDRANT_URL,
    apiKey: config.vector?.apiKey || process.env.QDRANT_API_KEY,
    collection: config.vector?.collection || 'autollama-content',
    timeoutMs: config.vector?.timeoutMs || 30000,
    retries: config.vector?.retries || 3,
    dimensions: config.vector?.dimensions || 1536
  });

  // Initialize BM25 Service
  const bm25Service = new BM25Service({
    url: config.bm25?.url || 'http://localhost:3002',
    timeoutMs: config.bm25?.timeoutMs || 30000,
    retries: config.bm25?.retries || 3
  });

  return {
    databaseService,
    vectorService,
    bm25Service
  };
}

/**
 * Test all storage services connectivity
 * @param {Object} services - Storage services object
 * @returns {Promise<Object>} Test results for all services
 */
async function testStorageServices(services) {
  const results = {
    timestamp: new Date().toISOString(),
    overall: { success: true, errors: [] },
    services: {}
  };

  try {
    // Test Database service
    try {
      results.services.database = await services.databaseService.healthCheck();
      if (!results.services.database.success) {
        results.overall.success = false;
        results.overall.errors.push(`Database: ${results.services.database.error}`);
      }
    } catch (error) {
      results.services.database = { success: false, error: error.message };
      results.overall.success = false;
      results.overall.errors.push(`Database: ${error.message}`);
    }

    // Test Vector service
    try {
      results.services.vector = await services.vectorService.healthCheck();
      if (!results.services.vector.success) {
        results.overall.success = false;
        results.overall.errors.push(`Vector: ${results.services.vector.error}`);
      }
    } catch (error) {
      results.services.vector = { success: false, error: error.message };
      results.overall.success = false;
      results.overall.errors.push(`Vector: ${error.message}`);
    }

    // Test BM25 service
    try {
      results.services.bm25 = await services.bm25Service.testService();
      if (!results.services.bm25.success) {
        results.overall.success = false;
        results.overall.errors.push(`BM25: ${results.services.bm25.error || 'Service not functional'}`);
      }
    } catch (error) {
      results.services.bm25 = { success: false, error: error.message };
      results.overall.success = false;
      results.overall.errors.push(`BM25: ${error.message}`);
    }

  } catch (error) {
    results.overall.success = false;
    results.overall.errors.push(`Test execution failed: ${error.message}`);
  }

  return results;
}

/**
 * Get combined statistics for all storage services
 * @param {Object} services - Storage services object
 * @returns {Object} Combined statistics
 */
function getStorageServicesStats(services) {
  return {
    timestamp: new Date().toISOString(),
    database: services.databaseService.getStats(),
    vector: services.vectorService.getStats(),
    bm25: services.bm25Service.getStats(),
    readiness: {
      allReady: Object.values(services).every(service => 
        typeof service.isReady === 'function' ? service.isReady() : true
      ),
      databaseReady: services.databaseService.isReady(),
      vectorReady: services.vectorService.isReady(),
      bm25Ready: services.bm25Service.isReady()
    }
  };
}

/**
 * Cleanup all storage services
 * @param {Object} services - Storage services object
 * @returns {Promise<void>}
 */
async function cleanupStorageServices(services) {
  const cleanupPromises = [];

  // Cleanup database service
  if (services.databaseService && typeof services.databaseService.close === 'function') {
    cleanupPromises.push(
      services.databaseService.close().catch(err => 
        console.warn('Database service cleanup error:', err.message)
      )
    );
  }

  // Vector and BM25 services typically don't need explicit cleanup
  // but we can add logging for consistency
  if (services.vectorService) {
    console.log('Vector service cleanup completed');
  }

  if (services.bm25Service) {
    console.log('BM25 service cleanup completed');
  }

  await Promise.all(cleanupPromises);
}

module.exports = {
  DatabaseService,
  VectorService,
  BM25Service,
  initializeStorageServices,
  testStorageServices,
  getStorageServicesStats,
  cleanupStorageServices
};