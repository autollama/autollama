/**
 * Database Configuration
 * PostgreSQL connection pool configuration and health checking
 */

const { Pool } = require('pg');
const config = require('./index');

/**
 * Create and configure PostgreSQL connection pool
 */
function createDatabasePool() {
  const poolConfig = {
    connectionString: config.database.url,
    max: config.database.maxConnections,
    min: 5, // Minimum connections to maintain
    idleTimeoutMillis: config.database.idleTimeoutMs,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
    acquireTimeoutMillis: config.database.acquireTimeoutMs,
    createTimeoutMillis: 3000,
    destroyTimeoutMillis: 5000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
  };

  const pool = new Pool(poolConfig);

  // Handle pool errors
  pool.on('error', (err, client) => {
    console.error('❌ PostgreSQL pool error:', err.message);
  });

  pool.on('connect', (client) => {
    console.log('🔗 New PostgreSQL client connected');
  });

  pool.on('remove', (client) => {
    console.log('🔌 PostgreSQL client removed from pool');
  });

  return pool;
}

/**
 * Test database connection
 */
async function testDatabaseConnection(pool) {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT NOW() as current_time, version() as version');
      console.log('✅ Database connection successful:', {
        currentTime: result.rows[0].current_time,
        version: result.rows[0].version.split(' ')[0]
      });
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

/**
 * Initialize database tables if they don't exist
 */
async function initializeDatabaseTables(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create processed_content table
    await client.query(`
      CREATE TABLE IF NOT EXISTS processed_content (
        id SERIAL PRIMARY KEY,
        airtable_id VARCHAR(255) UNIQUE,
        url TEXT NOT NULL,
        title VARCHAR(500),
        summary TEXT,
        chunk_text TEXT,
        chunk_id VARCHAR(255) UNIQUE NOT NULL,
        chunk_index INTEGER,
        sentiment VARCHAR(50),
        emotions TEXT[],
        category VARCHAR(100),
        content_type VARCHAR(50),
        technical_level VARCHAR(50),
        main_topics TEXT[],
        key_concepts TEXT[],
        tags TEXT,
        key_entities JSONB,
        embedding_status VARCHAR(50) DEFAULT 'pending',
        processing_status VARCHAR(50) DEFAULT 'processing',
        contextual_summary TEXT,
        uses_contextual_embedding BOOLEAN DEFAULT FALSE,
        created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_to_li BOOLEAN DEFAULT FALSE,
        upload_source VARCHAR(50) DEFAULT 'user',
        record_type VARCHAR(20) DEFAULT 'chunk',
        parent_document_id INTEGER
      )
    `);

    // Create upload_sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS upload_sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        filename VARCHAR(500),
        url TEXT,
        total_chunks INTEGER,
        processed_chunks INTEGER DEFAULT 0,
        completed_chunks INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'processing',
        file_path TEXT,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create api_settings table for dynamic configuration
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(255) UNIQUE NOT NULL,
        setting_value TEXT,
        encrypted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create performance indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_processed_content_url ON processed_content(url)',
      'CREATE INDEX IF NOT EXISTS idx_processed_content_created ON processed_content(created_time DESC)',
      'CREATE INDEX IF NOT EXISTS idx_processed_content_chunk_id ON processed_content(chunk_id)',
      'CREATE INDEX IF NOT EXISTS idx_processed_content_status ON processed_content(processing_status)',
      'CREATE INDEX IF NOT EXISTS idx_processed_content_embedding ON processed_content(embedding_status)',
      'CREATE INDEX IF NOT EXISTS idx_processed_content_record_type ON processed_content(record_type)',
      'CREATE INDEX IF NOT EXISTS idx_upload_sessions_session_id ON upload_sessions(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status)',
      'CREATE INDEX IF NOT EXISTS idx_upload_sessions_activity ON upload_sessions(status, last_activity) WHERE status = \'processing\'',
      'CREATE INDEX IF NOT EXISTS idx_api_settings_key ON api_settings(setting_key)',
    ];

    for (const indexQuery of indexes) {
      await client.query(indexQuery);
    }

    await client.query('COMMIT');
    console.log('✅ Database tables and indexes initialized successfully');
    return true;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to initialize database tables:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get database statistics and health metrics
 */
async function getDatabaseHealth(pool) {
  try {
    const client = await pool.connect();
    try {
      const [connectionStats, tableStats] = await Promise.all([
        client.query(`
          SELECT 
            count(*) as total_connections,
            count(*) FILTER (WHERE state = 'active') as active_connections,
            count(*) FILTER (WHERE state = 'idle') as idle_connections
          FROM pg_stat_activity 
          WHERE datname = current_database()
        `),
        client.query(`
          SELECT 
            schemaname,
            tablename,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            n_live_tup as live_tuples,
            n_dead_tup as dead_tuples
          FROM pg_stat_user_tables 
          WHERE tablename IN ('processed_content', 'upload_sessions')
        `)
      ]);

      return {
        status: 'healthy',
        connections: connectionStats.rows[0],
        poolStats: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount
        },
        tables: tableStats.rows
      };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

module.exports = {
  createDatabasePool,
  testDatabaseConnection,
  initializeDatabaseTables,
  getDatabaseHealth,
  config: config.database
};