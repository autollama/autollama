/**
 * Session Validation Middleware
 * Ensures all processing operations have valid session tracking
 */

const { logger } = require('../utils/logger');

/**
 * Middleware to validate session ID before processing operations
 */
function validateSessionMiddleware(sessionTracker) {
  return async (req, res, next) => {
    // Skip validation for non-processing endpoints
    const processingEndpoints = [
      '/process-url',
      '/process-file',
      '/process-url-stream',
      '/process-file-stream',
      '/process-ai-content',
      '/resume-upload'
    ];

    const isProcessingEndpoint = processingEndpoints.some(endpoint => 
      req.path.includes(endpoint)
    );

    if (!isProcessingEndpoint) {
      return next();
    }

    // Extract session ID from various sources
    let sessionId = null;
    
    if (req.params.sessionId) {
      sessionId = req.params.sessionId;
    } else if (req.body.sessionId) {
      sessionId = req.body.sessionId;
    } else if (req.query.sessionId) {
      sessionId = req.query.sessionId;
    } else if (req.headers['x-session-id']) {
      sessionId = req.headers['x-session-id'];
    }

    // For new processing requests, session creation will be handled by the endpoint
    if (req.method === 'POST' && !sessionId) {
      logger.debug('New processing request without session ID - will create new session');
      return next();
    }

    // For existing session operations, validate the session
    if (sessionId) {
      const validation = sessionTracker.validateSession(sessionId);
      
      if (!validation.valid) {
        logger.warn(`Invalid session ID: ${sessionId}`, {
          reason: validation.reason,
          endpoint: req.path,
          method: req.method
        });

        return res.status(400).json({
          success: false,
          error: 'Invalid session',
          reason: validation.reason,
          sessionId: sessionId,
          timestamp: new Date().toISOString()
        });
      }

      // Add session info to request for downstream use
      req.session = validation.session;
      req.sessionId = sessionId;
      
      logger.debug(`Session validated: ${sessionId}`, {
        progress: validation.session.progress,
        status: validation.session.status
      });
    }

    next();
  };
}

/**
 * Middleware to ensure all processing has session tracking
 */
function requireSessionTracking(sessionTracker) {
  return async (req, res, next) => {
    // For processing operations that don't have a session, create one
    if (req.method === 'POST' && !req.sessionId) {
      try {
        // Extract processing metadata
        const filename = req.body.filename || 
                        req.file?.originalname || 
                        req.body.url?.split('/').pop() || 
                        'unknown';
        
        const totalChunks = req.body.expectedChunks || 
                           req.body.totalChunks || 
                           1;

        const uploadSource = req.body.source || 'user';

        // Create tracked session
        const session = await sessionTracker.createTrackedSession(
          filename,
          totalChunks,
          req.body.url || req.file?.path,
          uploadSource
        );

        req.sessionId = session.session_id;
        req.session = sessionTracker.getSessionStatus(session.session_id);

        logger.info(`Created new tracked session: ${session.session_id}`, {
          filename,
          totalChunks,
          endpoint: req.path
        });

      } catch (error) {
        logger.error('Failed to create tracked session:', error);
        
        return res.status(500).json({
          success: false,
          error: 'Failed to create processing session',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    next();
  };
}

/**
 * Middleware to update session heartbeat
 */
function sessionHeartbeat(sessionTracker) {
  return async (req, res, next) => {
    if (req.sessionId) {
      // Update session activity
      await sessionTracker.updateSessionActivity(req.sessionId);
      
      // Add heartbeat info to response headers
      res.set('X-Session-Heartbeat', new Date().toISOString());
      res.set('X-Session-ID', req.sessionId);
    }

    next();
  };
}

/**
 * Error handler for session-related errors
 */
function handleSessionErrors(sessionTracker) {
  return async (error, req, res, next) => {
    if (req.sessionId) {
      // Mark session as failed if there was an error
      await sessionTracker.markSessionFailed(
        req.sessionId,
        error.message || 'Processing error',
        {
          endpoint: req.path,
          method: req.method,
          error_code: error.code,
          stack: error.stack?.split('\n').slice(0, 3).join('\n') // First 3 lines of stack
        }
      );
      
      logger.error(`Session ${req.sessionId} failed:`, error);
    }

    next(error);
  };
}

module.exports = {
  validateSessionMiddleware,
  requireSessionTracking,
  sessionHeartbeat,
  handleSessionErrors
};