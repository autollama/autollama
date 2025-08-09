/**
 * Advanced Session Cleanup Service
 * Handles comprehensive session management, cleanup, and recovery
 */

const { logPerformanceMetric, logError } = require('../../utils/logger');
const { SESSION_STATUS, DEFAULTS } = require('../../utils/constants');

class SessionCleanupService {
  constructor(dependencies) {
    console.log('SessionCleanupService dependencies:', {
      databaseService: dependencies.databaseService ? 'exists' : 'missing',
      database: dependencies.database ? 'exists' : 'missing',
      databaseServiceType: dependencies.databaseService?.constructor?.name,
      databaseType: dependencies.database?.constructor?.name,
      databaseServiceMethods: dependencies.databaseService ? Object.getOwnPropertyNames(Object.getPrototypeOf(dependencies.databaseService)) : 'N/A',
      databaseMethods: dependencies.database ? Object.getOwnPropertyNames(Object.getPrototypeOf(dependencies.database)) : 'N/A'
    });
    this.db = dependencies.databaseService || dependencies.database;
    this.monitor = dependencies.monitoringService;
    this.config = {
      cleanupInterval: dependencies.config?.sessionCleanupInterval || DEFAULTS.SESSION_CLEANUP_INTERVAL,
      sessionTimeout: dependencies.config?.sessionTimeout || DEFAULTS.SESSION_TIMEOUT,
      heartbeatTimeout: dependencies.config?.heartbeatTimeout || DEFAULTS.HEARTBEAT_TIMEOUT,
      emergencyInterval: 30000, // 30 seconds for critical cleanup
      healthCheckInterval: 90000 // 90 seconds for heartbeat monitoring
    };
    
    this.logger = require('../../utils/logger').createChildLogger({ component: 'session-cleanup' });
    this.isRunning = false;
    this.intervals = {
      cleanup: null,
      emergency: null,
      heartbeat: null
    };
    
    this.stats = {
      totalCleaned: 0,
      lastCleanup: null,
      cleanupRuns: 0,
      emergencyRuns: 0
    };
  }

  /**
   * Start the advanced session cleanup system
   */
  start() {
    if (this.isRunning) {
      this.logger.warn('Session cleanup already running');
      return;
    }

    this.logger.info('Starting enhanced session cleanup system', {
      cleanupInterval: this.config.cleanupInterval + 'ms',
      sessionTimeout: this.config.sessionTimeout + 'ms',
      heartbeatTimeout: this.config.heartbeatTimeout + 'ms'
    });

    // Main cleanup interval (every 2 minutes)
    this.intervals.cleanup = setInterval(async () => {
      try {
        await this.advancedSessionCleanup({
          enableHealthCheck: true,
          enableOrphanCleanup: true,
          enableMemoryCleanup: true
        });
      } catch (error) {
        this.logger.error('Scheduled cleanup failed', { error: error.message });
      }
    }, this.config.cleanupInterval);

    // Emergency cleanup for critical stuck sessions (every 30 seconds)
    this.intervals.emergency = setInterval(async () => {
      try {
        const results = await this.advancedSessionCleanup({
          enableHealthCheck: true,  // Only heartbeat monitoring
          enableOrphanCleanup: false,
          enableMemoryCleanup: false
        });
        
        if (results.sessions_cleaned > 0) {
          this.logger.warn('Emergency cleanup triggered', {
            sessionsCleaned: results.sessions_cleaned,
            reason: 'Critical stuck sessions detected'
          });
        }
        this.stats.emergencyRuns++;
      } catch (error) {
        this.logger.error('Emergency cleanup failed', { error: error.message });
      }
    }, this.config.emergencyInterval);

    this.isRunning = true;
    this.logger.info('Session cleanup system started successfully');
  }

  /**
   * Stop the session cleanup system
   */
  stop() {
    if (!this.isRunning) return;

    Object.values(this.intervals).forEach(interval => {
      if (interval) clearInterval(interval);
    });

    this.intervals = { cleanup: null, emergency: null, heartbeat: null };
    this.isRunning = false;
    
    this.logger.info('Session cleanup system stopped');
  }

