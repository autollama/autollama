# 🏗️ AutoLlama Server.js Hybrid Refactoring Plan
## Comprehensive Implementation Strategy (Combining Claude Opus 4 + Sonnet 4 Approaches)

**Date**: August 3, 2025  
**Current State**: 4,506-line monolithic server.js  
**Target**: Modular, production-ready microservice architecture  
**Estimated Timeline**: 15 days (3 weeks)  

---

## 📊 Current Analysis

### **Pain Points Identified**
- 4,506 lines in single file (10x industry recommendation)
- 38 API endpoints mixed with business logic
- 40+ functions without proper separation
- No error handling strategy
- Difficult testing and debugging
- Team collaboration conflicts

### **Success Metrics**
- Reduce main server.js to <300 lines
- Achieve 90%+ test coverage
- Implement comprehensive monitoring
- Zero-downtime deployment capability
- Sub-100ms average response times

---

## 🎯 Target Architecture

```
src/
├── server.js (250 lines - entry point only)
├── config/
│   ├── index.js - Environment configuration
│   ├── database.js - PostgreSQL + Qdrant config
│   ├── services.js - Service dependencies
│   └── monitoring.js - Health check configuration
├── routes/
│   ├── index.js - Route aggregator
│   ├── content.routes.js - Content processing endpoints
│   ├── upload.routes.js - File upload endpoints  
│   ├── search.routes.js - Search & retrieval
│   ├── health.routes.js - Health monitoring
│   ├── cleanup.routes.js - Session management
│   └── settings.routes.js - Configuration management
├── controllers/
│   ├── content.controller.js - Content orchestration
│   ├── upload.controller.js - Upload coordination
│   ├── search.controller.js - Search coordination
│   └── health.controller.js - Health coordination
├── services/
│   ├── ai/
│   │   ├── openai.service.js - OpenAI integration
│   │   ├── embedding.service.js - Vector embeddings
│   │   └── analysis.service.js - Content analysis
│   ├── processing/
│   │   ├── content.processor.js - Main processing pipeline
│   │   ├── file.processor.js - File parsing (PDF, EPUB, etc.)
│   │   ├── chunking.service.js - Text chunking algorithms
│   │   └── context.service.js - Contextual embeddings
│   ├── storage/
│   │   ├── database.service.js - PostgreSQL operations
│   │   ├── vector.service.js - Qdrant operations
│   │   └── bm25.service.js - BM25 indexing
│   ├── session/
│   │   ├── cleanup.service.js - Advanced session cleanup
│   │   ├── monitoring.service.js - Real-time monitoring
│   │   └── recovery.service.js - Error recovery
│   ├── communication/
│   │   ├── sse.service.js - Server-Sent Events
│   │   ├── websocket.service.js - WebSocket management
│   │   └── queue.service.js - Job processing (Bull/BullMQ)
│   └── external/
│       ├── qdrant.client.js - Qdrant API client
│       └── bm25.client.js - BM25 service client
├── middleware/
│   ├── error.middleware.js - Centralized error handling
│   ├── validation.middleware.js - Request validation
│   ├── cors.middleware.js - CORS configuration
│   ├── logging.middleware.js - Request/response logging
│   ├── auth.middleware.js - Authentication (future)
│   └── ratelimit.middleware.js - Rate limiting
├── utils/
│   ├── logger.js - Structured logging (Winston/Pino)
│   ├── constants.js - Application constants
│   ├── helpers.js - Utility functions
│   ├── circuitBreaker.js - Circuit breaker pattern
│   └── cache.js - Redis caching layer
├── models/
│   ├── content.model.js - Content data models
│   ├── session.model.js - Session data models
│   └── health.model.js - Health check models
├── validators/
│   ├── content.validator.js - Content validation schemas
│   ├── upload.validator.js - Upload validation
│   └── search.validator.js - Search validation
└── tests/
    ├── unit/ - Unit tests for services
    ├── integration/ - API endpoint tests
    ├── e2e/ - End-to-end workflows
    └── fixtures/ - Test data
```

---

## 🚀 Implementation Phases

### **Phase 1: Foundation & Core Extraction (Days 1-5)**

#### **Day 1: Project Setup & Configuration**
**Goals**: Set up new structure and configuration management
```bash
# Tasks:
1. Create new src/ directory structure
2. Extract configuration from server.js to config/
3. Set up structured logging with Winston/Pino
4. Create package.json dependencies
5. Set up ESLint + Prettier for code standards

# Files Created:
- src/config/index.js (environment management)
- src/utils/logger.js (structured logging)
- src/constants.js (application constants)
- .eslintrc.js, .prettierrc (code standards)

# Expected Reduction: 200 lines from server.js
```

