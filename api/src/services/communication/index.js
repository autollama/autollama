/**
 * Communication Services Index
 * Exports all real-time communication services
 */

const SSEService = require('./sse.service');
const WebSocketService = require('./websocket.service');

/**
 * Initialize all communication services
 * @param {Object} config - Configuration object
 * @returns {Object} Initialized communication services
 */
function initializeCommunicationServices(config = {}) {
  // Initialize SSE Service
  const sseService = new SSEService({
    keepAliveInterval: config.sse?.keepAliveInterval || 30000,
    connectionTimeout: config.sse?.connectionTimeout || 300000,
    maxClients: config.sse?.maxClients || 100,
    enableCompression: config.sse?.enableCompression || false
  });

  // Initialize WebSocket Service
  const webSocketService = new WebSocketService({
    port: config.websocket?.port || parseInt(process.env.WS_PORT || '3003'),
    maxConnections: config.websocket?.maxConnections || 100,
    heartbeatInterval: config.websocket?.heartbeatInterval || 30000,
    connectionTimeout: config.websocket?.connectionTimeout || 300000,
    enableCompression: config.websocket?.enableCompression || true
  });

  return {
    sseService,
    webSocketService
  };
}

/**
 * Test all communication services
 * @param {Object} services - Communication services object
 * @returns {Promise<Object>} Test results for all services
 */
async function testCommunicationServices(services) {
  const results = {
    timestamp: new Date().toISOString(),
    overall: { success: true, errors: [] },
    services: {}
  };

  try {
    // Test SSE service
    try {
      const sseHealth = services.sseService.healthCheck();
      results.services.sse = {
        success: sseHealth.status !== 'unhealthy',
        health: sseHealth
      };
      
      if (sseHealth.status === 'unhealthy') {
        results.overall.success = false;
        results.overall.errors.push('SSE: Service unhealthy');
      }
    } catch (error) {
      results.services.sse = { success: false, error: error.message };
      results.overall.success = false;
      results.overall.errors.push(`SSE: ${error.message}`);
    }

    // Test WebSocket service
    try {
      const wsHealth = services.webSocketService.healthCheck();
      results.services.websocket = {
        success: wsHealth.status !== 'unhealthy',
        health: wsHealth
      };
      
      if (wsHealth.status === 'unhealthy') {
        results.overall.success = false;
        results.overall.errors.push('WebSocket: Service unhealthy');
      }
    } catch (error) {
      results.services.websocket = { success: false, error: error.message };
      results.overall.success = false;
      results.overall.errors.push(`WebSocket: ${error.message}`);
    }

  } catch (error) {
    results.overall.success = false;
    results.overall.errors.push(`Test execution failed: ${error.message}`);
  }

  return results;
}

/**
 * Get combined statistics for all communication services
 * @param {Object} services - Communication services object
 * @returns {Object} Combined statistics
 */
function getCommunicationServicesStats(services) {
  return {
    timestamp: new Date().toISOString(),
    sse: services.sseService.getStats(),
    websocket: services.webSocketService.getStats(),
    combined: {
      totalActiveConnections: 
        services.sseService.getStats().activeConnections + 
        services.webSocketService.getStats().activeConnections,
      totalMessagesSent: 
        services.sseService.getStats().messagesSent + 
        services.webSocketService.getStats().messagesSent,
      totalBytesTransferred: 
        services.sseService.getStats().bytesTransferred + 
        services.webSocketService.getStats().bytesTransferred,
      totalErrors: 
        services.sseService.getStats().errors + 
        services.webSocketService.getStats().errors
    },
    readiness: {
      allReady: services.webSocketService.getStats().isRunning,
      sseReady: services.sseService.getStats().activeConnections >= 0,
      websocketReady: services.webSocketService.getStats().isRunning
    }
  };
}

/**
 * Start all communication services
 * @param {Object} services - Communication services object
 * @returns {Promise<Object>} Startup results
 */
async function startCommunicationServices(services) {
  const results = {
    sse: { success: true, message: 'SSE service ready (starts on first connection)' },
    websocket: { success: false, message: '', error: null }
  };

  try {
    // SSE service doesn't need explicit start - it starts on first connection
    // WebSocket service needs to be started
    const wsStarted = services.webSocketService.start();
    
    if (wsStarted) {
      results.websocket.success = true;
      results.websocket.message = `WebSocket server started on port ${services.webSocketService.config.port}`;
    } else {
      results.websocket.message = 'Failed to start WebSocket server';
      results.websocket.error = 'Server start failed';
    }

  } catch (error) {
    results.websocket.error = error.message;
    results.websocket.message = 'WebSocket startup error';
  }

  return results;
}

/**
 * Stop all communication services
 * @param {Object} services - Communication services object
 */
function stopCommunicationServices(services) {
  // Stop SSE service
  try {
    services.sseService.closeAllConnections();
  } catch (error) {
    console.warn('Error stopping SSE service:', error.message);
  }

  // Stop WebSocket service
  try {
    services.webSocketService.stop();
  } catch (error) {
    console.warn('Error stopping WebSocket service:', error.message);
  }
}

/**
 * Create unified broadcast function that sends to both SSE and WebSocket clients
 * @param {Object} services - Communication services
 * @returns {Function} Unified broadcast function
 */
function createUnifiedBroadcast(services) {
  return (event, data, options = {}) => {
    let sseCount = 0;
    let wsCount = 0;

    // Broadcast via SSE
    try {
      sseCount = services.sseService.broadcast(event, data, options.sseFilter);
    } catch (error) {
      console.warn('SSE broadcast error:', error.message);
    }

    // Broadcast via WebSocket
    try {
      wsCount = services.webSocketService.broadcast({
        type: event,
        data,
        event
      }, options.wsFilter);
    } catch (error) {
      console.warn('WebSocket broadcast error:', error.message);
    }

    return {
      sse: sseCount,
      websocket: wsCount,
      total: sseCount + wsCount
    };
  };
}

/**
 * Setup message handlers for WebSocket service
 * @param {Object} services - Communication services
 */
function setupDefaultMessageHandlers(services) {
  const { webSocketService } = services;

  // Handle ping messages
  webSocketService.onMessage('ping', (clientId, message, wsService) => {
    wsService.sendToClient(clientId, {
      type: 'pong',
      timestamp: new Date().toISOString()
    });
  });

  // Handle subscription requests
  webSocketService.onMessage('subscribe', (clientId, message, wsService) => {
    // Could implement topic-based subscriptions here
    wsService.sendToClient(clientId, {
      type: 'subscribed',
      topic: message.topic || 'general',
      message: 'Subscription confirmed'
    });
  });

  // Handle client information requests
  webSocketService.onMessage('info', (clientId, message, wsService) => {
    const stats = wsService.getStats();
    wsService.sendToClient(clientId, {
      type: 'info_response',
      data: {
        clientId,
        serverStats: {
          activeConnections: stats.activeConnections,
          uptime: stats.uptime,
          totalMessages: stats.messagesSent
        }
      }
    });
  });
}

module.exports = {
  SSEService,
  WebSocketService,
  initializeCommunicationServices,
  testCommunicationServices,
  getCommunicationServicesStats,
  startCommunicationServices,
  stopCommunicationServices,
  createUnifiedBroadcast,
  setupDefaultMessageHandlers
};