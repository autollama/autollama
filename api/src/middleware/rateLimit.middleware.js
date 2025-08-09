/**
 * Rate Limiting Middleware
 * Provides comprehensive rate limiting and throttling capabilities
 */

const { logger } = require('../utils/logger');
const { AppError } = require('./error.middleware');
const { HTTP_STATUS, ERROR_CODES, ENVIRONMENTS } = require('../utils/constants');

/**
 * In-memory rate limit store
 * For production, consider using Redis
 */
class MemoryStore {
  constructor() {
    this.store = new Map();
    this.logger = logger.child({ component: 'rate-limit-memory-store' });
    
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Get rate limit data for key
   * @param {string} key - Rate limit key
   * @returns {Object|null} Rate limit data
   */
  get(key) {
    const data = this.store.get(key);
    
    if (!data) return null;
    
    // Check if expired
    if (Date.now() > data.resetTime) {
      this.store.delete(key);
      return null;
    }
    
    return data;
  }

  /**
   * Set rate limit data for key
   * @param {string} key - Rate limit key
   * @param {Object} data - Rate limit data
   */
  set(key, data) {
    this.store.set(key, data);
  }

  /**
   * Increment hit count for key
   * @param {string} key - Rate limit key
   * @param {number} windowMs - Window duration in milliseconds
   * @returns {Object} Current rate limit data
   */
  increment(key, windowMs) {
    const now = Date.now();
    const resetTime = now + windowMs;
    
    let data = this.get(key);
    
    if (!data) {
      data = {
        count: 1,
        firstHit: now,
        resetTime: resetTime
      };
    } else {
      data.count++;
    }
    
    this.set(key, data);
    return data;
  }

  /**
   * Remove expired entries
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, data] of this.store.entries()) {
      if (now > data.resetTime) {
        this.store.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      this.logger.debug('Rate limit store cleanup completed', {
        entriesRemoved: removed,
        remainingEntries: this.store.size
      });
    }
  }

  /**
   * Get store statistics
   * @returns {Object} Store statistics
   */
  getStats() {
    return {
      totalKeys: this.store.size,
      memoryUsage: JSON.stringify([...this.store.entries()]).length
    };
  }

  /**
   * Close store and cleanup resources
   */
  close() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

/**
 * Rate limit configurations for different endpoints
 */
const rateLimitConfigs = {
  // Default configuration
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later'
  },

  // Strict limits for resource-intensive operations
  strict: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 requests per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many resource-intensive requests, please try again later'
  },

  // Processing endpoints (file upload, URL processing)
  processing: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 processing requests per hour
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    message: 'Too many processing requests, please try again later'
  },

  // Search endpoints
  search: {
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 searches per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many search requests, please slow down'
  },

  // Authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: 'Too many authentication attempts, please try again later'
  },

  // Health check endpoints (more permissive)
  health: {
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 120 health checks per minute
    standardHeaders: false,
    legacyHeaders: false,
    message: 'Too many health check requests'
  },

  // Admin endpoints (very strict)
  admin: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 admin operations per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many admin requests, please try again later'
  },

  // Development environment (more permissive)
  development: {
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // Very high limit for development
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Development rate limit exceeded'
  }
};

/**
 * Create key generator function
 * @param {Object} options - Key generation options
 * @returns {Function} Key generator function
 */
function createKeyGenerator(options = {}) {
  return (req) => {
    const parts = [];
    
    // IP address (primary identifier)
    const ip = req.ip || 
               req.connection?.remoteAddress || 
               req.socket?.remoteAddress ||
               req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               'unknown';
    parts.push(ip);
    
    // User ID if authenticated
    if (options.includeUserId && req.user?.id) {
      parts.push(`user:${req.user.id}`);
    }
    
    // API key if present
    if (options.includeApiKey && req.headers['x-api-key']) {
      const apiKeyHash = require('crypto')
        .createHash('sha256')
        .update(req.headers['x-api-key'])
        .digest('hex')
        .substring(0, 16);
      parts.push(`api:${apiKeyHash}`);
    }
    
    // Route-specific identifier
    if (options.includeRoute) {
      parts.push(req.route?.path || req.path);
    }
    
    // Method-specific identifier
    if (options.includeMethod) {
      parts.push(req.method);
    }
    
    return parts.join(':');
  };
}

