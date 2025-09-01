/**
 * Unit tests for services
 * Tests the core functionality of extracted services
 */

const ChunkingService = require('../../services/processing/chunking.service');
const ContextService = require('../../services/processing/context.service');
const OpenAIService = require('../../services/ai/openai.service');

describe('ChunkingService', () => {
  let chunkingService;

  beforeEach(() => {
    chunkingService = new ChunkingService({
      chunkSize: 500,
      chunkOverlap: 50
    });
  });

  describe('chunkText', () => {
    it('should create chunks from text content', () => {
      const content = 'This is a test content. '.repeat(50); // ~1200 chars
      const url = 'https://example.com/test';
      
      const chunks = chunkingService.chunkText(content, url);
      
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toHaveProperty('chunk_id');
      expect(chunks[0]).toHaveProperty('chunk_text');
      expect(chunks[0]).toHaveProperty('chunk_index');
      expect(chunks[0]).toHaveProperty('original_url', url);
    });

    it('should handle empty content', () => {
      expect(() => {
        chunkingService.chunkText('', 'https://example.com');
      }).toThrow('No content to chunk');
    });

    it('should validate chunk parameters', () => {
      expect(() => {
        chunkingService.chunkText('test content', 'https://example.com', {
          chunkSize: 50000 // Too large
        });
      }).toThrow('Chunk size must be between');
    });

    it('should apply adaptive chunking for large content', () => {
      const largeContent = 'This is a large content. '.repeat(50000); // > 1MB
      const chunks = chunkingService.chunkText(largeContent, 'https://example.com');
      
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].chunk_size_used).toBeGreaterThan(500); // Should be larger than test default (500)
    });
  });

  describe('getChunkingStats', () => {
    it('should return chunking statistics', () => {
      const content = 'Test content for statistics';
      const stats = chunkingService.getChunkingStats(content);
      
      expect(stats).toHaveProperty('contentLength');
      expect(stats).toHaveProperty('estimatedChunks');
      expect(stats).toHaveProperty('processingTime');
      expect(stats.contentLength).toBe(content.length);
    });
  });

  describe('smartChunk', () => {
    it('should create sentence-aware chunks', () => {
      const content = 'First sentence. Second sentence. Third sentence.';
      const chunks = chunkingService.smartChunk(content, 'https://example.com');
      
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toHaveProperty('chunk_text');
      expect(chunks[0].overlap_used).toBe(0); // Smart chunking doesn't use traditional overlap
    });
  });
});

describe('ContextService', () => {
  let contextService;
  let mockOpenAIClient;

  beforeEach(() => {
    mockOpenAIClient = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    };

    contextService = new ContextService(mockOpenAIClient, {
      enabled: true,
      model: 'gpt-4o-mini',
      batchSize: 2
    });
  });

  describe('generateChunkContext', () => {
    it('should generate contextual summary when enabled', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'This chunk discusses the main topic of the document.'
          }
        }]
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      const fullDocument = 'This is the full document content with multiple sections.';
      const chunkText = 'This is a specific chunk.';

      const result = await contextService.generateChunkContext(fullDocument, chunkText);

      expect(result).toBe('This chunk discusses the main topic of the document.');
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          max_tokens: 150,
          temperature: 0.2
        })
      );
    });

    it('should return null when disabled', async () => {
      const disabledService = new ContextService(mockOpenAIClient, { enabled: false });
      
      const result = await disabledService.generateChunkContext('full doc', 'chunk');
      
      expect(result).toBeNull();
      expect(mockOpenAIClient.chat.completions.create).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockOpenAIClient.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await contextService.generateChunkContext('full doc', 'chunk');

      expect(result).toBeNull();
    });
  });

  describe('generateBatchContext', () => {
    it('should process multiple chunks in batches', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Contextual summary'
          }
        }]
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      const chunks = [
        { chunk_text: 'First chunk' },
        { chunk_text: 'Second chunk' },
        { chunk_text: 'Third chunk' }
      ];

      const results = await contextService.generateBatchContext('full document', chunks);

      expect(results).toHaveLength(3);
      expect(results.every(result => result === 'Contextual summary')).toBe(true);
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('getStats', () => {
    it('should return service statistics', () => {
      const stats = contextService.getStats();
      
      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('model');
      expect(stats).toHaveProperty('batchSize');
      expect(stats.enabled).toBe(true);
      expect(stats.model).toBe('gpt-4o-mini');
    });
  });
});

describe('OpenAIService', () => {
  let openaiService;
  let mockOpenAIClient;

  beforeEach(() => {
    mockOpenAIClient = {
      chat: {
        completions: {
          create: jest.fn()
        }
      },
      embeddings: {
        create: jest.fn()
      }
    };

    openaiService = new OpenAIService({
      apiKey: 'sk-test-key',
      defaultModel: 'gpt-4o-mini'
    });

    // Replace the client with our mock
    openaiService.client = mockOpenAIClient;
    openaiService.isInitialized = true;
  });

  describe('analyzeChunk', () => {
    it('should analyze chunk and return structured data', async () => {
      const mockAnalysis = {
        title: 'Test Title',
        summary: 'Test summary',
        category: 'general',
        sentiment: 'neutral',
        tags: ['test'],
        key_concepts: ['concept'],
        content_type: 'article',
        technical_level: 'beginner',
        emotions: ['neutral'],
        key_entities: {
          people: [],
          organizations: [],
          locations: []
        },
        main_topics: ['testing']
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify(mockAnalysis)
          }
        }],
        usage: { total_tokens: 150 }
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await openaiService.analyzeChunk('Test chunk content');

      expect(result).toEqual(expect.objectContaining(mockAnalysis));
      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' }
        })
      );
    });

    it('should handle invalid JSON response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON'
          }
        }]
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      await expect(openaiService.analyzeChunk('Test content')).rejects.toThrow();
    });
  });

  describe('generateEmbedding', () => {
    it('should generate embedding vector', async () => {
      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
      const mockResponse = {
        data: [{
          embedding: mockEmbedding
        }],
        usage: { total_tokens: 50 }
      };

      mockOpenAIClient.embeddings.create.mockResolvedValue(mockResponse);

      const result = await openaiService.generateEmbedding('Test text');

      expect(result).toEqual(mockEmbedding);
      expect(mockOpenAIClient.embeddings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'text-embedding-3-small',
          input: 'Test text'
        })
      );
    });

    it('should combine context with text when provided', async () => {
      const mockEmbedding = Array(1536).fill(0.5);
      const mockResponse = {
        data: [{ embedding: mockEmbedding }],
        usage: { total_tokens: 60 }
      };

      mockOpenAIClient.embeddings.create.mockResolvedValue(mockResponse);

      await openaiService.generateEmbedding('Test text', 'Context summary');

      expect(mockOpenAIClient.embeddings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          input: 'Context summary\n\nTest text'
        })
      );
    });
  });

  describe('testConnection', () => {
    it('should return success for valid connection', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'test successful'
          }
        }],
        usage: { total_tokens: 10 }
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await openaiService.testConnection();

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('tokensUsed');
    });

    it('should return failure for connection errors', async () => {
      mockOpenAIClient.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await openaiService.testConnection();

      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
    });
  });

  describe('getStats', () => {
    it('should return service statistics', () => {
      const stats = openaiService.getStats();
      
      expect(stats).toHaveProperty('isInitialized');
      expect(stats).toHaveProperty('hasValidApiKey');
      expect(stats).toHaveProperty('defaultModel');
      expect(stats.isInitialized).toBe(true);
      expect(stats.defaultModel).toBe('gpt-4o-mini');
    });
  });
});