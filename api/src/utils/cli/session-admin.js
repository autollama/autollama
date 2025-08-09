#!/usr/bin/env node

/**
 * AutoLlama Session Admin CLI Utility
 * Comprehensive session management and cleanup tool
 * 
 * Usage:
 *   node session-admin.js <command> [options]
 * 
 * Commands:
 *   status       - Show session statistics
 *   cleanup      - Clean stuck/timeout sessions
 *   force-cleanup - Force cleanup with minimal validation
 *   monitor      - Real-time session monitoring
 *   stats        - Detailed session statistics
 *   memory       - Memory usage analysis
 * 
 * Examples:
 *   node session-admin.js status
 *   node session-admin.js cleanup --dry-run
 *   node session-admin.js cleanup --max-age 600000 --confirm
 *   node session-admin.js force-cleanup --confirm
 */

const path = require('path');
const readline = require('readline');

// Add the parent directories to require path for module resolution
const apiRoot = path.resolve(__dirname, '../../../');
process.chdir(apiRoot);

const AdminHelpers = require('../admin-helpers');
const SessionCleanupService = require('../../services/session/cleanup.service');
const { DEFAULTS } = require('../constants');

class SessionAdminCLI {
  constructor() {
    this.adminHelpers = new AdminHelpers();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Initialize cleanup service
    this.cleanupService = new SessionCleanupService({
      database: this.adminHelpers.db || this.adminHelpers.dbPool,
      config: {
        sessionCleanupInterval: DEFAULTS.SESSION_CLEANUP_INTERVAL,
        sessionTimeout: DEFAULTS.SESSION_TIMEOUT,
        heartbeatTimeout: DEFAULTS.HEARTBEAT_TIMEOUT
      }
    });
  }

  /**
   * Main CLI entry point
   */
  async run() {
    const args = process.argv.slice(2);
    const command = args[0];
    const options = this.parseArguments(args.slice(1));

    console.log('🦙 AutoLlama Session Admin CLI v2.2');
    console.log('=====================================\n');

    try {
      switch (command) {
        case 'status':
          await this.showStatus();
          break;
        case 'cleanup':
          await this.performCleanup(options);
          break;
        case 'force-cleanup':
          await this.performForceCleanup(options);
          break;
        case 'monitor':
          await this.startMonitoring(options);
          break;
        case 'stats':
          await this.showDetailedStats();
          break;
        case 'memory':
          await this.showMemoryAnalysis();
          break;
        case 'help':
        case '--help':
        case '-h':
          this.showHelp();
          break;
        default:
          console.log('❌ Unknown command:', command);
          this.showHelp();
          process.exit(1);
      }
    } catch (error) {
      console.error('❌ CLI Error:', error.message);
      if (options.verbose) {
        console.error('Stack trace:', error.stack);
      }
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Parse command line arguments
   */
  parseArguments(args) {
    const options = {
      dryRun: false,
      confirm: false,
      verbose: false,
      maxAge: DEFAULTS.SESSION_TIMEOUT,
      includeStuck: true,
      includeTimeout: true,
      force: false,
      interval: 5000
    };

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--dry-run':
          options.dryRun = true;
          break;
        case '--confirm':
          options.confirm = true;
          break;
        case '--verbose':
        case '-v':
          options.verbose = true;
          break;
        case '--max-age':
          options.maxAge = parseInt(args[++i]) || DEFAULTS.SESSION_TIMEOUT;
          break;
        case '--no-stuck':
          options.includeStuck = false;
          break;
        case '--no-timeout':
          options.includeTimeout = false;
          break;
        case '--force':
          options.force = true;
          break;
        case '--interval':
          options.interval = parseInt(args[++i]) || 5000;
          break;
      }
    }

    return options;
  }

