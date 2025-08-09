/**
 * Health Monitoring Routes  
 * Handles health checks, system status, and monitoring endpoints
 */

const express = require('express');
const router = express.Router();

// Initialize controller with services (set during route setup)
let healthController = null;

/**
 * Route definitions for health monitoring:
 * 
 * GET /health - Basic health check
 * GET /health/comprehensive - Comprehensive health status
 * GET /system/status - System status overview
 * GET /pipeline/health - Pipeline health status
 * GET /knowledge-base/stats - Knowledge base statistics
 * GET /quick-stats - Quick statistics overview
 * GET /debug-test - Debug test endpoint
 */

// Controller integration (Day 7)
const HealthController = require('../controllers/health.controller');

router.get('/health', async (req, res) => {
  if (healthController) {
    return healthController.basicHealthCheck(req, res);
  }
  
  // Fallback implementation if controller not initialized
  console.log('Health endpoint called (fallback)');
  res.json({ 
    status: 'OK',
    version: '2.2.0',
    note: 'Using fallback implementation - controller not initialized',
    timestamp: new Date().toISOString()
  });
});

router.get('/health/comprehensive', async (req, res) => {
  if (healthController) {
    return healthController.comprehensiveHealthCheck(req, res);
  }
  res.status(501).json({ error: 'Controller not initialized' });
});

router.get('/system/status', async (req, res) => {
  if (healthController) {
    return healthController.systemStatus(req, res);
  }
  res.status(501).json({ error: 'Controller not initialized' });
});

router.get('/pipeline/health', async (req, res) => {
  console.log('🔍 Pipeline health check requested');
  
  try {
    const db = require('../../database');
    
    const pipelineStatus = {
      status: 'healthy',
      version: '1.1.0',
      collection: 'autollama-content',
      qdrant_connected: false,
      openai_connected: false,
      ready: false
    };

    // Test database connection
    try {
      const dbConnected = await db.testConnection();
      console.log('📊 Database connection:', dbConnected ? 'OK' : 'FAILED');
    } catch (error) {
      console.log('📊 Database connection: ERROR -', error.message);
    }

    // Check API keys from database
    try {
      const dbOpenAIKey = await db.getApiSetting('openai_api_key');
      const dbQdrantKey = await db.getApiSetting('qdrant_api_key');
      const dbQdrantUrl = await db.getApiSetting('qdrant_url');
      
      pipelineStatus.openai_connected = !!(dbOpenAIKey || process.env.OPENAI_API_KEY);
      pipelineStatus.qdrant_connected = !!(dbQdrantUrl && dbQdrantKey) || !!(process.env.QDRANT_URL && process.env.QDRANT_API_KEY);
      pipelineStatus.ready = pipelineStatus.openai_connected && pipelineStatus.qdrant_connected;
      
      console.log('🔑 API Keys - OpenAI:', pipelineStatus.openai_connected ? 'OK' : 'MISSING');
      console.log('🔑 API Keys - Qdrant:', pipelineStatus.qdrant_connected ? 'OK' : 'MISSING');
    } catch (error) {
      console.log('🔑 API Key check error:', error.message);
    }

    const response = {
      pipeline: pipelineStatus,
      responseTime: 50, // Mock response time
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

    const statusCode = pipelineStatus.ready ? 200 : 503;
    console.log('✅ Pipeline health check complete - Status:', statusCode);
    res.status(statusCode).json(response);

  } catch (error) {
    console.error('❌ Pipeline health check failed:', error.message);
    res.status(500).json({
      pipeline: {
        status: 'error',
        error: error.message,
        ready: false
      },
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/knowledge-base/stats', (req, res) => {
  res.status(501).json({ 
    error: 'Route extraction in progress',
    message: 'This endpoint will be implemented in Day 6-7 of refactoring'
  });
});

router.get('/quick-stats', (req, res) => {
  res.status(501).json({ 
    error: 'Route extraction in progress',
    message: 'This endpoint will be implemented in Day 6-7 of refactoring'
  });
});

router.get('/debug-test', (req, res) => {
  res.status(501).json({ 
    error: 'Route extraction in progress',
    message: 'This endpoint will be implemented in Day 6-7 of refactoring'
  });
});

/**
 * Initialize health routes with services
 * @param {Object} services - Service container
 */
function initializeHealthRoutes(services) {
  healthController = new HealthController(services);
}

module.exports = { router, initializeHealthRoutes };