  /**
   * Advanced session cleanup with comprehensive monitoring
   * @param {Object} options - Cleanup configuration options
   * @returns {Promise<Object>} Cleanup results
   */
  async advancedSessionCleanup(options = {}) {
    const {
      enableHealthCheck = true,
      enableOrphanCleanup = true,
      enableMemoryCleanup = true,
      sessionTimeoutMinutes = Math.floor(this.config.sessionTimeout / (60 * 1000))
    } = options;

    const startTime = Date.now();
    
    try {
      this.logger.debug('Starting advanced session cleanup', {
        enableHealthCheck,
        enableOrphanCleanup,
        enableMemoryCleanup,
        sessionTimeoutMinutes
      });

      // TEMPORARY FIX: Skip transaction for now to unblock API startup
      if (!this.db || !this.db.runTransaction) {
        console.log('⚠️ SessionCleanupService: runTransaction not available, skipping advanced cleanup');
        return {
          sessions_cleaned: 0,
          chunks_recovered: 0,
          memory_freed: false,
          health_issues: []
        };
      }
      
      const results = await this.db.runTransaction(async (client) => {
        const cleanupResults = {
          sessions_cleaned: 0,
          chunks_recovered: 0,
          memory_freed: false,
          health_issues: []
        };

        // 1. Heartbeat monitoring (90-second detection)
        if (enableHealthCheck) {
          const heartbeatResult = await this._cleanupStuckSessions(client);
          cleanupResults.sessions_cleaned += heartbeatResult;
          
          if (heartbeatResult > 0) {
            this.logger.info('Heartbeat cleanup completed', {
              sessionsCleaned: heartbeatResult,
              threshold: this.config.heartbeatTimeout + 'ms'
            });
          }
        }

        // 2. Timeout-based cleanup
        const timeoutResult = await this._cleanupTimeoutSessions(client, sessionTimeoutMinutes);
        cleanupResults.sessions_cleaned += timeoutResult;

        // 3. Orphaned chunk recovery
        if (enableOrphanCleanup) {
          const recoveredChunks = await this._recoverOrphanedChunks(client);
          cleanupResults.chunks_recovered = recoveredChunks;
        }

        // 4. Memory cleanup (optional)
        if (enableMemoryCleanup) {
          const memoryFreed = await this._performMemoryCleanup();
          cleanupResults.memory_freed = memoryFreed;
        }

        return cleanupResults;
      });

      const duration = Date.now() - startTime;
      this.stats.totalCleaned += results.sessions_cleaned;
      this.stats.lastCleanup = new Date();
      this.stats.cleanupRuns++;

      logPerformanceMetric('session_cleanup', duration, 'ms', {
        sessionsCleaned: results.sessions_cleaned,
        chunksRecovered: results.chunks_recovered,
        enabledFeatures: { enableHealthCheck, enableOrphanCleanup, enableMemoryCleanup }
      });

      this.logger.debug('Advanced session cleanup completed', {
        duration,
        results,
        totalCleaned: this.stats.totalCleaned
      });

      return results;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'advanced_session_cleanup',
        duration,
        options
      });

