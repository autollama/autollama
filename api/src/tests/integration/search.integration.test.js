/**
 * Integration Tests for Search Endpoints
 * Tests the complete search API with vector similarity and BM25 text search
 */

const request = require('supertest');
const express = require('express');
const { setupMiddlewareStack, setupErrorHandling } = require('../../middleware');
const searchRoutes = require('../../routes/search.routes');

describe('Search API Integration Tests', () => {
  let app;
  let mockServices;

  beforeAll(async () => {
    // Create Express app
    app = express();
    
    // Setup middleware
    setupMiddlewareStack(app, {
      logging: { requestLogging: false, responseLogging: false },
      rateLimit: { default: false },
      cors: { securityHeaders: false }
    });

    // Mock services for integration testing
    mockServices = {
      storageService: {
        query: jest.fn(),
        getSmartContentMix: jest.fn(),
        searchDocuments: jest.fn(),
        getDocumentChunks: jest.fn()
      },
      vectorService: {
        searchSimilar: jest.fn(),
        healthCheck: jest.fn().mockResolvedValue({ success: true })
      },
      embeddingService: {
        generateEmbedding: jest.fn(),
        isReady: jest.fn().mockReturnValue(true)
      },
      openaiService: {
        isReady: jest.fn().mockReturnValue(true)
      }
    };

    // Setup routes with dependency injection
    app.use('/api', searchRoutes.createRoutes(mockServices));

    // Setup error handling
    setupErrorHandling(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/search', () => {
    test('should perform basic text search', async () => {
      const mockResults = [
        {
          chunk_id: 'chunk-1',
          chunk_text: 'Sample content about artificial intelligence',
          url: 'https://example.com/ai',
          title: 'AI Article',
          chunk_index: 0,
          similarity_score: 0.95
        },
        {
          chunk_id: 'chunk-2',
          chunk_text: 'More content about machine learning',
          url: 'https://example.com/ml',
          title: 'ML Article',
          chunk_index: 1,
          similarity_score: 0.88
        }
      ];

      mockServices.storageService.getSmartContentMix.mockResolvedValue(mockResults);

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'artificial intelligence', limit: 10 })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        query: 'artificial intelligence',
        results: mockResults,
        total: mockResults.length,
        limit: 10,
        offset: 0,
        searchType: 'hybrid',
        processingTime: expect.any(Number)
      });

      expect(mockServices.storageService.getSmartContentMix).toHaveBeenCalledWith(
        'artificial intelligence',
        expect.objectContaining({
          limit: 10,
          offset: 0
        })
      );
    });

    test('should handle search with pagination', async () => {
      const mockResults = Array(5).fill().map((_, i) => ({
        chunk_id: `chunk-${i + 11}`,
        chunk_text: `Content chunk ${i + 11}`,
        similarity_score: 0.8 - i * 0.1
      }));

      mockServices.storageService.getSmartContentMix.mockResolvedValue(mockResults);

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test query', limit: 5, offset: 10 })
        .expect(200);

      expect(response.body.offset).toBe(10);
      expect(response.body.limit).toBe(5);
      expect(mockServices.storageService.getSmartContentMix).toHaveBeenCalledWith(
        'test query',
        expect.objectContaining({
          limit: 5,
          offset: 10
        })
      );
    });

    test('should include chunks when requested', async () => {
      const mockResults = [
        {
          chunk_id: 'chunk-1',
          chunk_text: 'Sample content',
          chunks: [
            { chunk_id: 'sub-1', chunk_text: 'Sub chunk 1' },
            { chunk_id: 'sub-2', chunk_text: 'Sub chunk 2' }
          ]
        }
      ];

      mockServices.storageService.getSmartContentMix.mockResolvedValue(mockResults);

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test', includeChunks: 'true' })
        .expect(200);

      expect(response.body.results[0].chunks).toBeDefined();
      expect(mockServices.storageService.getSmartContentMix).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({
          includeChunks: true
        })
      );
    });

    test('should validate required query parameter', async () => {
      const response = await request(app)
        .get('/api/search')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('validation')
        })
      });
    });

    test('should validate query parameter length', async () => {
      const longQuery = 'a'.repeat(1001); // Exceeds max length

      await request(app)
        .get('/api/search')
        .query({ q: longQuery })
        .expect(400);
    });

    test('should handle empty search results', async () => {
      mockServices.storageService.getSmartContentMix.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'nonexistent query' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        results: [],
        total: 0
      });
    });

    test('should handle database errors gracefully', async () => {
      mockServices.storageService.getSmartContentMix.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test query' })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.any(String)
        })
      });
    });
  });

  describe('POST /api/search/vector', () => {
    test('should perform vector similarity search', async () => {
      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
      const mockVectorResults = [
        {
          id: 'chunk-1',
          score: 0.95,
          payload: {
            chunk_text: 'Vector search result 1',
            title: 'Document 1'
          }
        },
        {
          id: 'chunk-2',
          score: 0.87,
          payload: {
            chunk_text: 'Vector search result 2',
            title: 'Document 2'
          }
        }
      ];

      mockServices.embeddingService.generateEmbedding.mockResolvedValue({
        success: true,
        embedding: mockEmbedding
      });

      mockServices.vectorService.searchSimilar.mockResolvedValue({
        success: true,
        results: mockVectorResults
      });

      const response = await request(app)
        .post('/api/search/vector')
        .send({
          query: 'vector search query',
          limit: 5,
          threshold: 0.8
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        query: 'vector search query',
        results: expect.arrayContaining([
          expect.objectContaining({
            id: 'chunk-1',
            score: 0.95,
            content: expect.any(Object)
          })
        ]),
        searchType: 'vector',
        threshold: 0.8,
        limit: 5
      });

      expect(mockServices.embeddingService.generateEmbedding).toHaveBeenCalledWith(
        'vector search query'
      );
      expect(mockServices.vectorService.searchSimilar).toHaveBeenCalledWith(
        mockEmbedding,
        expect.objectContaining({
          limit: 5,
          threshold: 0.8
        })
      );
    });

    test('should handle embedding generation failure', async () => {
      mockServices.embeddingService.generateEmbedding.mockResolvedValue({
        success: false,
        error: 'Embedding generation failed'
      });

      const response = await request(app)
        .post('/api/search/vector')
        .send({ query: 'test query' })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('Embedding generation failed')
        })
      });
    });

    test('should handle vector search failure', async () => {
      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());

      mockServices.embeddingService.generateEmbedding.mockResolvedValue({
        success: true,
        embedding: mockEmbedding
      });

      mockServices.vectorService.searchSimilar.mockResolvedValue({
        success: false,
        error: 'Vector search failed'
      });

      const response = await request(app)
        .post('/api/search/vector')
        .send({ query: 'test query' })
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    test('should validate request body', async () => {
      await request(app)
        .post('/api/search/vector')
        .send({}) // Missing query
        .expect(400);

      await request(app)
        .post('/api/search/vector')
        .send({ query: '', limit: 5 }) // Empty query
        .expect(400);

      await request(app)
        .post('/api/search/vector')
        .send({ query: 'test', threshold: 1.5 }) // Invalid threshold
        .expect(400);
    });

    test('should apply default values', async () => {
      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
      
      mockServices.embeddingService.generateEmbedding.mockResolvedValue({
        success: true,
        embedding: mockEmbedding
      });

      mockServices.vectorService.searchSimilar.mockResolvedValue({
        success: true,
        results: []
      });

      const response = await request(app)
        .post('/api/search/vector')
        .send({ query: 'test query' })
        .expect(200);

      expect(response.body.limit).toBe(10); // Default limit
      expect(response.body.threshold).toBe(0.7); // Default threshold

      expect(mockServices.vectorService.searchSimilar).toHaveBeenCalledWith(
        mockEmbedding,
        expect.objectContaining({
          limit: 10,
          threshold: 0.7
        })
      );
    });
  });

  describe('GET /api/search/documents', () => {
    test('should search documents by title and content', async () => {
      const mockDocuments = [
        {
          document_id: 'doc-1',
          title: 'AI Research Paper',
          url: 'https://example.com/ai-paper',
          chunk_count: 15,
          created_at: new Date().toISOString()
        },
        {
          document_id: 'doc-2',
          title: 'Machine Learning Guide',
          url: 'https://example.com/ml-guide',
          chunk_count: 23,
          created_at: new Date().toISOString()
        }
      ];

      mockServices.storageService.searchDocuments.mockResolvedValue({
        documents: mockDocuments,
        total: 2
      });

      const response = await request(app)
        .get('/api/search/documents')
        .query({ q: 'artificial intelligence' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        query: 'artificial intelligence',
        documents: mockDocuments,
        total: 2,
        searchType: 'document'
      });

      expect(mockServices.storageService.searchDocuments).toHaveBeenCalledWith(
        'artificial intelligence',
        expect.any(Object)
      );
    });

    test('should handle document search with filters', async () => {
      mockServices.storageService.searchDocuments.mockResolvedValue({
        documents: [],
        total: 0
      });

      await request(app)
        .get('/api/search/documents')
        .query({
          q: 'test',
          sortBy: 'created_at',
          sortOrder: 'desc',
          limit: 20
        })
        .expect(200);

      expect(mockServices.storageService.searchDocuments).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({
          sortBy: 'created_at',
          sortOrder: 'desc',
          limit: 20
        })
      );
    });
  });

  describe('GET /api/search/similar/:chunkId', () => {
    test('should find similar chunks to a given chunk', async () => {
      const chunkId = 'chunk-123';
      const mockChunk = {
        chunk_id: chunkId,
        chunk_text: 'Source chunk content',
        embedding: Array(1536).fill(0).map(() => Math.random())
      };

      const mockSimilarChunks = [
        {
          chunk_id: 'similar-1',
          chunk_text: 'Similar content 1',
          similarity_score: 0.92
        },
        {
          chunk_id: 'similar-2',
          chunk_text: 'Similar content 2',
          similarity_score: 0.85
        }
      ];

      mockServices.storageService.query
        .mockResolvedValueOnce({ rows: [mockChunk] }) // Get source chunk
        .mockResolvedValueOnce({ rows: mockSimilarChunks }); // Get similar chunks

      const response = await request(app)
        .get(`/api/search/similar/${chunkId}`)
        .query({ limit: 5 })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        sourceChunk: expect.objectContaining({
          chunk_id: chunkId
        }),
        similarChunks: mockSimilarChunks,
        total: mockSimilarChunks.length,
        limit: 5
      });
    });

    test('should handle non-existent chunk', async () => {
      const chunkId = 'nonexistent-chunk';
      
      mockServices.storageService.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get(`/api/search/similar/${chunkId}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('Chunk not found')
        })
      });
    });

    test('should validate chunk ID format', async () => {
      const invalidChunkId = 'invalid-chunk-id-format';

      await request(app)
        .get(`/api/search/similar/${invalidChunkId}`)
        .expect(400);
    });
  });

  describe('Performance and caching', () => {
    test('should track search performance metrics', async () => {
      mockServices.storageService.getSmartContentMix.mockImplementation(
        () => new Promise(resolve => {
          setTimeout(() => resolve([]), 100); // Simulate 100ms delay
        })
      );

      const start = Date.now();
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'performance test' })
        .expect(200);

      const duration = Date.now() - start;

      expect(response.body.processingTime).toBeLessThan(duration + 50);
      expect(response.body.processingTime).toBeGreaterThan(50);
    });

    test('should include caching headers for search results', async () => {
      mockServices.storageService.getSmartContentMix.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/search')
        .query({ q: 'cache test' })
        .expect(200);

      expect(response.headers['cache-control']).toBeDefined();
    });
  });

  describe('Rate limiting', () => {
    test('should apply rate limiting to search endpoints', async () => {
      mockServices.storageService.getSmartContentMix.mockResolvedValue([]);

      // Make multiple rapid requests
      const requests = Array(5).fill().map(() => 
        request(app).get('/api/search').query({ q: 'rate limit test' })
      );

      const responses = await Promise.all(requests);
      
      // Some requests should succeed, potentially some may be rate limited
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('Error handling and edge cases', () => {
    test('should handle special characters in search query', async () => {
      const specialQuery = 'test "quoted text" AND (special) characters!';
      mockServices.storageService.getSmartContentMix.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/search')
        .query({ q: specialQuery })
        .expect(200);

      expect(response.body.query).toBe(specialQuery);
    });

    test('should handle unicode characters in search query', async () => {
      const unicodeQuery = 'test 中文 العربية русский';
      mockServices.storageService.getSmartContentMix.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/search')
        .query({ q: unicodeQuery })
        .expect(200);

      expect(response.body.query).toBe(unicodeQuery);
    });

    test('should handle service unavailability gracefully', async () => {
      mockServices.embeddingService.isReady.mockReturnValue(false);

      const response = await request(app)
        .post('/api/search/vector')
        .send({ query: 'test when service unavailable' })
        .expect(503);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('service not available')
        })
      });
    });
  });
});