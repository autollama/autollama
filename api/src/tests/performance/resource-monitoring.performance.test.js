/**
 * Resource Monitoring and Stress Testing Suite
 * Tests system behavior under extreme conditions and monitors resource usage
 */

const request = require('supertest');
const express = require('express');
const os = require('os');
const fs = require('fs').promises;
const { setupMiddlewareStack, setupErrorHandling } = require('../../middleware');
const { initializeServices } = require('../../services');
const allRoutes = require('../../routes');

describe('Resource Monitoring and Stress Tests', () => {
  let app;
  let services;
  let performanceMetrics = {
    requests: [],
    memorySnapshots: [],
    cpuUsage: [],
    responseTimePercentiles: {}
  };

  beforeAll(async () => {
    // Create Express app
    app = express();
    
    // Initialize services with stress test configuration
    services = await initializeServices({
      skipExternalConnections: true,
      mockMode: true,
      poolSize: 30, // Larger pool for stress testing
      maxConnections: 50
    });

    // Setup middleware with monitoring
    setupMiddlewareStack(app, {
      cors: { securityHeaders: true },
      logging: { 
        requestLogging: { logLevel: 'error' },
        responseLogging: false,
        performance: { 
          slowThreshold: 200, 
          trackMemory: true,
          sampleRate: 1.0 // Track all requests for stress testing
        }
      },
      rateLimit: {
        default: false // Disable for stress testing
      }
    });

    // Add performance monitoring middleware
    app.use((req, res, next) => {
      const startTime = Date.now();
      const startMemory = process.memoryUsage();
      
      res.on('finish', () => {
        const endTime = Date.now();
        const endMemory = process.memoryUsage();
        
        performanceMetrics.requests.push({
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          responseTime: endTime - startTime,
          memoryDelta: endMemory.heapUsed - startMemory.heapUsed,
          timestamp: endTime
        });
      });
      
      next();
    });

    // Setup routes
    app.use('/api', allRoutes.createRoutes(services));
    setupErrorHandling(app);

    // Baseline performance measurement
    await takeSystemSnapshot('baseline');
  }, 30000);

  afterAll(async () => {
    // Generate performance report
    await generatePerformanceReport();
    
    // Cleanup
    if (services.storageService?.close) {
      await services.storageService.close();
    }
  });

  async function takeSystemSnapshot(label) {
    const snapshot = {
      label,
      timestamp: Date.now(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      system: {
        loadAvg: os.loadavg(),
        freeMem: os.freemem(),
        totalMem: os.totalmem(),
        uptime: os.uptime()
      }
    };
    
    performanceMetrics.memorySnapshots.push(snapshot);
    return snapshot;
  }

  async function generatePerformanceReport() {
    if (performanceMetrics.requests.length === 0) return;

    // Calculate response time percentiles
    const responseTimes = performanceMetrics.requests
      .map(r => r.responseTime)
      .sort((a, b) => a - b);

    const percentiles = [50, 75, 90, 95, 99];
    percentiles.forEach(p => {
      const index = Math.floor((p / 100) * responseTimes.length);
      performanceMetrics.responseTimePercentiles[`p${p}`] = responseTimes[index];
    });

    // Calculate request rate
    const firstRequest = Math.min(...performanceMetrics.requests.map(r => r.timestamp));
    const lastRequest = Math.max(...performanceMetrics.requests.map(r => r.timestamp));
    const requestRate = performanceMetrics.requests.length / ((lastRequest - firstRequest) / 1000);

    // Memory analysis
    const memoryData = performanceMetrics.memorySnapshots.map(s => s.memory.heapUsed);
    const maxMemory = Math.max(...memoryData);
    const minMemory = Math.min(...memoryData);

    const report = {
      summary: {
        totalRequests: performanceMetrics.requests.length,
        requestRate: requestRate.toFixed(2),
        avgResponseTime: (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2),
        maxResponseTime: Math.max(...responseTimes),
        minResponseTime: Math.min(...responseTimes)
      },
      percentiles: performanceMetrics.responseTimePercentiles,
      memory: {
        peak: Math.round(maxMemory / 1024 / 1024),
        baseline: Math.round(minMemory / 1024 / 1024),
        growth: Math.round((maxMemory - minMemory) / 1024 / 1024)
      },
      errors: performanceMetrics.requests.filter(r => r.statusCode >= 400).length
    };

    console.log('\n📊 Performance Test Report:');
    console.log(JSON.stringify(report, null, 2));

    // Save detailed report to file for analysis
    try {
      await fs.writeFile(
        '/tmp/autollama-performance-report.json',
        JSON.stringify({ report, raw: performanceMetrics }, null, 2)
      );
      console.log('📁 Detailed report saved to /tmp/autollama-performance-report.json');
    } catch (error) {
      console.warn('Could not save performance report:', error.message);
    }
  }

  describe('Memory Stress Testing', () => {
    test('should handle memory-intensive operations', async () => {
      await takeSystemSnapshot('memory-test-start');

      // Create large payloads to test memory handling
      const largeQueries = Array(20).fill().map((_, i) => ({
        q: `memory stress test query ${i} `.repeat(100), // Large query strings
        limit: 50
      }));

      const memoryRequests = largeQueries.map(query =>
        request(app)
          .get('/api/search')
          .query(query)
      );

      const responses = await Promise.all(memoryRequests);
      await takeSystemSnapshot('memory-test-end');

      // Check for memory leaks
      const startSnapshot = performanceMetrics.memorySnapshots.find(s => s.label === 'memory-test-start');
      const endSnapshot = performanceMetrics.memorySnapshots.find(s => s.label === 'memory-test-end');
      
      const memoryGrowth = endSnapshot.memory.heapUsed - startSnapshot.memory.heapUsed;
      const memoryGrowthMB = Math.round(memoryGrowth / 1024 / 1024);

      console.log(`Memory stress test: ${memoryGrowthMB}MB growth after ${responses.length} large requests`);

      // Memory growth should be reasonable
      expect(memoryGrowthMB).toBeLessThan(100); // Less than 100MB growth
      
      // Most requests should succeed
      const successfulRequests = responses.filter(r => r.status === 200).length;
      expect(successfulRequests / responses.length).toBeGreaterThan(0.8);
    }, 30000);

    test('should recover memory after garbage collection', async () => {
      const beforeGC = process.memoryUsage();

      // Generate garbage
      for (let i = 0; i < 10; i++) {
        await request(app)
          .get('/api/search')
          .query({ q: `gc test ${i}`, limit: 20 });
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        // Wait for GC to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const afterGC = process.memoryUsage();
      const memoryRecovered = beforeGC.heapUsed - afterGC.heapUsed;
      
      console.log(`Memory recovery test: ${Math.round(memoryRecovered / 1024 / 1024)}MB difference after GC`);

      // Memory usage should not continuously grow
      expect(afterGC.heapUsed).toBeLessThan(beforeGC.heapUsed * 1.5);
    });
  });

  describe('CPU Stress Testing', () => {
    test('should handle CPU-intensive workloads', async () => {
      const startCpuUsage = process.cpuUsage();
      await takeSystemSnapshot('cpu-test-start');

      // CPU-intensive operations (multiple complex searches)
      const cpuIntensiveRequests = [];
      
      for (let batch = 0; batch < 5; batch++) {
        const batchRequests = Array(10).fill().map((_, i) =>
          request(app)
            .get('/api/search')
            .query({
              q: `cpu intensive query batch ${batch} item ${i} with complex search terms`,
              limit: 25
            })
        );
        
        cpuIntensiveRequests.push(...batchRequests);
      }

      const responses = await Promise.all(cpuIntensiveRequests);
      
      const endCpuUsage = process.cpuUsage(startCpuUsage);
      await takeSystemSnapshot('cpu-test-end');

      const totalCpuMs = (endCpuUsage.user + endCpuUsage.system) / 1000;
      const successfulRequests = responses.filter(r => r.status === 200).length;
      const throughput = successfulRequests / (totalCpuMs / 1000);

      console.log(`CPU stress test:
        Total requests: ${responses.length}
        Successful: ${successfulRequests}
        CPU time: ${totalCpuMs.toFixed(2)}ms
        Throughput: ${throughput.toFixed(2)} requests/cpu-second`);

      // Should handle CPU load efficiently
      expect(successfulRequests).toBeGreaterThan(responses.length * 0.7); // At least 70% success
      expect(throughput).toBeGreaterThan(5); // At least 5 requests per CPU second
    }, 40000);
  });

  describe('Concurrency Stress Testing', () => {
    test('should handle high concurrency levels', async () => {
      const concurrencyLevels = [10, 25, 50, 75];
      const results = {};

      for (const concurrency of concurrencyLevels) {
        const startTime = Date.now();
        await takeSystemSnapshot(`concurrency-${concurrency}-start`);

        const requests = Array(concurrency).fill().map((_, i) =>
          request(app)
            .get('/api/health')
            .expect(res => {
              // Track response times for this concurrency level
              if (!results[concurrency]) {
                results[concurrency] = { responseTimes: [], errors: 0 };
              }
              results[concurrency].responseTimes.push(Date.now() - startTime);
            })
        );

        const responses = await Promise.all(requests);
        const endTime = Date.now();
        await takeSystemSnapshot(`concurrency-${concurrency}-end`);

        const successfulRequests = responses.filter(r => r.status === 200).length;
        const totalTime = endTime - startTime;
        const requestsPerSecond = (successfulRequests / totalTime) * 1000;

        results[concurrency] = {
          ...results[concurrency],
          successfulRequests,
          totalTime,
          requestsPerSecond: requestsPerSecond.toFixed(2),
          successRate: ((successfulRequests / concurrency) * 100).toFixed(2)
        };

        console.log(`Concurrency ${concurrency}: ${results[concurrency].successRate}% success, ${results[concurrency].requestsPerSecond} RPS`);

        // Brief pause between concurrency tests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Analyze concurrency scaling
      concurrencyLevels.forEach(level => {
        const result = results[level];
        expect(parseFloat(result.successRate)).toBeGreaterThan(95); // High success rate
        expect(parseFloat(result.requestsPerSecond)).toBeGreaterThan(level * 0.5); // Reasonable throughput
      });

      console.log('Concurrency scaling results:', results);
    }, 60000);

    test('should maintain performance under sustained concurrent load', async () => {
      const sustainedDuration = 10000; // 10 seconds
      const concurrentUsers = 20;
      const requestInterval = 500; // Request every 500ms per user

      const startTime = Date.now();
      const userSessions = [];

      // Start concurrent user sessions
      for (let userId = 0; userId < concurrentUsers; userId++) {
        const userSession = async () => {
          const requests = [];
          const endTime = startTime + sustainedDuration;

          while (Date.now() < endTime) {
            const requestStart = Date.now();
            
            try {
              const response = await request(app)
                .get('/api/health')
                .timeout(5000);
              
              requests.push({
                userId,
                timestamp: requestStart,
                responseTime: Date.now() - requestStart,
                status: response.status
              });
            } catch (error) {
              requests.push({
                userId,
                timestamp: requestStart,
                responseTime: Date.now() - requestStart,
                status: 'error',
                error: error.message
              });
            }

            // Wait before next request
            await new Promise(resolve => setTimeout(resolve, requestInterval));
          }

          return requests;
        };

        userSessions.push(userSession());
      }

      // Wait for all user sessions to complete
      const allUserRequests = await Promise.all(userSessions);
      const flattenedRequests = allUserRequests.flat();

      // Analyze sustained load performance
      const totalRequests = flattenedRequests.length;
      const successfulRequests = flattenedRequests.filter(r => r.status === 200).length;
      const averageResponseTime = flattenedRequests
        .filter(r => r.status === 200)
        .reduce((sum, r) => sum + r.responseTime, 0) / successfulRequests;

      const actualDuration = (Date.now() - startTime) / 1000;
      const actualThroughput = totalRequests / actualDuration;

      console.log(`Sustained load test (${actualDuration.toFixed(1)}s):
        Total requests: ${totalRequests}
        Successful: ${successfulRequests}
        Success rate: ${((successfulRequests / totalRequests) * 100).toFixed(2)}%
        Avg response time: ${averageResponseTime.toFixed(2)}ms
        Throughput: ${actualThroughput.toFixed(2)} RPS`);

      // Performance assertions for sustained load
      expect(successfulRequests / totalRequests).toBeGreaterThan(0.95); // 95% success rate
      expect(averageResponseTime).toBeLessThan(1000); // Average response < 1s
      expect(actualThroughput).toBeGreaterThan(10); // At least 10 RPS
    }, 20000);
  });

  describe('Error Handling Under Stress', () => {
    test('should maintain stability during error conditions', async () => {
      await takeSystemSnapshot('error-stress-start');

      // Mix of valid and invalid requests
      const stressRequests = [];
      
      // Valid requests
      for (let i = 0; i < 20; i++) {
        stressRequests.push(request(app).get('/api/health'));
      }
      
      // Invalid requests that should cause errors
      for (let i = 0; i < 10; i++) {
        stressRequests.push(request(app).get('/api/documents/invalid-id'));
        stressRequests.push(request(app).get('/api/nonexistent-endpoint'));
      }
      
      // Malformed requests
      for (let i = 0; i < 5; i++) {
        stressRequests.push(
          request(app)
            .post('/api/search/vector')
            .send({ invalid: 'data' })
        );
      }

      const responses = await Promise.all(stressRequests);
      await takeSystemSnapshot('error-stress-end');

      // Analyze error handling
      const statusCounts = {};
      responses.forEach(response => {
        statusCounts[response.status] = (statusCounts[response.status] || 0) + 1;
      });

      console.log('Error stress test status distribution:', statusCounts);

      // Should handle errors gracefully without crashing
      expect(statusCounts[200]).toBeGreaterThan(15); // Most valid requests succeed
      expect(statusCounts[400] + statusCounts[404]).toBeGreaterThan(10); // Errors handled properly
      expect(statusCounts[500] || 0).toBeLessThan(5); // Minimal server errors

      // System should remain stable
      const startSnapshot = performanceMetrics.memorySnapshots.find(s => s.label === 'error-stress-start');
      const endSnapshot = performanceMetrics.memorySnapshots.find(s => s.label === 'error-stress-end');
      const memoryGrowth = endSnapshot.memory.heapUsed - startSnapshot.memory.heapUsed;
      
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // Less than 50MB growth during error handling
    }, 25000);
  });

  describe('Resource Cleanup Testing', () => {
    test('should properly clean up resources after operations', async () => {
      const initialSnapshot = await takeSystemSnapshot('cleanup-test-start');

      // Perform operations that might leave resources
      const cleanupRequests = [];
      
      for (let i = 0; i < 15; i++) {
        cleanupRequests.push(
          request(app)
            .get('/api/search')
            .query({ q: `cleanup test ${i}`, limit: 10 })
        );
      }

      await Promise.all(cleanupRequests);

      // Wait for potential cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));

      const intermediateSnapshot = await takeSystemSnapshot('cleanup-test-intermediate');

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const finalSnapshot = await takeSystemSnapshot('cleanup-test-end');

      // Analyze resource cleanup
      const memoryAfterOps = intermediateSnapshot.memory.heapUsed - initialSnapshot.memory.heapUsed;
      const memoryAfterCleanup = finalSnapshot.memory.heapUsed - initialSnapshot.memory.heapUsed;
      const memoryRecovered = memoryAfterOps - memoryAfterCleanup;

      console.log(`Resource cleanup test:
        Memory after operations: +${Math.round(memoryAfterOps / 1024 / 1024)}MB
        Memory after cleanup: +${Math.round(memoryAfterCleanup / 1024 / 1024)}MB
        Memory recovered: ${Math.round(memoryRecovered / 1024 / 1024)}MB`);

      // Resources should be properly cleaned up
      expect(memoryAfterCleanup).toBeLessThan(memoryAfterOps * 1.2); // Some cleanup should occur
    });
  });
});