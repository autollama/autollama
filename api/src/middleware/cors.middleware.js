/**
 * CORS Middleware Configuration
 * Handles Cross-Origin Resource Sharing policies for API endpoints
 */

const { logger } = require('../utils/logger');
const { ENVIRONMENTS } = require('../utils/constants');

/**
 * CORS configuration options
 */
const corsConfig = {
  // Development configuration (more permissive)
  development: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8080',
      'http://localhost:8082',
      'https://autollama.io',
      'https://api.autollama.io',
      'http://autollama.io',
      'http://api.autollama.io',
      /^http:\/\/localhost:\d+$/, // Any localhost port
      /^http:\/\/127\.0\.0\.1:\d+$/, // Any 127.0.0.1 port
      /^http:\/\/.*\.local(:\d+)?$/, // .local domains
      /^https?:\/\/.*\.autollama\.io(:\d+)?$/ // autollama.io subdomains
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control',
      'X-Request-ID',
      'X-Correlation-ID'
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset'
    ],
    optionsSuccessStatus: 200,
    preflightContinue: false,
    maxAge: 86400 // 24 hours
  },

  // Production configuration (more restrictive)
  production: {
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        process.env.FRONTEND_URL,
        process.env.LEGACY_FRONTEND_URL,
        process.env.ALLOWED_ORIGINS?.split(',') || []
      ].flat().filter(Boolean);
      
      // Check against environment-specific allowed origins
      if (allowedOrigins.some(allowed => {
        if (typeof allowed === 'string') {
          return origin === allowed || origin.endsWith(allowed);
        }
        return allowed.test && allowed.test(origin);
      })) {
        return callback(null, true);
      }
      
      // Log unauthorized origin attempt
      logger.warn('CORS: Unauthorized origin attempt', { origin });
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control'
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset'
    ],
    optionsSuccessStatus: 200,
    preflightContinue: false,
    maxAge: 3600 // 1 hour
  },

  // Testing configuration
  test: {
    origin: true, // Allow all origins in test
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: '*',
    optionsSuccessStatus: 200,
    preflightContinue: false
  }
};

/**
 * Get CORS configuration based on environment
 * @returns {Object} CORS configuration
 */
function getCorsConfig() {
  const env = process.env.NODE_ENV || ENVIRONMENTS.DEVELOPMENT;
  const config = corsConfig[env] || corsConfig.development;
  
  // Add dynamic origin handling for Tailscale networks
  if (env === ENVIRONMENTS.DEVELOPMENT || env === ENVIRONMENTS.STAGING) {
    const originalOrigin = config.origin;
    
    config.origin = function(origin, callback) {
      // Allow no origin (for mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      // Check Tailscale IP ranges (100.x.x.x)
      const tailscaleRegex = /^https?:\/\/100\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/;
      if (tailscaleRegex.test(origin)) {
        logger.debug('CORS: Allowing Tailscale origin', { origin });
        return callback(null, true);
      }
      
      // Check original configuration
      if (Array.isArray(originalOrigin)) {
        const allowed = originalOrigin.some(allowed => {
          if (typeof allowed === 'string') {
            return origin === allowed;
          }
          return allowed.test && allowed.test(origin);
        });
        
        if (allowed) {
          return callback(null, true);
        }
      } else if (typeof originalOrigin === 'function') {
        return originalOrigin(origin, callback);
      } else if (originalOrigin === true) {
        return callback(null, true);
      }
      
      logger.warn('CORS: Rejected origin', { origin });
      callback(new Error('Not allowed by CORS'));
    };
  }
  
  return config;
}

/**
 * Create CORS middleware with custom configuration
 * @param {Object} customConfig - Custom CORS configuration
 * @returns {Function} CORS middleware function
 */
function createCorsMiddleware(customConfig = {}) {
  const cors = require('cors');
  const baseConfig = getCorsConfig();
  const finalConfig = { ...baseConfig, ...customConfig };
  
  const corsLogger = logger.child({ component: 'cors-middleware' });
  
  // Log CORS configuration (without sensitive data)
  corsLogger.info('CORS middleware configured', {
    environment: process.env.NODE_ENV,
    methods: finalConfig.methods,
    credentials: finalConfig.credentials,
    allowedHeaders: finalConfig.allowedHeaders?.slice(0, 5), // Log first 5 headers only
    maxAge: finalConfig.maxAge
  });
  
  return cors(finalConfig);
}

