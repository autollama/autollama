/**
 * Jest Environment Setup
 * 🦙 Configure test environment variables
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Database configuration for tests
process.env.DATABASE_TYPE = 'sqlite';
process.env.DATABASE_PATH = ':memory:';
process.env.DATABASE_URL = 'sqlite::memory:';

// AI provider configuration (mock)
process.env.OPENAI_API_KEY = 'test-key-for-testing';
process.env.AI_PROVIDER = 'openai';

// Vector database configuration
process.env.QDRANT_URL = 'http://localhost:6333';
process.env.QDRANT_API_KEY = 'test-key';

// Processing configuration
process.env.ENABLE_CONTEXTUAL_EMBEDDINGS = 'false';
process.env.CONTEXT_GENERATION_BATCH_SIZE = '1';

// Server configuration
process.env.PORT = '0';
process.env.FRONTEND_PORT = '0';

// Deployment mode
process.env.DEPLOYMENT_MODE = 'test';
process.env.LLAMA_PERSONALITY = 'professional';

// Disable external services in tests
process.env.DISABLE_EXTERNAL_SERVICES = 'true';
process.env.DISABLE_QDRANT = 'true';
process.env.DISABLE_TELEMETRY = 'true';