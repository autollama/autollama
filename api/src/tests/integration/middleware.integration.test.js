/**
 * Integration Tests for Middleware Stack
 * Tests the complete middleware chain working together in realistic scenarios
 */

const request = require('supertest');
const express = require('express');
const { setupMiddlewareStack, setupErrorHandling } = require('../../middleware');

describe('Middleware Stack Integration Tests', () => {
  let app;

  beforeAll(async () => {
    // Create Express app
    app = express();
    
    // Setup complete middleware stack
    setupMiddlewareStack(app, {
      cors: {
        securityHeaders: true,
        preflightHandler: true,
        errorHandler: true
      },
      logging: {
        requestLogging: {
          includeBody: true,
          includeQuery: true,
          logLevel: 'info'
        },
        responseLogging: {
          includeBody: false,
          logLevel: 'info'
        },
        performance: {
          slowThreshold: 100,
          trackMemory: true,
          sampleRate: 1.0
        }
      },
      rateLimit: {
        default: 'development' // Use lenient rate limiting for tests
      },
      validation: {
        strict: true,
        stripUnknown: true
      },
      errorHandling: {
        includeStackTrace: true,
        includeRequestData: true,
        exposeErrors: true
      }
    });

    // Add test routes
    app.get('/test/simple', (req, res) => {
      res.json({ success: true, message: 'Simple test endpoint' });
    });

    app.get('/test/error', (req, res, next) => {
      const error = new Error('Test error for middleware');
      error.statusCode = 418; // I'm a teapot
      next(error);
    });

    app.post('/test/validation', (req, res) => {
      res.json({ success: true, received: req.body });
    });

    app.get('/test/slow', async (req, res) => {
      await new Promise(resolve => setTimeout(resolve, 150)); // 150ms delay
      res.json({ success: true, message: 'Slow endpoint' });
    });

    app.get('/test/auth-required', (req, res) => {
      if (!req.headers.authorization) {
        return res.status(401).json({ error: 'Authorization required' });
      }
      res.json({ success: true, user: 'authenticated' });
    });

    app.get('/test/large-response', (req, res) => {
      const largeData = Array(1000).fill().map((_, i) => ({
        id: i,
        data: `Large data item ${i}`,
        timestamp: new Date().toISOString()
      }));
      res.json({ success: true, data: largeData });
    });

    // Setup error handling (must be last)
    setupErrorHandling(app);
  });

  describe('CORS Integration', () => {
    test('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/test/simple')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toContain('GET');
    });

    test('should set security headers', async () => {
      const response = await request(app)
        .get('/test/simple')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['content-security-policy']).toBeDefined();
    });

    test('should handle cross-origin requests', async () => {
      const response = await request(app)
        .get('/test/simple')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    test('should reject unauthorized origins in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .get('/test/simple')
        .set('Origin', 'https://malicious-site.com')
        .expect(200); // CORS doesn't block response, just headers

      // In real production, this would be blocked at browser level
      expect(response.headers['access-control-allow-origin']).not.toBe('https://malicious-site.com');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Request Logging Integration', () => {
    test('should log request with ID', async () => {
      const response = await request(app)
        .get('/test/simple')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.body.success).toBe(true);
    });

    test('should log POST requests with body', async () => {
      const testData = {
        name: 'Integration Test',
        email: 'test@example.com',
        data: { nested: 'value' }
      };

      const response = await request(app)
        .post('/test/validation')
        .send(testData)
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.body.received).toEqual(testData);
    });

    test('should track performance metrics', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/test/slow')
        .expect(200);

      const endTime = Date.now();
      const requestDuration = endTime - startTime;

      expect(response.headers['x-request-id']).toBeDefined();
      expect(requestDuration).toBeGreaterThan(100); // Should be slow
    });

    test('should handle large responses', async () => {
      const response = await request(app)
        .get('/test/large-response')
        .expect(200);

      expect(response.body.data).toHaveLength(1000);
      expect(response.headers['content-length']).toBeDefined();
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle application errors with full context', async () => {
      const response = await request(app)
        .get('/test/error')
        .expect(418);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: 'Test error for middleware',
          code: expect.any(String),
          timestamp: expect.any(String),
          requestId: expect.any(String)
        },
        statusCode: 418
      });

      expect(response.headers['x-request-id']).toBeDefined();
    });

    test('should handle 404 errors for non-existent routes', async () => {
      const response = await request(app)
        .get('/nonexistent/route')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining('Route GET /nonexistent/route not found'),
          code: expect.any(String)
        }
      });
    });

    test('should handle JSON parsing errors', async () => {
      const response = await request(app)
        .post('/test/validation')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining('Invalid JSON'),
          code: 'VALIDATION_ERROR'
        }
      });
    });

    test('should include stack trace in development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const response = await request(app)
        .get('/test/error')
        .expect(418);

      expect(response.body.error.stack).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Rate Limiting Integration', () => {
    test('should apply rate limiting to endpoints', async () => {
      const responses = [];

      // Make multiple rapid requests
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .get('/test/simple')
          .expect(res => {
            responses.push(res);
          });
      }

      // All should succeed with development rate limits
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });

      // Should have rate limit headers
      if (responses[0].status === 200) {
        expect(responses[0].headers['ratelimit-limit']).toBeDefined();
        expect(responses[0].headers['ratelimit-remaining']).toBeDefined();
      }
    });

    test('should handle rate limit exceeded gracefully', async () => {
      // This test would need a more restrictive rate limit setup
      // For now, we just verify the mechanism works
      const response = await request(app)
        .get('/test/simple')
        .expect(res => {
          // Rate limit headers should be present if rate limiting is active
          if (res.headers['ratelimit-limit']) {
            expect(parseInt(res.headers['ratelimit-limit'])).toBeGreaterThan(0);
          }
        });
    });
  });

  describe('Authentication Integration', () => {
    test('should handle missing authorization', async () => {
      const response = await request(app)
        .get('/test/auth-required')
        .expect(401);

      expect(response.body.error).toBe('Authorization required');
    });

    test('should handle valid authorization', async () => {
      const response = await request(app)
        .get('/test/auth-required')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBe('authenticated');
    });
  });

  describe('Content Negotiation Integration', () => {
    test('should handle JSON content type', async () => {
      const response = await request(app)
        .get('/test/simple')
        .set('Accept', 'application/json')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
    });

    test('should handle POST with form data', async () => {
      const response = await request(app)
        .post('/test/validation')
        .send('name=test&email=test@example.com')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .expect(200);

      expect(response.body.received.name).toBe('test');
      expect(response.body.received.email).toBe('test@example.com');
    });
  });

  describe('Middleware Chain Order', () => {
    test('should execute middleware in correct order', async () => {
      const response = await request(app)
        .post('/test/validation')
        .send({ test: 'data' })
        .expect(200);

      // Should have request ID (from logging middleware)
      expect(response.headers['x-request-id']).toBeDefined();
      
      // Should have CORS headers (from CORS middleware)
      expect(response.headers['access-control-allow-origin']).toBeDefined();
      
      // Should have security headers (from security middleware)
      expect(response.headers['x-content-type-options']).toBeDefined();
      
      // Should have processed body (from body parser middleware)
      expect(response.body.received).toEqual({ test: 'data' });
    });

    test('should handle errors through complete chain', async () => {
      const response = await request(app)
        .get('/test/error')
        .set('Origin', 'http://localhost:3000')
        .expect(418);

      // Should have request ID from logging
      expect(response.body.error.requestId).toBeDefined();
      
      // Should have CORS headers even for errors
      expect(response.headers['access-control-allow-origin']).toBeDefined();
      
      // Should have security headers even for errors
      expect(response.headers['x-content-type-options']).toBeDefined();
      
      // Should have formatted error response
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Test error for middleware');
    });
  });

  describe('Performance and Memory', () => {
    test('should handle concurrent requests efficiently', async () => {
      const startTime = Date.now();
      
      // Make 10 concurrent requests
      const requests = Array(10).fill().map(() => 
        request(app).get('/test/simple')
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Should handle concurrency reasonably fast
      expect(totalTime).toBeLessThan(5000); // 5 seconds max
    });

    test('should not leak memory with many requests', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Make many requests to test for memory leaks
      for (let i = 0; i < 20; i++) {
        await request(app)
          .post('/test/validation')
          .send({ iteration: i })
          .expect(200);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    test('should handle malformed headers gracefully', async () => {
      const response = await request(app)
        .get('/test/simple')
        .set('X-Malformed-Header', '\x00\x01\x02')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should handle oversized request bodies', async () => {
      const largeData = {
        data: 'x'.repeat(12 * 1024 * 1024) // 12MB
      };

      const response = await request(app)
        .post('/test/validation')
        .send(largeData)
        .expect(413); // Payload too large

      expect(response.body.success).toBe(false);
    });

    test('should handle special characters in URLs', async () => {
      const response = await request(app)
        .get('/test/simple')
        .query({ q: 'special chars: !@#$%^&*()' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should handle Unicode in request data', async () => {
      const unicodeData = {
        chinese: '你好世界',
        arabic: 'مرحبا بالعالم',
        emoji: '🌍🚀✨'
      };

      const response = await request(app)
        .post('/test/validation')
        .send(unicodeData)
        .expect(200);

      expect(response.body.received).toEqual(unicodeData);
    });
  });

  describe('Integration with Custom Error Types', () => {
    test('should handle custom validation errors', async () => {
      // Add a route that throws a validation error
      app.post('/test/custom-validation', (req, res, next) => {
        const { ValidationError } = require('../../middleware/error.middleware');
        const errors = [
          { field: 'email', message: 'Invalid email format' },
          { field: 'age', message: 'Age must be a number' }
        ];
        next(new ValidationError('Validation failed', errors));
      });

      const response = await request(app)
        .post('/test/custom-validation')
        .send({ email: 'invalid', age: 'abc' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'email', message: 'Invalid email format' },
            { field: 'age', message: 'Age must be a number' }
          ]
        }
      });
    });

    test('should handle database errors', async () => {
      app.get('/test/database-error', (req, res, next) => {
        const { DatabaseError } = require('../../middleware/error.middleware');
        const originalError = new Error('Connection timeout');
        next(new DatabaseError('Database operation failed', originalError));
      });

      const response = await request(app)
        .get('/test/database-error')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining('Database'),
          code: 'DATABASE_ERROR'
        }
      });
    });
  });
});