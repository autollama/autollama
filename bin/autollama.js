#!/usr/bin/env node

/**
 * AutoLlama CLI v3.0.1
 * 🦙 Professional command-line interface for AutoLlama setup and management
 */

const chalk = require('chalk');
const { program } = require('commander');
const path = require('path');
const fs = require('fs-extra');

class AutoLlamaCLI {
  constructor() {
    this.program = program;
    this.setupGlobalOptions();
    this.setupCommands();
  }

  setupGlobalOptions() {
    this.program
      .name('autollama')
      .description('🦙 AutoLlama - Modern JavaScript-first RAG framework')
      .version('3.0.1')
      .option('-v, --verbose', 'Enable verbose logging')
      .option('-q, --quiet', 'Suppress non-essential output')
      .option('--no-color', 'Disable colored output')
      .hook('preAction', (thisCommand) => {
        // Set global options
        global.AUTOLLAMA_CLI_OPTIONS = thisCommand.opts();
        
        if (global.AUTOLLAMA_CLI_OPTIONS.verbose) {
          process.env.DEBUG = 'true';
        }
        
        if (!global.AUTOLLAMA_CLI_OPTIONS.quiet && !global.AUTOLLAMA_CLI_OPTIONS.noColor) {
          this.showHeader();
        }
      });
  }

  setupCommands() {
    // Initialize new project - Primary command
    this.program
      .command('init [project-name]')
      .description('🎯 Initialize new AutoLlama project with guided setup')
      .option('--verbose', 'Show detailed output')
      .option('--no-color', 'Disable colored output')
      .option('--resume', 'Resume interrupted setup')
      .option('--config <file>', 'Use configuration file')
      .action(async (projectName, options) => {
        try {
          const { runInit } = require('../src/commands/init');
          await runInit(projectName, options);
        } catch (error) {
          console.error(chalk.red('Error loading init command:'), error.message);
          if (options.verbose) console.error(error.stack);
          process.exit(1);
        }
      });

    // Start services - Primary command
    this.program
      .command('start')
      .description('🚀 Start AutoLlama services')
      .option('-p, --port <port>', 'Port to run on', '8080')
      .option('-d, --detached', 'Run in background')
      .option('--mode <mode>', 'Deployment mode (local|hybrid|docker)')
      .option('--verbose', 'Show detailed output')
      .action(async (options) => {
        try {
          const { runStart } = require('../src/commands/start');
          await runStart(options);
        } catch (error) {
          console.error(chalk.red('Error loading start command:'), error.message);
          if (options.verbose) console.error(error.stack);
          process.exit(1);
        }
      });

    // Stop services - Primary command  
    this.program
      .command('stop')
      .description('🛑 Stop AutoLlama services gracefully')
      .option('--force', 'Force stop all services')
      .option('--timeout <ms>', 'Timeout in milliseconds', '30000')
      .option('--verbose', 'Show detailed output')
      .action(async (options) => {
        try {
          const { runStop } = require('../src/commands/stop');
          await runStop(options);
        } catch (error) {
          console.error(chalk.red('Error loading stop command:'), error.message);
          if (options.verbose) console.error(error.stack);
          process.exit(1);
        }
      });

    // Status and health - Enhanced command
    this.program
      .command('status')
      .description('📊 Show service status with beautiful tables')
      .option('--json', 'Output as JSON')
      .option('--watch', 'Watch mode (refresh every 5s)')
      .option('--verbose', 'Show detailed system information')
      .action(async (options) => {
        try {
          const { runStatus } = require('../src/commands/status');
          await runStatus(options);
        } catch (error) {
          console.error(chalk.red('Error loading status command:'), error.message);
          if (options.verbose) console.error(error.stack);
          process.exit(1);
        }
      });

    // Docker shortcuts for compatibility
    this.program
      .command('docker:up')
      .description('🐳 Start Docker containers')
      .action(async () => {
        try {
          const { execSync } = require('child_process');
          console.log(chalk.cyan('🐳 Starting Docker containers...'));
          execSync('docker compose up -d', { stdio: 'inherit' });
        } catch (error) {
          console.error(chalk.red('Docker command failed:'), error.message);
          process.exit(1);
        }
      });

    this.program
      .command('docker:down')
      .description('🐳 Stop Docker containers')
      .action(async () => {
        try {
          const { execSync } = require('child_process');
          console.log(chalk.cyan('🐳 Stopping Docker containers...'));
          execSync('docker compose down', { stdio: 'inherit' });
        } catch (error) {
          console.error(chalk.red('Docker command failed:'), error.message);
          process.exit(1);
        }
      });

    // Doctor (health check and fixes)
    this.program
      .command('doctor')
      .description('🏥 Diagnose and fix common issues')
      .option('--fix', 'Attempt to fix issues automatically')
      .option('--verbose', 'Show detailed diagnostics')
      .action(async (options) => {
        await this.handleDoctor(options);
      });
  }

