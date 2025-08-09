#!/usr/bin/env node

/**
 * Orphan Session Cleanup Utility
 * Detects and cleans up orphaned processing sessions
 */

const { Pool } = require('pg');
const { logger } = require('../logger');

class OrphanCleanupUtility {
  constructor() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    this.logger = logger.child({ component: 'orphan-cleanup' });
  }

  /**
   * Detect orphaned sessions
   */
  async detectOrphans(timeoutMinutes = 30) {
    const query = `
      SELECT 
        session_id,
        filename,
        status,
        created_at,
        updated_at,
        last_activity,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(last_activity, updated_at)))/60 as minutes_since_activity,
        process_id,
        node_instance
      FROM upload_sessions
      WHERE status = 'processing' 
      AND tracking_enabled = true
      AND (
        last_activity < NOW() - INTERVAL '${timeoutMinutes} minutes' OR
        (last_activity IS NULL AND updated_at < NOW() - INTERVAL '${timeoutMinutes} minutes')
      )
      ORDER BY COALESCE(last_activity, updated_at) ASC
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Clean up orphaned sessions
   */
  async cleanupOrphans(timeoutMinutes = 30, dryRun = true) {
    const orphans = await this.detectOrphans(timeoutMinutes);
    
    if (orphans.length === 0) {
      console.log('✅ No orphaned sessions found');
      return { cleaned: 0, orphans: [] };
    }

    console.log(`🔍 Found ${orphans.length} orphaned sessions:`);
    console.table(orphans.map(o => ({
      session_id: o.session_id.substring(0, 8) + '...',
      filename: o.filename?.substring(0, 30) + '...',
      minutes_inactive: Math.round(o.minutes_since_activity),
      last_activity: o.last_activity || o.updated_at
    })));

    if (dryRun) {
      console.log('🧪 DRY RUN: Would clean up these sessions');
      return { cleaned: 0, orphans, dryRun: true };
    }

    // Perform actual cleanup
    const cleanupQuery = `
      UPDATE upload_sessions 
      SET 
        status = 'failed',
        error_message = 'Cleaned up as orphaned session',
        orphan_cleanup = true,
        orphan_type = 'timeout_cleanup',
        updated_at = NOW()
      WHERE session_id = ANY($1::text[])
      RETURNING session_id, filename
    `;

    const sessionIds = orphans.map(o => o.session_id);
    const cleanupResult = await this.pool.query(cleanupQuery, [sessionIds]);

    console.log(`🧹 Cleaned up ${cleanupResult.rowCount} orphaned sessions`);
    
    return { 
      cleaned: cleanupResult.rowCount, 
      orphans, 
      cleanedSessions: cleanupResult.rows 
    };
  }

  /**
   * Get session statistics
   */
  async getSessionStats() {
    const queries = [
      {
        name: 'total_sessions',
        query: 'SELECT COUNT(*) as count FROM upload_sessions WHERE tracking_enabled = true'
      },
      {
        name: 'by_status',
        query: `
          SELECT status, COUNT(*) as count 
          FROM upload_sessions 
          WHERE tracking_enabled = true 
          GROUP BY status 
          ORDER BY count DESC
        `
      },
      {
        name: 'recent_activity',
        query: `
          SELECT 
            COUNT(*) as count,
            'last_hour' as period
          FROM upload_sessions 
          WHERE tracking_enabled = true 
          AND last_activity > NOW() - INTERVAL '1 hour'
          
          UNION ALL
          
          SELECT 
            COUNT(*) as count,
            'last_day' as period
          FROM upload_sessions 
          WHERE tracking_enabled = true 
          AND last_activity > NOW() - INTERVAL '1 day'
        `
      },
      {
        name: 'potential_orphans',
        query: `
          SELECT 
            COUNT(*) as count,
            AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE(last_activity, updated_at)))/60) as avg_minutes_inactive
          FROM upload_sessions
          WHERE status = 'processing' 
          AND tracking_enabled = true
          AND (
            last_activity < NOW() - INTERVAL '30 minutes' OR
            (last_activity IS NULL AND updated_at < NOW() - INTERVAL '30 minutes')
          )
        `
      }
    ];

    const stats = {};
    for (const query of queries) {
      const result = await this.pool.query(query.query);
      stats[query.name] = result.rows;
    }

    return stats;
  }

  /**
   * Monitor session health
   */
  async monitorSessionHealth() {
    const stats = await this.getSessionStats();
    const orphans = await this.detectOrphans(30);

    console.log('📊 Session Health Report');
    console.log('========================');
    
    console.log('\n📈 Session Statistics:');
    console.log(`Total tracked sessions: ${stats.total_sessions[0].count}`);
    
    console.log('\n📋 By Status:');
    console.table(stats.by_status);
    
    console.log('\n⏰ Recent Activity:');
    console.table(stats.recent_activity);
    
    console.log('\n🔍 Potential Orphans:');
    const orphanStats = stats.potential_orphans[0];
    console.log(`Count: ${orphanStats.count}`);
    if (orphanStats.count > 0) {
      console.log(`Average inactive time: ${Math.round(orphanStats.avg_minutes_inactive)} minutes`);
    }

    if (orphans.length > 0) {
      console.log('\n⚠️ Detected Orphaned Sessions:');
      console.table(orphans.map(o => ({
        session_id: o.session_id.substring(0, 8) + '...',
        filename: o.filename?.substring(0, 30) + '...',
        minutes_inactive: Math.round(o.minutes_since_activity),
        process_id: o.process_id,
        node_instance: o.node_instance || 'unknown'
      })));
    } else {
      console.log('\n✅ No orphaned sessions detected');
    }

    return { stats, orphans };
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

// CLI interface
async function main() {
  const utility = new OrphanCleanupUtility();
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case 'detect':
        const timeoutMinutes = parseInt(args[0]) || 30;
        const orphans = await utility.detectOrphans(timeoutMinutes);
        console.log(`Found ${orphans.length} orphaned sessions (timeout: ${timeoutMinutes} minutes)`);
        if (orphans.length > 0) {
          console.table(orphans);
        }
        break;

      case 'cleanup':
        const cleanupTimeout = parseInt(args[0]) || 30;
        const dryRun = !args.includes('--confirm');
        const result = await utility.cleanupOrphans(cleanupTimeout, dryRun);
        if (dryRun) {
          console.log('Use --confirm to perform actual cleanup');
        }
        break;

      case 'stats':
        const stats = await utility.getSessionStats();
        console.log('Session Statistics:');
        console.log(JSON.stringify(stats, null, 2));
        break;

      case 'monitor':
        await utility.monitorSessionHealth();
        break;

      default:
        console.log(`
Orphan Session Cleanup Utility

Usage:
  node orphan-cleanup.js <command> [options]

Commands:
  detect [timeout]         - Detect orphaned sessions (default: 30 minutes)
  cleanup [timeout]        - Clean up orphaned sessions (dry run by default)
  cleanup [timeout] --confirm - Actually perform cleanup
  stats                    - Show session statistics
  monitor                  - Monitor session health

Examples:
  node orphan-cleanup.js detect 60           # Find sessions inactive for 60+ minutes
  node orphan-cleanup.js cleanup 30 --confirm # Clean sessions inactive for 30+ minutes
  node orphan-cleanup.js monitor             # Show health report
        `);
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await utility.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = OrphanCleanupUtility;