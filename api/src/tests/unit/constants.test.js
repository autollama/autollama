/**
 * Unit tests for constants utility
 */

const { 
  ERROR_CODES, 
  AI_MODELS, 
  PROCESSING_STATUS, 
  CONTENT_TYPES, 
  UPLOAD_SOURCES,
  DEFAULTS,
  HTTP_STATUS,
  HEALTH_STATUS
} = require('../../utils/constants');

describe('Constants Module', () => {
  describe('ERROR_CODES', () => {
    test('should have all required error codes', () => {
      expect(ERROR_CODES).toBeDefined();
      expect(ERROR_CODES.VALIDATION_ERROR).toBeDefined();
      expect(ERROR_CODES.DATABASE_ERROR).toBeDefined();
      expect(ERROR_CODES.AI_SERVICE_ERROR).toBeDefined();
      expect(ERROR_CODES.FILE_PROCESSING_ERROR).toBeDefined();
      expect(ERROR_CODES.RATE_LIMIT_ERROR).toBeDefined();
    });

    test('should have unique error codes', () => {
      const codes = Object.values(ERROR_CODES);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    test('should have string error codes', () => {
      Object.values(ERROR_CODES).forEach(code => {
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
      });
    });
  });

  describe('AI_MODELS', () => {
    test('should have model configurations', () => {
      expect(AI_MODELS).toBeDefined();
      expect(AI_MODELS.GPT_4O).toBeDefined();
      expect(AI_MODELS.GPT_4O_MINI).toBeDefined();
      expect(AI_MODELS.TEXT_EMBEDDING_3_SMALL).toBeDefined();
    });

    test('should have valid model strings', () => {
      Object.values(AI_MODELS).forEach(model => {
        expect(typeof model).toBe('string');
        expect(model.length).toBeGreaterThan(0);
      });
    });

    test('should have expected model names', () => {
      expect(AI_MODELS.GPT_4O_MINI).toBe('gpt-4o-mini');
      expect(AI_MODELS.GPT_4O).toBe('gpt-4o');
      expect(AI_MODELS.TEXT_EMBEDDING_3_SMALL).toBe('text-embedding-3-small');
    });
  });

  describe('PROCESSING_STATUS', () => {
    test('should have all status types', () => {
      expect(PROCESSING_STATUS).toBeDefined();
      expect(PROCESSING_STATUS.PENDING).toBeDefined();
      expect(PROCESSING_STATUS.PROCESSING).toBeDefined();
      expect(PROCESSING_STATUS.COMPLETED).toBeDefined();
      expect(PROCESSING_STATUS.FAILED).toBeDefined();
      expect(PROCESSING_STATUS.CANCELLED).toBeDefined();
    });

    test('should have consistent status values', () => {
      const expectedStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
      const actualStatuses = Object.values(PROCESSING_STATUS);
      
      expectedStatuses.forEach(status => {
        expect(actualStatuses).toContain(status);
      });
    });
  });

  describe('CONTENT_TYPES', () => {
    test('should support common content types', () => {
      expect(CONTENT_TYPES).toBeDefined();
      expect(CONTENT_TYPES.PDF).toBeDefined();
      expect(CONTENT_TYPES.EPUB).toBeDefined();
      expect(CONTENT_TYPES.DOCX).toBeDefined();
      expect(CONTENT_TYPES.PLAIN_TEXT).toBeDefined();
      expect(CONTENT_TYPES.CSV).toBeDefined();
      expect(CONTENT_TYPES.HTML).toBeDefined();
    });

    test('should have valid MIME type strings', () => {
      Object.values(CONTENT_TYPES).forEach(mimeType => {
        expect(typeof mimeType).toBe('string');
        expect(mimeType.length).toBeGreaterThan(0);
        expect(mimeType).toContain('/');
      });
    });

    test('should have expected MIME types', () => {
      expect(CONTENT_TYPES.PDF).toBe('application/pdf');
      expect(CONTENT_TYPES.PLAIN_TEXT).toBe('text/plain');
      expect(CONTENT_TYPES.JSON).toBe('application/json');
    });
  });

  describe('UPLOAD_SOURCES', () => {
    test('should have upload source types', () => {
      expect(UPLOAD_SOURCES).toBeDefined();
      expect(UPLOAD_SOURCES.USER).toBeDefined();
      expect(UPLOAD_SOURCES.API).toBeDefined();
      expect(UPLOAD_SOURCES.WEBHOOK).toBeDefined();
      expect(UPLOAD_SOURCES.BATCH).toBeDefined();
    });

    test('should be string values', () => {
      Object.values(UPLOAD_SOURCES).forEach(source => {
        expect(typeof source).toBe('string');
        expect(source.length).toBeGreaterThan(0);
      });
    });
  });

  describe('DEFAULTS', () => {
    test('should have processing defaults', () => {
      expect(DEFAULTS).toBeDefined();
      expect(DEFAULTS.CHUNK_SIZE).toBeDefined();
      expect(DEFAULTS.CHUNK_OVERLAP).toBeDefined();
      expect(DEFAULTS.BATCH_SIZE).toBeDefined();
    });

    test('should have valid numeric values', () => {
      expect(typeof DEFAULTS.CHUNK_SIZE).toBe('number');
      expect(typeof DEFAULTS.CHUNK_OVERLAP).toBe('number');
      expect(typeof DEFAULTS.BATCH_SIZE).toBe('number');
      
      expect(DEFAULTS.CHUNK_SIZE).toBeGreaterThan(0);
      expect(DEFAULTS.CHUNK_OVERLAP).toBeGreaterThanOrEqual(0);
      expect(DEFAULTS.BATCH_SIZE).toBeGreaterThan(0);
    });

    test('should have reasonable default values', () => {
      expect(DEFAULTS.CHUNK_SIZE).toBeLessThan(10000); // Reasonable chunk size
      expect(DEFAULTS.CHUNK_OVERLAP).toBeLessThan(DEFAULTS.CHUNK_SIZE);
      expect(DEFAULTS.BATCH_SIZE).toBeLessThan(20); // Reasonable batch size
    });
  });

  describe('HTTP_STATUS', () => {
    test('should have standard HTTP status codes', () => {
      expect(HTTP_STATUS).toBeDefined();
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
    });
  });

  describe('HEALTH_STATUS', () => {
    test('should have health status values', () => {
      expect(HEALTH_STATUS).toBeDefined();
      expect(HEALTH_STATUS.HEALTHY).toBe('healthy');
      expect(HEALTH_STATUS.UNHEALTHY).toBe('unhealthy');
      expect(HEALTH_STATUS.DEGRADED).toBe('degraded');
    });
  });
});