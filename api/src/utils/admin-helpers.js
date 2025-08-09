/**
 * Admin Helper Utilities
 * Shared utilities for session management, cleanup operations, and system monitoring
 * Used by CLI tools and API endpoints
 */

const { Pool } = require('pg');
const { promisify } = require('util');
const { logPerformanceMetric, logError } = require('./logger');
const { SESSION_STATUS, JOB_STATUS, DEFAULTS } = require('./constants');

class AdminHelpers {
  constructor(dependencies = {}) {
    this.db = dependencies.database || dependencies.databaseService;
    this.logger = require('./logger').createChildLogger({ component: 'admin-helpers' });
    
    // Create database pool if not provided
    if (!this.db && process.env.DATABASE_URL) {
      this.dbPool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
  }

  /**
   * Get comprehensive session statistics
   * @returns {Promise<Object>} Session statistics with detailed breakdown
   */
  async getSessionStatistics() {
    const startTime = Date.now();
    
    try {
      const client = this.db || this.dbPool;
      
      // Get session status breakdown
      const sessionStatsQuery = `
        SELECT 
          status,
          COUNT(*) as count,
          MIN(created_at) as oldest,
          MAX(updated_at) as most_recent,
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration_seconds
        FROM upload_sessions 
        GROUP BY status
        ORDER BY count DESC
      `;
      
      const sessionStats = await client.query(sessionStatsQuery);
      
      // Get stuck sessions (processing > heartbeat timeout)
      const stuckSessionsQuery = `
        SELECT 
          COUNT(*) as stuck_count,
          MIN(created_at) as oldest_stuck,
          MAX(updated_at) as last_activity
        FROM upload_sessions 
        WHERE status = 'processing' 
        AND updated_at < NOW() - INTERVAL '${Math.floor(DEFAULTS.HEARTBEAT_TIMEOUT / 1000)} seconds'
      `;
      
      const stuckStats = await client.query(stuckSessionsQuery);
      
      // Get background job statistics
      const jobStatsQuery = `
        SELECT 
          status,
          COUNT(*) as count,
          AVG(duration) as avg_duration_ms,
          MAX(created_at) as most_recent
        FROM background_jobs 
        GROUP BY status
        ORDER BY count DESC
      `;
      
      const jobStats = await client.query(jobStatsQuery);
      
      // Get memory and system information
      const memoryUsage = process.memoryUsage();
      const systemInfo = {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        pid: process.pid,
        memoryUsage: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
          arrayBuffers: `${Math.round(memoryUsage.arrayBuffers / 1024 / 1024)}MB`
        }
      };
      
      const duration = Date.now() - startTime;
      
      logPerformanceMetric('session_statistics', duration, 'ms');
      
      return {
        timestamp: new Date().toISOString(),
        queryDuration: duration,
        sessions: {
          byStatus: sessionStats.rows,
          stuck: stuckStats.rows[0],
          total: sessionStats.rows.reduce((sum, row) => sum + parseInt(row.count), 0)
        },
        backgroundJobs: {
          byStatus: jobStats.rows,
          total: jobStats.rows.reduce((sum, row) => sum + parseInt(row.count), 0)
        },
        system: systemInfo,
        thresholds: {
          heartbeatTimeout: DEFAULTS.HEARTBEAT_TIMEOUT,
          sessionTimeout: DEFAULTS.SESSION_TIMEOUT,
          processingTimeout: DEFAULTS.PROCESSING_TIMEOUT
        }
      };
      
    } catch (error) {
      logError(error, { operation: 'get_session_statistics' });
      throw new Error(`Failed to get session statistics: ${error.message}`);
    }
  }

