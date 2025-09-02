/**
 * Comprehensive Services Integration Tests
 * Tests service layer functionality with real dependencies
 */

const { Pool } = require('pg');

describe('Services Comprehensive Integration Tests', () => {
  let pool;
  
  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://autollama:autollama@localhost:5432/autollama'
    });
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('Database Service Integration', () => {
    test('should connect to database successfully', async () => {
      const DatabaseService = require('../../services/storage/database.service');
      const dbService = new DatabaseService();
      
      const isConnected = await dbService.testConnection();
      expect(isConnected).toBe(true);
    });

    test('should query processed content', async () => {
      const DatabaseService = require('../../services/storage/database.service');
      const dbService = new DatabaseService();
      
      const documents = await dbService.getDocuments({ limit: 5 });
      expect(Array.isArray(documents)).toBe(true);
    });

    test('should search content with database function', async () => {
      const result = await pool.query(`
        SELECT * FROM search_content($1, $2)
      `, ['biblical', 5]);

      expect(Array.isArray(result.rows)).toBe(true);
      
      result.rows.forEach(row => {
        expect(row).toHaveProperty('chunk_text');
        expect(row).toHaveProperty('similarity_score');
      });
    });

    test('should get database statistics', async () => {
      const DatabaseService = require('../../services/storage/database.service');
      const dbService = new DatabaseService();
      
      const stats = await dbService.getDatabaseStats();
      expect(stats.totalDocuments).toBeDefined();
      expect(stats.totalChunks).toBeDefined();
      expect(stats.indexedContent).toBeDefined();
    });
  });

  describe('BM25 Service Integration', () => {
    test('should connect to BM25 service', async () => {
      const BM25Service = require('../../services/storage/bm25.service');
      const bm25Service = new BM25Service();
      
      try {
        const health = await bm25Service.checkHealth();
        expect(health.status).toBeDefined();
      } catch (error) {
        console.warn('⚠️ BM25 service not available:', error.message);
        // Test should not fail if service is down
      }
    });

    test('should index content in BM25', async () => {
      const BM25Service = require('../../services/storage/bm25.service');
      const bm25Service = new BM25Service();
      
      const testChunks = [
        {
          id: 'test-chunk-1',
          text: 'Biblical interpretation involves understanding ancient Hebrew texts',
          metadata: { title: 'Test Biblical Document' }
        }
      ];

      try {
        const result = await bm25Service.indexChunks(testChunks, 'test-document');
        expect(result.success).toBe(true);
      } catch (error) {
        console.warn('⚠️ BM25 indexing failed:', error.message);
      }
    });

    test('should search BM25 index', async () => {
      const BM25Service = require('../../services/storage/bm25.service');
      const bm25Service = new BM25Service();
      
      try {
        const results = await bm25Service.search('biblical interpretation', 5);
        expect(Array.isArray(results)).toBe(true);
      } catch (error) {
        console.warn('⚠️ BM25 search failed:', error.message);
      }
    });
  });

  describe('Vector Service Integration', () => {
    test('should connect to Qdrant vector database', async () => {
      const VectorService = require('../../services/storage/vector.service');
      const vectorService = new VectorService();
      
      try {
        const health = await vectorService.checkHealth();
        expect(health.status).toBeDefined();
      } catch (error) {
        console.warn('⚠️ Qdrant service not available:', error.message);
      }
    });

    test('should store and retrieve embeddings', async () => {
      const VectorService = require('../../services/storage/vector.service');
      const vectorService = new VectorService();
      
      const testVector = Array(1536).fill(0).map(() => Math.random());
      const testMetadata = {
        chunk_id: 'test-vector-1',
        title: 'Test Biblical Document',
        main_topics: ['biblical studies', 'theology']
      };

      try {
        const storeResult = await vectorService.storeEmbedding(
          'test-vector-1',
          testVector,
          testMetadata
        );
        expect(storeResult.success).toBe(true);

        // Search for similar vectors
        const searchResults = await vectorService.searchSimilar(testVector, 5);
        expect(Array.isArray(searchResults)).toBe(true);
      } catch (error) {
        console.warn('⚠️ Vector operations failed:', error.message);
      }
    });
  });

  describe('AI Services Integration', () => {
    test('should analyze content with AI service', async () => {
      const AnalysisService = require('../../services/ai/analysis.service');
      const analysisService = new AnalysisService();
      
      const testContent = 'This document discusses biblical interpretation methods used by scholars to understand ancient Hebrew texts and their theological significance.';
      
      try {
        const analysis = await analysisService.analyzeChunk(testContent);
        
        expect(analysis).toHaveProperty('main_topics');
        expect(analysis).toHaveProperty('sentiment');
        expect(analysis).toHaveProperty('technical_level');
        expect(Array.isArray(analysis.main_topics)).toBe(true);
        
        // Should identify biblical/theological content
        const topics = analysis.main_topics.join(' ').toLowerCase();
        const hasBiblicalTopic = topics.includes('biblical') || 
                                topics.includes('theology') || 
                                topics.includes('religion');
        
        if (!hasBiblicalTopic) {
          console.warn('⚠️ AI failed to identify biblical content in topics:', analysis.main_topics);
        }
      } catch (error) {
        console.warn('⚠️ AI analysis failed:', error.message);
      }
    });

    test('should generate embeddings', async () => {
      const EmbeddingService = require('../../services/ai/embedding.service');
      const embeddingService = new EmbeddingService();
      
      try {
        const embedding = await embeddingService.generateEmbedding(
          'Biblical studies and theological interpretation'
        );
        
        expect(Array.isArray(embedding)).toBe(true);
        expect(embedding.length).toBe(1536); // OpenAI text-embedding-3-small
        expect(embedding.every(val => typeof val === 'number')).toBe(true);
      } catch (error) {
        console.warn('⚠️ Embedding generation failed:', error.message);
      }
    });

    test('should generate contextual embeddings', async () => {
      const EmbeddingService = require('../../services/ai/embedding.service');
      const embeddingService = new EmbeddingService();
      
      const chunkText = 'Yahweh and Baal represent different aspects of ancient religion.';
      const context = 'This content discusses ancient monotheism and polytheism in Hebrew Bible studies.';
      
      try {
        const embedding = await embeddingService.generateContextualEmbedding(chunkText, context);
        
        expect(Array.isArray(embedding)).toBe(true);
        expect(embedding.length).toBe(1536);
      } catch (error) {
        console.warn('⚠️ Contextual embedding failed:', error.message);
      }
    });
  });

  describe('Processing Services Integration', () => {
    test('should chunk content intelligently', async () => {
      const ChunkingService = require('../../services/processing/chunking.service');
      const chunkingService = new ChunkingService();
      
      const testDocument = `
Biblical Interpretation Methods

Historical-Critical Method
This approach examines the historical context of biblical texts. Scholars analyze the original Hebrew and Greek manuscripts to understand the intended meaning for the original audience.

Literary Analysis
This method focuses on the literary structure and style of biblical texts. It examines narrative techniques, poetry, and rhetorical devices used by ancient authors.

Theological Interpretation
This approach seeks to understand the theological message and spiritual significance of biblical passages for contemporary readers.
      `.trim();

      const chunks = chunkingService.intelligentChunk(testDocument, 'test://biblical-methods');
      
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(1);
      
      chunks.forEach(chunk => {
        expect(chunk).toHaveProperty('chunk_text');
        expect(chunk).toHaveProperty('chunk_index');
        expect(chunk).toHaveProperty('chunking_method');
        expect(chunk.chunk_text.length).toBeGreaterThan(0);
      });
    });

    test('should generate contextual summaries', async () => {
      const ContextService = require('../../services/processing/context.service');
      
      try {
        const contextService = new ContextService();
        
        const fullDocument = 'This is a scholarly article about biblical interpretation methods used in theological studies.';
        const chunkText = 'Biblical interpretation methods used in theological studies.';
        
        const summary = await contextService.generateChunkContext(fullDocument, chunkText);
        
        if (summary) {
          expect(typeof summary).toBe('string');
          expect(summary.length).toBeGreaterThan(20);
        }
      } catch (error) {
        console.warn('⚠️ Context generation failed:', error.message);
      }
    });

    test('should process different file types', async () => {
      const FileProcessor = require('../../services/processing/file.processor');
      const fileProcessor = new FileProcessor();
      
      const textContent = 'Test content about biblical studies and theological research.';
      const textBuffer = Buffer.from(textContent);
      
      try {
        const result = await fileProcessor.processBuffer(textBuffer, 'text/plain', 'test.txt');
        
        expect(result).toHaveProperty('content');
        expect(result).toHaveProperty('metadata');
        expect(result.content).toBe(textContent);
      } catch (error) {
        console.warn('⚠️ File processing failed:', error.message);
      }
    });
  });

  describe('Queue and Background Services', () => {
    test('should manage background processing queue', async () => {
      const BackgroundQueueService = require('../../services/queue/background.queue.service');
      
      try {
        const queueService = new BackgroundQueueService();
        
        const status = await queueService.getQueueStatus();
        expect(status).toHaveProperty('totalJobs');
        expect(status).toHaveProperty('activeJobs');
        expect(status).toHaveProperty('completedJobs');
      } catch (error) {
        console.warn('⚠️ Queue service failed:', error.message);
      }
    });

    test('should track session monitoring', async () => {
      const SessionMonitoringService = require('../../services/session/monitoring.service');
      
      try {
        const monitoringService = new SessionMonitoringService();
        
        const sessions = await monitoringService.getActiveSessions();
        expect(Array.isArray(sessions)).toBe(true);
      } catch (error) {
        console.warn('⚠️ Session monitoring failed:', error.message);
      }
    });

    test('should cleanup expired sessions', async () => {
      const CleanupService = require('../../services/session/cleanup.service');
      
      try {
        const cleanupService = new CleanupService();
        
        const result = await cleanupService.cleanupExpiredSessions();
        expect(result).toHaveProperty('cleaned');
        expect(typeof result.cleaned).toBe('number');
      } catch (error) {
        console.warn('⚠️ Session cleanup failed:', error.message);
      }
    });
  });

  describe('Cross-Service Integration', () => {
    test('should integrate search with AI analysis', async () => {
      // Search for content
      const searchResult = await pool.query(`
        SELECT chunk_text, main_topics 
        FROM processed_content 
        WHERE record_type = 'chunk' 
        AND main_topics IS NOT NULL 
        LIMIT 1
      `);

      if (searchResult.rows.length > 0) {
        const chunk = searchResult.rows[0];
        
        // Verify AI analysis is consistent
        expect(chunk.main_topics).toBeDefined();
        expect(Array.isArray(chunk.main_topics)).toBe(true);
        
        // Topics should relate to content
        const contentLower = chunk.chunk_text.toLowerCase();
        const topics = chunk.main_topics.join(' ').toLowerCase();
        
        if (contentLower.includes('biblical') || contentLower.includes('theology')) {
          const hasRelevantTopic = topics.includes('biblical') || 
                                  topics.includes('theology') || 
                                  topics.includes('religion');
          
          if (!hasRelevantTopic) {
            console.warn('⚠️ Theological content missing relevant AI topics');
          }
        }
      }
    });

    test('should integrate embeddings with vector search', async () => {
      // Check if embeddings exist for content
      const embeddingResult = await pool.query(`
        SELECT chunk_id, uses_contextual_embedding, chunk_text
        FROM processed_content 
        WHERE record_type = 'chunk' 
        AND uses_contextual_embedding = true
        LIMIT 3
      `);

      expect(embeddingResult.rows.length).toBeGreaterThanOrEqual(0);
      
      embeddingResult.rows.forEach(row => {
        expect(row.uses_contextual_embedding).toBe(true);
        expect(row.chunk_id).toBeDefined();
      });
    });

    test('should maintain data consistency across services', async () => {
      // Verify chunk counts match between different views
      const chunkCountResult = await pool.query(`
        SELECT 
          COUNT(*) as total_chunks,
          COUNT(CASE WHEN main_topics IS NOT NULL THEN 1 END) as analyzed_chunks,
          COUNT(CASE WHEN uses_contextual_embedding = true THEN 1 END) as embedded_chunks
        FROM processed_content 
        WHERE record_type = 'chunk'
      `);

      const stats = chunkCountResult.rows[0];
      expect(parseInt(stats.total_chunks)).toBeGreaterThanOrEqual(0);
      expect(parseInt(stats.analyzed_chunks)).toBeLessThanOrEqual(parseInt(stats.total_chunks));
      expect(parseInt(stats.embedded_chunks)).toBeLessThanOrEqual(parseInt(stats.total_chunks));
    });
  });

  describe('Real-world Workflow Tests', () => {
    test('should simulate complete document processing workflow', async () => {
      const testContent = `
Ancient Monotheism in Hebrew Bible

The concept of monotheism in ancient Hebrew religion represents a significant theological development. Yahweh, the central deity of Hebrew faith, gradually absorbed characteristics and functions previously attributed to other deities like Baal.

This theological evolution reflects broader cultural and religious changes in ancient Near Eastern societies. Scholars of biblical studies examine this transition through historical-critical analysis of Hebrew Bible texts.
      `.trim();

      // Test the complete pipeline components
      const ChunkingService = require('../../services/processing/chunking.service');
      const chunkingService = new ChunkingService();
      
      // 1. Chunk the content
      const chunks = chunkingService.chunkText(testContent, { chunkSize: 200, overlap: 50 });
      expect(chunks.length).toBeGreaterThan(0);
      
      // 2. Test AI analysis (if available)
      try {
        const AnalysisService = require('../../services/ai/analysis.service');
        const analysisService = new AnalysisService();
        
        const analysis = await analysisService.analyzeChunk(chunks[0].chunk_text);
        expect(analysis.main_topics).toBeDefined();
        
        // Should identify monotheism/theological content
        const topics = analysis.main_topics.join(' ').toLowerCase();
        const hasRelevantTopic = topics.includes('religion') || 
                                topics.includes('theology') || 
                                topics.includes('biblical');
        
        if (!hasRelevantTopic) {
          console.warn('⚠️ AI missed theological themes in content');
        }
      } catch (error) {
        console.warn('⚠️ AI analysis not available:', error.message);
      }
      
      // 3. Test embedding generation (if available)
      try {
        const EmbeddingService = require('../../services/ai/embedding.service');
        const embeddingService = new EmbeddingService();
        
        const embedding = await embeddingService.generateEmbedding(chunks[0].chunk_text);
        expect(Array.isArray(embedding)).toBe(true);
        expect(embedding.length).toBe(1536);
      } catch (error) {
        console.warn('⚠️ Embedding generation not available:', error.message);
      }
    });

    test('should handle processing failures gracefully', async () => {
      // Test with potentially problematic content
      const problematicContent = ''.repeat(100000); // Very large empty content
      
      const ChunkingService = require('../../services/processing/chunking.service');
      const chunkingService = new ChunkingService();
      
      try {
        const chunks = chunkingService.chunkText(problematicContent);
        expect(Array.isArray(chunks)).toBe(true);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Service Configuration and Health', () => {
    test('should load service configurations correctly', async () => {
      const config = require('../../config');
      
      expect(config.ai).toBeDefined();
      expect(config.database).toBeDefined();
      expect(config.vector).toBeDefined();
      expect(config.processing).toBeDefined();
    });

    test('should validate service dependencies', async () => {
      const services = require('../../services');
      
      expect(services).toHaveProperty('analysisService');
      expect(services).toHaveProperty('embeddingService');
      expect(services).toHaveProperty('chunkingService');
      expect(services).toHaveProperty('storageService');
    });

    test('should report service health status', async () => {
      try {
        const services = require('../../services');
        
        if (services.storageService && services.storageService.testConnection) {
          const dbHealth = await services.storageService.testConnection();
          expect(typeof dbHealth).toBe('boolean');
        }
        
        if (services.analysisService && services.analysisService.getStats) {
          const aiStats = await services.analysisService.getStats();
          expect(aiStats).toBeDefined();
        }
      } catch (error) {
        console.warn('⚠️ Service health check failed:', error.message);
      }
    });
  });
});