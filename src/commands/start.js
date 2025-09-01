/**
 * AutoLlama Start Command
 * Intelligent service startup based on project configuration
 */

const fs = require('fs-extra');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { header, logger, colors, celebration, errorBlock } = require('../utils/brand');
const { isAutoLlamaProject, isPortInUse } = require('../utils/system');

class StartCommand {
  constructor(options = {}) {
    this.options = {
      port: options.port || process.env.PORT || '8080',
      detached: options.detached || false,
      mode: options.mode || null, // Will be detected from config
      verbose: options.verbose || false,
      ...options
    };
    
    this.config = null;
    this.processes = [];
    this.startTime = Date.now();
  }

  async run() {
    try {
      // Check if we're in an AutoLlama project
      await this.validateProject();
      
      // Load project configuration
      await this.loadConfiguration();
      
      // Pre-flight checks
      await this.preFlightChecks();
      
      // Start services based on deployment mode
      await this.startServices();
      
      // Show success message and instructions
      this.showSuccess();
      
      // Setup signal handlers for graceful shutdown
      if (!this.options.detached) {
        this.setupGracefulShutdown();
        this.keepAlive();
      }
      
    } catch (error) {
      await this.handleError(error);
    }
  }

  async validateProject() {
    const projectCheck = await isAutoLlamaProject();
    
    if (!projectCheck.isProject) {
      throw new Error(
        'Not in an AutoLlama project directory.\n' +
        'Missing required files: ' + projectCheck.files.filter(f => !f.exists).map(f => f.file).join(', ') + '\n' +
        'Run "autollama init" to create a new project.'
      );
    }
    
    logger.dim('Project validation passed');
  }

