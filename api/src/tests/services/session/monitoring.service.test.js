/**
 * Unit Tests for Session Monitoring Service
 * Tests session tracking, progress monitoring, and real-time updates
 */

const SessionMonitoringService = require('../../../services/session/monitoring.service');

// Mock database and dependencies
const mockDatabase = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue({
    query: jest.fn(),
    release: jest.fn()
  })
};

const mockDatabaseService = {
  query: jest.fn(),
  transaction: jest.fn()
};

const mockSSEService = {
  broadcast: jest.fn(),
  sendToClient: jest.fn(),
  getConnectedClients: jest.fn().mockReturnValue([])
};

describe('SessionMonitoringService', () => {
  let monitoringService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    const config = {
      healthCheckIntervalMs: 30000,
      heartbeatTimeoutMs: 90000,
      progressUpdateThresholdMs: 5000,
      maxConcurrentSessions: 10,
      sessionTimeoutMs: 300000
    };

    const dependencies = {
      database: mockDatabase,
      databaseService: mockDatabaseService,
      sseService: mockSSEService
    };

    monitoringService = new SessionMonitoringService(config, dependencies);
  });

  afterEach(() => {
    jest.useRealTimers();
    if (monitoringService.isRunning()) {
      monitoringService.stop();
    }
  });

  describe('constructor', () => {
    test('should initialize with correct configuration', () => {
      expect(monitoringService.config.healthCheckIntervalMs).toBe(30000);
      expect(monitoringService.config.heartbeatTimeoutMs).toBe(90000);
      expect(monitoringService.config.maxConcurrentSessions).toBe(10);
    });

    test('should initialize with default values', () => {
      const service = new SessionMonitoringService();
      expect(service.config.healthCheckIntervalMs).toBe(60000); // 1 minute default
      expect(service.config.heartbeatTimeoutMs).toBe(180000); // 3 minutes default
    });
  });

  describe('startProcessingSession', () => {
    test('should start new processing session', async () => {
      const mockSession = {
        session_id: 'session-123',
        url: 'https://example.com',
        status: 'processing',
        created_at: new Date()
      };

      mockDatabaseService.query.mockResolvedValue({ rows: [mockSession] });

      const sessionId = await monitoringService.startProcessingSession(
        'https://example.com',
        'session-123',
        { filename: 'test.pdf', totalChunks: 5 }
      );

      expect(sessionId).toBe('session-123');
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO upload_sessions'),
        expect.arrayContaining(['session-123', 'https://example.com'])
      );

      // Should track session in memory
      expect(monitoringService.activeSessions.has('session-123')).toBe(true);
    });

    test('should generate UUID when no session ID provided', async () => {
      const mockSession = {
        session_id: expect.any(String),
        url: 'https://example.com',
        status: 'processing'
      };

      mockDatabaseService.query.mockResolvedValue({ rows: [mockSession] });

      const sessionId = await monitoringService.startProcessingSession(
        'https://example.com'
      );

      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    test('should handle database errors', async () => {
      const error = new Error('Database error');
      mockDatabaseService.query.mockRejectedValue(error);

      await expect(monitoringService.startProcessingSession('https://example.com'))
        .rejects.toThrow('Database error');
    });

    test('should broadcast session start event', async () => {
      const mockSession = { session_id: 'session-123', url: 'https://example.com' };
      mockDatabaseService.query.mockResolvedValue({ rows: [mockSession] });

      await monitoringService.startProcessingSession('https://example.com', 'session-123');

      expect(mockSSEService.broadcast).toHaveBeenCalledWith(
        'session_started',
        expect.objectContaining({
          sessionId: 'session-123',
          url: 'https://example.com'
        })
      );
    });
  });

  describe('updateProgress', () => {
    beforeEach(async () => {
      // Start a session first
      const mockSession = { session_id: 'session-123', url: 'https://example.com' };
      mockDatabaseService.query.mockResolvedValue({ rows: [mockSession] });
      await monitoringService.startProcessingSession('https://example.com', 'session-123');
      jest.clearAllMocks();
    });

    test('should update session progress', async () => {
      mockDatabaseService.query.mockResolvedValue({ rowCount: 1 });

      await monitoringService.updateProgress('session-123', {
        processedChunks: 3,
        totalChunks: 5,
        currentStep: 'embedding'
      });

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE upload_sessions'),
        expect.arrayContaining(['session-123', 3, 5])
      );

      // Should update in-memory tracking
      const sessionData = monitoringService.activeSessions.get('session-123');
      expect(sessionData.processedChunks).toBe(3);
      expect(sessionData.totalChunks).toBe(5);
    });

    test('should broadcast progress updates', async () => {
      mockDatabaseService.query.mockResolvedValue({ rowCount: 1 });

      await monitoringService.updateProgress('session-123', {
        processedChunks: 3,
        totalChunks: 5,
        currentStep: 'embedding'
      });

      expect(mockSSEService.broadcast).toHaveBeenCalledWith(
        'session_progress',
        expect.objectContaining({
          sessionId: 'session-123',
          processedChunks: 3,
          totalChunks: 5,
          progress: 60, // 3/5 * 100
          currentStep: 'embedding'
        })
      );
    });

    test('should throttle progress updates', async () => {
      mockDatabaseService.query.mockResolvedValue({ rowCount: 1 });

      // First update should go through
      await monitoringService.updateProgress('session-123', { processedChunks: 1 });
      
      // Second update within threshold should be throttled
      await monitoringService.updateProgress('session-123', { processedChunks: 2 });

      expect(mockDatabaseService.query).toHaveBeenCalledTimes(1);
      expect(mockSSEService.broadcast).toHaveBeenCalledTimes(1);
    });

    test('should force update when specified', async () => {
      mockDatabaseService.query.mockResolvedValue({ rowCount: 1 });

      await monitoringService.updateProgress('session-123', { processedChunks: 1 });
      await monitoringService.updateProgress('session-123', { processedChunks: 2 }, true);

      expect(mockDatabaseService.query).toHaveBeenCalledTimes(2);
      expect(mockSSEService.broadcast).toHaveBeenCalledTimes(2);
    });

    test('should handle session not found', async () => {
      await expect(monitoringService.updateProgress('missing-session', { processedChunks: 1 }))
        .rejects.toThrow('Session missing-session not found in active sessions');
    });
  });

  describe('recordHeartbeat', () => {
    beforeEach(async () => {
      const mockSession = { session_id: 'session-123', url: 'https://example.com' };
      mockDatabaseService.query.mockResolvedValue({ rows: [mockSession] });
      await monitoringService.startProcessingSession('https://example.com', 'session-123');
      jest.clearAllMocks();
    });

    test('should record heartbeat successfully', async () => {
      mockDatabaseService.query.mockResolvedValue({ rowCount: 1 });

      await monitoringService.recordHeartbeat('session-123', {
        step: 'processing',
        memoryUsage: 100
      });

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE upload_sessions SET last_heartbeat'),
        expect.arrayContaining(['session-123'])
      );

      // Should update in-memory tracking
      const sessionData = monitoringService.activeSessions.get('session-123');
      expect(sessionData.lastHeartbeat).toBeDefined();
      expect(sessionData.currentStep).toBe('processing');
    });

    test('should handle heartbeat for non-existent session', async () => {
      mockDatabaseService.query.mockResolvedValue({ rowCount: 0 });

      const result = await monitoringService.recordHeartbeat('missing-session');

      expect(result).toEqual({
        success: false,
        error: 'Session not found'
      });
    });
  });

  describe('endSession', () => {
    beforeEach(async () => {
      const mockSession = { session_id: 'session-123', url: 'https://example.com' };
      mockDatabaseService.query.mockResolvedValue({ rows: [mockSession] });
      await monitoringService.startProcessingSession('https://example.com', 'session-123');
      jest.clearAllMocks();
    });

    test('should end session with success status', async () => {
      mockDatabaseService.query.mockResolvedValue({ rowCount: 1 });

      await monitoringService.endSession('session-123', 'completed', {
        totalChunks: 5,
        processedChunks: 5
      });

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE upload_sessions'),
        expect.arrayContaining(['completed', 'session-123'])
      );

      // Should remove from active sessions
      expect(monitoringService.activeSessions.has('session-123')).toBe(false);
    });

    test('should end session with error status', async () => {
      mockDatabaseService.query.mockResolvedValue({ rowCount: 1 });

      await monitoringService.endSession('session-123', 'failed', {
        errorMessage: 'Processing failed'
      });

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE upload_sessions'),
        expect.arrayContaining(['failed', 'Processing failed', 'session-123'])
      );
    });

    test('should broadcast session completion', async () => {
      mockDatabaseService.query.mockResolvedValue({ rowCount: 1 });

      await monitoringService.endSession('session-123', 'completed');

      expect(mockSSEService.broadcast).toHaveBeenCalledWith(
        'session_completed',
        expect.objectContaining({
          sessionId: 'session-123',
          status: 'completed'
        })
      );
    });
  });

  describe('recordError', () => {
    beforeEach(async () => {
      const mockSession = { session_id: 'session-123', url: 'https://example.com' };
      mockDatabaseService.query.mockResolvedValue({ rows: [mockSession] });
      await monitoringService.startProcessingSession('https://example.com', 'session-123');
      jest.clearAllMocks();
    });

    test('should record error for session', async () => {
      const error = new Error('Processing failed');
      mockDatabaseService.query.mockResolvedValue({ rowCount: 1 });

      await monitoringService.recordError('session-123', error, {
        step: 'embedding',
        chunkIndex: 2
      });

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE upload_sessions'),
        expect.arrayContaining(['session-123', 'Processing failed'])
      );

      // Should update error count in memory
      const sessionData = monitoringService.activeSessions.get('session-123');
      expect(sessionData.errorCount).toBe(1);
    });

    test('should broadcast error events', async () => {
      const error = new Error('Processing failed');
      mockDatabaseService.query.mockResolvedValue({ rowCount: 1 });

      await monitoringService.recordError('session-123', error);

      expect(mockSSEService.broadcast).toHaveBeenCalledWith(
        'session_error',
        expect.objectContaining({
          sessionId: 'session-123',
          error: 'Processing failed'
        })
      );
    });
  });

  describe('getSessionStatus', () => {
    test('should get session status from database', async () => {
      const mockSession = {
        session_id: 'session-123',
        status: 'processing',
        processed_chunks: 3,
        total_chunks: 5,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDatabaseService.query.mockResolvedValue({ rows: [mockSession] });

      const status = await monitoringService.getSessionStatus('session-123');

      expect(status).toEqual({
        success: true,
        session: mockSession,
        isActive: false, // Not in active sessions
        progress: 60 // 3/5 * 100
      });
    });

    test('should handle session not found', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [] });

      const status = await monitoringService.getSessionStatus('missing-session');

      expect(status).toEqual({
        success: false,
        error: 'Session not found'
      });
    });

    test('should include active session data', async () => {
      // Start active session
      const mockSession = { session_id: 'session-123', url: 'https://example.com' };
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [mockSession] }) // Start session
        .mockResolvedValueOnce({ rows: [{ ...mockSession, processed_chunks: 2, total_chunks: 5 }] }); // Get status

      await monitoringService.startProcessingSession('https://example.com', 'session-123');
      const status = await monitoringService.getSessionStatus('session-123');

      expect(status.isActive).toBe(true);
      expect(status.activeSessionData).toBeDefined();
    });
  });

  describe('getAllActiveSessions', () => {
    test('should return all active sessions', async () => {
      // Start multiple sessions
      const mockSession1 = { session_id: 'session-1', url: 'https://example1.com' };
      const mockSession2 = { session_id: 'session-2', url: 'https://example2.com' };
      
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [mockSession1] })
        .mockResolvedValueOnce({ rows: [mockSession2] });

      await monitoringService.startProcessingSession('https://example1.com', 'session-1');
      await monitoringService.startProcessingSession('https://example2.com', 'session-2');

      const activeSessions = monitoringService.getAllActiveSessions();

      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.map(s => s.sessionId)).toContain('session-1');
      expect(activeSessions.map(s => s.sessionId)).toContain('session-2');
    });
  });

  describe('health monitoring', () => {
    test('should start health monitoring', () => {
      monitoringService.start();
      
      expect(monitoringService.isRunning()).toBe(true);
      expect(monitoringService.healthCheckInterval).toBeDefined();
    });

    test('should perform health checks on active sessions', async () => {
      const mockSession = { session_id: 'session-123', url: 'https://example.com' };
      mockDatabaseService.query.mockResolvedValue({ rows: [mockSession] });

      await monitoringService.startProcessingSession('https://example.com', 'session-123');
      
      monitoringService.start();

      // Mock the health check query
      mockDatabaseService.query.mockResolvedValue({ rows: [] });

      // Advance time to trigger health check
      jest.advanceTimersByTime(30000);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('last_heartbeat < NOW() - INTERVAL'),
        expect.any(Array)
      );
    });

    test('should detect and handle unhealthy sessions', async () => {
      const unhealthySession = {
        session_id: 'unhealthy-session',
        status: 'processing',
        last_heartbeat: new Date(Date.now() - 120000) // 2 minutes ago
      };

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [{ session_id: 'session-123' }] }) // Start session
        .mockResolvedValueOnce({ rows: [unhealthySession] }) // Health check finds unhealthy
        .mockResolvedValueOnce({ rowCount: 1 }); // Mark as failed

      await monitoringService.startProcessingSession('https://example.com', 'session-123');
      monitoringService.start();

      jest.advanceTimersByTime(30000);

      expect(mockSSEService.broadcast).toHaveBeenCalledWith(
        'session_unhealthy',
        expect.objectContaining({
          unhealthySessions: 1
        })
      );
    });
  });

  describe('getMonitoringStats', () => {
    test('should return monitoring statistics', () => {
      monitoringService.start();

      const stats = monitoringService.getMonitoringStats();

      expect(stats).toEqual({
        isRunning: true,
        activeSessions: expect.any(Number),
        totalSessionsStarted: expect.any(Number),
        totalSessionsCompleted: expect.any(Number),
        totalSessionsFailed: expect.any(Number),
        totalProgressUpdates: expect.any(Number),
        totalHeartbeats: expect.any(Number),
        totalErrors: expect.any(Number),
        averageSessionDuration: expect.any(Number),
        lastHealthCheckTime: expect.any(String),
        config: expect.any(Object)
      });
    });
  });

  describe('error handling', () => {
    test('should handle database errors gracefully', async () => {
      const error = new Error('Database connection lost');
      mockDatabaseService.query.mockRejectedValue(error);

      await expect(monitoringService.startProcessingSession('https://example.com'))
        .rejects.toThrow('Database connection lost');

      // Service should still be functional
      expect(monitoringService.activeSessions.size).toBe(0);
    });

    test('should continue monitoring despite health check errors', async () => {
      monitoringService.start();

      const error = new Error('Health check failed');
      jest.spyOn(monitoringService, '_performHealthCheck').mockRejectedValue(error);

      // Should not throw and service should remain running
      jest.advanceTimersByTime(30000);

      expect(monitoringService.isRunning()).toBe(true);
    });
  });
});