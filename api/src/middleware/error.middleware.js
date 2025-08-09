/**
 * Centralized Error Handling Middleware
 * Provides comprehensive error processing, logging, and response formatting
 */

const { logger } = require('../utils/logger');
const { HTTP_STATUS, ERROR_CODES, ENVIRONMENTS } = require('../utils/constants');

/**
 * Custom Application Error class
 */
class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, code = ERROR_CODES.INTERNAL_ERROR, isOperational = true) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error class
 */
class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Database Error class
 */
class DatabaseError extends AppError {
  constructor(message, originalError = null) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.DATABASE_ERROR);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

/**
 * External Service Error class
 */
class ExternalServiceError extends AppError {
  constructor(message, service, statusCode = HTTP_STATUS.BAD_GATEWAY) {
    super(message, statusCode, ERROR_CODES.EXTERNAL_SERVICE_ERROR);
    this.name = 'ExternalServiceError';
    this.service = service;
  }
}

/**
 * Main error handling middleware
 */
function errorHandler(err, req, res, next) {
  const errorLogger = logger.child({ component: 'error-handler' });
  
  // Add request context to error
  const requestContext = {
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
    requestId: req.id || req.headers['x-request-id'],
    body: req.method === 'POST' ? sanitizeRequestBody(req.body) : undefined
  };

  // Log the error with context
  if (err.isOperational) {
    errorLogger.warn('Operational error occurred', {
      error: {
        name: err.name,
        message: err.message,
        code: err.code,
        statusCode: err.statusCode
      },
      request: requestContext
    });
  } else {
    errorLogger.error('Unexpected error occurred', {
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
        code: err.code
      },
      request: requestContext
    });
  }

  // Handle different error types
  const errorResponse = handleErrorType(err, requestContext);
  
  // Send error response
  res.status(errorResponse.statusCode).json(errorResponse);
}

/**
 * Handle different types of errors
 */
function handleErrorType(err, requestContext) {
  const isDevelopment = process.env.NODE_ENV === ENVIRONMENTS.DEVELOPMENT;
  
  // Base error response
  const errorResponse = {
    success: false,
    error: {
      message: err.message,
      code: err.code || ERROR_CODES.INTERNAL_ERROR,
      timestamp: err.timestamp || new Date().toISOString(),
      requestId: requestContext.requestId
    },
    statusCode: err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR
  };

  // Add stack trace in development
  if (isDevelopment && err.stack) {
    errorResponse.error.stack = err.stack;
  }

  // Handle specific error types
  switch (err.name) {
    case 'ValidationError':
      errorResponse.error.details = err.errors;
      errorResponse.error.message = 'Validation failed';
      break;

    case 'DatabaseError':
      errorResponse.error.message = isDevelopment 
        ? err.message 
        : 'Database operation failed';
      if (isDevelopment && err.originalError) {
        errorResponse.error.originalError = err.originalError.message;
      }
      break;

    case 'ExternalServiceError':
      errorResponse.error.service = err.service;
      errorResponse.error.message = isDevelopment 
        ? err.message 
        : `External service error: ${err.service}`;
      break;

    case 'MongoError':
    case 'SequelizeError':
      // Handle database-specific errors
      errorResponse.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
      errorResponse.error.code = ERROR_CODES.DATABASE_ERROR;
      errorResponse.error.message = isDevelopment 
        ? err.message 
        : 'Database operation failed';
      break;

    case 'SyntaxError':
      if (err.message.includes('JSON')) {
        errorResponse.statusCode = HTTP_STATUS.BAD_REQUEST;
        errorResponse.error.code = ERROR_CODES.VALIDATION_ERROR;
        errorResponse.error.message = 'Invalid JSON in request body';
      }
      break;

    case 'MulterError':
      errorResponse.statusCode = HTTP_STATUS.BAD_REQUEST;
      errorResponse.error.code = ERROR_CODES.FILE_PROCESSING_ERROR;
      errorResponse.error.message = getMulterErrorMessage(err);
      break;

    default:
      // Unknown errors - don't expose details in production
      if (!isDevelopment && !err.isOperational) {
        errorResponse.error.message = 'An unexpected error occurred';
        errorResponse.error.code = ERROR_CODES.INTERNAL_ERROR;
      }
  }

  return errorResponse;
}

/**
 * Get user-friendly Multer error messages
 */
function getMulterErrorMessage(err) {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return 'File size exceeds the maximum allowed limit';
    case 'LIMIT_FILE_COUNT':
      return 'Too many files uploaded';
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Unexpected file field';
    case 'LIMIT_FIELD_KEY':
      return 'Field name is too long';
    case 'LIMIT_FIELD_VALUE':
      return 'Field value is too long';
    case 'LIMIT_FIELD_COUNT':
      return 'Too many fields';
    case 'LIMIT_PART_COUNT':
      return 'Too many parts';
    default:
      return 'File upload error';
  }
}

/**
 * Sanitize request body for logging (remove sensitive data)
 */
function sanitizeRequestBody(body) {
  if (!body || typeof body !== 'object') return body;
  
  const sensitiveFields = ['password', 'token', 'api_key', 'apiKey', 'secret'];
  const sanitized = { ...body };
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

/**
 * Async error wrapper - catches async errors and passes them to error handler
 */
function asyncErrorWrapper(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler for unmatched routes
 */
function notFoundHandler(req, res, next) {
  const error = new AppError(
    `Route ${req.method} ${req.originalUrl} not found`,
    HTTP_STATUS.NOT_FOUND,
    ERROR_CODES.NOT_FOUND
  );
  
  next(error);
}

/**
 * Rate limiting error handler
 */
function rateLimitErrorHandler(req, res, next) {
  const error = new AppError(
    'Too many requests, please try again later',
    HTTP_STATUS.TOO_MANY_REQUESTS,
    ERROR_CODES.RATE_LIMIT_ERROR
  );
  
  next(error);
}

/**
 * Create error handling middleware stack
 */
function createErrorMiddleware() {
  return {
    // Main error handler (should be last)
    errorHandler,
    
    // 404 handler (should be second to last)
    notFoundHandler,
    
    // Async wrapper for route handlers
    asyncErrorWrapper,
    
    // Rate limit error handler
    rateLimitErrorHandler,
    
    // Error classes
    AppError,
    ValidationError,
    DatabaseError,
    ExternalServiceError
  };
}

/**
 * Global uncaught exception handler
 */
function setupGlobalErrorHandlers() {
  const globalLogger = logger.child({ component: 'global-error-handler' });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    globalLogger.error('Uncaught Exception - Server shutting down', {
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack
      }
    });
    
    // Give time for log to be written, then exit
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    globalLogger.error('Unhandled Promise Rejection', {
      reason: reason instanceof Error ? {
        name: reason.name,
        message: reason.message,
        stack: reason.stack
      } : reason,
      promise: promise.toString()
    });
    
    // Optionally exit process
    if (process.env.NODE_ENV === ENVIRONMENTS.PRODUCTION) {
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    }
  });

  // Handle SIGTERM gracefully
  process.on('SIGTERM', () => {
    globalLogger.info('SIGTERM received - starting graceful shutdown');
    // Application should handle cleanup and then exit
  });

  // Handle SIGINT gracefully (Ctrl+C)
  process.on('SIGINT', () => {
    globalLogger.info('SIGINT received - starting graceful shutdown');
    // Application should handle cleanup and then exit
    process.exit(0);
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncErrorWrapper,
  rateLimitErrorHandler,
  createErrorMiddleware,
  setupGlobalErrorHandlers,
  AppError,
  ValidationError,
  DatabaseError,
  ExternalServiceError
};