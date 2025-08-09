/**
 * Jest Configuration for AutoLlama API
 * Simplified configuration to avoid Babel issues
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/src/**/*.test.js',
    '**/src/**/*.spec.js',
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  
  // Coverage configuration (simplified)
  collectCoverage: false, // Disable for now to avoid Babel issues
  
  // Setup and teardown
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],
  
  // Test timeout
  testTimeout: 10000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Disable transforms to avoid Babel
  transform: {},
  
  // Module paths for better resolution
  modulePaths: ['<rootDir>', '<rootDir>/src', '<rootDir>/node_modules'],
  
  // Module resolution settings
  moduleDirectories: ['node_modules', 'src'],
  
  // Test results processor
  maxWorkers: 2,
  
  // Force exit after tests complete
  forceExit: true
};