/**
 * v2.3 Schema Enhancements
 * 🦙 Add contextual embeddings and enhanced metadata support
 */

module.exports = {
  /**
   * Add v2.3 enhancements
   */
  async up(client, db) {
    console.log('🦙 Adding v2.3 enhancements...');
    
    // Add contextual embeddings metadata
    const newColumns = [
      'document_type VARCHAR(100)',
      'chunking_method VARCHAR(50) DEFAULT \'intelligent\'',
      'semantic_boundaries TEXT',
      'context_generation_method VARCHAR(50) DEFAULT \'enhanced\'',
      'document_position VARCHAR(50)',
      'structural_context TEXT',
      'uses_contextual_embedding BOOLEAN DEFAULT FALSE',
      'contextual_summary TEXT',
      'contextual_keywords TEXT',
      'boundary_score FLOAT',
      'context_quality_score FLOAT'
    ];
    
    for (const column of newColumns) {
      try {
        await client.query(`ALTER TABLE processed_content ADD COLUMN IF NOT EXISTS ${column}`);
      } catch (error) {
        // Column might already exist
        if (!error.message.includes('already exists') && !error.message.includes('duplicate column')) {
          console.warn(`Warning adding column: ${error.message}`);
        }
      }
    }
    
    // Add updated_at column
    try {
      await client.query(`
        ALTER TABLE processed_content 
        ADD COLUMN IF NOT EXISTS updated_at ${db.config.type === 'sqlite' ? 'TEXT DEFAULT (datetime(\'now\'))' : 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'}
      `);
    } catch (error) {
      // Column might already exist
    }
    
    // Add document hierarchy columns
    try {
      await client.query(`
        ALTER TABLE processed_content 
        ADD COLUMN IF NOT EXISTS record_type VARCHAR(20) DEFAULT 'chunk'
      `);
      
      await client.query(`
        ALTER TABLE processed_content 
        ADD COLUMN IF NOT EXISTS parent_document_id INTEGER
      `);
    } catch (error) {
      // Columns might already exist
    }
    
    // Add indexes for new columns
    await client.query('CREATE INDEX IF NOT EXISTS idx_processed_content_document_type ON processed_content(document_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_processed_content_record_type ON processed_content(record_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_processed_content_parent_id ON processed_content(parent_document_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_processed_content_contextual ON processed_content(uses_contextual_embedding)');
    
    // Update existing records to have proper record_type
    await client.query(`
      UPDATE processed_content 
      SET record_type = CASE 
        WHEN chunk_index = -1 OR chunk_index IS NULL THEN 'document'
        ELSE 'chunk'
      END
      WHERE record_type IS NULL OR record_type = ''
    `);
    
    console.log('✅ v2.3 enhancements added');
  },

  /**
   * Rollback v2.3 enhancements
   */
  async down(client, db) {
    console.log('🦙 Rolling back v2.3 enhancements...');
    
    const columnsToRemove = [
      'document_type',
      'chunking_method',
      'semantic_boundaries',
      'context_generation_method',
      'document_position',
      'structural_context',
      'uses_contextual_embedding',
      'contextual_summary',
      'contextual_keywords',
      'boundary_score',
      'context_quality_score',
      'updated_at',
      'record_type',
      'parent_document_id'
    ];
    
    // Note: SQLite doesn't support DROP COLUMN, so we'd need to recreate the table
    if (db.config.type === 'sqlite') {
      console.log('⚠️  SQLite rollback requires table recreation (not implemented for safety)');
      return;
    }
    
    // For PostgreSQL, drop columns
    for (const column of columnsToRemove) {
      try {
        await client.query(`ALTER TABLE processed_content DROP COLUMN IF EXISTS ${column}`);
      } catch (error) {
        // Column might not exist
      }
    }
    
    console.log('✅ v2.3 enhancements rolled back');
  }
};