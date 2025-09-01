/**
 * AutoLlama Migrate Command
 * 🦙 Database migration management
 */

const chalk = require('chalk');
const ora = require('ora');
const { MigrationRunner } = require('../migrations/migration-runner');
const fs = require('fs-extra');
const path = require('path');

class MigrateCommand {
  constructor(options = {}) {
    this.options = options;
    this.runner = null;
  }

  async run() {
    try {
      // Initialize migration runner
      await this.initializeRunner();
      
      if (this.options.status) {
        await this.showStatus();
      } else if (this.options.up) {
        await this.runMigrations();
      } else if (this.options.down !== undefined) {
        await this.rollbackMigrations();
      } else if (this.options.reset) {
        await this.resetDatabase();
      } else if (this.options.create) {
        await this.createMigration();
      } else {
        // Default action - show status and run pending migrations
        await this.showStatus();
        const status = await this.runner.getStatus();
        
        if (status.pending > 0) {
          console.log(chalk.cyan(`\n🦙 Found ${status.pending} pending migrations`));
          console.log(chalk.gray('Run with --up to apply them\n'));
        }
      }
      
    } catch (error) {
      console.error(chalk.red.bold('\n❌ Migration command failed:'), error.message);
      process.exit(1);
    } finally {
      if (this.runner) {
        await this.runner.close();
      }
    }
  }

  async initializeRunner() {
    const spinner = ora('Initializing migration system...').start();
    
    // Determine database type from environment
    const databaseType = process.env.DATABASE_TYPE || 
                        (process.env.DEPLOYMENT_MODE === 'local' ? 'sqlite' : 'postgresql');
    
    this.runner = new MigrationRunner({
      databaseType,
      migrationsPath: path.join(process.cwd(), 'migrations'),
      projectRoot: process.cwd()
    });
    
    await this.runner.initialize();
    spinner.succeed('Migration system ready');
  }

  async showStatus() {
    console.log(chalk.cyan('\n🦙 Migration Status\n'));
    
    const status = await this.runner.getStatus();
    
    console.log(chalk.white(`Total migrations:     ${status.total}`));
    console.log(chalk.green(`Executed migrations:   ${status.executed}`));
    console.log(chalk.yellow(`Pending migrations:    ${status.pending}`));
    
    if (status.lastMigration) {
      console.log(chalk.gray(`Last migration:        ${status.lastMigration.name}`));
      console.log(chalk.gray(`Executed at:           ${status.lastMigration.executed_at}`));
    }
    
    if (status.pending > 0) {
      console.log(chalk.cyan('\n📋 Pending migrations:'));
      status.pendingMigrations.forEach(name => {
        console.log(chalk.yellow(`  • ${name}`));
      });
    }
    
    // Database info
    const dbInfo = await this.runner.db.getDatabaseInfo();
    console.log(chalk.cyan('\n💾 Database Info:'));
    console.log(chalk.white(`  Type:     ${dbInfo.type}`));
    console.log(chalk.white(`  Status:   ${dbInfo.connected ? 'Connected' : 'Disconnected'}`));
    if (dbInfo.version) {
      console.log(chalk.white(`  Version:  ${dbInfo.version}`));
    }
    if (dbInfo.size) {
      console.log(chalk.white(`  Size:     ${dbInfo.size}`));
    }
    if (dbInfo.tables) {
      console.log(chalk.white(`  Tables:   ${dbInfo.tables.length}`));
    }
  }

  async runMigrations() {
    const spinner = ora('Running migrations...').start();
    
    try {
      const result = await this.runner.runMigrations();
      
      if (result.executed === 0) {
        spinner.succeed('No migrations to run');
      } else {
        spinner.succeed(`Applied ${result.executed} migrations`);
        
        // Show what was applied
        console.log(chalk.green('\n✅ Migration Summary:'));
        console.log(chalk.white(`  • Executed: ${result.executed}`));
        console.log(chalk.white(`  • Database is now up to date`));
      }
      
    } catch (error) {
      spinner.fail('Migration failed');
      throw error;
    }
  }

  async rollbackMigrations() {
    const steps = parseInt(this.options.down) || 1;
    
    console.log(chalk.red(`⚠️  Rolling back ${steps} migration(s)`));
    console.log(chalk.yellow('This will modify your database!\n'));
    
    const spinner = ora('Rolling back migrations...').start();
    
    try {
      const result = await this.runner.rollback(steps);
      
      if (result.rolledBack === 0) {
        spinner.succeed('No migrations to rollback');
      } else {
        spinner.succeed(`Rolled back ${result.rolledBack} migrations`);
      }
      
    } catch (error) {
      spinner.fail('Rollback failed');
      throw error;
    }
  }

  async resetDatabase() {
    console.log(chalk.red.bold('⚠️  DATABASE RESET WARNING'));
    console.log(chalk.red('This will DESTROY ALL DATA in your database!'));
    console.log(chalk.yellow('This action cannot be undone!\n'));
    
    // In a real implementation, we'd add confirmation prompts
    console.log(chalk.gray('Reset cancelled for safety. Use --force-reset to override.'));
    
    if (this.options.forceReset) {
      const spinner = ora('Resetting database...').start();
      
      try {
        await this.runner.reset();
        spinner.succeed('Database reset complete');
        
        console.log(chalk.cyan('\n🦙 Run migrations to recreate schema:'));
        console.log(chalk.white('  autollama migrate --up'));
        
      } catch (error) {
        spinner.fail('Reset failed');
        throw error;
      }
    }
  }