  showHeader() {
    if (!global.AUTOLLAMA_CLI_OPTIONS?.quiet) {
      const headerArt = `
🦙 AutoLlama CLI v3.0.1
═══════════════════════
Professional RAG Framework
      `;
      console.log(chalk.cyan(headerArt));
    }
  }

  async handleDoctor(options) {
    console.log(chalk.cyan('🏥 AutoLlama Doctor - Running diagnostics...'));
    
    const issues = [];
    
    // Check environment
    console.log(chalk.gray('  • Checking Node.js version...'));
    const nodeVersion = process.version;
    if (parseInt(nodeVersion.slice(1)) < 16) {
      issues.push('Node.js version too old (requires 16+)');
    }
    
    // Check configuration
    console.log(chalk.gray('  • Checking configuration...'));
    const envPath = path.join(process.cwd(), '.env');
    if (!await fs.pathExists(envPath)) {
      issues.push('Missing .env file');
    }
    
    // Check dependencies
    console.log(chalk.gray('  • Checking dependencies...'));
    const nodeModulesPath = path.join(process.cwd(), 'node_modules');
    if (!await fs.pathExists(nodeModulesPath)) {
      issues.push('Dependencies not installed');
    }
    
    // Check Docker
    console.log(chalk.gray('  • Checking Docker...'));
    try {
      const { execSync } = require('child_process');
      execSync('docker --version', { stdio: 'ignore' });
      try {
        execSync('docker info', { stdio: 'ignore' });
        console.log(chalk.green('  ✓ Docker is available and running'));
      } catch {
        issues.push('Docker daemon not running');
      }
    } catch {
      issues.push('Docker not installed');
    }
    
    // Report findings
    console.log();
    if (issues.length === 0) {
      console.log(chalk.green('✅ No issues found! Your llama is healthy!'));
    } else {
      console.log(chalk.yellow(`⚠️  Found ${issues.length} issues:`));
      issues.forEach(issue => console.log(chalk.red(`  • ${issue}`)));
      
      if (options.fix) {
        console.log(chalk.cyan('\n🔧 Attempting fixes...'));
        // TODO: Implement automatic fixes
      }
    }
    
    console.log();
    console.log(chalk.cyan('💡 Available commands:'));
    console.log(chalk.gray('  autollama init    - Create new project with guided setup'));
    console.log(chalk.gray('  autollama start   - Start AutoLlama services'));
    console.log(chalk.gray('  autollama status  - Show service status'));
    console.log(chalk.gray('  autollama stop    - Stop services gracefully'));
  }

  run() {
    this.program.parse();
  }
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('\n🦙💔 Unexpected error:'), error.message);
  if (global.AUTOLLAMA_CLI_OPTIONS?.verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});

// Main execution
if (require.main === module) {
  const cli = new AutoLlamaCLI();
  cli.run();
}

module.exports = AutoLlamaCLI;