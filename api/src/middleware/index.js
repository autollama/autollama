/**
 * Middleware Stack Integration
 * Central configuration and setup for all middleware components
 */

const { logger } = require('../utils/logger');
const { ENVIRONMENTS } = require('../utils/constants');

// Import all middleware modules
const {
  errorHandler,
  notFoundHandler,
  asyncErrorWrapper,
  setupGlobalErrorHandlers,
  AppError,
  ValidationError,
  DatabaseError,
  ExternalServiceError
} = require('./error.middleware');

const {
  validate,
  validationMiddleware,
  createValidationMiddleware,
  createFileValidationMiddleware
} = require('./validation.middleware');

const {
  createCorsMiddlewareStack,
  getCorsConfig,
  routeSpecificCors
} = require('./cors.middleware');

const {
  rateLimiters,
  createRateLimitMiddleware,
  createDynamicRateLimiter
} = require('./rateLimit.middleware');

const {
  createLoggingMiddlewareStack,
  createRequestIdMiddleware,
  createErrorLoggingMiddleware
} = require('./logging.middleware');

/**
 * Middleware configuration profiles for different environments
 */
const middlewareProfiles = {
  [ENVIRONMENTS.DEVELOPMENT]: {
    cors: {
      securityHeaders: true,
      preflightHandler: true,
      errorHandler: true
    },
    logging: {
      requestLogging: {
        includeBody: true,
        includeQuery: true,
        includeHeaders: true,
        logLevel: 'debug'
      },
      responseLogging: {
        includeBody: false,
        logLevel: 'debug'
      },
      performance: {
        slowThreshold: 500,
        trackMemory: true,
        sampleRate: 1.0
      }
    },
    rateLimit: {
      default: 'development',
      strict: false,
      dynamic: false
    },
    validation: {
      strict: true,
      stripUnknown: true
    },
    errorHandling: {
      includeStackTrace: true,
      includeRequestData: true,
      exposeErrors: true
    }
  },

  [ENVIRONMENTS.PRODUCTION]: {
    cors: {
      securityHeaders: true,
      preflightHandler: true,
      errorHandler: true
    },
    logging: {
      requestLogging: {
        includeBody: false,
        includeQuery: true,
        includeHeaders: false,
        logLevel: 'info'
      },
      responseLogging: {
        includeBody: false,
        logLevel: 'info',
        skipSuccessStatus: [200, 201, 204]
      },
      performance: {
        slowThreshold: 1000,
        trackMemory: false,
        sampleRate: 0.1 // Log 10% of requests
      }
    },
    rateLimit: {
      default: 'default',
      strict: true,
      dynamic: true
    },
    validation: {
      strict: true,
      stripUnknown: true
    },
    errorHandling: {
      includeStackTrace: false,
      includeRequestData: false,
      exposeErrors: false
    }
  },

  [ENVIRONMENTS.TEST]: {
    cors: {
      securityHeaders: false,
      preflightHandler: true,
      errorHandler: true
    },
    logging: {
      requestLogging: false,
      responseLogging: false,
      performance: false
    },
    rateLimit: {
      default: false,
      strict: false,
      dynamic: false
    },
    validation: {
      strict: true,
      stripUnknown: true
    },
    errorHandling: {
      includeStackTrace: true,
      includeRequestData: true,
      exposeErrors: true
    }
  }
};

/**
 * Route-specific middleware configurations
 */
