/**
 * Session Management Routes
 * Handles upload sessions, progress tracking, and cleanup operations
 */

const express = require('express');

/**
 * Create session management routes with dependency injection
 * @param {Object} services - Injected services
 * @returns {express.Router} Configured router
 */
function createRoutes(services = {}) {
  const router = express.Router();
  
  // Extract services with fallbacks
  const {
    backgroundQueue = null
  } = services;

/**
 * Route definitions for session management:
 * 
 * GET /in-progress - Get in-progress sessions
 * GET /upload-progress/:uploadId - Get upload progress
 * GET /cleanup-status - Get cleanup status
 * GET /upload-sessions/check-stuck - Check for stuck sessions
 * POST /cleanup-sessions - Basic session cleanup
 * POST /cleanup-sessions/advanced - Advanced session cleanup
 * POST /upload-sessions/cleanup-stuck - Cleanup stuck sessions
 */

// Placeholder for controller integration (Day 7)
// const sessionController = require('../controllers/session.controller');

router.get('/in-progress', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Get active sessions from in-memory tracking
    const activeProcessingSessions = global.activeProcessingSessions || new Map();
    const sessions = Array.from(activeProcessingSessions.values());
    
    // Transform in-memory sessions to match frontend expectations
    const transformedSessions = sessions.map(session => ({
      id: session.id,
      url: session.url,
      filename: session.filename || 'Unknown File',
      title: session.title || session.filename || 'Processing...',
      totalChunks: session.totalChunks || 0,
      completedChunks: session.processedChunks || 0,
      processedChunks: session.processedChunks || 0,
      status: session.status,
      lastActivity: session.lastUpdate ? session.lastUpdate.toISOString() : new Date().toISOString(),
      createdAt: session.startTime ? session.startTime.toISOString() : new Date().toISOString(),
      progress: session.totalChunks > 0 ? 
        Math.round((session.processedChunks / session.totalChunks) * 100) : 0,
      source: 'in-memory',
      jobId: null
    }));

    // Also get active background jobs
    let backgroundJobSessions = [];
    if (backgroundQueue) {
      try {
        // Query database for active background jobs
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        
        const jobQuery = `
          SELECT 
            id as job_id,
            session_id,
            type,
            url,
            file_data,
            status,
            created_at,
            updated_at
          FROM background_jobs 
          WHERE status IN ('pending', 'processing')
          ORDER BY created_at DESC
        `;
        
        const jobResult = await pool.query(jobQuery);
        
        backgroundJobSessions = jobResult.rows.map(job => {
          const fileData = job.file_data ? JSON.parse(job.file_data) : null;
          const filename = fileData?.originalname || 'Background Job';
          
          return {
            id: job.session_id,
            jobId: job.job_id,
            url: job.url || `file://${filename}`,
            filename: filename,
            title: filename,
            totalChunks: 0, // Unknown for background jobs
            completedChunks: 0,
            processedChunks: 0,
            status: job.status === 'pending' ? 'queued' : 'processing',
            lastActivity: job.updated_at,
            createdAt: job.created_at,
            progress: job.status === 'processing' ? 50 : 0, // Estimate for background jobs
            source: 'background-job',
            type: job.type
          };
        });
        
        pool.end();
      } catch (error) {
        console.error('Error fetching background jobs:', error.message);
        // Don't fail the entire request if background job fetch fails
      }
    }

    // Combine all active processing (in-memory sessions + background jobs)
    const allActiveSessions = [...transformedSessions, ...backgroundJobSessions];
    
    const responseTime = Date.now() - startTime;
    
    console.log(`📊 /in-progress: Found ${transformedSessions.length} in-memory + ${backgroundJobSessions.length} background jobs = ${allActiveSessions.length} total`);
    
    // Add performance headers
    res.set({
      'X-Response-Time': `${responseTime}ms`,
      'X-Data-Source': 'memory-realtime+background-jobs',
      'X-Active-Sessions': allActiveSessions.length,
      'X-Memory-Sessions': transformedSessions.length,
      'X-Background-Jobs': backgroundJobSessions.length
    });
    
    res.json(allActiveSessions);
    
  } catch (error) {
    console.error('❌ Error in real-time in-progress:', error.message);
    
    // Return empty array to keep UI functional
    res.status(200).json([]);
  }
});

