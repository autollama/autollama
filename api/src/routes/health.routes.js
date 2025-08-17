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

router.get('/knowledge-base/stats', async (req, res) => {
  try {
    console.log('📊 Knowledge-base stats requested');
    const db = require('../../database');
    
    // Get database stats (this endpoint works)
    const stats = await db.getDatabaseStats();
    
    // Format for frontend compatibility
    const knowledgeBaseStats = {
      success: true,
      stats: {
        total_documents: stats.total_urls || 0,
        total_chunks: stats.total_chunks || 0,
        embedded_count: stats.embedded_count || 0,
        contextual_count: stats.contextual_count || 0,
        recent_count: stats.recent_count || 0,
        latest_content: stats.latest_content,
        postgres_size: stats.postgres_size_pretty || 'Unknown',
        qdrant_status: stats.qdrant?.status || 'unknown'
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('📊 Knowledge-base stats delivered:', knowledgeBaseStats.stats.total_documents, 'documents');
    res.json(knowledgeBaseStats);
    
  } catch (error) {
    console.error('❌ Knowledge-base stats error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch knowledge-base stats',
      details: error.message
    });
  }
});

router.get('/quick-stats', async (req, res) => {
  try {
    console.log('⚡ Quick-stats requested');
    const db = require('../../database');
    
    // Get database stats directly 
    const stats = await db.getDatabaseStats();
    
    // Format for frontend dashboard compatibility
    const quickStats = {
      success: true,
      totalDocuments: stats.total_urls || 0,
      totalChunks: stats.total_chunks || 0,
      embeddedCount: stats.embedded_count || 0,
      contextualCount: stats.contextual_count || 0,
      processingQueue: stats.active_sessions || 0,
      recentCount: stats.recent_count || 0,
      timestamp: new Date().toISOString()
    };
    
    console.log('⚡ Quick-stats delivered:', quickStats.totalDocuments, 'documents');
    res.json(quickStats);
    
  } catch (error) {
    console.error('❌ Quick-stats error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quick stats',
      details: error.message
    });
  }
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