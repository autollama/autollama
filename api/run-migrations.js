/**
 * AutoLlama Database Migration Runner
 * Automatically runs all SQL migration files to ensure schema compatibility
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

class MigrationRunner {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://autollama:autollama@postgres:5432/autollama'
    });
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
    console.log('🔄 Starting database migrations...');
    
    try {
      // First, add the missing updated_at column to processed_content
      await this.addUpdatedAtColumn();
      
      // Run each migration file
      for (const migrationPath of this.migrationPaths) {
        await this.runMigrationFile(migrationPath);
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
   * Add missing updated_at column
   */
  async addUpdatedAtColumn() {
    try {
      await this.pool.query(`
        ALTER TABLE processed_content 
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);
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
      await this.pool.query(`
        ALTER TABLE processed_content 
        ADD COLUMN IF NOT EXISTS record_type VARCHAR(20) DEFAULT 'chunk',
        ADD COLUMN IF NOT EXISTS parent_document_id INTEGER
      `);
      
      // Create index for parent_document_id
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_processed_content_parent_document_id 
        ON processed_content(parent_document_id)
      `);
      
      console.log('✅ Added document hierarchy columns');
    } catch (error) {
      console.log('ℹ️ Document hierarchy columns may already exist:', error.message);
    }
  }

  /**
   * Run a single migration file
   */
  async runMigrationFile(migrationPath) {
    const fullPath = path.join(__dirname, migrationPath);
    
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️ Migration file not found: ${migrationPath}`);
      return;
    }
    
    try {
      const sql = fs.readFileSync(fullPath, 'utf8');
      await this.pool.query(sql);
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
   * Check if migrations are needed
   */
  async checkMigrationsNeeded() {
    try {
      // Check for key v2.3 columns
      const result = await this.pool.query(`
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
      const tableCheck = await this.pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_name = 'background_jobs'
      `);
      
      if (tableCheck.rows.length === 0) {
        console.log('🔍 background_jobs table missing');
        return true;
      }
      
      console.log('✅ All required schema elements present');
      return false;
      
    } catch (error) {
      console.error('Error checking migration status:', error.message);
      return true; // Assume migrations needed if we can't check
    }
  }

  async close() {
    await this.pool.end();
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