/**
 * Jest Test Setup
 * Global test configuration and utilities
 */

// Set test environment
process.env.NODE_ENV = 'testing';
process.env.LOG_LEVEL = 'error'; // Reduce logging noise in tests

// Mock external services by default
jest.mock('../config', () => ({
  env: 'testing',
  isDevelopment: false,
  isProduction: false,
  server: {
    port: 3001,
    wsPort: 3003,
    host: '0.0.0.0',
    timeoutMs: 30000
  },
  database: {
    url: 'postgresql://test:test@localhost:5432/test_autollama',
    maxConnections: 5,
    idleTimeoutMs: 5000,
    connectionTimeoutMs: 1000,
    acquireTimeoutMs: 2000
  },
  ai: {
    openai: {
      apiKey: 'test-key',
      defaultModel: 'gpt-4o-mini',
      embeddingModel: 'text-embedding-3-small',
      maxTokens: 1000,
      temperature: 0.3,
      timeoutMs: 5000
    },
    contextualEmbeddings: {
      enabled: true,
      model: 'gpt-4o-mini',
      batchSize: 2
    }
  },
  vector: {
    qdrant: {
      url: 'http://localhost:6333',
      apiKey: 'test-key',
      collection: 'test-collection',
      timeoutMs: 5000,
      retries: 1
    }
  },
  bm25: {
    serviceUrl: 'http://localhost:3002',
    timeoutMs: 5000,
    retries: 1
  },
  redis: {
    url: 'redis://localhost:6379',
    host: 'localhost',
    port: 6379,
    db: 1, // Use different DB for tests
    keyPrefix: 'test:autollama:',
    ttl: 300
  },
  processing: {
    chunkSize: 500,
    chunkOverlap: 50,
    maxConcurrentJobs: 2,
    batchSize: 2,
    timeoutMs: 10000
  },
  session: {
    cleanupIntervalMs: 1000,
    cleanupThresholdMs: 5000,
    healthCheckIntervalMs: 1000,
    emergencyCleanupIntervalMs: 500,
    heartbeatTimeoutMs: 2000
  },
  security: {
    corsOrigins: ['*'],
    rateLimit: {
      windowMs: 60000,
      maxRequests: 100
    },
    maxFileSize: 1024 * 1024 // 1MB for tests
  },
  logging: {
    level: 'error',
    format: 'json',
    enableConsole: false,
    enableFile: false,
    maxFiles: 1,
    maxSize: '1m',
    filename: 'test.log'
  },
  monitoring: {
    healthCheck: {
      enabled: true,
      intervalMs: 5000,
      timeoutMs: 1000
    },
    metrics: {
      enabled: false,
      intervalMs: 10000
    }
  },
  upload: {
    maxFileSize: 1024 * 1024, // 1MB for tests
    allowedMimeTypes: [
      'application/pdf',
      'text/plain',
      'text/csv'
    ],
    tempDir: '/tmp'
  }
}));

// Global test utilities
global.createMockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    writeHead: jest.fn().mockReturnThis(),
    write: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    destroyed: false
  };
  return res;
};

global.createMockRequest = (options = {}) => {
  return {
    method: 'GET',
    url: '/',
    headers: {},
    body: {},
    params: {},
    query: {},
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue('test-agent'),
    ...options
  };
};

global.createMockNext = () => jest.fn();

// Database test utilities
global.createMockDatabaseClient = () => ({
  query: jest.fn(),
  release: jest.fn(),
  connect: jest.fn().mockResolvedValue({
    query: jest.fn(),
    release: jest.fn()
  })
});

global.createMockDatabasePool = () => ({
  connect: jest.fn().mockResolvedValue(global.createMockDatabaseClient()),
  query: jest.fn(),
  end: jest.fn(),
  totalCount: 5,
  idleCount: 3,
  waitingCount: 0,
  on: jest.fn()
});

// AI service test utilities
global.createMockOpenAIResponse = (content = { title: 'Test', summary: 'Test summary' }) => ({
  choices: [{
    message: {
      content: JSON.stringify(content)
    }
  }]
});

global.createMockEmbeddingResponse = (dimensions = 1536) => ({
  data: [{
    embedding: Array(dimensions).fill(0).map(() => Math.random())
  }]
});

// Vector database test utilities
global.createMockQdrantResponse = (success = true) => ({
  status: success ? 'ok' : 'error',
  result: success ? { operation_id: 'test-123' } : null
});

// Test data factories
global.createTestChunk = (id = 'test-chunk-1') => ({
  chunk_id: id,
  chunk_text: 'This is a test chunk of content for testing purposes.',
  url: 'https://example.com/test',
  title: 'Test Document',
  chunk_index: 0,
  sentiment: 'neutral',
  emotions: ['neutral'],
  category: 'general',
  content_type: 'article',
  technical_level: 'beginner',
  main_topics: ['testing'],
  key_concepts: ['unit testing'],
  contextual_summary: 'Test chunk summary',
  uses_contextual_embedding: true
});

global.createTestSession = (id = 'test-session-1') => ({
  session_id: id,
  filename: 'test.pdf',
  total_chunks: 5,
  processed_chunks: 3,
  completed_chunks: 2,
  status: 'processing',
  created_at: new Date(),
  updated_at: new Date(),
  last_activity: new Date()
});

// Cleanup function for tests
global.cleanup = async () => {
  // Clear all timers
  jest.clearAllTimers();
  
  // Clear all mocks
  jest.clearAllMocks();
  
  // Reset modules
  jest.resetModules();
};

// Setup for each test
beforeEach(() => {
  // Clear console methods to avoid noise
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

// Cleanup after each test
afterEach(async () => {
  await global.cleanup();
  
  // Restore console methods
  console.log.mockRestore?.();
  console.error.mockRestore?.();
  console.warn.mockRestore?.();
  console.info.mockRestore?.();
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Fail the test
  throw reason;
});

console.log('✅ Jest test setup completed');