/**
 * Security headers middleware
 * Adds additional security headers alongside CORS
 */
function createSecurityHeadersMiddleware() {
  return (req, res, next) => {
    const securityLogger = logger.child({ component: 'security-headers' });
    
    // Content Security Policy
    res.setHeader('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "font-src 'self' data:; " +
      "img-src 'self' data: blob:; " +
      "connect-src 'self' ws: wss:; " +
      "frame-ancestors 'none';"
    );
    
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // Remove sensitive headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    // Add request ID header if available
    if (req.id) {
      res.setHeader('X-Request-ID', req.id);
    }
    
    securityLogger.debug('Security headers applied', {
      path: req.path,
      method: req.method
    });
    
    next();
  };
}

/**
 * Preflight options handler
 * Optimized handling of OPTIONS requests
 */
function createPreflightHandler() {
  return (req, res, next) => {
    if (req.method === 'OPTIONS') {
      const preflightLogger = logger.child({ component: 'preflight-handler' });
      
      preflightLogger.debug('Handling preflight request', {
        origin: req.get('Origin'),
        requestedMethod: req.get('Access-Control-Request-Method'),
        requestedHeaders: req.get('Access-Control-Request-Headers')
      });
      
      // CORS middleware should have already set the appropriate headers
      res.status(200).end();
      return;
    }
    
    next();
  };
}

/**
 * CORS error handler
 * Handles CORS-related errors with proper logging
 */
function createCorsErrorHandler() {
  return (err, req, res, next) => {
    if (err.message && err.message.includes('CORS')) {
      const corsLogger = logger.child({ component: 'cors-error-handler' });
      
      corsLogger.warn('CORS error occurred', {
        origin: req.get('Origin'),
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
        error: err.message
      });
      
      res.status(403).json({
        success: false,
        error: {
          message: 'Cross-origin request blocked',
          code: 'CORS_ERROR',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }
    
    next(err);
  };
}

/**
 * Create complete CORS middleware stack
 * @param {Object} options - Configuration options
 * @returns {Array} Array of middleware functions
 */
function createCorsMiddlewareStack(options = {}) {
  const stack = [];
  
  // Add security headers first
  if (options.securityHeaders !== false) {
    stack.push(createSecurityHeadersMiddleware());
  }
  
  // Add main CORS middleware
  stack.push(createCorsMiddleware(options.cors));
  
  // Add preflight handler
  if (options.preflightHandler !== false) {
    stack.push(createPreflightHandler());
  }
  
  // Add CORS error handler
  if (options.errorHandler !== false) {
    stack.push(createCorsErrorHandler());
  }
  
  return stack;
}

/**
 * Route-specific CORS configurations
 */
const routeSpecificCors = {
  // Public API endpoints (more permissive)
  public: {
    origin: true,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS']
  },
  
  // Admin endpoints (more restrictive)
  admin: {
    origin: function(origin, callback) {
      const adminOrigins = process.env.ADMIN_ORIGINS?.split(',') || ['http://localhost:3000'];
      
      if (!origin || adminOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS - Admin access required'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  },
  
  // File upload endpoints
  upload: {
    origin: getCorsConfig().origin,
    credentials: true,
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control'
    ]
  },
  
  // Streaming endpoints (SSE/WebSocket)
  streaming: {
    origin: [getCorsConfig().origin, 'https://autollama.io', '*'].flat(),
    credentials: false,
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Cache-Control',
      'Last-Event-ID',
      'Authorization',
      'Content-Type'
    ]
  },
  
  // OpenWebUI pipeline endpoints
  openwebui: {
    origin: [
      'https://autollama.io',
      'https://api.autollama.io',
      'http://autollama.io',
      'http://api.autollama.io',
      'http://autollama-on-hstgr:9099',
      /^https?:\/\/100\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/, // Tailscale IPs
      /^http:\/\/localhost:\d+$/, // Development
      '*' // Allow all for pipeline access
    ],
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-API-Key',
      'Cache-Control'
    ],
    exposedHeaders: [
      'Content-Type',
      'Content-Length'
    ]
  }
};

module.exports = {
  getCorsConfig,
  createCorsMiddleware,
  createSecurityHeadersMiddleware,
  createPreflightHandler,
  createCorsErrorHandler,
  createCorsMiddlewareStack,
  routeSpecificCors,
  corsConfig
};