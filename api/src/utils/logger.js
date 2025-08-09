/**
 * Structured Logging with Winston
 * Centralized logging configuration for AutoLlama API
 */

const winston = require('winston');
const path = require('path');
const config = require('../config');

/**
 * Custom log format for structured logging
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ['message', 'level', 'timestamp', 'label']
  })
);

/**
 * Console format for development
 */
const consoleFormat = winston.format.combine(
  logFormat,
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, metadata }) => {
    let log = `${timestamp} [${level}] ${message}`;
    
    // Add metadata if present
    if (metadata && Object.keys(metadata).length > 0) {
      log += `\n${JSON.stringify(metadata, null, 2)}`;
    }
    
    return log;
  })
);

/**
 * JSON format for production
 */
const jsonFormat = winston.format.combine(
  logFormat,
  winston.format.json()
);

/**
 * Create logger transports based on configuration
 */
function createTransports() {
  const transports = [];

  // Console transport
  if (config.logging.enableConsole) {
    transports.push(
      new winston.transports.Console({
        level: config.logging.level,
        format: config.isDevelopment ? consoleFormat : jsonFormat,
        handleExceptions: true,
        handleRejections: true
      })
    );
  }

  // File transport
  if (config.logging.enableFile) {
    const logDir = path.join(__dirname, '../../logs');
    
    transports.push(
      new winston.transports.File({
        level: config.logging.level,
        filename: path.join(logDir, config.logging.filename),
        format: jsonFormat,
        maxsize: config.logging.maxSize,
        maxFiles: config.logging.maxFiles,
        handleExceptions: true,
        handleRejections: true
      })
    );

    // Separate error log file
    transports.push(
      new winston.transports.File({
        level: 'error',
        filename: path.join(logDir, 'error.log'),
        format: jsonFormat,
        maxsize: config.logging.maxSize,
        maxFiles: config.logging.maxFiles
      })
    );
  }

  // Ensure we always have at least one transport (for tests)
  if (transports.length === 0) {
    transports.push(
      new winston.transports.Console({
        level: 'error',
        format: winston.format.simple(),
        silent: process.env.NODE_ENV === 'testing'
      })
    );
  }

  return transports;
}

/**
 * Create and configure the main logger
 */
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: 'autollama-api',
    environment: config.env,
    version: require('../../package.json').version
  },
  transports: createTransports(),
  exitOnError: false
});

/**
 * Request logging middleware
 */
function createRequestLogger() {
  return (req, res, next) => {
    const start = Date.now();
    
    // Log incoming request
    logger.info('Incoming request', {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      requestId: req.headers['x-request-id'] || 'unknown'
    });

    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 400 ? 'warn' : 'info';
      
      logger.log(level, 'Request completed', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    });

    next();
  };
}

/**
 * Database query logger
 */
function logDatabaseQuery(query, params = [], duration = null) {
  logger.debug('Database query', {
    query: query.replace(/\s+/g, ' ').trim(),
    params: params.length > 0 ? params : undefined,
    duration: duration ? `${duration}ms` : undefined,
    component: 'database'
  });
}

/**
 * AI service interaction logger
 */
function logAIInteraction(service, operation, data = {}) {
  logger.info(`AI service interaction: ${service}`, {
    service,
    operation,
    ...data,
    component: 'ai-service'
  });
}

/**
 * Processing pipeline logger
 */
function logProcessingStep(step, sessionId, data = {}) {
  logger.info(`Processing step: ${step}`, {
    step,
    sessionId,
    ...data,
    component: 'processing'
  });
}

/**
 * Health check logger
 */
function logHealthCheck(service, status, data = {}) {
  const level = status === 'healthy' ? 'info' : 'warn';
  logger.log(level, `Health check: ${service}`, {
    service,
    status,
    ...data,
    component: 'health'
  });
}

/**
 * Session cleanup logger
 */
function logSessionCleanup(type, results = {}) {
  logger.info(`Session cleanup: ${type}`, {
    type,
    ...results,
    component: 'session-cleanup'
  });
}

/**
 * Performance logger
 */
function logPerformanceMetric(metric, value, unit = 'ms', context = {}) {
  logger.info(`Performance metric: ${metric}`, {
    metric,
    value,
    unit,
    ...context,
    component: 'performance'
  });
}

/**
 * Error logger with context
 */
function logError(error, context = {}) {
  logger.error('Application error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
    component: 'error'
  });
}

/**
 * Create child logger with additional context
 */
function createChildLogger(context = {}) {
  return logger.child(context);
}

// Handle uncaught exceptions and unhandled rejections
if (!config.isDevelopment) {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      message: error.message,
      stack: error.stack,
      component: 'system'
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise: promise.toString(),
      component: 'system'
    });
  });
}

module.exports = {
  logger,
  createRequestLogger,
  createChildLogger,
  
  // Specialized loggers
  logDatabaseQuery,
  logAIInteraction,
  logProcessingStep,
  logHealthCheck,
  logSessionCleanup,
  logPerformanceMetric,
  logError
};