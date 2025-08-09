/**
 * Performance Testing Utilities
 * Helper functions for performance and load testing
 */

const os = require('os');
const fs = require('fs').promises;

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: [],
      snapshots: [],
      errors: [],
      responseTimeHistogram: {},
      memoryPeaks: []
    };
    this.startTime = null;
  }

  start() {
    this.startTime = Date.now();
    this.takeSnapshot('monitor-start');
  }

  recordRequest(method, url, statusCode, responseTime, memoryUsage = null) {
    const record = {
      method,
      url,
      statusCode,
      responseTime,
      timestamp: Date.now(),
      memoryUsage
    };
    
    this.metrics.requests.push(record);
    
    // Update histogram
    const bucket = this.getResponseTimeBucket(responseTime);
    this.metrics.responseTimeHistogram[bucket] = (this.metrics.responseTimeHistogram[bucket] || 0) + 1;
    
    if (statusCode >= 400) {
      this.metrics.errors.push(record);
    }
  }

  takeSnapshot(label) {
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
    
    this.metrics.snapshots.push(snapshot);
    
    // Track memory peaks
    if (this.metrics.memoryPeaks.length === 0 || 
        snapshot.memory.heapUsed > Math.max(...this.metrics.memoryPeaks)) {
      this.metrics.memoryPeaks.push(snapshot.memory.heapUsed);
    }
    
    return snapshot;
  }

  getResponseTimeBucket(responseTime) {
    if (responseTime < 50) return '0-50ms';
    if (responseTime < 100) return '50-100ms';
    if (responseTime < 200) return '100-200ms';
    if (responseTime < 500) return '200-500ms';
    if (responseTime < 1000) return '500ms-1s';
    if (responseTime < 2000) return '1-2s';
    return '2s+';
  }

  calculatePercentiles(values, percentiles = [50, 75, 90, 95, 99]) {
    const sorted = [...values].sort((a, b) => a - b);
    const result = {};
    
    percentiles.forEach(p => {
      const index = Math.floor((p / 100) * sorted.length);
      result[`p${p}`] = sorted[index] || 0;
    });
    
    return result;
  }

  generateReport() {
    if (this.metrics.requests.length === 0) {
      return { error: 'No requests recorded' };
    }

    const responseTimes = this.metrics.requests.map(r => r.responseTime);
    const successfulRequests = this.metrics.requests.filter(r => r.statusCode < 400);
    const duration = (Date.now() - this.startTime) / 1000;

    const report = {
      summary: {
        totalRequests: this.metrics.requests.length,
        successfulRequests: successfulRequests.length,
        failedRequests: this.metrics.errors.length,
        successRate: ((successfulRequests.length / this.metrics.requests.length) * 100).toFixed(2),
        duration: duration.toFixed(2),
        requestsPerSecond: (this.metrics.requests.length / duration).toFixed(2),
        avgResponseTime: (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2),
        minResponseTime: Math.min(...responseTimes),
        maxResponseTime: Math.max(...responseTimes)
      },
      percentiles: this.calculatePercentiles(responseTimes),
      responseTimeHistogram: this.metrics.responseTimeHistogram,
      memory: {
        snapshots: this.metrics.snapshots.length,
        peakUsage: Math.max(...this.metrics.memoryPeaks.map(p => Math.round(p / 1024 / 1024))),
        currentUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
      },
      errors: {
        total: this.metrics.errors.length,
        byStatus: this.getErrorsByStatus(),
        samples: this.metrics.errors.slice(0, 5) // First 5 errors as samples
      }
    };

    return report;
  }

  getErrorsByStatus() {
    const errorsByStatus = {};
    this.metrics.errors.forEach(error => {
      errorsByStatus[error.statusCode] = (errorsByStatus[error.statusCode] || 0) + 1;
    });
    return errorsByStatus;
  }

  async saveReport(filename = null) {
    const report = this.generateReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFilename = `/tmp/performance-report-${timestamp}.json`;
    const filepath = filename || defaultFilename;

    try {
      await fs.writeFile(filepath, JSON.stringify({
        report,
        rawMetrics: this.metrics,
        systemInfo: {
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB'
        }
      }, null, 2));
      
      return filepath;
    } catch (error) {
      console.warn('Could not save performance report:', error.message);
      return null;
    }
  }

  reset() {
    this.metrics = {
      requests: [],
      snapshots: [],
      errors: [],
      responseTimeHistogram: {},
      memoryPeaks: []
    };
    this.startTime = null;
  }
}

class LoadTestRunner {
  constructor(app) {
    this.app = app;
    this.monitor = new PerformanceMonitor();
  }

