/**
 * AutoLlama Database Abstraction Layer
 * 🦙 Support for PostgreSQL and SQLite with seamless switching
 */

const PostgreSQLAdapter = require('./adapters/postgresql');
const SQLiteAdapter = require('./adapters/sqlite');
const ConnectionPool = require('./connection-pool');
const QueryBuilder = require('./query-builder');
const chalk = require('chalk');

class DatabaseManager {
  constructor(config = {}) {
    this.config = this.loadConfig(config);
    this.adapter = null;
    this.pool = null;
    this.isConnected = false;
    this.queryBuilder = new QueryBuilder(this.config.type);
  }

  /**
   * Load database configuration from environment or config object
   */
  loadConfig(config) {
    const deploymentMode = process.env.DEPLOYMENT_MODE || config.deploymentMode || 'local';
    const databaseType = process.env.DATABASE_TYPE || config.type || (deploymentMode === 'local' ? 'sqlite' : 'postgresql');
    
    const defaultConfig = {
      type: databaseType,
      deploymentMode,
      pool: {
        min: 2,
        max: 10,
        idleTimeoutMillis: 30000
      },
      migrations: {
        directory: './lib/migrations',
        tableName: 'migrations_history'
      }
    };

    if (databaseType === 'sqlite') {
      return {
        ...defaultConfig,
        path: process.env.DATABASE_PATH || config.path || './data/autollama.db',
        options: {
          verbose: process.env.DEBUG === 'true',
          ...config.options
        }
      };
    } else {
      return {
        ...defaultConfig,
        connectionString: process.env.DATABASE_URL || config.connectionString,
        host: process.env.DB_HOST || config.host || 'localhost',
        port: process.env.DB_PORT || config.port || 5432,
        database: process.env.DB_NAME || config.database || 'autollama',
        user: process.env.DB_USER || config.user || 'autollama',
        password: process.env.DB_PASSWORD || config.password || 'autollama',
        ssl: process.env.DB_SSL === 'true' || config.ssl
      };
    }
  }

  /**
   * Initialize database connection
   */
  async connect() {
    if (this.isConnected) {
      return this;
    }

    try {
      console.log(chalk.cyan(`🦙 Connecting to ${this.config.type} database...`));
      
      // Create appropriate adapter
      if (this.config.type === 'sqlite') {
        this.adapter = new SQLiteAdapter(this.config);
      } else if (this.config.type === 'postgresql') {
        this.adapter = new PostgreSQLAdapter(this.config);
      } else {
        throw new Error(`Unsupported database type: ${this.config.type}`);
      }

      // Initialize connection
      await this.adapter.connect();
      
      // Create connection pool
      this.pool = new ConnectionPool(this.adapter, this.config.pool);
      await this.pool.initialize();
      
      this.isConnected = true;
      console.log(chalk.green(`✅ Connected to ${this.config.type} database`));
      
      return this;
    } catch (error) {
      console.error(chalk.red(`❌ Database connection failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async disconnect() {
    if (!this.isConnected) {
      return;
    }

    try {
      if (this.pool) {
        await this.pool.drain();
      }
      
      if (this.adapter) {
        await this.adapter.disconnect();
      }
      
      this.isConnected = false;
      console.log(chalk.gray('Database disconnected'));
    } catch (error) {
      console.error(chalk.red(`Error disconnecting: ${error.message}`));
      throw error;
    }
  }

  /**
   * Execute a query with automatic connection management
   */
  async query(sql, params = []) {
    if (!this.isConnected) {
      await this.connect();
    }

    return this.pool.query(sql, params);
  }

  /**
   * Execute a transaction
   */
  async transaction(callback) {
    if (!this.isConnected) {
      await this.connect();
    }

    const client = await this.pool.acquire();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      this.pool.release(client);
    }
  }

  /**
   * High-level database operations
   */
  async insert(table, data) {
    const { sql, params } = this.queryBuilder.insert(table, data);
    const result = await this.query(sql, params);
    return this.adapter.getInsertedId(result);
  }

  async update(table, data, where) {
    const { sql, params } = this.queryBuilder.update(table, data, where);
    const result = await this.query(sql, params);
    return this.adapter.getAffectedRows(result);
  }

  async delete(table, where) {
    const { sql, params } = this.queryBuilder.delete(table, where);
    const result = await this.query(sql, params);
    return this.adapter.getAffectedRows(result);
  }

  async select(table, options = {}) {
    const { sql, params } = this.queryBuilder.select(table, options);
    const result = await this.query(sql, params);
    return result.rows || result;
  }

  async findOne(table, where) {
    const results = await this.select(table, { where, limit: 1 });
    return results[0] || null;
  }

  async count(table, where = {}) {
    const { sql, params } = this.queryBuilder.count(table, where);
    const result = await this.query(sql, params);
    const rows = result.rows || result;
    return parseInt(rows[0]?.count || 0);
  }

  /**
   * Schema operations
   */
  async createTable(tableName, schema) {
    const sql = this.adapter.buildCreateTableSQL(tableName, schema);
    return this.query(sql);
  }

  async tableExists(tableName) {
    return this.adapter.tableExists(tableName);
  }

  async dropTable(tableName, ifExists = true) {
    const sql = `DROP TABLE ${ifExists ? 'IF EXISTS' : ''} ${tableName}`;
    return this.query(sql);
  }

  async addColumn(table, column, definition) {
    const sql = this.adapter.buildAddColumnSQL(table, column, definition);
    return this.query(sql);
  }

  async addIndex(table, columns, options = {}) {
    const indexName = options.name || `idx_${table}_${columns.join('_')}`;
    const unique = options.unique ? 'UNIQUE' : '';
    const sql = `CREATE ${unique} INDEX IF NOT EXISTS ${indexName} ON ${table} (${columns.join(', ')})`;
    return this.query(sql);
  }

  /**
   * Utility methods
   */
  async healthCheck() {
    try {
      await this.query('SELECT 1');
      return { status: 'healthy', type: this.config.type };
    } catch (error) {
      return { status: 'unhealthy', type: this.config.type, error: error.message };
    }
  }

  async getDatabaseInfo() {
    const info = {
      type: this.config.type,
      connected: this.isConnected,
      deploymentMode: this.config.deploymentMode
    };

    if (this.isConnected) {
      info.version = await this.adapter.getVersion();
      info.size = await this.adapter.getDatabaseSize();
      info.tables = await this.adapter.getTables();
    }

    return info;
  }

  /**
   * Get the underlying adapter for advanced operations
   */
  getAdapter() {
    return this.adapter;
  }

  /**
   * Get query builder for complex queries
   */
  getQueryBuilder() {
    return this.queryBuilder;
  }
}

// Singleton instance for convenience
let defaultInstance = null;

/**
 * Get or create default database instance
 */
function getDatabase(config) {
  if (!defaultInstance) {
    defaultInstance = new DatabaseManager(config);
  }
  return defaultInstance;
}

module.exports = {
  DatabaseManager,
  getDatabase,
  PostgreSQLAdapter,
  SQLiteAdapter,
  QueryBuilder
};