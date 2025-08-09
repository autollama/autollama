/**
 * Enhanced Session Tracking Service
 * Prevents orphaned processing and ensures all background tasks are tracked
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../../utils/logger');

class SessionTrackerService {
  constructor(database) {
    this.database = database;
    this.activeSessions = new Map(); // In-memory tracking
    this.orphanCheckInterval = null;
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Start the session tracker service
   */
  async initialize() {
    logger.info('Initializing Session Tracker Service');
    
    // Load existing active sessions from database
    await this.loadActiveSessions();
    
    // Start orphan detection
    this.startOrphanDetection();
    
    logger.info(`Session Tracker initialized with ${this.activeSessions.size} active sessions`);
  }

  /**
   * Create a new tracked session with guaranteed database storage
   */
  async createTrackedSession(filename, totalChunks, filePath, uploadSource = 'user', maxRetries = 3) {
    const sessionId = uuidv4();
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Create session in database with tracking metadata
        const sessionData = {
          sessionId,
          filename,
          totalChunks,
          completedChunks: 0,
          status: 'processing',
          uploadSource,
          filePath,
          createdAt: new Date(),
          lastActivity: new Date(),
          trackingEnabled: true, // New field for tracking
          processId: process.pid, // Track which process is handling this
          nodeInstance: process.env.NODE_INSTANCE_ID || 'unknown'
        };

        // Store in database
        const query = `
          INSERT INTO upload_sessions (
            session_id, filename, total_chunks, completed_chunks, status, 
            upload_source, file_path, created_at, updated_at, last_activity,
            tracking_enabled, process_id, node_instance
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *
        `;
        
        const values = [
          sessionData.sessionId,
          sessionData.filename,
          sessionData.totalChunks,
          sessionData.completedChunks,
          sessionData.status,
          sessionData.uploadSource,
          sessionData.filePath,
          sessionData.createdAt,
          sessionData.createdAt, // updated_at
          sessionData.lastActivity,
          sessionData.trackingEnabled,
          sessionData.processId,
          sessionData.nodeInstance
        ];

        const result = await this.database.query(query, values);
        const dbSession = result.rows[0];

        // Store in memory for fast access
        this.activeSessions.set(sessionId, {
          ...sessionData,
          id: dbSession.id,
          startTime: Date.now()
        });

        logger.info(`Created tracked session: ${sessionId}`, {
          filename,
          totalChunks,
          attempt,
          processId: sessionData.processId
        });

        return dbSession;

      } catch (error) {
        logger.error(`Failed to create session (attempt ${attempt}/${maxRetries}):`, error);
        
        if (attempt === maxRetries) {
          // Last attempt failed - create emergency session
          const emergencySession = this.createEmergencySession(sessionId, filename, totalChunks, uploadSource);
          logger.warn(`Created emergency session after ${maxRetries} failures:`, emergencySession);
          return emergencySession;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  /**
   * Create emergency session when database is unavailable
   */
  createEmergencySession(sessionId, filename, totalChunks, uploadSource) {
    const emergencySession = {
      id: `emergency_${Date.now()}`,
      session_id: sessionId,
      filename,
      total_chunks: totalChunks,
      completed_chunks: 0,
      status: 'processing',
      upload_source: uploadSource,
      created_at: new Date(),
      updated_at: new Date(),
      emergency: true,
      tracking_enabled: true
    };

    // Store in memory with emergency flag
    this.activeSessions.set(sessionId, {
      ...emergencySession,
      startTime: Date.now(),
      isEmergency: true
    });

    // Schedule database recovery attempt
    this.scheduleEmergencyRecovery(sessionId, emergencySession);

    return emergencySession;
  }

  /**
   * Schedule recovery attempt for emergency session
   */
  async scheduleEmergencyRecovery(sessionId, emergencySession) {
    // Try to recover every 30 seconds for 10 minutes
    const maxAttempts = 20;
    let attempts = 0;

    const recoveryInterval = setInterval(async () => {
      attempts++;
      
      try {
        // Try to store emergency session in database
        await this.recoverEmergencySession(sessionId, emergencySession);
        clearInterval(recoveryInterval);
        logger.info(`Successfully recovered emergency session: ${sessionId}`);
      } catch (error) {
        if (attempts >= maxAttempts) {
          clearInterval(recoveryInterval);
          logger.error(`Failed to recover emergency session after ${maxAttempts} attempts: ${sessionId}`);
          // Mark session as failed
          await this.markSessionFailed(sessionId, 'Database recovery failed');
        }
      }
    }, 30000);
  }

  /**
   * Recover emergency session to database
   */
  async recoverEmergencySession(sessionId, emergencySession) {
    const query = `
      INSERT INTO upload_sessions (
        session_id, filename, total_chunks, completed_chunks, status,
        upload_source, created_at, updated_at, emergency_recovered
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (session_id) DO UPDATE SET
        emergency_recovered = true,
        updated_at = NOW()
      RETURNING *
    `;

    const values = [
      emergencySession.session_id,
      emergencySession.filename,
      emergencySession.total_chunks,
      emergencySession.completed_chunks,
      emergencySession.status,
      emergencySession.upload_source,
      emergencySession.created_at,
      new Date(),
      true
    ];

    const result = await this.database.query(query, values);
    
    // Update in-memory session
    if (this.activeSessions.has(sessionId)) {
      const session = this.activeSessions.get(sessionId);
      session.id = result.rows[0].id;
      session.isEmergency = false;
      session.recovered = true;
    }

    return result.rows[0];
  }

  /**
   * Update session activity with heartbeat
   */
  async updateSessionActivity(sessionId, completedChunks = null, metadata = {}) {
    if (!sessionId) {
      logger.warn('Cannot update session activity: sessionId is null');
      return false;
    }

    try {
      // Update in-memory session
      if (this.activeSessions.has(sessionId)) {
        const session = this.activeSessions.get(sessionId);
        session.lastActivity = Date.now();
        if (completedChunks !== null) {
          session.completedChunks = completedChunks;
        }
        Object.assign(session, metadata);
      }

      // Update database
      const updateQuery = `
        UPDATE upload_sessions 
        SET 
          last_activity = NOW(),
          updated_at = NOW()
          ${completedChunks !== null ? ', completed_chunks = $2' : ''}
          ${metadata.status ? ', status = $' + (completedChunks !== null ? '3' : '2') : ''}
        WHERE session_id = $1
        RETURNING *
      `;

      const values = [sessionId];
      if (completedChunks !== null) values.push(completedChunks);
      if (metadata.status) values.push(metadata.status);

      const result = await this.database.query(updateQuery, values);
      
      if (result.rowCount === 0) {
        logger.warn(`Session not found in database: ${sessionId}`);
        return false;
      }

      return true;

    } catch (error) {
      logger.error(`Failed to update session activity: ${sessionId}`, error);
      return false;
    }
  }

  /**
   * Mark session as completed
   */
  async completeSession(sessionId, metadata = {}) {
    try {
      await this.updateSessionActivity(sessionId, null, { 
        status: 'completed', 
        ...metadata 
      });
      
      // Remove from active sessions
      this.activeSessions.delete(sessionId);
      
      logger.info(`Session completed: ${sessionId}`);
      return true;
      
    } catch (error) {
      logger.error(`Failed to complete session: ${sessionId}`, error);
      return false;
    }
  }

  /**
   * Mark session as failed
   */
  async markSessionFailed(sessionId, errorMessage, metadata = {}) {
    try {
      await this.updateSessionActivity(sessionId, null, { 
        status: 'failed',
        error_message: errorMessage,
        ...metadata 
      });
      
      // Remove from active sessions
      this.activeSessions.delete(sessionId);
      
      logger.warn(`Session failed: ${sessionId} - ${errorMessage}`);
      return true;
      
    } catch (error) {
      logger.error(`Failed to mark session as failed: ${sessionId}`, error);
      return false;
    }
  }

  /**
   * Load existing active sessions from database
   */
  async loadActiveSessions() {
    try {
      const query = `
        SELECT * FROM upload_sessions 
        WHERE status = 'processing' 
        AND tracking_enabled = true
        ORDER BY created_at DESC
      `;
      
      const result = await this.database.query(query);
      
      for (const session of result.rows) {
        this.activeSessions.set(session.session_id, {
          ...session,
          startTime: Date.parse(session.created_at),
          lastActivity: Date.parse(session.last_activity || session.updated_at)
        });
      }
      
      logger.info(`Loaded ${result.rows.length} active sessions from database`);
      
    } catch (error) {
      logger.error('Failed to load active sessions:', error);
    }
  }

  /**
   * Start orphan detection and cleanup
   */
  startOrphanDetection() {
    this.orphanCheckInterval = setInterval(async () => {
      await this.detectAndCleanupOrphans();
    }, 60000); // Check every minute

    logger.info('Started orphan detection service');
  }

  /**
   * Detect and cleanup orphaned sessions
   */
  async detectAndCleanupOrphans() {
    const now = Date.now();
    const orphans = [];

    // Check in-memory sessions for timeouts
    for (const [sessionId, session] of this.activeSessions) {
      const lastActivity = session.lastActivity || session.startTime;
      const timeSinceActivity = now - lastActivity;

      if (timeSinceActivity > this.sessionTimeout) {
        orphans.push({
          sessionId,
          type: 'timeout',
          lastActivity: new Date(lastActivity),
          timeSinceActivity: Math.round(timeSinceActivity / 1000 / 60) // minutes
        });
      }
    }

    // Check database for sessions not in memory (potential orphans)
    try {
      const query = `
        SELECT session_id, created_at, updated_at, last_activity
        FROM upload_sessions 
        WHERE status = 'processing' 
        AND tracking_enabled = true
        AND (last_activity < NOW() - INTERVAL '${this.sessionTimeout / 1000} seconds'
             OR last_activity IS NULL AND updated_at < NOW() - INTERVAL '${this.sessionTimeout / 1000} seconds')
      `;
      
      const result = await this.database.query(query);
      
      for (const row of result.rows) {
        if (!this.activeSessions.has(row.session_id)) {
          orphans.push({
            sessionId: row.session_id,
            type: 'database_orphan',
            lastActivity: new Date(row.last_activity || row.updated_at),
            inMemory: false
          });
        }
      }

    } catch (error) {
      logger.error('Failed to check database for orphans:', error);
    }

    // Cleanup orphans
    if (orphans.length > 0) {
      logger.warn(`Found ${orphans.length} orphaned sessions:`, orphans);
      
      for (const orphan of orphans) {
        await this.markSessionFailed(
          orphan.sessionId, 
          `Orphaned session cleanup: ${orphan.type}`,
          { 
            orphan_cleanup: true,
            orphan_type: orphan.type,
            last_activity: orphan.lastActivity
          }
        );
      }
    }
  }

  /**
   * Get session status
   */
  getSessionStatus(sessionId) {
    if (!sessionId) return null;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    return {
      sessionId,
      status: session.status,
      progress: session.total_chunks > 0 ? 
        Math.round((session.completedChunks / session.total_chunks) * 100) : 0,
      completedChunks: session.completedChunks,
      totalChunks: session.total_chunks,
      lastActivity: new Date(session.lastActivity),
      runtime: Math.round((Date.now() - session.startTime) / 1000),
      isEmergency: session.isEmergency || false
    };
  }

  /**
   * Get all active sessions
   */
  getAllActiveSessions() {
    const sessions = [];
    
    for (const [sessionId, session] of this.activeSessions) {
      sessions.push(this.getSessionStatus(sessionId));
    }
    
    return sessions.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  /**
   * Validate session ID exists and is active
   */
  validateSession(sessionId) {
    if (!sessionId) {
      return { valid: false, reason: 'Session ID is null or undefined' };
    }

    if (!this.activeSessions.has(sessionId)) {
      return { valid: false, reason: 'Session not found in active sessions' };
    }

    const session = this.activeSessions.get(sessionId);
    const now = Date.now();
    const lastActivity = session.lastActivity || session.startTime;
    const timeSinceActivity = now - lastActivity;

    if (timeSinceActivity > this.sessionTimeout) {
      return { valid: false, reason: 'Session has timed out' };
    }

    return { valid: true, session: this.getSessionStatus(sessionId) };
  }

  /**
   * Shutdown the service
   */
  shutdown() {
    if (this.orphanCheckInterval) {
      clearInterval(this.orphanCheckInterval);
      this.orphanCheckInterval = null;
    }
    
    logger.info('Session Tracker Service shutdown');
  }
}

module.exports = SessionTrackerService;