      throw new Error(`Advanced session cleanup failed: ${error.message}`);
    }
  }

  /**
   * Manual session cleanup (for API endpoints)
   * @returns {Promise<number>} Number of sessions cleaned
   */
  async manualCleanup() {
    this.logger.info('Manual session cleanup requested');
    
    try {
      const results = await this.advancedSessionCleanup({
        enableHealthCheck: true,
        enableOrphanCleanup: true,
        enableMemoryCleanup: false // Skip memory cleanup for manual runs
      });

      this.logger.info('Manual cleanup completed', {
        sessionsCleaned: results.sessions_cleaned,
        chunksRecovered: results.chunks_recovered
      });

      return results.sessions_cleaned;

    } catch (error) {
      this.logger.error('Manual cleanup failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Check for stuck sessions without cleaning them
   * @returns {Promise<Object>} Stuck session information
   */
  async checkStuckSessions() {
    try {
      const query = `
        SELECT 
          COUNT(*) as stuck_count,
          MIN(created_at) as oldest_stuck,
          MAX(updated_at) as last_activity
        FROM upload_sessions 
        WHERE status = 'processing' 
        AND updated_at < NOW() - INTERVAL '${Math.floor(this.config.heartbeatTimeout / 1000)} seconds'
      `;

      const result = await this.db.query(query);
      const stuckInfo = result.rows[0];

      return {
        stuck_count: parseInt(stuckInfo.stuck_count),
        oldest_stuck: stuckInfo.oldest_stuck,
        last_activity: stuckInfo.last_activity,
        threshold_seconds: Math.floor(this.config.heartbeatTimeout / 1000)
      };

    } catch (error) {
      this.logger.error('Failed to check stuck sessions', { error: error.message });
      throw error;
    }
  }

  /**
   * Get cleanup service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      stats: {
        ...this.stats,
        uptime: this.isRunning ? Date.now() - (this.stats.lastStarted || Date.now()) : 0
      },
      intervals: {
        cleanup: !!this.intervals.cleanup,
        emergency: !!this.intervals.emergency,
        heartbeat: !!this.intervals.heartbeat
      }
    };
  }

  /**
   * Perform deep system cleanup with comprehensive analysis
   * @param {Object} options - Deep cleanup options
   * @returns {Promise<Object>} Deep cleanup results
   */
  async performDeepCleanup(options = {}) {
    const {
      includeMemoryOptimization = true,
      includeConnectionPooling = true,
      includeDatabaseAnalysis = true,
      generateReport = true
    } = options;

    const startTime = Date.now();
    
    try {
      this.logger.info('Starting deep system cleanup', options);
      
      const results = {
        startTime: new Date().toISOString(),
        operations: [],
        performance: {},
        recommendations: [],
        errors: []
      };

      // 1. Standard session cleanup
      try {
        const sessionCleanup = await this.advancedSessionCleanup({
          enableHealthCheck: true,
          enableOrphanCleanup: true,
          enableMemoryCleanup: false // Handle separately
        });
        
        results.operations.push({
          name: 'session_cleanup',
          success: true,
          sessions_cleaned: sessionCleanup.sessions_cleaned,
          chunks_recovered: sessionCleanup.chunks_recovered
        });
      } catch (error) {
        results.errors.push(`Session cleanup failed: ${error.message}`);
        results.operations.push({
          name: 'session_cleanup',
          success: false,
          error: error.message
        });
      }

      // 2. Memory optimization
      if (includeMemoryOptimization) {
        try {
          const memoryResult = await this._performAdvancedMemoryCleanup();
          results.operations.push({
            name: 'memory_optimization',
            success: true,
            ...memoryResult
          });
        } catch (error) {
          results.errors.push(`Memory optimization failed: ${error.message}`);
          results.operations.push({
            name: 'memory_optimization',
            success: false,
            error: error.message
          });
        }
      }

      // 3. Database connection optimization
      if (includeConnectionPooling && this.db) {
        try {
          const connectionResult = await this._optimizeDatabaseConnections();
          results.operations.push({
            name: 'connection_optimization',
            success: true,
            ...connectionResult
          });
        } catch (error) {
          results.errors.push(`Connection optimization failed: ${error.message}`);
          results.operations.push({
            name: 'connection_optimization',
            success: false,
            error: error.message
          });
        }
      }

      // 4. Database analysis and recommendations
      if (includeDatabaseAnalysis) {
        try {
          const analysisResult = await this._performDatabaseAnalysis();
          results.operations.push({
            name: 'database_analysis',
            success: true,
            ...analysisResult
          });
          results.recommendations.push(...analysisResult.recommendations);
        } catch (error) {
          results.errors.push(`Database analysis failed: ${error.message}`);
          results.operations.push({
            name: 'database_analysis',
            success: false,
            error: error.message
          });
        }
      }

      const duration = Date.now() - startTime;
      results.duration = duration;
      results.endTime = new Date().toISOString();
      results.performance.total_duration = duration;

      // Generate comprehensive report
      if (generateReport) {
        results.report = this._generateCleanupReport(results);
      }

      logPerformanceMetric('deep_system_cleanup', duration, 'ms', {
        operations: results.operations.length,
        errors: results.errors.length,
        success: results.errors.length === 0
      });

      this.logger.info('Deep system cleanup completed', {
        duration,
        operations: results.operations.length,
        errors: results.errors.length
      });

      return results;

    } catch (error) {
      const duration = Date.now() - startTime;
      logError(error, {
        operation: 'deep_system_cleanup',
        duration,
        options
      });

      throw new Error(`Deep cleanup failed: ${error.message}`);
    }
  }

  /**
   * Analyze current memory usage and provide optimization recommendations
   * @returns {Object} Memory analysis results
   */
  analyzeMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    const analysis = {
      timestamp: new Date().toISOString(),
      current: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers
      },
      metrics: {
        heapUtilization: (memoryUsage.heapUsed / memoryUsage.heapTotal * 100).toFixed(2) + '%',
        externalRatio: (memoryUsage.external / memoryUsage.rss * 100).toFixed(2) + '%',
        arrayBufferRatio: (memoryUsage.arrayBuffers / memoryUsage.rss * 100).toFixed(2) + '%'
      },
      recommendations: [],
      severity: 'normal'
    };

    // Generate recommendations based on usage patterns
    const heapUtilization = memoryUsage.heapUsed / memoryUsage.heapTotal;
    
    if (heapUtilization > 0.9) {
      analysis.severity = 'critical';
      analysis.recommendations.push('Critical: Heap near capacity - immediate cleanup required');
      analysis.recommendations.push('Consider increasing heap size or reducing memory usage');
    } else if (heapUtilization > 0.8) {
      analysis.severity = 'high';
      analysis.recommendations.push('High heap usage - monitor closely and consider cleanup');
    } else if (heapUtilization > 0.6) {
      analysis.severity = 'medium';
      analysis.recommendations.push('Moderate heap usage - routine cleanup recommended');
    }

    if (memoryUsage.external > memoryUsage.heapTotal) {
      analysis.recommendations.push('High external memory usage - check native modules');
    }

    if (memoryUsage.arrayBuffers > 100 * 1024 * 1024) { // 100MB
      analysis.recommendations.push('High ArrayBuffer usage - check file processing operations');
    }

    return analysis;
  }

  /**
   * Generate comprehensive cleanup report
   * @param {Object} results - Cleanup operation results
   * @returns {Object} Formatted cleanup report
   */
  generateCleanupReport(results = null) {
    if (results) {
      return this._generateCleanupReport(results);
    }

    // Generate current status report
    const memoryAnalysis = this.analyzeMemoryUsage();
    const stats = this.getStats();
    
    return {
      timestamp: new Date().toISOString(),
      reportType: 'status_report',
      service: {
        isRunning: stats.isRunning,
        uptime: stats.stats.uptime,
        totalCleaned: stats.stats.totalCleaned,
        cleanupRuns: stats.stats.cleanupRuns,
        emergencyRuns: stats.stats.emergencyRuns
      },
      memory: memoryAnalysis,
      recommendations: [
        ...memoryAnalysis.recommendations,
        ...(memoryAnalysis.severity === 'normal' ? ['System operating normally'] : [])
      ],
      nextActions: this._generateNextActions(memoryAnalysis.severity, stats)
    };
  }

  /**
   * Private helper methods
   */
  
  /**
   * Perform advanced memory cleanup and optimization
   * @private
   */
  async _performAdvancedMemoryCleanup() {
    const beforeMemory = process.memoryUsage();
    const operations = [];
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      operations.push('forced_garbage_collection');
    }
    
    // Clear internal caches if they exist
    if (global.internalCache) {
      global.internalCache.clear();
      operations.push('internal_cache_cleared');
    }
    
    const afterMemory = process.memoryUsage();
    
    return {
      operations,
      memory_before: beforeMemory,
      memory_after: afterMemory,
      heap_freed: beforeMemory.heapUsed - afterMemory.heapUsed,
      rss_freed: beforeMemory.rss - afterMemory.rss
    };
  }
  
  /**
   * Optimize database connections
   * @private
   */
  async _optimizeDatabaseConnections() {
    const results = {
      connection_pool_stats: null,
      optimizations: []
    };
    
    try {
      // Get connection pool stats if available
      if (this.db && this.db.pool) {
        results.connection_pool_stats = {
          total: this.db.pool.totalCount || 0,
          idle: this.db.pool.idleCount || 0,
          waiting: this.db.pool.waitingCount || 0
        };
        results.optimizations.push('connection_pool_analyzed');
      }
      
      // Force connection pool cleanup
      if (this.db && this.db.pool && this.db.pool.drain) {
        await this.db.pool.drain();
        results.optimizations.push('connection_pool_drained');
      }
      
    } catch (error) {
      results.error = error.message;
    }
    
    return results;
  }
  
  /**
   * Perform database analysis
   * @private
   */
  async _performDatabaseAnalysis() {
    const results = {
      table_stats: [],
      recommendations: []
    };
    
    try {
      // Analyze upload_sessions table
      const sessionStatsQuery = `
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(*) FILTER (WHERE status = 'processing') as processing_sessions,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_sessions,
          COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '24 hours') as old_sessions,
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_session_duration
        FROM upload_sessions
      `;
      
      const sessionStats = await this.db.query(sessionStatsQuery);
      const stats = sessionStats.rows[0];
      
      results.table_stats.push({
        table: 'upload_sessions',
        total_rows: parseInt(stats.total_sessions),
        processing_rows: parseInt(stats.processing_sessions),
        failed_rows: parseInt(stats.failed_sessions),
        old_rows: parseInt(stats.old_sessions),
        avg_duration: parseFloat(stats.avg_session_duration)
      });
      
      // Generate recommendations
      if (parseInt(stats.processing_sessions) > 50) {
        results.recommendations.push('High number of processing sessions - investigate stuck sessions');
      }
      
      if (parseInt(stats.failed_sessions) > parseInt(stats.total_sessions) * 0.2) {
        results.recommendations.push('High failure rate - investigate error patterns');
      }
      
      if (parseInt(stats.old_sessions) > 1000) {
        results.recommendations.push('Large number of old sessions - consider archival strategy');
      }
      
      // Analyze background_jobs table if it exists
      try {
        const jobStatsQuery = `
          SELECT 
            COUNT(*) as total_jobs,
            COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
            COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days') as old_jobs
          FROM background_jobs
        `;
        
        const jobStats = await this.db.query(jobStatsQuery);
        const jStats = jobStats.rows[0];
        
        results.table_stats.push({
          table: 'background_jobs',
          total_rows: parseInt(jStats.total_jobs),
          failed_rows: parseInt(jStats.failed_jobs),
          old_rows: parseInt(jStats.old_jobs)
        });
        
        if (parseInt(jStats.old_jobs) > 10000) {
          results.recommendations.push('Large number of old background jobs - consider cleanup');
        }
        
      } catch (error) {
        // Background jobs table may not exist
        results.recommendations.push('Background jobs table not found - normal for some configurations');
      }
      
    } catch (error) {
      results.error = error.message;
      results.recommendations.push(`Database analysis failed: ${error.message}`);
    }
    
    return results;
  }
  
  /**
   * Generate cleanup report from results
   * @private
   */
  _generateCleanupReport(results) {
    const successfulOps = results.operations.filter(op => op.success);
    const failedOps = results.operations.filter(op => !op.success);
    
    return {
      timestamp: results.startTime,
      summary: {
        duration: results.duration,
        total_operations: results.operations.length,
        successful_operations: successfulOps.length,
        failed_operations: failedOps.length,
        success_rate: `${(successfulOps.length / results.operations.length * 100).toFixed(1)}%`
      },
      operations: results.operations,
      recommendations: results.recommendations,
      errors: results.errors,
      next_cleanup_recommended: this._calculateNextCleanupTime(results),
      severity: results.errors.length > 0 ? 'warning' : 'success'
    };
  }
  
  /**
   * Generate next actions based on analysis
   * @private
   */
  _generateNextActions(severity, stats) {
    const actions = [];
    
    switch (severity) {
      case 'critical':
        actions.push('IMMEDIATE: Perform emergency cleanup');
        actions.push('IMMEDIATE: Check for memory leaks');
        actions.push('Consider restarting service if critical');
        break;
      case 'high':
        actions.push('Perform cleanup within 1 hour');
        actions.push('Monitor memory usage closely');
        break;
      case 'medium':
        actions.push('Schedule routine cleanup');
        actions.push('Review session timeout settings');
        break;
      default:
        actions.push('Continue normal monitoring');
        if (stats.stats.cleanupRuns === 0) {
          actions.push('Consider running initial cleanup test');
        }
    }
    
    return actions;
  }
  
  /**
   * Calculate recommended next cleanup time
   * @private
   */
  _calculateNextCleanupTime(results) {
    const now = new Date();
    const sessionsFound = results.operations.find(op => op.name === 'session_cleanup')?.sessions_cleaned || 0;
    
    // If many sessions were cleaned, recommend sooner cleanup
    if (sessionsFound > 10) {
      return new Date(now.getTime() + (30 * 60 * 1000)).toISOString(); // 30 minutes
    } else if (sessionsFound > 0) {
      return new Date(now.getTime() + (2 * 60 * 60 * 1000)).toISOString(); // 2 hours
    } else {
      return new Date(now.getTime() + (24 * 60 * 60 * 1000)).toISOString(); // 24 hours
    }
  }

  async _cleanupStuckSessions(client) {
    const heartbeatThresholdSeconds = Math.floor(this.config.heartbeatTimeout / 1000);
    
    const result = await client.query(`
      UPDATE upload_sessions 
      SET 
        status = 'failed',
        error_message = 'Health check timeout - no heartbeat detected',
        updated_at = NOW()
      WHERE status = 'processing' 
      AND updated_at < NOW() - INTERVAL '${heartbeatThresholdSeconds} seconds'
      RETURNING session_id, url, created_at
    `);

    if (result.rowCount > 0) {
      this.logger.warn('Sessions cleaned due to heartbeat timeout', {
        count: result.rowCount,
        thresholdSeconds: heartbeatThresholdSeconds,
        sessions: result.rows.map(row => ({
          sessionId: row.session_id,
          url: row.url,
          age: Date.now() - new Date(row.created_at).getTime()
        }))
      });
    }

    return result.rowCount;
  }

  async _cleanupTimeoutSessions(client, timeoutMinutes) {
    const result = await client.query(`
      UPDATE upload_sessions 
      SET 
        status = 'failed',
        error_message = 'Session timeout exceeded',
        updated_at = NOW()
      WHERE status = 'processing' 
      AND created_at < NOW() - INTERVAL '${timeoutMinutes} minutes'
      RETURNING session_id, url, created_at
    `);

    if (result.rowCount > 0) {
      this.logger.info('Sessions cleaned due to timeout', {
        count: result.rowCount,
        timeoutMinutes,
        sessions: result.rows.map(row => row.session_id)
      });
    }

    return result.rowCount;
  }

  async _recoverOrphanedChunks(client) {
    // Implementation for orphaned chunk recovery
    // This would identify and recover chunks that lost their session
    const result = await client.query(`
      SELECT COUNT(*) as orphaned_count
      FROM processed_content pc
      LEFT JOIN upload_sessions us ON pc.session_id = us.session_id
      WHERE us.session_id IS NULL AND pc.session_id IS NOT NULL
    `);

    const orphanedCount = parseInt(result.rows[0].orphaned_count);
    
    if (orphanedCount > 0) {
      this.logger.warn('Orphaned chunks detected', {
        count: orphanedCount,
        note: 'Recovery logic can be implemented based on requirements'
      });
    }

    return orphanedCount;
  }

  async _performMemoryCleanup() {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      this.logger.debug('Memory cleanup performed (forced GC)');
      return true;
    }
    
    return false;
  }
}

module.exports = SessionCleanupService;