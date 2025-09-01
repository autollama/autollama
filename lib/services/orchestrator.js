/**
 * AutoLlama Service Orchestrator
 * 🦙 Manage all services as native Node.js processes or Docker containers
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const ora = require('ora');
const axios = require('axios');

class ServiceOrchestrator {
  constructor(config = {}) {
    this.config = {
      deploymentMode: process.env.DEPLOYMENT_MODE || config.deploymentMode || 'local',
      servicesPath: path.join(__dirname, '..', '..'),
      ...config
    };
    
    this.services = new Map();
    this.healthChecks = new Map();
    this.startupOrder = ['database', 'vector', 'bm25', 'api', 'frontend'];
    this.isShuttingDown = false;
  }

  /**
   * Start all services based on deployment mode
   */
  async startAll() {
    console.log(chalk.cyan.bold('\n🦙 Starting AutoLlama services...'));
    console.log(chalk.gray(`Deployment mode: ${this.config.deploymentMode}\n`));

    try {
      for (const serviceName of this.startupOrder) {
        const serviceConfig = this.getServiceConfig(serviceName);
        if (serviceConfig && serviceConfig.enabled !== false) {
          await this.startService(serviceName, serviceConfig);
        }
      }
      
      console.log(chalk.green.bold('\n✅ All services started successfully!'));
      this.showServiceStatus();
      
      // Setup graceful shutdown
      this.setupShutdownHandlers();
      
      return true;
    } catch (error) {
      console.error(chalk.red.bold('\n❌ Service startup failed:'), error.message);
      await this.stopAll();
      throw error;
    }
  }

  /**
   * Get service configuration based on deployment mode
   */
  getServiceConfig(serviceName) {
    const configs = {
      local: {
        database: {
          type: 'sqlite',
          enabled: true,
          embedded: true,
          path: './data/autollama.db'
        },
        vector: {
          type: 'qdrant-embedded',
          enabled: true,
          port: 6333,
          command: 'npx',
          args: ['qdrant-embedded', '--port', '6333'],
          healthCheck: 'http://localhost:6333/health'
        },
        bm25: {
          type: 'python',
          enabled: true,
          port: 3002,
          command: 'python3',
          args: ['bm25-service/bm25_service.py'],
          cwd: this.config.servicesPath,
          healthCheck: 'http://localhost:3002/health'
        },
        api: {
          type: 'node',
          enabled: true,
          port: 3001,
          command: 'node',
          args: ['api/server.js'],
          cwd: this.config.servicesPath,
          env: {
            NODE_ENV: 'development',
            PORT: '3001',
            DATABASE_TYPE: 'sqlite',
            DATABASE_PATH: './data/autollama.db'
          },
          healthCheck: 'http://localhost:3001/health'
        },
        frontend: {
          type: 'node',
          enabled: true,
          port: 8080,
          command: 'npm',
          args: ['run', 'dev'],
          cwd: path.join(this.config.servicesPath, 'config', 'react-frontend'),
          healthCheck: 'http://localhost:8080'
        }
      },
      hybrid: {
        database: {
          type: 'postgresql',
          enabled: false, // Assumes external PostgreSQL
          connectionString: process.env.DATABASE_URL
        },
        vector: {
          type: 'qdrant',
          enabled: true,
          port: 6333,
          command: 'docker',
          args: ['run', '-d', '--name', 'autollama-qdrant', '-p', '6333:6333', 'qdrant/qdrant'],
          healthCheck: 'http://localhost:6333/health'
        },
        bm25: {
          type: 'python',
          enabled: true,
          port: 3002,
          command: 'python3',
          args: ['bm25-service/bm25_service.py'],
          cwd: this.config.servicesPath,
          healthCheck: 'http://localhost:3002/health'
        },
        api: {
          type: 'node',
          enabled: true,
          port: 3001,
          command: 'node',
          args: ['api/server.js'],
          cwd: this.config.servicesPath,
          env: {
            NODE_ENV: 'production',
            PORT: '3001'
          },
          healthCheck: 'http://localhost:3001/health'
        },
        frontend: {
          type: 'node',
          enabled: true,
          port: 8080,
          command: 'npm',
          args: ['run', 'build'],
          then: {
            command: 'npx',
            args: ['serve', '-s', 'dist', '-p', '8080']
          },
          cwd: path.join(this.config.servicesPath, 'config', 'react-frontend'),
          healthCheck: 'http://localhost:8080'
        }
      },
      docker: {
        // Docker mode - services managed by docker-compose
        all: {
          type: 'docker-compose',
          enabled: true,
          command: 'docker',
          args: ['compose', 'up', '-d'],
          cwd: this.config.servicesPath,
          healthCheck: async () => {
            // Check if containers are running
            const { execSync } = require('child_process');
            try {
              execSync('docker compose ps --services --filter "status=running"');
              return true;
            } catch {
              return false;
            }
          }
        }
      }
    };

    const modeConfig = configs[this.config.deploymentMode];
    return modeConfig ? modeConfig[serviceName] : null;
  }

  /**
   * Start a single service
   */
  async startService(name, config) {
    const spinner = ora(`Starting ${name}...`).start();
    
    try {
      // Handle embedded services
      if (config.embedded) {
        spinner.succeed(`${name} (embedded)`);
        return;
      }

      // Handle Docker Compose
      if (config.type === 'docker-compose') {
        const proc = spawn(config.command, config.args, {
          cwd: config.cwd,
          stdio: 'pipe'
        });
        
        await this.waitForReady(name, config, 30000);
        spinner.succeed(`${name} (Docker Compose)`);
        return;
      }

      // Start the service process
      const env = {
        ...process.env,
        ...config.env
      };

      const proc = spawn(config.command, config.args, {
        cwd: config.cwd || this.config.servicesPath,
        env,
        stdio: 'pipe'
      });

      // Store service info
      this.services.set(name, {
        process: proc,
        config,
        status: 'starting',
        startTime: Date.now()
      });

      // Handle process output
      proc.stdout.on('data', (data) => {
        if (process.env.DEBUG === 'true') {
          console.log(chalk.gray(`[${name}] ${data.toString().trim()}`));
        }
      });

      proc.stderr.on('data', (data) => {
        if (process.env.DEBUG === 'true') {
          console.error(chalk.red(`[${name}] ${data.toString().trim()}`));
        }
      });

      proc.on('error', (error) => {
        console.error(chalk.red(`[${name}] Process error: ${error.message}`));
        this.services.get(name).status = 'error';
      });

      proc.on('exit', (code) => {
        if (!this.isShuttingDown) {
          console.warn(chalk.yellow(`[${name}] Process exited with code ${code}`));
          this.services.get(name).status = 'stopped';
          
          // Attempt restart if not shutting down
          if (config.autoRestart !== false) {
            console.log(chalk.cyan(`Attempting to restart ${name}...`));
            setTimeout(() => this.startService(name, config), 5000);
          }
        }
      });

      // Wait for service to be ready
      await this.waitForReady(name, config, 30000);
      
      const service = this.services.get(name);
      if (service) {
        service.status = 'running';
      }
      
      spinner.succeed(`${name} started on port ${config.port || 'N/A'}`);
      
    } catch (error) {
      spinner.fail(`${name} failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Wait for service to be ready
   */
  async waitForReady(name, config, timeout = 30000) {
    if (!config.healthCheck) {
      // No health check, just wait a bit
      await new Promise(resolve => setTimeout(resolve, 2000));
      return;
    }

    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        if (typeof config.healthCheck === 'function') {
          const healthy = await config.healthCheck();
          if (healthy) return;
        } else {
          // HTTP health check
          await axios.get(config.healthCheck, { timeout: 1000 });
          return;
        }
      } catch (error) {
        // Service not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Service ${name} failed to start within ${timeout}ms`);
  }

  /**
   * Stop all services
   */
  async stopAll() {
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    console.log(chalk.yellow('\n🦙 Stopping AutoLlama services...'));
    
    // Stop in reverse order
    const reverseOrder = [...this.startupOrder].reverse();
    
    for (const serviceName of reverseOrder) {
      await this.stopService(serviceName);
    }
    
    // Stop Docker if in Docker mode
    if (this.config.deploymentMode === 'docker') {
      try {
        const { execSync } = require('child_process');
        execSync('docker compose down', { 
          cwd: this.config.servicesPath, 
          stdio: 'pipe' 
        });
      } catch (error) {
        console.warn(chalk.yellow('Failed to stop Docker containers'));
      }
    }
    
    console.log(chalk.green('✅ All services stopped'));
  }

  /**
   * Stop a single service
   */
  async stopService(name) {
    const service = this.services.get(name);
    
    if (!service || !service.process) {
      return;
    }
    
    try {
      console.log(chalk.gray(`  • Stopping ${name}...`));
      
      // Send SIGTERM for graceful shutdown
      service.process.kill('SIGTERM');
      service.status = 'stopping';
      
      // Wait for process to exit
      await new Promise((resolve) => {
        let timeout = setTimeout(() => {
          // Force kill if not stopped after 5 seconds
          service.process.kill('SIGKILL');
          resolve();
        }, 5000);
        
        service.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      
      service.status = 'stopped';
      this.services.delete(name);
      
    } catch (error) {
      console.error(chalk.red(`Failed to stop ${name}: ${error.message}`));
    }
  }

  /**
   * Restart a service
   */
  async restartService(name) {
    console.log(chalk.cyan(`🔄 Restarting ${name}...`));
    
    await this.stopService(name);
    
    const config = this.getServiceConfig(name);
    if (config) {
      await this.startService(name, config);
    }
  }

  /**
   * Get service status
   */
  getServiceStatus(name) {
    const service = this.services.get(name);
    
    if (!service) {
      return { status: 'not_started' };
    }
    
    return {
      status: service.status,
      uptime: Date.now() - service.startTime,
      pid: service.process?.pid
    };
  }

  /**
   * Show status of all services
   */
  showServiceStatus() {
    console.log(chalk.cyan('\n📊 Service Status:'));
    
    for (const name of this.startupOrder) {
      const status = this.getServiceStatus(name);
      const config = this.getServiceConfig(name);
      
      if (!config || config.enabled === false) {
        continue;
      }
      
      const statusIcon = status.status === 'running' ? '✅' : 
                        status.status === 'starting' ? '🔄' : 
                        status.status === 'error' ? '❌' : '⭕';
      
      let info = `  ${statusIcon} ${name}: ${status.status}`;
      
      if (status.pid) {
        info += ` (PID: ${status.pid})`;
      }
      
      if (config.port) {
        info += ` - Port: ${config.port}`;
      }
      
      console.log(info);
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupShutdownHandlers() {
    const shutdown = async () => {
      console.log(chalk.yellow('\n\n🦙 Graceful shutdown initiated...'));
      await this.stopAll();
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error(chalk.red('Uncaught exception:'), error);
      shutdown();
    });
    
    process.on('unhandledRejection', (error) => {
      console.error(chalk.red('Unhandled rejection:'), error);
      shutdown();
    });
  }

  /**
   * Health check for all services
   */
  async healthCheckAll() {
    const results = {};
    
    for (const [name, service] of this.services) {
      if (service.config.healthCheck) {
        try {
          if (typeof service.config.healthCheck === 'function') {
            results[name] = await service.config.healthCheck();
          } else {
            await axios.get(service.config.healthCheck, { timeout: 2000 });
            results[name] = 'healthy';
          }
        } catch (error) {
          results[name] = 'unhealthy';
        }
      } else {
        results[name] = service.status === 'running' ? 'healthy' : 'unhealthy';
      }
    }
    
    return results;
  }
}

module.exports = ServiceOrchestrator;