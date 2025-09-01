/**
 * AutoLlama Status Command
 * 🦙 Show comprehensive system status and health information
 */

const chalk = require('chalk');
const ora = require('ora');
const { getServiceManager } = require('../services/manager');
const fs = require('fs-extra');

class StatusCommand {
  constructor(options = {}) {
    this.options = options;
    this.refreshInterval = null;
  }

  async run() {
    if (this.options.watch) {
      await this.watchMode();
    } else {
      await this.showStatus();
    }
  }

  async watchMode() {
    console.log(chalk.cyan('🦙 AutoLlama Status Monitor (Press Ctrl+C to exit)\n'));
    
    const refresh = async () => {
      // Clear screen and show status
      if (!this.options.json) {
        console.clear();
        console.log(chalk.cyan('🦙 AutoLlama Status Monitor\n'));
      }
      
      await this.showStatus();
      
      if (!this.options.json) {
        console.log(chalk.gray('\nRefreshing every 5 seconds... Press Ctrl+C to exit'));
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
      console.log(chalk.yellow('\n🦙 Status monitor stopped'));
      process.exit(0);
    });
  }

  async showStatus() {
    try {
      const status = await this.collectStatus();
      
      if (this.options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }
      
      this.displayStatus(status);
      
    } catch (error) {
      if (this.options.json) {
        console.log(JSON.stringify({ error: error.message }, null, 2));
      } else {
        console.error(chalk.red('❌ Failed to collect status:'), error.message);
      }
    }
  }

  async collectStatus() {
    const status = {
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: '3.0.0',
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        deploymentMode: process.env.DEPLOYMENT_MODE || 'unknown'
      },
      configuration: await this.getConfigurationStatus(),
      database: await this.getDatabaseStatus(),
      services: await this.getServicesStatus(),
      health: await this.getHealthStatus(),
      resources: this.getResourceUsage()
    };
    
