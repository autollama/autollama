/**
 * Unit Tests for Validation Middleware
 * Tests request validation, file validation, and schema validation
 */

const {
  createValidationMiddleware,
  createFileValidationMiddleware,
  createCustomValidation,
  validate,
  validationMiddleware,
  validationSchemas
} = require('../../middleware/validation.middleware');

const { ValidationError } = require('../../middleware/error.middleware');

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

describe('Validation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    next = createMockNext();
  });

  describe('createValidationMiddleware', () => {
    test('should validate request body successfully', async () => {
      const middleware = createValidationMiddleware('processUrl', 'body');
      req.body = {
        url: 'https://example.com',
        chunkSize: 1000,
        overlap: 100
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.body.url).toBe('https://example.com');
      expect(req.body.chunkSize).toBe(1000);
      expect(req.body.overlap).toBe(100);
    });

    test('should apply default values', async () => {
      const middleware = createValidationMiddleware('processUrl', 'body');
      req.body = {
        url: 'https://example.com'
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.body.chunkSize).toBe(1000); // Default value
      expect(req.body.overlap).toBe(100); // Default value
      expect(req.body.enableContextualEmbeddings).toBe(true); // Default value
    });

    test('should reject invalid URL', async () => {
      const middleware = createValidationMiddleware('processUrl', 'body');
      req.body = {
        url: 'invalid-url'
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ValidationError',
          message: 'Request validation failed'
        })
      );
    });

    test('should reject unknown fields', async () => {
      const middleware = createValidationMiddleware('processUrl', 'body');
      req.body = {
        url: 'https://example.com',
        unknownField: 'should be removed'
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.body.unknownField).toBeUndefined();
    });

    test('should validate query parameters', async () => {
      const middleware = createValidationMiddleware('search', 'query');
      req.query = {
        q: 'test query',
        limit: '10',
        offset: '0'
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.query.q).toBe('test query');
      expect(req.query.limit).toBe(10); // Should be converted to number
      expect(req.query.offset).toBe(0);
    });

    test('should validate URL parameters', async () => {
      const middleware = createValidationMiddleware('getDocumentChunks', 'params');
      req.params = {
        documentId: '123e4567-e89b-12d3-a456-426614174000'
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.params.documentId).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    test('should handle validation errors with multiple issues', async () => {
      const middleware = createValidationMiddleware('processUrl', 'body');
      req.body = {
        url: 'invalid-url',
        chunkSize: 50000, // Too large
        overlap: -10 // Negative
      };

      await middleware(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.errors).toHaveLength(3);
      expect(error.errors.some(e => e.field === 'url')).toBe(true);
      expect(error.errors.some(e => e.field === 'chunkSize')).toBe(true);
      expect(error.errors.some(e => e.field === 'overlap')).toBe(true);
    });

    test('should throw error for unknown schema', () => {
      expect(() => {
        createValidationMiddleware('unknownSchema');
      }).toThrow("Validation schema 'unknownSchema' not found");
    });
  });

  describe('createFileValidationMiddleware', () => {
    test('should validate file upload successfully', async () => {
      const middleware = createFileValidationMiddleware();
      req.file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 1024, // 1MB
        buffer: Buffer.from('test content')
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.file.sanitizedName).toBe('test.pdf');
    });

    test('should reject file that is too large', async () => {
      const middleware = createFileValidationMiddleware({ maxSize: 1024 });
      req.file = {
        originalname: 'large.pdf',
        mimetype: 'application/pdf',
        size: 2048, // Larger than maxSize
        buffer: Buffer.from('test content')
      };

      await middleware(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('File size exceeds maximum allowed size of 1024 bytes');
    });

    test('should reject unsupported file type', async () => {
      const middleware = createFileValidationMiddleware({
        allowedMimeTypes: ['application/pdf']
      });
      req.file = {
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 1024,
        buffer: Buffer.from('test content')
      };

      await middleware(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('File type not allowed');
      expect(error.errors[0].allowedTypes).toContain('application/pdf');
    });

    test('should require file when required is true', async () => {
      const middleware = createFileValidationMiddleware({ required: true });
      req.file = null;

      await middleware(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('File upload is required');
    });

    test('should skip validation when file is not required and not provided', async () => {
      const middleware = createFileValidationMiddleware({ required: false });
      req.file = null;

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should validate filename length', async () => {
      const middleware = createFileValidationMiddleware();
      req.file = {
        originalname: '', // Empty filename
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test content')
      };

      await middleware(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Invalid filename');
    });

    test('should sanitize filename with special characters', async () => {
      const middleware = createFileValidationMiddleware();
      req.file = {
        originalname: 'test file@#$%^&*().pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test content')
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.file.sanitizedName).toBe('test_file_________.pdf');
    });

    test('should truncate long filenames', async () => {
      const middleware = createFileValidationMiddleware();
      const longFilename = 'a'.repeat(200) + '.pdf';
      req.file = {
        originalname: longFilename,
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test content')
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.file.sanitizedName.length).toBeLessThanOrEqual(100);
    });
  });

  describe('createCustomValidation', () => {
    test('should run custom validation function successfully', async () => {
      const customValidator = jest.fn().mockResolvedValue({ isValid: true });
      const middleware = createCustomValidation(customValidator);

      await middleware(req, res, next);

      expect(customValidator).toHaveBeenCalledWith(req);
      expect(next).toHaveBeenCalledWith();
    });

    test('should handle custom validation failure', async () => {
      const customValidator = jest.fn().mockResolvedValue({
        isValid: false,
        message: 'Custom validation failed',
        errors: [{ field: 'custom', message: 'Invalid value' }]
      });
      const middleware = createCustomValidation(customValidator);

      await middleware(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Custom validation failed');
      expect(error.errors).toHaveLength(1);
    });

    test('should handle custom validation function throwing error', async () => {
      const customValidator = jest.fn().mockRejectedValue(new Error('Validator error'));
      const middleware = createCustomValidation(customValidator);

      await middleware(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Custom validation failed');
    });
  });

  describe('validate helpers', () => {
    test('should validate UUID parameter', async () => {
      const middleware = validate.uuid('documentId');
      req.params = {
        documentId: '123e4567-e89b-12d3-a456-426614174000'
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should reject invalid UUID', async () => {
      const middleware = validate.uuid('documentId');
      req.params = {
        documentId: 'invalid-uuid'
      };

      await middleware(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toContain('Invalid documentId format');
    });

    test('should skip optional query validation when no query params', async () => {
      const middleware = validate.optionalQuery('getDocuments');
      req.query = {};

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should validate optional query when params are present', async () => {
      const middleware = validate.optionalQuery('search');
      req.query = {
        q: 'test query'
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.query.q).toBe('test query');
    });
  });

  describe('validationSchemas', () => {
    test('should have processUrl schema', () => {
      expect(validationSchemas.processUrl).toBeDefined();
    });

    test('should have search schema', () => {
      expect(validationSchemas.search).toBeDefined();
    });

    test('should have getDocuments schema', () => {
      expect(validationSchemas.getDocuments).toBeDefined();
    });

    test('should validate search query with all parameters', () => {
      const schema = validationSchemas.search;
      const testData = {
        q: 'test query',
        limit: 20,
        offset: 10,
        includeChunks: true,
        includeMetadata: false
      };

      const { error, value } = schema.validate(testData);

      expect(error).toBeUndefined();
      expect(value.q).toBe('test query');
      expect(value.limit).toBe(20);
      expect(value.offset).toBe(10);
      expect(value.includeChunks).toBe(true);
      expect(value.includeMetadata).toBe(false);
    });

    test('should apply defaults in getDocuments schema', () => {
      const schema = validationSchemas.getDocuments;
      const testData = {};

      const { error, value } = schema.validate(testData);

      expect(error).toBeUndefined();
      expect(value.page).toBe(1);
      expect(value.limit).toBe(20);
      expect(value.sortBy).toBe('created_at');
      expect(value.sortOrder).toBe('desc');
    });

    test('should validate vectorSearch schema', () => {
      const schema = validationSchemas.vectorSearch;
      const testData = {
        query: 'test vector search',
        limit: 5,
        threshold: 0.8
      };

      const { error, value } = schema.validate(testData);

      expect(error).toBeUndefined();
      expect(value.query).toBe('test vector search');
      expect(value.limit).toBe(5);
      expect(value.threshold).toBe(0.8);
    });

    test('should validate updateSession schema', () => {
      const schema = validationSchemas.updateSession;
      const testData = {
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        status: 'completed',
        progress: 100,
        metadata: { chunks: 5 }
      };

      const { error, value } = schema.validate(testData);

      expect(error).toBeUndefined();
      expect(value.sessionId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(value.status).toBe('completed');
      expect(value.progress).toBe(100);
      expect(value.metadata).toEqual({ chunks: 5 });
    });
  });

  describe('predefined validationMiddleware', () => {
    test('should have processUrl middleware', () => {
      expect(validationMiddleware.processUrl).toBeDefined();
    });

    test('should have processFile middleware array', () => {
      expect(Array.isArray(validationMiddleware.processFile)).toBe(true);
      expect(validationMiddleware.processFile).toHaveLength(2);
    });

    test('should have search middleware', () => {
      expect(validationMiddleware.search).toBeDefined();
    });

    test('should have getDocumentChunks middleware array', () => {
      expect(Array.isArray(validationMiddleware.getDocumentChunks)).toBe(true);
      expect(validationMiddleware.getDocumentChunks).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    test('should handle validation middleware internal errors', async () => {
      // Create a middleware with an invalid schema name to trigger an error
      const middleware = createValidationMiddleware('processUrl', 'body');
      
      // Mock Joi validation to throw an error
      const originalValidate = require('joi').object().validate;
      jest.spyOn(require('joi').object(), 'validate').mockImplementation(() => {
        throw new Error('Joi validation failed');
      });

      req.body = { url: 'https://example.com' };

      await middleware(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Validation processing failed');

      // Restore original validate function
      require('joi').object().validate.mockRestore();
    });

    test('should handle file validation internal errors', async () => {
      const middleware = createFileValidationMiddleware();
      
      // Create a file object that will cause an error during validation
      req.file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 'invalid-size', // This should cause an error
        buffer: Buffer.from('test')
      };

      await middleware(req, res, next);

      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('File validation failed');
    });
  });

  describe('data sanitization', () => {
    test('should strip unknown fields from request body', async () => {
      const middleware = createValidationMiddleware('processUrl', 'body');
      req.body = {
        url: 'https://example.com',
        chunkSize: 1000,
        unknownField1: 'should be removed',
        unknownField2: { nested: 'also removed' }
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.body.unknownField1).toBeUndefined();
      expect(req.body.unknownField2).toBeUndefined();
      expect(req.body.url).toBe('https://example.com');
      expect(req.body.chunkSize).toBe(1000);
    });

    test('should trim string values', async () => {
      const middleware = createValidationMiddleware('search', 'query');
      req.query = {
        q: '  trimmed query  '
      };

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.query.q).toBe('trimmed query');
    });
  });
});