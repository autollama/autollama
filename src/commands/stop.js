/**
 * AutoLlama Stop Command
 * Graceful shutdown of AutoLlama services
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { header, logger, colors, sectionHeader } = require('../utils/brand');
const { isAutoLlamaProject, killProcess } = require('../utils/system');

class StopCommand {
  constructor(options = {}) {
    this.options = {
      force: options.force || false,
      verbose: options.verbose || false,
      timeout: options.timeout || 30000, // 30 seconds
      ...options
    };
    
    this.config = null;
    this.stoppedServices = [];
  }

  async run() {
    try {
      // Validate we're in a project
      await this.validateProject();
      
      // Load configuration to determine deployment mode
      await this.loadConfiguration();
      
      // Stop services based on deployment mode
      await this.stopServices();
      
      // Show summary
      this.showSummary();
      
    } catch (error) {
      await this.handleError(error);
    }
  }

  async validateProject() {
    const projectCheck = await isAutoLlamaProject();
    
    if (!projectCheck.isProject) {
      logger.warning('Not in an AutoLlama project directory');
      logger.info('Will attempt to stop any running AutoLlama processes');
    } else {
      logger.dim('Project validation passed');
    }
  }

  async loadConfiguration() {
    // Try to load config to determine deployment mode
    try {
      const configPath = path.join(process.cwd(), 'autollama.config.js');
      if (await fs.pathExists(configPath)) {
        this.config = require(configPath);
      } else {
        // Try to read from .env
        const envPath = path.join(process.cwd(), '.env');
        if (await fs.pathExists(envPath)) {
          const envContent = await fs.readFile(envPath, 'utf8');
          const deploymentMatch = envContent.match(/DEPLOYMENT_MODE=(.+)/);
          this.config = {
            deployment: deploymentMatch ? deploymentMatch[1] : 'local'
          };
        }
      }
    } catch (error) {
      logger.dim('Could not load configuration, will try all stop methods');
    }
    
    // Default to trying all methods if no config found
    if (!this.config) {
      this.config = { deployment: 'auto' };
    }
  }

  async stopServices() {
    const mode = this.config.deployment;
    
    logger.step(`Stopping AutoLlama services (${mode} mode)...`);
    
    if (mode === 'auto') {
      // Try all methods
      await this.stopAllMethods();
    } else {
      switch (mode) {
        case 'local':
          await this.stopLocalMode();
          break;
        case 'docker':
          await this.stopDockerMode();
          break;
        case 'hybrid':
          await this.stopHybridMode();
          break;
        default:
          await this.stopAllMethods();
      }
    }
  }

  async stopLocalMode() {
    logger.info('Stopping local development processes...');
    
    // Stop Node.js processes
    const nodeProcesses = await this.stopNodeProcesses();
    if (nodeProcesses > 0) {
      this.stoppedServices.push(`${nodeProcesses} Node.js process(es)`);
    }
  }

  async stopDockerMode() {
    logger.info('Stopping Docker containers...');
    
    try {
      // Stop docker-compose services
      execSync('docker compose down', {
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        timeout: this.options.timeout
      });
      
      this.stoppedServices.push('Docker containers');
      logger.success('Docker containers stopped');
      
    } catch (error) {
      if (this.options.force) {
        logger.warning('docker compose down failed, attempting force stop...');
        await this.forceStopDockerContainers();
      } else {
        throw new Error(`Failed to stop Docker containers: ${error.message}`);
      }
    }
  }

  async stopHybridMode() {
    logger.info('Stopping hybrid mode services...');
    
    // Stop Node.js processes first
    const nodeProcesses = await this.stopNodeProcesses();
    if (nodeProcesses > 0) {
      this.stoppedServices.push(`${nodeProcesses} Node.js process(es)`);
    }
    
    // Stop Docker containers
    try {
      execSync('docker compose stop postgres qdrant', {
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        timeout: this.options.timeout
      });
      
      this.stoppedServices.push('Database containers');
      logger.success('Database containers stopped');
      
    } catch (error) {
      logger.warning('Failed to stop database containers gracefully');
      if (this.options.force) {
        await this.forceStopDockerContainers(['postgres', 'qdrant']);
      }
    }
  }

  async stopAllMethods() {
    logger.info('Attempting to stop all AutoLlama services...');
    
    // Stop Node.js processes
    const nodeProcesses = await this.stopNodeProcesses();
    if (nodeProcesses > 0) {
      this.stoppedServices.push(`${nodeProcesses} Node.js process(es)`);
    }
    
    // Try to stop Docker containers
    try {
      execSync('docker compose down', {
        stdio: 'pipe',
        timeout: 10000 // Shorter timeout for auto mode
      });
      this.stoppedServices.push('Docker containers');
    } catch {
      // Silently ignore if no docker-compose.yml or Docker not running
    }
    
    // Stop any other AutoLlama-related processes
    await this.stopGenericProcesses();
  }

  async stopNodeProcesses() {
    const processes = [
      'autollama',
      'npm run dev',
      'npm start',
      'node scripts/dev.js',
      'node scripts/setup.js',
      'node api/server.js'
    ];
    
    let stoppedCount = 0;
    
    for (const processName of processes) {
      try {
        if (await killProcess(processName)) {
          stoppedCount++;
          if (this.options.verbose) {
            logger.dim(`Stopped: ${processName}`);
          }
        }
      } catch (error) {
        // Continue with other processes
      }
    }
    
    return stoppedCount;
  }

  async forceStopDockerContainers(containerNames = null) {
    try {
      let command;
      if (containerNames && containerNames.length > 0) {
        // Stop specific containers
        const containerIds = containerNames.map(name => {
          try {
            return execSync(`docker ps -q --filter "name=${name}"`, { encoding: 'utf8' }).trim();
          } catch {
            return null;
          }
        }).filter(Boolean);
        
        if (containerIds.length > 0) {
          execSync(`docker stop ${containerIds.join(' ')}`, { stdio: 'pipe' });
          execSync(`docker rm ${containerIds.join(' ')}`, { stdio: 'pipe' });
        }
      } else {
        // Stop all AutoLlama-related containers
        const containers = execSync(
          'docker ps -q --filter "label=autollama" --filter "name=autollama"',
          { encoding: 'utf8', stdio: 'pipe' }
        ).trim();
        
        if (containers) {
          execSync(`docker stop ${containers}`, { stdio: 'pipe' });
          execSync(`docker rm ${containers}`, { stdio: 'pipe' });
        }
      }
      
      this.stoppedServices.push('Docker containers (forced)');
      logger.success('Force stopped Docker containers');
      
    } catch (error) {
      logger.warning('Failed to force stop Docker containers');
    }
  }

  async stopGenericProcesses() {
    // Look for any processes that might be AutoLlama related
    try {
      if (process.platform !== 'win32') {
        // Use ps to find AutoLlama processes
        const psOutput = execSync('ps aux | grep -i autollama | grep -v grep', {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        
        const processes = psOutput.trim().split('\n').filter(Boolean);
        
        for (const processLine of processes) {
          const parts = processLine.trim().split(/\s+/);
          const pid = parts[1];
          
          if (pid && /^\d+$/.test(pid)) {
            try {
              process.kill(parseInt(pid), 'SIGTERM');
              logger.dim(`Stopped process PID: ${pid}`);
            } catch {
              // Process might already be dead
            }
          }
        }
      }
    } catch {
      // Ignore errors in generic cleanup
    }
  }

  showSummary() {
    if (this.stoppedServices.length === 0) {
      logger.info('No running AutoLlama services found');
    } else {
      logger.success('Successfully stopped AutoLlama services:');
      this.stoppedServices.forEach(service => {
        console.log(colors.dim(`  • ${service}`));
      });
    }
    
    console.log();
    logger.info('To start AutoLlama again, run: autollama start');
    console.log();
  }

  async handleError(error) {
    const suggestions = [
      'Try using --force to force stop all services',
      'Check if processes are still running with "autollama status"',
      'Manually stop Docker containers with "docker compose down"',
      'Kill processes manually if needed'
    ];
    
    if (error.message.includes('timeout')) {
      suggestions.unshift('Increase timeout with --timeout option');
    }
    
    logger.error('Failed to stop services');
    console.log(colors.error(`Error: ${error.message}`));
    console.log();
    console.log(colors.info('Suggestions:'));
    suggestions.forEach(suggestion => {
      console.log(colors.muted(`  • ${suggestion}`));
    });
    
    process.exit(1);
  }
}

async function runStop(options = {}) {
  sectionHeader('Stopping AutoLlama');
  
  const stopCommand = new StopCommand(options);
  await stopCommand.run();
}

module.exports = { runStop, StopCommand };