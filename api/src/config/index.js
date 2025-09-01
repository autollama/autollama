/**
 * AutoLlama Configuration Management
 * Centralized configuration with environment variable handling and validation
 */

const path = require('path');

// Load environment variables from .env file if it exists
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

/**
 * Validate required environment variables
 */
function validateConfig() {
  const errors = [];
  
  // Check critical configurations
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }
  
  // Warn about missing optional configurations
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY not configured - AI features will be limited');
  }
  
  if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
    console.warn('⚠️ Qdrant not fully configured - vector search will be limited');
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}

/**
 * Main configuration object
 */
const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  // Server configuration
  server: {
    port: parseInt(process.env.PORT || '3001'),
    wsPort: parseInt(process.env.WS_PORT || '3003'),
    host: process.env.HOST || '0.0.0.0',
    timeoutMs: parseInt(process.env.SERVER_TIMEOUT || '300000'), // 5 minutes
  },
  
  // Database configuration
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/autollama',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    idleTimeoutMs: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMs: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000'),
    acquireTimeoutMs: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '10000'),
  },
  
  // AI Services configuration
  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini',
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4000'),
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3'),
      timeoutMs: parseInt(process.env.OPENAI_TIMEOUT || '30000'),
    },
    contextualEmbeddings: {
      enabled: process.env.ENABLE_CONTEXTUAL_EMBEDDINGS === 'true',
      model: process.env.CONTEXTUAL_EMBEDDING_MODEL || 'gpt-4o-mini',
      batchSize: parseInt(process.env.CONTEXT_GENERATION_BATCH_SIZE || '5'),
    },
  },
  
  // Vector database configuration
  vector: {
    qdrant: {
      url: process.env.QDRANT_URL || 'http://autollama-qdrant:6333',
      apiKey: process.env.QDRANT_API_KEY,
      collection: process.env.QDRANT_COLLECTION || 'autollama-content',
      timeoutMs: parseInt(process.env.QDRANT_TIMEOUT || '30000'),
      retries: parseInt(process.env.QDRANT_RETRIES || '3'),
      dimensions: 1536, // Add dimensions to config
    },
  },
  
  // BM25 service configuration
  bm25: {
    serviceUrl: process.env.BM25_SERVICE_URL || 'http://localhost:3002',
    timeoutMs: parseInt(process.env.BM25_TIMEOUT || '30000'),
    retries: parseInt(process.env.BM25_RETRIES || '3'),
  },
  
  // Redis configuration (for caching and queues)
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'autollama:',
    ttl: parseInt(process.env.REDIS_DEFAULT_TTL || '3600'), // 1 hour
  },
  
  // Processing configuration
  processing: {
    chunkSize: parseInt(process.env.DEFAULT_CHUNK_SIZE || '1200'),
    chunkOverlap: parseInt(process.env.DEFAULT_CHUNK_OVERLAP || '200'),
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '10'),
    batchSize: parseInt(process.env.PROCESSING_BATCH_SIZE || '5'),
    timeoutMs: parseInt(process.env.PROCESSING_TIMEOUT || '1800000'), // 30 minutes
  },
  
  // Session management configuration
  session: {
    cleanupIntervalMs: parseInt(process.env.SESSION_CLEANUP_INTERVAL || '60') * 1000, // 1 minute
    cleanupThresholdMs: parseInt(process.env.SESSION_CLEANUP_THRESHOLD || '8') * 60 * 1000, // 8 minutes
    healthCheckIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30') * 1000, // 30 seconds
    emergencyCleanupIntervalMs: parseInt(process.env.EMERGENCY_CLEANUP_INTERVAL || '15') * 1000, // 15 seconds
    heartbeatTimeoutMs: parseInt(process.env.HEARTBEAT_TIMEOUT || '90') * 1000, // 90 seconds
  },
  
  // Security configuration
  security: {
    corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    },
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600'), // 100MB
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '5'),
    maxSize: process.env.LOG_MAX_SIZE || '10m',
    enableConsole: process.env.LOG_CONSOLE !== 'false',
    enableFile: process.env.LOG_FILE === 'true',
    filename: process.env.LOG_FILENAME || 'autollama.log',
  },
  
  // Monitoring configuration
  monitoring: {
    healthCheck: {
      enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
      intervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
      timeoutMs: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'),
    },
    metrics: {
      enabled: process.env.METRICS_ENABLED === 'true',
      intervalMs: parseInt(process.env.METRICS_INTERVAL || '60000'),
    },
  },
  
  // File upload configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600'), // 100MB
    allowedMimeTypes: [
      'application/pdf',
      'application/epub+zip',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv',
      'text/plain',
      'text/markdown',
    ],
    tempDir: process.env.UPLOAD_TEMP_DIR || '/tmp',
  },
};

// Validate configuration on module load (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  try {
    validateConfig();
    console.log('✅ Configuration validated successfully');
  } catch (error) {
    console.error('❌ Configuration validation failed:', error.message);
    process.exit(1);
  }
}

module.exports = config;