/**
 * Integration Tests for Content Processing Endpoints
 * Tests URL processing, file uploads, and streaming endpoints
 */

const request = require('supertest');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { setupMiddlewareStack, setupErrorHandling } = require('../../middleware');
const contentRoutes = require('../../routes/content.routes');

describe('Content Processing API Integration Tests', () => {
  let app;
  let mockServices;
  let testPdfBuffer;

  beforeAll(async () => {
    // Create Express app
    app = express();
    
    // Setup middleware including file upload handling
    setupMiddlewareStack(app, {
      logging: { requestLogging: false, responseLogging: false },
      rateLimit: { default: false },
      cors: { securityHeaders: false }
    });

    // Setup multer for file uploads
    const upload = multer({ 
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
    });

    // Create test PDF buffer
    testPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\ntest content');

    // Mock services for integration testing
    mockServices = {
      contentProcessor: {
        processURL: jest.fn(),
        processFile: jest.fn(),
        getProcessingStatus: jest.fn()
      },
      sessionMonitoringService: {
        startProcessingSession: jest.fn(),
        updateProgress: jest.fn(),
        endSession: jest.fn(),
        getSessionStatus: jest.fn()
      },
      sseService: {
        setupSSE: jest.fn(),
        broadcast: jest.fn(),
        sendToClient: jest.fn()
      },
      storageService: {
        query: jest.fn(),
        getProcessingQueue: jest.fn()
      }
    };

    // Setup routes with dependency injection
    app.use('/api', contentRoutes.createRoutes(mockServices, upload));

    // Setup error handling
    setupErrorHandling(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/process-url', () => {
    test('should process URL successfully', async () => {
      const mockSessionId = 'session-123';
      const mockProcessingResult = {
        success: true,
        sessionId: mockSessionId,
        documentsCreated: 1,
        chunksProcessed: 15,
        totalTokensUsed: 2500
      };

      mockServices.sessionMonitoringService.startProcessingSession.mockResolvedValue(mockSessionId);
      mockServices.contentProcessor.processURL.mockResolvedValue(mockProcessingResult);

      const response = await request(app)
        .post('/api/process-url')
        .send({
          url: 'https://example.com/article',
          chunkSize: 1000,
          overlap: 100,
          enableContextualEmbeddings: true
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        sessionId: mockSessionId,
        message: expect.stringContaining('processing completed'),
        results: mockProcessingResult
      });

      expect(mockServices.sessionMonitoringService.startProcessingSession).toHaveBeenCalledWith(
        'https://example.com/article',
        expect.any(String),
        expect.objectContaining({
          source: 'url',
          chunkSize: 1000,
          overlap: 100
        })
      );

      expect(mockServices.contentProcessor.processURL).toHaveBeenCalledWith(
        'https://example.com/article',
        expect.objectContaining({
          sessionId: mockSessionId,
          chunkSize: 1000,
          overlap: 100,
          enableContextualEmbeddings: true
        })
      );
    });

    test('should validate URL format', async () => {
      const response = await request(app)
        .post('/api/process-url')
        .send({
          url: 'invalid-url-format',
          chunkSize: 1000
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('validation')
        })
      });
    });

    test('should apply default values for optional parameters', async () => {
      const mockSessionId = 'session-456';
      
      mockServices.sessionMonitoringService.startProcessingSession.mockResolvedValue(mockSessionId);
      mockServices.contentProcessor.processURL.mockResolvedValue({
        success: true,
        sessionId: mockSessionId
      });

      const response = await request(app)
        .post('/api/process-url')
        .send({
          url: 'https://example.com/article'
        })
        .expect(200);

      expect(mockServices.contentProcessor.processURL).toHaveBeenCalledWith(
        'https://example.com/article',
        expect.objectContaining({
          chunkSize: 1000, // Default value
          overlap: 100,    // Default value
          enableContextualEmbeddings: true // Default value
        })
      );
    });

    test('should handle processing errors gracefully', async () => {
      const mockSessionId = 'session-error';
      
      mockServices.sessionMonitoringService.startProcessingSession.mockResolvedValue(mockSessionId);
      mockServices.contentProcessor.processURL.mockResolvedValue({
        success: false,
        error: 'Failed to fetch URL content',
        sessionId: mockSessionId
      });

      const response = await request(app)
        .post('/api/process-url')
        .send({
          url: 'https://invalid-domain-that-does-not-exist.com'
        })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        sessionId: mockSessionId,
        error: expect.objectContaining({
          message: expect.stringContaining('Failed to fetch URL content')
        })
      });
    });

    test('should validate chunk size limits', async () => {
      await request(app)
        .post('/api/process-url')
        .send({
          url: 'https://example.com/article',
          chunkSize: 50 // Below minimum
        })
        .expect(400);

      await request(app)
        .post('/api/process-url')
        .send({
          url: 'https://example.com/article',
          chunkSize: 10000 // Above maximum
        })
        .expect(400);
    });
  });

  describe('POST /api/process-file', () => {
    test('should process PDF file successfully', async () => {
      const mockSessionId = 'file-session-123';
      const mockProcessingResult = {
        success: true,
        sessionId: mockSessionId,
        filename: 'test.pdf',
        documentsCreated: 1,
        chunksProcessed: 8,
        totalTokensUsed: 1200
      };

      mockServices.sessionMonitoringService.startProcessingSession.mockResolvedValue(mockSessionId);
      mockServices.contentProcessor.processFile.mockResolvedValue(mockProcessingResult);

      const response = await request(app)
        .post('/api/process-file')
        .attach('file', testPdfBuffer, 'test.pdf')
        .field('chunkSize', '1200')
        .field('overlap', '150')
        .field('enableContextualEmbeddings', 'true')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        sessionId: mockSessionId,
        message: expect.stringContaining('processing completed'),
        results: mockProcessingResult
      });

      expect(mockServices.contentProcessor.processFile).toHaveBeenCalledWith(
        expect.objectContaining({
          originalname: 'test.pdf',
          buffer: expect.any(Buffer),
          mimetype: 'application/octet-stream'
        }),
        expect.objectContaining({
          sessionId: mockSessionId,
          chunkSize: 1200,
          overlap: 150
        })
      );
    });

    test('should validate file upload', async () => {
      const response = await request(app)
        .post('/api/process-file')
        .field('chunkSize', '1000')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('File upload is required')
        })
      });
    });

    test('should validate file size', async () => {
      const largePdfBuffer = Buffer.alloc(12 * 1024 * 1024); // 12MB - larger than 10MB limit

      const response = await request(app)
        .post('/api/process-file')
        .attach('file', largePdfBuffer, 'large.pdf')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('File size exceeds')
        })
      });
    });

    test('should validate file type', async () => {
      const textBuffer = Buffer.from('This is a plain text file');

      const response = await request(app)
        .post('/api/process-file')
        .attach('file', textBuffer, 'test.exe')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('File type not allowed')
        })
      });
    });

    test('should handle file processing errors', async () => {
      const mockSessionId = 'file-error-session';
      
      mockServices.sessionMonitoringService.startProcessingSession.mockResolvedValue(mockSessionId);
      mockServices.contentProcessor.processFile.mockResolvedValue({
        success: false,
        error: 'Failed to parse PDF content',
        sessionId: mockSessionId
      });

      const response = await request(app)
        .post('/api/process-file')
        .attach('file', testPdfBuffer, 'corrupted.pdf')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.sessionId).toBe(mockSessionId);
    });
  });

  describe('POST /api/process-url-stream', () => {
    test('should setup SSE stream for URL processing', async () => {
      const mockSessionId = 'stream-session-123';
      const mockSSEConnection = {
        clientId: 'client-123',
        send: jest.fn(),
        close: jest.fn()
      };

      mockServices.sessionMonitoringService.startProcessingSession.mockResolvedValue(mockSessionId);
      mockServices.sseService.setupSSE.mockReturnValue(mockSSEConnection);
      mockServices.contentProcessor.processURL.mockImplementation(async (url, options) => {
        // Simulate processing with progress updates
        options.progressCallback?.('chunk_processed', {
          chunkIndex: 1,
          totalChunks: 5,
          progress: 20
        });
        
        return {
          success: true,
          sessionId: mockSessionId,
          documentsCreated: 1
        };
      });

      const response = await request(app)
        .post('/api/process-url-stream')
        .send({
          url: 'https://example.com/streaming-test'
        })
        .expect(200);

      // Should setup SSE connection
      expect(mockServices.sseService.setupSSE).toHaveBeenCalled();
      
      // Should start processing with progress callback
      expect(mockServices.contentProcessor.processURL).toHaveBeenCalledWith(
        'https://example.com/streaming-test',
        expect.objectContaining({
          progressCallback: expect.any(Function)
        })
      );
    });

    test('should handle streaming errors', async () => {
      const mockSessionId = 'stream-error-session';
      const mockSSEConnection = {
        clientId: 'client-error',
        send: jest.fn(),
        close: jest.fn()
      };

      mockServices.sessionMonitoringService.startProcessingSession.mockResolvedValue(mockSessionId);
      mockServices.sseService.setupSSE.mockReturnValue(mockSSEConnection);
      mockServices.contentProcessor.processURL.mockRejectedValue(
        new Error('Streaming processing failed')
      );

      await request(app)
        .post('/api/process-url-stream')
        .send({
          url: 'https://example.com/error-test'
        })
        .expect(200); // SSE connection still established

      // Should send error event
      expect(mockSSEConnection.send).toHaveBeenCalledWith(
        'error_occurred',
        expect.objectContaining({
          error: expect.stringContaining('Streaming processing failed')
        })
      );
    });
  });

  describe('POST /api/process-file-stream', () => {
    test('should setup SSE stream for file processing', async () => {
      const mockSessionId = 'file-stream-session';
      const mockSSEConnection = {
        clientId: 'file-client-123',
        send: jest.fn(),
        close: jest.fn()
      };

      mockServices.sessionMonitoringService.startProcessingSession.mockResolvedValue(mockSessionId);
      mockServices.sseService.setupSSE.mockReturnValue(mockSSEConnection);
      mockServices.contentProcessor.processFile.mockImplementation(async (file, options) => {
        // Simulate processing progress
        options.progressCallback?.('embedding_created', {
          chunkIndex: 3,
          totalChunks: 10,
          progress: 30
        });
        
        return {
          success: true,
          sessionId: mockSessionId,
          filename: file.originalname
        };
      });

      await request(app)
        .post('/api/process-file-stream')
        .attach('file', testPdfBuffer, 'stream-test.pdf')
        .expect(200);

      expect(mockServices.sseService.setupSSE).toHaveBeenCalled();
      expect(mockServices.contentProcessor.processFile).toHaveBeenCalledWith(
        expect.objectContaining({
          originalname: 'stream-test.pdf'
        }),
        expect.objectContaining({
          progressCallback: expect.any(Function)
        })
      );
    });
  });

  describe('GET /api/processing/status/:sessionId', () => {
    test('should return processing status for valid session', async () => {
      const sessionId = 'status-test-session';
      const mockStatus = {
        success: true,
        session: {
          session_id: sessionId,
          status: 'processing',
          processed_chunks: 3,
          total_chunks: 8,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        isActive: true,
        progress: 37.5
      };

      mockServices.sessionMonitoringService.getSessionStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get(`/api/processing/status/${sessionId}`)
        .expect(200);

      expect(response.body).toMatchObject(mockStatus);
      expect(mockServices.sessionMonitoringService.getSessionStatus).toHaveBeenCalledWith(sessionId);
    });

    test('should handle non-existent session', async () => {
      const sessionId = 'nonexistent-session';
      
      mockServices.sessionMonitoringService.getSessionStatus.mockResolvedValue({
        success: false,
        error: 'Session not found'
      });

      const response = await request(app)
        .get(`/api/processing/status/${sessionId}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('Session not found')
        })
      });
    });

    test('should validate session ID format', async () => {
      const invalidSessionId = 'invalid-session-format!@#';

      await request(app)
        .get(`/api/processing/status/${invalidSessionId}`)
        .expect(400);
    });
  });

  describe('GET /api/processing/queue', () => {
    test('should return processing queue status', async () => {
      const mockQueueData = {
        active: [
          {
            session_id: 'active-1',
            status: 'processing',
            progress: 45,
            started_at: new Date().toISOString()
          }
        ],
        waiting: [
          {
            session_id: 'waiting-1',
            status: 'pending',
            queued_at: new Date().toISOString()
          }
        ],
        completed: [
          {
            session_id: 'completed-1',
            status: 'completed',
            completed_at: new Date().toISOString()
          }
        ],
        failed: []
      };

      mockServices.storageService.getProcessingQueue.mockResolvedValue(mockQueueData);

      const response = await request(app)
        .get('/api/processing/queue')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        queue: mockQueueData,
        summary: {
          active: 1,
          waiting: 1,
          completed: 1,
          failed: 0,
          total: 3
        }
      });
    });
  });

  describe('Error handling and edge cases', () => {
    test('should handle concurrent processing requests', async () => {
      const mockSessionId = 'concurrent-session';
      
      mockServices.sessionMonitoringService.startProcessingSession.mockResolvedValue(mockSessionId);
      mockServices.contentProcessor.processURL.mockImplementation(
        () => new Promise(resolve => {
          setTimeout(() => resolve({ success: true, sessionId: mockSessionId }), 100);
        })
      );

      const requests = Array(3).fill().map(() => 
        request(app)
          .post('/api/process-url')
          .send({ url: 'https://example.com/concurrent' })
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    test('should handle session service unavailability', async () => {
      mockServices.sessionMonitoringService.startProcessingSession.mockRejectedValue(
        new Error('Session service unavailable')
      );

      const response = await request(app)
        .post('/api/process-url')
        .send({ url: 'https://example.com/session-error' })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('Session service unavailable')
        })
      });
    });

    test('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/api/process-url')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('Invalid JSON')
        })
      });
    });
  });

  describe('Rate limiting and security', () => {
    test('should apply rate limiting to processing endpoints', async () => {
      mockServices.sessionMonitoringService.startProcessingSession.mockResolvedValue('rate-test');
      mockServices.contentProcessor.processURL.mockResolvedValue({ success: true });

      // Make multiple rapid requests
      const requests = Array(3).fill().map(() => 
        request(app)
          .post('/api/process-url')
          .send({ url: 'https://example.com/rate-test' })
      );

      const responses = await Promise.all(requests);
      
      // Should either succeed or be rate limited
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });

    test('should sanitize file names', async () => {
      const mockSessionId = 'sanitize-session';
      
      mockServices.sessionMonitoringService.startProcessingSession.mockResolvedValue(mockSessionId);
      mockServices.contentProcessor.processFile.mockResolvedValue({
        success: true,
        sessionId: mockSessionId
      });

      await request(app)
        .post('/api/process-file')
        .attach('file', testPdfBuffer, '../../../malicious.pdf')
        .expect(200);

      const fileArg = mockServices.contentProcessor.processFile.mock.calls[0][0];
      expect(fileArg.sanitizedName).not.toContain('../');
    });
  });
});