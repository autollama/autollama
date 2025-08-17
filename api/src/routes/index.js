/**
 * Routes Index
 * Aggregates and configures all API route modules
 */

const express = require('express');
const { logger } = require('../utils/logger');

// Import route modules
const { createRoutes: createContentRoutes } = require('./content.routes');
const { createRoutes: createSearchRoutes } = require('./search.routes');
const { router: healthRoutes, initializeHealthRoutes } = require('./health.routes');
const { createRoutes: createSessionRoutes } = require('./session.routes');
const settingsRoutes = require('./settings.routes');
const pipelineRoutes = require('./pipeline.routes');
const docsRoutes = require('./docs.routes');
const openwebuiRoutes = require('./openwebui.routes');
const { router: chatRoutes, initializeChatRoutes } = require('./chat.routes');
const uploadRoutes = require('./upload.routes');

/**
 * Setup all API routes with proper prefixes
 * @param {Express} app - Express application instance
 * @param {Object} services - Initialized services container
 */
function setupRoutes(app, services) {
  const routeLogger = logger.child({ component: 'routes' });
  
  // Make services available to all routes via app context
  app.set('services', services);
  
  try {
    console.log('🚀 Starting route setup process...');
    routeLogger.info('Setting up API routes...');

    // Initialize controllers with services
    console.log('🚀 Initializing health routes...');
    initializeHealthRoutes(services);
    console.log('🚀 Health routes initialized');
    
    console.log('🚀 Initializing chat routes...');
    initializeChatRoutes(services);
    console.log('🚀 Chat routes initialized');
    routeLogger.debug('Controllers initialized with services');

    // Create content routes with services and upload middleware
    // Configure multer for file uploads (memory storage for background queue)
    const multer = require('multer');
    const upload = multer({ 
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
        files: 1
      }
    });
    console.log('🔧 About to create content routes...');
    console.log('🔧 createContentRoutes type:', typeof createContentRoutes);
    console.log('🔧 services type:', typeof services);
    console.log('🔧 upload type:', typeof upload);
    
    let contentRoutes;
    try {
      contentRoutes = createContentRoutes(services, upload);
      console.log('🔧 Content routes created successfully. Multer configured:', !!upload);
      console.log('🔧 Content routes type:', typeof contentRoutes);
      console.log('🔧 Content routes stack:', contentRoutes.stack?.map(layer => layer.route?.path || 'middleware'));
      routeLogger.debug('Content routes created with services');
    } catch (error) {
      console.error('❌ Content routes creation failed:', error.message);
      console.error('❌ Stack:', error.stack);
      throw error;
    }

    // Create session routes with backgroundQueue service
    console.log('🔧 Creating session routes with backgroundQueue:', !!services.backgroundQueue);
    const sessionRoutes = createSessionRoutes({
      backgroundQueue: services.backgroundQueue
    });
    console.log('🔧 Session routes created:', !!sessionRoutes);

    // Create search routes with services (fix for document listing)
    // Use the existing database.js functions as storageService
    const db = require('../../database');
    console.log('🔧 DEBUG: db object keys:', Object.keys(db || {}));
    console.log('🔧 DEBUG: db type:', typeof db);
    console.log('🔧 DEBUG: getSmartContentMix available:', typeof (db && db.getSmartContentMix));
    const storageServiceAdapter = {
      getDocuments: async (options = {}) => {
        console.log('🔍 ADAPTER: storageServiceAdapter.getDocuments called with options:', options);
        console.log('🔍 ADAPTER: db object type:', typeof db);
        console.log('🔍 ADAPTER: db.getSmartContentMix type:', typeof db.getSmartContentMix);
        const { limit = 20, offset = 0 } = options;
        // Use getSmartContentMix but only return unique documents (1 per URL)
        const result = await db.getSmartContentMix();
        const documents = result.records || [];
        console.log('🔍 getSmartContentMix returned', documents.length, 'documents');
        console.log('🔍 First 3 documents:', documents.slice(0,3).map(d => ({title: d.title?.substring(0,30), created_time: d.created_time})));
        
        // Apply pagination
        const startIndex = offset;
        const endIndex = offset + limit;
        const paginatedDocs = documents.slice(startIndex, endIndex);
        console.log('🔍 After pagination:', paginatedDocs.length, 'documents');
        console.log('🔍 Paginated docs:', paginatedDocs.map(d => ({title: d.title?.substring(0,30), created_time: d.created_time})));
        
        return {
          rows: paginatedDocs,
          totalCount: documents.length
        };
      },
      getDocumentChunks: async (url, options = {}) => {
        console.log('🔧 SERVICE ADAPTER getDocumentChunks called with:', { url, options });
        try {
          const { page = 1, limit = 100 } = options;
          // Use the working database.js function directly
          const result = await db.getDocumentChunks(url, page, limit);
          console.log('🔧 SERVICE ADAPTER successfully got', result.chunks.length, 'chunks');
          return {
            rows: result.chunks,
            totalCount: result.pagination.total
          };
        } catch (error) {
          console.error('🔧 SERVICE ADAPTER error:', error);
          return { rows: [], totalCount: 0 };
        }
      },
      query: async (sql, params) => {
        return await db.pool.query(sql, params);
      }
    };
    
    // Create a simple searchService using existing database functions
    const searchService = {
      // Hybrid search - for now, use the same as regular search
      hybridSearch: async ({ query, limit = 20, threshold = 0.7 }) => {
        const results = await db.searchContent(query.trim(), limit);
        return { results };
      },
      
      // Vector search - use database search as fallback
      vectorSearch: async ({ query, limit = 20, threshold = 0.7 }) => {
        const results = await db.searchContent(query.trim(), limit);
        return { results };
      },
      
      // Regular search
      search: async ({ query, limit = 20 }) => {
        const results = await db.searchContent(query.trim(), limit);
        return { results };
      },
      
      // Grouped search
      groupedSearch: async ({ query, limit = 20 }) => {
        const results = await db.searchContentGrouped(query.trim(), limit);
        return { groups: results };
      }
    };

    console.log('🔧 CREATING SEARCH ROUTES with storageServiceAdapter!');
    const searchRoutes = createSearchRoutes({
      storageService: storageServiceAdapter,
      searchService: searchService,
      vectorService: services.vectorService || {}
    });
    console.log('🔧 SEARCH ROUTES CREATED!');
    routeLogger.debug('Search routes created with services');

    // API route prefix middleware
    const apiRouter = express.Router();

    // Basic health routes (no /api prefix for basic health check)
    app.get('/health', (req, res) => {
      res.send('healthy');
    });
    routeLogger.debug('Basic health route mounted at /health');

    // Favicon serving route (serves custom favicon if uploaded)
    app.get('/favicon.ico', (req, res) => {
      const fs = require('fs');
      const path = require('path');
      
      // Try to serve custom favicon first
      const customFaviconPath = '/app/uploads/favicon.ico';
      
      if (fs.existsSync(customFaviconPath)) {
        res.setHeader('Content-Type', 'image/x-icon');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        res.sendFile(customFaviconPath);
      } else {
        // Return 404 if no custom favicon (browser will use default)
        res.status(404).send('Favicon not found');
      }
    });
    routeLogger.debug('Favicon serving route mounted at /favicon.ico');

    // All other routes under /api prefix
    // OpenWebUI pipeline routes (mount early to avoid conflicts)
    apiRouter.use('/openwebui', openwebuiRoutes);
    
    // Upload routes for chunked uploads
    console.log('🔧 Mounting upload routes...');
    apiRouter.use('/upload', uploadRoutes);
    console.log('✅ Upload routes mounted successfully');
    
    // Session routes first to ensure /in-progress is handled correctly
    apiRouter.use('/', sessionRoutes);
    apiRouter.use('/', searchRoutes);
    apiRouter.use('/', contentRoutes);
    apiRouter.use('/chat', chatRoutes);
    // Initialize settings routes with services
    console.log('🔧 About to initialize settings routes with services:', !!services, typeof settingsRoutes.initializeSettingsRoutes);
    settingsRoutes.initializeSettingsRoutes(services);
    console.log('🔧 Settings routes initialization call completed');
    apiRouter.use('/', settingsRoutes);
    apiRouter.use('/', pipelineRoutes);
    apiRouter.use('/', healthRoutes);

    // Documentation routes (serve at root level for convenience)
    app.use('/', docsRoutes);

    // Mount API router with /api prefix
    app.use('/api', apiRouter);

    // Route documentation endpoint
    app.get('/api', (req, res) => {
      res.json({
        message: 'AutoLlama API v2.1',
        documentation: '/docs',
        interactiveApiExplorer: '/docs',
        openApiSpec: '/api/openapi.json',
        version: '2.2.0',
        routes: {
          content: {
            prefix: '/api',
            endpoints: [
              'POST /process-url-stream',
              'POST /process-url',
              'POST /process-file-stream',
              'POST /process-file',
              'POST /process-ai-content',
              'POST /resume-upload/:sessionId',
              'POST /pre-upload-check'
            ]
          },
          search: {
            prefix: '/api',
            endpoints: [
              'GET /search',
              'GET /search/grouped',
              'GET /documents',
              'GET /document-chunks',
              'GET /document/*/chunks',
              'GET /document/:encodedUrl/summary',
              'GET /chunks',
              'GET /record',
              'GET /recent-records',
              'GET /qdrant/activity',
              'GET /database/stats'
            ]
          },
          health: {
            prefix: '/',
            endpoints: [
              'GET /health',
              'GET /api/health/comprehensive',
              'GET /api/system/status',
              'GET /api/pipeline/health',
              'GET /api/knowledge-base/stats',
              'GET /api/quick-stats',
              'GET /api/debug-test'
            ]
          },
          session: {
            prefix: '/api',
            endpoints: [
              'GET /in-progress',
              'GET /upload-progress/:uploadId',
              'GET /cleanup-status',
              'GET /upload-sessions/check-stuck',
              'POST /cleanup-sessions',
              'POST /cleanup-sessions/advanced',
              'POST /upload-sessions/cleanup-stuck'
            ]
          },
          settings: {
            prefix: '/api',
            endpoints: [
              'GET /settings',
              'POST /settings',
              'GET /settings/:key'
            ]
          },
          pipeline: {
            prefix: '/api',
            endpoints: [
              'GET /pipeline/download',
              'GET /stream'
            ]
          },
          chat: {
            prefix: '/api/chat',
            endpoints: [
              'POST /message',
              'GET /conversation/:conversationId',
              'GET /conversations',
              'DELETE /conversation/:conversationId',
              'GET /stats',
              'POST /rag-search',
              'POST /pipeline',
              'GET /pipeline/status'
            ]
          },
          openwebui: {
            prefix: '/api/openwebui',
            endpoints: [
              'GET /pipelines',
              'POST /pipeline/:id/execute',
              'GET /pipeline/:id/config',
              'GET /health'
            ]
          },
          documentation: {
            prefix: '/',
            endpoints: [
              'GET /docs',
              'GET /api/openapi.json',
              'GET /api/openapi.yaml',
              'GET /api/docs/health'
            ]
          }
        },
        status: 'Refactoring complete - Day 14',
        note: 'API documentation and OpenAPI specs available'
      });
    });

    // 404 handler for unmatched API routes
    app.use('/api/*', (req, res) => {
      const isOpenWebUIRequest = req.headers['user-agent']?.includes('openwebui') || 
                                 req.headers['authorization']?.includes('0p3n-w3bu') ||
                                 req.url.includes('openwebui') ||
                                 req.url.includes('chat/completions') ||
                                 req.url.includes('models');
      
      if (isOpenWebUIRequest) {
        console.log('🚨 OpenWebUI 404 ERROR:', {
          method: req.method,
          url: req.url,
          originalUrl: req.originalUrl,
          path: req.path,
          headers: {
            authorization: req.headers.authorization ? `${req.headers.authorization.substring(0, 20)}...` : 'none',
            'user-agent': req.headers['user-agent']?.substring(0, 100)
          }
        });
      }
      
      routeLogger.warn('API route not found', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent')
      });

      res.status(404).json({
        error: 'API endpoint not found',
        method: req.method,
        url: req.url,
        availableRoutes: '/api',
        timestamp: new Date().toISOString()
      });
    });

    routeLogger.info('All API routes configured successfully', {
      totalRouteModules: 7,
      routeModules: ['content', 'search', 'health', 'session', 'settings', 'pipeline', 'docs']
    });

  } catch (error) {
    routeLogger.error('Failed to setup routes', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get route statistics
 * @returns {Object} Route statistics
 */
function getRouteStats() {
  return {
    totalModules: 7,
    modules: {
      content: { endpoints: 7, status: 'extracted' },
      search: { endpoints: 10, status: 'extracted' },
      health: { endpoints: 7, status: 'extracted' },
      session: { endpoints: 7, status: 'extracted' },
      settings: { endpoints: 3, status: 'extracted' },
      pipeline: { endpoints: 2, status: 'extracted' },
      docs: { endpoints: 4, status: 'implemented' }
    },
    totalEndpoints: 40,
    implementationStatus: 'complete_with_documentation'
  };
}

module.exports = {
  setupRoutes,
  getRouteStats
};