/**
 * Request Validation Middleware
 * Provides comprehensive input validation and sanitization
 */

const { logger } = require('../utils/logger');
const { ValidationError } = require('./error.middleware');
const { HTTP_STATUS, ERROR_CODES } = require('../utils/constants');

/**
 * Joi validation schemas for common data types
 */
const Joi = require('joi');

const commonSchemas = {
  // URL validation
  url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  
  // File upload validation
  file: Joi.object({
    originalname: Joi.string().required(),
    mimetype: Joi.string().required(),
    size: Joi.number().max(100 * 1024 * 1024), // 100MB max
    buffer: Joi.binary().required()
  }).required(),
  
  // Chunking parameters
  chunkSize: Joi.number().min(100).max(5000).default(1000),
  overlap: Joi.number().min(0).max(500).default(100),
  
  // Search parameters
  query: Joi.string().min(1).max(1000).required(),
  limit: Joi.number().min(1).max(100).default(10),
  offset: Joi.number().min(0).default(0),
  
  // Pagination
  page: Joi.number().min(1).default(1),
  pageSize: Joi.number().min(1).max(100).default(20),
  
  // Session parameters
  sessionId: Joi.string().uuid().required(),
  
  // Document parameters
  documentId: Joi.string().uuid().required(),
  
  // Processing options
  enableContextualEmbeddings: Joi.boolean().default(true),
  generateSummary: Joi.boolean().default(true),
  
  // Common string validations
  nonEmptyString: Joi.string().trim().min(1),
  optionalString: Joi.string().trim().allow('').optional(),
  
  // UUID validation
  uuid: Joi.string().uuid(),
  
  // Date validation
  dateString: Joi.string().isoDate(),
  
  // Status validation
  status: Joi.string().valid('pending', 'processing', 'completed', 'failed'),
  
  // Content type validation
  contentType: Joi.string().valid('url', 'file', 'text')
};

/**
 * Validation schemas for specific endpoints
 */