  async runConcurrencyTest(endpoint, concurrencyLevels = [1, 5, 10, 25, 50]) {
    const results = {};
    
    for (const concurrency of concurrencyLevels) {
      console.log(`\nTesting concurrency level: ${concurrency}`);
      
      this.monitor.reset();
      this.monitor.start();
      
      const requests = Array(concurrency).fill().map(() => this.makeRequest(endpoint));
      const responses = await Promise.all(requests);
      
      const report = this.monitor.generateReport();
      results[concurrency] = {
        ...report.summary,
        percentiles: report.percentiles
      };
      
      console.log(`Concurrency ${concurrency}: ${report.summary.successRate}% success, ${report.summary.requestsPerSecond} RPS`);
      
      // Brief pause between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
  }

  async runSustainedLoadTest(endpoint, { duration = 30000, rps = 10, concurrency = 5 }) {
    console.log(`\nRunning sustained load test: ${rps} RPS for ${duration/1000}s with ${concurrency} concurrent users`);
    
    this.monitor.reset();
    this.monitor.start();
    
    const interval = 1000 / rps;
    const endTime = Date.now() + duration;
    const userPromises = [];
    
    // Start concurrent users
    for (let i = 0; i < concurrency; i++) {
      const userLoad = async () => {
        while (Date.now() < endTime) {
          try {
            await this.makeRequest(endpoint);
            await new Promise(resolve => setTimeout(resolve, interval * concurrency));
          } catch (error) {
            // Continue on error
          }
        }
      };
      
      userPromises.push(userLoad());
    }
    
    await Promise.all(userPromises);
    
    return this.monitor.generateReport();
  }

  async makeRequest(endpoint) {
    const request = require('supertest');
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    
    try {
      const response = await request(this.app).get(endpoint);
      const responseTime = Date.now() - startTime;
      const endMemory = process.memoryUsage();
      
      this.monitor.recordRequest(
        'GET',
        endpoint,
        response.status,
        responseTime,
        endMemory.heapUsed - startMemory.heapUsed
      );
      
      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.monitor.recordRequest('GET', endpoint, 500, responseTime);
      throw error;
    }
  }
}

class MemoryProfiler {
  constructor() {
    this.profiles = [];
    this.isRunning = false;
    this.interval = null;
  }

  start(intervalMs = 1000) {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.profiles = [];
    
    this.interval = setInterval(() => {
      const profile = {
        timestamp: Date.now(),
        memory: process.memoryUsage(),
        gc: this.getGCStats()
      };
      
      this.profiles.push(profile);
    }, intervalMs);
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getGCStats() {
    // Try to get GC stats if available
    try {
      return {
        available: typeof global.gc === 'function',
        forced: false
      };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  forceGC() {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }

  getMemoryTrend() {
    if (this.profiles.length < 2) return null;
    
    const first = this.profiles[0];
    const last = this.profiles[this.profiles.length - 1];
    const duration = last.timestamp - first.timestamp;
    
    return {
      duration: duration,
      heapGrowth: last.memory.heapUsed - first.memory.heapUsed,
      heapGrowthRate: ((last.memory.heapUsed - first.memory.heapUsed) / duration) * 1000, // bytes per second
      peakHeap: Math.max(...this.profiles.map(p => p.memory.heapUsed)),
      averageHeap: this.profiles.reduce((sum, p) => sum + p.memory.heapUsed, 0) / this.profiles.length
    };
  }

  generateMemoryReport() {
    const trend = this.getMemoryTrend();
    const current = process.memoryUsage();
    
    return {
      current: {
        heapUsed: Math.round(current.heapUsed / 1024 / 1024),
        heapTotal: Math.round(current.heapTotal / 1024 / 1024),
        external: Math.round(current.external / 1024 / 1024),
        rss: Math.round(current.rss / 1024 / 1024)
      },
      trend: trend ? {
        duration: Math.round(trend.duration / 1000),
        heapGrowth: Math.round(trend.heapGrowth / 1024 / 1024),
        heapGrowthRate: Math.round(trend.heapGrowthRate / 1024),
        peakHeap: Math.round(trend.peakHeap / 1024 / 1024),
        averageHeap: Math.round(trend.averageHeap / 1024 / 1024)
      } : null,
      profiles: this.profiles.length,
      gcAvailable: typeof global.gc === 'function'
    };
  }
}

function createPerformanceTestSuite(app, options = {}) {
  const {
    endpoints = ['/api/health'],
    concurrencyLevels = [1, 5, 10, 25],
    sustainedLoadDuration = 30000,
    sustainedLoadRPS = 10,
    memoryProfilingInterval = 1000
  } = options;

  return {
    monitor: new PerformanceMonitor(),
    loadTester: new LoadTestRunner(app),
    memoryProfiler: new MemoryProfiler(),
    
    async runFullPerformanceTest() {
      console.log('🚀 Starting comprehensive performance test suite...\n');
      
      const results = {
        concurrencyTests: {},
        sustainedLoadTests: {},
        memoryProfile: null
      };
      
      // Start memory profiling
      this.memoryProfiler.start(memoryProfilingInterval);
      
      // Run concurrency tests for each endpoint
      for (const endpoint of endpoints) {
        console.log(`\n📊 Testing endpoint: ${endpoint}`);
        results.concurrencyTests[endpoint] = await this.loadTester.runConcurrencyTest(endpoint, concurrencyLevels);
      }
      
      // Run sustained load test
      console.log('\n⏱️  Running sustained load test...');
      results.sustainedLoadTests = await this.loadTester.runSustainedLoadTest(endpoints[0], {
        duration: sustainedLoadDuration,
        rps: sustainedLoadRPS
      });
      
      // Stop memory profiling and get report
      this.memoryProfiler.stop();
      results.memoryProfile = this.memoryProfiler.generateMemoryReport();
      
      console.log('\n✅ Performance test suite completed!\n');
      return results;
    }
  };
}

module.exports = {
  PerformanceMonitor,
  LoadTestRunner,
  MemoryProfiler,
  createPerformanceTestSuite
};