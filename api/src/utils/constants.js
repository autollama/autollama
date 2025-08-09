/**
 * Application Constants
 * Centralized constant definitions for AutoLlama API
 */

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

// Processing Status Values
const PROCESSING_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  RETRYING: 'retrying'
};

// Background Job Status Values
const JOB_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  RETRYING: 'retrying'
};

// Background Job Types
const JOB_TYPES = {
  URL_PROCESSING: 'url_processing',
  FILE_PROCESSING: 'file_processing',
  BATCH_PROCESSING: 'batch_processing',
  REPROCESSING: 'reprocessing'
};

// Embedding Status Values
const EMBEDDING_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

// Record Types
const RECORD_TYPES = {
  DOCUMENT: 'document',
  CHUNK: 'chunk',
  SUMMARY: 'summary'
};

// Upload Sources
const UPLOAD_SOURCES = {
  USER: 'user',
  API: 'api',
  WEBHOOK: 'webhook',
  BATCH: 'batch'
};

// Session Status Values
const SESSION_STATUS = {
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout'
};

// Health Status Values
const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  DEGRADED: 'degraded',
  MAINTENANCE: 'maintenance'
};

// Log Levels
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  VERBOSE: 'verbose'
};

// Content Types (MIME Types)
const CONTENT_TYPES = {
  PDF: 'application/pdf',
  EPUB: 'application/epub+zip',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  CSV: 'text/csv',
  PLAIN_TEXT: 'text/plain',
  MARKDOWN: 'text/markdown',
  HTML: 'text/html',
  JSON: 'application/json',
  XML: 'application/xml'
};

// File Extensions
const FILE_EXTENSIONS = {
  PDF: '.pdf',
  EPUB: '.epub',
  DOCX: '.docx',
  CSV: '.csv',
  TXT: '.txt',
  MD: '.md',
  HTML: '.html',
  JSON: '.json',
  XML: '.xml'
};

// AI Model Names
const AI_MODELS = {
  GPT_4O_MINI: 'gpt-4o-mini',
  GPT_4O: 'gpt-4o',
  GPT_3_5_TURBO: 'gpt-3.5-turbo',
  TEXT_EMBEDDING_3_SMALL: 'text-embedding-3-small',
  TEXT_EMBEDDING_3_LARGE: 'text-embedding-3-large',
  TEXT_EMBEDDING_ADA_002: 'text-embedding-ada-002'
};

// Processing Configuration Limits
const PROCESSING_LIMITS = {
  MIN_CHUNK_SIZE: 100,
  MAX_CHUNK_SIZE: 5000,
  MIN_CHUNK_OVERLAP: 0,
  MAX_CHUNK_OVERLAP: 1000,
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_CONCURRENT_JOBS: 20,
  MAX_BATCH_SIZE: 10,
  MAX_RETRY_ATTEMPTS: 3
};

// Database Configuration
const DATABASE_CONSTANTS = {
  MAX_CONNECTIONS: 50,
  MIN_CONNECTIONS: 5,
  CONNECTION_TIMEOUT: 5000,
  IDLE_TIMEOUT: 30000,
  ACQUIRE_TIMEOUT: 10000,
  QUERY_TIMEOUT: 60000
};

// Cache TTL Values (in seconds)
const CACHE_TTL = {
  SHORT: 300,        // 5 minutes
  MEDIUM: 1800,      // 30 minutes
  LONG: 3600,        // 1 hour
  VERY_LONG: 86400,  // 24 hours
  SEARCH_RESULTS: 600, // 10 minutes
  DOCUMENT_METADATA: 3600, // 1 hour
  HEALTH_STATUS: 60, // 1 minute
  USER_SESSIONS: 1800 // 30 minutes
};

// API Rate Limiting
const RATE_LIMITS = {
  GENERAL: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100
  },
  UPLOAD: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 5
  },
  SEARCH: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 30
  },
  HEALTH: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 60
  }
};

// Circuit Breaker Configuration
const CIRCUIT_BREAKER = {
  FAILURE_THRESHOLD: 5,
  SUCCESS_THRESHOLD: 3,
  TIMEOUT: 10000, // 10 seconds
  RESET_TIMEOUT: 30000, // 30 seconds
  MONITORING_PERIOD: 60000 // 1 minute
};

// Event Names for SSE
const SSE_EVENTS = {
  PROCESSING_STARTED: 'processing_started',
  CHUNK_PROCESSED: 'chunk_processed',
  EMBEDDING_CREATED: 'embedding_created',
  ANALYSIS_COMPLETED: 'analysis_completed',
  PROCESSING_COMPLETED: 'processing_completed',
  ERROR_OCCURRED: 'error_occurred',
  SESSION_UPDATED: 'session_updated',
  PROGRESS_UPDATE: 'progress_update'
};

// Queue Names
const QUEUE_NAMES = {
  CONTENT_PROCESSING: 'content-processing',
  EMBEDDING_GENERATION: 'embedding-generation',
  CONTEXT_ANALYSIS: 'context-analysis',
  CLEANUP_TASKS: 'cleanup-tasks',
  HEALTH_CHECKS: 'health-checks'
};

// Error Codes
const ERROR_CODES = {
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
  VECTOR_DB_ERROR: 'VECTOR_DB_ERROR',
  FILE_PROCESSING_ERROR: 'FILE_PROCESSING_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  CIRCUIT_BREAKER_ERROR: 'CIRCUIT_BREAKER_ERROR',
  QUOTA_EXCEEDED_ERROR: 'QUOTA_EXCEEDED_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  NOT_FOUND: 'NOT_FOUND'
};

// Default Configuration Values
const DEFAULTS = {
  CHUNK_SIZE: 2000,
  CHUNK_OVERLAP: 200,
  PROCESSING_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  SESSION_CLEANUP_INTERVAL: 2 * 60 * 1000, // 2 minutes
  SESSION_TIMEOUT: 8 * 60 * 1000, // 8 minutes
  HEALTH_CHECK_INTERVAL: 30 * 1000, // 30 seconds
  HEARTBEAT_TIMEOUT: 90 * 1000, // 90 seconds
  API_TIMEOUT: 30 * 1000, // 30 seconds
  EMBEDDING_DIMENSIONS: 1536,
  BATCH_SIZE: 5,
  MAX_CONCURRENT_OPERATIONS: 10
};

// Regular Expressions
const REGEX_PATTERNS = {
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
  SESSION_ID: /^[a-zA-Z0-9_-]+$/,
  CHUNK_ID: /^[a-zA-Z0-9_-]+$/
};

// Environment Names
const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  TESTING: 'testing',
  STAGING: 'staging',
  PRODUCTION: 'production'
};

module.exports = {
  HTTP_STATUS,
  PROCESSING_STATUS,
  JOB_STATUS,
  JOB_TYPES,
  EMBEDDING_STATUS,
  RECORD_TYPES,
  UPLOAD_SOURCES,
  SESSION_STATUS,
  HEALTH_STATUS,
  LOG_LEVELS,
  CONTENT_TYPES,
  FILE_EXTENSIONS,
  AI_MODELS,
  PROCESSING_LIMITS,
  DATABASE_CONSTANTS,
  CACHE_TTL,
  RATE_LIMITS,
  CIRCUIT_BREAKER,
  SSE_EVENTS,
  QUEUE_NAMES,
  ERROR_CODES,
  DEFAULTS,
  REGEX_PATTERNS,
  ENVIRONMENTS
};