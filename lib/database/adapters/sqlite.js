/**
 * SQLite Database Adapter
 * 🦙 Lightweight local database for development
 */

const sqlite3 = require('sqlite3');
const { promisify } = require('util');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

class SQLiteAdapter {
  constructor(config) {
    this.config = config;
    this.db = null;
    this.connected = false;
  }

  /**
   * Connect to SQLite database
   */
  async connect() {
    try {
      // Ensure database directory exists
      const dbPath = path.resolve(this.config.path);
      const dbDir = path.dirname(dbPath);
      await fs.ensureDir(dbDir);

      // Create database connection
      const verbose = this.config.options?.verbose ? sqlite3.verbose() : sqlite3;
      
      return new Promise((resolve, reject) => {
        this.db = new verbose.Database(dbPath, (err) => {
          if (err) {
            reject(new Error(`SQLite connection failed: ${err.message}`));
          } else {
            this.connected = true;
            
            // Enable foreign keys
            this.db.run('PRAGMA foreign_keys = ON');
            
            // Set journal mode for better performance
            this.db.run('PRAGMA journal_mode = WAL');
            
            // Promisify database methods
            this.run = promisify(this.db.run.bind(this.db));
            this.get = promisify(this.db.get.bind(this.db));
            this.all = promisify(this.db.all.bind(this.db));
            
            if (this.config.options?.verbose) {
              console.log(chalk.gray(`🦙 SQLite database opened at: ${dbPath}`));
            }
            
            resolve(this);
          }
        });
      });
    } catch (error) {
      throw new Error(`SQLite setup failed: ${error.message}`);
    }
  }

  /**
   * Disconnect from SQLite
   */
  async disconnect() {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.connected = false;
            resolve();
          }
        });
      });
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
      // Determine query type
      const operation = sql.trim().toUpperCase().split(' ')[0];
      
      switch (operation) {
        case 'SELECT':
          return { rows: await this.all(sql, params) };
        
        case 'INSERT':
        case 'UPDATE':
        case 'DELETE':
          const result = await this.run(sql, params);
          return {
            rows: [],
            rowCount: result.changes,
            lastID: result.lastID
          };
        
        default:
          await this.run(sql, params);
          return { rows: [] };
      }
    } catch (error) {
      console.error(chalk.red('SQLite query error:'), error.message);
      console.error(chalk.gray('SQL:'), sql);
      if (params.length > 0) {
        console.error(chalk.gray('Params:'), params);
      }
      throw error;
    }
  }

  /**
   * Get a client for transactions (SQLite doesn't have connection pooling)
   */
  async getClient() {
    if (!this.connected) {
      throw new Error('Database not connected');
    }
    
    // Return a wrapper that mimics PostgreSQL client
    return {
      query: (sql, params) => this.query(sql, params),
      release: () => {} // No-op for SQLite
    };
  }

  /**
   * Release a client (no-op for SQLite)
   */
  releaseClient(client) {
    // No-op for SQLite
  }

  /**
   * Get the last inserted ID
   */
  getInsertedId(result) {
    return result.lastID || null;
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
      
      if (definition.primaryKey || definition.autoIncrement) {
        columnDef = `${name} INTEGER PRIMARY KEY AUTOINCREMENT`;
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
    let sql = `ALTER TABLE ${table} ADD COLUMN ${column} ${this.mapDataType(definition.type)}`;
    
    if (definition.default !== undefined) {
      sql += ` DEFAULT ${this.formatDefault(definition.default)}`;
    }
    
    return sql;
  }

  /**
   * Map generic data types to SQLite types
   */
  mapDataType(type) {
    const typeMap = {
      'id': 'INTEGER',
      'string': 'TEXT',
      'text': 'TEXT',
      'integer': 'INTEGER',
      'bigint': 'INTEGER',
      'float': 'REAL',
      'double': 'REAL',
      'boolean': 'INTEGER', // SQLite uses 0/1 for boolean
      'date': 'TEXT',
      'datetime': 'TEXT',
      'timestamp': 'TEXT',
      'json': 'TEXT', // Store JSON as text
      'array': 'TEXT', // Store arrays as JSON text
      'uuid': 'TEXT'
    };

    return typeMap[type.toLowerCase()] || 'TEXT';
  }

  /**
   * Format default values
   */
  formatDefault(value) {
    if (value === 'CURRENT_TIMESTAMP') {
      return `(datetime('now'))`;
    }
    if (value === null) {
      return 'NULL';
    }
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
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
    const result = await this.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName]
    );
    return !!result;
  }

  /**
   * Get database version
   */
  async getVersion() {
    const result = await this.get('SELECT sqlite_version() as version');
    return `SQLite ${result.version}`;
  }

  /**
   * Get database size
   */
  async getDatabaseSize() {
    try {
      const stats = await fs.stat(path.resolve(this.config.path));
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      return `${sizeInMB} MB`;
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Get list of tables
   */
  async getTables() {
    const results = await this.all(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    );
    return results.map(row => row.name);
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
    return '?';
  }

  /**
   * Check if error is a duplicate key error
   */
  isDuplicateKeyError(error) {
    return error.message.includes('UNIQUE constraint failed');
  }

  /**
   * Check if error is a foreign key violation
   */
  isForeignKeyError(error) {
    return error.message.includes('FOREIGN KEY constraint failed');
  }

  /**
   * Check if error is a not null violation
   */
  isNotNullError(error) {
    return error.message.includes('NOT NULL constraint failed');
  }

  /**
   * SQLite-specific: Enable full-text search
   */
  async enableFTS(tableName, columns) {
    const ftsTableName = `${tableName}_fts`;
    const columnList = columns.join(', ');
    
    // Create FTS virtual table
    await this.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${ftsTableName} 
      USING fts5(${columnList}, content='${tableName}')
    `);
    
    // Create triggers to keep FTS in sync
    await this.run(`
      CREATE TRIGGER IF NOT EXISTS ${tableName}_ai 
      AFTER INSERT ON ${tableName} BEGIN
        INSERT INTO ${ftsTableName}(${columnList}) 
        VALUES(${columns.map(c => `new.${c}`).join(', ')});
      END
    `);
    
    await this.run(`
      CREATE TRIGGER IF NOT EXISTS ${tableName}_ad 
      AFTER DELETE ON ${tableName} BEGIN
        DELETE FROM ${ftsTableName} WHERE rowid = old.rowid;
      END
    `);
    
    await this.run(`
      CREATE TRIGGER IF NOT EXISTS ${tableName}_au 
      AFTER UPDATE ON ${tableName} BEGIN
        DELETE FROM ${ftsTableName} WHERE rowid = old.rowid;
        INSERT INTO ${ftsTableName}(${columnList}) 
        VALUES(${columns.map(c => `new.${c}`).join(', ')});
      END
    `);
    
    console.log(chalk.green(`🦙 Full-text search enabled for ${tableName}`));
  }

  /**
   * SQLite-specific: Optimize database
   */
  async optimize() {
    await this.run('VACUUM');
    await this.run('ANALYZE');
    console.log(chalk.green('🦙 SQLite database optimized!'));
  }
}

module.exports = SQLiteAdapter;