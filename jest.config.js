/**
 * Jest Configuration for AutoLlama v3.0
 * 🦙 Test configuration supporting both unit and integration tests
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Environment variables for testing
  setupFiles: ['<rootDir>/tests/jest.env.js'],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'api/src/**/*.js',
    'lib/**/*.js',
    'bin/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**'
  ],
  
  // Module resolution
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Transform configuration
  transform: {},
  
  // Test timeout
  testTimeout: 30000,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Verbose output for better debugging
  verbose: true,
  
  // Exit on first failure during CI
  bail: process.env.CI ? 1 : 0
};