  /**
   * Show current session status
   */
  async showStatus() {
    console.log('📊 Session Status Overview');
    console.log('==========================\n');

    const stats = await this.adminHelpers.getSessionStatistics();
    
    // Session breakdown
    console.log('Sessions by Status:');
    stats.sessions.byStatus.forEach(status => {
      const percentage = (status.count / stats.sessions.total * 100).toFixed(1);
      console.log(`  ${status.status.padEnd(12)} ${status.count.toString().padStart(6)} (${percentage}%)`);
    });
    
    console.log(`  ${'TOTAL'.padEnd(12)} ${stats.sessions.total.toString().padStart(6)}`);
    console.log();

    // Stuck sessions warning
    if (stats.sessions.stuck.stuck_count > 0) {
      console.log('⚠️  Stuck Sessions Detected:');
      console.log(`   Count: ${stats.sessions.stuck.stuck_count}`);
      console.log(`   Oldest: ${new Date(stats.sessions.stuck.oldest_stuck).toLocaleString()}`);
      console.log(`   Threshold: ${Math.floor(DEFAULTS.HEARTBEAT_TIMEOUT / 1000)}s without heartbeat`);
      console.log();
    }

    // Background jobs summary
    if (stats.backgroundJobs.total > 0) {
      console.log('Background Jobs:');
      stats.backgroundJobs.byStatus.forEach(job => {
        console.log(`  ${job.status.padEnd(12)} ${job.count.toString().padStart(6)}`);
      });
      console.log();
    }

    // System information
    console.log('System Information:');
    console.log(`  Memory Used: ${stats.system.memoryUsage.heapUsed}`);
    console.log(`  Memory Total: ${stats.system.memoryUsage.heapTotal}`);
    console.log(`  Uptime: ${Math.floor(stats.system.uptime / 3600)}h ${Math.floor((stats.system.uptime % 3600) / 60)}m`);
    console.log(`  Query Time: ${stats.queryDuration}ms`);
  }

  /**
   * Perform safe session cleanup
   */
  async performCleanup(options) {
    console.log('🧹 Session Cleanup Operation');
    console.log('============================\n');

    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    // Show cleanup parameters
    console.log('Cleanup Parameters:');
    console.log(`  Max Age: ${Math.floor(options.maxAge / 1000)}s (${Math.floor(options.maxAge / 60000)}min)`);
    console.log(`  Include Stuck: ${options.includeStuck}`);
    console.log(`  Include Timeout: ${options.includeTimeout}`);
    console.log(`  Force Mode: ${options.force}`);
    console.log();

    // Pre-cleanup validation
    console.log('🔍 Validating cleanup safety...');
    const validation = await this.adminHelpers.validateCleanupSafety();
    
    if (!validation.safe) {
      console.log('⚠️  Safety Issues Detected:');
      validation.issues.forEach(issue => console.log(`   - ${issue}`));
      
      if (!options.force) {
        console.log('\n❌ Cleanup aborted due to safety concerns. Use --force to override.');
        return;
      } else {
        console.log('\n⚠️  Continuing with --force mode...');
      }
    } else {
      console.log('✅ Safety validation passed');
    }
    console.log();

    // Confirmation prompt (unless --confirm or --dry-run)
    if (!options.dryRun && !options.confirm) {
      const confirmed = await this.askConfirmation('Proceed with cleanup?');
      if (!confirmed) {
        console.log('❌ Cleanup cancelled by user');
        return;
      }
    }

    // Perform cleanup
    console.log('🧹 Starting cleanup operation...\n');
    const startTime = Date.now();
    
    const results = await this.adminHelpers.performSafeCleanup({
      dryRun: options.dryRun,
      maxAge: options.maxAge,
      includeStuck: options.includeStuck,
      includeTimeout: options.includeTimeout,
      force: options.force
    });

    // Display results
    console.log('📋 Cleanup Results:');
    console.log(`  Stuck Sessions Cleaned: ${results.stuckSessionsCleaned}`);
    console.log(`  Timeout Sessions Cleaned: ${results.timeoutSessionsCleaned}`);
    console.log(`  Total Sessions Cleaned: ${results.totalCleaned}`);
    console.log(`  Duration: ${results.duration}ms`);
    console.log();

    if (results.sessionsUpdated.length > 0 && options.verbose) {
      console.log('📝 Cleaned Sessions Details:');
      results.sessionsUpdated.slice(0, 10).forEach(session => {
        console.log(`  ${session.sessionId.substring(0, 8)}... (${session.reason}) - Age: ${Math.floor(session.age / 60000)}min`);
      });
      if (results.sessionsUpdated.length > 10) {
        console.log(`  ... and ${results.sessionsUpdated.length - 10} more`);
      }
      console.log();
    }

    if (results.totalCleaned > 0) {
      console.log('✅ Cleanup completed successfully');
    } else {
      console.log('ℹ️  No sessions required cleanup');
    }
  }

