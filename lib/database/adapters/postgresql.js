/**
 * PostgreSQL Database Adapter
 * 🐘 Production-ready PostgreSQL implementation
 */

const { Pool } = require('pg');
const chalk = require('chalk');

class PostgreSQLAdapter {
  constructor(config) {
    this.config = config;
    this.pool = null;
    this.connected = false;
  }

  /**
   * Connect to PostgreSQL
   */
  async connect() {
    try {
      const poolConfig = this.config.connectionString ? {
        connectionString: this.config.connectionString,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false
      } : {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false
      };

      // Add pool configuration
      poolConfig.min = this.config.pool?.min || 2;
      poolConfig.max = this.config.pool?.max || 10;
      poolConfig.idleTimeoutMillis = this.config.pool?.idleTimeoutMillis || 30000;

      this.pool = new Pool(poolConfig);
      
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      this.connected = true;
      
      // Setup connection error handler
      this.pool.on('error', (err) => {
        console.error(chalk.red('PostgreSQL pool error:'), err.message);
      });
      
      return this;
    } catch (error) {
      throw new Error(`PostgreSQL connection failed: ${error.message}`);
    }
  }

  /**
   * Disconnect from PostgreSQL
   */
  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
    }
  }

  /**
   * Execute a query
   */
  async query(sql, params = []) {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    try {
      const result = await this.pool.query(sql, params);
      return result;
    } catch (error) {
      console.error(chalk.red('Query error:'), error.message);
      console.error(chalk.gray('SQL:'), sql);
      if (params.length > 0) {
        console.error(chalk.gray('Params:'), params);
      }
      throw error;
    }
  }

  /**
   * Get a client for transactions
   */
  async getClient() {
    if (!this.connected) {
      throw new Error('Database not connected');
    }
    return this.pool.connect();
  }

  /**
   * Release a client back to the pool
   */
  releaseClient(client) {
    if (client) {
      client.release();
    }
  }

  /**
   * Get the last inserted ID
   */
  getInsertedId(result) {
    return result.rows[0]?.id || null;
  }

  /**
   * Get affected rows count
   */
  getAffectedRows(result) {
    return result.rowCount || 0;
  }

  /**
   * Build CREATE TABLE SQL
   */
  buildCreateTableSQL(tableName, schema) {
    const columns = Object.entries(schema).map(([name, definition]) => {
      let columnDef = `${name} ${this.mapDataType(definition.type)}`;
      
      if (definition.primaryKey) {
        columnDef += ' PRIMARY KEY';
      }
      
      if (definition.autoIncrement) {
        // PostgreSQL uses SERIAL for auto-increment
        columnDef = `${name} SERIAL PRIMARY KEY`;
      } else {
        if (definition.notNull) {
          columnDef += ' NOT NULL';
        }
        
        if (definition.unique) {
          columnDef += ' UNIQUE';
        }
        
        if (definition.default !== undefined) {
          columnDef += ` DEFAULT ${this.formatDefault(definition.default)}`;
        }
      }
      
      return columnDef;
    });

    return `CREATE TABLE IF NOT EXISTS ${tableName} (${columns.join(', ')})`;
  }

  /**
   * Build ADD COLUMN SQL
   */
  buildAddColumnSQL(table, column, definition) {
    let sql = `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${this.mapDataType(definition.type)}`;
    
    if (definition.notNull) {
      sql += ' NOT NULL';
    }
    
    if (definition.default !== undefined) {
      sql += ` DEFAULT ${this.formatDefault(definition.default)}`;
    }
    
    return sql;
  }

  /**
   * Map generic data types to PostgreSQL types
   */
  mapDataType(type) {
    const typeMap = {
      'id': 'SERIAL',
      'string': 'VARCHAR(255)',
      'text': 'TEXT',
      'integer': 'INTEGER',
      'bigint': 'BIGINT',
      'float': 'REAL',
      'double': 'DOUBLE PRECISION',
      'boolean': 'BOOLEAN',
      'date': 'DATE',
      'datetime': 'TIMESTAMP',
      'timestamp': 'TIMESTAMP',
      'json': 'JSONB',
      'array': 'TEXT[]',
      'uuid': 'UUID'
    };

    return typeMap[type.toLowerCase()] || type.toUpperCase();
  }

  /**
   * Format default values
   */
  formatDefault(value) {
    if (value === 'CURRENT_TIMESTAMP') {
      return 'CURRENT_TIMESTAMP';
    }
    if (value === null) {
      return 'NULL';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      return value;
    }
    return `'${value}'`;
  }

  /**
   * Check if table exists
   */
  async tableExists(tableName) {
    const result = await this.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )`,
      [tableName]
    );
    return result.rows[0].exists;
  }

  /**
   * Get database version
   */
  async getVersion() {
    const result = await this.query('SELECT version()');
    return result.rows[0].version;
  }

  /**
   * Get database size
   */
  async getDatabaseSize() {
    const result = await this.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);
    return result.rows[0].size;
  }

  /**
   * Get list of tables
   */
  async getTables() {
    const result = await this.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    return result.rows.map(row => row.tablename);
  }

  /**
   * Escape identifier (table/column name)
   */
  escapeIdentifier(identifier) {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /**
   * Format placeholder for parameterized queries
   */
  getPlaceholder(index) {
    return `$${index + 1}`;
  }

  /**
   * Check if error is a duplicate key error
   */
  isDuplicateKeyError(error) {
    return error.code === '23505';
  }

  /**
   * Check if error is a foreign key violation
   */
  isForeignKeyError(error) {
    return error.code === '23503';
  }

  /**
   * Check if error is a not null violation
   */
  isNotNullError(error) {
    return error.code === '23502';
  }
}

module.exports = PostgreSQLAdapter;