  /**
   * Perform safe session cleanup with validation
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} Cleanup results
   */
  async performSafeCleanup(options = {}) {
    const {
      dryRun = false,
      maxAge = DEFAULTS.SESSION_TIMEOUT,
      includeStuck = true,
      includeTimeout = true,
      force = false
    } = options;
    
    const startTime = Date.now();
    
    try {
      const client = this.db || this.dbPool;
      
      // Pre-cleanup validation
      const validation = await this.validateCleanupSafety();
      if (!validation.safe && !force) {
        throw new Error(`Cleanup validation failed: ${validation.issues.join(', ')}`);
      }
      
      let cleanupResults = {
        dryRun,
        startTime: new Date().toISOString(),
        stuckSessionsCleaned: 0,
        timeoutSessionsCleaned: 0,
        totalCleaned: 0,
        sessionsUpdated: [],
        validation,
        errors: []
      };
      
      // Clean stuck sessions (no heartbeat)
      if (includeStuck) {
        const stuckQuery = dryRun 
          ? `SELECT session_id, url, created_at, updated_at FROM upload_sessions 
             WHERE status = 'processing' 
             AND updated_at < NOW() - INTERVAL '${Math.floor(DEFAULTS.HEARTBEAT_TIMEOUT / 1000)} seconds'`
          : `UPDATE upload_sessions 
             SET status = 'failed', 
                 error_message = 'Heartbeat timeout - cleaned by admin utility',
                 updated_at = NOW()
             WHERE status = 'processing' 
             AND updated_at < NOW() - INTERVAL '${Math.floor(DEFAULTS.HEARTBEAT_TIMEOUT / 1000)} seconds'
             RETURNING session_id, url, created_at`;
        
        const stuckResult = await client.query(stuckQuery);
        cleanupResults.stuckSessionsCleaned = stuckResult.rowCount || stuckResult.rows.length;
        cleanupResults.sessionsUpdated.push(...stuckResult.rows.map(row => ({
          sessionId: row.session_id,
          url: row.url?.substring(0, 100),
          reason: 'heartbeat_timeout',
          age: Date.now() - new Date(row.created_at).getTime()
        })));
      }
      
      // Clean timeout sessions
      if (includeTimeout) {
        const timeoutMinutes = Math.floor(maxAge / (60 * 1000));
        const timeoutQuery = dryRun
          ? `SELECT session_id, url, created_at, updated_at FROM upload_sessions 
             WHERE status = 'processing' 
             AND created_at < NOW() - INTERVAL '${timeoutMinutes} minutes'`
          : `UPDATE upload_sessions 
             SET status = 'failed', 
                 error_message = 'Session timeout - cleaned by admin utility',
                 updated_at = NOW()
             WHERE status = 'processing' 
             AND created_at < NOW() - INTERVAL '${timeoutMinutes} minutes'
             RETURNING session_id, url, created_at`;
        
        const timeoutResult = await client.query(timeoutQuery);
        cleanupResults.timeoutSessionsCleaned = timeoutResult.rowCount || timeoutResult.rows.length;
        cleanupResults.sessionsUpdated.push(...timeoutResult.rows.map(row => ({
          sessionId: row.session_id,
          url: row.url?.substring(0, 100),
          reason: 'session_timeout',
          age: Date.now() - new Date(row.created_at).getTime()
        })));
      }
      
      cleanupResults.totalCleaned = cleanupResults.stuckSessionsCleaned + cleanupResults.timeoutSessionsCleaned;
      cleanupResults.duration = Date.now() - startTime;
      cleanupResults.endTime = new Date().toISOString();
      
      if (!dryRun && cleanupResults.totalCleaned > 0) {
        this.logger.info('Session cleanup completed', {
          totalCleaned: cleanupResults.totalCleaned,
          stuckCleaned: cleanupResults.stuckSessionsCleaned,
          timeoutCleaned: cleanupResults.timeoutSessionsCleaned,
          duration: cleanupResults.duration
        });
      }
      
      logPerformanceMetric('safe_session_cleanup', cleanupResults.duration, 'ms', {
        totalCleaned: cleanupResults.totalCleaned,
        dryRun
      });
      
      return cleanupResults;
      
    } catch (error) {
      logError(error, { operation: 'safe_session_cleanup', options });
      throw new Error(`Safe cleanup failed: ${error.message}`);
    }
  }

