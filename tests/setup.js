/**
 * Jest Test Setup
 * 🦙 Global test configuration and utilities
 */

const fs = require('fs-extra');
const path = require('path');

// Global test timeout
jest.setTimeout(30000);

// Mock external services by default
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} })
  })),
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} })
}));

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: {
      create: jest.fn().mockResolvedValue({
        data: [{ embedding: new Array(1536).fill(0.1) }]
      })
    },
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test response' } }]
        })
      }
    }
  }));
});

// Mock file system operations that might fail in test environment
const originalWriteFile = fs.writeFile;
fs.writeFile = jest.fn().mockImplementation(async (filePath, content) => {
  if (filePath.includes('/tmp/') || filePath.includes('test')) {
    return Promise.resolve();
  }
  return originalWriteFile(filePath, content);
});

// Suppress console output during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  
  // Restore for specific test debugging
  global.restoreConsole = () => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  };
}

// Clean up after tests
afterEach(() => {
  jest.clearAllMocks();
});

// Global test utilities
global.testUtils = {
  createTempDir: () => {
    const tmpDir = fs.mkdtempSync(path.join(__dirname, 'temp-'));
    return tmpDir;
  },
  
  cleanupTempDir: async (dirPath) => {
    if (dirPath && dirPath.includes('temp-')) {
      await fs.remove(dirPath);
    }
  },
  
  mockConfig: {
    database: {
      type: 'sqlite',
      path: ':memory:'
    },
    deployment: 'test',
    ai: {
      provider: 'openai',
      apiKey: 'test-key'
    }
  }
};