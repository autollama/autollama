/**
 * Enhanced Migration Runner
 * 🦙 Universal database migration system for PostgreSQL and SQLite
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { DatabaseManager } = require('../database');

class MigrationRunner {
  constructor(config = {}) {
    this.config = {
      migrationsPath: config.migrationsPath || path.join(__dirname, '..', '..', 'migrations'),
      tableName: config.tableName || 'migration_history',
      databaseType: config.databaseType || process.env.DATABASE_TYPE || 'postgresql',
      ...config
    };
    
    this.db = new DatabaseManager(this.config);
    this.migrations = [];
  }

  /**
   * Initialize migration system
   */
  async initialize() {
    await this.db.connect();
    await this.createMigrationTable();
    await this.loadMigrations();
  }

  /**
   * Create migration history table
   */
  async createMigrationTable() {
    const schema = {
      id: { type: 'id', primaryKey: true, autoIncrement: true },
      name: { type: 'string', notNull: true, unique: true },
      batch: { type: 'integer', notNull: true },
      executed_at: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' }
    };

    await this.db.createTable(this.config.tableName, schema);
  }

  /**
   * Load all migration files
   */
  async loadMigrations() {
    const migrationsDir = this.config.migrationsPath;
    
    if (!await fs.pathExists(migrationsDir)) {
      console.log(chalk.yellow(`🦙 Migrations directory not found: ${migrationsDir}`));
      return;
    }
    
    const files = await fs.readdir(migrationsDir);
    
    // Load both SQL and JS migrations
    for (const file of files.sort()) {
      if (file.endsWith('.sql') || file.endsWith('.js')) {
        const migrationPath = path.join(migrationsDir, file);
        const migration = await this.loadMigration(migrationPath);
        
        if (migration) {
          this.migrations.push(migration);
        }
      }
    }
    
    console.log(chalk.gray(`🦙 Found ${this.migrations.length} migrations`));
  }

  /**
   * Load a single migration file
   */
  async loadMigration(filePath) {
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath);
    
    try {
      if (extension === '.sql') {
        const content = await fs.readFile(filePath, 'utf8');
        return {
          name: fileName,
          type: 'sql',
          up: content,
          down: null // SQL migrations don't support rollback
        };
      } else if (extension === '.js') {
        const migration = require(filePath);
        return {
          name: fileName,
          type: 'javascript',
          up: migration.up,
          down: migration.down
        };
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Failed to load migration ${fileName}: ${error.message}`));
      return null;
    }
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations() {
    const executed = await this.db.select(this.config.tableName, {
      columns: ['name'],
      orderBy: ['executed_at']
    });
    
    const executedNames = new Set(executed.map(m => m.name));
    
    return this.migrations.filter(migration => !executedNames.has(migration.name));
  }

  /**
   * Run all pending migrations
   */
  async runMigrations() {
    await this.initialize();
    
    const pending = await this.getPendingMigrations();
    
    if (pending.length === 0) {
      console.log(chalk.green('✅ No pending migrations'));
      return { executed: 0, pending: 0 };
    }
    
    console.log(chalk.cyan(`🦙 Running ${pending.length} migrations...`));
    
    const batch = await this.getNextBatch();
    let executed = 0;
    
    for (const migration of pending) {
      try {
        console.log(chalk.gray(`  • ${migration.name}`));
        
        await this.db.transaction(async (client) => {
          // Execute migration
          if (migration.type === 'sql') {
            await client.query(migration.up);
          } else if (migration.type === 'javascript' && typeof migration.up === 'function') {
            await migration.up(client, this.db);
          }
          
          // Record migration
          await client.query(
            `INSERT INTO ${this.config.tableName} (name, batch) VALUES (${this.db.getQueryBuilder().getPlaceholder(0)}, ${this.db.getQueryBuilder().getPlaceholder(1)})`,
            [migration.name, batch]
          );
        });
        
        executed++;
        console.log(chalk.green(`    ✅ ${migration.name}`));
        
      } catch (error) {
        console.error(chalk.red(`    ❌ ${migration.name}: ${error.message}`));
        throw new Error(`Migration ${migration.name} failed: ${error.message}`);
      }
    }
    
    console.log(chalk.green(`✅ Executed ${executed} migrations`));
    return { executed, pending: pending.length };
  }

  /**
   * Rollback migrations
   */
  async rollback(steps = 1) {
    await this.initialize();
    
    const lastBatch = await this.getLastBatch();
    if (!lastBatch) {
      console.log(chalk.yellow('🦙 No migrations to rollback'));
      return { rolledBack: 0 };
    }
    
    const migrationsToRollback = await this.db.select(this.config.tableName, {
      where: { batch: lastBatch },
      orderBy: [{ column: 'executed_at', direction: 'DESC' }]
    });
    
    if (migrationsToRollback.length === 0) {
      console.log(chalk.yellow('🦙 No migrations to rollback in the last batch'));
      return { rolledBack: 0 };
    }
    
    console.log(chalk.cyan(`🦙 Rolling back ${migrationsToRollback.length} migrations...`));
    
    let rolledBack = 0;
    
    for (const migrationRecord of migrationsToRollback) {
      const migration = this.migrations.find(m => m.name === migrationRecord.name);
      
      if (!migration || !migration.down) {
        console.warn(chalk.yellow(`⚠️  Cannot rollback ${migrationRecord.name} - no down migration`));
        continue;
      }
      
      try {
        console.log(chalk.gray(`  • Rolling back ${migration.name}`));
        
        await this.db.transaction(async (client) => {
          // Execute rollback
          if (migration.type === 'javascript' && typeof migration.down === 'function') {
            await migration.down(client, this.db);
          }
          
          // Remove migration record
          await client.query(
            `DELETE FROM ${this.config.tableName} WHERE name = ${this.db.getQueryBuilder().getPlaceholder(0)}`,
            [migration.name]
          );
        });
        
        rolledBack++;
        console.log(chalk.green(`    ✅ Rolled back ${migration.name}`));
        
      } catch (error) {
        console.error(chalk.red(`    ❌ Failed to rollback ${migration.name}: ${error.message}`));
        throw error;
      }
    }
    
    console.log(chalk.green(`✅ Rolled back ${rolledBack} migrations`));
    return { rolledBack };
  }

  /**
   * Get migration status
   */
  async getStatus() {
    await this.initialize();
    
    const executed = await this.db.select(this.config.tableName, {
      orderBy: ['executed_at']
    });
    
    const pending = await this.getPendingMigrations();
    
    return {
      total: this.migrations.length,
      executed: executed.length,
      pending: pending.length,
      lastMigration: executed[executed.length - 1] || null,
      pendingMigrations: pending.map(m => m.name)
    };
  }

  /**
   * Create a new migration file
   */
  async createMigration(name) {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const fileName = `${timestamp}_${name}.js`;
    const filePath = path.join(this.config.migrationsPath, fileName);
    
    const template = `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

module.exports = {
  /**
   * Run the migration
   */
  async up(client, db) {
    // Add your migration code here
    // Example:
    // await client.query('ALTER TABLE processed_content ADD COLUMN new_field TEXT');
  },

  /**
   * Rollback the migration
   */
  async down(client, db) {
    // Add your rollback code here
    // Example:
    // await client.query('ALTER TABLE processed_content DROP COLUMN new_field');
  }
};
`;
    
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, template);
    
    console.log(chalk.green(`✅ Created migration: ${fileName}`));
    return fileName;
  }

  /**
   * Reset database (drop all tables)
   */
  async reset() {
    await this.initialize();
    
    console.log(chalk.red('🦙 WARNING: This will destroy all data!'));
    
    const tables = await this.db.getAdapter().getTables();
    
    for (const table of tables) {
      await this.db.dropTable(table);
      console.log(chalk.gray(`  • Dropped table: ${table}`));
    }
    
    console.log(chalk.green('✅ Database reset complete'));
  }

  /**
   * Get next batch number
   */
  async getNextBatch() {
    const result = await this.db.query(
      `SELECT COALESCE(MAX(batch), 0) + 1 as next_batch FROM ${this.config.tableName}`
    );
    const rows = result.rows || result;
    return rows[0]?.next_batch || 1;
  }

  /**
   * Get last batch number
   */
  async getLastBatch() {
    const result = await this.db.query(
      `SELECT MAX(batch) as last_batch FROM ${this.config.tableName}`
    );
    const rows = result.rows || result;
    return rows[0]?.last_batch || null;
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      await this.db.disconnect();
    }
  }
}

module.exports = MigrationRunner;