const routeMiddlewareConfig = {
  // Public API routes
  '/api/health': {
    rateLimit: 'health',
    cors: 'public',
    validation: false,
    logging: { minimal: true }
  },

  // Processing routes
  '/api/process-url': {
    rateLimit: 'processing',
    validation: 'processUrl',
    cors: 'upload',
    logging: { detailed: true }
  },

  '/api/process-file': {
    rateLimit: 'upload',
    validation: 'processFile',
    cors: 'upload',
    logging: { detailed: true }
  },

  // Search routes
  '/api/search': {
    rateLimit: 'search',
    validation: 'search',
    cors: 'default',
    logging: { standard: true }
  },

  // Admin routes
  '/api/admin': {
    rateLimit: 'admin',
    cors: 'admin',
    validation: 'strict',
    logging: { detailed: true, auditLog: true }
  },

  // Document routes
  '/api/documents': {
    rateLimit: 'default',
    validation: 'getDocuments',
    cors: 'default',
    logging: { standard: true }
  },

  // Session routes
  '/api/sessions': {
    rateLimit: 'default',
    validation: 'session',
    cors: 'default',
    logging: { standard: true }
  },

  // Statistics routes
  '/api/stats': {
    rateLimit: 'default',
    validation: false,
    cors: 'default',
    logging: { minimal: true }
  }
};

/**
 * Create application middleware stack
 * @param {Object} app - Express application instance
 * @param {Object} options - Middleware configuration options
 */
