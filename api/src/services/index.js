/**
 * Service Initialization and Dependency Injection
 * Wires together all services with proper dependency injection
 */

const config = require('../config');
const { logger } = require('../utils/logger');

// Import all services
const { initializeAIServices } = require('./ai');
const DatabaseService = require('./storage/database.service');
const VectorService = require('./storage/vector.service');
const ContentProcessor = require('./processing/content.processor');
const SessionTrackerService = require('./session/session-tracker.service');

// Import database utilities
const { createDatabasePool, testDatabaseConnection, initializeDatabaseTables } = require('../config/database');

class ServiceContainer {
  constructor() {
    this.services = {};
    this.initialized = false;
    this.logger = logger.child({ component: 'service-container' });
  }

  /**
   * Initialize all services with dependency injection
   * @returns {Promise<Object>} Initialized services
   */
  async initializeServices() {
    if (this.initialized) {
      return this.services;
    }

    try {
      this.logger.info('Starting service initialization...');

      // Step 1: Initialize core infrastructure services
      await this._initializeCoreServices();

      // Step 2: Initialize AI services
      await this._initializeAIServices();

      // Step 3: Initialize storage services
      await this._initializeStorageServices();

      // Step 4: Initialize session tracking services
      await this._initializeSessionServices();

      // Step 5: Initialize processing services
      await this._initializeProcessingServices();

      // Step 6: Start background queue service
      await this._startBackgroundServices();

      // Step 6: Test all service connections - TEMPORARILY DISABLED
      // await this._testServiceConnections();
      this.logger.info('Service connection tests disabled for startup debugging');

      this.initialized = true;
      
      this.logger.info('All services initialized successfully', {
        serviceCount: Object.keys(this.services).length,
        services: Object.keys(this.services)
      });

      return this.services;

    } catch (error) {
      this.logger.error('Service initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Initialize core infrastructure services
   * @private
   */
  async _initializeCoreServices() {
    this.logger.info('Initializing core services...');

    // Database connection pool
    const databasePool = createDatabasePool();
    
    // Test database connection
    const dbConnectionTest = await testDatabaseConnection(databasePool);
    if (!dbConnectionTest) {
      throw new Error('Database connection test failed');
    }

    // Initialize database tables
    await initializeDatabaseTables(databasePool);

    this.services.databasePool = databasePool;
    
    this.logger.info('Core services initialized');
  }

  /**
   * Initialize AI services
   * @private
   */
  async _initializeAIServices() {
    this.logger.info('Initializing AI services...');

    // Initialize all AI services with proper dependencies
    const aiConfig = {
      openaiApiKey: config.ai?.openai?.apiKey || process.env.OPENAI_API_KEY,
      defaultModel: config.ai?.openai?.defaultModel || 'gpt-4o-mini',
      embeddingModel: config.ai?.openai?.embeddingModel || 'text-embedding-3-small',
      maxTokens: config.ai?.openai?.maxTokens || 4000,
      temperature: config.ai?.openai?.temperature || 0.3,
      timeoutMs: config.ai?.openai?.timeoutMs || 30000,
      maxRetries: config.ai?.openai?.maxRetries || 3
    };

    const aiServices = initializeAIServices(aiConfig);
    
    // Add AI services to container
    this.services.openaiService = aiServices.openaiService;
    this.services.embeddingService = aiServices.embeddingService;
    this.services.analysisService = aiServices.analysisService;
    
    // Keep backward compatibility
    this.services.aiService = aiServices.openaiService;

    // Test OpenAI connection if API key is configured
    if (aiConfig.openaiApiKey) {
      const openaiTest = await this.services.openaiService.testConnection();
      if (!openaiTest.success) {
        this.logger.warn('OpenAI connection test failed', {
          error: openaiTest.error
        });
      } else {
        this.logger.info('AI services connected successfully');
      }
    } else {
      this.logger.warn('OpenAI API key not configured - AI features will be limited');
    }

    this.logger.info('AI services initialized', {
      openaiReady: this.services.openaiService.isReady(),
      embeddingReady: this.services.embeddingService.getStats().openaiServiceReady,
      analysisReady: this.services.analysisService.getStats().openaiServiceReady
    });
  }

  /**
   * Initialize storage services
   * @private
   */
  async _initializeStorageServices() {
    this.logger.info('Initializing storage services...');

    // Database Service
    this.services.storageService = new DatabaseService(config.database);

    // Vector Service (Qdrant)
    this.services.vectorService = new VectorService(config.vector.qdrant);
    
    // Initialize Qdrant collection
    try {
      await this.services.vectorService.initializeCollection();
      this.logger.info('Qdrant collection initialized');
    } catch (error) {
      this.logger.warn('Qdrant initialization failed', {
        error: error.message
      });
    }

    this.logger.info('Storage services initialized');
  }

  /**
   * Initialize session tracking services
   * @private
   */
  async _initializeSessionServices() {
    this.logger.info('Initializing session tracking services...');

    try {
      // Initialize Session Tracker Service
      // Use the legacy database interface for session tracker
      const db = require('../../database');
      this.services.sessionTracker = new SessionTrackerService(db);
      
      // Start the session tracker
      await this.services.sessionTracker.initialize();
      
      this.logger.info('Session tracking services initialized');
    } catch (error) {
      this.logger.error('Failed to initialize session tracking services:', error);
      // Create fallback session tracker
      this.services.sessionTracker = {
        validateSession: () => ({ valid: false, reason: 'Session tracker not available' }),
        createTrackedSession: () => { throw new Error('Session tracker not available'); },
        updateSessionActivity: () => false,
        completeSession: () => false,
        markSessionFailed: () => false
      };
      this.logger.warn('Using fallback session tracker');
    }
  }

  /**
   * Initialize processing services
   * @private
   */
  async _initializeProcessingServices() {
    this.logger.info('Initializing processing services...');

    // Communication services (Day 9)
    const { 
      initializeCommunicationServices, 
      startCommunicationServices,
      setupDefaultMessageHandlers 
    } = require('./communication');
    
    const communicationServices = initializeCommunicationServices(config.communication || {});
    this.services.sseService = communicationServices.sseService;
    this.services.webSocketService = communicationServices.webSocketService;
    
    // Start communication services
    const commStartResults = await startCommunicationServices(communicationServices);
    setupDefaultMessageHandlers(communicationServices);
    
    this.logger.info('Communication services initialized', {
      sse: commStartResults.sse.success,
      websocket: commStartResults.websocket.success
    });

    // Session management and monitoring services (Day 8)
    const { initializeSessionServices, startSessionServices } = require('./session');
    const sessionServices = initializeSessionServices(config.session || {}, {
      database: this.services.databasePool,
      databaseService: this.services.storageService,
      sseService: this.services.sseService // Pass SSE service to session services
    });
    
    this.services.sessionCleanupService = sessionServices.cleanupService;
    this.services.sessionMonitoringService = sessionServices.monitoringService;
    
    // Start session services
    startSessionServices(sessionServices);
    
    // Keep backward compatibility
    this.services.monitoringService = sessionServices.monitoringService;
    this.services.sessionService = this._createLegacySessionService(sessionServices.monitoringService);

    // Content Processor with all dependencies
    this.services.contentProcessor = new ContentProcessor({
      aiService: this.services.openaiService,  // ContentProcessor expects aiService
      openaiService: this.services.openaiService,
      embeddingService: this.services.embeddingService,
      analysisService: this.services.analysisService,
      storageService: this.services.storageService,
      vectorService: this.services.vectorService,
      monitoringService: this.services.monitoringService,
      sessionService: this.services.sessionService,
      config: config
    });

    // Expose ContentProcessor session tracking globally for /in-progress endpoint
    global.activeProcessingSessions = this.services.contentProcessor.activeProcessingSessions;

    // Background Queue Service for connection-independent processing
    const BackgroundQueueService = require('./queue/background.queue.service');
    this.services.backgroundQueue = new BackgroundQueueService({
      database: this.services.databasePool,
      databaseService: this.services.storageService,
      contentProcessor: this.services.contentProcessor,
      fileProcessor: this.services.contentProcessor.fileProcessor,
      storageService: this.services.storageService,
      sseService: this.services.sseService,
      config: {
        queue: {
          maxConcurrentJobs: config.processing?.maxConcurrentJobs || 5,
          maxRetries: 3,
          retryDelay: 30000,
          jobTimeout: 1800000, // 30 minutes
          cleanupInterval: 300000, // 5 minutes
          heartbeatInterval: 30000 // 30 seconds
        }
      }
    });

    this.logger.info('Processing services initialized');
  }

  /**
   * Start background services
   */
  async _startBackgroundServices() {
    this.logger.info('Starting background services...');

    // Background queue service for processing jobs
    if (this.services.backgroundQueue) {
      try {
        await this.services.backgroundQueue.start();
        this.logger.info('Background queue service started');
      } catch (error) {
        this.logger.error('Background queue startup failed, continuing without it', {
          error: error.message,
          stack: error.stack
        });
        // Don't fail the entire startup - continue without background queue
      }
    } else {
      this.logger.info('Background queue service disabled for startup debugging');
    }

    this.logger.info('Background services started');
  }

  /**
   * Test all service connections
   * @private
   */
  async _testServiceConnections() {
    this.logger.info('Testing service connections...');

    const healthChecks = [];

    // Database health check
    if (this.services.storageService) {
      healthChecks.push({
        name: 'database',
        check: () => this.services.storageService.healthCheck()
      });
    }

    // Vector database health check
    if (this.services.vectorService) {
      healthChecks.push({
        name: 'vector',
        check: () => this.services.vectorService.healthCheck()
      });
    }

    // AI services health checks
    if (this.services.openaiService && this.services.openaiService.isReady()) {
      healthChecks.push({
        name: 'openai',
        check: () => this.services.openaiService.testConnection()
      });
    }

    if (this.services.analysisService) {
      healthChecks.push({
        name: 'analysis',
        check: () => this.services.analysisService.testAnalysis()
      });
    }

    // Run all health checks
    const results = await Promise.allSettled(
      healthChecks.map(async ({ name, check }) => {
        try {
          const result = await check();
          return { name, success: result.success !== false, result };
        } catch (error) {
          return { name, success: false, error: error.message };
        }
      })
    );

    // Log results
    const healthStatus = {};
    results.forEach((result, index) => {
      const checkName = healthChecks[index].name;
      if (result.status === 'fulfilled') {
        healthStatus[checkName] = result.value;
        if (result.value.success) {
          this.logger.info(`${checkName} service health check passed`);
        } else {
          this.logger.warn(`${checkName} service health check failed`, {
            error: result.value.error
          });
        }
      } else {
        healthStatus[checkName] = { success: false, error: result.reason };
        this.logger.error(`${checkName} service health check error`, {
          error: result.reason
        });
      }
    });

    this.services.healthStatus = healthStatus;
  }

  /**
   * Get service by name
   * @param {string} serviceName - Name of the service
   * @returns {Object|null} Service instance or null
   */
  getService(serviceName) {
    return this.services[serviceName] || null;
  }

  /**
   * Get all services
   * @returns {Object} All initialized services
   */
  getAllServices() {
    return { ...this.services };
  }

  /**
   * Shutdown all services gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down services...');

    try {
      // Shutdown session tracker
      if (this.services.sessionTracker && typeof this.services.sessionTracker.shutdown === 'function') {
        await this.services.sessionTracker.shutdown();
        this.logger.info('Session tracker shut down');
      }

      // Shutdown background queue if it exists
      if (this.services.backgroundQueue && typeof this.services.backgroundQueue.shutdown === 'function') {
        await this.services.backgroundQueue.shutdown();
        this.logger.info('Background queue shut down');
      }

      // Close database connections
      if (this.services.database && typeof this.services.database.end === 'function') {
        await this.services.database.end();
        this.logger.info('Database connections closed');
      }

      this.initialized = false;
      this.logger.info('All services shut down successfully');

    } catch (error) {
      this.logger.error('Error during service shutdown:', error);
    }
  }

  /**
   * Get service health status
   * @returns {Object} Health status of all services
   */
  getHealthStatus() {
    return this.services.healthStatus || {};
  }

  /**
   * Cleanup all services
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.logger.info('Cleaning up services...');

    const cleanupPromises = [];

    // Stop communication services
    if (this.services.sseService || this.services.webSocketService) {
      try {
        const { stopCommunicationServices } = require('./communication');
        stopCommunicationServices({
          sseService: this.services.sseService,
          webSocketService: this.services.webSocketService
        });
        this.logger.info('Communication services stopped');
      } catch (error) {
        this.logger.warn('Communication services stop error', { error: error.message });
      }
    }

    // Stop session services
    if (this.services.sessionCleanupService) {
      try {
        this.services.sessionCleanupService.stop();
        this.logger.info('Session cleanup service stopped');
      } catch (error) {
        this.logger.warn('Session cleanup service stop error', { error: error.message });
      }
    }

    if (this.services.sessionMonitoringService) {
      try {
        this.services.sessionMonitoringService.stop();
        this.logger.info('Session monitoring service stopped');
      } catch (error) {
        this.logger.warn('Session monitoring service stop error', { error: error.message });
      }
    }

    // Close database pool
    if (this.services.databasePool) {
      cleanupPromises.push(
        this.services.databasePool.end().catch(err => 
          this.logger.warn('Database pool cleanup error', { error: err.message })
        )
      );
    }

    // Close database service
    if (this.services.storageService?.close) {
      cleanupPromises.push(
        this.services.storageService.close().catch(err =>
          this.logger.warn('Storage service cleanup error', { error: err.message })
        )
      );
    }

    await Promise.all(cleanupPromises);
    
    this.services = {};
    this.initialized = false;
    
    this.logger.info('Service cleanup completed');
  }

  /**
   * Create mock monitoring service (will be replaced in Day 8)
   * @private
   */
  _createMockMonitoringService() {
    return {
      startProcessingSession: (url, sessionId) => {
        this.logger.debug('Mock monitoring: started processing session', { url, sessionId });
        return sessionId;
      },
      endSession: (sessionId) => {
        this.logger.debug('Mock monitoring: ended session', { sessionId });
      },
      recordError: (sessionId, error) => {
        this.logger.warn('Mock monitoring: recorded error', { sessionId, error: error.message });
      }
    };
  }

  /**
   * Create legacy session service wrapper (Day 8 replacement)
   * @private
   */
  _createLegacySessionService(monitoringService) {
    return {
      updateSession: async (sessionId, updates) => {
        if (updates.progress) {
          monitoringService.updateProgress(sessionId, updates.progress);
        }
        this.logger.debug('Legacy session service: updated session', { sessionId, updates });
        return { sessionId, ...updates };
      },
      createSession: async (sessionData) => {
        const sessionId = monitoringService.startProcessingSession(
          sessionData.url || 'unknown',
          sessionData.sessionId,
          sessionData
        );
        this.logger.debug('Legacy session service: created session', { sessionId, sessionData });
        return { sessionId, ...sessionData };
      }
    };
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    const stats = {
      initialized: this.initialized,
      serviceCount: Object.keys(this.services).length,
      services: {}
    };

    // Collect stats from each service
    Object.keys(this.services).forEach(serviceName => {
      const service = this.services[serviceName];
      if (service && typeof service.getStats === 'function') {
        try {
          stats.services[serviceName] = service.getStats();
        } catch (error) {
          stats.services[serviceName] = { error: error.message };
        }
      }
    });

    return stats;
  }

  /**
   * Check if all critical services are ready
   * @returns {boolean} True if all critical services are ready
   */
  isReady() {
    if (!this.initialized) {
      return false;
    }

    const criticalServices = ['storageService', 'openaiService', 'embeddingService', 'analysisService'];
    return criticalServices.every(serviceName => {
      const service = this.services[serviceName];
      if (!service) return false;
      
      if (typeof service.isReady === 'function') {
        return service.isReady();
      }
      
      // For embedding and analysis services, check if they have stats indicating readiness
      if (serviceName === 'embeddingService' || serviceName === 'analysisService') {
        const stats = service.getStats();
        return stats.openaiServiceReady;
      }
      
      return true; // Assume ready if no isReady method
    });
  }
}

// Export singleton instance
const serviceContainer = new ServiceContainer();

/**
 * Initialize all services
 * @returns {Promise<Object>} Initialized services
 */
async function initializeServices() {
  return serviceContainer.initializeServices();
}

/**
 * Get service container instance
 * @returns {ServiceContainer} Service container
 */
function getServiceContainer() {
  return serviceContainer;
}

module.exports = {
  initializeServices,
  getServiceContainer,
  ServiceContainer
};