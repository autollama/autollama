/**
 * Performance Test Setup
 * Setup file for individual performance tests
 */

const { PerformanceMonitor } = require('./performance-utils');

// Global performance monitor for sharing between tests
global.performanceMonitor = new PerformanceMonitor();

// Performance assertion helpers
global.expectPerformance = {
  responseTimeToBeBelow: (responseTime, threshold) => {
    expect(responseTime).toBeLessThan(threshold);
  },
  
  memoryUsageToBeStable: (memoryBefore, memoryAfter, maxGrowthMB = 50) => {
    const growthMB = (memoryAfter - memoryBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(maxGrowthMB);
  },
  
  requestsPerSecondToBeAbove: (requests, durationMs, minRPS) => {
    const actualRPS = (requests / durationMs) * 1000;
    expect(actualRPS).toBeGreaterThan(minRPS);
  },
  
  successRateToBeAbove: (successful, total, minRate = 0.95) => {
    const rate = successful / total;
    expect(rate).toBeGreaterThan(minRate);
  }
};

// Memory utilities
global.memoryUtils = {
  getCurrentUsage: () => process.memoryUsage(),
  
  forceGC: () => {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  },
  
  waitForGC: async (timeoutMs = 2000) => {
    if (global.gc) {
      global.gc();
      // Wait for GC to complete
      await new Promise(resolve => setTimeout(resolve, Math.min(timeoutMs, 1000)));
    }
  },
  
  measureMemoryDelta: (before, after) => ({
    heapUsed: after.heapUsed - before.heapUsed,
    heapTotal: after.heapTotal - before.heapTotal,
    external: after.external - before.external,
    rss: after.rss - before.rss
  })
};

// Performance timing utilities
global.timeUtils = {
  measure: async (asyncFn) => {
    const start = Date.now();
    const result = await asyncFn();
    const duration = Date.now() - start;
    return { result, duration };
  },
  
  measureCPU: async (asyncFn) => {
    const startCPU = process.cpuUsage();
    const start = Date.now();
    const result = await asyncFn();
    const endCPU = process.cpuUsage(startCPU);
    const duration = Date.now() - start;
    
    return {
      result,
      duration,
      cpuUsage: {
        user: endCPU.user / 1000, // Convert to milliseconds
        system: endCPU.system / 1000,
        total: (endCPU.user + endCPU.system) / 1000
      }
    };
  }
};

// Test data generators for load testing
global.testDataGenerators = {
  generateLargeQuery: (sizeKB = 10) => {
    const targetSize = sizeKB * 1024;
    const baseQuery = 'performance test query with various search terms ';
    const repetitions = Math.ceil(targetSize / baseQuery.length);
    return baseQuery.repeat(repetitions).substring(0, targetSize);
  },
  
  generateRandomQueries: (count = 10) => {
    const terms = [
      'artificial intelligence', 'machine learning', 'data science',
      'neural networks', 'deep learning', 'natural language processing',
      'computer vision', 'robotics', 'automation', 'algorithms',
      'data analysis', 'statistics', 'programming', 'software development',
      'cloud computing', 'distributed systems', 'microservices'
    ];
    
    return Array(count).fill().map((_, i) => {
      const randomTerms = Array(3).fill().map(() => 
        terms[Math.floor(Math.random() * terms.length)]
      );
      return `${randomTerms.join(' ')} test query ${i}`;
    });
  },
  
  generateTestFile: (sizeKB = 100) => {
    const content = `
# Performance Test Document

This is a generated test document for performance testing purposes.

## Introduction

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod 
tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

## Content Section

`.repeat(Math.ceil(sizeKB / 2));
    
    return Buffer.from(content, 'utf8');
  }
};

// Console utilities for performance testing
global.perfLog = {
  info: (message, data = null) => {
    if (process.env.PERFORMANCE_TEST_VERBOSE) {
      console.log(`🔍 ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  },
  
  metric: (name, value, unit = '') => {
    console.log(`📊 ${name}: ${value}${unit}`);
  },
  
  summary: (title, metrics) => {
    console.log(`\n📈 ${title}:`);
    Object.entries(metrics).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
    console.log('');
  }
};

// Cleanup after each test
afterEach(() => {
  // Reset performance monitor if it was used
  if (global.performanceMonitor && global.performanceMonitor.metrics.requests.length > 0) {
    global.performanceMonitor.reset();
  }
  
  // Force garbage collection between tests if available
  if (global.gc && Math.random() < 0.3) { // 30% chance to reduce overhead
    global.gc();
  }
});

// Setup completion
console.log('✅ Performance test helpers loaded');
if (global.gc) {
  console.log('✅ Garbage collection available');
} else {
  console.log('⚠️  Run with --expose-gc for enhanced memory testing');
}