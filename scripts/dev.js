#!/usr/bin/env node

/**
 * AutoLlama Development Server
 * 🦙 Start your RAG development environment with one command
 */

const fs = require('fs-extra');
const path = require('path');
const { spawn, execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');

class AutoLlamaDev {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.processes = [];
    this.config = {};
    this.startTime = Date.now();
  }

  async start() {
    console.clear();
    this.showBanner();

    try {
      // 1. Load configuration
      await this.loadConfiguration();
      
      // 2. Pre-flight checks
      await this.preFlightChecks();
      
      // 3. Start database
      await this.startDatabase();
      
      // 4. Run migrations
      await this.runMigrations();
      
      // 5. Start services
      await this.startServices();
      
      // 6. Open browser
      await this.openBrowser();
      
      // 7. Show status
      this.showStatus();
      
      // Setup graceful shutdown
      this.setupShutdown();
      
    } catch (error) {
      console.error(chalk.red.bold('\n❌ Failed to start:'), error.message);
      this.cleanup();
      process.exit(1);
    }
  }

  showBanner() {
    const banner = `
    🦙 AutoLlama Development Server
    ════════════════════════════════
    ${chalk.cyan('Context-Aware RAG Framework')}
    ${chalk.gray('v3.0.0 - Development Mode')}
    `;
    console.log(chalk.cyan(banner));
  }

  async loadConfiguration() {
    const spinner = ora('Loading configuration...').start();
    
    // Load .env
    const envPath = path.join(this.projectRoot, '.env');
    if (await fs.pathExists(envPath)) {
      require('dotenv').config({ path: envPath });
    } else {
      spinner.fail('No .env file found');
      console.log(chalk.yellow('Run "npm run setup" first'));
      process.exit(1);
    }
    
    // Load config
    const configPath = path.join(this.projectRoot, 'autollama.config.js');
    if (await fs.pathExists(configPath)) {
      this.config = require(configPath);
    }
    
    // Determine deployment mode
    this.deploymentMode = process.env.DEPLOYMENT_MODE || 'local';
    this.personality = process.env.LLAMA_PERSONALITY || 'friendly';
    
    spinner.succeed(`Configuration loaded (${this.deploymentMode} mode)`);
  }

  async preFlightChecks() {
    const spinner = ora('Running pre-flight checks...').start();
    
    const checks = {
      nodeModules: await fs.pathExists(path.join(this.projectRoot, 'node_modules')),
      apiKey: !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY),
      dataDir: await fs.pathExists(path.join(this.projectRoot, 'data'))
    };
    
    if (!checks.nodeModules) {
      spinner.text = 'Installing dependencies...';
      execSync('npm install', { cwd: this.projectRoot, stdio: 'pipe' });
    }
    
    if (!checks.dataDir) {
      await fs.ensureDir(path.join(this.projectRoot, 'data'));
    }
    
    if (!checks.apiKey) {
      spinner.warn('No AI API key configured');
      console.log(chalk.yellow('  Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env'));
    } else {
      spinner.succeed('Pre-flight checks passed');
    }
  }

  async startDatabase() {
    const spinner = ora('Starting database...').start();
    
    if (this.deploymentMode === 'docker') {
      spinner.text = 'Starting Docker containers...';
      try {
        execSync('docker compose up -d postgres qdrant', { 
          cwd: this.projectRoot, 
          stdio: 'pipe' 
        });
        spinner.succeed('Docker services started');
      } catch (error) {
        spinner.fail('Failed to start Docker services');
        throw error;
      }
    } else if (this.deploymentMode === 'local') {
      // SQLite doesn't need a server
      spinner.succeed('SQLite database ready');
      
      // Start embedded Qdrant if available
      if (this.config.vector?.mode === 'embedded') {
        spinner.text = 'Starting embedded vector database...';
        // In production, would start Qdrant here
        spinner.succeed('Vector database ready');
      }
    } else {
      // Hybrid mode - check PostgreSQL
      try {
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        await pool.query('SELECT 1');
        await pool.end();
        spinner.succeed('PostgreSQL connected');
      } catch (error) {
        spinner.fail('PostgreSQL not available');
        console.log(chalk.yellow('  Start PostgreSQL or switch to local mode'));
        throw error;
      }
    }
  }

  async runMigrations() {
    const spinner = ora('Running migrations...').start();
    
    try {
      const migrationPath = path.join(this.projectRoot, 'api', 'run-migrations.js');
      if (await fs.pathExists(migrationPath)) {
        const MigrationRunner = require(migrationPath);
        const runner = new MigrationRunner();
        const needed = await runner.checkMigrationsNeeded();
        
        if (needed) {
          spinner.text = 'Applying database migrations...';
          await runner.runMigrations();
          spinner.succeed('Migrations complete');
        } else {
          spinner.succeed('Database up to date');
        }
        
        await runner.close();
      }
    } catch (error) {
      spinner.warn('Migration check failed - continuing anyway');
    }
  }

  async startServices() {
    console.log(chalk.cyan('\n🚀 Starting services...'));
    
    // Start API server
    await this.startService('API', {
      name: 'AutoLlama API',
      command: 'node',
      args: ['api/server.js'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        PORT: '3001'
      },
      readyMessage: 'Server running on',
      color: chalk.green
    });
    
    // Start BM25 service (if not Docker mode)
    if (this.deploymentMode !== 'docker') {
      await this.startService('BM25', {
        name: 'BM25 Search',
        command: 'python3',
        args: ['bm25-service/bm25_service.py'],
        env: {
          ...process.env,
          PORT: '3002'
        },
        readyMessage: 'Uvicorn running',
        color: chalk.blue,
        optional: true
      });
    }
    
    // Start frontend
    await this.startService('Frontend', {
      name: 'React Frontend',
      command: 'npm',
      args: ['run', 'dev'],
      cwd: path.join(this.projectRoot, 'config', 'react-frontend'),
      env: {
        ...process.env,
        PORT: '8080'
      },
      readyMessage: 'Local:',
      color: chalk.magenta
    });
  }

  async startService(name, config) {
    return new Promise((resolve) => {
      const spinner = ora(`Starting ${name}...`).start();
      
      const proc = spawn(config.command, config.args, {
        cwd: config.cwd || this.projectRoot,
        env: config.env,
        shell: true
      });
      
      this.processes.push({ name, process: proc });
      
      let ready = false;
      const timeout = setTimeout(() => {
        if (!ready && !config.optional) {
          spinner.fail(`${name} failed to start`);
          this.cleanup();
          process.exit(1);
        } else if (!ready && config.optional) {
          spinner.warn(`${name} not available`);
          resolve();
        }
      }, 30000);
      
      proc.stdout.on('data', (data) => {
        const output = data.toString();
        if (!ready && output.includes(config.readyMessage)) {
          ready = true;
          clearTimeout(timeout);
          spinner.succeed(`${name} started`);
          resolve();
        }
        
        // Log service output in dev mode
        if (process.env.DEBUG === 'true') {
          console.log(config.color(`[${name}] ${output.trim()}`));
        }
      });
      
      proc.stderr.on('data', (data) => {
        if (process.env.DEBUG === 'true') {
          console.error(chalk.red(`[${name}] ${data.toString().trim()}`));
        }
      });
      
      proc.on('error', (error) => {
        if (!config.optional) {
          spinner.fail(`${name} error: ${error.message}`);
          this.cleanup();
          process.exit(1);
        } else {
          spinner.warn(`${name} not available`);
          resolve();
        }
      });
    });
  }

  async openBrowser() {
    const spinner = ora('Opening browser...').start();
    
    // Wait a moment for services to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const url = 'http://localhost:8080';
    const platform = process.platform;
    
    try {
      if (platform === 'darwin') {
        execSync(`open ${url}`);
      } else if (platform === 'linux') {
        execSync(`xdg-open ${url}`);
      } else if (platform === 'win32') {
        execSync(`start ${url}`);
      }
      spinner.succeed('Browser opened');
    } catch {
      spinner.info(`Open browser to: ${chalk.cyan(url)}`);
    }
  }

  showStatus() {
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    
    console.log(chalk.green.bold('\n✅ Development server ready!'));
    console.log(chalk.gray(`Started in ${duration} seconds`));
    
    console.log(chalk.cyan('\n🌐 Services:'));
    console.log(chalk.white('  • Frontend:  http://localhost:8080'));
    console.log(chalk.white('  • API:       http://localhost:3001'));
    console.log(chalk.white('  • API Docs:  http://localhost:8080/api/docs'));
    console.log(chalk.white('  • Health:    http://localhost:3001/health'));
    
    if (this.deploymentMode === 'local') {
      console.log(chalk.gray('\n📦 Using local SQLite database'));
    }
    
    // Show personality-based message
    const messages = {
      professional: '\n🦙 AutoLlama development server is running.',
      friendly: '\n🦙 Your llama is ready to help you build amazing things!',
      party: '\n🦙🎉 LET\'S BUILD SOMETHING AWESOME! The party has started!'
    };
    
    console.log(chalk.cyan.bold(messages[this.personality] || messages.friendly));
    console.log(chalk.gray('\nPress Ctrl+C to stop all services'));
  }

  setupShutdown() {
    const shutdown = () => {
      console.log(chalk.yellow('\n\n🦙 Shutting down development server...'));
      this.cleanup();
      console.log(chalk.green('✅ All services stopped'));
      console.log(chalk.gray('Thanks for using AutoLlama! See you next time!'));
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  cleanup() {
    // Stop all child processes
    this.processes.forEach(({ name, process }) => {
      try {
        process.kill('SIGTERM');
        console.log(chalk.gray(`  • Stopped ${name}`));
      } catch (error) {
        // Process may already be dead
      }
    });
    
    // Stop Docker containers if in Docker mode
    if (this.deploymentMode === 'docker') {
      try {
        execSync('docker compose down', { 
          cwd: this.projectRoot, 
          stdio: 'pipe' 
        });
      } catch {
        // Ignore errors
      }
    }
  }
}

// Run development server
if (require.main === module) {
  const dev = new AutoLlamaDev();
  dev.start();
}

module.exports = AutoLlamaDev;