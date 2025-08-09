/**
 * Session Services Index
 * Exports all session management services
 */

const SessionCleanupService = require('./cleanup.service');
const SessionMonitoringService = require('./monitoring.service');

/**
 * Initialize all session services with proper dependencies
 * @param {Object} config - Configuration object
 * @param {Object} dependencies - Service dependencies
 * @returns {Object} Initialized session services
 */
function initializeSessionServices(config = {}, dependencies = {}) {
  // Initialize Session Cleanup Service
  const cleanupService = new SessionCleanupService({
    database: dependencies.database || dependencies.databaseService,
    monitoringService: dependencies.monitoringService,
    config: {
      sessionCleanupInterval: config.sessionCleanupInterval || 120000, // 2 minutes
      sessionTimeout: config.sessionTimeout || 480000, // 8 minutes
      heartbeatTimeout: config.heartbeatTimeout || 90000 // 90 seconds
    }
  });

  // Initialize Session Monitoring Service
  const monitoringService = new SessionMonitoringService({
    database: dependencies.database || dependencies.databaseService,
    sseService: dependencies.sseService,
    config: {
      heartbeatInterval: config.heartbeatInterval || 30000, // 30 seconds
      progressUpdateInterval: config.progressUpdateInterval || 5000, // 5 seconds
      sessionCheckInterval: config.sessionCheckInterval || 60000 // 1 minute
    }
  });

  return {
    cleanupService,
    monitoringService
  };
}

/**
 * Test all session services
 * @param {Object} services - Session services object
 * @returns {Promise<Object>} Test results for all services
 */
async function testSessionServices(services) {
  const results = {
    timestamp: new Date().toISOString(),
    overall: { success: true, errors: [] },
    services: {}
  };

  try {
    // Test Cleanup service
    try {
      const cleanupStats = services.cleanupService.getStats();
      results.services.cleanup = {
        success: true,
        stats: cleanupStats,
        isRunning: cleanupStats.isRunning
      };
    } catch (error) {
      results.services.cleanup = { success: false, error: error.message };
      results.overall.success = false;
      results.overall.errors.push(`Cleanup: ${error.message}`);
    }

    // Test Monitoring service
    try {
      const monitoringStats = services.monitoringService.getStats();
      results.services.monitoring = {
        success: true,
        stats: monitoringStats,
        activeSessions: monitoringStats.activeSessions
      };
    } catch (error) {
      results.services.monitoring = { success: false, error: error.message };
      results.overall.success = false;
      results.overall.errors.push(`Monitoring: ${error.message}`);
    }

  } catch (error) {
    results.overall.success = false;
    results.overall.errors.push(`Test execution failed: ${error.message}`);
  }

  return results;
}

/**
 * Get combined statistics for all session services
 * @param {Object} services - Session services object
 * @returns {Object} Combined statistics
 */
function getSessionServicesStats(services) {
  return {
    timestamp: new Date().toISOString(),
    cleanup: services.cleanupService.getStats(),
    monitoring: services.monitoringService.getStats(),
    readiness: {
      allReady: true, // Session services are always ready
      cleanupReady: services.cleanupService.getStats().isRunning,
      monitoringReady: services.monitoringService.getStats().isRunning
    },
    combined: {
      totalSessions: services.monitoringService.getStats().totalSessions,
      activeSessions: services.monitoringService.getStats().activeSessions,
      totalCleaned: services.cleanupService.getStats().stats.totalCleaned,
      systemHealth: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        platform: process.platform
      }
    }
  };
}

/**
 * Start all session services
 * @param {Object} services - Session services object
 */
function startSessionServices(services) {
  services.cleanupService.start();
  services.monitoringService.start();
}

/**
 * Stop all session services
 * @param {Object} services - Session services object
 */
function stopSessionServices(services) {
  services.cleanupService.stop();
  services.monitoringService.stop();
}

module.exports = {
  SessionCleanupService,
  SessionMonitoringService,
  initializeSessionServices,
  testSessionServices,
  getSessionServicesStats,
  startSessionServices,
  stopSessionServices
};