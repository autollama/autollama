/**
 * Database Connection Pool Manager
 * 🦙 Efficient connection management for both PostgreSQL and SQLite
 */

const chalk = require('chalk');

class ConnectionPool {
  constructor(adapter, config = {}) {
    this.adapter = adapter;
    this.config = {
      min: config.min || 2,
      max: config.max || 10,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      acquireTimeoutMillis: config.acquireTimeoutMillis || 30000,
      ...config
    };
    
    this.connections = [];
    this.available = [];
    this.waiting = [];
    this.activeCount = 0;
    this.totalCount = 0;
    this.stats = {
      acquired: 0,
      released: 0,
      created: 0,
      destroyed: 0,
      timeouts: 0,
      errors: 0
    };
  }

  /**
   * Initialize the connection pool
   */
  async initialize() {
    // For SQLite, we don't need a real pool
    if (this.adapter.constructor.name === 'SQLiteAdapter') {
      this.useSingleConnection = true;
      return;
    }

    // Pre-create minimum connections
    for (let i = 0; i < this.config.min; i++) {
      await this.createConnection();
    }

    // Start idle connection cleanup
    this.startIdleCleanup();
  }

  /**
   * Create a new connection
   */
  async createConnection() {
    if (this.useSingleConnection) {
      return this.adapter;
    }

    try {
      const client = await this.adapter.getClient();
      const connection = {
        client,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        inUse: false
      };
      
      this.connections.push(connection);
      this.available.push(connection);
      this.totalCount++;
      this.stats.created++;
      
      return connection;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire() {
    if (this.useSingleConnection) {
      return this.adapter;
    }

    const startTime = Date.now();
    
    // Try to get an available connection
    let connection = this.available.shift();
    
    if (!connection && this.totalCount < this.config.max) {
      // Create a new connection if under the limit
      connection = await this.createConnection();
      this.available.pop(); // Remove from available since we're about to use it
    }
    
    if (connection) {
      connection.inUse = true;
      connection.lastUsedAt = Date.now();
      this.activeCount++;
      this.stats.acquired++;
      return connection.client;
    }
    
    // Wait for a connection to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waiting.indexOf(waiter);
        if (index > -1) {
          this.waiting.splice(index, 1);
        }
        this.stats.timeouts++;
        reject(new Error('Connection acquire timeout'));
      }, this.config.acquireTimeoutMillis);
      
      const waiter = { resolve, reject, timeout };
      this.waiting.push(waiter);
    });
  }

  /**
   * Release a connection back to the pool
   */
  release(client) {
    if (this.useSingleConnection) {
      return;
    }

    const connection = this.connections.find(c => c.client === client);
    
    if (!connection) {
      console.warn(chalk.yellow('🦙 Warning: Attempted to release unknown connection'));
      return;
    }
    
    connection.inUse = false;
    connection.lastUsedAt = Date.now();
    this.activeCount--;
    this.stats.released++;
    
    // Check if anyone is waiting for a connection
    const waiter = this.waiting.shift();
    if (waiter) {
      clearTimeout(waiter.timeout);
      connection.inUse = true;
      this.activeCount++;
      this.stats.acquired++;
      waiter.resolve(connection.client);
    } else {
      this.available.push(connection);
    }
  }

  /**
   * Execute a query using a pooled connection
   */
  async query(sql, params = []) {
    if (this.useSingleConnection) {
      return this.adapter.query(sql, params);
    }

    const client = await this.acquire();
    
    try {
      const result = await client.query(sql, params);
      return result;
    } finally {
      this.release(client);
    }
  }

  /**
   * Start idle connection cleanup
   */
  startIdleCleanup() {
    if (this.useSingleConnection) {
      return;
    }

    this.idleCheckInterval = setInterval(async () => {
      const now = Date.now();
      const toRemove = [];
      
      // Find idle connections that exceed the timeout
      for (const connection of this.available) {
        if (!connection.inUse && 
            now - connection.lastUsedAt > this.config.idleTimeoutMillis &&
            this.totalCount > this.config.min) {
          toRemove.push(connection);
        }
      }
      
      // Remove idle connections
      for (const connection of toRemove) {
        await this.destroyConnection(connection);
      }
    }, this.config.idleTimeoutMillis / 2);
  }

  /**
   * Destroy a connection
   */
  async destroyConnection(connection) {
    const index = this.connections.indexOf(connection);
    if (index > -1) {
      this.connections.splice(index, 1);
    }
    
    const availableIndex = this.available.indexOf(connection);
    if (availableIndex > -1) {
      this.available.splice(availableIndex, 1);
    }
    
    if (connection.client && connection.client.release) {
      connection.client.release();
    }
    
    this.totalCount--;
    this.stats.destroyed++;
  }

  /**
   * Drain the pool (close all connections)
   */
  async drain() {
    // Clear the idle check interval
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
    
    // Reject all waiting requests
    for (const waiter of this.waiting) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Pool is draining'));
    }
    this.waiting = [];
    
    // Destroy all connections
    const allConnections = [...this.connections];
    for (const connection of allConnections) {
      await this.destroyConnection(connection);
    }
    
    this.connections = [];
    this.available = [];
    this.activeCount = 0;
    this.totalCount = 0;
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalConnections: this.totalCount,
      activeConnections: this.activeCount,
      idleConnections: this.available.length,
      waitingRequests: this.waiting.length,
      poolUtilization: this.totalCount > 0 ? 
        Math.round((this.activeCount / this.totalCount) * 100) : 0
    };
  }

  /**
   * Health check for the pool
   */
  async healthCheck() {
    try {
      const client = await this.acquire();
      await client.query('SELECT 1');
      this.release(client);
      return { 
        status: 'healthy', 
        stats: this.getStats() 
      };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message,
        stats: this.getStats() 
      };
    }
  }
}

module.exports = ConnectionPool;