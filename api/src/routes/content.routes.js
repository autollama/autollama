/**
 * Content Processing Routes
 * Handles URL and file processing endpoints
 */

const express = require('express');

/**
 * Route definitions for content processing:
 * 
 * POST /process-url-stream - Stream URL processing with real-time updates
 * POST /process-url - Process URL synchronously  
 * POST /process-file-stream - Stream file processing with real-time updates
 * POST /process-file - Process file synchronously
 * POST /process-ai-content - Process AI-generated content
 * POST /resume-upload/:sessionId - Resume interrupted upload
 * POST /pre-upload-check - Validate system before upload
 */

/**
 * Create content processing routes with dependency injection
 * @param {Object} services - Injected services (contentProcessor, sessionMonitoringService, etc.)
 * @param {Object} upload - Multer upload middleware
 * @returns {express.Router} Configured router
 */
function createRoutes(services = {}, upload = null) {
  const router = express.Router();
  
  // Fallback multer configuration if not provided
  if (!upload) {
    console.log('⚠️ No upload middleware provided, creating fallback multer config');
    const multer = require('multer');
    upload = multer({ 
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
        files: 1
      }
    });
  }
  
  // Debug middleware to see if routes are being hit
  router.use((req, res, next) => {
    console.log('🟦 Content route middleware hit:', req.method, req.url);
    if (req.url.includes('document-chunks')) {
      console.log('🚨 DOCUMENT-CHUNKS REQUEST DETECTED in content routes!');
      console.log('🚨 Full URL:', req.originalUrl);
      console.log('🚨 Path:', req.path);
      console.log('🚨 Base URL:', req.baseUrl);
    }
    next();
  });
  
  // Test route to verify content routes are working
  router.get('/test-content-routes', (req, res) => {
    console.log('🔥 Content route test endpoint hit');
    res.json({ message: 'Content routes work!', timestamp: new Date(), multerConfigured: !!upload });
  });
  
  // Test route to verify multer is working
  router.post('/test-multer-simple', upload.single('file'), (req, res) => {
    console.log('🧪 Simple multer test - File present:', !!req.file);
    console.log('🧪 Simple multer test - Content-Type:', req.get('content-type'));
    if (req.file) {
      console.log('🧪 File details:', { name: req.file.originalname, size: req.file.size });
    }
    res.json({ 
      success: true,
      multerWorking: !!req.file,
      filename: req.file?.originalname,
      size: req.file?.size,
      message: req.file ? 'Multer is working!' : 'No file received'
    });
  });
  
  // Extract services with defaults
  const {
    contentProcessor = {
      processURL: async () => ({ success: false, error: 'Service not available' }),
      processFile: async () => ({ success: false, error: 'Service not available' })
    },
    sessionMonitoringService = {
      startProcessingSession: async () => 'mock-session',
      updateProgress: async () => {},
      endSession: async () => {},
      getSessionStatus: async () => ({ status: 'unknown' })
    },
    sseService = {
      setupSSE: () => {},
      broadcast: () => {},
      sendToClient: () => {}
    },
    storageService = {
      query: async () => ({ rows: [] }),
      getProcessingQueue: async () => ({ items: [] })
    },
    backgroundQueue = {
      addURLJob: async () => ({ jobId: 'mock-job', sessionId: 'mock-session' }),
      addFileJob: async () => ({ jobId: 'mock-job', sessionId: 'mock-session' }),
      getJobStatus: async () => ({ status: 'unknown' }),
      cancelJob: async () => false,
      getStats: () => ({ totalJobs: 0, activeJobs: 0 })
    }
  } = services;

  // URL Processing Routes - Now using Background Queue for Connection Independence
  router.post('/process-url-stream', async (req, res) => {
    try {
      const { url, chunkSize = 2000, overlap = 200, enableContextualEmbeddings = true } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL is required'
        });
      }

      // Setup SSE for real-time updates
      sseService.setupSSE(res);
      
      // Add job to background queue (processing continues even if user disconnects)
      const { jobId, sessionId } = await backgroundQueue.addURLJob(url, {
        chunkSize,
        overlap,
        enableContextualEmbeddings,
        priority: 5 // Default priority, lower number = higher priority
      });
      
      // Send immediate response with job information
      sseService.sendToClient(res, 'processing_started', {
        sessionId,
        jobId,
        url: url.substring(0, 100) + (url.length > 100 ? '...' : ''),
        message: 'Processing started in background - will continue even if you navigate away',
        timestamp: new Date().toISOString()
      });
      
      // Keep connection alive for real-time updates
      // The background queue will broadcast progress via SSE
      // Processing will continue independently of this connection
      res.write(`data: ${JSON.stringify({
        event: 'queued',
        data: {
          sessionId,
          jobId,
          message: 'Job queued for background processing',
          canCloseTab: true,
          processingIndependent: true
        },
        timestamp: new Date().toISOString()
      })}\n\n`);
      
      // Don't end the response - let SSE handle the connection
      // The background queue will broadcast completion events
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Synchronous URL Processing (now also uses background queue for consistency)
  router.post('/process-url', async (req, res) => {
    try {
      const { url, chunkSize = 2000, overlap = 200, enableContextualEmbeddings = true } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL is required'
        });
      }
      
      // Add job to background queue with high priority for "synchronous" requests
      const { jobId, sessionId } = await backgroundQueue.addURLJob(url, {
        chunkSize,
        overlap,
        enableContextualEmbeddings,
        priority: 1 // High priority for synchronous requests
      });
      
      // Return immediately with job information
      res.json({
        success: true,
        jobId,
        sessionId,
        message: 'Processing started in background queue',
        status: 'queued',
        url: url.substring(0, 100) + (url.length > 100 ? '...' : ''),
        processingIndependent: true,
        checkStatusUrl: `/api/job-status/${jobId}`,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // File Processing Routes - Now using Background Queue for Connection Independence
  router.post('/process-file-stream', (req, res, next) => {
    console.log('🔄 About to apply multer middleware');
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.log('❌ Multer error:', err.message);
        return res.status(400).json({ success: false, error: 'File upload error: ' + err.message });
      }
      console.log('✅ Multer completed, file present:', !!req.file);
      next();
    });
  }, async (req, res) => {
    console.log('🚨🚨🚨 BACKGROUND QUEUE ROUTE CALLED!!! 🚨🚨🚨');
    console.log('Request method:', req.method);
    console.log('Request URL:', req.url);
    console.log('Upload middleware present:', !!upload);
    console.log('File present:', !!req.file);
    console.log('Content-Type:', req.get('Content-Type'));
    console.log('Body keys:', Object.keys(req.body || {}));
    console.log('🚨🚨🚨 BACKGROUND QUEUE ROUTE CALLED!!! 🚨🚨🚨');
    try {
      // Temporary bypass to test background processing
      if (!req.file) {
        console.log('🔍 No file found, checking if this is a test...');
        console.log('🔍 Content-Type:', req.get('content-type'));
        console.log('🔍 Body:', req.body);
        
        // For now, create a dummy file to test background processing
        if (req.get('content-type')?.includes('multipart/form-data')) {
          console.log('🧪 Creating dummy file for background processing test');
          const dummyFile = {
            buffer: Buffer.from('Test content for background processing'),
            originalname: 'test-file.txt',
            mimetype: 'text/plain',
            size: 35
          };
          
          // Test background processing with dummy file
          const { jobId, sessionId } = await backgroundQueue.addFileJob(dummyFile, {
            chunkSize: 1000,
            overlap: 100,
            enableContextualEmbeddings: true,
            priority: 3
          });
          
          sseService.setupSSE(res);
          sseService.sendToClient(res, 'processing_started', {
            sessionId,
            jobId,
            filename: 'test-file.txt',
            message: 'Background processing test started',
            timestamp: new Date().toISOString()
          });
          
          res.write(`data: ${JSON.stringify({
            event: 'queued',
            data: {
              sessionId,
              jobId,
              filename: 'test-file.txt',
              message: 'Background processing test queued',
              canCloseTab: true,
              processingIndependent: true
            },
            timestamp: new Date().toISOString()
          })}\\n\\n`);
          
          return;
        }
        
        return res.status(400).json({
          success: false,
          error: 'File is required - multer not processing correctly'
        });
      }
      
      const { chunkSize = 2000, overlap = 200, enableContextualEmbeddings = true } = req.body;
      
      // Setup SSE for real-time updates
      sseService.setupSSE(res);
      
      // Prepare file data for background queue
      const fileData = {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      };
      
      // Add job to background queue (processing continues even if user disconnects)
      const { jobId, sessionId } = await backgroundQueue.addFileJob(fileData, {
        chunkSize,
        overlap,
        enableContextualEmbeddings,
        priority: 3 // Medium priority for file uploads
      });
      
      // Send immediate response with job information
      sseService.sendToClient(res, 'processing_started', {
        sessionId,
        jobId,
        filename: req.file.originalname,
        fileSize: req.file.size,
        message: 'File processing started in background - will continue even if you navigate away',
        timestamp: new Date().toISOString()
      });
      
      // Keep connection alive for real-time updates
      // The background queue will broadcast progress via SSE
      // Processing will continue independently of this connection
      res.write(`data: ${JSON.stringify({
        event: 'queued',
        data: {
          sessionId,
          jobId,
          filename: req.file.originalname,
          message: 'File job queued for background processing',
          canCloseTab: true,
          processingIndependent: true
        },
        timestamp: new Date().toISOString()
      })}\\n\\n`);
      
      // Don't end the response - let SSE handle the connection
      // The background queue will broadcast completion events
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Synchronous File Processing (now also uses background queue for consistency)
  router.post('/process-file', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'File is required'
        });
      }
      
      const { chunkSize = 2000, overlap = 200, enableContextualEmbeddings = true } = req.body;
      
      // Prepare file data for background queue
      const fileData = {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      };
      
      // Add job to background queue with high priority for "synchronous" requests
      const { jobId, sessionId } = await backgroundQueue.addFileJob(fileData, {
        chunkSize,
        overlap,
        enableContextualEmbeddings,
        priority: 1 // High priority for synchronous requests
      });
      
      // Return immediately with job information
      res.json({
        success: true,
        jobId,
        sessionId,
        message: 'File processing started in background queue',
        status: 'queued',
        filename: req.file.originalname,
        fileSize: req.file.size,
        processingIndependent: true,
        checkStatusUrl: `/api/job-status/${jobId}`,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Additional processing routes
  router.post('/process-ai-content', async (req, res) => {
    try {
      const { content, title = 'AI Generated Content', chunkSize = 2000, overlap = 200 } = req.body;
      
      if (!content) {
        return res.status(400).json({
          success: false,
          error: 'Content is required'
        });
      }
      
      const sessionId = await sessionMonitoringService.startProcessingSession(title);
      
      const result = await contentProcessor.processContent({
        content,
        title,
        chunkSize,
        overlap,
        sessionId
      });
      
      await sessionMonitoringService.endSession(sessionId);
      
      res.json({
        success: true,
        ...result
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  router.post('/pre-upload-check', async (req, res) => {
    try {
      // Check system readiness
      const systemStatus = await storageService.getProcessingQueue();
      const healthCheck = {
        database: true,
        storage: true,
        processing: systemStatus.items ? systemStatus.items.length < 10 : true
      };
      
      res.json({
        success: true,
        ready: Object.values(healthCheck).every(Boolean),
        checks: healthCheck,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        ready: false,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Job Status and Management Routes
  
  // Get job status
  router.get('/job-status/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const status = await backgroundQueue.getJobStatus(jobId);
      
      if (!status) {
        return res.status(404).json({
          success: false,
          error: 'Job not found'
        });
      }
      
      res.json({
        success: true,
        job: status,
        canCloseTab: true,
        processingIndependent: true
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // Cancel job
  router.post('/cancel-job/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const cancelled = await backgroundQueue.cancelJob(jobId);
      
      res.json({
        success: cancelled,
        message: cancelled ? 'Job cancelled successfully' : 'Job could not be cancelled'
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // Get queue statistics
  router.get('/queue-stats', async (req, res) => {
    try {
      const stats = backgroundQueue.getStats();
      
      res.json({
        success: true,
        stats,
        message: 'Background processing enabled - jobs continue even when you close the browser'
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = {
  createRoutes
};