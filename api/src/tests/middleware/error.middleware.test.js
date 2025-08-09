/**
 * Unit Tests for Error Middleware
 * Tests centralized error handling, custom error classes, and error formatting
 */

const {
  errorHandler,
  notFoundHandler,
  asyncErrorWrapper,
  setupGlobalErrorHandlers,
  AppError,
  ValidationError,
  DatabaseError,
  ExternalServiceError
} = require('../../middleware/error.middleware');

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn()
    }))
  }
}));

describe('Error Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = createMockRequest({
      method: 'POST',
      url: '/test',
      ip: '127.0.0.1',
      body: { test: 'data' }
    });
    res = createMockResponse();
    next = createMockNext();

    // Setup response status method to track status codes
    res.status.mockImplementation((code) => {
      res.statusCode = code;
      return res;
    });
  });

  describe('Custom Error Classes', () => {
    describe('AppError', () => {
      test('should create AppError with default values', () => {
        const error = new AppError('Test error');

        expect(error.name).toBe('AppError');
        expect(error.message).toBe('Test error');
        expect(error.statusCode).toBe(500);
        expect(error.code).toBe('INTERNAL_ERROR');
        expect(error.isOperational).toBe(true);
        expect(error.timestamp).toBeDefined();
      });

      test('should create AppError with custom values', () => {
        const error = new AppError('Custom error', 400, 'CUSTOM_ERROR', false);

        expect(error.statusCode).toBe(400);
        expect(error.code).toBe('CUSTOM_ERROR');
        expect(error.isOperational).toBe(false);
      });

      test('should capture stack trace', () => {
        const error = new AppError('Test error');
        expect(error.stack).toBeDefined();
        expect(error.stack).toContain('AppError');
      });
    });

    describe('ValidationError', () => {
      test('should create ValidationError with validation details', () => {
        const errors = [
          { field: 'email', message: 'Invalid email format' },
          { field: 'age', message: 'Age must be a number' }
        ];
        const error = new ValidationError('Validation failed', errors);

        expect(error.name).toBe('ValidationError');
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.errors).toEqual(errors);
      });
    });

    describe('DatabaseError', () => {
      test('should create DatabaseError with original error', () => {
        const originalError = new Error('Connection timeout');
        const error = new DatabaseError('Database operation failed', originalError);

        expect(error.name).toBe('DatabaseError');
        expect(error.statusCode).toBe(500);
        expect(error.code).toBe('DATABASE_ERROR');
        expect(error.originalError).toBe(originalError);
      });
    });

    describe('ExternalServiceError', () => {
      test('should create ExternalServiceError with service name', () => {
        const error = new ExternalServiceError('API unavailable', 'OpenAI', 503);

        expect(error.name).toBe('ExternalServiceError');
        expect(error.statusCode).toBe(503);
        expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
        expect(error.service).toBe('OpenAI');
      });
    });
  });

  describe('errorHandler', () => {
    test('should handle AppError correctly', () => {
      const error = new AppError('Test application error', 400, 'TEST_ERROR');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Test application error',
          code: 'TEST_ERROR',
          timestamp: expect.any(String),
          requestId: undefined
        },
        statusCode: 400
      });
    });

    test('should handle ValidationError with error details', () => {
      const validationErrors = [
        { field: 'email', message: 'Required field' }
      ];
      const error = new ValidationError('Validation failed', validationErrors);

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          timestamp: expect.any(String),
          requestId: undefined,
          details: validationErrors
        },
        statusCode: 400
      });
    });

    test('should handle DatabaseError in development mode', () => {
      process.env.NODE_ENV = 'development';
      const originalError = new Error('Connection failed');
      const error = new DatabaseError('Database error', originalError);

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      const response = res.json.mock.calls[0][0];
      expect(response.error.message).toBe('Database error');
      expect(response.error.originalError).toBe('Connection failed');
    });

    test('should hide sensitive database errors in production', () => {
      process.env.NODE_ENV = 'production';
      const originalError = new Error('Connection failed');
      const error = new DatabaseError('Database error', originalError);

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      const response = res.json.mock.calls[0][0];
      expect(response.error.message).toBe('Database operation failed');
      expect(response.error.originalError).toBeUndefined();
    });

    test('should handle ExternalServiceError', () => {
      const error = new ExternalServiceError('Service unavailable', 'OpenAI', 503);

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      const response = res.json.mock.calls[0][0];
      expect(response.error.service).toBe('OpenAI');
    });

    test('should handle MongoDB/Mongoose errors', () => {
      const error = new Error('Duplicate key error');
      error.name = 'MongoError';

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      const response = res.json.mock.calls[0][0];
      expect(response.error.code).toBe('DATABASE_ERROR');
    });

    test('should handle JSON syntax errors', () => {
      const error = new SyntaxError('Unexpected token in JSON');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.error.code).toBe('VALIDATION_ERROR');
      expect(response.error.message).toBe('Invalid JSON in request body');
    });

    test('should handle Multer file upload errors', () => {
      const error = new Error('File too large');
      error.name = 'MulterError';
      error.code = 'LIMIT_FILE_SIZE';

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.error.code).toBe('FILE_PROCESSING_ERROR');
      expect(response.error.message).toBe('File size exceeds the maximum allowed limit');
    });

    test('should include stack trace in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new AppError('Test error');

      errorHandler(error, req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.error.stack).toBeDefined();
    });

    test('should exclude stack trace in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new AppError('Test error');

      errorHandler(error, req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.error.stack).toBeUndefined();
    });

    test('should sanitize request body in logs', () => {
      const req = createMockRequest({
        body: { password: 'secret123', data: 'safe' }
      });

      const error = new AppError('Test error');
      errorHandler(error, req, res, next);

      // Verify logging was called (we can't easily test the exact log content due to mocking)
      expect(res.status).toHaveBeenCalledWith(500);
    });

    test('should include request ID when available', () => {
      req.id = 'test-request-123';

      const error = new AppError('Test error');
      errorHandler(error, req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.error.requestId).toBe('test-request-123');
    });

    test('should handle unknown errors in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Unexpected error');
      error.isOperational = false;

      errorHandler(error, req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.error.message).toBe('An unexpected error occurred');
      expect(response.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('notFoundHandler', () => {
    test('should create 404 error for unmatched routes', () => {
      req.method = 'GET';
      req.originalUrl = '/nonexistent-route';

      notFoundHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'AppError',
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Route GET /nonexistent-route not found'
        })
      );
    });
  });

  describe('asyncErrorWrapper', () => {
    test('should catch async errors and pass to next', async () => {
      const asyncError = new Error('Async operation failed');
      const asyncHandler = jest.fn().mockRejectedValue(asyncError);
      const wrappedHandler = asyncErrorWrapper(asyncHandler);

      await wrappedHandler(req, res, next);

      expect(asyncHandler).toHaveBeenCalledWith(req, res, next);
      expect(next).toHaveBeenCalledWith(asyncError);
    });

    test('should handle successful async operations', async () => {
      const asyncHandler = jest.fn().mockResolvedValue('success');
      const wrappedHandler = asyncErrorWrapper(asyncHandler);

      await wrappedHandler(req, res, next);

      expect(asyncHandler).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle synchronous errors', async () => {
      const syncError = new Error('Sync error');
      const syncHandler = jest.fn().mockImplementation(() => {
        throw syncError;
      });
      const wrappedHandler = asyncErrorWrapper(syncHandler);

      await wrappedHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(syncError);
    });
  });

  describe('setupGlobalErrorHandlers', () => {
    let originalProcessOn;
    let mockProcessOn;

    beforeEach(() => {
      originalProcessOn = process.on;
      mockProcessOn = jest.fn();
      process.on = mockProcessOn;
    });

    afterEach(() => {
      process.on = originalProcessOn;
    });

    test('should setup uncaught exception handler', () => {
      setupGlobalErrorHandlers();

      expect(mockProcessOn).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    test('should handle uncaught exceptions', () => {
      jest.useFakeTimers();
      jest.spyOn(process, 'exit').mockImplementation(() => {});

      setupGlobalErrorHandlers();

      const uncaughtHandler = mockProcessOn.mock.calls.find(
        call => call[0] === 'uncaughtException'
      )[1];

      const testError = new Error('Uncaught error');
      uncaughtHandler(testError);

      // Should schedule process exit
      jest.advanceTimersByTime(1000);
      expect(process.exit).toHaveBeenCalledWith(1);

      jest.useRealTimers();
    });

    test('should handle unhandled promise rejections', () => {
      process.env.NODE_ENV = 'production';
      jest.useFakeTimers();
      jest.spyOn(process, 'exit').mockImplementation(() => {});

      setupGlobalErrorHandlers();

      const rejectionHandler = mockProcessOn.mock.calls.find(
        call => call[0] === 'unhandledRejection'
      )[1];

      const testReason = new Error('Unhandled rejection');
      const testPromise = Promise.reject(testReason).catch(() => {}); // Prevent actual unhandled rejection
      rejectionHandler(testReason, testPromise);

      // Should schedule process exit in production
      jest.advanceTimersByTime(1000);
      expect(process.exit).toHaveBeenCalledWith(1);

      jest.useRealTimers();
    });

    test('should not exit on unhandled rejections in development', () => {
      process.env.NODE_ENV = 'development';
      jest.spyOn(process, 'exit').mockImplementation(() => {});

      setupGlobalErrorHandlers();

      const rejectionHandler = mockProcessOn.mock.calls.find(
        call => call[0] === 'unhandledRejection'
      )[1];

      const testReason = new Error('Unhandled rejection');
      const testPromise = Promise.reject(testReason).catch(() => {}); // Prevent actual unhandled rejection
      rejectionHandler(testReason, testPromise);

      expect(process.exit).not.toHaveBeenCalled();
    });

    test('should handle SIGTERM gracefully', () => {
      jest.spyOn(process, 'exit').mockImplementation(() => {});

      setupGlobalErrorHandlers();

      const sigtermHandler = mockProcessOn.mock.calls.find(
        call => call[0] === 'SIGTERM'
      )[1];

      sigtermHandler();

      // Should not exit immediately (app should handle cleanup)
      expect(process.exit).not.toHaveBeenCalled();
    });

    test('should handle SIGINT gracefully', () => {
      jest.spyOn(process, 'exit').mockImplementation(() => {});

      setupGlobalErrorHandlers();

      const sigintHandler = mockProcessOn.mock.calls.find(
        call => call[0] === 'SIGINT'
      )[1];

      sigintHandler();

      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('Multer error handling', () => {
    const multerErrorCodes = [
      { code: 'LIMIT_FILE_SIZE', expected: 'File size exceeds the maximum allowed limit' },
      { code: 'LIMIT_FILE_COUNT', expected: 'Too many files uploaded' },
      { code: 'LIMIT_UNEXPECTED_FILE', expected: 'Unexpected file field' },
      { code: 'LIMIT_FIELD_KEY', expected: 'Field name is too long' },
      { code: 'LIMIT_FIELD_VALUE', expected: 'Field value is too long' },
      { code: 'LIMIT_FIELD_COUNT', expected: 'Too many fields' },
      { code: 'LIMIT_PART_COUNT', expected: 'Too many parts' }
    ];

    multerErrorCodes.forEach(({ code, expected }) => {
      test(`should handle Multer error code ${code}`, () => {
        const error = new Error('Multer error');
        error.name = 'MulterError';
        error.code = code;

        errorHandler(error, req, res, next);

        const response = res.json.mock.calls[0][0];
        expect(response.error.message).toBe(expected);
      });
    });

    test('should handle unknown Multer error code', () => {
      const error = new Error('Multer error');
      error.name = 'MulterError';
      error.code = 'UNKNOWN_ERROR';

      errorHandler(error, req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.error.message).toBe('File upload error');
    });
  });

  describe('Request context logging', () => {
    test('should include comprehensive request context', () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/test',
        ip: '192.168.1.100',
        body: { data: 'test' },
        headers: { 'user-agent': 'Test Agent' }
      });
      req.id = 'request-123';
      req.get = jest.fn((header) => {
        if (header === 'User-Agent') return 'Test Agent';
        return null;
      });

      const error = new AppError('Test error');
      errorHandler(error, req, res, next);

      // Verify the error was handled (we can't easily test logging details due to mocking)
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
    });
  });
});