#!/usr/bin/env node

/**
 * AutoLlama Background Job Admin CLI Utility
 * Comprehensive background job queue management tool
 * 
 * Usage:
 *   node background-admin.js <command> [options]
 * 
 * Commands:
 *   status        - Show job queue status
 *   cancel        - Cancel jobs by criteria
 *   retry-failed  - Retry failed jobs
 *   purge-old     - Remove old completed/failed jobs
 *   queue-stats   - Detailed queue statistics
 *   monitor       - Real-time queue monitoring
 * 
 * Examples:
 *   node background-admin.js status
 *   node background-admin.js cancel --session-id abc123 --dry-run
 *   node background-admin.js cancel --status queued,processing --confirm
 *   node background-admin.js retry-failed --max-retries 2
 *   node background-admin.js purge-old --older-than "7 days"
 */

const path = require('path');
const readline = require('readline');

// Add the parent directories to require path for module resolution
const apiRoot = path.resolve(__dirname, '../../../');
process.chdir(apiRoot);

const AdminHelpers = require('../admin-helpers');
const { JOB_STATUS, JOB_TYPES } = require('../constants');

class BackgroundJobAdminCLI {
  constructor() {
    this.adminHelpers = new AdminHelpers();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Main CLI entry point
   */
  async run() {
    const args = process.argv.slice(2);
    const command = args[0];
    const options = this.parseArguments(args.slice(1));

    console.log('🦙 AutoLlama Background Job Admin CLI v2.2');
    console.log('============================================\n');

    try {
      switch (command) {
        case 'status':
          await this.showStatus();
          break;
        case 'cancel':
          await this.cancelJobs(options);
          break;
        case 'retry-failed':
          await this.retryFailedJobs(options);
          break;
        case 'purge-old':
          await this.purgeOldJobs(options);
          break;
        case 'queue-stats':
          await this.showQueueStats();
          break;
        case 'monitor':
          await this.startMonitoring(options);
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
      sessionId: null,
      status: null,
      olderThan: null,
      maxJobs: 100,
      maxRetries: 3,
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
        case '--session-id':
          options.sessionId = args[++i];
          break;
        case '--status':
          options.status = args[++i]?.split(',') || null;
          break;
        case '--older-than':
          options.olderThan = args[++i];
          break;
        case '--max-jobs':
          options.maxJobs = parseInt(args[++i]) || 100;
          break;
        case '--max-retries':
          options.maxRetries = parseInt(args[++i]) || 3;
          break;
        case '--interval':
          options.interval = parseInt(args[++i]) || 5000;
          break;
      }
    }

    return options;
  }

  /**
   * Show job queue status
   */
  async showStatus() {
    console.log('📊 Background Job Queue Status');
    console.log('===============================\n');

    const stats = await this.adminHelpers.getJobQueueStatistics();
    
    // Overall queue performance
    console.log('Queue Performance:');
    console.log(`  Queued Jobs: ${stats.performance.queued_jobs}`);
    console.log(`  Processing Jobs: ${stats.performance.processing_jobs}`);
    console.log(`  Completed Jobs: ${stats.performance.completed_jobs}`);
    console.log(`  Failed Jobs: ${stats.performance.failed_jobs}`);
    console.log(`  Cancelled Jobs: ${stats.performance.cancelled_jobs}`);
    console.log();

    const backlogSize = stats.queueHealth.backlogSize;
    const failureRate = stats.queueHealth.failureRate.toFixed(1);
    
    console.log('Queue Health:');
    console.log(`  Backlog Size: ${backlogSize}`);
    console.log(`  Failure Rate: ${failureRate}%`);
    console.log(`  Jobs Last Hour: ${stats.queueHealth.throughputLastHour}`);
    console.log(`  Jobs Last 24h: ${stats.queueHealth.throughputLast24h}`);
    console.log();

    if (stats.performance.avg_processing_time_ms) {
      const avgTime = Math.round(stats.performance.avg_processing_time_ms / 1000);
      const maxTime = Math.round(stats.performance.max_processing_time_ms / 1000);
      console.log('Processing Times:');
      console.log(`  Average: ${avgTime}s`);
      console.log(`  Maximum: ${maxTime}s`);
      console.log();
    }

    // Status breakdown by type
    if (stats.byStatusAndType.length > 0) {
      console.log('Jobs by Status and Type:');
      const statusGroups = {};
      stats.byStatusAndType.forEach(job => {
        if (!statusGroups[job.status]) {
          statusGroups[job.status] = [];
        }
        statusGroups[job.status].push(job);
      });

      Object.entries(statusGroups).forEach(([status, jobs]) => {
        console.log(`\n  ${status.toUpperCase()}:`);
        jobs.forEach(job => {
          console.log(`    ${job.type}: ${job.count} jobs`);
          if (job.retry_count > 0) {
            console.log(`      (${job.retry_count} with retries)`);
          }
        });
      });
      console.log();
    }

    // Warnings and recommendations
    const warnings = [];
    if (backlogSize > 50) {
      warnings.push(`High backlog size (${backlogSize} jobs)`);
    }
    if (parseFloat(failureRate) > 20) {
      warnings.push(`High failure rate (${failureRate}%)`);
    }
    if (stats.performance.processing_jobs > 10) {
      warnings.push(`Many concurrent jobs (${stats.performance.processing_jobs})`);
    }

    if (warnings.length > 0) {
      console.log('⚠️  Warnings:');
      warnings.forEach(warning => console.log(`   - ${warning}`));
      console.log();
    }
  }

  /**
   * Cancel jobs by criteria
   */
  async cancelJobs(options) {
    console.log('🛑 Cancel Background Jobs');
    console.log('=========================\n');

    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    // Show cancellation criteria
    console.log('Cancellation Criteria:');
    if (options.sessionId) {
      console.log(`  Session ID: ${options.sessionId}`);
    }
    if (options.status) {
      console.log(`  Status: ${options.status.join(', ')}`);
    }
    if (options.olderThan) {
      console.log(`  Older Than: ${options.olderThan}`);
    }
    console.log(`  Max Jobs: ${options.maxJobs}`);
    console.log();

    // Build criteria object
    const criteria = {
      sessionId: options.sessionId,
      status: options.status,
      olderThan: options.olderThan,
      dryRun: options.dryRun,
      maxJobs: options.maxJobs
    };

    // Get preview of jobs to be cancelled
    const preview = await this.adminHelpers.cancelBackgroundJobs({
      ...criteria,
      dryRun: true
    });

    if (preview.cancelledCount === 0) {
      console.log('ℹ️  No jobs match the cancellation criteria');
      return;
    }

    console.log(`📋 Jobs to be cancelled: ${preview.cancelledCount}`);
    if (options.verbose && preview.cancelledJobs.length > 0) {
      console.log('\nJob Details:');
      preview.cancelledJobs.slice(0, 10).forEach(job => {
        console.log(`  ${job.jobId.substring(0, 8)}... (${job.type}) - Session: ${job.sessionId?.substring(0, 8) || 'N/A'}`);
      });
      if (preview.cancelledJobs.length > 10) {
        console.log(`  ... and ${preview.cancelledJobs.length - 10} more`);
      }
    }
    console.log();

    // Confirmation (unless dry run or --confirm)
    if (!options.dryRun && !options.confirm) {
      const confirmed = await this.askConfirmation(`Cancel ${preview.cancelledCount} jobs?`);
      if (!confirmed) {
        console.log('❌ Job cancellation cancelled by user');
        return;
      }
    }

    if (!options.dryRun) {
      console.log('🛑 Cancelling jobs...');
      const results = await this.adminHelpers.cancelBackgroundJobs(criteria);
      
      console.log('📋 Cancellation Results:');
      console.log(`  Jobs Cancelled: ${results.cancelledCount}`);
      console.log(`  Timestamp: ${results.timestamp}`);
      console.log();

      if (results.cancelledCount > 0) {
        console.log('✅ Job cancellation completed');
      }
    }
  }

  /**
   * Retry failed jobs
   */
  async retryFailedJobs(options) {
    console.log('🔄 Retry Failed Jobs');
    console.log('====================\n');

    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    const client = this.adminHelpers.db || this.adminHelpers.dbPool;
    
    // Find failed jobs that can be retried
    const query = `
      SELECT id, session_id, type, retries, error, created_at, failed_at
      FROM background_jobs 
      WHERE status = 'failed' 
      AND retries < $1
      ORDER BY failed_at DESC
      LIMIT $2
    `;

    const result = await client.query(query, [options.maxRetries, options.maxJobs]);
    const failedJobs = result.rows;

    if (failedJobs.length === 0) {
      console.log('ℹ️  No failed jobs available for retry');
      return;
    }

    console.log(`📋 Failed jobs available for retry: ${failedJobs.length}`);
    console.log(`Max retries allowed: ${options.maxRetries}`);
    console.log();

    if (options.verbose) {
      console.log('Job Details:');
      failedJobs.slice(0, 10).forEach(job => {
        const error = job.error ? JSON.parse(job.error) : {};
        console.log(`  ${job.id.substring(0, 8)}... (${job.type}) - Retries: ${job.retries}/${options.maxRetries}`);
        console.log(`    Error: ${error.message || 'Unknown error'}`);
        console.log(`    Failed: ${new Date(job.failed_at).toLocaleString()}`);
      });
      if (failedJobs.length > 10) {
        console.log(`  ... and ${failedJobs.length - 10} more`);
      }
      console.log();
    }

    // Confirmation
    if (!options.dryRun && !options.confirm) {
      const confirmed = await this.askConfirmation(`Retry ${failedJobs.length} failed jobs?`);
      if (!confirmed) {
        console.log('❌ Job retry cancelled by user');
        return;
      }
    }

    if (!options.dryRun) {
      console.log('🔄 Retrying failed jobs...');
      
      const retryQuery = `
        UPDATE background_jobs 
        SET 
          status = 'queued',
          retries = retries + 1,
          updated_at = NOW(),
          next_retry_at = NOW() + INTERVAL '5 minutes',
          error = NULL
        WHERE id = ANY($1)
        RETURNING id, session_id, type, retries
      `;

      const jobIds = failedJobs.map(job => job.id);
      const retryResult = await client.query(retryQuery, [jobIds]);

      console.log('📋 Retry Results:');
      console.log(`  Jobs Queued for Retry: ${retryResult.rowCount}`);
      console.log(`  Next Retry: In 5 minutes`);
      console.log();

      if (retryResult.rowCount > 0) {
        console.log('✅ Failed jobs queued for retry');
      }
    }
  }

  /**
   * Purge old completed/failed jobs
   */
  async purgeOldJobs(options) {
    console.log('🗑️  Purge Old Jobs');
    console.log('==================\n');

    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    const olderThan = options.olderThan || '30 days';
    console.log(`Purging jobs older than: ${olderThan}`);
    console.log();

    const client = this.adminHelpers.db || this.adminHelpers.dbPool;
    
    // Count jobs to be purged
    const countQuery = `
      SELECT 
        status,
        COUNT(*) as count
      FROM background_jobs 
      WHERE status IN ('completed', 'failed', 'cancelled')
      AND (completed_at < NOW() - INTERVAL '${olderThan}' OR failed_at < NOW() - INTERVAL '${olderThan}')
      GROUP BY status
    `;

    const countResult = await client.query(countQuery);
    const jobCounts = countResult.rows;

    if (jobCounts.length === 0) {
      console.log('ℹ️  No old jobs found for purging');
      return;
    }

    const totalJobs = jobCounts.reduce((sum, row) => sum + parseInt(row.count), 0);

    console.log('📋 Jobs to be purged:');
    jobCounts.forEach(row => {
      console.log(`  ${row.status}: ${row.count} jobs`);
    });
    console.log(`  TOTAL: ${totalJobs} jobs`);
    console.log();

    // Confirmation
    if (!options.dryRun && !options.confirm) {
      const confirmed = await this.askConfirmation(`Purge ${totalJobs} old jobs?`);
      if (!confirmed) {
        console.log('❌ Job purge cancelled by user');
        return;
      }
    }

    if (!options.dryRun) {
      console.log('🗑️  Purging old jobs...');
      
      const purgeQuery = `
        DELETE FROM background_jobs 
        WHERE status IN ('completed', 'failed', 'cancelled')
        AND (completed_at < NOW() - INTERVAL '${olderThan}' OR failed_at < NOW() - INTERVAL '${olderThan}')
      `;

      const purgeResult = await client.query(purgeQuery);

      console.log('📋 Purge Results:');
      console.log(`  Jobs Deleted: ${purgeResult.rowCount}`);
      console.log(`  Timestamp: ${new Date().toISOString()}`);
      console.log();

      if (purgeResult.rowCount > 0) {
        console.log('✅ Old jobs purged successfully');
      }
    }
  }

  /**
   * Show detailed queue statistics
   */
  async showQueueStats() {
    console.log('📈 Detailed Queue Statistics');
    console.log('============================\n');

    const stats = await this.adminHelpers.getJobQueueStatistics();

    // Performance metrics
    console.log('📊 Performance Metrics:');
    console.log(`  Total Jobs: ${stats.byStatusAndType.reduce((sum, job) => sum + parseInt(job.count), 0)}`);
    console.log(`  Active Jobs: ${parseInt(stats.performance.queued_jobs) + parseInt(stats.performance.processing_jobs)}`);
    console.log(`  Success Rate: ${(100 - stats.queueHealth.failureRate).toFixed(1)}%`);
    
    if (stats.performance.avg_processing_time_ms) {
      console.log(`  Avg Processing Time: ${Math.round(stats.performance.avg_processing_time_ms / 1000)}s`);
      console.log(`  Max Processing Time: ${Math.round(stats.performance.max_processing_time_ms / 1000)}s`);
    }
    console.log();

    // Throughput analysis
    console.log('📈 Throughput Analysis:');
    console.log(`  Jobs/Hour (Last Hour): ${stats.queueHealth.throughputLastHour}`);
    console.log(`  Jobs/Hour (Last 24h): ${Math.round(stats.queueHealth.throughputLast24h / 24)}`);
    console.log(`  Backlog Size: ${stats.queueHealth.backlogSize}`);
    
    // Estimate completion time
    if (stats.queueHealth.backlogSize > 0 && stats.queueHealth.throughputLastHour > 0) {
      const hoursToComplete = stats.queueHealth.backlogSize / stats.queueHealth.throughputLastHour;
      console.log(`  Estimated Completion: ${hoursToComplete.toFixed(1)} hours`);
    }
    console.log();

    // Detailed breakdown
    console.log('📝 Detailed Job Breakdown:');
    const statusGroups = {};
    stats.byStatusAndType.forEach(job => {
      if (!statusGroups[job.status]) {
        statusGroups[job.status] = { total: 0, types: [] };
      }
      statusGroups[job.status].total += parseInt(job.count);
      statusGroups[job.status].types.push(job);
    });

    Object.entries(statusGroups).forEach(([status, data]) => {
      console.log(`\n  ${status.toUpperCase()} (${data.total} total):`);
      data.types.forEach(job => {
        console.log(`    ${job.type.padEnd(20)} ${job.count.toString().padStart(6)}`);
        if (job.avg_duration_ms && job.count > 0) {
          console.log(`    ${''.padEnd(20)} Avg: ${Math.round(job.avg_duration_ms / 1000)}s`);
        }
        if (job.retry_count > 0) {
          console.log(`    ${''.padEnd(20)} Retries: ${job.retry_count}`);
        }
      });
    });

    // Queue health recommendations
    console.log('\n\n💡 Queue Health Recommendations:');
    const recommendations = [];

    if (stats.queueHealth.failureRate > 20) {
      recommendations.push('High failure rate detected - investigate failed job causes');
    }
    if (stats.queueHealth.backlogSize > 100) {
      recommendations.push('Large backlog - consider increasing processing capacity');
    }
    if (stats.performance.processing_jobs > 10) {
      recommendations.push('Many concurrent jobs - monitor system resources');
    }
    if (stats.queueHealth.throughputLastHour === 0 && stats.queueHealth.backlogSize > 0) {
      recommendations.push('No job processing detected - check queue service status');
    }

    if (recommendations.length === 0) {
      recommendations.push('Queue performance appears healthy');
    }

    recommendations.forEach(rec => {
      console.log(`  • ${rec}`);
    });
  }

  /**
   * Start real-time queue monitoring
   */
  async startMonitoring(options) {
    console.log('📺 Background Job Queue Monitoring (Press Ctrl+C to stop)');
    console.log('========================================================\n');

    let iteration = 0;
    const monitor = setInterval(async () => {
      try {
        process.stdout.write('\x1B[2J\x1B[0f'); // Clear screen
        
        console.log(`🦙 Background Job Queue Monitor - Update #${++iteration}`);
        console.log(`Time: ${new Date().toLocaleString()}`);
        console.log('='.repeat(70));
        console.log();

        const stats = await this.adminHelpers.getJobQueueStatistics();
        
        // Queue overview
        console.log('📊 Queue Overview:');
        console.log(`  Queued: ${stats.performance.queued_jobs.toString().padStart(6)}  |  ` +
                   `Processing: ${stats.performance.processing_jobs.toString().padStart(6)}  |  ` +
                   `Completed: ${stats.performance.completed_jobs.toString().padStart(6)}  |  ` +
                   `Failed: ${stats.performance.failed_jobs.toString().padStart(6)}`);
        console.log();

        // Performance metrics
        const failureRate = stats.queueHealth.failureRate.toFixed(1);
        const successRate = (100 - stats.queueHealth.failureRate).toFixed(1);
        
        console.log('📈 Performance:');
        console.log(`  Success Rate: ${successRate}%  |  ` +
                   `Failure Rate: ${failureRate}%  |  ` +
                   `Backlog: ${stats.queueHealth.backlogSize}`);
        
        if (stats.performance.avg_processing_time_ms) {
          const avgTime = Math.round(stats.performance.avg_processing_time_ms / 1000);
          console.log(`  Avg Processing Time: ${avgTime}s`);
        }
        console.log();

        // Throughput
        console.log('🚀 Throughput:');
        console.log(`  Last Hour: ${stats.queueHealth.throughputLastHour} jobs  |  ` +
                   `Last 24h: ${stats.queueHealth.throughputLast24h} jobs`);
        console.log();

        // Active jobs by type
        const processingJobs = stats.byStatusAndType.filter(job => job.status === 'processing');
        if (processingJobs.length > 0) {
          console.log('🔄 Currently Processing:');
          processingJobs.forEach(job => {
            console.log(`  ${job.type}: ${job.count} jobs`);
          });
          console.log();
        }

        // Warnings
        const warnings = [];
        if (stats.queueHealth.backlogSize > 50) {
          warnings.push(`High backlog (${stats.queueHealth.backlogSize})`);
        }
        if (parseFloat(failureRate) > 20) {
          warnings.push(`High failure rate (${failureRate}%)`);
        }
        
        if (warnings.length > 0) {
          console.log('⚠️  Warnings:');
          warnings.forEach(warning => console.log(`   • ${warning}`));
          console.log();
        }
        
        console.log('Press Ctrl+C to stop monitoring');
        
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
   * Show help information
   */
  showHelp() {
    console.log('🦙 AutoLlama Background Job Admin CLI');
    console.log('Usage: node background-admin.js <command> [options]\n');
    
    console.log('Commands:');
    console.log('  status        Show current job queue status');
    console.log('  cancel        Cancel jobs by criteria');
    console.log('  retry-failed  Retry failed jobs');
    console.log('  purge-old     Remove old completed/failed jobs');
    console.log('  queue-stats   Show detailed queue statistics');
    console.log('  monitor       Start real-time queue monitoring');
    console.log('  help          Show this help message\n');
    
    console.log('Options:');
    console.log('  --dry-run         Preview changes without applying them');
    console.log('  --confirm         Skip confirmation prompts');
    console.log('  --verbose, -v     Show detailed output');
    console.log('  --session-id      Target specific session ID');
    console.log('  --status          Target jobs with specific status (comma-separated)');
    console.log('  --older-than      Target jobs older than specified time');
    console.log('  --max-jobs        Maximum number of jobs to affect (default: 100)');
    console.log('  --max-retries     Maximum retry attempts (default: 3)');
    console.log('  --interval        Monitoring update interval in ms (default: 5000)\n');
    
    console.log('Examples:');
    console.log('  node background-admin.js status');
    console.log('  node background-admin.js cancel --session-id abc123 --dry-run');
    console.log('  node background-admin.js cancel --status queued,processing --confirm');
    console.log('  node background-admin.js retry-failed --max-retries 2');
    console.log('  node background-admin.js purge-old --older-than "7 days" --confirm');
    console.log('  node background-admin.js monitor --interval 3000');
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
  const cli = new BackgroundJobAdminCLI();
  cli.run().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = BackgroundJobAdminCLI;