#### **Day 2: Content Processing Pipeline Extraction**
**Goals**: Extract main processing logic into dedicated service
```javascript
// services/processing/content.processor.js
class ContentProcessor {
  constructor({ aiService, storageService, monitoringService }) {
    this.ai = aiService;
    this.storage = storageService;
    this.monitor = monitoringService;
  }

  async processContentChunks(content, url, options = {}) {
    const session = this.monitor.startProcessingSession(url);
    try {
      const chunks = await this.chunkContent(content, options);
      const results = await this.processChunksInBatches(chunks, session);
      return results;
    } catch (error) {
      this.monitor.recordError(session, error);
      throw error;
    } finally {
      this.monitor.endSession(session);
    }
  }
}

# Expected Reduction: 800 lines from server.js
```

#### **Day 3: File Processing Service**
**Goals**: Extract file parsing logic (PDF, EPUB, DOCX, CSV)
```javascript
// services/processing/file.processor.js
class FileProcessor {
  constructor() {
    this.parsers = new Map([
      ['application/pdf', this.parsePDF.bind(this)],
      ['application/epub+zip', this.parseEPUB.bind(this)],
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', this.parseDOCX.bind(this)],
      ['text/csv', this.parseCSV.bind(this)]
    ]);
  }

  async processFile(buffer, mimeType, filename) {
    const parser = this.selectParser(mimeType, filename);
    return await parser(buffer);
  }
}

# Expected Reduction: 600 lines from server.js
```

#### **Day 4: AI Services Extraction**
**Goals**: Extract OpenAI, embedding, and analysis services
```javascript
// services/ai/openai.service.js
class OpenAIService {
  constructor(config) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.circuitBreaker = new CircuitBreaker();
  }

  async analyzeChunk(chunkText) {
    return this.circuitBreaker.call(async () => {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: chunkText }],
        response_format: { type: 'json_object' }
      });
      return JSON.parse(response.choices[0].message.content);
    });
  }
}

# Expected Reduction: 500 lines from server.js
```

#### **Day 5: Storage Services Extraction**
**Goals**: Extract database, vector, and BM25 services
```javascript
// services/storage/database.service.js
class DatabaseService {
  constructor(config) {
    this.pool = new Pool(config.database);
  }

  async addContentRecord(data) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(INSERT_QUERY, values);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

# Expected Reduction: 400 lines from server.js
```

**Phase 1 Results**: server.js reduced from 4,506 → 2,006 lines

---

### **Phase 2: API Layer & Controllers (Days 6-10)**

#### **Day 6: Route Extraction**
**Goals**: Extract all 38 API endpoints into route modules
```javascript
// routes/content.routes.js
const express = require('express');
const router = express.Router();
const contentController = require('../controllers/content.controller');
const { validateContent } = require('../validators/content.validator');

router.post('/process-url-stream', validateContent, contentController.processUrlStream);
router.post('/process-url', validateContent, contentController.processUrl);
router.get('/record/:id', contentController.getRecord);

module.exports = router;

# Expected Reduction: 1,200 lines from server.js
```

#### **Day 7: Controller Implementation**
**Goals**: Implement MVC pattern with dedicated controllers
```javascript
// controllers/content.controller.js
class ContentController {
  constructor({ contentProcessor, sessionService, sseService }) {
    this.processor = contentProcessor;
    this.session = sessionService;
    this.sse = sseService;
  }

  async processUrlStream(req, res) {
    try {
      const { url, chunkSize, overlap } = req.body;
      
      // Set up SSE
      this.sse.setupSSE(res);
      
      // Process content with real-time updates
      const result = await this.processor.processContentChunks(
        content, url, { chunkSize, overlap, sseCallback: this.sse.send }
      );
      
      this.sse.send('completed', { result });
    } catch (error) {
      next(error);
    }
  }
}

# Expected Reduction: 500 lines from server.js
```

#### **Day 8: Advanced Session Management**
**Goals**: Implement enhanced session cleanup and monitoring
```javascript
// services/session/cleanup.service.js
class SessionCleanupService {
  constructor({ database, monitor }) {
    this.db = database;
    this.monitor = monitor;
    this.startAutomaticCleanup();
  }

  async advancedSessionCleanup(options = {}) {
    const {
      enableHealthCheck = true,
      enableOrphanCleanup = true,
      enableMemoryCleanup = true
    } = options;

    const results = await this.db.runTransaction(async (client) => {
      const cleanupResults = {
        sessions_cleaned: 0,
        chunks_recovered: 0,
        memory_freed: false,
        health_issues: []
      };

      // Heartbeat monitoring (90-second detection)
      if (enableHealthCheck) {
        const stuckSessions = await this.cleanupStuckSessions(client);
        cleanupResults.sessions_cleaned += stuckSessions;
      }

      // Orphaned chunk recovery
      if (enableOrphanCleanup) {
        const recoveredChunks = await this.recoverOrphanedChunks(client);
        cleanupResults.chunks_recovered = recoveredChunks;
      }

      return cleanupResults;
    });

    return results;
  }
}

# Expected Reduction: 300 lines from server.js
```

