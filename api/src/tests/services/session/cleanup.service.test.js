/**
 * Unit Tests for Session Cleanup Service
 * Tests session cleanup, heartbeat monitoring, and orphaned resource recovery
 */

const SessionCleanupService = require('../../../services/session/cleanup.service');

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
  getConnectedClients: jest.fn().mockReturnValue([])
};

describe('SessionCleanupService', () => {
  let cleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    const config = {
      cleanupIntervalMs: 5000,
      cleanupThresholdMs: 300000, // 5 minutes
      emergencyCleanupIntervalMs: 30000,
      emergencyThresholdMs: 120000, // 2 minutes
      heartbeatTimeoutMs: 90000, // 1.5 minutes
      maxOrphanedChunks: 100
    };

    const dependencies = {
      database: mockDatabase,
      databaseService: mockDatabaseService,
      sseService: mockSSEService
    };

    cleanupService = new SessionCleanupService(config, dependencies);
  });

  afterEach(() => {
    jest.useRealTimers();
    if (cleanupService.isRunning()) {
      cleanupService.stop();
    }
  });

  describe('constructor', () => {
    test('should initialize with correct configuration', () => {
      expect(cleanupService.config.cleanupIntervalMs).toBe(5000);
      expect(cleanupService.config.cleanupThresholdMs).toBe(300000);
      expect(cleanupService.config.emergencyCleanupIntervalMs).toBe(30000);
    });

    test('should initialize with default values', () => {
      const service = new SessionCleanupService();
      expect(service.config.cleanupIntervalMs).toBe(300000); // 5 minutes default
      expect(service.config.cleanupThresholdMs).toBe(900000); // 15 minutes default
    });
  });

  describe('start and stop', () => {
    test('should start cleanup service successfully', () => {
      cleanupService.start();
      
      expect(cleanupService.isRunning()).toBe(true);
      expect(cleanupService.cleanupInterval).toBeDefined();
      expect(cleanupService.emergencyCleanupInterval).toBeDefined();
    });

    test('should not start if already running', () => {
      cleanupService.start();
      const firstInterval = cleanupService.cleanupInterval;
      
      cleanupService.start();
      
      expect(cleanupService.cleanupInterval).toBe(firstInterval);
    });

    test('should stop cleanup service successfully', () => {
      cleanupService.start();
      cleanupService.stop();
      
      expect(cleanupService.isRunning()).toBe(false);
      expect(cleanupService.cleanupInterval).toBeNull();
      expect(cleanupService.emergencyCleanupInterval).toBeNull();
    });

    test('should handle stop when not running', () => {
      expect(() => cleanupService.stop()).not.toThrow();
    });
  });

  describe('cleanupExpiredSessions', () => {
    test('should clean up expired sessions successfully', async () => {
      const mockExpiredSessions = [
        {
          session_id: 'session-1',
          filename: 'test1.pdf',
          status: 'processing',
          updated_at: new Date(Date.now() - 400000) // 6+ minutes ago
        },
        {
          session_id: 'session-2',
          filename: 'test2.pdf',
          status: 'processing',
          updated_at: new Date(Date.now() - 500000) // 8+ minutes ago
        }
      ];

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: mockExpiredSessions }) // Find expired sessions
        .mockResolvedValueOnce({ rowCount: 2 }); // Update sessions

      const result = await cleanupService.cleanupExpiredSessions();

      expect(result).toEqual({
        success: true,
        cleanedCount: 2,
        emergencyCleanedCount: 0,
        orphanedChunksRecovered: 0,
        duration: expect.any(Number)
      });

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE upload_sessions'),
        expect.arrayContaining(['failed', 'Session timeout - cleaned up automatically'])
      );
    });

    test('should handle emergency cleanup for very stuck sessions', async () => {
      const mockStuckSessions = [
        {
          session_id: 'stuck-session',
          filename: 'stuck.pdf',
          status: 'processing',
          updated_at: new Date(Date.now() - 150000) // 2.5 minutes ago
        }
      ];

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // No regular expired sessions
        .mockResolvedValueOnce({ rows: mockStuckSessions }) // Find stuck sessions
        .mockResolvedValueOnce({ rowCount: 1 }); // Emergency cleanup

      const result = await cleanupService.cleanupExpiredSessions();

      expect(result.emergencyCleanedCount).toBe(1);
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('updated_at < NOW() - INTERVAL'),
        expect.arrayContaining([cleanupService.config.emergencyThresholdMs])
      );
    });

    test('should recover orphaned chunks', async () => {
      const mockOrphanedChunks = [
        { chunk_id: 'chunk-1', session_id: 'session-1' },
        { chunk_id: 'chunk-2', session_id: 'session-2' }
      ];

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] }) // No expired sessions
        .mockResolvedValueOnce({ rows: [] }) // No stuck sessions
        .mockResolvedValueOnce({ rows: mockOrphanedChunks }) // Find orphaned chunks
        .mockResolvedValueOnce({ rowCount: 2 }); // Mark chunks as completed

      const result = await cleanupService.cleanupExpiredSessions();

      expect(result.orphanedChunksRecovered).toBe(2);
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE processing_chunks'),
        expect.arrayContaining(['completed'])
      );
    });

    test('should handle database errors gracefully', async () => {
      const error = new Error('Database connection failed');
      mockDatabaseService.query.mockRejectedValue(error);

      const result = await cleanupService.cleanupExpiredSessions();

      expect(result).toEqual({
        success: false,
        error: 'Database connection failed',
        cleanedCount: 0,
        emergencyCleanedCount: 0,
        orphanedChunksRecovered: 0,
        duration: expect.any(Number)
      });
    });
  });

  describe('advancedSessionCleanup', () => {
    test('should perform advanced cleanup with custom options', async () => {
      const mockSessions = [
        { session_id: 'session-1', status: 'processing' }
      ];

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: mockSessions })
        .mockResolvedValueOnce({ rowCount: 1 });

      const options = {
        thresholdMs: 600000, // 10 minutes
        includeStuckSessions: false,
        maxSessionsToClean: 5
      };

      const result = await cleanupService.advancedSessionCleanup(options);

      expect(result.success).toBe(true);
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 5'),
        expect.any(Array)
      );
    });

    test('should broadcast cleanup notifications', async () => {
      const mockSessions = [
        { session_id: 'session-1', filename: 'test.pdf' }
      ];

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: mockSessions })
        .mockResolvedValueOnce({ rowCount: 1 });

      await cleanupService.advancedSessionCleanup({ notifyClients: true });

      expect(mockSSEService.broadcast).toHaveBeenCalledWith(
        'session_cleanup',
        expect.objectContaining({
          cleanedSessions: 1,
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('detectStuckSessions', () => {
    test('should detect sessions stuck in processing', async () => {
      const mockStuckSessions = [
        {
          session_id: 'stuck-1',
          filename: 'stuck1.pdf',
          status: 'processing',
          last_heartbeat: new Date(Date.now() - 120000) // 2 minutes ago
        }
      ];

      mockDatabaseService.query.mockResolvedValue({ rows: mockStuckSessions });

      const result = await cleanupService.detectStuckSessions();

      expect(result).toEqual({
        success: true,
        stuckSessions: mockStuckSessions,
        count: 1
      });

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('last_heartbeat < NOW() - INTERVAL'),
        expect.arrayContaining([cleanupService.config.heartbeatTimeoutMs])
      );
    });

    test('should handle no stuck sessions', async () => {
      mockDatabaseService.query.mockResolvedValue({ rows: [] });

      const result = await cleanupService.detectStuckSessions();

      expect(result).toEqual({
        success: true,
        stuckSessions: [],
        count: 0
      });
    });
  });

  describe('recoverOrphanedChunks', () => {
    test('should recover chunks without valid sessions', async () => {
      const mockOrphanedChunks = [
        { chunk_id: 'orphan-1', session_id: 'missing-session-1' },
        { chunk_id: 'orphan-2', session_id: 'missing-session-2' }
      ];

      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: mockOrphanedChunks })
        .mockResolvedValueOnce({ rowCount: 2 });

      const result = await cleanupService.recoverOrphanedChunks();

      expect(result).toEqual({
        success: true,
        recoveredCount: 2,
        orphanedChunks: mockOrphanedChunks
      });

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN upload_sessions'),
        expect.arrayContaining([cleanupService.config.maxOrphanedChunks])
      );
    });

    test('should respect max orphaned chunks limit', async () => {
      const service = new SessionCleanupService({ maxOrphanedChunks: 50 });
      
      await service.recoverOrphanedChunks();

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 50'),
        expect.any(Array)
      );
    });
  });

  describe('getCleanupStats', () => {
    test('should return cleanup statistics', () => {
      cleanupService.start();
      
      const stats = cleanupService.getCleanupStats();

      expect(stats).toEqual({
        isRunning: true,
        totalCleanupRuns: expect.any(Number),
        totalSessionsCleaned: expect.any(Number),
        totalEmergencyCleanups: expect.any(Number),
        totalOrphanedChunksRecovered: expect.any(Number),
        lastCleanupTime: expect.any(String),
        lastCleanupDuration: expect.any(Number),
        averageCleanupDuration: expect.any(Number),
        config: expect.any(Object)
      });
    });
  });

  describe('manual cleanup operations', () => {
    test('should run manual cleanup on demand', async () => {
      mockDatabaseService.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 0 });

      const result = await cleanupService.runManualCleanup();

      expect(result.success).toBe(true);
      expect(result.type).toBe('manual');
    });

    test('should clean specific session', async () => {
      mockDatabaseService.query.mockResolvedValue({ rowCount: 1 });

      const result = await cleanupService.cleanupSpecificSession('session-123');

      expect(result).toEqual({
        success: true,
        sessionId: 'session-123',
        cleaned: true
      });

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE session_id = $1'),
        ['session-123']
      );
    });

    test('should handle session not found', async () => {
      mockDatabaseService.query.mockResolvedValue({ rowCount: 0 });

      const result = await cleanupService.cleanupSpecificSession('missing-session');

      expect(result).toEqual({
        success: false,
        sessionId: 'missing-session',
        cleaned: false,
        error: 'Session not found or already cleaned'
      });
    });
  });

  describe('automatic cleanup intervals', () => {
    test('should trigger regular cleanup at intervals', async () => {
      const cleanupSpy = jest.spyOn(cleanupService, 'cleanupExpiredSessions');
      cleanupSpy.mockResolvedValue({ success: true, cleanedCount: 0 });

      cleanupService.start();

      // Advance time to trigger cleanup
      jest.advanceTimersByTime(5000);

      expect(cleanupSpy).toHaveBeenCalled();
    });

    test('should trigger emergency cleanup at intervals', async () => {
      const cleanupSpy = jest.spyOn(cleanupService, 'cleanupExpiredSessions');
      cleanupSpy.mockResolvedValue({ success: true, emergencyCleanedCount: 0 });

      cleanupService.start();

      // Advance time to trigger emergency cleanup
      jest.advanceTimersByTime(30000);

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    test('should handle cleanup errors gracefully and continue operation', async () => {
      const error = new Error('Cleanup failed');
      jest.spyOn(cleanupService, 'cleanupExpiredSessions').mockRejectedValue(error);

      cleanupService.start();

      // Should not throw and service should remain running
      jest.advanceTimersByTime(5000);

      expect(cleanupService.isRunning()).toBe(true);
    });

    test('should track error statistics', async () => {
      const error = new Error('Database error');
      mockDatabaseService.query.mockRejectedValue(error);

      await cleanupService.cleanupExpiredSessions();

      const stats = cleanupService.getCleanupStats();
      expect(stats.totalCleanupRuns).toBeGreaterThan(0);
    });
  });
});