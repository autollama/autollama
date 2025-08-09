/**
 * Logging Middleware
 * Provides comprehensive request/response logging and monitoring
 */

const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Request ID middleware
 * Adds unique request ID to each request for tracing
 */
function createRequestIdMiddleware() {
  return (req, res, next) => {
    // Use existing request ID from headers or generate new one
    const requestId = req.get('X-Request-ID') || 
                     req.get('X-Correlation-ID') || 
                     uuidv4();
    
    // Add to request object
    req.id = requestId;
    req.requestId = requestId;
    
    // Add to response headers
    res.set('X-Request-ID', requestId);
    
    next();
  };
}

/**
 * Request logging middleware
 * Logs incoming requests with detailed information
 */
function createRequestLoggingMiddleware(options = {}) {
  const config = {
    includeBody: options.includeBody !== false,
    includeQuery: options.includeQuery !== false,
    includeHeaders: options.includeHeaders || false,
    bodySizeLimit: options.bodySizeLimit || 1024, // 1KB default
    sensitiveFields: options.sensitiveFields || [
      'password', 'token', 'authorization', 'cookie', 'api_key', 'apiKey', 'secret'
    ],
    skipPaths: options.skipPaths || ['/health', '/ping'],
    skipMethods: options.skipMethods || [],
    logLevel: options.logLevel || 'info',
    ...options
  };

  return (req, res, next) => {
    const requestLogger = logger.child({ 
      component: 'request-logger',
      requestId: req.id 
    });

    // Skip logging for certain paths
    if (config.skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Skip logging for certain methods
    if (config.skipMethods.includes(req.method)) {
      return next();
    }

    const startTime = Date.now();
    const logData = {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      ip: getClientIP(req),
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      timestamp: new Date().toISOString()
    };

    // Add query parameters
    if (config.includeQuery && Object.keys(req.query).length > 0) {
      logData.query = sanitizeObject(req.query, config.sensitiveFields);
    }

    // Add request body (with size limit)
    if (config.includeBody && req.body) {
      const bodyStr = JSON.stringify(req.body);
      if (bodyStr.length <= config.bodySizeLimit) {
        logData.body = sanitizeObject(req.body, config.sensitiveFields);
      } else {
        logData.bodySize = bodyStr.length;
        logData.bodyTruncated = true;
      }
    }

    // Add selected headers
    if (config.includeHeaders) {
      const headersToLog = Array.isArray(config.includeHeaders) 
        ? config.includeHeaders 
        : ['content-type', 'accept', 'referer', 'origin'];
      
      logData.headers = {};
      headersToLog.forEach(header => {
        const value = req.get(header);
        if (value && !config.sensitiveFields.some(field => 
          header.toLowerCase().includes(field.toLowerCase())
        )) {
          logData.headers[header] = value;
        }
      });
    }

    // Add user information if available
    if (req.user) {
      logData.user = {
        id: req.user.id,
        email: req.user.email?.replace(/(.{2}).*(@.*)/, '$1***$2'), // Mask email
        role: req.user.role
      };
    }

    // Log the request
    requestLogger[config.logLevel]('HTTP Request', logData);

    // Store start time for response logging
    req._startTime = startTime;
    req._logData = logData;

    next();
  };
}

/**
 * Response logging middleware
 * Logs outgoing responses with timing and status information
 */
function createResponseLoggingMiddleware(options = {}) {
  const config = {
    includeBody: options.includeBody || false,
    bodySizeLimit: options.bodySizeLimit || 1024,
    logLevel: options.logLevel || 'info',
    logErrors: options.logErrors !== false,
    skipPaths: options.skipPaths || ['/health', '/ping'],
    skipSuccessStatus: options.skipSuccessStatus || [],
    ...options
  };

  return (req, res, next) => {
    // Skip logging for certain paths
    if (config.skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const responseLogger = logger.child({ 
      component: 'response-logger',
      requestId: req.id 
    });

    // Capture original response methods
    const originalSend = res.send;
    const originalJson = res.json;
    const originalEnd = res.end;

    let responseBody = null;
    let responseCaptured = false;

    // Override send method
    res.send = function(body) {
      if (!responseCaptured) {
        responseBody = body;
        responseCaptured = true;
      }
      return originalSend.call(this, body);
    };

    // Override json method
    res.json = function(body) {
      if (!responseCaptured) {
        responseBody = body;
        responseCaptured = true;
      }
      return originalJson.call(this, body);
    };

    // Override end method
    res.end = function(chunk, encoding) {
      if (!responseCaptured && chunk) {
        responseBody = chunk;
        responseCaptured = true;
      }

      // Log response
      logResponse();
      
      return originalEnd.call(this, chunk, encoding);
    };

    function logResponse() {
      const endTime = Date.now();
      const duration = endTime - (req._startTime || endTime);
      
      const logData = {
        requestId: req.id,
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        duration: duration,
        contentLength: res.get('Content-Length'),
        contentType: res.get('Content-Type'),
        timestamp: new Date().toISOString()
      };

      // Add response body if requested and within size limit
      if (config.includeBody && responseBody) {
        const bodyStr = typeof responseBody === 'string' 
          ? responseBody 
          : JSON.stringify(responseBody);
        
        if (bodyStr.length <= config.bodySizeLimit) {
          try {
            logData.responseBody = typeof responseBody === 'string' 
              ? JSON.parse(responseBody) 
              : responseBody;
          } catch (e) {
            logData.responseBody = responseBody;
          }
        } else {
          logData.responseBodySize = bodyStr.length;
          logData.responseBodyTruncated = true;
        }
      }

      // Add cache headers if present
      const cacheControl = res.get('Cache-Control');
      const etag = res.get('ETag');
      if (cacheControl || etag) {
        logData.cache = { cacheControl, etag };
      }

      // Determine log level based on status code
      let logLevel = config.logLevel;
      let logMessage = 'HTTP Response';

      if (res.statusCode >= 500) {
        logLevel = 'error';
        logMessage = 'HTTP Response - Server Error';
      } else if (res.statusCode >= 400) {
        logLevel = config.logErrors ? 'warn' : config.logLevel;
        logMessage = 'HTTP Response - Client Error';
      } else if (res.statusCode >= 300) {
        logLevel = 'info';
        logMessage = 'HTTP Response - Redirect';
      }

      // Skip logging successful responses if configured
      if (config.skipSuccessStatus.includes(res.statusCode)) {
        return;
      }

      // Add performance warnings
      if (duration > 5000) { // 5 seconds
        logData.performanceWarning = 'Slow response';
        logLevel = 'warn';
      }

      // Log the response
      responseLogger[logLevel](logMessage, logData);

      // Log to access log format as well
      const accessLogData = {
        ip: getClientIP(req),
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        responseTime: duration,
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer'),
        requestId: req.id
      };

      logger.child({ component: 'access-log' }).info('ACCESS', accessLogData);
    }

    next();
  };
}

/**
 * Error logging middleware
 * Logs errors with full context and stack traces
 */
function createErrorLoggingMiddleware(options = {}) {
  const config = {
    includeStackTrace: options.includeStackTrace !== false,
    includeRequestData: options.includeRequestData !== false,
    logLevel: options.logLevel || 'error',
    ...options
  };

  return (err, req, res, next) => {
    const errorLogger = logger.child({ 
      component: 'error-logger',
      requestId: req.id 
    });

    const errorData = {
      requestId: req.id,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.code,
      statusCode: err.statusCode || 500,
      timestamp: new Date().toISOString()
    };

    // Add stack trace
    if (config.includeStackTrace && err.stack) {
      errorData.stack = err.stack.split('\n').slice(0, 10); // Limit stack trace
    }

    // Add request context
    if (config.includeRequestData) {
      errorData.request = {
        method: req.method,
        url: req.originalUrl || req.url,
        ip: getClientIP(req),
        userAgent: req.get('User-Agent'),
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        body: req.body ? sanitizeObject(req.body, ['password', 'token']) : undefined
      };
    }

    // Add user context if available
    if (req.user) {
      errorData.user = {
        id: req.user.id,
        role: req.user.role
      };
    }

    // Add additional error properties
    Object.keys(err).forEach(key => {
      if (!['name', 'message', 'stack', 'code', 'statusCode'].includes(key)) {
        errorData[key] = err[key];
      }
    });

    // Log the error
    errorLogger[config.logLevel]('HTTP Error', errorData);

    next(err);
  };
}

/**
 * Performance monitoring middleware
 * Tracks and logs performance metrics
 */
function createPerformanceMiddleware(options = {}) {
  const config = {
    slowThreshold: options.slowThreshold || 1000, // 1 second
    logSlowRequests: options.logSlowRequests !== false,
    trackMemory: options.trackMemory || false,
    sampleRate: options.sampleRate || 1.0, // Log 100% of requests by default
    ...options
  };

  return (req, res, next) => {
    // Sample requests based on configured rate
    if (Math.random() > config.sampleRate) {
      return next();
    }

    const performanceLogger = logger.child({ 
      component: 'performance-logger',
      requestId: req.id 
    });

    const startTime = process.hrtime.bigint();
    const startMemory = config.trackMemory ? process.memoryUsage() : null;

    res.on('finish', () => {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      const perfData = {
        requestId: req.id,
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
        timestamp: new Date().toISOString()
      };

      // Add memory usage if tracking is enabled
      if (config.trackMemory && startMemory) {
        const endMemory = process.memoryUsage();
        perfData.memory = {
          heapUsedDelta: endMemory.heapUsed - startMemory.heapUsed,
          heapTotalDelta: endMemory.heapTotal - startMemory.heapTotal,
          externalDelta: endMemory.external - startMemory.external
        };
      }

      // Log slow requests
      if (config.logSlowRequests && duration > config.slowThreshold) {
        perfData.warning = 'Slow request detected';
        performanceLogger.warn('PERFORMANCE', perfData);
      } else {
        performanceLogger.debug('PERFORMANCE', perfData);
      }
    });

    next();
  };
}

/**
 * Helper functions
 */

/**
 * Get client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
  return req.ip ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
}

/**
 * Sanitize object by removing sensitive fields
 * @param {Object} obj - Object to sanitize
 * @param {Array} sensitiveFields - Fields to sanitize
 * @returns {Object} Sanitized object
 */
function sanitizeObject(obj, sensitiveFields = []) {
  if (!obj || typeof obj !== 'object') return obj;

  const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };

  const sanitizeValue = (value, key) => {
    if (sensitiveFields.some(field => 
      key.toLowerCase().includes(field.toLowerCase())
    )) {
      return '[REDACTED]';
    }
    
    if (typeof value === 'object' && value !== null) {
      return sanitizeObject(value, sensitiveFields);
    }
    
    return value;
  };

  if (Array.isArray(sanitized)) {
    return sanitized.map((item, index) => sanitizeValue(item, index.toString()));
  } else {
    Object.keys(sanitized).forEach(key => {
      sanitized[key] = sanitizeValue(sanitized[key], key);
    });
  }

  return sanitized;
}

/**
 * Create complete logging middleware stack
 * @param {Object} options - Configuration options
 * @returns {Array} Array of middleware functions
 */
function createLoggingMiddlewareStack(options = {}) {
  const stack = [];

  // Add request ID middleware (always first)
  stack.push(createRequestIdMiddleware());

  // Add request logging
  if (options.requestLogging !== false) {
    stack.push(createRequestLoggingMiddleware(options.requestLogging));
  }

  // Add performance monitoring
  if (options.performance !== false) {
    stack.push(createPerformanceMiddleware(options.performance));
  }

  // Add response logging
  if (options.responseLogging !== false) {
    stack.push(createResponseLoggingMiddleware(options.responseLogging));
  }

  return stack;
}

module.exports = {
  createRequestIdMiddleware,
  createRequestLoggingMiddleware,
  createResponseLoggingMiddleware,
  createErrorLoggingMiddleware,
  createPerformanceMiddleware,
  createLoggingMiddlewareStack,
  getClientIP,
  sanitizeObject
};