router.get('/upload-progress/:uploadId', (req, res) => {
  res.status(501).json({ 
    error: 'Route extraction in progress',
    message: 'This endpoint will be implemented in Day 6-7 of refactoring'
  });
});

router.get('/cleanup-status', async (req, res) => {
  try {
    // Initialize AdminHelpers for session statistics
    const AdminHelpers = require('../utils/admin-helpers');
    const adminHelpers = new AdminHelpers();
    
    const stats = await adminHelpers.getSessionStatistics();
    
    // Calculate cleanup recommendations
    const stuckCount = stats.sessions.stuck.stuck_count || 0;
    const totalProcessing = stats.sessions.byStatus.find(s => s.status === 'processing')?.count || 0;
    
    const cleanupRecommendations = [];
    if (stuckCount > 0) {
      cleanupRecommendations.push(`${stuckCount} stuck sessions require cleanup`);
    }
    if (totalProcessing > 20) {
      cleanupRecommendations.push(`High number of processing sessions (${totalProcessing})`);
    }
    
    const memoryAnalysis = adminHelpers.performMemoryAnalysis();
    const heapUtilization = parseFloat(memoryAnalysis.memory.heapUtilization);
    
    if (heapUtilization > 80) {
      cleanupRecommendations.push(`High memory usage (${heapUtilization}%)`);
    }
    
    res.json({
      timestamp: new Date().toISOString(),
      status: 'healthy',
      cleanup: {
        required: cleanupRecommendations.length > 0,
        recommendations: cleanupRecommendations,
        stuckSessions: stuckCount,
        totalProcessingSessions: totalProcessing
      },
      memory: {
        heapUtilization: memoryAnalysis.memory.heapUtilization,
        recommendations: memoryAnalysis.recommendations
      },
      thresholds: stats.thresholds
    });
    
    await adminHelpers.cleanup();
    
  } catch (error) {
    console.error('❌ Error getting cleanup status:', error.message);
    res.status(500).json({
      error: 'Failed to get cleanup status',
      details: error.message
    });
  }
});

router.get('/upload-sessions/check-stuck', async (req, res) => {
  try {
    // Initialize AdminHelpers for session analysis
    const AdminHelpers = require('../utils/admin-helpers');
    const adminHelpers = new AdminHelpers();
    
    // Get comprehensive session statistics
    const stats = await adminHelpers.getSessionStatistics();
    const stuckInfo = stats.sessions.stuck;
    
    // Get detailed stuck session information
    const client = adminHelpers.db || adminHelpers.dbPool;
    const detailedQuery = `
      SELECT 
        session_id,
        url,
        created_at,
        updated_at,
        EXTRACT(EPOCH FROM (NOW() - updated_at)) as seconds_since_update,
        EXTRACT(EPOCH FROM (NOW() - created_at)) as session_age_seconds
      FROM upload_sessions 
      WHERE status = 'processing' 
      AND updated_at < NOW() - INTERVAL '90 seconds'
      ORDER BY updated_at ASC
      LIMIT 20
    `;
    
    const detailedResult = await client.query(detailedQuery);
    const stuckSessions = detailedResult.rows.map(row => ({
      sessionId: row.session_id,
      url: row.url?.substring(0, 100),
      createdAt: row.created_at,
      lastUpdate: row.updated_at,
      secondsSinceUpdate: Math.floor(row.seconds_since_update),
      sessionAgeSeconds: Math.floor(row.session_age_seconds),
      isStuck: row.seconds_since_update > 90
    }));
    
    res.json({
      timestamp: new Date().toISOString(),
      summary: {
        totalStuckSessions: parseInt(stuckInfo.stuck_count),
        oldestStuck: stuckInfo.oldest_stuck,
        lastActivity: stuckInfo.last_activity,
        heartbeatThreshold: 90
      },
      stuckSessions: stuckSessions,
      analysis: {
        requiresCleanup: parseInt(stuckInfo.stuck_count) > 0,
        severity: parseInt(stuckInfo.stuck_count) > 10 ? 'high' : 
                 parseInt(stuckInfo.stuck_count) > 5 ? 'medium' : 
                 parseInt(stuckInfo.stuck_count) > 0 ? 'low' : 'none',
        recommendations: parseInt(stuckInfo.stuck_count) > 0 ? 
          ['Run session cleanup', 'Monitor for recurring stuck sessions'] : 
          ['No action required']
      }
    });
    
    await adminHelpers.cleanup();
    
  } catch (error) {
    console.error('❌ Error checking stuck sessions:', error.message);
    res.status(500).json({
      error: 'Failed to check stuck sessions',
      details: error.message
    });
  }
});

