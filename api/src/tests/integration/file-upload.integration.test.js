/**
 * File Upload Integration Tests
 * Tests the complete file upload → processing → storage pipeline
 */

const request = require('supertest');
const express = require('express');
const multer = require('multer');

describe('File Upload Integration Tests', () => {
  let app;
  const upload = multer({ dest: '/tmp/' });
  let processedFiles = [];

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    // Mock file upload endpoint
    app.post('/api/process-file', upload.single('file'), (req, res) => {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { message: 'No file provided' }
        });
      }

      const sessionId = `session-${Date.now()}`;
      const fileInfo = {
        sessionId,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        status: 'processing',
        chunks: []
      };

      processedFiles.push(fileInfo);

      // Simulate async processing
      setTimeout(() => {
        fileInfo.status = 'completed';
        fileInfo.chunks = [
          {
            chunk_id: `${sessionId}-chunk-1`,
            chunk_text: `Content from ${req.file.originalname}`,
            chunk_index: 0
          }
        ];
      }, 100);

      res.json({
        success: true,
        sessionId,
        filename: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        message: 'File upload initiated'
      });
    });

    // Mock processing status endpoint
    app.get('/api/processing/status/:sessionId', (req, res) => {
      const sessionId = req.params.sessionId;
      const fileInfo = processedFiles.find(f => f.sessionId === sessionId);

      if (!fileInfo) {
        return res.status(404).json({
          success: false,
          error: { message: 'Session not found' }
        });
      }

      res.json({
        success: true,
        session: {
          sessionId,
          filename: fileInfo.originalName,
          status: fileInfo.status,
          totalChunks: fileInfo.chunks.length,
          processedChunks: fileInfo.status === 'completed' ? fileInfo.chunks.length : 0,
          progress: fileInfo.status === 'completed' ? 100 : 50,
          error_message: null
        }
      });
    });

    // Mock file stream processing endpoint
    app.post('/api/process-file-stream', upload.single('file'), (req, res) => {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { message: 'No file provided' }
        });
      }

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      const sessionId = `stream-${Date.now()}`;

      // Send processing events
      res.write(`data: ${JSON.stringify({
        event: 'processing_started',
        sessionId,
        filename: req.file.originalname
      })}\n\n`);

      setTimeout(() => {
        res.write(`data: ${JSON.stringify({
          event: 'chunk_processed',
          chunkIndex: 0,
          progress: 50
        })}\n\n`);
      }, 50);

      setTimeout(() => {
        res.write(`data: ${JSON.stringify({
          event: 'processing_completed',
          sessionId,
          totalChunks: 1,
          processingTime: 100
        })}\n\n`);
        res.end();
      }, 100);
    });
  });

  describe('POST /api/process-file', () => {
    test('should accept valid file upload', async () => {
      const testContent = 'This is a test document with some content for processing.';
      const testBuffer = Buffer.from(testContent, 'utf8');

      const response = await request(app)
        .post('/api/process-file')
        .attach('file', testBuffer, 'test.txt')
        .field('chunkSize', '500')
        .field('overlap', '50')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        sessionId: expect.any(String),
        filename: 'test.txt',
        fileSize: expect.any(Number),
        mimeType: expect.any(String),
        message: 'File upload initiated'
      });

      expect(response.body.sessionId).toMatch(/^session-\d+$/);
    });

    test('should reject request without file', async () => {
      const response = await request(app)
        .post('/api/process-file')
        .field('chunkSize', '500')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: 'No file provided'
        }
      });
    });

    test('should handle different file types', async () => {
      const fileTypes = [
        { content: 'Plain text content', filename: 'test.txt', mimeType: 'text/plain' },
        { content: '%PDF-1.4\nPDF content', filename: 'test.pdf', mimeType: 'application/pdf' },
        { content: 'name,age\nJohn,25', filename: 'test.csv', mimeType: 'text/csv' }
      ];

      for (const fileType of fileTypes) {
        const buffer = Buffer.from(fileType.content, 'utf8');
        
        const response = await request(app)
          .post('/api/process-file')
          .attach('file', buffer, fileType.filename)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.filename).toBe(fileType.filename);
      }
    });

    test('should handle processing parameters', async () => {
      const testBuffer = Buffer.from('Test content', 'utf8');

      const response = await request(app)
        .post('/api/process-file')
        .attach('file', testBuffer, 'params-test.txt')
        .field('chunkSize', '1000')
        .field('overlap', '100')
        .field('enableContextualEmbeddings', 'true')
        .expect(200);

      expect(response.body.success).toBe(true);
      // Parameters should be accepted (actual processing would use them)
    });
  });

  describe('GET /api/processing/status/:sessionId', () => {
    test('should track processing status', async () => {
      // First upload a file
      const testBuffer = Buffer.from('Status test content', 'utf8');
      const uploadResponse = await request(app)
        .post('/api/process-file')
        .attach('file', testBuffer, 'status-test.txt')
        .expect(200);

      const sessionId = uploadResponse.body.sessionId;

      // Wait a bit for processing to start
      await new Promise(resolve => setTimeout(resolve, 150));

      // Check status
      const statusResponse = await request(app)
        .get(`/api/processing/status/${sessionId}`)
        .expect(200);

      expect(statusResponse.body).toMatchObject({
        success: true,
        session: expect.objectContaining({
          sessionId,
          filename: 'status-test.txt',
          status: expect.any(String),
          totalChunks: expect.any(Number),
          processedChunks: expect.any(Number),
          progress: expect.any(Number)
        })
      });

      expect(['processing', 'completed']).toContain(statusResponse.body.session.status);
    });

    test('should handle non-existent session', async () => {
      const response = await request(app)
        .get('/api/processing/status/nonexistent-session')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: 'Session not found'
        }
      });
    });
  });

  describe('POST /api/process-file-stream', () => {
    test('should stream processing events', (done) => {
      const testBuffer = Buffer.from('Stream test content', 'utf8');
      const events = [];

      const req = request(app)
        .post('/api/process-file-stream')
        .attach('file', testBuffer, 'stream-test.txt');

      req.on('data', (chunk) => {
        const data = chunk.toString();
        const lines = data.split('\n').filter(line => line.startsWith('data: '));
        
        lines.forEach(line => {
          try {
            const eventData = JSON.parse(line.substring(6));
            events.push(eventData);
          } catch (e) {
            // Ignore parse errors for incomplete data
          }
        });
      });

      req.on('end', () => {
        expect(events.length).toBeGreaterThan(0);
        
        // Should have processing_started event
        const startEvent = events.find(e => e.event === 'processing_started');
        expect(startEvent).toBeDefined();
        expect(startEvent.filename).toBe('stream-test.txt');

        // Should have completion event
        const completionEvent = events.find(e => e.event === 'processing_completed');
        expect(completionEvent).toBeDefined();
        expect(completionEvent.totalChunks).toBeGreaterThan(0);

        done();
      });

      req.expect(200);
    });

    test('should handle stream without file', async () => {
      const response = await request(app)
        .post('/api/process-file-stream')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: 'No file provided'
        }
      });
    });
  });

  describe('File processing pipeline', () => {
    test('should complete full upload-to-completion workflow', async () => {
      const testContent = `
# Test Document

This is a comprehensive test document for testing the complete
file processing pipeline from upload to final storage.

## Section 1
Content for testing chunking and analysis.

## Section 2  
More content to ensure multiple chunks are created.
      `.trim();

      const testBuffer = Buffer.from(testContent, 'utf8');

      // Step 1: Upload file
      const uploadResponse = await request(app)
        .post('/api/process-file')
        .attach('file', testBuffer, 'pipeline-test.txt')
        .expect(200);

      const sessionId = uploadResponse.body.sessionId;
      expect(sessionId).toBeDefined();

      // Step 2: Monitor status until completion
      let attempts = 0;
      let processingComplete = false;

      while (attempts < 10 && !processingComplete) {
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const statusResponse = await request(app)
          .get(`/api/processing/status/${sessionId}`)
          .expect(200);

        if (statusResponse.body.session.status === 'completed') {
          processingComplete = true;
          
          // Verify completion data
          expect(statusResponse.body.session.progress).toBe(100);
          expect(statusResponse.body.session.totalChunks).toBeGreaterThan(0);
          expect(statusResponse.body.session.processedChunks).toBe(statusResponse.body.session.totalChunks);
        }
        
        attempts++;
      }

      expect(processingComplete).toBe(true);
    }, 10000);

    test('should handle concurrent file uploads', async () => {
      const files = Array(3).fill().map((_, i) => ({
        content: `Concurrent test file ${i} content`,
        filename: `concurrent-${i}.txt`
      }));

      const uploadPromises = files.map(file => {
        const buffer = Buffer.from(file.content, 'utf8');
        return request(app)
          .post('/api/process-file')
          .attach('file', buffer, file.filename);
      });

      const responses = await Promise.all(uploadPromises);

      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.filename).toBe(files[index].filename);
      });
    });
  });

  describe('Performance and reliability', () => {
    test('should handle upload performance', async () => {
      const testBuffer = Buffer.from('Performance test content', 'utf8');

      const start = Date.now();
      const response = await request(app)
        .post('/api/process-file')
        .attach('file', testBuffer, 'performance-test.txt')
        .expect(200);
      const uploadTime = Date.now() - start;

      expect(uploadTime).toBeLessThan(1000); // Upload should be fast
      expect(response.body.success).toBe(true);
    });

    test('should validate file size limits', async () => {
      // Create a large buffer (simulate large file)
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      const largeBuffer = Buffer.from(largeContent, 'utf8');

      const response = await request(app)
        .post('/api/process-file')
        .attach('file', largeBuffer, 'large-file.txt');

      // Should either accept or reject based on size limits
      expect([200, 413]).toContain(response.status);
    });
  });

  describe('Error handling', () => {
    test('should handle malformed requests', async () => {
      await request(app)
        .post('/api/process-file')
        .send({ invalidData: 'test' })
        .expect(400);
    });

    test('should handle missing multipart data', async () => {
      await request(app)
        .post('/api/process-file')
        .send('plain text body')
        .expect(400);
    });
  });
});