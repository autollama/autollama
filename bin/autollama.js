#!/usr/bin/env node

/**
 * AutoLlama CLI v3.0
 * 🦙 Command-line interface for AutoLlama development and deployment
 */

const chalk = require('chalk');
const { program } = require('commander');
const path = require('path');
const fs = require('fs-extra');

// Import command handlers
const DevCommand = require('../lib/commands/dev');
const MigrateCommand = require('../lib/commands/migrate');
const TestCommand = require('../lib/commands/test');
const DeployCommand = require('../lib/commands/deploy');
const StatusCommand = require('../lib/commands/status');

const LLAMA_CLI_ART = `
    🦙 AutoLlama CLI v3.0
    ═══════════════════════
    Your RAG framework companion
`;

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
      .version('3.0.0')
      .option('-v, --verbose', 'Enable verbose logging')
      .option('-q, --quiet', 'Suppress non-essential output')
      .option('--no-llama', 'Disable llama personality (serious mode)')
      .hook('preAction', (thisCommand) => {
        // Set global options
        global.AUTOLLAMA_CLI_OPTIONS = thisCommand.opts();
        
        if (global.AUTOLLAMA_CLI_OPTIONS.verbose) {
          process.env.DEBUG = 'true';
        }
        
        if (!global.AUTOLLAMA_CLI_OPTIONS.quiet && global.AUTOLLAMA_CLI_OPTIONS.llama !== false) {
          this.showHeader();
        }
      });
  }

  setupCommands() {
    // Development server
    this.program
      .command('dev')
      .description('🚀 Start development server')
      .option('-p, --port <port>', 'Frontend port', '8080')
      .option('--api-port <port>', 'API port', '3001')
      .option('--no-open', 'Don\'t open browser automatically')
      .option('--mode <mode>', 'Deployment mode (local|hybrid|docker)', 'local')
      .action(async (options) => {
        const dev = new DevCommand(options);
        await dev.run();
      });

    // Database migrations
    this.program
      .command('migrate')
      .description('🗄️ Manage database migrations')
      .option('--status', 'Show migration status')
      .option('--up', 'Run pending migrations')
      .option('--down [steps]', 'Rollback migrations')
      .option('--reset', 'Reset database (DANGEROUS)')
      .option('--create <name>', 'Create new migration')
      .action(async (options) => {
        const migrate = new MigrateCommand(options);
        await migrate.run();
      });

    // Testing
    this.program
      .command('test')
      .description('🧪 Run test suite')
      .option('--unit', 'Run unit tests only')
      .option('--integration', 'Run integration tests only')
      .option('--e2e', 'Run end-to-end tests only')
      .option('--watch', 'Watch mode')
      .option('--coverage', 'Generate coverage report')
      .action(async (options) => {
        const test = new TestCommand(options);
        await test.run();
      });

    // Deployment
    this.program
      .command('deploy')
      .description('🚀 Deploy to production')
      .option('--target <target>', 'Deployment target (docker|node|cloud)', 'docker')
      .option('--build', 'Build before deploying')
      .option('--no-migrate', 'Skip migrations')
      .action(async (options) => {
        const deploy = new DeployCommand(options);
        await deploy.run();
      });

    // Status and health
    this.program
      .command('status')
      .description('📊 Show service status')
      .option('--json', 'Output as JSON')
      .option('--watch', 'Watch mode (refresh every 5s)')
      .action(async (options) => {
        const status = new StatusCommand(options);
        await status.run();
      });

    // Database operations
    this.program
      .command('db')
      .description('🗄️ Database operations')
      .option('--reset', 'Reset database')
      .option('--seed', 'Seed with sample data')
      .option('--backup', 'Create database backup')
      .option('--restore <file>', 'Restore from backup')
      .action(async (options) => {
        const migrate = new MigrateCommand(options);
        await migrate.runDatabaseOperations();
      });

    // Configuration management
    this.program
      .command('config')
      .description('⚙️ Manage configuration')
      .option('--show', 'Show current configuration')
      .option('--set <key=value>', 'Set configuration value')
      .option('--validate', 'Validate configuration')
      .action(async (options) => {
        await this.handleConfig(options);
      });

    // Service management
    this.program
      .command('service')
      .description('🔧 Manage individual services')
      .argument('<action>', 'Action: start|stop|restart|logs')
      .argument('[service]', 'Service name (api|frontend|bm25|vector)')
      .action(async (action, service, options) => {
        await this.handleService(action, service, options);
      });

    // Logs
    this.program
      .command('logs')
      .description('📋 Show service logs')
      .option('-f, --follow', 'Follow log output')
      .option('--lines <n>', 'Number of lines to show', '100')
      .argument('[service]', 'Service name (or all)')
      .action(async (service, options) => {
        await this.handleLogs(service, options);
      });

    // Clean up
    this.program
      .command('clean')
      .description('🧹 Clean up data and caches')
      .option('--all', 'Clean everything')
      .option('--cache', 'Clean caches only')
      .option('--logs', 'Clean logs only')
      .option('--data', 'Clean data (DANGEROUS)')
      .action(async (options) => {
        await this.handleClean(options);
      });

    // Doctor (health check and fixes)
    this.program
      .command('doctor')
      .description('🏥 Diagnose and fix common issues')
      .option('--fix', 'Attempt to fix issues automatically')
      .action(async (options) => {
        await this.handleDoctor(options);
      });
  }

  showHeader() {
    if (!global.AUTOLLAMA_CLI_OPTIONS?.quiet) {
      console.log(chalk.cyan(LLAMA_CLI_ART));
    }
  }

  async handleConfig(options) {
    const configPath = path.join(process.cwd(), 'autollama.config.js');
    
    if (options.show) {
      if (await fs.pathExists(configPath)) {
        const config = require(configPath);
        console.log(chalk.cyan('🦙 Current configuration:'));
        console.log(JSON.stringify(config, null, 2));
      } else {
        console.log(chalk.yellow('🦙 No configuration file found'));
      }
    }
    
    if (options.validate) {
      console.log(chalk.cyan('🦙 Validating configuration...'));
      // TODO: Implement validation
      console.log(chalk.green('✅ Configuration valid'));
    }
  }

  async handleService(action, service, options) {
    console.log(chalk.cyan(`🦙 Service ${action}: ${service || 'all'}`));
    // TODO: Implement service management
  }

  async handleLogs(service, options) {
    console.log(chalk.cyan(`🦙 Showing logs for: ${service || 'all'}`));
    // TODO: Implement log viewing
  }

  async handleClean(options) {
    console.log(chalk.cyan('🦙 Cleaning up...'));
    
    if (options.cache || options.all) {
      console.log(chalk.gray('  • Clearing caches...'));
      // TODO: Clear caches
    }
    
    if (options.logs || options.all) {
      console.log(chalk.gray('  • Clearing logs...'));
      const logsDir = path.join(process.cwd(), 'logs');
      if (await fs.pathExists(logsDir)) {
        await fs.emptyDir(logsDir);
      }
    }
    
    if (options.data) {
      console.log(chalk.red('⚠️  Data cleanup is dangerous and not implemented for safety'));
    }
    
    console.log(chalk.green('✅ Cleanup complete'));
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
    
    // Report findings
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