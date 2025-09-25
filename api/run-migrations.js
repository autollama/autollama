/**
 * AutoLlama Database Migration Runner
 * Automatically runs all SQL migration files for PostgreSQL and SQLite
 * Supports multiple deployment modes with intelligent database detection
 */

const fs = require('fs');
const path = require('path');

class MigrationRunner {
  constructor() {
    this.databaseUrl = process.env.DATABASE_URL || 'sqlite:./data/autollama.db';
    this.deploymentMode = process.env.DEPLOYMENT_MODE || 'local';
    this.isPostgreSQL = this.databaseUrl.startsWith('postgresql://') || this.databaseUrl.startsWith('postgres://');
    this.isSQLite = this.databaseUrl.startsWith('sqlite:');

    // Initialize appropriate database connection
    if (this.isPostgreSQL) {
      const { Pool } = require('pg');
      this.pool = new Pool({
        connectionString: this.databaseUrl
      });
      this.dbType = 'postgresql';
    } else if (this.isSQLite) {
      const Database = require('sqlite3').Database;
      const sqlitePath = this.databaseUrl.replace('sqlite:', '');

      // Ensure data directory exists
      const dataDir = path.dirname(sqlitePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new Database(sqlitePath);
      this.dbType = 'sqlite';
    } else {
      throw new Error(`Unsupported database URL format: ${this.databaseUrl}`);
    }

    this.migrationPaths = [
      'add_contextual_metadata_v2.sql',
      'migrations/create_background_jobs_table.sql',
      'migrations/add_session_tracking_fields.sql'
    ];
  }

  /**
   * Run all migration files
   */
  async runMigrations() {
    console.log(`🔄 Starting database migrations... (${this.dbType})`);

    try {
      // Initialize tables for SQLite
      if (this.isSQLite) {
        await this.initializeSQLiteTables();
      }

      // First, add the missing updated_at column to processed_content
      await this.addUpdatedAtColumn();

      // Run each migration file (PostgreSQL only for now)
      if (this.isPostgreSQL) {
        for (const migrationPath of this.migrationPaths) {
          await this.runMigrationFile(migrationPath);
        }
      }

      // Add any missing record_type and parent_document_id columns
      await this.addDocumentHierarchyColumns();

      console.log('✅ All migrations completed successfully');
      return true;

    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }

  /**
   * Initialize SQLite tables if they don't exist
   */
  async initializeSQLiteTables() {
    const createProcessedContentTable = `
      CREATE TABLE IF NOT EXISTS processed_content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        url TEXT,
        content TEXT,
        chunk_text TEXT,
        chunk_index INTEGER,
        summary TEXT,
        topics TEXT,
        entities TEXT,
        upload_session_id TEXT,
        processing_status TEXT DEFAULT 'pending',
        created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        document_type TEXT DEFAULT 'unknown',
        record_type TEXT DEFAULT 'chunk',
        parent_document_id INTEGER,
        source TEXT DEFAULT 'unknown'
      );
    `;

    const createBackgroundJobsTable = `
      CREATE TABLE IF NOT EXISTS background_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        data TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        error_message TEXT
      );
    `;

    await this.executeQuery(createProcessedContentTable);
    await this.executeQuery(createBackgroundJobsTable);
    console.log('✅ SQLite tables initialized');
  }

  /**
   * Add missing updated_at column
   */
  async addUpdatedAtColumn() {
    try {
      if (this.isPostgreSQL) {
        await this.executeQuery(`
          ALTER TABLE processed_content
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        `);
      } else if (this.isSQLite) {
        // SQLite doesn't support IF NOT EXISTS for columns, check first
        const hasColumn = await this.checkColumnExists('processed_content', 'updated_at');
        if (!hasColumn) {
          await this.executeQuery(`
            ALTER TABLE processed_content
            ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          `);
        }
      }
      console.log('✅ Added updated_at column to processed_content');
    } catch (error) {
      console.log('ℹ️ updated_at column may already exist:', error.message);
    }
  }

  /**
   * Add document hierarchy columns for v2.3
   */
  async addDocumentHierarchyColumns() {
    try {
      if (this.isPostgreSQL) {
        await this.executeQuery(`
          ALTER TABLE processed_content
          ADD COLUMN IF NOT EXISTS record_type VARCHAR(20) DEFAULT 'chunk',
          ADD COLUMN IF NOT EXISTS parent_document_id INTEGER
        `);

        // Create index for parent_document_id
        await this.executeQuery(`
          CREATE INDEX IF NOT EXISTS idx_processed_content_parent_document_id
          ON processed_content(parent_document_id)
        `);
      } else if (this.isSQLite) {
        // Check and add columns individually for SQLite
        const hasRecordType = await this.checkColumnExists('processed_content', 'record_type');
        if (!hasRecordType) {
          await this.executeQuery(`
            ALTER TABLE processed_content
            ADD COLUMN record_type TEXT DEFAULT 'chunk'
          `);
        }

        const hasParentDocId = await this.checkColumnExists('processed_content', 'parent_document_id');
        if (!hasParentDocId) {
          await this.executeQuery(`
            ALTER TABLE processed_content
            ADD COLUMN parent_document_id INTEGER
          `);
        }

        // Create index
        await this.executeQuery(`
          CREATE INDEX IF NOT EXISTS idx_processed_content_parent_document_id
          ON processed_content(parent_document_id)
        `);
      }

      console.log('✅ Added document hierarchy columns');
    } catch (error) {
      console.log('ℹ️ Document hierarchy columns may already exist:', error.message);
    }
  }

  /**
   * Run a single migration file (PostgreSQL only)
   */
  async runMigrationFile(migrationPath) {
    const fullPath = path.join(__dirname, migrationPath);

    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️ Migration file not found: ${migrationPath}`);
      return;
    }

    try {
      const sql = fs.readFileSync(fullPath, 'utf8');
      await this.executeQuery(sql);
      console.log(`✅ Executed migration: ${migrationPath}`);
    } catch (error) {
      // Some migrations might fail if already applied - that's often OK
      if (error.message.includes('already exists') ||
          error.message.includes('duplicate column') ||
          error.message.includes('already exists')) {
        console.log(`ℹ️ Migration already applied: ${migrationPath}`);
      } else {
        console.error(`❌ Failed to run migration ${migrationPath}:`, error.message);
        throw error;
      }
    }
  }

  /**
   * Execute a query on the appropriate database
   */
  async executeQuery(sql) {
    if (this.isPostgreSQL) {
      return await this.pool.query(sql);
    } else if (this.isSQLite) {
      return new Promise((resolve, reject) => {
        this.db.run(sql, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ rows: [], rowCount: this.changes });
          }
        });
      });
    }
  }

  /**
   * Check if a column exists in SQLite
   */
  async checkColumnExists(tableName, columnName) {
    if (this.isSQLite) {
      return new Promise((resolve, reject) => {
        this.db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const hasColumn = rows.some(row => row.name === columnName);
            resolve(hasColumn);
          }
        });
      });
    }
    return false;
  }

  /**
   * Check if migrations are needed
   */
  async checkMigrationsNeeded() {
    try {
      if (this.isPostgreSQL) {
        // Check for key v2.3 columns
        const result = await this.executeQuery(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'processed_content'
          AND column_name IN ('updated_at', 'document_type', 'record_type')
        `);

        const existingColumns = result.rows.map(row => row.column_name);
        const missingColumns = ['updated_at', 'document_type', 'record_type']
          .filter(col => !existingColumns.includes(col));

        if (missingColumns.length > 0) {
          console.log('🔍 Missing columns detected:', missingColumns.join(', '));
          return true;
        }

        // Check for background_jobs table
        const tableCheck = await this.executeQuery(`
          SELECT table_name FROM information_schema.tables
          WHERE table_name = 'background_jobs'
        `);

        if (tableCheck.rows.length === 0) {
          console.log('🔍 background_jobs table missing');
          return true;
        }
      } else if (this.isSQLite) {
        // For SQLite, check if processed_content table exists
        const hasProcessedContent = await this.checkTableExists('processed_content');
        if (!hasProcessedContent) {
          console.log('🔍 processed_content table missing');
          return true;
        }

        // Check if background_jobs table exists
        const hasBackgroundJobs = await this.checkTableExists('background_jobs');
        if (!hasBackgroundJobs) {
          console.log('🔍 background_jobs table missing');
          return true;
        }

        // Check for key columns
        const hasUpdatedAt = await this.checkColumnExists('processed_content', 'updated_at');
        const hasRecordType = await this.checkColumnExists('processed_content', 'record_type');
        if (!hasUpdatedAt || !hasRecordType) {
          console.log('🔍 Missing columns in SQLite database');
          return true;
        }
      }

      console.log('✅ All required schema elements present');
      return false;

    } catch (error) {
      console.error('Error checking migration status:', error.message);
      return true; // Assume migrations needed if we can't check
    }
  }

  /**
   * Check if a table exists in SQLite
   */
  async checkTableExists(tableName) {
    if (this.isSQLite) {
      return new Promise((resolve, reject) => {
        this.db.get(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
          [tableName],
          (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(!!row);
            }
          }
        );
      });
    }
    return false;
  }

  async close() {
    if (this.isPostgreSQL && this.pool) {
      await this.pool.end();
    } else if (this.isSQLite && this.db) {
      return new Promise((resolve) => {
        this.db.close(() => {
          resolve();
        });
      });
    }
  }
}

// Run migrations if called directly
if (require.main === module) {
  (async () => {
    const runner = new MigrationRunner();
    try {
      const needed = await runner.checkMigrationsNeeded();
      if (needed) {
        await runner.runMigrations();
      } else {
        console.log('✅ No migrations needed');
      }
    } catch (error) {
      console.error('Migration runner failed:', error);
      process.exit(1);
    } finally {
      await runner.close();
    }
  })();
}

module.exports = MigrationRunner;