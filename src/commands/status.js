/**
 * Enhanced AutoLlama Status Command
 * Professional service status with tables and monitoring
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { header, logger, createTable, colors, sectionHeader } = require('../utils/brand');
const { isAutoLlamaProject, isPortInUse } = require('../utils/system');

class StatusCommand {
  constructor(options = {}) {
    this.options = {
      json: options.json || false,
      watch: options.watch || false,
      verbose: options.verbose || false,
      ...options
    };
    
    this.config = null;
    this.refreshInterval = null;
  }

  async run() {
    if (!this.options.json && !this.options.watch) {
      header('0.0.6');
      sectionHeader('System Status');
    }
    
    if (this.options.watch) {
      await this.watchMode();
    } else {
      await this.showStatus();
    }
  }

  async watchMode() {
    if (!this.options.json) {
      console.log(colors.primary('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(colors.bold('  AutoLlama Status Monitor'));
      console.log(colors.muted('  Press Ctrl+C to exit'));
      console.log(colors.primary('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log();
    }
    
    const refresh = async () => {
      if (!this.options.json) {
        // Move cursor to top and clear screen content
        process.stdout.write('\x1b[2J\x1b[H');
        console.log(colors.primary('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(colors.bold(`  AutoLlama Status Monitor - ${new Date().toLocaleTimeString()}`));
        console.log(colors.primary('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log();
      }
      
      await this.showStatus();
      
      if (!this.options.json) {
        console.log();
        console.log(colors.muted('Refreshing every 5 seconds... Press Ctrl+C to exit'));
      }
    };
    
    // Initial display
    await refresh();
    
    // Set up refresh interval
    this.refreshInterval = setInterval(refresh, 5000);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }
      console.log('\n\nStatus monitor stopped.');
      process.exit(0);
    });
  }

  async showStatus() {
    try {
      // Load configuration
      await this.loadConfiguration();
      
      // Gather all status information
      const statusInfo = await this.gatherStatusInfo();
      
      if (this.options.json) {
        console.log(JSON.stringify(statusInfo, null, 2));
      } else {
        this.displayStatus(statusInfo);
      }
      
    } catch (error) {
      if (this.options.json) {
        console.log(JSON.stringify({ error: error.message }, null, 2));
      } else {
        logger.error(`Failed to get status: ${error.message}`);
      }
    }
  }

  async loadConfiguration() {
    // Load project configuration
    try {
      const configPath = path.join(process.cwd(), 'autollama.config.js');
      if (await fs.pathExists(configPath)) {
        delete require.cache[require.resolve(configPath)];
        this.config = require(configPath);
      }
    } catch {
      // Ignore config loading errors
    }
    
    // Load from .env if config not available
    if (!this.config) {
      try {
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
          
          this.config = {
            deployment: envVars.DEPLOYMENT_MODE || 'local',
            database: envVars.DATABASE_TYPE || 'sqlite',
            port: parseInt(envVars.PORT || '8080')
          };
        }
      } catch {
        // Use defaults if .env loading fails
      }
    }
    
    // Final defaults
    if (!this.config) {
      this.config = {
        deployment: 'unknown',
        database: 'unknown', 
        port: 8080
      };
    }
  }

  async gatherStatusInfo() {
    const projectCheck = await isAutoLlamaProject();
    
    const statusInfo = {
      timestamp: new Date().toISOString(),
      project: {
        isAutoLlamaProject: projectCheck.isProject,
        directory: process.cwd(),
        config: this.config
      },
      services: await this.checkServices(),
      system: await this.getSystemInfo(),
      health: await this.checkHealth()
    };
    
    return statusInfo;
  }

  async checkServices() {
    const services = [];
    
    // Check main application
    const appStatus = await this.checkApplicationStatus();
    services.push({
      name: 'AutoLlama App',
      type: 'application',
      status: appStatus.running ? 'running' : 'stopped',
      port: appStatus.port,
      pid: appStatus.pid,
      uptime: appStatus.uptime
    });
    
    // Check Docker containers if deployment mode is docker/hybrid
    if (this.config.deployment === 'docker' || this.config.deployment === 'hybrid') {
      const dockerServices = await this.checkDockerServices();
      services.push(...dockerServices);
    }
    
    return services;
  }

  async checkApplicationStatus() {
    try {
      const port = this.config.port || 8080;
      const portInUse = await isPortInUse(port);
      
      if (portInUse) {
        // Try to get process info
        let pid = null;
        let uptime = null;
        
        try {
          if (process.platform !== 'win32') {
            const lsofOutput = execSync(`lsof -ti :${port}`, { encoding: 'utf8' });
            pid = lsofOutput.trim();
            
            if (pid) {
              const psOutput = execSync(`ps -o etime= -p ${pid}`, { encoding: 'utf8' });
              uptime = psOutput.trim();
            }
          }
        } catch {
          // Ignore errors getting process info
        }
        
        return {
          running: true,
          port,
          pid,
          uptime
        };
      }
      
      return { running: false, port };
      
    } catch {
      return { running: false };
    }
  }

  async checkDockerServices() {
    const services = [];
    
    try {
      // Get Docker container status
      const output = execSync('docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"', {
        encoding: 'utf8'
      });
      
      const lines = output.trim().split('\n').slice(1); // Skip header
      
      for (const line of lines) {
        const [name, status, ports] = line.split('\t');
        
        // Only include AutoLlama-related containers
        if (name.includes('autollama') || 
            name.includes('postgres') || 
            name.includes('qdrant') || 
            name.includes('redis')) {
          
          services.push({
            name,
            type: 'docker',
            status: status.includes('Up') ? 'running' : 'stopped',
            ports: ports || '',
            uptime: this.extractUptime(status)
          });
        }
      }
      
    } catch (error) {
      services.push({
        name: 'Docker',
        type: 'docker',
        status: 'unavailable',
        error: 'Docker not available or no containers running'
      });
    }
    
    return services;
  }

  extractUptime(statusString) {
    const match = statusString.match(/Up\s+(.+?)(?:\s+\(|$)/);
    return match ? match[1] : null;
  }

  async getSystemInfo() {
    const os = require('os');
    
    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      memory: {
        total: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
        free: Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10
      },
      cpus: os.cpus().length,
      uptime: Math.floor(os.uptime() / 3600)
    };
  }

  async checkHealth() {
    const health = {
      overall: 'unknown',
      checks: []
    };
    
    try {
      // Check if main application is responsive
      if (this.config.port) {
        try {
          const response = await fetch(`http://localhost:${this.config.port}/api/health`, {
            timeout: 5000
          });
          
          if (response.ok) {
            health.checks.push({ name: 'API Health', status: 'healthy' });
          } else {
            health.checks.push({ name: 'API Health', status: 'unhealthy', error: `HTTP ${response.status}` });
          }
        } catch (error) {
          health.checks.push({ name: 'API Health', status: 'unreachable', error: error.message });
        }
      }
      
      // Determine overall health
      const healthyChecks = health.checks.filter(c => c.status === 'healthy').length;
      const totalChecks = health.checks.length;
      
      if (totalChecks === 0) {
        health.overall = 'unknown';
      } else if (healthyChecks === totalChecks) {
        health.overall = 'healthy';
      } else if (healthyChecks > 0) {
        health.overall = 'degraded';
      } else {
        health.overall = 'unhealthy';
      }
      
    } catch (error) {
      health.checks.push({ name: 'Health Check', status: 'error', error: error.message });
      health.overall = 'error';
    }
    
    return health;
  }

  displayStatus(statusInfo) {
    // Project Information
    logger.info('Project Information:');
    console.log(colors.muted(`  Directory: ${statusInfo.project.directory}`));
    console.log(colors.muted(`  AutoLlama Project: ${statusInfo.project.isAutoLlamaProject ? 'Yes' : 'No'}`));
    console.log(colors.muted(`  Deployment Mode: ${statusInfo.project.config.deployment}`));
    console.log(colors.muted(`  Database: ${statusInfo.project.config.database}`));
    console.log();
    
    // Services Status Table
    const serviceRows = statusInfo.services.map(service => [
      service.name,
      this.formatServiceStatus(service.status),
      service.port || service.ports || '-',
      service.uptime || '-'
    ]);
    
    console.log(createTable(
      ['Service', 'Status', 'Port(s)', 'Uptime'],
      serviceRows
    ));
    console.log();
    
    // Health Status
    logger.info('Health Status:');
    console.log(colors.muted(`  Overall: ${this.formatHealthStatus(statusInfo.health.overall)}`));
    
    if (statusInfo.health.checks.length > 0) {
      statusInfo.health.checks.forEach(check => {
        const status = check.status === 'healthy' ? colors.success('✓') :
                     check.status === 'unhealthy' ? colors.error('✗') :
                     colors.warning('⚠');
        console.log(colors.muted(`  ${status} ${check.name}: ${check.status}${check.error ? ` (${check.error})` : ''}`));
      });
    }
    console.log();
    
    // System Information
    if (this.options.verbose) {
      logger.info('System Information:');
      console.log(colors.muted(`  Platform: ${statusInfo.system.platform} (${statusInfo.system.arch})`));
      console.log(colors.muted(`  Node.js: ${statusInfo.system.nodeVersion}`));
      console.log(colors.muted(`  Memory: ${statusInfo.system.memory.free}GB free / ${statusInfo.system.memory.total}GB total`));
      console.log(colors.muted(`  CPUs: ${statusInfo.system.cpus} cores`));
      console.log(colors.muted(`  System Uptime: ${statusInfo.system.uptime} hours`));
      console.log();
    }
  }

  formatServiceStatus(status) {
    switch (status) {
      case 'running': return colors.success('✓ Running');
      case 'stopped': return colors.error('✗ Stopped');
      case 'unavailable': return colors.muted('- Unavailable');
      default: return colors.warning('? Unknown');
    }
  }

  formatHealthStatus(status) {
    switch (status) {
      case 'healthy': return colors.success('Healthy');
      case 'degraded': return colors.warning('Degraded');
      case 'unhealthy': return colors.error('Unhealthy');
      case 'error': return colors.error('Error');
      default: return colors.muted('Unknown');
    }
  }
}

async function runStatus(options = {}) {
  const statusCommand = new StatusCommand(options);
  await statusCommand.run();
}

module.exports = { runStatus, StatusCommand };