  /**
   * Validate cleanup operation safety
   * @returns {Promise<Object>} Validation results
   */
  async validateCleanupSafety() {
    try {
      const client = this.db || this.dbPool;
      const issues = [];
      
      // Check for too many active sessions
      const activeSessionsQuery = `
        SELECT COUNT(*) as active_count 
        FROM upload_sessions 
        WHERE status = 'processing'
      `;
      
      const activeResult = await client.query(activeSessionsQuery);
      const activeCount = parseInt(activeResult.rows[0].active_count);
      
      if (activeCount > 100) {
        issues.push(`High number of active sessions (${activeCount})`);
      }
      
      // Check for very recent sessions that might be legitimate
      const recentSessionsQuery = `
        SELECT COUNT(*) as recent_count 
        FROM upload_sessions 
        WHERE status = 'processing' 
        AND created_at > NOW() - INTERVAL '30 seconds'
      `;
      
      const recentResult = await client.query(recentSessionsQuery);
      const recentCount = parseInt(recentResult.rows[0].recent_count);
      
      if (recentCount > 10) {
        issues.push(`Many very recent sessions (${recentCount} in last 30 seconds)`);
      }
      
      // Check database connectivity
      await client.query('SELECT 1');
      
      return {
        safe: issues.length === 0,
        issues,
        checks: {
          activeSessions: activeCount,
          recentSessions: recentCount,
          databaseConnected: true
        },
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logError(error, { operation: 'validate_cleanup_safety' });
      return {
        safe: false,
        issues: [`Validation error: ${error.message}`],
        checks: { databaseConnected: false },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get background job queue statistics
   * @returns {Promise<Object>} Job queue statistics
   */
  async getJobQueueStatistics() {
    try {
      const client = this.db || this.dbPool;
      
      const jobStatsQuery = `
        SELECT 
          status,
          type,
          COUNT(*) as count,
          AVG(duration) FILTER (WHERE duration IS NOT NULL) as avg_duration_ms,
          MIN(created_at) as oldest,
          MAX(updated_at) as most_recent,
          COUNT(*) FILTER (WHERE retries > 0) as retry_count
        FROM background_jobs 
        GROUP BY status, type
        ORDER BY status, count DESC
      `;
      
      const result = await client.query(jobStatsQuery);
      
      // Get queue performance metrics
      const performanceQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE status = 'queued') as queued_jobs,
          COUNT(*) FILTER (WHERE status = 'processing') as processing_jobs,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_jobs,
          AVG(duration) FILTER (WHERE status = 'completed' AND duration IS NOT NULL) as avg_processing_time_ms,
          MAX(duration) FILTER (WHERE status = 'completed') as max_processing_time_ms,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as jobs_last_hour,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as jobs_last_24h
        FROM background_jobs
      `;
      
      const perfResult = await client.query(performanceQuery);
      
      return {
        timestamp: new Date().toISOString(),
        byStatusAndType: result.rows,
        performance: perfResult.rows[0],
        queueHealth: {
          backlogSize: parseInt(perfResult.rows[0].queued_jobs) + parseInt(perfResult.rows[0].processing_jobs),
          throughputLastHour: parseInt(perfResult.rows[0].jobs_last_hour),
          throughputLast24h: parseInt(perfResult.rows[0].jobs_last_24h),
          failureRate: perfResult.rows[0].failed_jobs / (parseInt(perfResult.rows[0].completed_jobs) + parseInt(perfResult.rows[0].failed_jobs)) * 100 || 0
        }
      };
      
    } catch (error) {
      logError(error, { operation: 'get_job_queue_statistics' });
      throw new Error(`Failed to get job queue statistics: ${error.message}`);
    }
  }

  /**
   * Cancel background jobs by criteria
   * @param {Object} criteria - Cancellation criteria
   * @returns {Promise<Object>} Cancellation results
   */
  async cancelBackgroundJobs(criteria = {}) {
    const {
      sessionId = null,
      status = ['queued', 'processing'],
      olderThan = null,
      dryRun = false,
      maxJobs = 100
    } = criteria;
    
    try {
      const client = this.db || this.dbPool;
      let whereConditions = [];
      let params = [];
      let paramIndex = 1;
      
      // Build WHERE conditions
      if (sessionId) {
        whereConditions.push(`session_id = $${paramIndex++}`);
        params.push(sessionId);
      }
      
      if (status && status.length > 0) {
        whereConditions.push(`status = ANY($${paramIndex++})`);
        params.push(status);
      }
      
      if (olderThan) {
        whereConditions.push(`created_at < NOW() - INTERVAL '${olderThan}'`);
      }
      
      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      
      const query = dryRun 
        ? `SELECT id, session_id, type, status, created_at, url FROM background_jobs ${whereClause} LIMIT ${maxJobs}`
        : `UPDATE background_jobs 
           SET status = 'cancelled', 
               updated_at = NOW(),
               completed_at = NOW()
           ${whereClause} 
           AND status IN ('queued', 'processing')
           RETURNING id, session_id, type, status`;
      
      const result = await client.query(query, params);
      
      const cancelledJobs = result.rows.map(row => ({
        jobId: row.id,
        sessionId: row.session_id,
        type: row.type,
        originalStatus: row.status,
        url: row.url?.substring(0, 100)
      }));
      
      if (!dryRun && cancelledJobs.length > 0) {
        this.logger.info('Background jobs cancelled', {
          count: cancelledJobs.length,
          criteria
        });
      }
      
      return {
        dryRun,
        cancelledJobs,
        cancelledCount: cancelledJobs.length,
        criteria,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logError(error, { operation: 'cancel_background_jobs', criteria });
      throw new Error(`Failed to cancel background jobs: ${error.message}`);
    }
  }

  /**
   * Perform system memory analysis
   * @returns {Object} Memory analysis results
   */
  performMemoryAnalysis() {
    const memoryUsage = process.memoryUsage();
    const loadAverage = process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0];
    
    return {
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        version: process.version,
        platform: process.platform
      },
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
        heapUtilization: (memoryUsage.heapUsed / memoryUsage.heapTotal * 100).toFixed(2) + '%'
      },
      system: {
        loadAverage: loadAverage,
        freeMemory: require('os').freemem(),
        totalMemory: require('os').totalmem(),
        cpuCount: require('os').cpus().length
      },
      recommendations: this._generateMemoryRecommendations(memoryUsage)
    };
  }

  /**
   * Generate memory optimization recommendations
   * @private
   */
  _generateMemoryRecommendations(memoryUsage) {
    const recommendations = [];
    const heapUtilization = memoryUsage.heapUsed / memoryUsage.heapTotal;
    
    if (heapUtilization > 0.8) {
      recommendations.push('High heap utilization - consider increasing heap size or optimizing memory usage');
    }
    
    if (memoryUsage.external > memoryUsage.heapTotal) {
      recommendations.push('High external memory usage - check for memory leaks in native modules');
    }
    
    if (memoryUsage.arrayBuffers > 100 * 1024 * 1024) { // 100MB
      recommendations.push('High ArrayBuffer usage - check for large file processing operations');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Memory usage appears normal');
    }
    
    return recommendations;
  }

  /**
   * Cleanup database connections and resources
   */
  async cleanup() {
    if (this.dbPool) {
      await this.dbPool.end();
    }
  }
}

module.exports = AdminHelpers;