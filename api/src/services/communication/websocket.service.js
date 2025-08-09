/**
 * WebSocket Service
 * Handles real-time bidirectional communication via WebSockets
 */

const WebSocket = require('ws');
const { logger } = require('../../utils/logger');

class WebSocketService {
  constructor(config = {}) {
    this.config = {
      port: config.port || 3003,
      maxConnections: config.maxConnections || 100,
      heartbeatInterval: config.heartbeatInterval || 30000, // 30 seconds
      connectionTimeout: config.connectionTimeout || 300000, // 5 minutes
      enableCompression: config.enableCompression || true
    };

    this.logger = logger.child({ component: 'websocket-service' });
    this.wss = null;
    this.clients = new Map(); // Client ID -> client info
    this.isRunning = false;
    
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      messagesSent: 0,
      messagesReceived: 0,
      bytesTransferred: 0,
      errors: 0,
      startTime: null
    };

    this.heartbeatInterval = null;
    this.messageHandlers = new Map();
  }

  /**
   * Start the WebSocket server
   * @returns {boolean} True if started successfully
   */
  start() {
    if (this.isRunning) {
      this.logger.warn('WebSocket server already running');
      return true;
    }

    try {
      this.logger.info('Starting WebSocket server', {
        port: this.config.port,
        maxConnections: this.config.maxConnections
      });

      this.wss = new WebSocket.Server({
        port: this.config.port,
        perMessageDeflate: this.config.enableCompression,
        maxPayload: 1024 * 1024 // 1MB max message size
      });

      this._setupServerHandlers();
      this._startHeartbeat();
      
      this.isRunning = true;
      this.stats.startTime = Date.now();

      this.logger.info('WebSocket server started successfully', {
        port: this.config.port
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to start WebSocket server', {
        port: this.config.port,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Stop the WebSocket server
   */
  stop() {
    if (!this.isRunning) return;

    this.logger.info('Stopping WebSocket server');

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all client connections
    this.clients.forEach((client, clientId) => {
      this.closeConnection(clientId, 1001, 'Server shutting down');
    });

    // Close server
    if (this.wss) {
      this.wss.close(() => {
        this.logger.info('WebSocket server stopped');
      });
    }

    this.isRunning = false;
  }

  /**
   * Send message to a specific client
   * @param {string} clientId - Client identifier
   * @param {Object} message - Message to send
   * @returns {boolean} True if sent successfully
   */
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn('Attempted to send to unavailable client', { clientId });
      return false;
    }

    try {
      const messageStr = JSON.stringify({
        ...message,
        timestamp: new Date().toISOString(),
        clientId
      });

      client.ws.send(messageStr);
      
      // Update statistics
      client.messagesSent++;
      client.lastActivity = Date.now();
      this.stats.messagesSent++;
      this.stats.bytesTransferred += Buffer.byteLength(messageStr, 'utf8');

      this.logger.debug('WebSocket message sent', {
        clientId,
        type: message.type,
        size: Buffer.byteLength(messageStr, 'utf8')
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to send WebSocket message', {
        clientId,
        error: error.message
      });
      
      this.stats.errors++;
      this._removeClient(clientId);
      return false;
    }
  }

  /**
   * Broadcast message to all connected clients
   * @param {Object} message - Message to broadcast
   * @param {Object} filter - Optional client filter
   * @returns {number} Number of clients message was sent to
   */
  broadcast(message, filter = {}) {
    if (this.clients.size === 0) {
      this.logger.debug('No WebSocket clients to broadcast to');
      return 0;
    }

    let successCount = 0;
    const startTime = Date.now();

    this.logger.debug('Broadcasting WebSocket message', {
      messageType: message.type,
      clientCount: this.clients.size
    });

    for (const [clientId, client] of this.clients) {
      // Apply filter if provided
      if (filter.excludeClient && filter.excludeClient === clientId) {
        continue;
      }
      
      if (filter.includeOnly && !filter.includeOnly.includes(clientId)) {
        continue;
      }

      if (filter.connectionType && client.connectionType !== filter.connectionType) {
        continue;
      }

      if (this.sendToClient(clientId, message)) {
        successCount++;
      }
    }

    const duration = Date.now() - startTime;
    
    this.logger.info('WebSocket broadcast completed', {
      messageType: message.type,
      successCount,
      totalClients: this.clients.size,
      duration
    });

    return successCount;
  }

  /**
   * Close a specific client connection
   * @param {string} clientId - Client to close
   * @param {number} code - Close code
   * @param {string} reason - Close reason
   */
  closeConnection(clientId, code = 1000, reason = 'Normal closure') {
    const client = this.clients.get(clientId);
    
    if (client) {
      try {
        client.ws.close(code, reason);
      } catch (error) {
        this.logger.warn('Error closing WebSocket connection', {
          clientId,
          error: error.message
        });
      }
      
      this._removeClient(clientId);
    }
  }

  /**
   * Register a message handler for specific message types
   * @param {string} messageType - Type of message to handle
   * @param {Function} handler - Handler function
   */
  onMessage(messageType, handler) {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    
    this.messageHandlers.get(messageType).push(handler);
    
    this.logger.debug('Message handler registered', {
      messageType,
      handlerCount: this.messageHandlers.get(messageType).length
    });
  }

  /**
   * Remove a message handler
   * @param {string} messageType - Type of message
   * @param {Function} handler - Handler to remove
   */
  offMessage(messageType, handler) {
    if (this.messageHandlers.has(messageType)) {
      const handlers = this.messageHandlers.get(messageType);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Get connected clients information
   * @returns {Array} Client information
   */
  getConnectedClients() {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      connectedAt: client.connectedAt,
      lastActivity: client.lastActivity,
      messagesSent: client.messagesSent,
      messagesReceived: client.messagesReceived,
      connectionType: client.connectionType,
      userAgent: client.userAgent,
      connectionDuration: Date.now() - client.connectedAt
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
      isRunning: this.isRunning,
      config: this.config,
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
      averageMessageSize: this.stats.messagesSent > 0 
        ? Math.round(this.stats.bytesTransferred / this.stats.messagesSent)
        : 0
    };
  }

  /**
   * Health check for WebSocket service
   * @returns {Object} Health status
   */
  healthCheck() {
    const isHealthy = this.isRunning && this.stats.errors < this.stats.messagesSent * 0.1;
    
    return {
      status: isHealthy ? 'healthy' : 'degraded',
      isRunning: this.isRunning,
      clients: this.clients.size,
      port: this.config.port,
      stats: this.getStats(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Send pipeline update (legacy compatibility)
   * @param {Object} updateData - Pipeline update data
   */
  broadcastPipelineUpdate(updateData) {
    return this.broadcast({
      type: 'pipeline_update',
      data: updateData
    });
  }

  /**
   * Private helper methods
   */
  _setupServerHandlers() {
    this.wss.on('connection', (ws, req) => {
      const clientId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const clientInfo = {
        id: clientId,
        ws: ws,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        messagesSent: 0,
        messagesReceived: 0,
        connectionType: 'websocket',
        userAgent: req.headers['user-agent'],
        isAlive: true
      };

      this.clients.set(clientId, clientInfo);
      this.stats.totalConnections++;
      this.stats.activeConnections++;

      this.logger.info('WebSocket client connected', {
        clientId,
        totalClients: this.clients.size,
        userAgent: clientInfo.userAgent
      });

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connected',
        message: 'WebSocket connection established',
        clientId: clientId
      });

      // Setup client event handlers
      this._setupClientHandlers(clientId, ws);
    });

    this.wss.on('error', (error) => {
      this.logger.error('WebSocket server error', { error: error.message });
      this.stats.errors++;
    });
  }

  _setupClientHandlers(clientId, ws) {
    const client = this.clients.get(clientId);

    ws.on('message', (message) => {
      try {
        const parsedMessage = JSON.parse(message.toString());
        
        client.messagesReceived++;
        client.lastActivity = Date.now();
        this.stats.messagesReceived++;

        this.logger.debug('WebSocket message received', {
          clientId,
          type: parsedMessage.type
        });

        // Handle message with registered handlers
        this._handleMessage(clientId, parsedMessage);

      } catch (error) {
        this.logger.error('Invalid WebSocket message received', {
          clientId,
          error: error.message
        });
        this.stats.errors++;
      }
    });

    ws.on('close', (code, reason) => {
      this.logger.info('WebSocket client disconnected', {
        clientId,
        code,
        reason: reason.toString(),
        connectionDuration: Date.now() - client.connectedAt
      });
      this._removeClient(clientId);
    });

    ws.on('error', (error) => {
      this.logger.error('WebSocket client error', {
        clientId,
        error: error.message
      });
      this.stats.errors++;
      this._removeClient(clientId);
    });

    ws.on('pong', () => {
      client.isAlive = true;
      client.lastActivity = Date.now();
    });
  }

  _handleMessage(clientId, message) {
    const handlers = this.messageHandlers.get(message.type) || [];
    
    handlers.forEach(handler => {
      try {
        handler(clientId, message, this);
      } catch (error) {
        this.logger.error('Message handler error', {
          clientId,
          messageType: message.type,
          error: error.message
        });
      }
    });
  }

  _removeClient(clientId) {
    const client = this.clients.get(clientId);
    
    if (client) {
      client.isAlive = false;
      this.clients.delete(clientId);
      this.stats.activeConnections--;
      
      this.logger.debug('WebSocket client removed', {
        clientId,
        remainingClients: this.clients.size
      });
    }
  }

  _startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      let removedCount = 0;

      this.clients.forEach((client, clientId) => {
        // Check if client is still alive
        if (!client.isAlive) {
          this._removeClient(clientId);
          removedCount++;
          return;
        }

        // Check for timeout
        if (now - client.lastActivity > this.config.connectionTimeout) {
          this.logger.warn('WebSocket client timeout', { clientId });
          this.closeConnection(clientId, 1008, 'Connection timeout');
          return;
        }

        // Send ping
        if (client.ws.readyState === WebSocket.OPEN) {
          client.isAlive = false;
          client.ws.ping();
        }
      });

      if (removedCount > 0) {
        this.logger.debug('WebSocket heartbeat cleanup', {
          removedClients: removedCount,
          activeClients: this.clients.size
        });
      }
    }, this.config.heartbeatInterval);
  }
}

module.exports = WebSocketService;