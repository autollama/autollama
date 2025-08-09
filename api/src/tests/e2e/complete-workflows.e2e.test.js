/**
 * End-to-End Tests for Complete User Workflows
 * Tests real user scenarios from start to finish with actual service interactions
 */

const request = require('supertest');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { setupMiddlewareStack, setupErrorHandling } = require('../../middleware');
const { initializeServices } = require('../../services');
const allRoutes = require('../../routes');

describe('Complete User Workflows E2E Tests', () => {
  let app;
  let services;
  let testDocumentId;
  let testSessionId;

  beforeAll(async () => {
    // Create Express app with full middleware stack
    app = express();
    
    // Initialize services with test configuration
    services = await initializeServices({
      skipExternalConnections: true, // Don't connect to external APIs in tests
      mockMode: true
    });

    // Setup complete middleware stack
    setupMiddlewareStack(app, {
      cors: {
        securityHeaders: true,
        preflightHandler: true,
        errorHandler: true
      },
      logging: {
        requestLogging: { includeBody: true, logLevel: 'warn' },
        responseLogging: { includeBody: false, logLevel: 'warn' },
        performance: { slowThreshold: 1000, trackMemory: true }
      },
      rateLimit: {
        default: 'development' // Lenient for tests
      },
      validation: {
        strict: true,
        stripUnknown: true
      },
      errorHandling: {
        includeStackTrace: true,
        exposeErrors: true
      }
    });

    // Setup all routes
    app.use('/api', allRoutes.createRoutes(services));

    // Setup error handling
    setupErrorHandling(app);

    // Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);

  afterAll(async () => {
    // Cleanup test data
    if (testDocumentId && services.storageService) {
      try {
        await services.storageService.deleteDocument(testDocumentId);
      } catch (error) {
        console.warn('Cleanup warning:', error.message);
      }
    }

    // Close service connections
    if (services.storageService?.close) {
      await services.storageService.close();
    }
    if (services.vectorService?.close) {
      await services.vectorService.close();
    }
  });

  describe('Complete Document Processing Workflow', () => {
    test('should process URL from start to finish', async () => {
      const testUrl = 'https://example.com/test-article';
      const startTime = Date.now();

      // Step 1: Health check to ensure system is ready
      const healthResponse = await request(app)
        .get('/api/health')
        .expect(200);

      expect(healthResponse.body.success).toBe(true);

      // Step 2: Start URL processing
      const processResponse = await request(app)
        .post('/api/process-url')
        .send({
          url: testUrl,
          chunkSize: 1000,
          overlap: 100,
          enableContextualEmbeddings: true
        })
        .expect(200);

      expect(processResponse.body.success).toBe(true);
      testSessionId = processResponse.body.sessionId;
      expect(testSessionId).toBeDefined();

      // Step 3: Monitor processing status
      let attempts = 0;
      let processingComplete = false;
      
      while (attempts < 10 && !processingComplete) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const statusResponse = await request(app)
          .get(`/api/processing/status/${testSessionId}`)
          .expect(200);

        if (statusResponse.body.session?.status === 'completed') {
          processingComplete = true;
          testDocumentId = statusResponse.body.session.document_id;
        } else if (statusResponse.body.session?.status === 'failed') {
          throw new Error('Processing failed: ' + statusResponse.body.session.error_message);
        }
        
        attempts++;
      }

      expect(processingComplete).toBe(true);
      expect(testDocumentId).toBeDefined();

      // Step 4: Verify document was created
      const documentResponse = await request(app)
        .get(`/api/documents/${testDocumentId}`)
        .expect(200);

      expect(documentResponse.body.success).toBe(true);
      expect(documentResponse.body.document.url).toBe(testUrl);
      expect(documentResponse.body.chunks).toBeDefined();
      expect(documentResponse.body.chunks.length).toBeGreaterThan(0);

      // Step 5: Search for content
      const searchResponse = await request(app)
        .get('/api/search')
        .query({ q: 'test content', limit: 10 })
        .expect(200);

      expect(searchResponse.body.success).toBe(true);
      expect(searchResponse.body.results).toBeDefined();

      // Step 6: Get document statistics
      const statsResponse = await request(app)
        .get(`/api/documents/${testDocumentId}/stats`)
        .expect(200);

      expect(statsResponse.body.success).toBe(true);
      expect(statsResponse.body.stats.totalChunks).toBeGreaterThan(0);

      const totalTime = Date.now() - startTime;
      console.log(`Complete workflow took ${totalTime}ms`);
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
    }, 45000);

    test('should handle file upload workflow', async () => {
      // Create a test file buffer
      const testContent = `
# Test Document

This is a test document for end-to-end testing.

## Section 1
Content for the first section with multiple paragraphs.
This tests the chunking and processing capabilities.

## Section 2
More content to ensure we have enough text for meaningful chunks.
This section includes various types of content.

### Subsection
- List item 1
- List item 2
- List item 3

Final paragraph with conclusion content.
      `.trim();

      const testBuffer = Buffer.from(testContent, 'utf8');

      // Step 1: Upload and process file
      const uploadResponse = await request(app)
        .post('/api/process-file')
        .attach('file', testBuffer, 'test-document.txt')
        .field('chunkSize', '500')
        .field('overlap', '50')
        .field('enableContextualEmbeddings', 'true')
        .expect(200);

      expect(uploadResponse.body.success).toBe(true);
      const uploadSessionId = uploadResponse.body.sessionId;

      // Step 2: Wait for processing completion
      let attempts = 0;
      let uploadComplete = false;
      let uploadDocumentId;

      while (attempts < 10 && !uploadComplete) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const statusResponse = await request(app)
          .get(`/api/processing/status/${uploadSessionId}`)
          .expect(200);

        if (statusResponse.body.session?.status === 'completed') {
          uploadComplete = true;
          uploadDocumentId = statusResponse.body.session.document_id;
        }
        
        attempts++;
      }

      expect(uploadComplete).toBe(true);

      // Step 3: Verify chunks were created with context
      const chunksResponse = await request(app)
        .get(`/api/documents/${uploadDocumentId}/chunks`)
        .query({ includeEmbeddings: false })
        .expect(200);

      expect(chunksResponse.body.success).toBe(true);
      expect(chunksResponse.body.chunks.length).toBeGreaterThan(1);
      
      // Verify contextual analysis was performed
      const hasContextualData = chunksResponse.body.chunks.some(chunk => 
        chunk.contextual_summary || chunk.sentiment || chunk.main_topics
      );
      expect(hasContextualData).toBe(true);

      // Cleanup
      await request(app)
        .delete(`/api/documents/${uploadDocumentId}`)
        .expect(200);
    }, 30000);
  });

  describe('Search and Discovery Workflow', () => {
    test('should perform comprehensive search workflow', async () => {
      // Skip if no test document available
      if (!testDocumentId) {
        console.log('Skipping search tests - no test document available');
        return;
      }

      // Step 1: Perform text search
      const textSearchResponse = await request(app)
        .get('/api/search')
        .query({ 
          q: 'test content',
          limit: 5,
          includeChunks: true
        })
        .expect(200);

      expect(textSearchResponse.body.success).toBe(true);
      expect(textSearchResponse.body.searchType).toBe('hybrid');
      expect(textSearchResponse.body.processingTime).toBeDefined();

      // Step 2: Perform vector similarity search
      const vectorSearchResponse = await request(app)
        .post('/api/search/vector')
        .send({
          query: 'test content analysis',
          limit: 5,
          threshold: 0.7
        })
        .expect(200);

      expect(vectorSearchResponse.body.success).toBe(true);
      expect(vectorSearchResponse.body.searchType).toBe('vector');

      // Step 3: Search documents
      const documentSearchResponse = await request(app)
        .get('/api/search/documents')
        .query({ q: 'test' })
        .expect(200);

      expect(documentSearchResponse.body.success).toBe(true);
      expect(documentSearchResponse.body.searchType).toBe('document');

      // Step 4: Find similar chunks (if we have results)
      if (textSearchResponse.body.results.length > 0) {
        const firstChunkId = textSearchResponse.body.results[0].chunk_id;
        
        const similarResponse = await request(app)
          .get(`/api/search/similar/${firstChunkId}`)
          .query({ limit: 3 })
          .expect(200);

        expect(similarResponse.body.success).toBe(true);
        expect(similarResponse.body.sourceChunk).toBeDefined();
      }
    }, 20000);
  });

  describe('Document Management Workflow', () => {
    test('should perform complete document management', async () => {
      // Skip if no test document available
      if (!testDocumentId) {
        console.log('Skipping document management tests - no test document available');
        return;
      }

      // Step 1: List all documents with pagination
      const listResponse = await request(app)
        .get('/api/documents')
        .query({ 
          page: 1,
          limit: 10,
          sortBy: 'created_at',
          sortOrder: 'desc'
        })
        .expect(200);

      expect(listResponse.body.success).toBe(true);
      expect(listResponse.body.pagination).toBeDefined();
      expect(listResponse.body.documents).toBeDefined();

      // Step 2: Get specific document details
      const detailResponse = await request(app)
        .get(`/api/documents/${testDocumentId}`)
        .expect(200);

      expect(detailResponse.body.success).toBe(true);
      expect(detailResponse.body.document).toBeDefined();
      expect(detailResponse.body.chunks).toBeDefined();

      // Step 3: Update document metadata
      const updateResponse = await request(app)
        .put(`/api/documents/${testDocumentId}`)
        .send({
          title: 'Updated Test Document Title',
          metadata: {
            category: 'test',
            tags: ['e2e', 'testing'],
            notes: 'Updated during E2E testing'
          }
        })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.document.title).toBe('Updated Test Document Title');

      // Step 4: Get document chunks with pagination
      const chunksResponse = await request(app)
        .get(`/api/documents/${testDocumentId}/chunks`)
        .query({ 
          page: 1,
          limit: 5,
          includeEmbeddings: false
        })
        .expect(200);

      expect(chunksResponse.body.success).toBe(true);
      expect(chunksResponse.body.pagination).toBeDefined();

      // Step 5: Get document statistics
      const statsResponse = await request(app)
        .get(`/api/documents/${testDocumentId}/stats`)
        .expect(200);

      expect(statsResponse.body.success).toBe(true);
      expect(statsResponse.body.stats).toBeDefined();
      expect(statsResponse.body.stats.totalChunks).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Error Handling and Recovery Workflow', () => {
    test('should handle processing errors gracefully', async () => {
      // Step 1: Attempt to process invalid URL
      const invalidUrlResponse = await request(app)
        .post('/api/process-url')
        .send({
          url: 'not-a-valid-url',
          chunkSize: 1000
        })
        .expect(400);

      expect(invalidUrlResponse.body.success).toBe(false);
      expect(invalidUrlResponse.body.error).toBeDefined();

      // Step 2: Attempt to access non-existent document
      const nonExistentResponse = await request(app)
        .get('/api/documents/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(nonExistentResponse.body.success).toBe(false);

      // Step 3: Attempt invalid search parameters
      const invalidSearchResponse = await request(app)
        .get('/api/search')
        .query({ q: '', limit: -1 })
        .expect(400);

      expect(invalidSearchResponse.body.success).toBe(false);

      // Step 4: Test rate limiting (make rapid requests)
      const rapidRequests = Array(10).fill().map(() =>
        request(app).get('/api/health')
      );

      const rapidResponses = await Promise.all(rapidRequests);
      
      // All should either succeed or be rate limited
      rapidResponses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    }, 10000);

    test('should handle concurrent access properly', async () => {
      // Step 1: Make concurrent document list requests
      const concurrentRequests = Array(5).fill().map(() =>
        request(app).get('/api/documents')
      );

      const responses = await Promise.all(concurrentRequests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Step 2: Make concurrent search requests
      const concurrentSearches = Array(3).fill().map((_, i) =>
        request(app)
          .get('/api/search')
          .query({ q: `test query ${i}`, limit: 5 })
      );

      const searchResponses = await Promise.all(concurrentSearches);
      
      searchResponses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    }, 15000);
  });

  describe('Performance and Resource Usage', () => {
    test('should complete operations within acceptable time limits', async () => {
      const performanceMetrics = {};

      // Test 1: Health check performance
      const healthStart = Date.now();
      await request(app).get('/api/health').expect(200);
      performanceMetrics.healthCheck = Date.now() - healthStart;

      // Test 2: Document list performance
      const listStart = Date.now();
      await request(app).get('/api/documents').expect(200);
      performanceMetrics.documentList = Date.now() - listStart;

      // Test 3: Search performance
      const searchStart = Date.now();
      await request(app)
        .get('/api/search')
        .query({ q: 'test', limit: 10 })
        .expect(200);
      performanceMetrics.search = Date.now() - searchStart;

      // Assert performance criteria
      expect(performanceMetrics.healthCheck).toBeLessThan(1000); // 1 second
      expect(performanceMetrics.documentList).toBeLessThan(2000); // 2 seconds
      expect(performanceMetrics.search).toBeLessThan(3000); // 3 seconds

      console.log('Performance metrics:', performanceMetrics);
    }, 10000);

    test('should handle memory efficiently during processing', async () => {
      const initialMemory = process.memoryUsage();

      // Perform several operations that might consume memory
      await request(app).get('/api/documents').expect(200);
      await request(app)
        .get('/api/search')
        .query({ q: 'memory test', limit: 20 })
        .expect(200);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      console.log(`Memory usage: ${Math.round(memoryIncrease / 1024 / 1024)}MB increase`);
    });
  });
});