router.post('/cleanup-sessions', async (req, res) => {
  try {
    const {
      dryRun = false,
      maxAge = 480000, // 8 minutes default
      includeStuck = true,
      includeTimeout = true,
      force = false
    } = req.body;

    // Initialize AdminHelpers for safe cleanup
    const AdminHelpers = require('../utils/admin-helpers');
    const adminHelpers = new AdminHelpers();
    
    console.log('🧹 API Session cleanup requested:', {
      dryRun,
      maxAge,
      includeStuck,
      includeTimeout,
      force,
      userAgent: req.get('User-Agent')?.substring(0, 100)
    });
    
    const results = await adminHelpers.performSafeCleanup({
      dryRun,
      maxAge,
      includeStuck,
      includeTimeout,
      force
    });
    
    // Log the operation
    if (!dryRun && results.totalCleaned > 0) {
      console.log('✅ API Session cleanup completed:', {
        totalCleaned: results.totalCleaned,
        stuckCleaned: results.stuckSessionsCleaned,
        timeoutCleaned: results.timeoutSessionsCleaned,
        duration: results.duration
      });
    }
    
    res.json({
      success: true,
      operation: 'session_cleanup',
      results: {
        dryRun: results.dryRun,
        totalCleaned: results.totalCleaned,
        stuckSessionsCleaned: results.stuckSessionsCleaned,
        timeoutSessionsCleaned: results.timeoutSessionsCleaned,
        duration: results.duration,
        startTime: results.startTime,
        endTime: results.endTime
      },
      validation: results.validation,
      sessionsAffected: results.sessionsUpdated.length,
      timestamp: new Date().toISOString()
    });
    
    await adminHelpers.cleanup();
    
  } catch (error) {
    console.error('❌ API Session cleanup failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Session cleanup failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/cleanup-sessions/advanced', async (req, res) => {
  try {
    const {
      enableHealthCheck = true,
      enableOrphanCleanup = true,
      enableMemoryCleanup = false, // Disabled by default for API calls
      sessionTimeoutMinutes,
      dryRun = false
    } = req.body;

    // Initialize SessionCleanupService
    const SessionCleanupService = require('../services/session/cleanup.service');
    const { DEFAULTS } = require('../utils/constants');
    
    const cleanupService = new SessionCleanupService({
      database: services.databaseService || services.database,
      config: {
        sessionCleanupInterval: DEFAULTS.SESSION_CLEANUP_INTERVAL,
        sessionTimeout: DEFAULTS.SESSION_TIMEOUT,
        heartbeatTimeout: DEFAULTS.HEARTBEAT_TIMEOUT
      }
    });
    
    console.log('🧹 Advanced session cleanup requested:', {
      enableHealthCheck,
      enableOrphanCleanup,
      enableMemoryCleanup,
      sessionTimeoutMinutes,
      dryRun,
      userAgent: req.get('User-Agent')?.substring(0, 100)
    });
    
    // For dry run, we'll use the AdminHelpers validation
    if (dryRun) {
      const AdminHelpers = require('../utils/admin-helpers');
      const adminHelpers = new AdminHelpers();
      
      const validation = await adminHelpers.validateCleanupSafety();
      const mockResults = {
        sessions_cleaned: 0,
        chunks_recovered: 0,
        memory_freed: false,
        health_issues: validation.issues,
        dryRun: true
      };
      
      await adminHelpers.cleanup();
      
      return res.json({
        success: true,
        operation: 'advanced_session_cleanup',
        dryRun: true,
        results: mockResults,
        validation,
        timestamp: new Date().toISOString()
      });
    }
    
    // Perform advanced cleanup
    const results = await cleanupService.advancedSessionCleanup({
      enableHealthCheck,
      enableOrphanCleanup,
      enableMemoryCleanup,
      sessionTimeoutMinutes
    });
    
    // Log the operation
    if (results.sessions_cleaned > 0) {
      console.log('✅ Advanced session cleanup completed:', {
        sessionsCleaned: results.sessions_cleaned,
        chunksRecovered: results.chunks_recovered,
        memoryFreed: results.memory_freed
      });
    }
    
    res.json({
      success: true,
      operation: 'advanced_session_cleanup',
      results: {
        sessionsCleaned: results.sessions_cleaned,
        chunksRecovered: results.chunks_recovered,
        memoryFreed: results.memory_freed,
        healthIssues: results.health_issues || []
      },
      options: {
        enableHealthCheck,
        enableOrphanCleanup,
        enableMemoryCleanup,
        sessionTimeoutMinutes
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Advanced session cleanup failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Advanced session cleanup failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/upload-sessions/cleanup-stuck', async (req, res) => {
  try {
    const {
      dryRun = false,
      heartbeatThreshold = 90, // seconds
      force = false
    } = req.body;

    // Initialize AdminHelpers for stuck session cleanup
    const AdminHelpers = require('../utils/admin-helpers');
    const adminHelpers = new AdminHelpers();
    
    console.log('🧹 Stuck session cleanup requested:', {
      dryRun,
      heartbeatThreshold,
      force,
      userAgent: req.get('User-Agent')?.substring(0, 100)
    });
    
    // Use specialized cleanup for stuck sessions only
    const results = await adminHelpers.performSafeCleanup({
      dryRun,
      maxAge: Number.MAX_SAFE_INTEGER, // Don't cleanup by age
      includeStuck: true,
      includeTimeout: false, // Only focus on stuck sessions
      force
    });
    
    // Get additional details about the stuck sessions
    const client = adminHelpers.db || adminHelpers.dbPool;
    const detailQuery = `
      SELECT COUNT(*) as remaining_stuck
      FROM upload_sessions 
      WHERE status = 'processing' 
      AND updated_at < NOW() - INTERVAL '${heartbeatThreshold} seconds'
    `;
    
    const detailResult = await client.query(detailQuery);
    const remainingStuck = parseInt(detailResult.rows[0].remaining_stuck);
    
    // Log the operation
    if (!dryRun && results.stuckSessionsCleaned > 0) {
      console.log('✅ Stuck session cleanup completed:', {
        stuckCleaned: results.stuckSessionsCleaned,
        remainingStuck,
        duration: results.duration
      });
    }
    
    res.json({
      success: true,
      operation: 'stuck_session_cleanup',
      results: {
        dryRun: results.dryRun,
        stuckSessionsCleaned: results.stuckSessionsCleaned,
        remainingStuckSessions: dryRun ? 'unknown' : remainingStuck,
        duration: results.duration,
        heartbeatThreshold,
        startTime: results.startTime,
        endTime: results.endTime
      },
      validation: results.validation,
      affectedSessions: results.sessionsUpdated.map(session => ({
        sessionId: session.sessionId,
        age: Math.floor(session.age / 60000), // age in minutes
        reason: session.reason
      })),
      timestamp: new Date().toISOString()
    });
    
    await adminHelpers.cleanup();
    
  } catch (error) {
    console.error('❌ Stuck session cleanup failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Stuck session cleanup failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Additional admin monitoring endpoints
router.get('/admin/session-stats', async (req, res) => {
  try {
    const AdminHelpers = require('../utils/admin-helpers');
    const adminHelpers = new AdminHelpers();
    
    const stats = await adminHelpers.getSessionStatistics();
    const jobStats = await adminHelpers.getJobQueueStatistics();
    
    res.json({
      timestamp: new Date().toISOString(),
      sessions: stats.sessions,
      backgroundJobs: jobStats,
      system: stats.system,
      thresholds: stats.thresholds,
      queryDuration: stats.queryDuration
    });
    
    await adminHelpers.cleanup();
    
  } catch (error) {
    console.error('❌ Error getting admin session stats:', error.message);
    res.status(500).json({
      error: 'Failed to get session statistics',
      details: error.message
    });
  }
});

router.get('/admin/system-health', async (req, res) => {
  try {
    const AdminHelpers = require('../utils/admin-helpers');
    const adminHelpers = new AdminHelpers();
    
    const memoryAnalysis = adminHelpers.performMemoryAnalysis();
    const stats = await adminHelpers.getSessionStatistics();
    const validation = await adminHelpers.validateCleanupSafety();
    
    const healthScore = validation.safe ? 100 : Math.max(0, 100 - (validation.issues.length * 20));
    
    res.json({
      timestamp: new Date().toISOString(),
      healthScore,
      status: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'unhealthy',
      memory: memoryAnalysis,
      sessions: {
        total: stats.sessions.total,
        stuck: stats.sessions.stuck.stuck_count,
        processing: stats.sessions.byStatus.find(s => s.status === 'processing')?.count || 0
      },
      validation,
      recommendations: [
        ...memoryAnalysis.recommendations,
        ...validation.issues.map(issue => `Address: ${issue}`)
      ]
    });
    
    await adminHelpers.cleanup();
    
  } catch (error) {
    console.error('❌ Error getting system health:', error.message);
    res.status(500).json({
      error: 'Failed to get system health',
      details: error.message
    });
  }
});

/**
 * Stop/cancel an active processing session
 * POST /api/stop-processing/:sessionId
 */
router.post('/stop-processing/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    // Access ContentProcessor through global activeProcessingSessions reference
    // We need to find a way to access the ContentProcessor instance
    // For now, check if the session exists in the global map and remove it
    const activeProcessingSessions = global.activeProcessingSessions || new Map();
    const session = activeProcessingSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or already completed',
        sessionId
      });
    }

    // Mark as cancelled and remove from active sessions
    session.status = 'cancelled';
    session.lastUpdate = new Date();
    session.cancelled = true;
    activeProcessingSessions.delete(sessionId);

    console.log('🛑 Processing session stopped:', sessionId);

    // Also cancel any associated background jobs
    let backgroundJobResult = null;
    if (backgroundQueue && backgroundQueue.cancelJobsBySession) {
      try {
        console.log('🛑 Cancelling background jobs for session:', sessionId);
        backgroundJobResult = await backgroundQueue.cancelJobsBySession(sessionId);
        console.log('🛑 Background job cancellation result:', backgroundJobResult);
      } catch (error) {
        console.error('❌ Error cancelling background jobs:', error.message);
        // Don't fail the entire operation if background job cancellation fails
      }
    }

    const response = {
      success: true,
      message: 'Processing session stopped successfully',
      sessionId,
      session: {
        id: session.id,
        url: session.url,
        filename: session.filename,
        processedChunks: session.processedChunks,
        totalChunks: session.totalChunks
      }
    };

    // Include background job cancellation results if available
    if (backgroundJobResult) {
      response.backgroundJobs = {
        cancelled: backgroundJobResult.cancelledJobs,
        failed: backgroundJobResult.failedCancellations,
        jobIds: backgroundJobResult.cancelledJobIds,
        message: backgroundJobResult.message
      };
    }

    res.json(response);

  } catch (error) {
    console.error('❌ Error stopping processing session:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error while stopping session',
      details: error.message
    });
  }
});

  return router;
}

// Export both the factory function and the router for backwards compatibility
module.exports = createRoutes();
module.exports.createRoutes = createRoutes;