const validationSchemas = {
  // URL processing
  processUrl: Joi.object({
    url: commonSchemas.url,
    chunkSize: commonSchemas.chunkSize,
    overlap: commonSchemas.overlap,
    enableContextualEmbeddings: commonSchemas.enableContextualEmbeddings,
    generateSummary: commonSchemas.generateSummary,
    sessionId: commonSchemas.uuid.optional()
  }),
  
  // File processing
  processFile: Joi.object({
    chunkSize: commonSchemas.chunkSize,
    overlap: commonSchemas.overlap,
    enableContextualEmbeddings: commonSchemas.enableContextualEmbeddings,
    generateSummary: commonSchemas.generateSummary,
    sessionId: commonSchemas.uuid.optional()
  }),
  
  // Search requests
  search: Joi.object({
    q: commonSchemas.query.label('query'),
    query: commonSchemas.query.optional(),
    limit: commonSchemas.limit,
    offset: commonSchemas.offset,
    includeChunks: Joi.boolean().default(false),
    includeMetadata: Joi.boolean().default(true)
  }),
  
  // Vector search
  vectorSearch: Joi.object({
    query: commonSchemas.query,
    limit: commonSchemas.limit,
    threshold: Joi.number().min(0).max(1).default(0.7),
    includeMetadata: Joi.boolean().default(true)
  }),
  
  // Document queries
  getDocuments: Joi.object({
    page: commonSchemas.page,
    limit: commonSchemas.pageSize,
    sortBy: Joi.string().valid('created_time', 'title', 'chunk_count').default('created_time'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
    search: commonSchemas.optionalString,
    status: commonSchemas.status.optional()
  }),
  
  // Document chunks
  getDocumentChunks: Joi.object({
    documentId: commonSchemas.documentId,
    page: commonSchemas.page,
    limit: commonSchemas.pageSize,
    includeEmbeddings: Joi.boolean().default(false)
  }),
  
  // Session management
  getSession: Joi.object({
    sessionId: commonSchemas.sessionId
  }),
  
  updateSession: Joi.object({
    sessionId: commonSchemas.sessionId,
    status: commonSchemas.status.optional(),
    progress: Joi.number().min(0).max(100).optional(),
    errorMessage: commonSchemas.optionalString,
    metadata: Joi.object().optional()
  }),
  
  // Health check parameters
  healthCheck: Joi.object({
    detailed: Joi.boolean().default(false),
    includeServices: Joi.boolean().default(true)
  }),
  
  // Statistics queries
  getStats: Joi.object({
    timeRange: Joi.string().valid('1h', '24h', '7d', '30d').default('24h'),
    includeDetails: Joi.boolean().default(false)
  }),
  
  // Configuration updates
  updateConfig: Joi.object({
    chunkSize: commonSchemas.chunkSize.optional(),
    overlap: commonSchemas.overlap.optional(),
    enableContextualEmbeddings: commonSchemas.enableContextualEmbeddings.optional(),
    apiSettings: Joi.object().optional(),
    processingSettings: Joi.object().optional()
  })
};

/**
 * Create validation middleware for specific schema
 * @param {string} schemaName - Name of the validation schema
 * @param {string} source - Where to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
function createValidationMiddleware(schemaName, source = 'body') {
  const schema = validationSchemas[schemaName];
  
  if (!schema) {
    throw new Error(`Validation schema '${schemaName}' not found`);
  }
  
  return (req, res, next) => {
    const validationLogger = logger.child({ 
      component: 'validation-middleware',
      schema: schemaName,
      source 
    });
    
    try {
      const dataToValidate = req[source];
      
      // Perform validation with Joi
      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false, // Collect all errors
        allowUnknown: false, // Reject unknown fields
        stripUnknown: true // Remove unknown fields
      });
      
      if (error) {
        const validationErrors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));
        
        validationLogger.warn('Validation failed', {
          errors: validationErrors,
          requestData: sanitizeForLog(dataToValidate)
        });
        
        throw new ValidationError('Request validation failed', validationErrors);
      }
      
      // Replace original data with validated/sanitized data
      req[source] = value;
      
      validationLogger.debug('Validation passed', {
        validatedFields: Object.keys(value || {})
      });
      
      next();
      
    } catch (error) {
      if (error instanceof ValidationError) {
        next(error);
      } else {
        validationLogger.error('Validation middleware error', {
          error: error.message,
          stack: error.stack
        });
        next(new ValidationError('Validation processing failed'));
      }
    }
  };
}

/**
 * File upload validation middleware
 * @param {Object} options - Upload validation options
 * @returns {Function} Express middleware function
 */
function createFileValidationMiddleware(options = {}) {
  const config = {
    maxSize: options.maxSize || 100 * 1024 * 1024, // 100MB
    allowedMimeTypes: options.allowedMimeTypes || [
      'application/pdf',
      'text/plain',
      'text/html',
      'text/markdown',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/epub+zip'
    ],
    required: options.required !== false,
    ...options
  };
  
  return (req, res, next) => {
    const validationLogger = logger.child({ 
      component: 'file-validation-middleware'
    });
    
    try {
      const file = req.file;
      
      // Check if file is required
      if (config.required && !file) {
        throw new ValidationError('File upload is required');
      }
      
      // Skip validation if no file and not required
      if (!file && !config.required) {
        return next();
      }
      
      // Validate file size
      if (file.size > config.maxSize) {
        throw new ValidationError(`File size exceeds maximum allowed size of ${config.maxSize} bytes`, [{
          field: 'file.size',
          message: `File too large (${file.size} bytes, max: ${config.maxSize})`,
          value: file.size
        }]);
      }
      
      // Validate MIME type
      if (config.allowedMimeTypes && !config.allowedMimeTypes.includes(file.mimetype)) {
        throw new ValidationError('File type not allowed', [{
          field: 'file.mimetype',
          message: `MIME type '${file.mimetype}' not allowed`,
          value: file.mimetype,
          allowedTypes: config.allowedMimeTypes
        }]);
      }
      
      // Validate filename
      if (!file.originalname || file.originalname.length > 255) {
        throw new ValidationError('Invalid filename', [{
          field: 'file.originalname',
          message: 'Filename must be provided and less than 255 characters',
          value: file.originalname
        }]);
      }
      
      // Sanitize filename
      req.file.sanitizedName = file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .substring(0, 100);
      
      validationLogger.debug('File validation passed', {
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype
      });
      
      next();
      
    } catch (error) {
      if (error instanceof ValidationError) {
        next(error);
      } else {
        validationLogger.error('File validation error', {
          error: error.message
        });
        next(new ValidationError('File validation failed'));
      }
    }
  };
}

/**
 * Custom validation middleware for complex validation logic
 * @param {Function} validationFunction - Custom validation function
 * @returns {Function} Express middleware function
 */
function createCustomValidation(validationFunction) {
  return async (req, res, next) => {
    const validationLogger = logger.child({ 
      component: 'custom-validation-middleware'
    });
    
    try {
      const result = await validationFunction(req);
      
      if (result && result.isValid === false) {
        throw new ValidationError(result.message || 'Custom validation failed', result.errors);
      }
      
      validationLogger.debug('Custom validation passed');
      next();
      
    } catch (error) {
      if (error instanceof ValidationError) {
        next(error);
      } else {
        validationLogger.error('Custom validation error', {
          error: error.message
        });
        next(new ValidationError('Custom validation failed'));
      }
    }
  };
}

/**
 * Sanitize data for logging (remove sensitive information)
 */
function sanitizeForLog(data) {
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveFields = ['password', 'token', 'apiKey', 'api_key', 'secret', 'authorization'];
  const sanitized = { ...data };
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

/**
 * Validation middleware factory for common patterns
 */
const validate = {
  // Query parameter validation
  query: (schemaName) => createValidationMiddleware(schemaName, 'query'),
  
  // Request body validation
  body: (schemaName) => createValidationMiddleware(schemaName, 'body'),
  
  // URL parameters validation
  params: (schemaName) => createValidationMiddleware(schemaName, 'params'),
  
  // File upload validation
  file: (options) => createFileValidationMiddleware(options),
  
  // Custom validation
  custom: (validationFunction) => createCustomValidation(validationFunction),
  
  // UUID parameter validation
  uuid: (paramName = 'id') => (req, res, next) => {
    const value = req.params[paramName];
    const { error } = commonSchemas.uuid.validate(value);
    
    if (error) {
      return next(new ValidationError(`Invalid ${paramName} format`, [{
        field: paramName,
        message: `${paramName} must be a valid UUID`,
        value
      }]));
    }
    
    next();
  },
  
  // Optional query parameter validation
  optionalQuery: (schemaName) => (req, res, next) => {
    // Only validate if query parameters exist
    if (Object.keys(req.query).length === 0) {
      return next();
    }
    return createValidationMiddleware(schemaName, 'query')(req, res, next);
  }
};

/**
 * Pre-defined validation middleware for common endpoints
 */
const validationMiddleware = {
  processUrl: validate.body('processUrl'),
  processFile: [
    validate.file({ required: true }),
    validate.body('processFile')
  ],
  search: validate.query('search'),
  vectorSearch: validate.body('vectorSearch'),
  getDocuments: validate.optionalQuery('getDocuments'),
  getDocumentChunks: [
    validate.uuid('documentId'),
    validate.optionalQuery('getDocumentChunks')
  ],
  getSession: validate.uuid('sessionId'),
  updateSession: [
    validate.uuid('sessionId'),
    validate.body('updateSession')
  ],
  healthCheck: validate.optionalQuery('healthCheck'),
  getStats: validate.optionalQuery('getStats'),
  updateConfig: validate.body('updateConfig')
};

module.exports = {
  createValidationMiddleware,
  createFileValidationMiddleware,
  createCustomValidation,
  validate,
  validationMiddleware,
  validationSchemas,
  commonSchemas
};