/**
 * AutoLlama Service Manager
 * 🦙 Central coordination for all AutoLlama services
 */

const ServiceOrchestrator = require('./orchestrator');
const { DatabaseManager } = require('../database');
const { MigrationRunner } = require('../migrations/migration-runner');
const EmbeddedQdrant = require('./qdrant-embedded');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');

class AutoLlamaServiceManager {
  constructor(config = {}) {
    this.config = {
      deploymentMode: process.env.DEPLOYMENT_MODE || 'local',
      autoMigrate: config.autoMigrate !== false,
      autoStart: config.autoStart !== false,
      projectRoot: config.projectRoot || process.cwd(),
      ...config
    };
    
    this.db = null;
    this.orchestrator = null;
    this.embeddedServices = {};
    this.isInitialized = false;
  }

  /**
   * Initialize AutoLlama with automatic setup
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    console.log(chalk.cyan.bold('\n🦙 Initializing AutoLlama...'));
    console.log(chalk.gray(`Project: ${path.basename(this.config.projectRoot)}`));
    console.log(chalk.gray(`Mode: ${this.config.deploymentMode}\n`));

    try {
      // 1. Initialize database
      await this.initializeDatabase();
      
      // 2. Run migrations
      if (this.config.autoMigrate) {
        await this.runMigrations();
      }
      
      // 3. Initialize orchestrator
      this.orchestrator = new ServiceOrchestrator({
        deploymentMode: this.config.deploymentMode,
        servicesPath: this.config.projectRoot
      });
      
      // 4. Start embedded services
      await this.startEmbeddedServices();
      
      this.isInitialized = true;
      console.log(chalk.green('✅ AutoLlama initialized'));
      
    } catch (error) {
      console.error(chalk.red('❌ Initialization failed:'), error.message);
      throw error;
    }
  }

  /**
   * Initialize database connection
   */
  async initializeDatabase() {
    const dbConfig = this.getDatabaseConfig();
    this.db = new DatabaseManager(dbConfig);
    
    try {
      await this.db.connect();
      console.log(chalk.green(`✅ Database connected (${dbConfig.type})`));
    } catch (error) {
      if (dbConfig.type === 'sqlite') {
        // Create database directory if needed
        await fs.ensureDir(path.dirname(path.resolve(dbConfig.path)));
        await this.db.connect();
        console.log(chalk.green(`✅ SQLite database created`));
      } else {
        throw error;
      }
    }
  }

  /**
   * Get database configuration
   */
  getDatabaseConfig() {
    if (this.config.deploymentMode === 'local') {
      return {
        type: 'sqlite',
        path: process.env.DATABASE_PATH || './data/autollama.db',
        options: {
          verbose: process.env.DEBUG === 'true'
        }
      };
    } else {
      return {
        type: 'postgresql',
        connectionString: process.env.DATABASE_URL || 'postgresql://autollama:autollama@localhost:5432/autollama'
      };
    }
  }

  /**
   * Run database migrations
   */
  async runMigrations() {
    const migrationConfig = {
      databaseType: this.db.config.type,
      migrationsPath: path.join(this.config.projectRoot, 'migrations')
    };
    
    const runner = new MigrationRunner(migrationConfig);
    runner.db = this.db; // Reuse our database connection
    
    try {
      await runner.initialize();
      const result = await runner.runMigrations();
      
      if (result.executed > 0) {
        console.log(chalk.green(`✅ Applied ${result.executed} migrations`));
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Migration failed:'), error.message);
      throw error;
    } finally {
      await runner.close();
    }
  }

  /**
   * Start embedded services for local development
   */
  async startEmbeddedServices() {
    if (this.config.deploymentMode !== 'local') {
      return;
    }

    console.log(chalk.cyan('🦙 Starting embedded services...'));
    
    // Start embedded Qdrant
    const qdrantConfig = {
      port: 6333,
      dataPath: path.join(this.config.projectRoot, 'data', 'qdrant')
    };
    
    this.embeddedServices.qdrant = new EmbeddedQdrant(qdrantConfig);
    await this.embeddedServices.qdrant.start();
    
    console.log(chalk.green('✅ Embedded services started'));
  }

  /**
   * Start all services
   */
  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.config.autoStart && this.orchestrator) {
      await this.orchestrator.startAll();
    }
  }

  /**
   * Stop all services
   */
  async stop() {
    console.log(chalk.yellow('\n🦙 Stopping AutoLlama...'));
    
    // Stop orchestrated services
    if (this.orchestrator) {
      await this.orchestrator.stopAll();
    }
    
    // Stop embedded services
    for (const [name, service] of Object.entries(this.embeddedServices)) {
      if (service && typeof service.stop === 'function') {
        await service.stop();
        console.log(chalk.gray(`  • Stopped embedded ${name}`));
      }
    }
    
    // Close database
    if (this.db) {
      await this.db.disconnect();
    }
    
    console.log(chalk.green('✅ AutoLlama stopped'));
  }

  /**
   * Get comprehensive status
   */
  async getStatus() {
    const status = {
      initialized: this.isInitialized,
      deploymentMode: this.config.deploymentMode,
      database: null,
      services: {},
      embeddedServices: {}
    };

    // Database status
    if (this.db) {
      status.database = await this.db.healthCheck();
      status.database.info = await this.db.getDatabaseInfo();
    }

    // Service status
    if (this.orchestrator) {
      const healthResults = await this.orchestrator.healthCheckAll();
      status.services = healthResults;
    }

    // Embedded service status
    for (const [name, service] of Object.entries(this.embeddedServices)) {
      if (service && typeof service.getInfo === 'function') {
        status.embeddedServices[name] = service.getInfo();
      }
    }

    return status;
  }

  /**
   * Get database instance
   */
  getDatabase() {
    return this.db;
  }

  /**
   * Get service orchestrator
   */
  getOrchestrator() {
    return this.orchestrator;
  }

  /**
   * Restart all services
   */
  async restart() {
    console.log(chalk.cyan('🔄 Restarting AutoLlama...'));
    
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Brief pause
    await this.start();
    
    console.log(chalk.green('✅ AutoLlama restarted'));
  }
}

// Create singleton instance
let instance = null;

/**
 * Get or create the service manager instance
 */
function getServiceManager(config) {
  if (!instance) {
    instance = new AutoLlamaServiceManager(config);
  }
  return instance;
}

/**
 * Initialize AutoLlama with smart defaults
 */
async function initializeAutoLlama(config = {}) {
  const manager = getServiceManager(config);
  await manager.initialize();
  return manager;
}

/**
 * Start AutoLlama development environment
 */
async function startDevelopment(config = {}) {
  const manager = getServiceManager({
    deploymentMode: 'local',
    autoMigrate: true,
    autoStart: true,
    ...config
  });
  
  await manager.start();
  return manager;
}

module.exports = {
  AutoLlamaServiceManager,
  getServiceManager,
  initializeAutoLlama,
  startDevelopment
};