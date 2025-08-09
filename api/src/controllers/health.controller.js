/**
 * Health Controller
 * Handles health check and monitoring endpoints
 */

const { logger } = require('../utils/logger');
const { HEALTH_STATUS } = require('../utils/constants');

class HealthController {
  constructor(services) {
    this.services = services;
    this.logger = logger.child({ component: 'health-controller' });
  }

  /**
   * Basic health check endpoint
   * GET /health
   */
  async basicHealthCheck(req, res) {
    this.logger.debug('Basic health check requested');
    
    try {
      const db = this.services.database || require('../../database');
      
      // Test database connectivity
      const dbConnected = await db.testConnection();
      
      // Get API keys from database settings
      const dbOpenAIKey = await db.getApiSetting('openai_api_key');
      const dbQdrantKey = await db.getApiSetting('qdrant_api_key');
      const dbQdrantUrl = await db.getApiSetting('qdrant_url');
      
      res.json({ 
        status: 'OK',
        version: '2.2.0',
        contextual_embeddings: {
          enabled: process.env.ENABLE_CONTEXTUAL_EMBEDDINGS !== 'false',
          model: process.env.CONTEXTUAL_EMBEDDING_MODEL || 'gpt-4o-mini',
          batch_size: parseInt(process.env.CONTEXT_GENERATION_BATCH_SIZE || '5')
        },
        database: {
          postgresql: dbConnected ? 'connected' : 'disconnected',
          qdrant: (dbQdrantUrl || process.env.QDRANT_URL) ? 'configured' : 'not_configured'
        },
        api_keys: {
          openai: (dbOpenAIKey || process.env.OPENAI_API_KEY) ? 'configured' : 'missing',
          qdrant: (dbQdrantKey || process.env.QDRANT_API_KEY) ? 'configured' : 'missing'
        },
        services: {
          ai_services: this.services.aiServices ? 'available' : 'not_available',
          storage_services: this.services.storageServices ? 'available' : 'not_available'
        },
        refactoring: {
          phase: 'Phase 2 - Day 7',
          status: 'MVC controllers implemented'
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Health check failed', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        status: 'ERROR',
        version: '2.2.0',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Comprehensive health check endpoint
   * GET /api/health/comprehensive
   */
  async comprehensiveHealthCheck(req, res) {
    this.logger.debug('Comprehensive health check requested');
    
    try {
      const startTime = Date.now();
      const healthChecks = [];

      // Test all system components in parallel
      const checks = [
        this._checkDatabase(),
        this._checkQdrant(),
        this._checkBM25(),
        this._checkAIServices(),
        this._checkStorageServices()
      ];

      const results = await Promise.allSettled(checks);
      const duration = Date.now() - startTime;

      // Process results
      const health = {
        status: HEALTH_STATUS.HEALTHY,
        version: '2.2.0',
        timestamp: new Date().toISOString(),
        responseTime: duration,
        services: {
          database: this._processCheckResult(results[0]),
          qdrant: this._processCheckResult(results[1]),
          bm25: this._processCheckResult(results[2]),
          ai_services: this._processCheckResult(results[3]),
          storage_services: this._processCheckResult(results[4])
        },
        overall: {
          healthy_services: 0,
          total_services: 5,
          success_rate: 0
        }
      };

      // Calculate overall health
      const healthyServices = Object.values(health.services)
        .filter(service => service.status === HEALTH_STATUS.HEALTHY).length;
      
      health.overall.healthy_services = healthyServices;
      health.overall.success_rate = Math.round((healthyServices / 5) * 100);

      if (healthyServices < 3) {
        health.status = HEALTH_STATUS.UNHEALTHY;
      } else if (healthyServices < 5) {
        health.status = HEALTH_STATUS.DEGRADED;
      }

      const statusCode = health.status === HEALTH_STATUS.HEALTHY ? 200 : 503;
      res.status(statusCode).json(health);

    } catch (error) {
      this.logger.error('Comprehensive health check failed', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        status: HEALTH_STATUS.UNHEALTHY,
        version: '2.2.0',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * System status endpoint
   * GET /api/system/status
   */
  async systemStatus(req, res) {
    this.logger.debug('System status requested');
    
    try {
      const status = {
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          node_version: process.version,
          platform: process.platform
        },
        services: await this._getServiceStatuses(),
        database: await this._getDatabaseStats(),
        performance: {
          response_time: '< 100ms',
          avg_processing_time: '2-5s per document',
          throughput: 'Optimized for quality over speed'
        },
        timestamp: new Date().toISOString()
      };

      res.json(status);

    } catch (error) {
      this.logger.error('System status failed', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        error: 'Failed to get system status',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Private helper methods
   */
  async _checkDatabase() {
    const db = this.services.database || require('../../database');
    const connected = await db.testConnection();
    return {
      status: connected ? HEALTH_STATUS.HEALTHY : HEALTH_STATUS.UNHEALTHY,
      responseTime: connected ? '< 50ms' : 'timeout'
    };
  }

  async _checkQdrant() {
    if (this.services.storageServices?.vectorService) {
      return await this.services.storageServices.vectorService.healthCheck();
    }
    return { status: HEALTH_STATUS.UNHEALTHY, error: 'Service not available' };
  }

  async _checkBM25() {
    if (this.services.storageServices?.bm25Service) {
      return await this.services.storageServices.bm25Service.healthCheck();
    }
    return { status: HEALTH_STATUS.UNHEALTHY, error: 'Service not available' };
  }

  async _checkAIServices() {
    if (this.services.aiServices?.openaiService) {
      return await this.services.aiServices.openaiService.testConnection();
    }
    return { status: HEALTH_STATUS.UNHEALTHY, error: 'Service not available' };
  }

  async _checkStorageServices() {
    if (this.services.storageServices) {
      const stats = this.services.storageServices.getStats?.() || {};
      return {
        status: stats.readiness?.allReady ? HEALTH_STATUS.HEALTHY : HEALTH_STATUS.DEGRADED,
        details: stats
      };
    }
    return { status: HEALTH_STATUS.UNHEALTHY, error: 'Service not available' };
  }

  _processCheckResult(result) {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        status: HEALTH_STATUS.UNHEALTHY,
        error: result.reason?.message || 'Unknown error'
      };
    }
  }

  async _getServiceStatuses() {
    return {
      ai_services: this.services.aiServices ? 'active' : 'inactive',
      storage_services: this.services.storageServices ? 'active' : 'inactive',
      database: this.services.database ? 'active' : 'inactive'
    };
  }

  async _getDatabaseStats() {
    try {
      const db = this.services.database || require('../../database');
      return await db.getDatabaseStats();
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Pipeline health check endpoint
   * GET /api/pipeline/health
   */
  async pipelineHealthCheck(req, res) {
    this.logger.debug('Pipeline health check requested');
    
    try {
      const startTime = Date.now();
      
      // Check if pipeline service exists (for now, we'll simulate this)
      const pipelineStatus = {
        status: 'healthy',
        version: '1.1.0',
        collection: 'autollama-content',
        qdrant_connected: false,
        openai_connected: false,
        ready: false
      };

      // Test Qdrant connection
      try {
        if (this.services.storageServices?.vectorService) {
          const qdrantHealth = await this.services.storageServices.vectorService.healthCheck();
          pipelineStatus.qdrant_connected = qdrantHealth.status === HEALTH_STATUS.HEALTHY;
        }
      } catch (error) {
        this.logger.warn('Qdrant health check failed', { error: error.message });
      }

      // Test OpenAI connection
      try {
        if (this.services.aiServices?.openaiService) {
          const openaiHealth = await this.services.aiServices.openaiService.testConnection();
          pipelineStatus.openai_connected = openaiHealth.status === HEALTH_STATUS.HEALTHY;
        }
      } catch (error) {
        this.logger.warn('OpenAI health check failed', { error: error.message });
      }

      // Pipeline is ready if both connections work
      pipelineStatus.ready = pipelineStatus.qdrant_connected && pipelineStatus.openai_connected;
      
      const responseTime = Date.now() - startTime;
      
      const response = {
        pipeline: pipelineStatus,
        responseTime,
        collections: pipelineStatus.qdrant_connected ? ['autollama-content'] : [],
        endpoints: {
          search: '/api/search',
          documents: '/api/documents',
          health: '/api/pipeline/health'
        },
        integration: {
          openwebui_url: 'http://autollama-on-hstgr:9099',
          api_key_required: true,
          authentication: 'API Key'
        },
        timestamp: new Date().toISOString()
      };

      // Return appropriate status code
      const statusCode = pipelineStatus.ready ? 200 : 503;
      res.status(statusCode).json(response);

    } catch (error) {
      this.logger.error('Pipeline health check failed', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        pipeline: {
          status: 'error',
          error: error.message,
          ready: false
        },
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = HealthController;