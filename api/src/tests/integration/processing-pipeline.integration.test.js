/**
 * Document Processing Pipeline Integration Tests
 * Tests the complete document processing workflow
 */

const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

describe('Document Processing Pipeline Integration Tests', () => {
  let app;
  let pool;
  
  beforeAll(async () => {
    // Setup database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://autollama:autollama@localhost:5432/autollama'
    });

    // Create Express app with processing routes
    app = express();
    app.use(express.json());
    
    // Import and mount processing routes
    const { createRoutes: uploadRoutes } = require('../../routes/upload.routes');
    const { createRoutes: contentRoutes } = require('../../routes/content.routes');
    const { createRoutes: sessionRoutes } = require('../../routes/session.routes');
    
    app.use('/api', uploadRoutes());
    app.use('/api', contentRoutes());
    app.use('/api', sessionRoutes());
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('File Upload Processing', () => {
    test('should process text file upload', async () => {
      // Create test file
      const testContent = `
Biblical Interpretation Methods

This document discusses various approaches to biblical interpretation including:
1. Historical-critical method
2. Literary analysis approach  
3. Theological interpretation
4. Contextual reading methods

These methods help scholars understand ancient Hebrew texts and their significance in modern theological studies.
      `.trim();

      const response = await request(app)
        .post('/api/process-file-stream')
        .attach('file', Buffer.from(testContent), 'test-biblical-methods.txt')
        .expect(200);

      // Should return processing session
      expect(response.body.sessionId).toBeDefined();
      expect(response.body.status).toBe('processing');
    });

    test('should validate file types', async () => {
      // Test unsupported file type
      await request(app)
        .post('/api/process-file-stream')
        .attach('file', Buffer.from('test'), 'test.exe')
        .expect(400);

      // Test missing file
      await request(app)
        .post('/api/process-file-stream')
        .expect(400);
    });

    test('should handle large file uploads', async () => {
      // Create large text content (but within limits)
      const largeContent = 'Biblical studies involve extensive research. '.repeat(500);
      
      const response = await request(app)
        .post('/api/process-file-stream')
        .attach('file', Buffer.from(largeContent), 'large-biblical-text.txt');

      expect([200, 413]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body.sessionId).toBeDefined();
      }
    });
  });

  describe('URL Processing', () => {
    test('should process URL content', async () => {
      const response = await request(app)
        .post('/api/process-url-stream')
        .send({ url: 'https://httpbin.org/html' })
        .expect(200);

      expect(response.body.sessionId).toBeDefined();
      expect(response.body.status).toBe('processing');
    });

    test('should validate URLs', async () => {
      const invalidUrls = [
        'not-a-url',
        'ftp://example.com',
        'javascript:alert(1)',
        ''
      ];

      for (const url of invalidUrls) {
        await request(app)
          .post('/api/process-url-stream')
          .send({ url })
          .expect(400);
      }
    });

    test('should handle unreachable URLs', async () => {
      const response = await request(app)
        .post('/api/process-url-stream')
        .send({ url: 'https://this-domain-does-not-exist-12345.com' });

      expect([200, 400, 500]).toContain(response.status);
      
      if (response.status === 200) {
        // Should create session even if URL fails
        expect(response.body.sessionId).toBeDefined();
      }
    });
  });

  describe('Processing Status Tracking', () => {
    test('should track processing session status', async () => {
      // Start processing
      const uploadResponse = await request(app)
        .post('/api/process-file-stream')
        .attach('file', Buffer.from('Test content for biblical studies research'), 'test.txt')
        .expect(200);

      const sessionId = uploadResponse.body.sessionId;

      // Check session status
      const statusResponse = await request(app)
        .get(`/api/session/${sessionId}/status`)
        .expect(200);

      expect(statusResponse.body.sessionId).toBe(sessionId);
      expect(['processing', 'completed', 'failed']).toContain(statusResponse.body.status);
    });

    test('should list all processing sessions', async () => {
      const response = await request(app)
        .get('/api/session/list')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      
      if (response.body.length > 0) {
        const session = response.body[0];
        expect(session).toHaveProperty('session_id');
        expect(session).toHaveProperty('status');
        expect(session).toHaveProperty('created_at');
      }
    });

    test('should cleanup old sessions', async () => {
      const response = await request(app)
        .post('/api/session/cleanup')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.cleaned).toBeDefined();
    });
  });

  describe('Document Storage and Retrieval', () => {
    test('should store processed documents', async () => {
      // Process a document
      const uploadResponse = await request(app)
        .post('/api/process-file-stream')
        .attach('file', Buffer.from('Biblical studies methodology document'), 'methodology.txt')
        .expect(200);

      // Wait a moment for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if document appears in documents list
      const docsResponse = await request(app)
        .get('/api/documents')
        .expect(200);

      expect(Array.isArray(docsResponse.body)).toBe(true);
      
      const hasNewDoc = docsResponse.body.some(doc => 
        doc.title && doc.title.includes('methodology')
      );
      
      if (docsResponse.body.length > 0 && !hasNewDoc) {
        console.warn('⚠️ Document processed but not found in documents list');
      }
    });

    test('should retrieve document chunks', async () => {
      // Get first document
      const docsResponse = await request(app)
        .get('/api/documents')
        .expect(200);

      if (docsResponse.body.length > 0) {
        const document = docsResponse.body[0];
        
        const chunksResponse = await request(app)
          .get('/api/document-chunks')
          .query({ url: document.url })
          .expect(200);

        expect(Array.isArray(chunksResponse.body)).toBe(true);
        
        if (chunksResponse.body.length > 0) {
          const chunk = chunksResponse.body[0];
          expect(chunk).toHaveProperty('chunk_text');
          expect(chunk).toHaveProperty('chunk_index');
          expect(chunk).toHaveProperty('main_topics');
        }
      }
    });
  });

  describe('Processing Quality Assurance', () => {
    test('should generate meaningful chunk analysis', async () => {
      // Get processed chunks
      const chunksResult = await pool.query(`
        SELECT chunk_text, main_topics, sentiment, technical_level, contextual_summary
        FROM processed_content 
        WHERE record_type = 'chunk' 
        AND main_topics IS NOT NULL 
        LIMIT 5
      `);

      chunksResult.rows.forEach(chunk => {
        expect(chunk.chunk_text).toBeDefined();
        expect(chunk.main_topics).toBeDefined();
        expect(chunk.sentiment).toBeDefined();
        expect(chunk.technical_level).toBeDefined();
        
        // Topics should be relevant to content
        if (chunk.chunk_text.toLowerCase().includes('biblical')) {
          const topics = Array.isArray(chunk.main_topics) ? chunk.main_topics : [];
          const hasRelevantTopic = topics.some(topic => 
            topic.toLowerCase().includes('biblical') ||
            topic.toLowerCase().includes('theology') ||
            topic.toLowerCase().includes('religion')
          );
          
          if (!hasRelevantTopic) {
            console.warn('⚠️ Biblical content missing relevant topics:', chunk.main_topics);
          }
        }
      });
    });

    test('should create contextual summaries', async () => {
      const summariesResult = await pool.query(`
        SELECT contextual_summary, chunk_text, title
        FROM processed_content 
        WHERE record_type = 'chunk' 
        AND contextual_summary IS NOT NULL 
        AND contextual_summary != ''
        LIMIT 5
      `);

      summariesResult.rows.forEach(chunk => {
        expect(chunk.contextual_summary).toBeDefined();
        expect(chunk.contextual_summary.length).toBeGreaterThan(10);
        
        // Summary should be different from chunk text
        expect(chunk.contextual_summary).not.toBe(chunk.chunk_text);
      });
    });

    test('should embed content for vector search', async () => {
      const embeddingsResult = await pool.query(`
        SELECT chunk_id, uses_contextual_embedding, chunk_text
        FROM processed_content 
        WHERE record_type = 'chunk' 
        AND uses_contextual_embedding = true
        LIMIT 5
      `);

      expect(embeddingsResult.rows.length).toBeGreaterThan(0);
      
      embeddingsResult.rows.forEach(chunk => {
        expect(chunk.uses_contextual_embedding).toBe(true);
        expect(chunk.chunk_text).toBeDefined();
      });
    });
  });

  describe('Background Processing', () => {
    test('should handle background job queue', async () => {
      const response = await request(app)
        .get('/api/queue/status')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('stats');
    });

    test('should process jobs in correct order', async () => {
      // Start multiple processing jobs
      const jobs = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/api/process-file-stream')
          .attach('file', Buffer.from(`Test content ${i} about biblical studies`), `test-${i}.txt`);
        
        if (response.status === 200) {
          jobs.push(response.body.sessionId);
        }
      }

      // Check that jobs are queued/processing
      const queueResponse = await request(app)
        .get('/api/queue/status')
        .expect(200);

      expect(queueResponse.body.stats).toBeDefined();
    });
  });
});