    return status;
  }

  async getConfigurationStatus() {
    const config = {
      envFile: await fs.pathExists('.env'),
      configFile: await fs.pathExists('autollama.config.js'),
      apiKey: !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY),
      databaseConfigured: !!(process.env.DATABASE_URL || process.env.DATABASE_PATH)
    };
    
    return config;
  }

  async getDatabaseStatus() {
    try {
      const serviceManager = getServiceManager();
      
      if (!serviceManager.isInitialized) {
        return { status: 'not_initialized' };
      }
      
      const db = serviceManager.getDatabase();
      if (!db) {
        return { status: 'not_configured' };
      }
      
      const health = await db.healthCheck();
      const info = await db.getDatabaseInfo();
      
      return {
        status: health.status,
        type: health.type,
        ...info
      };
      
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  async getServicesStatus() {
    try {
      const serviceManager = getServiceManager();
      
      if (!serviceManager.isInitialized) {
        return { status: 'not_initialized' };
      }
      
      const fullStatus = await serviceManager.getStatus();
      return fullStatus.services || {};
      
    } catch (error) {
      return {
        error: error.message
      };
    }
  }

  async getHealthStatus() {
    const healthChecks = [
      { name: 'API', url: `http://localhost:${process.env.PORT || 3001}/health` },
      { name: 'Frontend', url: `http://localhost:${process.env.FRONTEND_PORT || 8080}` },
      { name: 'BM25', url: 'http://localhost:3002/health' },
      { name: 'Qdrant', url: 'http://localhost:6333/health' }
    ];
    
    const results = {};
    
    for (const check of healthChecks) {
      try {
        const axios = require('axios');
        await axios.get(check.url, { timeout: 2000 });
        results[check.name.toLowerCase()] = 'healthy';
      } catch {
        results[check.name.toLowerCase()] = 'unhealthy';
      }
    }
    
    return results;
  }

  getResourceUsage() {
    const memUsage = process.memoryUsage();
    
    return {
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
      },
      cpu: {
        usage: 'N/A' // Would require additional monitoring
      }
    };
  }

  displayStatus(status) {
    // Header
    console.log(chalk.cyan.bold('📊 AutoLlama Status Report'));
    console.log(chalk.gray(`Generated: ${new Date(status.timestamp).toLocaleString()}`));
    console.log(chalk.gray(`Uptime: ${Math.floor(status.uptime / 60)}m ${status.uptime % 60}s\n`));
    
    // Environment
    console.log(chalk.cyan('🖥️  Environment:'));
    console.log(chalk.white(`  Node.js:    ${status.environment.nodeVersion}`));
    console.log(chalk.white(`  Platform:   ${status.environment.platform} (${status.environment.arch})`));
    console.log(chalk.white(`  Mode:       ${status.environment.deploymentMode}`));
    
    // Configuration
    console.log(chalk.cyan('\n⚙️  Configuration:'));
    const cfg = status.configuration;
    console.log(`  .env file:  ${cfg.envFile ? chalk.green('✅') : chalk.red('❌')}`);
    console.log(`  Config:     ${cfg.configFile ? chalk.green('✅') : chalk.gray('○')}`);
    console.log(`  API Key:    ${cfg.apiKey ? chalk.green('✅') : chalk.red('❌')}`);
    console.log(`  Database:   ${cfg.databaseConfigured ? chalk.green('✅') : chalk.red('❌')}`);
    
    // Database
    console.log(chalk.cyan('\n💾 Database:'));
    if (status.database.status === 'healthy') {
      console.log(`  Status:     ${chalk.green('✅ Healthy')}`);
      console.log(`  Type:       ${status.database.type}`);
      if (status.database.version) {
        console.log(`  Version:    ${status.database.version}`);
      }
      if (status.database.size) {
        console.log(`  Size:       ${status.database.size}`);
      }
      if (status.database.tables) {
        console.log(`  Tables:     ${status.database.tables.length}`);
      }
    } else {
      console.log(`  Status:     ${chalk.red('❌ ' + (status.database.status || 'Unknown'))}`);
      if (status.database.error) {
        console.log(`  Error:      ${chalk.red(status.database.error)}`);
      }
    }
    
    // Services
    console.log(chalk.cyan('\n🔧 Services:'));
    if (Object.keys(status.services).length > 0) {
      for (const [name, serviceStatus] of Object.entries(status.services)) {
        const icon = serviceStatus === 'healthy' ? '✅' : 
                    serviceStatus === 'unhealthy' ? '❌' : '○';
        console.log(`  ${name}:${' '.repeat(10 - name.length)}${icon} ${serviceStatus}`);
      }
    } else {
      console.log(chalk.gray('  No services running'));
    }
    
    // Health checks
    console.log(chalk.cyan('\n🏥 Health Checks:'));
    for (const [name, healthStatus] of Object.entries(status.health)) {
      const icon = healthStatus === 'healthy' ? '✅' : '❌';
      const displayName = name.charAt(0).toUpperCase() + name.slice(1);
      console.log(`  ${displayName}:${' '.repeat(10 - displayName.length)}${icon} ${healthStatus}`);
    }
    
    // Resource usage
    console.log(chalk.cyan('\n📈 Resources:'));
    console.log(`  Memory RSS: ${status.resources.memory.rss}`);
    console.log(`  Heap Used:  ${status.resources.memory.heapUsed}`);
    console.log(`  Heap Total: ${status.resources.memory.heapTotal}`);
    
    // Overall status
    const overallHealthy = Object.values(status.health).every(h => h === 'healthy') &&
                          status.database.status === 'healthy' &&
                          status.configuration.apiKey &&
                          status.configuration.databaseConfigured;
    
    console.log(chalk.cyan('\n🎯 Overall Status:'));
    if (overallHealthy) {
      console.log(chalk.green.bold('  ✅ All systems operational!'));
      console.log(chalk.green('  🦙 Your llama is happy and healthy!'));
    } else {
      console.log(chalk.yellow.bold('  ⚠️  Some issues detected'));
      console.log(chalk.yellow('  🦙 Your llama needs some attention'));
      console.log(chalk.gray('\n💡 Run "autollama doctor" for diagnosis and fixes'));
    }
  }
}

module.exports = StatusCommand;