  /**
   * Perform force cleanup with minimal validation
   */
  async performForceCleanup(options) {
    console.log('💥 Force Cleanup Operation');
    console.log('==========================\n');
    console.log('⚠️  WARNING: Force cleanup bypasses safety checks!');
    console.log();

    if (!options.confirm) {
      const confirmed = await this.askConfirmation('Are you sure you want to force cleanup?');
      if (!confirmed) {
        console.log('❌ Force cleanup cancelled');
        return;
      }
    }

    // Use the existing cleanup service directly
    console.log('🧹 Performing advanced cleanup...');
    const results = await this.cleanupService.advancedSessionCleanup({
      enableHealthCheck: true,
      enableOrphanCleanup: true,
      enableMemoryCleanup: true
    });

    console.log('📋 Force Cleanup Results:');
    console.log(`  Sessions Cleaned: ${results.sessions_cleaned}`);
    console.log(`  Chunks Recovered: ${results.chunks_recovered}`);
    console.log(`  Memory Freed: ${results.memory_freed}`);
    console.log();

    if (results.sessions_cleaned > 0) {
      console.log('✅ Force cleanup completed');
    } else {
      console.log('ℹ️  No sessions required cleanup');
    }
  }

  /**
   * Start real-time session monitoring
   */
  async startMonitoring(options) {
    console.log('📺 Session Monitoring (Press Ctrl+C to stop)');
    console.log('==============================================\n');

    let iteration = 0;
    const monitor = setInterval(async () => {
      try {
        process.stdout.write('\x1B[2J\x1B[0f'); // Clear screen
        
        console.log(`🦙 AutoLlama Session Monitor - Update #${++iteration}`);
        console.log(`Time: ${new Date().toLocaleString()}`);
        console.log('='.repeat(60));
        console.log();

        const stats = await this.adminHelpers.getSessionStatistics();
        
        // Quick status overview
        console.log('📊 Quick Status:');
        const processing = stats.sessions.byStatus.find(s => s.status === 'processing')?.count || 0;
        const stuck = stats.sessions.stuck.stuck_count || 0;
        const failed = stats.sessions.byStatus.find(s => s.status === 'failed')?.count || 0;
        
        console.log(`  Processing: ${processing}  |  Stuck: ${stuck}  |  Failed: ${failed}  |  Total: ${stats.sessions.total}`);
        console.log();

        // Background jobs status
        if (stats.backgroundJobs.total > 0) {
          const queued = stats.backgroundJobs.byStatus.find(j => j.status === 'queued')?.count || 0;
          const jobProcessing = stats.backgroundJobs.byStatus.find(j => j.status === 'processing')?.count || 0;
          console.log(`🔄 Background Jobs: Queued: ${queued}  |  Processing: ${jobProcessing}`);
          console.log();
        }

        // System metrics
        console.log(`💾 Memory: ${stats.system.memoryUsage.heapUsed} / ${stats.system.memoryUsage.heapTotal}`);
        console.log(`⏱️  Query Time: ${stats.queryDuration}ms`);
        
        // Warnings
        if (stuck > 0) {
          console.log(`\n⚠️  ${stuck} stuck sessions detected (>90s without heartbeat)`);
        }
        
        console.log('\nPress Ctrl+C to stop monitoring');
        
      } catch (error) {
        console.error('Monitor error:', error.message);
      }
    }, options.interval);

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      clearInterval(monitor);
      console.log('\n\n👋 Monitoring stopped');
      this.cleanup().then(() => process.exit(0));
    });
  }

  /**
   * Show detailed session statistics
   */
  async showDetailedStats() {
    console.log('📈 Detailed Session Statistics');
    console.log('==============================\n');

    const stats = await this.adminHelpers.getSessionStatistics();
    
    // Session details
    console.log('📋 Session Breakdown:');
    stats.sessions.byStatus.forEach(status => {
      console.log(`\n${status.status.toUpperCase()}:`);
      console.log(`  Count: ${status.count}`);
      if (status.avg_duration_seconds) {
        console.log(`  Avg Duration: ${Math.floor(status.avg_duration_seconds / 60)}m ${Math.floor(status.avg_duration_seconds % 60)}s`);
      }
      if (status.oldest) {
        console.log(`  Oldest: ${new Date(status.oldest).toLocaleString()}`);
      }
      if (status.most_recent) {
        console.log(`  Most Recent: ${new Date(status.most_recent).toLocaleString()}`);
      }
    });

    // Background job details
    if (stats.backgroundJobs.total > 0) {
      console.log('\n\n🔄 Background Job Details:');
      stats.backgroundJobs.byStatus.forEach(job => {
        console.log(`\n${job.status.toUpperCase()}:`);
        console.log(`  Count: ${job.count}`);
        if (job.avg_duration_ms) {
          console.log(`  Avg Duration: ${Math.floor(job.avg_duration_ms / 1000)}s`);
        }
        if (job.most_recent) {
          console.log(`  Most Recent: ${new Date(job.most_recent).toLocaleString()}`);
        }
      });
    }

    // System details
    console.log('\n\n💻 System Details:');
    console.log(`  Node Version: ${stats.system.nodeVersion}`);
    console.log(`  Platform: ${stats.system.platform}`);
    console.log(`  Process ID: ${stats.system.pid}`);
    console.log(`  Uptime: ${Math.floor(stats.system.uptime / 3600)}h ${Math.floor((stats.system.uptime % 3600) / 60)}m`);
    
    console.log('\n  Memory Usage:');
    Object.entries(stats.system.memoryUsage).forEach(([key, value]) => {
      console.log(`    ${key}: ${value}`);
    });

    console.log('\n\n📊 Performance Metrics:');
    console.log(`  Query Duration: ${stats.queryDuration}ms`);
    console.log(`  Timestamp: ${stats.timestamp}`);
  }

  /**
   * Show memory analysis
   */
  async showMemoryAnalysis() {
    console.log('🧠 Memory Analysis');
    console.log('==================\n');

    const analysis = this.adminHelpers.performMemoryAnalysis();
    
    console.log('Process Information:');
    console.log(`  PID: ${analysis.process.pid}`);
    console.log(`  Uptime: ${Math.floor(analysis.process.uptime / 3600)}h ${Math.floor((analysis.process.uptime % 3600) / 60)}m`);
    console.log(`  Node Version: ${analysis.process.version}`);
    console.log(`  Platform: ${analysis.process.platform}`);
    console.log();

    console.log('Memory Usage:');
    console.log(`  RSS: ${Math.round(analysis.memory.rss / 1024 / 1024)}MB`);
    console.log(`  Heap Total: ${Math.round(analysis.memory.heapTotal / 1024 / 1024)}MB`);
    console.log(`  Heap Used: ${Math.round(analysis.memory.heapUsed / 1024 / 1024)}MB`);
    console.log(`  Heap Utilization: ${analysis.memory.heapUtilization}`);
    console.log(`  External: ${Math.round(analysis.memory.external / 1024 / 1024)}MB`);
    console.log(`  Array Buffers: ${Math.round(analysis.memory.arrayBuffers / 1024 / 1024)}MB`);
    console.log();

    console.log('System Information:');
    console.log(`  Load Average: ${analysis.system.loadAverage.map(l => l.toFixed(2)).join(', ')}`);
    console.log(`  Free Memory: ${Math.round(analysis.system.freeMemory / 1024 / 1024)}MB`);
    console.log(`  Total Memory: ${Math.round(analysis.system.totalMemory / 1024 / 1024)}MB`);
    console.log(`  CPU Count: ${analysis.system.cpuCount}`);
    console.log();

    console.log('Recommendations:');
    analysis.recommendations.forEach(rec => {
      console.log(`  • ${rec}`);
    });
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log('🦙 AutoLlama Session Admin CLI');
    console.log('Usage: node session-admin.js <command> [options]\n');
    
    console.log('Commands:');
    console.log('  status         Show current session status overview');
    console.log('  cleanup        Perform safe session cleanup');
    console.log('  force-cleanup  Force cleanup with minimal validation');
    console.log('  monitor        Start real-time session monitoring');
    console.log('  stats          Show detailed session statistics');
    console.log('  memory         Show memory usage analysis');
    console.log('  help           Show this help message\n');
    
    console.log('Options:');
    console.log('  --dry-run      Preview changes without applying them');
    console.log('  --confirm      Skip confirmation prompts');
    console.log('  --verbose, -v  Show detailed output');
    console.log('  --max-age      Max session age in milliseconds (default: 480000)');
    console.log('  --no-stuck     Skip stuck session cleanup');
    console.log('  --no-timeout   Skip timeout session cleanup');
    console.log('  --force        Force cleanup bypassing safety checks');
    console.log('  --interval     Monitoring update interval in ms (default: 5000)\n');
    
    console.log('Examples:');
    console.log('  node session-admin.js status');
    console.log('  node session-admin.js cleanup --dry-run');
    console.log('  node session-admin.js cleanup --max-age 300000 --confirm');
    console.log('  node session-admin.js force-cleanup --confirm');
    console.log('  node session-admin.js monitor --interval 3000');
  }

  /**
   * Ask for user confirmation
   */
  async askConfirmation(question) {
    return new Promise((resolve) => {
      this.rl.question(`${question} (y/N): `, (answer) => {
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.rl.close();
    await this.adminHelpers.cleanup();
  }
}

// Run CLI if called directly
if (require.main === module) {
  const cli = new SessionAdminCLI();
  cli.run().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = SessionAdminCLI;