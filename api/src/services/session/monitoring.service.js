/**
 * Session Monitoring Service
 * Handles real-time session monitoring, heartbeat tracking, and progress updates
 */

const { logPerformanceMetric, logError } = require('../../utils/logger');
const { SESSION_STATUS, SSE_EVENTS, DEFAULTS } = require('../../utils/constants');

class SessionMonitoringService {
  constructor(dependencies) {
    this.db = dependencies.database || dependencies.databaseService;
    this.sseService = dependencies.sseService;
    this.config = {
      heartbeatInterval: dependencies.config?.heartbeatInterval || 30000, // 30 seconds
      progressUpdateInterval: dependencies.config?.progressUpdateInterval || 5000, // 5 seconds
      sessionCheckInterval: dependencies.config?.sessionCheckInterval || 60000 // 1 minute
    };
    
    this.logger = require('../../utils/logger').createChildLogger({ component: 'session-monitor' });
    this.activeSessions = new Map();
    this.heartbeatIntervals = new Map();
    this.isRunning = false;
    
    this.stats = {
      totalSessions: 0,
      activeSessions: 0,
      completedSessions: 0,
      failedSessions: 0,
      averageSessionDuration: 0,
      lastHeartbeat: null
    };
  }

  /**
   * Start a new processing session with monitoring
   * @param {string} url - URL being processed
   * @param {string} sessionId - Unique session identifier
   * @param {Object} options - Session options
   * @returns {string} Session ID
   */
  startProcessingSession(url, sessionId = null, options = {}) {
    const actualSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const sessionData = {
      sessionId: actualSessionId,
      url,
      startTime: Date.now(),
      lastHeartbeat: Date.now(),
      status: SESSION_STATUS.PROCESSING,
      progress: {
        stage: 'initialized',
        percentage: 0,
        currentStep: 'Starting processing...',
        totalSteps: options.estimatedSteps || 5
      },
      metadata: {
        userAgent: options.userAgent,
        ipAddress: options.ipAddress,
        uploadSource: options.uploadSource || 'user'
      }
    };

    this.activeSessions.set(actualSessionId, sessionData);
    this.stats.totalSessions++;
    this.stats.activeSessions++;

    // Start heartbeat monitoring for this session
    this._startHeartbeatMonitoring(actualSessionId);

    this.logger.info('Processing session started', {
      sessionId: actualSessionId,
      url: url.substring(0, 100),
      options
    });

    // Notify via SSE if available
    if (this.sseService) {
      this.sseService.broadcast(SSE_EVENTS.PROCESSING_STARTED, {
        sessionId: actualSessionId,
        url,
        timestamp: new Date().toISOString()
      });
    }

    return actualSessionId;
  }