/**
 * Create rate limiting middleware
 * @param {Object|string} config - Rate limit configuration or config name
 * @param {Object} customOptions - Custom options to override config
 * @returns {Function} Rate limiting middleware
 */
function createRateLimitMiddleware(config = 'default', customOptions = {}) {
  // Get configuration
  const baseConfig = typeof config === 'string' 
    ? (rateLimitConfigs[config] || rateLimitConfigs.default)
    : config;
  
  // Override for development environment
  const env = process.env.NODE_ENV || ENVIRONMENTS.DEVELOPMENT;
  if (env === ENVIRONMENTS.DEVELOPMENT && !customOptions.ignoreDevelopment) {
    Object.assign(baseConfig, rateLimitConfigs.development);
  }
  
  const finalConfig = { ...baseConfig, ...customOptions };
  
  // Create store
  const store = new MemoryStore();
  
  // Create key generator
  const generateKey = finalConfig.keyGenerator || createKeyGenerator({
    includeUserId: finalConfig.includeUserId,
    includeApiKey: finalConfig.includeApiKey,
    includeRoute: finalConfig.includeRoute,
    includeMethod: finalConfig.includeMethod
  });
  
  const rateLimitLogger = logger.child({ 
    component: 'rate-limit-middleware',
    config: typeof config === 'string' ? config : 'custom'
  });
  
  rateLimitLogger.info('Rate limit middleware created', {
    windowMs: finalConfig.windowMs,
    max: finalConfig.max,
    environment: env
  });
  
  return (req, res, next) => {
    try {
      const key = generateKey(req);
      const now = Date.now();
      
      // Skip if skip conditions are met
      if (finalConfig.skip && finalConfig.skip(req, res)) {
        return next();
      }
      
      // Get or increment rate limit data
      const data = store.increment(key, finalConfig.windowMs);
      
      // Set standard headers
      if (finalConfig.standardHeaders) {
        res.set({
          'RateLimit-Limit': finalConfig.max,
          'RateLimit-Remaining': Math.max(0, finalConfig.max - data.count),
          'RateLimit-Reset': new Date(data.resetTime).toISOString()
        });
      }
      
      // Set legacy headers for backward compatibility
      if (finalConfig.legacyHeaders) {
        res.set({
          'X-RateLimit-Limit': finalConfig.max,
          'X-RateLimit-Remaining': Math.max(0, finalConfig.max - data.count),
          'X-RateLimit-Reset': Math.ceil(data.resetTime / 1000)
        });
      }
      
      // Check if limit exceeded
      if (data.count > finalConfig.max) {
        rateLimitLogger.warn('Rate limit exceeded', {
          key: key.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, '[IP]'), // Mask IP for logging
          count: data.count,
          limit: finalConfig.max,
          windowMs: finalConfig.windowMs,
          resetTime: new Date(data.resetTime).toISOString(),
          userAgent: req.get('User-Agent'),
          path: req.path
        });
        
        // Call rate limit handler if provided
        if (finalConfig.handler) {
          return finalConfig.handler(req, res, next);
        }
        
        // Default handler
        const error = new AppError(
          finalConfig.message,
          HTTP_STATUS.TOO_MANY_REQUESTS,
          ERROR_CODES.RATE_LIMIT_ERROR
        );
        
        return next(error);
      }
      
      // Log rate limit status for monitoring
      if (data.count > finalConfig.max * 0.8) { // Warn at 80% of limit
        rateLimitLogger.warn('Rate limit approaching', {
          key: key.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, '[IP]'),
          count: data.count,
          limit: finalConfig.max,
          percentage: Math.round((data.count / finalConfig.max) * 100)
        });
      }
      
      next();
      
    } catch (error) {
      rateLimitLogger.error('Rate limiting error', {
        error: error.message,
        stack: error.stack
      });
      
      // Continue on rate limiting errors (fail open)
      next();
    }
  };
}