function setupMiddlewareStack(app, options = {}) {
  const env = process.env.NODE_ENV || ENVIRONMENTS.DEVELOPMENT;
  const profile = middlewareProfiles[env] || middlewareProfiles[ENVIRONMENTS.DEVELOPMENT];
  const config = { ...profile, ...options };

  const middlewareLogger = logger.child({ component: 'middleware-setup' });

  middlewareLogger.info('Setting up middleware stack', {
    environment: env,
    profile: Object.keys(config)
  });

  // 1. Setup global error handlers first
  setupGlobalErrorHandlers();

  // 2. Request ID and basic logging (always first)
  app.use(createRequestIdMiddleware());

  // 3. CORS middleware
  if (config.cors) {
    const corsStack = createCorsMiddlewareStack(config.cors);
    corsStack.forEach(middleware => app.use(middleware));
    middlewareLogger.info('CORS middleware configured');
  }

  // 4. Logging middleware
  if (config.logging) {
    const loggingStack = createLoggingMiddlewareStack(config.logging);
    loggingStack.forEach(middleware => app.use(middleware));
    middlewareLogger.info('Logging middleware configured');
  }

  // 5. Rate limiting middleware
  if (config.rateLimit && config.rateLimit.default) {
    let rateLimiter;
    
    if (config.rateLimit.dynamic) {
      rateLimiter = createDynamicRateLimiter();
    } else if (typeof config.rateLimit.default === 'string') {
      rateLimiter = rateLimiters[config.rateLimit.default]();
    } else {
      rateLimiter = createRateLimitMiddleware(config.rateLimit.default);
    }
    
    app.use(rateLimiter);
    middlewareLogger.info('Rate limiting middleware configured', {
      type: config.rateLimit.dynamic ? 'dynamic' : config.rateLimit.default
    });
  }

  // 6. Body parsing middleware (Express built-in)
  app.use(require('express').json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(require('express').urlencoded({ 
    extended: true, 
    limit: '10mb' 
  }));

  // 7. Error logging middleware
  app.use(createErrorLoggingMiddleware(config.errorHandling));

  middlewareLogger.info('Core middleware stack setup completed');

  return {
    // Return middleware functions for route-specific use
    validation: validationMiddleware,
    rateLimiters,
    cors: routeSpecificCors,
    asyncWrapper: asyncErrorWrapper,
    errors: {
      AppError,
      ValidationError,
      DatabaseError,
      ExternalServiceError
    }
  };
}

/**
 * Setup route-specific middleware
 * @param {Object} router - Express router instance
 * @param {string} routePath - Route path pattern
 * @param {Object} customConfig - Custom configuration for this route
 */
function setupRouteMiddleware(router, routePath, customConfig = {}) {
  const routeConfig = routeMiddlewareConfig[routePath] || {};
  const finalConfig = { ...routeConfig, ...customConfig };

  const middlewareLogger = logger.child({ 
    component: 'route-middleware-setup',
    route: routePath 
  });

  const middlewareStack = [];

  // Route-specific rate limiting
  if (finalConfig.rateLimit && typeof finalConfig.rateLimit === 'string') {
    const rateLimiter = rateLimiters[finalConfig.rateLimit];
    if (rateLimiter) {
      middlewareStack.push(rateLimiter());
      middlewareLogger.debug('Route-specific rate limiter added', {
        type: finalConfig.rateLimit
      });
    }
  }

  // Route-specific CORS
  if (finalConfig.cors && routeSpecificCors[finalConfig.cors]) {
    const corsMiddleware = require('cors')(routeSpecificCors[finalConfig.cors]);
    middlewareStack.push(corsMiddleware);
    middlewareLogger.debug('Route-specific CORS added', {
      type: finalConfig.cors
    });
  }

  // Route-specific validation
  if (finalConfig.validation) {
    if (typeof finalConfig.validation === 'string' && validationMiddleware[finalConfig.validation]) {
      const validator = validationMiddleware[finalConfig.validation];
      if (Array.isArray(validator)) {
        middlewareStack.push(...validator);
      } else {
        middlewareStack.push(validator);
      }
      middlewareLogger.debug('Route-specific validation added', {
        type: finalConfig.validation
      });
    }
  }

  return middlewareStack;
}

/**
 * Setup error handling middleware (must be last)
 * @param {Object} app - Express application instance
 */
function setupErrorHandling(app) {
  const middlewareLogger = logger.child({ component: 'error-handling-setup' });

  // 404 handler (second to last)
  app.use(notFoundHandler);

  // Main error handler (last)
  app.use(errorHandler);

  middlewareLogger.info('Error handling middleware configured');
}

/**
 * Create middleware factory for specific route patterns
 * @param {string} pattern - Route pattern
 * @returns {Function} Middleware factory function
 */
function createRouteMiddlewareFactory(pattern) {
  return (customConfig = {}) => {
    return setupRouteMiddleware(null, pattern, customConfig);
  };
}

/**
 * Middleware utilities for common patterns
 */
const middlewareUtils = {
  // Async route wrapper
  asyncRoute: asyncErrorWrapper,

  // Validation helpers
  validateUUID: validate.uuid,
  validateQuery: validate.query,
  validateBody: validate.body,
  validateFile: validate.file,

  // Rate limiting helpers
  applyRateLimit: (type) => rateLimiters[type] ? rateLimiters[type]() : rateLimiters.default(),

  // Error creation helpers
  createError: (message, statusCode, code) => new AppError(message, statusCode, code),
  createValidationError: (message, errors) => new ValidationError(message, errors),
  createDatabaseError: (message, originalError) => new DatabaseError(message, originalError),

  // CORS helpers
  getCorsConfig,
  
  // Logging helpers
  getRequestId: (req) => req.id || req.requestId,
  createContextLogger: (req, component) => logger.child({
    component,
    requestId: req.id || req.requestId
  })
};

/**
 * Health check for middleware system
 * @returns {Object} Middleware system health status
 */
function getMiddlewareHealth() {
  return {
    status: 'healthy',
    components: {
      errorHandling: 'configured',
      cors: 'configured',
      logging: 'configured',
      rateLimit: 'configured',
      validation: 'configured'
    },
    environment: process.env.NODE_ENV || ENVIRONMENTS.DEVELOPMENT,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  setupMiddlewareStack,
  setupRouteMiddleware,
  setupErrorHandling,
  createRouteMiddlewareFactory,
  middlewareUtils,
  middlewareProfiles,
  routeMiddlewareConfig,
  getMiddlewareHealth,
  
  // Export individual middleware components
  errorHandler,
  notFoundHandler,
  asyncErrorWrapper,
  AppError,
  ValidationError,
  DatabaseError,
  ExternalServiceError,
  validationMiddleware,
  rateLimiters,
  createLoggingMiddlewareStack
};