#### **Day 9: WebSocket & SSE Services**
**Goals**: Extract real-time communication services
```javascript
// services/communication/sse.service.js
class SSEService {
  constructor() {
    this.clients = new Set();
    this.activeStreams = new Map();
  }

  setupSSE(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    this.clients.add(res);
    return this.createStreamHandler(res);
  }

  broadcast(event, data) {
    const message = `data: ${JSON.stringify({ event, data })}\n\n`;
    this.clients.forEach(client => {
      if (!client.destroyed) {
        try {
          client.write(message);
        } catch (error) {
          this.clients.delete(client);
        }
      }
    });
  }
}

# Expected Reduction: 200 lines from server.js
```

#### **Day 10: Error Handling & Middleware**
**Goals**: Implement comprehensive error handling and middleware
```javascript
// middleware/error.middleware.js
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
  }
}

const errorHandler = (err, req, res, next) => {
  const logger = require('../utils/logger');
  
  // Log error
  logger.error('API Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body
  });

  // Handle operational errors
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }

  // Handle unexpected errors
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
};

# Expected Reduction: 100 lines from server.js
```

**Phase 2 Results**: server.js reduced from 2,006 → 706 lines

---

### **Phase 3: Performance & Advanced Features (Days 11-15)**

#### **Day 11: Queue System Implementation**
**Goals**: Implement Bull/BullMQ for background processing
```javascript
// services/communication/queue.service.js
const { Queue, Worker } = require('bullmq');

class QueueService {
  constructor(redisConfig) {
    this.contentQueue = new Queue('content-processing', { connection: redisConfig });
    this.setupWorkers();
  }

  async addContentProcessingJob(data, options = {}) {
    return this.contentQueue.add('process-content', data, {
      priority: options.priority || 1,
      delay: options.delay || 0,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
  }

  setupWorkers() {
    new Worker('content-processing', async (job) => {
      const { contentProcessor } = require('../processing/content.processor');
      return await contentProcessor.processContentChunks(job.data);
    });
  }
}

# Expected Addition: Background processing capability
```

#### **Day 12: Caching Layer**
**Goals**: Implement Redis caching for performance
```javascript
// utils/cache.js
class CacheService {
  constructor(redisConfig) {
    this.redis = new Redis(redisConfig);
    this.defaultTTL = 3600; // 1 hour
  }

  async get(key) {
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async set(key, value, ttl = this.defaultTTL) {
    return this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async invalidatePattern(pattern) {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      return this.redis.del(...keys);
    }
  }
}

# Integration in services for 50-90% performance improvement
```

#### **Day 13: Health Monitoring System**
**Goals**: Comprehensive health monitoring and alerting
```javascript
// services/session/monitoring.service.js
class HealthMonitoringService {
  constructor({ database, cache, logger }) {
    this.db = database;
    this.cache = cache;
    this.logger = logger;
    this.metrics = new Map();
    this.alerts = [];
  }

  async comprehensiveHealthCheck() {
    const startTime = Date.now();
    const health = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      services: {},
      performance: {},
      alerts: []
    };

    // Check all services in parallel
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkQdrant(),
      this.checkBM25(),
      this.checkRedis(),
      this.checkOpenAI()
    ]);

    // Process results and generate alerts
    this.processHealthResults(health, checks);
    
    health.performance.totalResponseTime = Date.now() - startTime;
    return health;
  }

  generateAlerts(health) {
    if (health.services.database?.responseTime > 1000) {
      health.alerts.push({
        severity: 'warning',
        message: 'Database response time high',
        value: health.services.database.responseTime + 'ms'
      });
    }
    // Additional alert logic...
  }
}

# Expected Addition: Real-time health monitoring dashboard
```

#### **Day 14: Testing Implementation**
**Goals**: Comprehensive test suite
```javascript
// tests/unit/content.processor.test.js
describe('ContentProcessor', () => {
  let processor;
  let mockDependencies;

  beforeEach(() => {
    mockDependencies = {
      aiService: {
        analyzeChunk: jest.fn().mockResolvedValue({ title: 'Test' })
      },
      storageService: {
        store: jest.fn().mockResolvedValue({ id: '123' })
      },
      monitoringService: {
        startProcessingSession: jest.fn().mockReturnValue('session-123'),
        endSession: jest.fn()
      }
    };
    processor = new ContentProcessor(mockDependencies);
  });

  describe('processContentChunks', () => {
    it('should process content chunks successfully', async () => {
      const result = await processor.processContentChunks('test content', 'test-url');
      expect(result).toBeDefined();
      expect(mockDependencies.monitoringService.startProcessingSession).toHaveBeenCalled();
    });

    it('should handle processing errors gracefully', async () => {
      mockDependencies.aiService.analyzeChunk.mockRejectedValue(new Error('AI service down'));
      
      await expect(processor.processContentChunks('test', 'url')).rejects.toThrow('AI service down');
      expect(mockDependencies.monitoringService.endSession).toHaveBeenCalled();
    });
  });
});

# Target: 90%+ test coverage
```