/**
 * Create dynamic rate limiter that adjusts based on load
 * @param {Object} baseConfig - Base rate limit configuration
 * @returns {Function} Dynamic rate limiting middleware
 */
function createDynamicRateLimiter(baseConfig = rateLimitConfigs.default) {
  let currentLoad = 0;
  const loadHistory = [];
  const MAX_HISTORY = 60; // Keep 60 data points
  
  // Monitor system load
  setInterval(() => {
    // Simple load calculation based on memory usage
    const memUsage = process.memoryUsage();
    const load = memUsage.heapUsed / memUsage.heapTotal;
    
    loadHistory.push(load);
    if (loadHistory.length > MAX_HISTORY) {
      loadHistory.shift();
    }
    
    currentLoad = loadHistory.reduce((a, b) => a + b, 0) / loadHistory.length;
  }, 1000);
  
  return createRateLimitMiddleware({
    ...baseConfig,
    max: () => {
      // Reduce limit based on system load
      const baseLim = baseConfig.max;
      if (currentLoad > 0.8) return Math.floor(baseLim * 0.5); // 50% at high load
      if (currentLoad > 0.6) return Math.floor(baseLim * 0.7); // 70% at medium load
      return baseLim;
    }
  });
}

/**
 * Pre-configured rate limiters for common use cases
 */
const rateLimiters = {
  // Default rate limiter
  default: () => createRateLimitMiddleware('default'),
  
  // Strict rate limiter for resource-intensive operations
  strict: () => createRateLimitMiddleware('strict'),
  
  // Processing endpoints
  processing: () => createRateLimitMiddleware('processing'),
  
  // Search endpoints
  search: () => createRateLimitMiddleware('search'),
  
  // Authentication endpoints
  auth: () => createRateLimitMiddleware('auth'),
  
  // Health check endpoints
  health: () => createRateLimitMiddleware('health'),
  
  // Admin endpoints
  admin: () => createRateLimitMiddleware('admin'),
  
  // File upload endpoints (extra strict)
  upload: () => createRateLimitMiddleware('processing', {
    max: 5, // Only 5 uploads per hour
    message: 'Too many file uploads, please try again later'
  }),
  
  // Dynamic rate limiter
  dynamic: () => createDynamicRateLimiter(),
  
  // Per-user rate limiter (requires authentication)
  perUser: () => createRateLimitMiddleware('default', {
    includeUserId: true,
    keyGenerator: createKeyGenerator({ includeUserId: true })
  }),
  
  // API key based rate limiter
  apiKey: () => createRateLimitMiddleware('default', {
    includeApiKey: true,
    keyGenerator: createKeyGenerator({ includeApiKey: true })
  })
};

/**
 * Rate limiting utility functions
 */
const rateLimitUtils = {
  /**
   * Get current rate limit status for a key
   * @param {string} key - Rate limit key
   * @param {MemoryStore} store - Rate limit store
   * @returns {Object} Rate limit status
   */
  getStatus: (key, store) => {
    const data = store.get(key);
    if (!data) return { count: 0, remaining: null, resetTime: null };
    
    return {
      count: data.count,
      remaining: Math.max(0, data.limit - data.count),
      resetTime: data.resetTime,
      isLimited: data.count >= data.limit
    };
  },
  
  /**
   * Reset rate limit for a key
   * @param {string} key - Rate limit key
   * @param {MemoryStore} store - Rate limit store
   */
  reset: (key, store) => {
    store.store.delete(key);
  },
  
  /**
   * Get all rate limit statistics
   * @param {MemoryStore} store - Rate limit store
   * @returns {Object} Statistics
   */
  getStats: (store) => {
    return store.getStats();
  }
};

module.exports = {
  createRateLimitMiddleware,
  createDynamicRateLimiter,
  createKeyGenerator,
  rateLimiters,
  rateLimitConfigs,
  rateLimitUtils,
  MemoryStore
};