  async createMigration() {
    const name = this.options.create;
    
    if (!name || typeof name !== 'string') {
      console.error(chalk.red('❌ Migration name is required'));
      console.log(chalk.gray('Usage: autollama migrate --create add_new_feature'));
      process.exit(1);
    }
    
    const spinner = ora('Creating migration...').start();
    
    try {
      const fileName = await this.runner.createMigration(name);
      const filePath = path.join('migrations', fileName);
      
      spinner.succeed('Migration created');
      
      console.log(chalk.green('\n✅ New migration created:'));
      console.log(chalk.white(`  File: ${filePath}`));
      console.log(chalk.gray('\n📝 Edit the migration file to add your changes'));
      console.log(chalk.gray('Then run: autollama migrate --up'));
      
    } catch (error) {
      spinner.fail('Failed to create migration');
      throw error;
    }
  }

  async runDatabaseOperations() {
    // Handle additional database operations called from main CLI
    if (this.options.reset) {
      await this.resetDatabase();
    }
    
    if (this.options.seed) {
      await this.seedDatabase();
    }
    
    if (this.options.backup) {
      await this.backupDatabase();
    }
    
    if (this.options.restore) {
      await this.restoreDatabase();
    }
  }

  async seedDatabase() {
    const spinner = ora('Seeding database with sample data...').start();
    
    try {
      // Sample documents for testing
      const sampleData = [
        {
          url: 'sample://welcome-document',
          title: 'Welcome to AutoLlama',
          summary: 'Getting started guide for your new RAG framework',
          chunk_text: 'Welcome to AutoLlama! This is a sample document to help you understand how the system works. AutoLlama is a context-aware RAG framework that understands your documents like a human would.',
          chunk_id: 'sample-welcome-1',
          chunk_index: 0,
          content_type: 'documentation',
          main_topics: this.runner.db.config.type === 'sqlite' ? 
            JSON.stringify(['welcome', 'getting-started', 'rag']) :
            ['welcome', 'getting-started', 'rag'],
          processing_status: 'completed',
          record_type: 'chunk'
        },
        {
          url: 'sample://features-document',
          title: 'AutoLlama Features',
          summary: 'Overview of AutoLlama capabilities and features',
          chunk_text: 'AutoLlama provides contextual embeddings, intelligent chunking, semantic search, and real-time processing. It supports multiple deployment modes and integrates seamlessly with OpenWebUI.',
          chunk_id: 'sample-features-1',
          chunk_index: 0,
          content_type: 'documentation',
          main_topics: this.runner.db.config.type === 'sqlite' ? 
            JSON.stringify(['features', 'capabilities', 'deployment']) :
            ['features', 'capabilities', 'deployment'],
          processing_status: 'completed',
          record_type: 'chunk'
        }
      ];
      
      for (const data of sampleData) {
        await this.runner.db.insert('processed_content', data);
      }
      
      spinner.succeed(`Seeded database with ${sampleData.length} sample documents`);
      
    } catch (error) {
      spinner.fail('Seeding failed');
      throw error;
    }
  }

  async backupDatabase() {
    const spinner = ora('Creating database backup...').start();
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = `backup-${timestamp}.sql`;
      
      if (this.runner.db.config.type === 'sqlite') {
        // Copy SQLite file
        const sourcePath = path.resolve(this.runner.db.config.path);
        const backupPath = path.join('backups', backupFile.replace('.sql', '.db'));
        
        await fs.ensureDir('backups');
        await fs.copy(sourcePath, backupPath);
        
        spinner.succeed(`Backup created: ${backupPath}`);
      } else {
        // PostgreSQL dump
        const { execSync } = require('child_process');
        const backupPath = path.join('backups', backupFile);
        
        await fs.ensureDir('backups');
        execSync(`pg_dump ${process.env.DATABASE_URL} > ${backupPath}`);
        
        spinner.succeed(`Backup created: ${backupPath}`);
      }
      
    } catch (error) {
      spinner.fail('Backup failed');
      throw error;
    }
  }

  async restoreDatabase() {
    const backupFile = this.options.restore;
    
    if (!await fs.pathExists(backupFile)) {
      console.error(chalk.red(`❌ Backup file not found: ${backupFile}`));
      process.exit(1);
    }
    
    console.log(chalk.red.bold('⚠️  DATABASE RESTORE WARNING'));
    console.log(chalk.red('This will REPLACE ALL DATA in your database!'));
    console.log(chalk.yellow('This action cannot be undone!\n'));
    
    // In production, would add confirmation prompt
    console.log(chalk.gray('Restore cancelled for safety. Use --force-restore to override.'));
    
    if (this.options.forceRestore) {
      const spinner = ora('Restoring database...').start();
      
      try {
        if (this.runner.db.config.type === 'sqlite') {
          // Copy backup file over current database
          const targetPath = path.resolve(this.runner.db.config.path);
          await fs.copy(backupFile, targetPath);
        } else {
          // PostgreSQL restore
          const { execSync } = require('child_process');
          execSync(`psql ${process.env.DATABASE_URL} < ${backupFile}`);
        }
        
        spinner.succeed('Database restored');
        
      } catch (error) {
        spinner.fail('Restore failed');
        throw error;
      }
    }
  }
}

module.exports = MigrateCommand;