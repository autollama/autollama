/**
 * Jest Configuration for Performance Tests
 * Optimized settings for load testing and performance monitoring
 */

module.exports = {
  // Extend the base Jest config
  ...require('./jest.config.js'),
  
  // Performance test specific settings
  displayName: 'Performance Tests',
  
  // Only run performance tests
  testMatch: [
    '<rootDir>/src/tests/performance/**/*.performance.test.js',
    '<rootDir>/src/tests/e2e/**/*.e2e.test.js'
  ],
  
  // Longer timeouts for performance tests
  testTimeout: 120000, // 2 minutes per test
  
  // Run tests serially to avoid resource conflicts
  maxWorkers: 1,
  
  // Reduce console noise during performance tests
  verbose: false,
  silent: false,
  
  // Memory and performance specific settings
  logHeapUsage: true,
  detectOpenHandles: true,
  detectLeaks: true,
  
  // Custom test environment for performance testing
  testEnvironment: 'node',
  
  // Global setup for performance tests
  globalSetup: '<rootDir>/src/tests/performance/performance-setup.js',
  globalTeardown: '<rootDir>/src/tests/performance/performance-teardown.js',
  
  // Performance test specific globals
  globals: {
    PERFORMANCE_TEST_MODE: true,
    MAX_MEMORY_USAGE_MB: 500,
    MAX_RESPONSE_TIME_MS: 5000,
    MIN_REQUESTS_PER_SECOND: 10
  },
  
  // Enhanced reporting for performance
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './test-results',
        outputName: 'performance-test-results.xml',
        suiteName: 'Performance Tests'
      }
    ]
  ],
  
  // Collect coverage but don't enforce thresholds for performance tests
  collectCoverage: false,
  
  // Setup files for performance testing
  setupFilesAfterEnv: ['<rootDir>/src/tests/performance/performance-test-setup.js']
};