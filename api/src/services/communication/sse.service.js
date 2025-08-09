/**
 * Server-Sent Events (SSE) Service
 * Handles real-time streaming communication to web clients
 */

const { logger } = require('../../utils/logger');
const { SSE_EVENTS } = require('../../utils/constants');

class SSEService {
  constructor(config = {}) {
    this.config = {
      keepAliveInterval: config.keepAliveInterval || 30000, // 30 seconds
      connectionTimeout: config.connectionTimeout || 300000, // 5 minutes
      maxClients: config.maxClients || 100,
      enableCompression: config.enableCompression || false
    };

    this.logger = logger.child({ component: 'sse-service' });
    this.clients = new Map(); // Client ID -> client info
    this.globalClients = new Set(); // For backward compatibility
    this.keepAliveInterval = null;
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      messagesSent: 0,
      bytesTransferred: 0,
      errors: 0
    };

    this.logger.info('SSE Service initialized', {
      config: this.config
    });
  }

  /**
   * Setup SSE connection for a response
   * @param {Response} res - Express response object
   * @param {Object} options - Connection options
   * @returns {Object} Connection handler
   */
  setupSSE(res, options = {}) {
    const clientId = options.clientId || `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });

    // Create client info
    const clientInfo = {
      id: clientId,
      response: res,
      connectedAt: startTime,
      lastActivity: startTime,
      messageCount: 0,
      options: options,
      isAlive: true
    };

    // Add to client tracking
    this.clients.set(clientId, clientInfo);
    this.globalClients.add(res); // Backward compatibility
    this.stats.totalConnections++;
    this.stats.activeConnections++;

    this.logger.info('SSE connection established', {
      clientId,
      totalClients: this.clients.size,
      userAgent: options.userAgent
    });

    // Send initial connection confirmation
    this.sendToClient(clientId, 'connected', {
      clientId,
      serverTime: new Date().toISOString(),
      message: 'SSE connection established'
    });

    // Setup connection cleanup handlers
    this._setupConnectionCleanup(clientId, res);

    // Start keep-alive if this is the first client
    if (this.clients.size === 1) {
      this._startKeepAlive();
    }

    return {
      clientId,
      send: (event, data) => this.sendToClient(clientId, event, data),
      broadcast: (event, data) => this.broadcast(event, data),
      close: () => this.closeConnection(clientId)
    };
  }

  /**
   * Send message to a specific client
   * @param {string} clientId - Client identifier
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  sendToClient(clientId, event, data) {
    const client = this.clients.get(clientId);
    
    if (!client || !client.isAlive) {
      this.logger.warn('Attempted to send to non-existent or dead client', { clientId, event });
      return false;
    }

    try {
      const message = this._formatSSEMessage(event, data);
      client.response.write(message);
      
      // Update client statistics
      client.messageCount++;
      client.lastActivity = Date.now();
      this.stats.messagesSent++;
      this.stats.bytesTransferred += Buffer.byteLength(message, 'utf8');

      this.logger.debug('SSE message sent', {
        clientId,
        event,
        messageSize: Buffer.byteLength(message, 'utf8')
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to send SSE message', {
        clientId,
        event,
        error: error.message
      });
      
      this.stats.errors++;
      this._removeClient(clientId);
      return false;
    }
  }

  /**
   * Broadcast message to all connected clients
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @param {Object} filter - Optional client filter
   */
  broadcast(event, data, filter = {}) {
    if (this.clients.size === 0) {
      this.logger.debug('No clients to broadcast to', { event });
      return 0;
    }

    let successCount = 0;
    const startTime = Date.now();

    this.logger.debug('Broadcasting SSE message', {
      event,
      clientCount: this.clients.size,
      dataSize: JSON.stringify(data).length
    });

    for (const [clientId, client] of this.clients) {
      // Apply filter if provided
      if (filter.excludeClient && filter.excludeClient === clientId) {
        continue;
      }
      
      if (filter.includeOnly && !filter.includeOnly.includes(clientId)) {
        continue;
      }

      if (this.sendToClient(clientId, event, data)) {
        successCount++;
      }
    }

    const duration = Date.now() - startTime;
    
    this.logger.info('SSE broadcast completed', {
      event,
      successCount,
      totalClients: this.clients.size,
      duration,
      failureCount: this.clients.size - successCount
    });

    return successCount;
  }

  /**
   * Close a specific client connection
   * @param {string} clientId - Client to close
   */
  closeConnection(clientId) {
    const client = this.clients.get(clientId);
    
    if (client) {
      try {
        client.response.end();
      } catch (error) {
        this.logger.warn('Error closing SSE connection', { clientId, error: error.message });
      }
      
      this._removeClient(clientId);
    }
  }

  /**
   * Close all client connections
   */
  closeAllConnections() {
    this.logger.info('Closing all SSE connections', { clientCount: this.clients.size });
    
    for (const clientId of this.clients.keys()) {
      this.closeConnection(clientId);
    }
    
    this._stopKeepAlive();
  }

  /**
   * Get list of connected clients
   * @returns {Array} Client information
   */
  getConnectedClients() {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      connectedAt: client.connectedAt,
      lastActivity: client.lastActivity,
      messageCount: client.messageCount,
      connectionDuration: Date.now() - client.connectedAt,
      options: client.options
    }));
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeConnections: this.clients.size,
      config: this.config,
      uptime: this.keepAliveInterval ? Date.now() - this.stats.serviceStarted : 0,
      averageMessageSize: this.stats.messagesSent > 0 
        ? Math.round(this.stats.bytesTransferred / this.stats.messagesSent)
        : 0
    };
  }

  /**
   * Health check for SSE service
   * @returns {Object} Health status
   */
  healthCheck() {
    const isHealthy = this.stats.errors < this.stats.messagesSent * 0.1; // Less than 10% error rate
    
    return {
      status: isHealthy ? 'healthy' : 'degraded',
      clients: this.clients.size,
      stats: this.getStats(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create SSE broadcast callback for legacy support
   * @param {Response} res - Response object
   * @returns {Function} Broadcast callback
   */
  createSSEBroadcastCallback(res) {
    const connection = this.setupSSE(res, { 
      type: 'processing',
      userAgent: res.req?.get('User-Agent')
    });

    return (event, data) => {
      // Send to this specific client
      connection.send(event, data);
      
      // Also broadcast to all clients for dashboard updates
      if (['processing_completed', 'chunk_processed', 'document_created'].includes(event)) {
        this.broadcast(event, data, { excludeClient: connection.clientId });
      }
    };
  }

  /**
   * Private helper methods
   */
  _formatSSEMessage(event, data) {
    const eventData = {
      event,
      data,
      timestamp: new Date().toISOString()
    };

    return `data: ${JSON.stringify(eventData)}\n\n`;
  }

  _setupConnectionCleanup(clientId, res) {
    const client = this.clients.get(clientId);
    
    // Handle client disconnect
    res.on('close', () => {
      this.logger.info('SSE client disconnected', { clientId });
      this._removeClient(clientId);
    });

    // Handle connection end
    res.on('finish', () => {
      this.logger.debug('SSE connection finished', { clientId });
      this._removeClient(clientId);
    });

    // Handle errors
    res.on('error', (error) => {
      this.logger.error('SSE connection error', {
        clientId,
        error: error.message
      });
      this.stats.errors++;
      this._removeClient(clientId);
    });
  }

  _removeClient(clientId) {
    const client = this.clients.get(clientId);
    
    if (client) {
      client.isAlive = false;
      this.clients.delete(clientId);
      this.globalClients.delete(client.response); // Backward compatibility
      this.stats.activeConnections--;
      
      this.logger.debug('SSE client removed', {
        clientId,
        remainingClients: this.clients.size,
        connectionDuration: Date.now() - client.connectedAt
      });

      // Stop keep-alive if no more clients
      if (this.clients.size === 0) {
        this._stopKeepAlive();
      }
    }
  }

  _startKeepAlive() {
    if (this.keepAliveInterval) return;

    this.stats.serviceStarted = Date.now();
    
    this.keepAliveInterval = setInterval(() => {
      if (this.clients.size > 0) {
        this.broadcast('heartbeat', {
          timestamp: new Date().toISOString(),
          activeClients: this.clients.size
        });
      }
    }, this.config.keepAliveInterval);

    this.logger.debug('SSE keep-alive started', {
      interval: this.config.keepAliveInterval
    });
  }

  _stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      this.logger.debug('SSE keep-alive stopped');
    }
  }

  /**
   * Backward compatibility methods
   */
  
  // For legacy broadcastToSSEClients function
  broadcastToGlobalClients(eventData) {
    return this.broadcast(eventData.step || 'update', eventData);
  }

  // For legacy sendSSEUpdate function
  sendSSEUpdate(res, step, message, progress = null, chunkData = null) {
    // Find client by response object
    for (const [clientId, client] of this.clients) {
      if (client.response === res) {
        return this.sendToClient(clientId, step, {
          message,
          progress,
          chunkData,
          step
        });
      }
    }
    return false;
  }
}

module.exports = SSEService;