  async loadConfiguration() {
    // Load from autollama.config.js if it exists
    const configPath = path.join(process.cwd(), 'autollama.config.js');
    if (await fs.pathExists(configPath)) {
      try {
        this.config = require(configPath);
        logger.dim(`Loaded configuration: ${this.config.deployment} mode`);
      } catch (error) {
        logger.warning('Failed to load autollama.config.js, using defaults');
      }
    }
    
    // Load from .env file
    const envPath = path.join(process.cwd(), '.env');
    if (await fs.pathExists(envPath)) {
      const envContent = await fs.readFile(envPath, 'utf8');
      const envVars = {};
      
      envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && !key.startsWith('#')) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      });
      
      // Merge env vars into config
      this.config = {
        deployment: envVars.DEPLOYMENT_MODE || 'local',
        database: envVars.DATABASE_TYPE || 'sqlite',
        port: parseInt(envVars.PORT || '8080'),
        openaiApiKey: envVars.OPENAI_API_KEY,
        ...this.config
      };
    }
    
    // Apply command line overrides
    if (this.options.mode) {
      this.config.deployment = this.options.mode;
    }
    if (this.options.port) {
      this.config.port = parseInt(this.options.port);
    }
    
    // Set defaults if no config found
    if (!this.config) {
      this.config = {
        deployment: 'local',
        database: 'sqlite',
        port: parseInt(this.options.port)
      };
    }
  }

  async preFlightChecks() {
    logger.step('Running pre-flight checks...');
    
    // Check if port is available
    const portInUse = await isPortInUse(this.config.port);
    if (portInUse) {
      throw new Error(`Port ${this.config.port} is already in use. Use --port to specify a different port.`);
    }
    
    // Check API key
    if (!this.config.openaiApiKey) {
      logger.warning('No OpenAI API key found in .env file');
      logger.info('Add OPENAI_API_KEY=sk-... to your .env file');
    }
    
    // Check deployment-specific requirements
    if (this.config.deployment === 'docker' || this.config.deployment === 'hybrid') {
      try {
        execSync('docker info', { stdio: 'ignore' });
      } catch {
        throw new Error('Docker is required for this deployment mode but is not running');
      }
    }
    
    // Check if dependencies are installed
    const nodeModulesPath = path.join(process.cwd(), 'node_modules');
    if (!await fs.pathExists(nodeModulesPath)) {
      throw new Error('Dependencies not installed. Run "npm install" first.');
    }
    
    logger.success('Pre-flight checks passed');
  }

  async startServices() {
    const mode = this.config.deployment;
    
    logger.step(`Starting AutoLlama in ${mode} mode...`);
    
    switch (mode) {
      case 'local':
        await this.startLocalMode();
        break;
      case 'docker':
        await this.startDockerMode();
        break;
      case 'hybrid':
        await this.startHybridMode();
        break;
      default:
        throw new Error(`Unknown deployment mode: ${mode}`);
    }
  }

  async startLocalMode() {
    logger.info('Starting in local development mode...');
    
    // Start the application using the existing dev script
    const child = spawn('npm', ['run', 'dev'], {
      stdio: this.options.detached ? 'ignore' : 'pipe',
      detached: this.options.detached,
      env: {
        ...process.env,
        PORT: this.config.port.toString(),
        NODE_ENV: 'development'
      }
    });
    
    if (this.options.detached) {
      child.unref();
      logger.success('AutoLlama started in background');
    } else {
      this.processes.push(child);
      this.setupProcessHandling(child, 'Application');
    }
  }

  async startDockerMode() {
    logger.info('Starting Docker containers...');
    
    // Start all services with docker-compose
    const child = spawn('docker', ['compose', 'up'], {
      stdio: this.options.detached ? 'ignore' : 'pipe',
      detached: this.options.detached
    });
    
    if (this.options.detached) {
      child.unref();
      logger.success('Docker containers started in background');
    } else {
      this.processes.push(child);
      this.setupProcessHandling(child, 'Docker Services');
    }
    
    // Wait a moment for containers to start
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  async startHybridMode() {
    logger.info('Starting hybrid mode (database in Docker, app locally)...');
    
    // Start database containers
    const dbChild = spawn('docker', ['compose', 'up', '-d', 'postgres', 'qdrant'], {
      stdio: 'pipe'
    });
    
    await new Promise((resolve, reject) => {
      dbChild.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Failed to start database containers'));
        }
      });
    });
    
    logger.success('Database containers started');
    
    // Wait for databases to be ready
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Start the application locally
    const appChild = spawn('npm', ['run', 'dev'], {
      stdio: this.options.detached ? 'ignore' : 'pipe',
      detached: this.options.detached,
      env: {
        ...process.env,
        PORT: this.config.port.toString(),
        NODE_ENV: 'production'
      }
    });
    
    if (this.options.detached) {
      appChild.unref();
      logger.success('Application started in background');
    } else {
      this.processes.push(appChild);
      this.setupProcessHandling(appChild, 'Application');
    }
  }

  setupProcessHandling(child, name) {
    if (this.options.verbose) {
      child.stdout?.on('data', (data) => {
        process.stdout.write(colors.dim(`[${name}] ${data}`));
      });
      
      child.stderr?.on('data', (data) => {
        process.stderr.write(colors.warning(`[${name}] ${data}`));
      });
    }
    
    child.on('error', (error) => {
      logger.error(`${name} error: ${error.message}`);
    });
    
    child.on('exit', (code, signal) => {
      if (code !== 0 && signal !== 'SIGTERM') {
        logger.error(`${name} exited with code ${code}`);
      }
    });
  }

  showSuccess() {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    
    celebration(
      '🚀 AutoLlama is running!',
      `Started in ${elapsed}s on port ${this.config.port}`
    );
    
    // Show access URLs
    console.log(colors.bold('Access your AutoLlama instance:'));
    console.log(colors.primary(`  🌐 Web Interface: http://localhost:${this.config.port}`));
    console.log(colors.muted(`  📡 API Endpoint: http://localhost:${this.config.port}/api`));
    
    if (this.config.deployment === 'docker') {
      console.log(colors.muted(`  🐳 Docker Status: docker compose ps`));
    }
    
    if (!this.options.detached) {
      console.log();
      console.log(colors.muted('Press Ctrl+C to stop AutoLlama'));
    } else {
      console.log();
      console.log(colors.info('Running in background. Use "autollama stop" to stop services.'));
    }
    
    console.log();
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\n\nReceived ${signal}. Shutting down gracefully...`);
      
      // Kill all child processes
      for (const child of this.processes) {
        try {
          child.kill('SIGTERM');
        } catch (error) {
          // Process might already be dead
        }
      }
      
      // Wait for processes to exit
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      logger.success('AutoLlama stopped');
      process.exit(0);
    };
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  keepAlive() {
    // Keep the process alive
    setInterval(() => {
      // Check if child processes are still running
      const runningProcesses = this.processes.filter(p => !p.killed);
      if (runningProcesses.length === 0 && this.processes.length > 0) {
        logger.warning('All services stopped unexpectedly');
        process.exit(1);
      }
    }, 5000);
  }

  async handleError(error) {
    const suggestions = [
      'Check that you\'re in an AutoLlama project directory',
      'Ensure all dependencies are installed (npm install)',
      'Verify your .env file is properly configured',
      'Run "autollama doctor" to diagnose issues'
    ];
    
    if (error.message.includes('port')) {
      suggestions.unshift('Use --port to specify a different port');
    }
    
    if (error.message.includes('docker')) {
      suggestions.unshift('Start Docker Desktop or Docker daemon');
    }
    
    errorBlock('Failed to Start', error.message, suggestions);
    process.exit(1);
  }
}

async function runStart(options = {}) {
  const startCommand = new StartCommand(options);
  await startCommand.run();
}

module.exports = { runStart, StartCommand };