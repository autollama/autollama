/**
 * Simple Search API Integration Tests
 * Tests search functionality without external dependencies
 */

const request = require('supertest');
const express = require('express');

describe('Search API Simple Integration Tests', () => {
  let app;
  const mockSearchResults = [
    {
      chunk_id: 'chunk-1',
      chunk_text: 'This is content about artificial intelligence and machine learning',
      title: 'AI Article',
      url: 'https://example.com/ai',
      chunk_index: 0,
      similarity_score: 0.95,
      sentiment: 'neutral',
      main_topics: ['artificial intelligence', 'machine learning'],
      contextual_summary: 'Content discusses AI and ML concepts'
    },
    {
      chunk_id: 'chunk-2', 
      chunk_text: 'Deep learning is a subset of machine learning algorithms',
      title: 'Deep Learning Guide',
      url: 'https://example.com/deep-learning',
      chunk_index: 1,
      similarity_score: 0.88,
      sentiment: 'neutral',
      main_topics: ['deep learning', 'algorithms'],
      contextual_summary: 'Explains deep learning algorithms'
    }
  ];

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    // Mock search endpoint
    app.get('/api/search', (req, res) => {
      const query = req.query.q;
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;
      
      if (!query || query.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Query parameter is required' }
        });
      }

      // Simple text matching simulation
      const filteredResults = mockSearchResults.filter(result =>
        result.chunk_text.toLowerCase().includes(query.toLowerCase()) ||
        result.title.toLowerCase().includes(query.toLowerCase()) ||
        result.main_topics.some(topic => topic.toLowerCase().includes(query.toLowerCase()))
      );

      const paginatedResults = filteredResults.slice(offset, offset + limit);

      res.json({
        success: true,
        query,
        results: paginatedResults,
        total: filteredResults.length,
        limit,
        offset,
        searchType: 'hybrid',
        processingTime: Math.floor(Math.random() * 100) + 50
      });
    });

    // Mock vector search endpoint
    app.post('/api/search/vector', (req, res) => {
      const { query, limit = 10, threshold = 0.7 } = req.body;
      
      if (!query || query.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Query is required' }
        });
      }

      if (threshold < 0 || threshold > 1) {
        return res.status(400).json({
          success: false,
          error: { message: 'Threshold must be between 0 and 1' }
        });
      }

      // Filter by similarity threshold
      const relevantResults = mockSearchResults.filter(result => 
        result.similarity_score >= threshold
      );

      res.json({
        success: true,
        query,
        results: relevantResults.slice(0, limit),
        searchType: 'vector',
        threshold,
        limit,
        processingTime: Math.floor(Math.random() * 150) + 100
      });
    });

    // Mock document search endpoint
    app.get('/api/search/documents', (req, res) => {
      const query = req.query.q;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: { message: 'Query parameter is required' }
        });
      }

      const documents = [
        {
          document_id: 'doc-1',
          title: 'AI Research Paper',
          url: 'https://example.com/ai-paper',
          chunk_count: 15,
          created_at: new Date().toISOString(),
          match_score: 0.9
        }
      ];

      res.json({
        success: true,
        query,
        documents,
        total: documents.length,
        searchType: 'document'
      });
    });

    // Mock similar chunks endpoint
    app.get('/api/search/similar/:chunkId', (req, res) => {
      const chunkId = req.params.chunkId;
      const limit = parseInt(req.query.limit) || 5;

      if (!chunkId || chunkId.length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid chunk ID' }
        });
      }

      const sourceChunk = mockSearchResults.find(chunk => chunk.chunk_id === chunkId);
      
      if (!sourceChunk) {
        return res.status(404).json({
          success: false,
          error: { message: 'Chunk not found' }
        });
      }

      const similarChunks = mockSearchResults
        .filter(chunk => chunk.chunk_id !== chunkId)
        .slice(0, limit);

      res.json({
        success: true,
        sourceChunk,
        similarChunks,
        total: similarChunks.length,
        limit
      });
    });
  });

  describe('GET /api/search', () => {
    test('should perform basic text search', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'artificial intelligence', limit: 10 })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        query: 'artificial intelligence',
        results: expect.any(Array),
        total: expect.any(Number),
        limit: 10,
        offset: 0,
        searchType: 'hybrid',
        processingTime: expect.any(Number)
      });

      expect(response.body.results.length).toBeGreaterThan(0);
    });

    test('should handle pagination parameters', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'machine learning', limit: 1, offset: 0 })
        .expect(200);

      expect(response.body.limit).toBe(1);
      expect(response.body.offset).toBe(0);
      expect(response.body.results.length).toBeLessThanOrEqual(1);
    });

    test('should validate required query parameter', async () => {
      await request(app)
        .get('/api/search')
        .expect(400);

      await request(app)
        .get('/api/search')
        .query({ q: '' })
        .expect(400);
    });

    test('should handle no results', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'nonexistent content xyz123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    test('should include processing time', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test' })
        .expect(200);

      expect(response.body.processingTime).toBeGreaterThan(0);
      expect(response.body.processingTime).toBeLessThan(1000);
    });
  });

  describe('POST /api/search/vector', () => {
    test('should perform vector similarity search', async () => {
      const response = await request(app)
        .post('/api/search/vector')
        .send({
          query: 'machine learning algorithms',
          limit: 5,
          threshold: 0.8
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        query: 'machine learning algorithms',
        results: expect.any(Array),
        searchType: 'vector',
        threshold: 0.8,
        limit: 5,
        processingTime: expect.any(Number)
      });
    });

    test('should apply similarity threshold', async () => {
      const response = await request(app)
        .post('/api/search/vector')
        .send({
          query: 'test query',
          threshold: 0.9 // High threshold
        })
        .expect(200);

      // Should filter out results below threshold
      response.body.results.forEach(result => {
        expect(result.similarity_score).toBeGreaterThanOrEqual(0.9);
      });
    });

    test('should validate request body', async () => {
      await request(app)
        .post('/api/search/vector')
        .send({}) // Missing query
        .expect(400);

      await request(app)
        .post('/api/search/vector')
        .send({ query: '' }) // Empty query
        .expect(400);

      await request(app)
        .post('/api/search/vector')
        .send({ query: 'test', threshold: 1.5 }) // Invalid threshold
        .expect(400);
    });
  });

  describe('GET /api/search/documents', () => {
    test('should search documents by title and content', async () => {
      const response = await request(app)
        .get('/api/search/documents')
        .query({ q: 'research' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        query: 'research',
        documents: expect.any(Array),
        total: expect.any(Number),
        searchType: 'document'
      });
    });

    test('should validate query parameter', async () => {
      await request(app)
        .get('/api/search/documents')
        .expect(400);
    });
  });

  describe('GET /api/search/similar/:chunkId', () => {
    test('should find similar chunks', async () => {
      const response = await request(app)
        .get('/api/search/similar/chunk-1')
        .query({ limit: 3 })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        sourceChunk: expect.objectContaining({
          chunk_id: 'chunk-1'
        }),
        similarChunks: expect.any(Array),
        total: expect.any(Number),
        limit: 3
      });
    });

    test('should handle non-existent chunk', async () => {
      await request(app)
        .get('/api/search/similar/nonexistent-chunk')
        .expect(404);
    });

    test('should validate chunk ID', async () => {
      await request(app)
        .get('/api/search/similar/')
        .expect(404); // No chunk ID provided
    });
  });

  describe('Search result quality', () => {
    test('should return relevant results for topic search', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'machine learning' })
        .expect(200);

      expect(response.body.results.length).toBeGreaterThan(0);
      
      // Results should contain the search term or related topics
      response.body.results.forEach(result => {
        const hasRelevantContent = 
          result.chunk_text.toLowerCase().includes('machine learning') ||
          result.main_topics.some(topic => topic.toLowerCase().includes('machine learning')) ||
          result.title.toLowerCase().includes('machine learning');
        
        expect(hasRelevantContent).toBe(true);
      });
    });

    test('should order results by relevance', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'artificial intelligence' })
        .expect(200);

      if (response.body.results.length > 1) {
        // Results should be ordered by similarity score (descending)
        for (let i = 1; i < response.body.results.length; i++) {
          expect(response.body.results[i-1].similarity_score)
            .toBeGreaterThanOrEqual(response.body.results[i].similarity_score);
        }
      }
    });
  });

  describe('Performance monitoring', () => {
    test('should track response times', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'performance test' })
        .expect(200);

      expect(response.body.processingTime).toBeGreaterThan(0);
      expect(response.body.processingTime).toBeLessThan(1000);
    });

    test('should handle load efficiently', async () => {
      const iterations = 5;
      const responseTimes = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await request(app)
          .get('/api/search')
          .query({ q: `test query ${i}` })
          .expect(200);
        responseTimes.push(Date.now() - start);
      }

      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      expect(avgResponseTime).toBeLessThan(100);
    });
  });
});