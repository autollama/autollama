/**
 * Integration Tests for Document Management Endpoints
 * Tests document CRUD operations, chunk management, and metadata handling
 */

const request = require('supertest');
const express = require('express');
const { setupMiddlewareStack, setupErrorHandling } = require('../../middleware');
const documentRoutes = require('../../routes/documents.routes');

describe('Documents API Integration Tests', () => {
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
        getDocuments: jest.fn(),
        getDocumentById: jest.fn(),
        getDocumentChunks: jest.fn(),
        getDocumentStats: jest.fn(),
        updateDocument: jest.fn(),
        deleteDocument: jest.fn(),
        transaction: jest.fn()
      },
      vectorService: {
        deleteByMetadata: jest.fn(),
        healthCheck: jest.fn().mockResolvedValue({ success: true })
      }
    };

    // Setup routes with dependency injection
    app.use('/api', documentRoutes.createRoutes(mockServices));

    // Setup error handling
    setupErrorHandling(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/documents', () => {
    test('should return paginated list of documents', async () => {
      const mockDocuments = [
        {
          document_id: 'doc-1',
          title: 'First Document',
          url: 'https://example.com/doc1',
          chunk_count: 15,
          created_at: new Date('2024-01-15T10:00:00Z').toISOString(),
          updated_at: new Date('2024-01-15T10:30:00Z').toISOString(),
          status: 'completed'
        },
        {
          document_id: 'doc-2',
          title: 'Second Document',
          url: 'https://example.com/doc2',
          chunk_count: 8,
          created_at: new Date('2024-01-14T15:00:00Z').toISOString(),
          updated_at: new Date('2024-01-14T15:45:00Z').toISOString(),
          status: 'completed'
        }
      ];

      const mockResult = {
        documents: mockDocuments,
        total: 25,
        page: 1,
        limit: 20
      };

      mockServices.storageService.getDocuments.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/documents')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        documents: mockDocuments,
        pagination: {
          total: 25,
          page: 1,
          limit: 20,
          totalPages: 2,
          hasNext: true,
          hasPrev: false
        }
      });

      expect(mockServices.storageService.getDocuments).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        sortBy: 'created_at',
        sortOrder: 'desc'
      });
    });

    test('should handle pagination parameters', async () => {
      const mockResult = {
        documents: [],
        total: 100,
        page: 3,
        limit: 10
      };

      mockServices.storageService.getDocuments.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/documents')
        .query({
          page: 3,
          limit: 10,
          sortBy: 'title',
          sortOrder: 'asc'
        })
        .expect(200);

      expect(response.body.pagination).toMatchObject({
        total: 100,
        page: 3,
        limit: 10,
        totalPages: 10,
        hasNext: true,
        hasPrev: true
      });

      expect(mockServices.storageService.getDocuments).toHaveBeenCalledWith({
        page: 3,
        limit: 10,
        sortBy: 'title',
        sortOrder: 'asc'
      });
    });

    test('should handle search query', async () => {
      const mockResult = {
        documents: [],
        total: 5,
        page: 1,
        limit: 20
      };

      mockServices.storageService.getDocuments.mockResolvedValue(mockResult);

      await request(app)
        .get('/api/documents')
        .query({ search: 'artificial intelligence' })
        .expect(200);

      expect(mockServices.storageService.getDocuments).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        sortBy: 'created_at',
        sortOrder: 'desc',
        search: 'artificial intelligence'
      });
    });

    test('should validate pagination parameters', async () => {
      await request(app)
        .get('/api/documents')
        .query({ page: 0 }) // Invalid page
        .expect(400);

      await request(app)
        .get('/api/documents')
        .query({ limit: 101 }) // Exceeds max limit
        .expect(400);

      await request(app)
        .get('/api/documents')
        .query({ sortBy: 'invalid_field' }) // Invalid sort field
        .expect(400);
    });

    test('should handle database errors', async () => {
      mockServices.storageService.getDocuments.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .get('/api/documents')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.any(String)
        })
      });
    });
  });

  describe('GET /api/documents/:id', () => {
    test('should return document by ID with chunks', async () => {
      const documentId = 'doc-123';
      const mockDocument = {
        document_id: documentId,
        title: 'Test Document',
        url: 'https://example.com/test',
        chunk_count: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'completed',
        metadata: {
          contentType: 'article',
          wordCount: 2500,
          language: 'en'
        }
      };

      const mockChunks = [
        {
          chunk_id: 'chunk-1',
          chunk_text: 'First chunk content',
          chunk_index: 0,
          sentiment: 'neutral',
          contextual_summary: 'Introduction to the topic'
        },
        {
          chunk_id: 'chunk-2',
          chunk_text: 'Second chunk content',
          chunk_index: 1,
          sentiment: 'positive',
          contextual_summary: 'Main points discussion'
        }
      ];

      mockServices.storageService.getDocumentById.mockResolvedValue(mockDocument);
      mockServices.storageService.getDocumentChunks.mockResolvedValue({
        chunks: mockChunks,
        total: 5
      });

      const response = await request(app)
        .get(`/api/documents/${documentId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        document: mockDocument,
        chunks: mockChunks,
        chunksPagination: {
          total: 5,
          returned: 2
        }
      });

      expect(mockServices.storageService.getDocumentById).toHaveBeenCalledWith(documentId);
      expect(mockServices.storageService.getDocumentChunks).toHaveBeenCalledWith(
        documentId,
        expect.objectContaining({
          limit: 50 // Default chunk limit
        })
      );
    });

    test('should handle non-existent document', async () => {
      const documentId = 'nonexistent-doc';
      
      mockServices.storageService.getDocumentById.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/documents/${documentId}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('Document not found')
        })
      });
    });

    test('should validate document ID format', async () => {
      const invalidId = 'invalid-uuid-format';

      await request(app)
        .get(`/api/documents/${invalidId}`)
        .expect(400);
    });

    test('should handle chunks pagination', async () => {
      const documentId = 'doc-with-many-chunks';
      const mockDocument = { document_id: documentId, title: 'Document with many chunks' };

      mockServices.storageService.getDocumentById.mockResolvedValue(mockDocument);
      mockServices.storageService.getDocumentChunks.mockResolvedValue({
        chunks: [],
        total: 100
      });

      await request(app)
        .get(`/api/documents/${documentId}`)
        .query({ chunkLimit: 10, chunkOffset: 20 })
        .expect(200);

      expect(mockServices.storageService.getDocumentChunks).toHaveBeenCalledWith(
        documentId,
        expect.objectContaining({
          limit: 10,
          offset: 20
        })
      );
    });
  });

  describe('GET /api/documents/:id/chunks', () => {
    test('should return paginated document chunks', async () => {
      const documentId = 'doc-chunks-test';
      const mockChunks = Array(15).fill().map((_, i) => ({
        chunk_id: `chunk-${i + 1}`,
        chunk_text: `Chunk content ${i + 1}`,
        chunk_index: i,
        sentiment: i % 2 === 0 ? 'positive' : 'neutral',
        emotions: ['neutral'],
        category: 'technical',
        main_topics: ['topic1', 'topic2'],
        contextual_summary: `Summary of chunk ${i + 1}`
      }));

      mockServices.storageService.getDocumentChunks.mockResolvedValue({
        chunks: mockChunks.slice(0, 10), // First page
        total: 15
      });

      const response = await request(app)
        .get(`/api/documents/${documentId}/chunks`)
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        documentId: documentId,
        chunks: expect.arrayContaining([
          expect.objectContaining({
            chunk_id: expect.any(String),
            chunk_text: expect.any(String),
            chunk_index: expect.any(Number)
          })
        ]),
        pagination: {
          total: 15,
          page: 1,
          limit: 10,
          totalPages: 2
        }
      });
    });

    test('should include embeddings when requested', async () => {
      const documentId = 'doc-embeddings-test';
      const mockChunks = [
        {
          chunk_id: 'chunk-with-embedding',
          chunk_text: 'Content with embedding',
          embedding: Array(1536).fill(0).map(() => Math.random())
        }
      ];

      mockServices.storageService.getDocumentChunks.mockResolvedValue({
        chunks: mockChunks,
        total: 1
      });

      const response = await request(app)
        .get(`/api/documents/${documentId}/chunks`)
        .query({ includeEmbeddings: 'true' })
        .expect(200);

      expect(response.body.chunks[0].embedding).toBeDefined();
      expect(Array.isArray(response.body.chunks[0].embedding)).toBe(true);
    });

    test('should handle chunk search within document', async () => {
      const documentId = 'doc-search-chunks';
      
      mockServices.storageService.getDocumentChunks.mockResolvedValue({
        chunks: [],
        total: 0
      });

      await request(app)
        .get(`/api/documents/${documentId}/chunks`)
        .query({ search: 'specific content' })
        .expect(200);

      expect(mockServices.storageService.getDocumentChunks).toHaveBeenCalledWith(
        documentId,
        expect.objectContaining({
          search: 'specific content'
        })
      );
    });
  });

  describe('PUT /api/documents/:id', () => {
    test('should update document metadata', async () => {
      const documentId = 'doc-update-test';
      const updateData = {
        title: 'Updated Document Title',
        metadata: {
          category: 'research',
          tags: ['ai', 'machine-learning'],
          priority: 'high'
        }
      };

      const mockUpdatedDocument = {
        document_id: documentId,
        title: updateData.title,
        metadata: updateData.metadata,
        updated_at: new Date().toISOString()
      };

      mockServices.storageService.updateDocument.mockResolvedValue(mockUpdatedDocument);

      const response = await request(app)
        .put(`/api/documents/${documentId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        document: mockUpdatedDocument,
        message: expect.stringContaining('updated successfully')
      });

      expect(mockServices.storageService.updateDocument).toHaveBeenCalledWith(
        documentId,
        updateData
      );
    });

    test('should validate update data', async () => {
      const documentId = 'doc-validate-update';

      await request(app)
        .put(`/api/documents/${documentId}`)
        .send({
          title: '', // Empty title
          metadata: 'invalid metadata format' // Should be object
        })
        .expect(400);
    });

    test('should handle non-existent document update', async () => {
      const documentId = 'nonexistent-update-doc';
      
      mockServices.storageService.updateDocument.mockResolvedValue(null);

      const response = await request(app)
        .put(`/api/documents/${documentId}`)
        .send({ title: 'New Title' })
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('Document not found')
        })
      });
    });
  });

  describe('DELETE /api/documents/:id', () => {
    test('should delete document and associated data', async () => {
      const documentId = 'doc-delete-test';
      
      // Mock transaction for atomic deletion
      const mockTransaction = {
        query: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn()
      };

      mockServices.storageService.transaction.mockImplementation(async (callback) => {
        return await callback(mockTransaction);
      });

      mockServices.vectorService.deleteByMetadata.mockResolvedValue({
        success: true,
        deletedCount: 12
      });

      // Mock the transaction operations
      mockTransaction.query
        .mockResolvedValueOnce({ rowCount: 12 }) // Delete chunks
        .mockResolvedValueOnce({ rowCount: 1 }); // Delete document

      const response = await request(app)
        .delete(`/api/documents/${documentId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('deleted successfully'),
        deletedChunks: 12,
        vectorEntriesDeleted: 12
      });

      expect(mockServices.vectorService.deleteByMetadata).toHaveBeenCalledWith({
        document_id: documentId
      });
    });

    test('should handle deletion of non-existent document', async () => {
      const documentId = 'nonexistent-delete-doc';
      
      const mockTransaction = {
        query: jest.fn().mockResolvedValue({ rowCount: 0 }),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn()
      };

      mockServices.storageService.transaction.mockImplementation(async (callback) => {
        return await callback(mockTransaction);
      });

      const response = await request(app)
        .delete(`/api/documents/${documentId}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('Document not found')
        })
      });
    });

    test('should handle deletion errors with rollback', async () => {
      const documentId = 'doc-delete-error';
      
      const mockTransaction = {
        query: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn()
      };

      mockServices.storageService.transaction.mockImplementation(async (callback) => {
        return await callback(mockTransaction);
      });

      // Mock vector deletion failure
      mockServices.vectorService.deleteByMetadata.mockRejectedValue(
        new Error('Vector deletion failed')
      );

      const response = await request(app)
        .delete(`/api/documents/${documentId}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });

  describe('GET /api/documents/:id/stats', () => {
    test('should return document statistics', async () => {
      const documentId = 'doc-stats-test';
      const mockStats = {
        totalChunks: 25,
        completedChunks: 23,
        failedChunks: 2,
        avgChunkSize: 850,
        totalTokens: 21250,
        sentimentDistribution: {
          positive: 12,
          neutral: 8,
          negative: 3
        },
        categoryDistribution: {
          technical: 15,
          business: 6,
          general: 4
        },
        processingTime: 45000, // 45 seconds
        lastProcessed: new Date().toISOString()
      };

      mockServices.storageService.getDocumentStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get(`/api/documents/${documentId}/stats`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        documentId: documentId,
        stats: mockStats
      });

      expect(mockServices.storageService.getDocumentStats).toHaveBeenCalledWith(documentId);
    });

    test('should handle stats for non-existent document', async () => {
      const documentId = 'nonexistent-stats-doc';
      
      mockServices.storageService.getDocumentStats.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/documents/${documentId}/stats`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('Document not found')
        })
      });
    });
  });

  describe('POST /api/documents/:id/reprocess', () => {
    test('should trigger document reprocessing', async () => {
      const documentId = 'doc-reprocess-test';
      const mockDocument = {
        document_id: documentId,
        title: 'Document to Reprocess',
        url: 'https://example.com/reprocess',
        status: 'completed'
      };

      mockServices.storageService.getDocumentById.mockResolvedValue(mockDocument);
      mockServices.storageService.updateDocument.mockResolvedValue({
        ...mockDocument,
        status: 'processing',
        updated_at: new Date().toISOString()
      });

      const response = await request(app)
        .post(`/api/documents/${documentId}/reprocess`)
        .send({
          chunkSize: 1200,
          enableContextualEmbeddings: true
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('reprocessing initiated'),
        document: expect.objectContaining({
          status: 'processing'
        })
      });

      expect(mockServices.storageService.updateDocument).toHaveBeenCalledWith(
        documentId,
        expect.objectContaining({
          status: 'processing'
        })
      );
    });

    test('should prevent reprocessing of already processing document', async () => {
      const documentId = 'doc-already-processing';
      const mockDocument = {
        document_id: documentId,
        status: 'processing'
      };

      mockServices.storageService.getDocumentById.mockResolvedValue(mockDocument);

      const response = await request(app)
        .post(`/api/documents/${documentId}/reprocess`)
        .expect(409); // Conflict

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('already being processed')
        })
      });
    });
  });

  describe('Error handling and edge cases', () => {
    test('should handle malformed UUID parameters', async () => {
      const invalidIds = ['not-a-uuid', '123', 'abc-def-ghi'];

      for (const invalidId of invalidIds) {
        await request(app)
          .get(`/api/documents/${invalidId}`)
          .expect(400);
      }
    });

    test('should handle database transaction errors', async () => {
      const documentId = 'doc-transaction-error';
      
      mockServices.storageService.transaction.mockRejectedValue(
        new Error('Transaction failed')
      );

      const response = await request(app)
        .delete(`/api/documents/${documentId}`)
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.objectContaining({
          message: expect.any(String)
        })
      });
    });

    test('should handle concurrent access to same document', async () => {
      const documentId = 'doc-concurrent-test';
      const mockDocument = { document_id: documentId, title: 'Concurrent Test' };

      mockServices.storageService.getDocumentById.mockResolvedValue(mockDocument);

      const requests = Array(3).fill().map(() => 
        request(app).get(`/api/documents/${documentId}`)
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    test('should handle very large chunk pagination', async () => {
      const documentId = 'doc-large-chunks';
      
      mockServices.storageService.getDocumentChunks.mockResolvedValue({
        chunks: [],
        total: 10000
      });

      const response = await request(app)
        .get(`/api/documents/${documentId}/chunks`)
        .query({ page: 100, limit: 100 })
        .expect(200);

      expect(response.body.pagination.totalPages).toBe(100);
      expect(response.body.pagination.hasNext).toBe(false);
    });

    test('should sanitize search inputs', async () => {
      const maliciousSearch = '<script>alert("xss")</script>';
      
      mockServices.storageService.getDocuments.mockResolvedValue({
        documents: [],
        total: 0,
        page: 1,
        limit: 20
      });

      await request(app)
        .get('/api/documents')
        .query({ search: maliciousSearch })
        .expect(200);

      const searchArg = mockServices.storageService.getDocuments.mock.calls[0][0].search;
      expect(searchArg).not.toContain('<script>');
    });
  });
});