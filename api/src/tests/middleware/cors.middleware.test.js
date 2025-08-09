/**
 * Unit Tests for CORS Middleware
 * Tests Cross-Origin Resource Sharing policies and security headers
 */

const {
  getCorsConfig,
  createCorsMiddleware,
  createSecurityHeadersMiddleware,
  createPreflightHandler,
  createCorsErrorHandler,
  createCorsMiddlewareStack,
  routeSpecificCors,
  corsConfig
} = require('../../middleware/cors.middleware');

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

// Mock cors library
jest.mock('cors', () => {
  return jest.fn((options) => {
    return (req, res, next) => {
      // Mock basic CORS behavior
      if (options.origin) {
        if (typeof options.origin === 'function') {
          options.origin(req.get('Origin'), (err, allowed) => {
            if (err) {
              return next(err);
            }
            if (allowed) {
              res.setHeader('Access-Control-Allow-Origin', req.get('Origin') || '*');
            }
          });
        } else if (Array.isArray(options.origin)) {
          const origin = req.get('Origin');
          if (options.origin.some(allowed => {
            if (typeof allowed === 'string') {
              return origin === allowed;
            }
            return allowed.test && allowed.test(origin);
          })) {
            res.setHeader('Access-Control-Allow-Origin', origin);
          }
        } else if (options.origin === true) {
          res.setHeader('Access-Control-Allow-Origin', '*');
        }
      }
      
      if (options.credentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      
      if (options.methods) {
        res.setHeader('Access-Control-Allow-Methods', options.methods.join(', '));
      }
      
      next();
    };
  });
});

describe('CORS Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    next = createMockNext();
    
    // Mock response.setHeader and removeHeader
    res.setHeader = jest.fn();
    res.removeHeader = jest.fn();
    
    // Reset environment
    process.env.NODE_ENV = 'test';
  });

  describe('getCorsConfig', () => {
    test('should return development config in development environment', () => {
      process.env.NODE_ENV = 'development';
      
      const config = getCorsConfig();
      
      expect(config.credentials).toBe(true);
      expect(config.methods).toContain('GET');
      expect(config.methods).toContain('POST');
      expect(config.methods).toContain('DELETE');
      expect(config.maxAge).toBe(86400); // 24 hours for development
    });

    test('should return production config in production environment', () => {
      process.env.NODE_ENV = 'production';
      
      const config = getCorsConfig();
      
      expect(config.credentials).toBe(true);
      expect(typeof config.origin).toBe('function');
      expect(config.maxAge).toBe(3600); // 1 hour for production
    });

    test('should return test config in test environment', () => {
      process.env.NODE_ENV = 'test';
      
      const config = getCorsConfig();
      
      expect(config.origin).toBe(true); // Allow all origins in test
      expect(config.credentials).toBe(true);
    });

    test('should add Tailscale origin handling in development', () => {
      process.env.NODE_ENV = 'development';
      
      const config = getCorsConfig();
      
      expect(typeof config.origin).toBe('function');
    });
  });

  describe('createCorsMiddleware', () => {
    test('should create CORS middleware with default configuration', () => {
      const middleware = createCorsMiddleware();
      
      expect(typeof middleware).toBe('function');
    });

    test('should create CORS middleware with custom configuration', () => {
      const customConfig = {
        origin: ['https://custom-domain.com'],
        credentials: false
      };
      
      const middleware = createCorsMiddleware(customConfig);
      
      expect(typeof middleware).toBe('function');
    });

    test('should handle CORS middleware execution', async () => {
      const middleware = createCorsMiddleware({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST']
      });
      
      await middleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true');
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('createSecurityHeadersMiddleware', () => {
    test('should set security headers', async () => {
      const middleware = createSecurityHeadersMiddleware();
      req.path = '/api/test';
      req.method = 'GET';
      
      await middleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('Content-Security-Policy', expect.any(String));
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(res.setHeader).toHaveBeenCalledWith('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      expect(next).toHaveBeenCalled();
    });

    test('should remove sensitive headers', async () => {
      const middleware = createSecurityHeadersMiddleware();
      
      await middleware(req, res, next);
      
      expect(res.removeHeader).toHaveBeenCalledWith('X-Powered-By');
      expect(res.removeHeader).toHaveBeenCalledWith('Server');
      expect(next).toHaveBeenCalled();
    });

    test('should add request ID header when available', async () => {
      const middleware = createSecurityHeadersMiddleware();
      req.id = 'test-request-123';
      
      await middleware(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'test-request-123');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('createPreflightHandler', () => {
    test('should handle OPTIONS requests', async () => {
      const middleware = createPreflightHandler();
      req.method = 'OPTIONS';
      req.get = jest.fn((header) => {
        switch (header) {
          case 'Origin': return 'https://example.com';
          case 'Access-Control-Request-Method': return 'POST';
          case 'Access-Control-Request-Headers': return 'Content-Type';
          default: return null;
        }
      });
      
      res.status = jest.fn().mockReturnValue(res);
      res.end = jest.fn();
      
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('should pass through non-OPTIONS requests', async () => {
      const middleware = createPreflightHandler();
      req.method = 'GET';
      
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
  });

  describe('createCorsErrorHandler', () => {
    test('should handle CORS errors', async () => {
      const middleware = createCorsErrorHandler();
      const corsError = new Error('Not allowed by CORS');
      req.get = jest.fn((header) => {
        switch (header) {
          case 'Origin': return 'https://unauthorized.com';
          case 'User-Agent': return 'Test Agent';
          default: return null;
        }
      });
      req.method = 'POST';
      req.path = '/api/test';
      
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn();
      
      await middleware(corsError, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Cross-origin request blocked',
          code: 'CORS_ERROR',
          timestamp: expect.any(String)
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should pass through non-CORS errors', async () => {
      const middleware = createCorsErrorHandler();
      const otherError = new Error('Some other error');
      
      await middleware(otherError, req, res, next);
      
      expect(next).toHaveBeenCalledWith(otherError);
    });
  });

  describe('createCorsMiddlewareStack', () => {
    test('should create complete middleware stack', () => {
      const stack = createCorsMiddlewareStack();
      
      expect(Array.isArray(stack)).toBe(true);
      expect(stack.length).toBeGreaterThan(0);
    });

    test('should include all middleware types by default', () => {
      const stack = createCorsMiddlewareStack();
      
      // Should include security headers, CORS, preflight, and error handler
      expect(stack.length).toBe(4);
    });

    test('should exclude security headers when disabled', () => {
      const stack = createCorsMiddlewareStack({
        securityHeaders: false
      });
      
      expect(stack.length).toBe(3);
    });

    test('should exclude preflight handler when disabled', () => {
      const stack = createCorsMiddlewareStack({
        preflightHandler: false
      });
      
      expect(stack.length).toBe(3);
    });

    test('should exclude error handler when disabled', () => {
      const stack = createCorsMiddlewareStack({
        errorHandler: false
      });
      
      expect(stack.length).toBe(3);
    });

    test('should accept custom CORS configuration', () => {
      const customCors = {
        origin: ['https://custom.com'],
        credentials: false
      };
      
      const stack = createCorsMiddlewareStack({
        cors: customCors
      });
      
      expect(stack.length).toBe(4);
    });
  });

  describe('routeSpecificCors', () => {
    test('should have public CORS configuration', () => {
      expect(routeSpecificCors.public).toBeDefined();
      expect(routeSpecificCors.public.origin).toBe(true);
      expect(routeSpecificCors.public.credentials).toBe(false);
    });

    test('should have admin CORS configuration', () => {
      expect(routeSpecificCors.admin).toBeDefined();
      expect(typeof routeSpecificCors.admin.origin).toBe('function');
      expect(routeSpecificCors.admin.credentials).toBe(true);
    });

    test('should have upload CORS configuration', () => {
      expect(routeSpecificCors.upload).toBeDefined();
      expect(routeSpecificCors.upload.methods).toContain('POST');
      expect(routeSpecificCors.upload.credentials).toBe(true);
    });

    test('should have streaming CORS configuration', () => {
      expect(routeSpecificCors.streaming).toBeDefined();
      expect(routeSpecificCors.streaming.methods).toContain('GET');
      expect(routeSpecificCors.streaming.allowedHeaders).toContain('Last-Event-ID');
    });
  });

  describe('production origin validation', () => {
    test('should validate allowed origins in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.FRONTEND_URL = 'https://app.example.com';
      process.env.LEGACY_FRONTEND_URL = 'https://legacy.example.com';
      
      const config = getCorsConfig();
      const callback = jest.fn();
      
      // Test allowed origin
      config.origin('https://app.example.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
      
      // Test disallowed origin
      callback.mockClear();
      config.origin('https://malicious.com', callback);
      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });

    test('should allow requests with no origin', () => {
      process.env.NODE_ENV = 'production';
      const config = getCorsConfig();
      const callback = jest.fn();
      
      config.origin(null, callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });

  describe('Tailscale origin handling', () => {
    test('should allow Tailscale IP ranges in development', () => {
      process.env.NODE_ENV = 'development';
      const config = getCorsConfig();
      const callback = jest.fn();
      
      // Test Tailscale IP
      config.origin('http://100.64.0.1:3000', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
      
      // Test another Tailscale IP
      callback.mockClear();
      config.origin('https://100.127.255.254:8080', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    test('should reject non-Tailscale IPs when not in allowed list', () => {
      process.env.NODE_ENV = 'development';
      const config = getCorsConfig();
      const callback = jest.fn();
      
      // Test non-Tailscale IP
      config.origin('http://192.168.1.1:3000', callback);
      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('admin origin validation', () => {
    test('should validate admin origins', () => {
      process.env.ADMIN_ORIGINS = 'https://admin1.com,https://admin2.com';
      const adminCors = routeSpecificCors.admin;
      const callback = jest.fn();
      
      // Test allowed admin origin
      adminCors.origin('https://admin1.com', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
      
      // Test disallowed origin
      callback.mockClear();
      adminCors.origin('https://hacker.com', callback);
      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });

    test('should allow no origin for admin routes', () => {
      const adminCors = routeSpecificCors.admin;
      const callback = jest.fn();
      
      adminCors.origin(null, callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    test('should use default admin origins when env var not set', () => {
      delete process.env.ADMIN_ORIGINS;
      const adminCors = routeSpecificCors.admin;
      const callback = jest.fn();
      
      adminCors.origin('http://localhost:3000', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });

  describe('corsConfig environments', () => {
    test('should have different maxAge for different environments', () => {
      expect(corsConfig.development.maxAge).toBe(86400); // 24 hours
      expect(corsConfig.production.maxAge).toBe(3600); // 1 hour
    });

    test('should have different exposed headers', () => {
      expect(corsConfig.development.exposedHeaders).toContain('X-Request-ID');
      expect(corsConfig.production.exposedHeaders).not.toContain('X-Request-ID');
    });

    test('should allow more methods in development', () => {
      expect(corsConfig.development.methods).toContain('PATCH');
      expect(corsConfig.production.methods).not.toContain('PATCH');
    });
  });

  describe('error scenarios', () => {
    test('should handle missing environment variables gracefully', () => {
      delete process.env.FRONTEND_URL;
      delete process.env.LEGACY_FRONTEND_URL;
      delete process.env.ALLOWED_ORIGINS;
      
      process.env.NODE_ENV = 'production';
      
      const config = getCorsConfig();
      expect(typeof config.origin).toBe('function');
      
      const callback = jest.fn();
      config.origin('https://example.com', callback);
      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });

    test('should handle malformed ALLOWED_ORIGINS environment variable', () => {
      process.env.ALLOWED_ORIGINS = 'not,valid,urls';
      process.env.NODE_ENV = 'production';
      delete process.env.FRONTEND_URL;
      delete process.env.LEGACY_FRONTEND_URL;
      
      const config = getCorsConfig();
      const callback = jest.fn();
      
      config.origin('https://unauthorized.com', callback);
      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});