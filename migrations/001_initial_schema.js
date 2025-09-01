/**
 * Initial AutoLlama Database Schema
 * 🦙 Creates the foundation tables for document processing and RAG
 */

module.exports = {
  /**
   * Create initial schema
   */
  async up(client, db) {
    console.log('🦙 Creating initial schema...');
    
    // Main content table
    await client.query(`
      CREATE TABLE IF NOT EXISTS processed_content (
        id ${db.config.type === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY'},
        airtable_id VARCHAR(255) UNIQUE,
        url TEXT NOT NULL,
        title VARCHAR(500),
        summary TEXT,
        chunk_text TEXT,
        chunk_id VARCHAR(255) UNIQUE NOT NULL,
        chunk_index INTEGER,
        sentiment VARCHAR(50),
        emotions ${db.config.type === 'sqlite' ? 'TEXT' : 'TEXT[]'},
        category VARCHAR(100),
        content_type VARCHAR(50),
        technical_level VARCHAR(50),
        main_topics ${db.config.type === 'sqlite' ? 'TEXT' : 'TEXT[]'},
        key_concepts ${db.config.type === 'sqlite' ? 'TEXT' : 'TEXT[]'},
        tags TEXT,
        key_entities ${db.config.type === 'sqlite' ? 'TEXT' : 'JSONB'},
        embedding_status VARCHAR(50) DEFAULT 'pending',
        processing_status VARCHAR(50) DEFAULT 'processing',
        created_time ${db.config.type === 'sqlite' ? 'TEXT DEFAULT (datetime(\'now\'))' : 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'},
        processed_date ${db.config.type === 'sqlite' ? 'TEXT DEFAULT (datetime(\'now\'))' : 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'},
        sent_to_li ${db.config.type === 'sqlite' ? 'INTEGER DEFAULT 0' : 'BOOLEAN DEFAULT FALSE'},
        CONSTRAINT unique_chunk_id UNIQUE (chunk_id)
      )
    `);

    // Upload sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS upload_sessions (
        id ${db.config.type === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY'},
        session_id VARCHAR(255) UNIQUE NOT NULL,
        filename VARCHAR(500),
        url TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        total_chunks INTEGER DEFAULT 0,
        processed_chunks INTEGER DEFAULT 0,
        error_message TEXT,
        created_at ${db.config.type === 'sqlite' ? 'TEXT DEFAULT (datetime(\'now\'))' : 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${db.config.type === 'sqlite' ? 'TEXT DEFAULT (datetime(\'now\'))' : 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'},
        completed_at ${db.config.type === 'sqlite' ? 'TEXT' : 'TIMESTAMP'}
      )
    `);

    // Settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id ${db.config.type === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY'},
        key_name VARCHAR(255) UNIQUE NOT NULL,
        value ${db.config.type === 'sqlite' ? 'TEXT' : 'JSONB'},
        description TEXT,
        created_at ${db.config.type === 'sqlite' ? 'TEXT DEFAULT (datetime(\'now\'))' : 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'},
        updated_at ${db.config.type === 'sqlite' ? 'TEXT DEFAULT (datetime(\'now\'))' : 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'}
      )
    `);

    // Create indexes for performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_processed_content_url ON processed_content(url)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_processed_content_status ON processed_content(processing_status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_processed_content_created ON processed_content(created_time)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key_name)');
    
    // For SQLite, enable full-text search
    if (db.config.type === 'sqlite') {
      await db.getAdapter().enableFTS('processed_content', ['title', 'summary', 'chunk_text', 'tags']);
    }
    
    console.log('✅ Initial schema created');
  },

  /**
   * Rollback initial schema
   */
  async down(client, db) {
    console.log('🦙 Rolling back initial schema...');
    
    // Drop tables in reverse order
    await client.query('DROP TABLE IF EXISTS settings');
    await client.query('DROP TABLE IF EXISTS upload_sessions');
    
    // Drop FTS table if SQLite
    if (db.config.type === 'sqlite') {
      await client.query('DROP TABLE IF EXISTS processed_content_fts');
    }
    
    await client.query('DROP TABLE IF EXISTS processed_content');
    
    console.log('✅ Initial schema rolled back');
  }
};