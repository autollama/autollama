/**
 * Background Jobs System
 * 🦙 Add background processing capabilities
 */

module.exports = {
  /**
   * Create background jobs table
   */
  async up(client, db) {
    console.log('🦙 Creating background jobs system...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS background_jobs (
        id ${db.config.type === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY'},
        job_id VARCHAR(255) UNIQUE NOT NULL,
        job_type VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        payload ${db.config.type === 'sqlite' ? 'TEXT' : 'JSONB'},
        result ${db.config.type === 'sqlite' ? 'TEXT' : 'JSONB'},
        error_message TEXT,
        attempts INTEGER DEFAULT 0,
        max_attempts INTEGER DEFAULT 3,
        retry_after ${db.config.type === 'sqlite' ? 'TEXT' : 'TIMESTAMP'},
        created_at ${db.config.type === 'sqlite' ? 'TEXT DEFAULT (datetime(\'now\'))' : 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${db.config.type === 'sqlite' ? 'TEXT DEFAULT (datetime(\'now\'))' : 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'},
        started_at ${db.config.type === 'sqlite' ? 'TEXT' : 'TIMESTAMP'},
        completed_at ${db.config.type === 'sqlite' ? 'TEXT' : 'TIMESTAMP'}
      )
    `);

    // Create indexes for job processing
    await client.query('CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_background_jobs_type ON background_jobs(job_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_background_jobs_priority ON background_jobs(priority DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_background_jobs_created ON background_jobs(created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_background_jobs_retry ON background_jobs(retry_after)');
    
    // Add job queue trigger for SQLite
    if (db.config.type === 'sqlite') {
      await client.query(`
        CREATE TRIGGER IF NOT EXISTS background_jobs_updated_at 
        AFTER UPDATE ON background_jobs 
        BEGIN
          UPDATE background_jobs SET updated_at = datetime('now') WHERE id = NEW.id;
        END
      `);
    }
    
    console.log('✅ Background jobs system created');
  },

  /**
   * Remove background jobs table
   */
  async down(client, db) {
    console.log('🦙 Removing background jobs system...');
    
    if (db.config.type === 'sqlite') {
      await client.query('DROP TRIGGER IF EXISTS background_jobs_updated_at');
    }
    
    await client.query('DROP TABLE IF EXISTS background_jobs');
    
    console.log('✅ Background jobs system removed');
  }
};