  /**
   * End a processing session
   * @param {string} sessionId - Session to end
   * @param {string} status - Final status (completed/failed)
   * @param {Object} result - Processing result
   */
  endSession(sessionId, status = SESSION_STATUS.COMPLETED, result = {}) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      this.logger.warn('Attempted to end non-existent session', { sessionId });
      return;
    }

    const duration = Date.now() - session.startTime;
    
    // Stop heartbeat monitoring
    this._stopHeartbeatMonitoring(sessionId);
    
    // Update session status
    session.status = status;
    session.endTime = Date.now();
    session.duration = duration;
    session.result = result;

    // Update statistics
    this.stats.activeSessions--;
    if (status === SESSION_STATUS.COMPLETED) {
      this.stats.completedSessions++;
    } else if (status === SESSION_STATUS.FAILED) {
      this.stats.failedSessions++;
    }

    // Calculate average duration
    this._updateAverageSessionDuration(duration);

    this.logger.info('Processing session ended', {
      sessionId,
      status,
      duration,
      url: session.url.substring(0, 100)
    });

    // Notify via SSE if available
    if (this.sseService) {
      this.sseService.broadcast(SSE_EVENTS.PROCESSING_COMPLETED, {
        sessionId,
        status,
        duration,
        result,
        timestamp: new Date().toISOString()
      });
    }

    // Remove from active sessions
    this.activeSessions.delete(sessionId);

    logPerformanceMetric('session_duration', duration, 'ms', {
      sessionId,
      status,
      url: session.url.substring(0, 50)
    });
  }

  /**
   * Record an error for a session
   * @param {string} sessionId - Session that encountered error
   * @param {Error} error - Error object
   * @param {Object} context - Additional error context
   */
  recordError(sessionId, error, context = {}) {
    const session = this.activeSessions.get(sessionId);
    
    if (session) {
      session.errors = session.errors || [];
      session.errors.push({
        timestamp: Date.now(),
        message: error.message,
        stack: error.stack,
        context
      });
      
      session.status = SESSION_STATUS.FAILED;
    }

    this.logger.error('Session error recorded', {
      sessionId,
      error: error.message,
      context,
      url: session?.url?.substring(0, 100)
    });

    // Notify via SSE if available
    if (this.sseService) {
      this.sseService.broadcast(SSE_EVENTS.ERROR_OCCURRED, {
        sessionId,
        error: error.message,
        context,
        timestamp: new Date().toISOString()
      });
    }

    logError(error, {
      operation: 'session_processing',
      sessionId,
      context
    });
  }

  /**
   * Update session progress
   * @param {string} sessionId - Session to update
   * @param {Object} progress - Progress information
   */
  updateProgress(sessionId, progress) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      this.logger.warn('Attempted to update progress for non-existent session', { sessionId });
      return;
    }

    // Update progress
    session.progress = { ...session.progress, ...progress };
    session.lastHeartbeat = Date.now();

    this.logger.debug('Session progress updated', {
      sessionId,
      stage: progress.stage,
      percentage: progress.percentage,
      currentStep: progress.currentStep
    });

    // Notify via SSE if available
    if (this.sseService) {
      this.sseService.broadcast(SSE_EVENTS.PROGRESS_UPDATE, {
        sessionId,
        progress: session.progress,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Send heartbeat for a session
   * @param {string} sessionId - Session to send heartbeat for
   */
  sendHeartbeat(sessionId) {
    const session = this.activeSessions.get(sessionId);
    
    if (session) {
      session.lastHeartbeat = Date.now();
      this.stats.lastHeartbeat = Date.now();
      
      this.logger.debug('Heartbeat recorded', { sessionId });
      
      // Notify via SSE if available
      if (this.sseService) {
        this.sseService.broadcast(SSE_EVENTS.SESSION_UPDATED, {
          sessionId,
          type: 'heartbeat',
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Get active sessions
   * @returns {Array} List of active sessions
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.values()).map(session => ({
      sessionId: session.sessionId,
      url: session.url,
      status: session.status,
      progress: session.progress,
      startTime: session.startTime,
      lastHeartbeat: session.lastHeartbeat,
      duration: Date.now() - session.startTime,
      metadata: session.metadata
    }));
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session ID to retrieve
   * @returns {Object|null} Session data or null if not found
   */
  getSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    return session ? { ...session } : null;
  }

  /**
   * Get monitoring statistics
   * @returns {Object} Monitoring statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeSessions: this.activeSessions.size,
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
      config: this.config,
      memory: process.memoryUsage(),
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid
      }
    };
  }

  /**
   * Create a heartbeat-monitored callback for processing operations
   * @param {string} sessionId - Session ID
   * @param {Function} originalCallback - Original SSE callback
   * @returns {Function} Enhanced callback with heartbeat monitoring
   */
  createHeartbeatMonitoredCallback(sessionId, originalCallback) {
    let lastHeartbeat = Date.now();
    const heartbeatThreshold = this.config.heartbeatInterval * 2; // Allow 2x interval before timeout

    // Start heartbeat monitor
    const heartbeatInterval = setInterval(async () => {
      const now = Date.now();
      const timeSinceLastHeartbeat = now - lastHeartbeat;

      if (timeSinceLastHeartbeat > heartbeatThreshold) {
        this.logger.warn('Heartbeat timeout detected', {
          sessionId,
          timeSinceLastHeartbeat,
          threshold: heartbeatThreshold
        });

        try {
          // Mark session as failed due to heartbeat timeout
          await this.db.query(`
            UPDATE upload_sessions 
            SET status = 'failed', error_message = 'Heartbeat timeout', updated_at = NOW() 
            WHERE session_id = $1
          `, [sessionId]);
        } catch (error) {
          this.logger.error('Failed to update heartbeat timeout', { sessionId, error: error.message });
        }

        // Send heartbeat timeout notification
        originalCallback('heartbeat_timeout', {
          sessionId,
          timestamp: new Date().toISOString(),
          timeSinceLastHeartbeat
        });

        clearInterval(heartbeatInterval);
        return;
      }
    }, this.config.heartbeatInterval);

    // Return enhanced callback that tracks heartbeats
    return (event, data) => {
      lastHeartbeat = Date.now();
      this.sendHeartbeat(sessionId);

        // Send heartbeat update every significant progress
        if (['chunk_processed', 'embedding_created', 'analysis_completed'].includes(event)) {
          this.updateProgress(sessionId, {
            lastActivity: new Date().toISOString(),
            activeStage: event
          });
        }

        // Call original callback
        originalCallback(event, data);

        // Cleanup interval when processing completes
        if (['processing_completed', 'processing_failed'].includes(event)) {
          clearInterval(heartbeatInterval);
        }
    };
  }

  /**
   * Start the monitoring service
   */
  start() {
    if (this.isRunning) {
      this.logger.warn('Session monitoring already running');
      return;
    }

    this.startTime = Date.now();
    this.isRunning = true;
    this.logger.info('Session monitoring service started');
  }

  /**
   * Stop the monitoring service
   */
  stop() {
    if (!this.isRunning) return;

    // Stop all heartbeat intervals
    for (const sessionId of this.heartbeatIntervals.keys()) {
      this._stopHeartbeatMonitoring(sessionId);
    }

    this.isRunning = false;
    this.logger.info('Session monitoring service stopped');
  }

  /**
   * Private helper methods
   */
  _startHeartbeatMonitoring(sessionId) {
    const interval = setInterval(() => {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        this._stopHeartbeatMonitoring(sessionId);
        return;
      }

      const timeSinceLastHeartbeat = Date.now() - session.lastHeartbeat;
      if (timeSinceLastHeartbeat > this.config.heartbeatInterval * 3) {
        this.logger.warn('Session heartbeat missing', {
          sessionId,
          timeSinceLastHeartbeat,
          url: session.url.substring(0, 100)
        });
      }
    }, this.config.heartbeatInterval);

    this.heartbeatIntervals.set(sessionId, interval);
  }

  _stopHeartbeatMonitoring(sessionId) {
    const interval = this.heartbeatIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(sessionId);
    }
  }

  _updateAverageSessionDuration(newDuration) {
    const totalCompleted = this.stats.completedSessions + this.stats.failedSessions;
    if (totalCompleted === 1) {
      this.stats.averageSessionDuration = newDuration;
    } else {
      this.stats.averageSessionDuration = 
        (this.stats.averageSessionDuration * (totalCompleted - 1) + newDuration) / totalCompleted;
    }
  }
}

module.exports = SessionMonitoringService;