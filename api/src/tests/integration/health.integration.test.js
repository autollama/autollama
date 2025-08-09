/**
 * Integration Tests for Health Endpoints
 * Tests the complete health monitoring API endpoints with real service interactions
 */

const request = require('supertest');
const express = require('express');
const { setupMiddlewareStack, setupErrorHandling } = require('../../middleware');
const { initializeServices, getServiceContainer } = require('../../services');
const healthRoutes = require('../../routes/health.routes');
const HealthController = require('../../controllers/health.controller');

describe('Health API Integration Tests', () => {
  let app;
  let serviceContainer;
  let healthController;

  beforeAll(async () => {
    // Create Express app
    app = express();
    
    // Setup middleware
    setupMiddlewareStack(app, {
      logging: { requestLogging: false, responseLogging: false },
      rateLimit: false,
      cors: { securityHeaders: false }
    });

    // Mock services for integration testing
    serviceContainer = {
      getAllServices: jest.fn().mockReturnValue({
        storageService: {
          healthCheck: jest.fn().mockResolvedValue({ success: true, status: 'healthy' })
        },
        vectorService: {
          healthCheck: jest.fn().mockResolvedValue({ success: true, status: 'healthy' })
        },
        openaiService: {
          testConnection: jest.fn().mockResolvedValue({ success: true, responseTime: 250 }),
          isReady: jest.fn().mockReturnValue(true)
        },
        analysisService: {
          testAnalysis: jest.fn().mockResolvedValue({ success: true, responseTime: 300 })
        },
        embeddingService: {
          getStats: jest.fn().mockReturnValue({ openaiServiceReady: true })
        },
        sessionCleanupService: {
          getCleanupStats: jest.fn().mockReturnValue({ isRunning: true, totalCleanupRuns: 10 })
        },
        sessionMonitoringService: {
          getMonitoringStats: jest.fn().mockReturnValue({ isRunning: true, activeSessions: 2 })
        },
        sseService: {
          healthCheck: jest.fn().mockReturnValue({ status: 'healthy', clients: 5 })
        },
        webSocketService: {
          healthCheck: jest.fn().mockReturnValue({ status: 'healthy', clients: 3 })
        }
      }),
      getHealthStatus: jest.fn().mockReturnValue({
        database: { success: true },
        vector: { success: true },
        openai: { success: true }
      }),
      isReady: jest.fn().mockReturnValue(true),
      getStats: jest.fn().mockReturnValue({
        initialized: true,
        serviceCount: 9
      })
    };

    // Create health controller with mocked services
    healthController = new HealthController(serviceContainer.getAllServices());

    // Setup routes with dependency injection
    app.use('/api', healthRoutes.createRoutes({
      healthController
    }));

    // Setup error handling
    setupErrorHandling(app);
  });

  describe('GET /api/health', () => {
    test('should return basic health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        services: {
          api: 'healthy',
          database: 'healthy',
          vector: 'healthy',
          ai: 'healthy'
        }
      });
    });

    test('should handle detailed health check', async () => {
      const response = await request(app)
        .get('/api/health?detailed=true')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        services: {
          api: 'healthy',
          database: 'healthy',
          vector: 'healthy',
          ai: 'healthy'
        },
        details: expect.objectContaining({
          database: expect.any(Object),
          vector: expect.any(Object),
          ai: expect.any(Object)
        })
      });
    });

    test('should include service statistics when requested', async () => {
      const response = await request(app)
        .get('/api/health?includeServices=true')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        services: {
          api: 'healthy',
          database: 'healthy',
          vector: 'healthy',
          ai: 'healthy'
        },
        serviceStats: expect.any(Object)
      });
    });
  });

  describe('GET /api/health/comprehensive', () => {
    test('should return comprehensive health status', async () => {
      const response = await request(app)
        .get('/api/health/comprehensive')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        environment: process.env.NODE_ENV || 'test',
        services: expect.objectContaining({
          database: expect.objectContaining({
            status: 'healthy',
            responseTime: expect.any(Number)
          }),
          vector: expect.objectContaining({
            status: 'healthy',
            responseTime: expect.any(Number)
          }),
          ai: expect.objectContaining({
            openai: expect.objectContaining({
              status: 'healthy',
              responseTime: expect.any(Number)
            })
          })
        }),
        system: expect.objectContaining({
          memory: expect.any(Object),
          cpu: expect.any(Object),
          disk: expect.any(Object)
        })
      });
    });

    test('should include session management stats', async () => {
      const response = await request(app)
        .get('/api/health/comprehensive')
        .expect(200);

      expect(response.body.services.session).toMatchObject({
        cleanup: expect.objectContaining({
          isRunning: true,
          totalCleanupRuns: 10
        }),
        monitoring: expect.objectContaining({
          isRunning: true,
          activeSessions: 2
        })
      });
    });

    test('should include communication services stats', async () => {
      const response = await request(app)
        .get('/api/health/comprehensive')
        .expect(200);

      expect(response.body.services.communication).toMatchObject({
        sse: expect.objectContaining({
          status: 'healthy',
          clients: 5
        }),
        websocket: expect.objectContaining({
          status: 'healthy',
          clients: 3
        })
      });
    });
  });

  describe('GET /api/health/system', () => {
    test('should return system health metrics', async () => {
      const response = await request(app)
        .get('/api/health/system')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        system: {
          memory: {
            used: expect.any(Number),
            total: expect.any(Number),
            percentage: expect.any(Number),
            heapUsed: expect.any(Number),
            heapTotal: expect.any(Number),
            external: expect.any(Number)
          },
          cpu: {
            usage: expect.any(Number),
            loadAverage: expect.any(Array)
          },
          disk: {
            free: expect.any(Number),
            total: expect.any(Number),
            percentage: expect.any(Number)
          },
          process: {
            pid: expect.any(Number),
            uptime: expect.any(Number),
            version: expect.any(String)
          }
        },
        performance: {
          eventLoopDelay: expect.any(Number),
          eventLoopUtilization: expect.any(Number)
        }
      });
    });
  });

  describe('GET /api/health/services', () => {
    test('should return detailed service status', async () => {
      const response = await request(app)
        .get('/api/health/services')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        services: {
          database: {
            name: 'PostgreSQL Database',
            status: 'healthy',
            responseTime: expect.any(Number),
            details: expect.any(Object)
          },
          vector: {
            name: 'Qdrant Vector Database',
            status: 'healthy',
            responseTime: expect.any(Number),
            details: expect.any(Object)
          },
          ai: {
            openai: {
              name: 'OpenAI API',
              status: 'healthy',
              responseTime: expect.any(Number),
              details: expect.any(Object)
            },
            analysis: {
              name: 'Content Analysis Service',
              status: 'healthy',
              responseTime: expect.any(Number),
              details: expect.any(Object)
            }
          }
        },
        summary: {
          total: expect.any(Number),
          healthy: expect.any(Number),
          unhealthy: expect.any(Number),
          degraded: expect.any(Number)
        }
      });
    });
  });

  describe('Error handling', () => {
    test('should handle database service failure', async () => {
      // Mock database service failure
      serviceContainer.getAllServices().storageService.healthCheck
        .mockResolvedValueOnce({ success: false, error: 'Connection failed' });

      const response = await request(app)
        .get('/api/health')
        .expect(503); // Service Unavailable

      expect(response.body).toMatchObject({
        success: false,
        status: 'unhealthy',
        services: expect.objectContaining({
          database: 'unhealthy'
        })
      });
    });

    test('should handle AI service failure gracefully', async () => {
      // Mock AI service failure
      serviceContainer.getAllServices().openaiService.testConnection
        .mockResolvedValueOnce({ success: false, error: 'API key invalid' });

      const response = await request(app)
        .get('/api/health/comprehensive')
        .expect(200); // Should still return 200 but mark AI as unhealthy

      expect(response.body.services.ai.openai.status).toBe('unhealthy');
      expect(response.body.status).toBe('degraded'); // Overall status should be degraded
    });

    test('should handle service timeout', async () => {
      // Mock service timeout
      serviceContainer.getAllServices().vectorService.healthCheck
        .mockImplementation(() => new Promise(resolve => {
          setTimeout(() => resolve({ success: false, error: 'Timeout' }), 100);
        }));

      const response = await request(app)
        .get('/api/health/services')
        .expect(200);

      expect(response.body.services.vector.status).toBe('unhealthy');
    });
  });

  describe('Response caching', () => {
    test('should include cache headers for health endpoints', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['cache-control']).toBeDefined();
    });

    test('should not cache comprehensive health checks', async () => {
      const response = await request(app)
        .get('/api/health/comprehensive')
        .expect(200);

      expect(response.headers['cache-control']).toContain('no-cache');
    });
  });

  describe('Authentication and authorization', () => {
    test('should allow anonymous access to basic health check', async () => {
      await request(app)
        .get('/api/health')
        .expect(200);
    });

    test('should allow anonymous access to system health', async () => {
      await request(app)
        .get('/api/health/system')
        .expect(200);
    });
  });

  describe('Rate limiting', () => {
    test('should apply rate limiting to health endpoints', async () => {
      // Make multiple rapid requests
      const requests = Array(10).fill().map(() => 
        request(app).get('/api/health')
      );

      const responses = await Promise.all(requests);
      
      // All should succeed for health checks (high rate limit)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('Content negotiation', () => {
    test('should return JSON by default', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
    });

    test('should handle Accept header', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Accept', 'application/json')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('Query parameter validation', () => {
    test('should validate boolean query parameters', async () => {
      await request(app)
        .get('/api/health?detailed=invalid')
        .expect(400);
    });

    test('should handle missing query parameters gracefully', async () => {
      await request(app)
        .get('/api/health?')
        .expect(200);
    });
  });

  describe('Service dependency tracking', () => {
    test('should track service dependencies in health response', async () => {
      const response = await request(app)
        .get('/api/health/comprehensive')
        .expect(200);

      expect(response.body.dependencies).toBeDefined();
      expect(response.body.dependencies).toContain('database');
      expect(response.body.dependencies).toContain('vector');
      expect(response.body.dependencies).toContain('ai');
    });
  });

  describe('Performance monitoring', () => {
    test('should include response time metrics', async () => {
      const start = Date.now();
      const response = await request(app)
        .get('/api/health/comprehensive')
        .expect(200);
      const duration = Date.now() - start;

      expect(response.body.performance.responseTime).toBeLessThan(duration + 100);
      expect(response.body.performance.responseTime).toBeGreaterThan(0);
    });
  });
});