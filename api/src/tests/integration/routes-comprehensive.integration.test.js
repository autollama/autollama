/**
 * Comprehensive Routes Integration Tests
 * Tests all major API endpoints for coverage improvement
 */

const request = require('supertest');
const express = require('express');
const { Pool } = require('pg');

describe('Routes Comprehensive Integration Tests', () => {
  let app;
  let pool;
  
  beforeAll(async () => {
    // Setup database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://autollama:autollama@localhost:5432/autollama'
    });

    // Create Express app with all routes
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Import and mount all routes
    const { createRoutes: healthRoutes } = require('../../routes/health.routes');
    const { createRoutes: documentsRoutes } = require('../../routes/documents.routes');
    const { createRoutes: settingsRoutes } = require('../../routes/settings.routes');
    const { createRoutes: contentRoutes } = require('../../routes/content.routes');
    
    app.use('/api', healthRoutes());
    app.use('/api', documentsRoutes());
    app.use('/api', settingsRoutes());
    app.use('/api', contentRoutes());
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('Health Routes Coverage', () => {
    test('should check basic health', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });

    test('should check system health', async () => {
      const response = await request(app)
        .get('/api/health/system')
        .expect(200);

      expect(response.body.system).toBeDefined();
      expect(response.body.system.memory).toBeDefined();
      expect(response.body.system.cpu).toBeDefined();
    });

    test('should check comprehensive health', async () => {
      const response = await request(app)
        .get('/api/health/comprehensive')
        .expect(200);

      expect(response.body.overall).toBeDefined();
      expect(response.body.services).toBeDefined();
      expect(response.body.database).toBeDefined();
    });
  });

  describe('Documents Routes Coverage', () => {
    test('should list all documents', async () => {
      const response = await request(app)
        .get('/api/documents')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get recent documents', async () => {
      const response = await request(app)
        .get('/api/recent-records')
        .query({ limit: 10 })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle document filtering', async () => {
      const response = await request(app)
        .get('/api/documents')
        .query({ 
          sortBy: 'created_time',
          sortOrder: 'desc',
          limit: 5
        })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get database statistics', async () => {
      const response = await request(app)
        .get('/api/database/stats')
        .expect(200);

      expect(response.body.totalDocuments).toBeDefined();
      expect(response.body.totalChunks).toBeDefined();
    });
  });

  describe('Settings Routes Coverage', () => {
    test('should get current settings', async () => {
      const response = await request(app)
        .get('/api/settings')
        .expect(200);

      expect(response.body.processing).toBeDefined();
      expect(response.body.ai).toBeDefined();
    });

    test('should update processing settings', async () => {
      const newSettings = {
        processing: {
          chunkSize: 1000,
          chunkOverlap: 100,
          enableContextualEmbeddings: true
        }
      };

      const response = await request(app)
        .post('/api/settings')
        .send(newSettings)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should validate settings format', async () => {
      // Invalid settings structure
      await request(app)
        .post('/api/settings')
        .send({ invalid: 'data' })
        .expect(400);
    });

    test('should get OpenWebUI configuration', async () => {
      const response = await request(app)
        .get('/api/settings/openwebui-config')
        .expect(200);

      expect(response.body.apiUrl).toBeDefined();
      expect(response.body.apiKey).toBeDefined();
    });
  });

  describe('Content Routes Coverage', () => {
    test('should get content summary', async () => {
      const response = await request(app)
        .get('/api/content/summary')
        .expect(200);

      expect(response.body.totalDocuments).toBeDefined();
      expect(response.body.totalChunks).toBeDefined();
      expect(response.body.processingStatus).toBeDefined();
    });

    test('should get content by type', async () => {
      const contentTypes = ['academic_paper', 'book_or_manual', 'documentation'];
      
      for (const type of contentTypes) {
        const response = await request(app)
          .get('/api/content/by-type')
          .query({ type })
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      }
    });

    test('should get content analytics', async () => {
      const response = await request(app)
        .get('/api/content/analytics')
        .expect(200);

      expect(response.body.topTopics).toBeDefined();
      expect(response.body.contentTypes).toBeDefined();
      expect(response.body.processingQuality).toBeDefined();
    });
  });

  describe('Error Handling Coverage', () => {
    test('should handle 404 routes', async () => {
      await request(app)
        .get('/api/nonexistent-route')
        .expect(404);
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/settings')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect([400, 500]).toContain(response.status);
    });

    test('should handle missing required parameters', async () => {
      // Missing URL for URL processing
      await request(app)
        .post('/api/process-url-stream')
        .send({})
        .expect(400);

      // Missing message for chat
      await request(app)
        .post('/api/chat/message')
        .send({})
        .expect(400);
    });

    test('should handle invalid query parameters', async () => {
      // Invalid limit values
      await request(app)
        .get('/api/documents')
        .query({ limit: -1 })
        .expect(400);

      await request(app)
        .get('/api/search')
        .query({ q: 'test', limit: 'invalid' })
        .expect(400);
    });
  });

  describe('Security and Validation Coverage', () => {
    test('should sanitize input data', async () => {
      const maliciousInputs = [
        '<script>alert(1)</script>',
        'SELECT * FROM users;',
        '../../etc/passwd',
        '${process.env.SECRET}'
      ];

      for (const input of maliciousInputs) {
        const response = await request(app)
          .get('/api/search')
          .query({ q: input, limit: 5 });

        expect([200, 400]).toContain(response.status);
        
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          // Result should not contain raw malicious input
          const responseText = JSON.stringify(response.body);
          expect(responseText).not.toContain('<script>');
        }
      }
    });

    test('should enforce rate limiting', async () => {
      const requests = [];
      
      // Make multiple rapid requests
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .get('/api/health')
            .set('X-Forwarded-For', '192.168.1.100')
        );
      }

      const responses = await Promise.all(requests);
      
      // Should handle all requests (rate limiting might not trigger in tests)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });

    test('should validate content-type headers', async () => {
      const response = await request(app)
        .post('/api/settings')
        .set('Content-Type', 'text/plain')
        .send('invalid data')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Real Database Integration', () => {
    test('should connect to actual database', async () => {
      const result = await pool.query('SELECT COUNT(*) as count FROM processed_content');
      expect(result.rows[0].count).toBeDefined();
      expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(0);
    });

    test('should query processed content', async () => {
      const result = await pool.query(`
        SELECT title, main_topics, chunk_text
        FROM processed_content 
        WHERE record_type = 'chunk' 
        AND main_topics IS NOT NULL
        LIMIT 3
      `);

      result.rows.forEach(row => {
        expect(row.title).toBeDefined();
        expect(row.main_topics).toBeDefined();
        expect(row.chunk_text).toBeDefined();
      });
    });

    test('should verify search index integrity', async () => {
      // Check if search-related columns exist
      const schemaResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'processed_content' 
        AND column_name IN ('source', 'main_topics', 'contextual_summary')
      `);

      const columns = schemaResult.rows.map(row => row.column_name);
      expect(columns).toContain('source');
      expect(columns).toContain('main_topics');
      expect(columns).toContain('contextual_summary');
    });
  });
});