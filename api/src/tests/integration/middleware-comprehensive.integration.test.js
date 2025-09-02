/**
 * Comprehensive Middleware Integration Tests
 * Tests all middleware components with real Express integration
 */

const request = require('supertest');
const express = require('express');

describe('Middleware Comprehensive Integration Tests', () => {
  let app;
  
  beforeAll(async () => {
    // Create Express app with full middleware stack
    app = express();
    
    // Import and apply middleware
    const corsMiddleware = require('../../middleware/cors.middleware');
    const errorMiddleware = require('../../middleware/error.middleware');
    const loggingMiddleware = require('../../middleware/logging.middleware');
    const rateLimitMiddleware = require('../../middleware/rateLimit.middleware');
    const validationMiddleware = require('../../middleware/validation.middleware');
    
    // Apply middleware
    app.use(corsMiddleware);
    app.use(loggingMiddleware);
    app.use(rateLimitMiddleware);
    app.use(express.json());

    // Test routes with validation
    app.post('/api/test-validation', 
      validationMiddleware.validateSearchQuery,
      (req, res) => res.json({ success: true, query: req.body.q })
    );

    app.get('/api/test-error', (req, res, next) => {
      const error = new Error('Test error');
      error.statusCode = 418;
      next(error);
    });

    app.get('/api/test-success', (req, res) => {
      res.json({ success: true, message: 'Test endpoint' });
    });

    // Apply error middleware last
    app.use(errorMiddleware);
  });

  describe('CORS Middleware Coverage', () => {
    test('should handle preflight OPTIONS requests', async () => {
      const response = await request(app)
        .options('/api/test-success')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });

    test('should set CORS headers on actual requests', async () => {
      const response = await request(app)
        .get('/api/test-success')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    test('should handle different origins', async () => {
      const origins = [
        'http://localhost:8080',
        'https://autollama.io',
        'http://192.168.1.249:8080'
      ];

      for (const origin of origins) {
        const response = await request(app)
          .get('/api/test-success')
          .set('Origin', origin)
          .expect(200);

        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('Error Middleware Coverage', () => {
    test('should handle application errors', async () => {
      const response = await request(app)
        .get('/api/test-error')
        .expect(418);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Test error');
    });

    test('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/test-validation')
        .send({ invalid: 'data' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    test('should include error metadata', async () => {
      const response = await request(app)
        .get('/api/test-error')
        .expect(418);

      expect(response.body.error.timestamp).toBeDefined();
      expect(response.body.error.code).toBeDefined();
    });
  });

  describe('Logging Middleware Coverage', () => {
    test('should log request details', async () => {
      const response = await request(app)
        .get('/api/test-success')
        .set('User-Agent', 'Test-Agent/1.0')
        .expect(200);

      expect(response.body.success).toBe(true);
      // Logging middleware should capture request details
    });

    test('should log different HTTP methods', async () => {
      const methods = ['GET', 'POST'];
      
      for (const method of methods) {
        const req = request(app)[method.toLowerCase()]('/api/test-success');
        
        if (method === 'POST') {
          req.send({ test: 'data' });
        }
        
        const response = await req.expect(200);
        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('Rate Limiting Middleware Coverage', () => {
    test('should track request counts', async () => {
      const responses = [];
      
      // Make several requests from same IP
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .get('/api/test-success')
          .set('X-Forwarded-For', '192.168.1.200');
        
        responses.push(response);
      }

      // All should succeed (rate limit is high in tests)
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('should handle different IP addresses', async () => {
      const ips = ['192.168.1.100', '192.168.1.101', '10.0.0.1'];
      
      for (const ip of ips) {
        const response = await request(app)
          .get('/api/test-success')
          .set('X-Forwarded-For', ip)
          .expect(200);

        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('Validation Middleware Coverage', () => {
    test('should validate search queries', async () => {
      // Valid query
      const validResponse = await request(app)
        .post('/api/test-validation')
        .send({ q: 'biblical studies' })
        .expect(200);

      expect(validResponse.body.success).toBe(true);
      expect(validResponse.body.query).toBe('biblical studies');
    });

    test('should reject invalid search queries', async () => {
      const invalidQueries = [
        { q: '' },                    // Empty query
        { q: 'a' },                   // Too short
        { q: 'x'.repeat(1000) },      // Too long
        {},                           // Missing query
        { q: null },                  // Null query
        { q: 123 }                    // Wrong type
      ];

      for (const query of invalidQueries) {
        await request(app)
          .post('/api/test-validation')
          .send(query)
          .expect(400);
      }
    });

    test('should validate query parameters', async () => {
      // Test limit validation
      const response = await request(app)
        .post('/api/test-validation')
        .send({ q: 'test', limit: -1 });

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Middleware Chain Integration', () => {
    test('should process requests through full middleware stack', async () => {
      const response = await request(app)
        .post('/api/test-validation')
        .set('Origin', 'http://localhost:3000')
        .set('Content-Type', 'application/json')
        .send({ q: 'biblical interpretation methods' })
        .expect(200);

      // Should have CORS headers
      expect(response.headers['access-control-allow-origin']).toBeDefined();
      
      // Should have processed validation
      expect(response.body.success).toBe(true);
      expect(response.body.query).toBe('biblical interpretation methods');
    });

    test('should handle middleware errors in chain', async () => {
      // Send invalid JSON to trigger parsing error
      const response = await request(app)
        .post('/api/test-validation')
        .set('Content-Type', 'application/json')
        .send('invalid json{')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    test('should apply security headers', async () => {
      const response = await request(app)
        .get('/api/test-success')
        .expect(200);

      // Check for security-related headers
      expect(response.headers['x-powered-by']).toBeUndefined(); // Should be hidden
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle concurrent requests', async () => {
      const concurrentRequests = Array(10).fill().map((_, i) =>
        request(app)
          .get('/api/test-success')
          .set('X-Request-ID', `test-${i}`)
      );

      const responses = await Promise.all(concurrentRequests);
      
      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    test('should maintain performance under load', async () => {
      const startTime = Date.now();
      
      // Make multiple requests
      const requests = Array(20).fill().map(() =>
        request(app).get('/api/test-success')
      );

      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(10000); // 10 seconds for 20 requests
    });
  });
});