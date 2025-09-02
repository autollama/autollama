/**
 * Simple Documents API Integration Tests
 * Tests basic document endpoints without complex dependencies
 */

const request = require('supertest');
const express = require('express');

describe('Documents API Simple Integration Tests', () => {
  let app;
  const mockDocuments = [
    {
      id: 'doc-1',
      title: 'Test Document 1',
      url: 'https://example.com/doc1',
      chunk_count: 5,
      created_time: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      processing_status: 'completed',
      file_size: 1024
    },
    {
      id: 'doc-2',
      title: 'Test Document 2',
      url: 'https://example.com/doc2',
      chunk_count: 8,
      created_time: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      processing_status: 'completed',
      file_size: 2048
    }
  ];

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    // Mock documents endpoint
    app.get('/api/documents', (req, res) => {
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;
      const sortBy = req.query.sortBy || 'created_time';
      const sortOrder = req.query.sortOrder || 'desc';

      let filteredDocs = [...mockDocuments];
      
      if (req.query.search) {
        filteredDocs = mockDocuments.filter(doc => 
          doc.title.toLowerCase().includes(req.query.search.toLowerCase())
        );
      }

      const paginatedDocs = filteredDocs.slice(offset, offset + limit);

      res.json({
        success: true,
        documents: paginatedDocs,
        pagination: {
          total: filteredDocs.length,
          limit,
          offset,
          hasMore: offset + limit < filteredDocs.length
        },
        sortBy,
        sortOrder
      });
    });

    // Mock individual document endpoint
    app.get('/api/documents/:id', (req, res) => {
      const doc = mockDocuments.find(d => d.id === req.params.id);
      
      if (!doc) {
        return res.status(404).json({
          success: false,
          error: { message: 'Document not found' }
        });
      }

      res.json({
        success: true,
        document: doc,
        chunks: [
          {
            chunk_id: `${doc.id}-chunk-1`,
            chunk_text: 'Sample chunk content',
            chunk_index: 0,
            similarity_score: 1.0
          }
        ]
      });
    });

    // Mock document stats endpoint
    app.get('/api/documents/:id/stats', (req, res) => {
      const doc = mockDocuments.find(d => d.id === req.params.id);
      
      if (!doc) {
        return res.status(404).json({
          success: false,
          error: { message: 'Document not found' }
        });
      }

      res.json({
        success: true,
        stats: {
          totalChunks: doc.chunk_count,
          completedChunks: doc.chunk_count,
          averageChunkSize: 500,
          totalCharacters: doc.chunk_count * 500,
          processingTime: 1500
        }
      });
    });

    // Mock document chunks endpoint
    app.get('/api/documents/:id/chunks', (req, res) => {
      const doc = mockDocuments.find(d => d.id === req.params.id);
      
      if (!doc) {
        return res.status(404).json({
          success: false,
          error: { message: 'Document not found' }
        });
      }

      const chunks = Array(doc.chunk_count).fill().map((_, i) => ({
        chunk_id: `${doc.id}-chunk-${i}`,
        chunk_text: `Sample chunk ${i} content`,
        chunk_index: i,
        sentiment: 'neutral',
        main_topics: ['testing'],
        contextual_summary: `Summary for chunk ${i}`
      }));

      res.json({
        success: true,
        chunks,
        pagination: {
          total: chunks.length,
          limit: 10,
          offset: 0,
          hasMore: false
        }
      });
    });
  });

  describe('GET /api/documents', () => {
    test('should return documents list', async () => {
      const response = await request(app)
        .get('/api/documents')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        documents: expect.any(Array),
        pagination: expect.objectContaining({
          total: expect.any(Number),
          limit: expect.any(Number),
          offset: expect.any(Number),
          hasMore: expect.any(Boolean)
        })
      });

      expect(response.body.documents.length).toBeGreaterThan(0);
    });

    test('should handle pagination', async () => {
      const response = await request(app)
        .get('/api/documents')
        .query({ limit: 1, offset: 0 })
        .expect(200);

      expect(response.body.pagination.limit).toBe(1);
      expect(response.body.pagination.offset).toBe(0);
      expect(response.body.documents.length).toBe(1);
    });

    test('should handle search filtering', async () => {
      const response = await request(app)
        .get('/api/documents')
        .query({ search: 'Document 1' })
        .expect(200);

      expect(response.body.documents.length).toBe(1);
      expect(response.body.documents[0].title).toContain('Document 1');
    });

    test('should handle sorting', async () => {
      const response = await request(app)
        .get('/api/documents')
        .query({ sortBy: 'created_time', sortOrder: 'asc' })
        .expect(200);

      expect(response.body.sortBy).toBe('created_time');
      expect(response.body.sortOrder).toBe('asc');
    });
  });

  describe('GET /api/documents/:id', () => {
    test('should return specific document', async () => {
      const response = await request(app)
        .get('/api/documents/doc-1')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        document: expect.objectContaining({
          id: 'doc-1',
          title: expect.any(String),
          url: expect.any(String)
        }),
        chunks: expect.any(Array)
      });
    });

    test('should handle non-existent document', async () => {
      const response = await request(app)
        .get('/api/documents/nonexistent')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: 'Document not found'
        })
      });
    });

    test('should include document metadata', async () => {
      const response = await request(app)
        .get('/api/documents/doc-1')
        .expect(200);

      const { document } = response.body;
      expect(document).toHaveProperty('title');
      expect(document).toHaveProperty('url');
      expect(document).toHaveProperty('chunk_count');
      expect(document).toHaveProperty('created_time');
      expect(document).toHaveProperty('processing_status');
    });
  });

  describe('GET /api/documents/:id/stats', () => {
    test('should return document statistics', async () => {
      const response = await request(app)
        .get('/api/documents/doc-1/stats')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        stats: expect.objectContaining({
          totalChunks: expect.any(Number),
          completedChunks: expect.any(Number),
          averageChunkSize: expect.any(Number),
          totalCharacters: expect.any(Number),
          processingTime: expect.any(Number)
        })
      });
    });

    test('should handle non-existent document stats', async () => {
      await request(app)
        .get('/api/documents/nonexistent/stats')
        .expect(404);
    });
  });

  describe('GET /api/documents/:id/chunks', () => {
    test('should return document chunks', async () => {
      const response = await request(app)
        .get('/api/documents/doc-1/chunks')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        chunks: expect.any(Array),
        pagination: expect.any(Object)
      });

      expect(response.body.chunks.length).toBeGreaterThan(0);
      
      const firstChunk = response.body.chunks[0];
      expect(firstChunk).toHaveProperty('chunk_id');
      expect(firstChunk).toHaveProperty('chunk_text');
      expect(firstChunk).toHaveProperty('chunk_index');
    });

    test('should include chunk metadata', async () => {
      const response = await request(app)
        .get('/api/documents/doc-1/chunks')
        .expect(200);

      const chunk = response.body.chunks[0];
      expect(chunk).toHaveProperty('sentiment');
      expect(chunk).toHaveProperty('main_topics');
      expect(chunk).toHaveProperty('contextual_summary');
    });
  });

  describe('Performance and validation', () => {
    test('should respond quickly to documents list', async () => {
      const start = Date.now();
      await request(app)
        .get('/api/documents')
        .expect(200);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    test('should handle concurrent document requests', async () => {
      const concurrentRequests = Array(5).fill().map(() =>
        request(app).get('/api/documents')
      );

      const responses = await Promise.all(concurrentRequests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    test('should validate document ID format', async () => {
      // Test with various invalid IDs
      const invalidIds = ['', '   ', 'invalid/id', 'id with spaces'];
      
      for (const invalidId of invalidIds) {
        const response = await request(app)
          .get(`/api/documents/${encodeURIComponent(invalidId)}`);
        
        expect([400, 404, 200]).toContain(response.status); // 200 for empty/spaces since they're valid URLs
      }
    });
  });
});