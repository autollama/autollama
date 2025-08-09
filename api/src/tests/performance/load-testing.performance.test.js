/**
 * Performance and Load Testing Suite
 * Tests system performance under various load conditions
 */

const request = require('supertest');
const express = require('express');
const cluster = require('cluster');
const { setupMiddlewareStack, setupErrorHandling } = require('../../middleware');
const { initializeServices } = require('../../services');
const allRoutes = require('../../routes');

describe('Load Testing and Performance Tests', () => {
  let app;
  let services;

  beforeAll(async () => {
    // Create Express app with production-like configuration
    app = express();
    
    // Initialize services
    services = await initializeServices({
      skipExternalConnections: true,
      mockMode: true,
      poolSize: 20 // Larger pool for load testing
    });

    // Setup middleware with performance optimizations
    setupMiddlewareStack(app, {
      cors: { securityHeaders: true },
      logging: { 
        requestLogging: { logLevel: 'error' }, // Minimal logging for performance
        responseLogging: false,
        performance: { slowThreshold: 500, trackMemory: true }
      },
      rateLimit: {
        default: 'production', // More realistic rate limiting
        customLimits: {
          '/api/search': { windowMs: 60000, max: 100 },
          '/api/process-url': { windowMs: 300000, max: 10 }
        }
      }
    });

    // Setup routes
    app.use('/api', allRoutes.createRoutes(services));
    setupErrorHandling(app);

    // Warm up the application
    await request(app).get('/api/health').expect(200);
  }, 30000);

  afterAll(async () => {
    if (services.storageService?.close) {
      await services.storageService.close();
    }
  });

  describe('Response Time Performance', () => {
    test('should handle health checks under load', async () => {
      const concurrentRequests = 50;
      const startTime = Date.now();
      
      const requests = Array(concurrentRequests).fill().map(() =>
        request(app).get('/api/health')
      );

      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;
      const averageTime = totalTime / concurrentRequests;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Performance assertions
      expect(averageTime).toBeLessThan(100); // Average < 100ms
      expect(totalTime).toBeLessThan(5000); // Total < 5 seconds

      console.log(`Health check load test: ${concurrentRequests} requests in ${totalTime}ms (avg: ${averageTime.toFixed(2)}ms)`);
    }, 15000);

    test('should handle document listing under load', async () => {
      const concurrentRequests = 20;
      const startTime = Date.now();
      
      const requests = Array(concurrentRequests).fill().map((_, index) =>
        request(app)
          .get('/api/documents')
          .query({ 
            page: Math.floor(index / 5) + 1,
            limit: 10
          })
      );

      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;
      const averageTime = totalTime / concurrentRequests;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Performance assertions
      expect(averageTime).toBeLessThan(500); // Average < 500ms
      expect(totalTime).toBeLessThan(10000); // Total < 10 seconds

      console.log(`Document listing load test: ${concurrentRequests} requests in ${totalTime}ms (avg: ${averageTime.toFixed(2)}ms)`);
    }, 20000);

    test('should handle search queries under load', async () => {
      const searchQueries = [
        'artificial intelligence',
        'machine learning',
        'data processing',
        'neural networks',
        'automation',
        'technology trends',
        'software development',
        'system architecture'
      ];

      const concurrentRequests = 16;
      const startTime = Date.now();
      
      const requests = Array(concurrentRequests).fill().map((_, index) =>
        request(app)
          .get('/api/search')
          .query({
            q: searchQueries[index % searchQueries.length],
            limit: 10
          })
      );

      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;
      const averageTime = totalTime / concurrentRequests;

      // All requests should succeed or be rate limited
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
        }
      });

      const successfulRequests = responses.filter(r => r.status === 200).length;
      console.log(`Search load test: ${successfulRequests}/${concurrentRequests} successful requests in ${totalTime}ms (avg: ${averageTime.toFixed(2)}ms)`);

      // At least 80% should succeed (accounting for rate limiting)
      expect(successfulRequests / concurrentRequests).toBeGreaterThan(0.8);
    }, 25000);
  });

  describe('Memory and Resource Performance', () => {
    test('should maintain stable memory usage under sustained load', async () => {
      const initialMemory = process.memoryUsage();
      const memorySnapshots = [initialMemory];

      // Sustained load test - make requests over time
      for (let round = 0; round < 5; round++) {
        const roundRequests = Array(10).fill().map(() =>
          request(app).get('/api/health')
        );
        
        await Promise.all(roundRequests);
        
        // Wait between rounds
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Take memory snapshot
        memorySnapshots.push(process.memoryUsage());
      }

      // Analyze memory growth
      const finalMemory = memorySnapshots[memorySnapshots.length - 1];
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const maxMemoryIncrease = Math.max(...memorySnapshots.map(
        snapshot => snapshot.heapUsed - initialMemory.heapUsed
      ));

      console.log(`Memory analysis:
        Initial: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB
        Final: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB
        Growth: ${Math.round(memoryGrowth / 1024 / 1024)}MB
        Max increase: ${Math.round(maxMemoryIncrease / 1024 / 1024)}MB`);

      // Memory growth should be reasonable
      expect(memoryGrowth).toBeLessThan(20 * 1024 * 1024); // Less than 20MB growth
      expect(maxMemoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB peak increase
    }, 30000);

    test('should handle CPU-intensive operations efficiently', async () => {
      const startTime = Date.now();
      const startCpuUsage = process.cpuUsage();

      // Perform CPU-intensive operations (multiple searches)
      const intensiveRequests = Array(8).fill().map((_, index) =>
        request(app)
          .get('/api/search')
          .query({
            q: `intensive search query ${index} with complex terms`,
            limit: 20
          })
      );

      const responses = await Promise.all(intensiveRequests);
      
      const endTime = Date.now();
      const endCpuUsage = process.cpuUsage(startCpuUsage);
      const totalTime = endTime - startTime;

      // Calculate CPU usage
      const cpuUsageMs = (endCpuUsage.user + endCpuUsage.system) / 1000;
      const cpuPercentage = (cpuUsageMs / totalTime) * 100;

      console.log(`CPU intensive test:
        Total time: ${totalTime}ms
        CPU time: ${cpuUsageMs.toFixed(2)}ms
        CPU usage: ${cpuPercentage.toFixed(2)}%`);

      // Performance assertions
      const successfulRequests = responses.filter(r => r.status === 200).length;
      expect(successfulRequests).toBeGreaterThan(5); // At least 5 should succeed
      expect(cpuPercentage).toBeLessThan(200); // Should not max out CPU
    }, 20000);
  });

  describe('Concurrent User Simulation', () => {
    test('should handle multiple concurrent user sessions', async () => {
      const userCount = 10;
      const operationsPerUser = 5;
      
      // Simulate multiple users performing different operations
      const userSessions = Array(userCount).fill().map(async (_, userId) => {
        const operations = [];
        
        // Each user performs multiple operations
        for (let op = 0; op < operationsPerUser; op++) {
          const operation = op % 4;
          
          switch (operation) {
            case 0: // Health check
              operations.push(
                request(app).get('/api/health')
              );
              break;
            case 1: // Document listing
              operations.push(
                request(app)
                  .get('/api/documents')
                  .query({ page: (userId % 3) + 1, limit: 5 })
              );
              break;
            case 2: // Search
              operations.push(
                request(app)
                  .get('/api/search')
                  .query({ q: `user${userId} query${op}`, limit: 5 })
              );
              break;
            case 3: // Processing queue check
              operations.push(
                request(app).get('/api/processing/queue')
              );
              break;
          }
          
          // Small delay between operations for each user
          if (op < operationsPerUser - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        return Promise.all(operations);
      });

      const startTime = Date.now();
      const allUserResponses = await Promise.all(userSessions);
      const totalTime = Date.now() - startTime;

      // Analyze results
      let totalRequests = 0;
      let successfulRequests = 0;
      
      allUserResponses.forEach(userResponses => {
        userResponses.forEach(response => {
          totalRequests++;
          if (response.status === 200) {
            successfulRequests++;
          }
        });
      });

      const successRate = (successfulRequests / totalRequests) * 100;
      const avgRequestsPerSecond = (totalRequests / totalTime) * 1000;

      console.log(`Concurrent user simulation:
        Users: ${userCount}
        Total requests: ${totalRequests}
        Successful: ${successfulRequests}
        Success rate: ${successRate.toFixed(2)}%
        Avg RPS: ${avgRequestsPerSecond.toFixed(2)}
        Total time: ${totalTime}ms`);

      // Performance assertions
      expect(successRate).toBeGreaterThan(85); // At least 85% success rate
      expect(avgRequestsPerSecond).toBeGreaterThan(10); // At least 10 RPS
      expect(totalTime).toBeLessThan(30000); // Complete within 30 seconds
    }, 45000);
  });

  describe('Error Recovery Performance', () => {
    test('should recover quickly from error conditions', async () => {
      // Test recovery from multiple errors
      const errorRequests = Array(5).fill().map(() =>
        request(app)
          .get('/api/documents/invalid-uuid-format')
          .expect(400)
      );

      const startTime = Date.now();
      await Promise.all(errorRequests);
      const errorTime = Date.now() - startTime;

      // Follow up with successful requests
      const successRequests = Array(5).fill().map(() =>
        request(app).get('/api/health').expect(200)
      );

      const recoveryStartTime = Date.now();
      await Promise.all(successRequests);
      const recoveryTime = Date.now() - recoveryStartTime;

      console.log(`Error recovery test:
        Error handling time: ${errorTime}ms
        Recovery time: ${recoveryTime}ms`);

      // Recovery should be fast
      expect(errorTime).toBeLessThan(5000);
      expect(recoveryTime).toBeLessThan(2000);
    }, 15000);

    test('should maintain performance during mixed load', async () => {
      // Mix of successful and error requests
      const mixedRequests = [];
      
      // Add successful requests
      for (let i = 0; i < 10; i++) {
        mixedRequests.push(request(app).get('/api/health'));
      }
      
      // Add error requests
      for (let i = 0; i < 5; i++) {
        mixedRequests.push(request(app).get('/api/documents/invalid-id'));
      }
      
      // Add search requests
      for (let i = 0; i < 5; i++) {
        mixedRequests.push(
          request(app)
            .get('/api/search')
            .query({ q: `mixed load test ${i}`, limit: 5 })
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(mixedRequests);
      const totalTime = Date.now() - startTime;

      // Analyze response distribution
      const statusCounts = {};
      responses.forEach(response => {
        statusCounts[response.status] = (statusCounts[response.status] || 0) + 1;
      });

      console.log(`Mixed load test results:
        Total time: ${totalTime}ms
        Status distribution:`, statusCounts);

      // Should handle mixed load efficiently
      expect(totalTime).toBeLessThan(10000);
      expect(statusCounts[200]).toBeGreaterThan(10); // Most requests should succeed
      expect(statusCounts[400]).toBeGreaterThan(0); // Some should fail as expected
    }, 20000);
  });

  describe('Database Performance Under Load', () => {
    test('should handle database queries efficiently under load', async () => {
      // Skip if storage service not available
      if (!services.storageService) {
        console.log('Skipping database tests - storage service not available');
        return;
      }

      const startTime = Date.now();
      
      // Simulate multiple database operations
      const dbOperations = Array(20).fill().map((_, index) => {
        if (index % 3 === 0) {
          return request(app).get('/api/documents');
        } else if (index % 3 === 1) {
          return request(app)
            .get('/api/search')
            .query({ q: `db test ${index}`, limit: 5 });
        } else {
          return request(app).get('/api/processing/queue');
        }
      });

      const responses = await Promise.all(dbOperations);
      const totalTime = Date.now() - startTime;
      const averageTime = totalTime / responses.length;

      const successfulResponses = responses.filter(r => r.status === 200);
      const successRate = (successfulResponses.length / responses.length) * 100;

      console.log(`Database load test:
        Operations: ${responses.length}
        Successful: ${successfulResponses.length}
        Success rate: ${successRate.toFixed(2)}%
        Total time: ${totalTime}ms
        Average time: ${averageTime.toFixed(2)}ms`);

      // Database should handle load efficiently
      expect(successRate).toBeGreaterThan(90);
      expect(averageTime).toBeLessThan(300);
    }, 25000);
  });
});