#### **Day 15: Production Deployment & Documentation**
**Goals**: Final integration and documentation
```javascript
// server.js (final version - ~250 lines)
const express = require('express');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

// Import configuration and services
const config = require('./config');
const { initializeServices } = require('./services');
const { setupRoutes } = require('./routes');
const { setupMiddleware } = require('./middleware');
const logger = require('./utils/logger');

// Clustering for multi-core utilization
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
  logger.info(`Master ${process.pid} starting ${numCPUs} workers`);
  
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  startServer();
}

async function startServer() {
  try {
    const app = express();
    
    // Initialize services with dependency injection
    const services = await initializeServices(config);
    
    // Setup middleware stack
    setupMiddleware(app, services);
    
    // Setup API routes
    setupRoutes(app, services);
    
    // Start server
    const server = app.listen(config.port, () => {
      logger.info(`AutoLlama API server running on port ${config.port}`, {
        environment: config.env,
        nodeVersion: process.version,
        pid: process.pid
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        services.cleanup().then(() => {
          process.exit(0);
        });
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

# Final Result: 250 lines (95% reduction from 4,506 lines)
```

---

## 📈 Expected Benefits

### **Immediate Benefits (End of Phase 1)**
- **File Size**: 4,506 → 2,006 lines (55% reduction)
- **Maintainability**: Clear separation of concerns
- **Testability**: Individual modules can be unit tested
- **Team Collaboration**: No more file conflicts

### **Medium-term Benefits (End of Phase 2)**  
- **File Size**: 2,006 → 706 lines (84% reduction)
- **Code Quality**: MVC pattern, proper error handling
- **Debugging**: Structured logging and monitoring
- **API Quality**: Validation, documentation

### **Long-term Benefits (End of Phase 3)**
- **File Size**: 706 → 250 lines (95% reduction)
- **Performance**: Multi-core clustering, Redis caching
- **Reliability**: Circuit breakers, comprehensive monitoring
- **Scalability**: Queue system, horizontal scaling ready

### **Production Metrics (Expected)**
- **Response Time**: <100ms average (currently 200-500ms)
- **Throughput**: 10x improvement with clustering
- **Error Rate**: <0.1% with circuit breakers
- **Uptime**: 99.9% with health monitoring
- **Test Coverage**: >90% with comprehensive test suite

---

## 🛡️ Risk Mitigation

### **Migration Strategy**
1. **Incremental Deployment**: One module at a time
2. **Feature Flags**: Toggle between old/new implementations
3. **Comprehensive Testing**: Unit + Integration + E2E tests
4. **Rollback Plan**: Quick revert capability at each phase
5. **Performance Monitoring**: Real-time metrics during migration

### **Quality Assurance**
- **Code Review**: Every module peer-reviewed
- **Automated Testing**: CI/CD pipeline with test gates
- **Performance Testing**: Load testing before deployment
- **Security Review**: Security scan of all new modules

---

## 🎯 Success Criteria

### **Technical Metrics**
- [ ] Server.js reduced to <300 lines
- [ ] All 38 endpoints moved to route modules  
- [ ] 90%+ test coverage achieved
- [ ] Sub-100ms average response time
- [ ] Zero critical security vulnerabilities

### **Operational Metrics**
- [ ] Zero-downtime deployment capability
- [ ] Comprehensive health monitoring
- [ ] Automated error recovery
- [ ] Real-time performance dashboards
- [ ] Production-ready logging and alerting

---

## 🔄 Progress Tracking

### **Phase 1 Progress (Days 1-5)**
- [ ] Day 1: Project setup & configuration
- [ ] Day 2: Content processing extraction
- [ ] Day 3: File processing service
- [ ] Day 4: AI services extraction
- [ ] Day 5: Storage services extraction

### **Phase 2 Progress (Days 6-10)**
- [ ] Day 6: Route extraction
- [ ] Day 7: Controller implementation
- [ ] Day 8: Advanced session management
- [ ] Day 9: WebSocket & SSE services
- [ ] Day 10: Error handling & middleware

### **Phase 3 Progress (Days 11-15)**
- [ ] Day 11: Queue system implementation
- [ ] Day 12: Caching layer
- [ ] Day 13: Health monitoring system
- [ ] Day 14: Testing implementation
- [ ] Day 15: Production deployment

---

This hybrid refactoring plan combines the best practices from both Claude Opus 4 and Sonnet 4 approaches, resulting in a production-ready, scalable, and maintainable AutoLlama API architecture.