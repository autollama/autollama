/**
 * Unit Tests for Embedding Service
 * Tests the embedding generation and management functionality
 */

const EmbeddingService = require('../../../services/ai/embedding.service');

// Mock the OpenAI service
const mockOpenAIService = {
  generateEmbedding: jest.fn(),
  isReady: jest.fn(),
  getStats: jest.fn()
};

describe('EmbeddingService', () => {
  let embeddingService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    const config = {
      model: 'text-embedding-3-small',
      batchSize: 10,
      maxRetries: 3,
      cacheEnabled: true,
      cacheTtl: 3600
    };

    embeddingService = new EmbeddingService(mockOpenAIService, config);
    
    // Setup default mock responses
    mockOpenAIService.isReady.mockReturnValue(true);
    mockOpenAIService.getStats.mockReturnValue({
      requestCount: 0,
      errorCount: 0
    });
  });

  describe('constructor', () => {
    test('should initialize with correct configuration', () => {
      expect(embeddingService.config.model).toBe('text-embedding-3-small');
      expect(embeddingService.config.batchSize).toBe(10);
      expect(embeddingService.config.maxRetries).toBe(3);
    });

    test('should initialize with default values', () => {
      const service = new EmbeddingService(mockOpenAIService);
      expect(service.config.model).toBe('text-embedding-3-small');
      expect(service.config.batchSize).toBe(100);
      expect(service.config.maxRetries).toBe(3);
    });
  });

  describe('generateEmbedding', () => {
    test('should generate embedding successfully', async () => {
      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
      const mockResponse = {
        success: true,
        embedding: mockEmbedding,
        usage: { prompt_tokens: 5, total_tokens: 5 },
        model: 'text-embedding-3-small'
      };

      mockOpenAIService.generateEmbedding.mockResolvedValue(mockResponse);

      const result = await embeddingService.generateEmbedding('Test text');

      expect(result).toEqual({
        success: true,
        embedding: mockEmbedding,
        dimensions: 1536,
        usage: mockResponse.usage,
        model: 'text-embedding-3-small',
        cached: false
      });

      expect(mockOpenAIService.generateEmbedding).toHaveBeenCalledWith(
        'Test text',
        { model: 'text-embedding-3-small' }
      );
    });

    test('should handle embedding generation failure', async () => {
      const mockResponse = {
        success: false,
        error: 'API Error',
        errorCode: 429
      };

      mockOpenAIService.generateEmbedding.mockResolvedValue(mockResponse);

      const result = await embeddingService.generateEmbedding('Test text');

      expect(result).toEqual({
        success: false,
        error: 'API Error',
        errorCode: 429,
        model: 'text-embedding-3-small',
        cached: false
      });
    });

    test('should return error when OpenAI service not ready', async () => {
      mockOpenAIService.isReady.mockReturnValue(false);

      const result = await embeddingService.generateEmbedding('Test text');

      expect(result).toEqual({
        success: false,
        error: 'OpenAI service not ready',
        errorCode: 'SERVICE_NOT_READY',
        model: 'text-embedding-3-small',
        cached: false
      });
    });

    test('should use custom model when provided', async () => {
      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
      const mockResponse = {
        success: true,
        embedding: mockEmbedding,
        usage: { prompt_tokens: 5, total_tokens: 5 },
        model: 'text-embedding-ada-002'
      };

      mockOpenAIService.generateEmbedding.mockResolvedValue(mockResponse);

      const options = { model: 'text-embedding-ada-002' };
      await embeddingService.generateEmbedding('Test text', options);

      expect(mockOpenAIService.generateEmbedding).toHaveBeenCalledWith(
        'Test text',
        { model: 'text-embedding-ada-002' }
      );
    });
  });

  describe('generateBatchEmbeddings', () => {
    test('should generate embeddings for multiple texts', async () => {
      const texts = ['Text 1', 'Text 2', 'Text 3'];
      const mockEmbedding1 = Array(1536).fill(0).map(() => Math.random());
      const mockEmbedding2 = Array(1536).fill(0).map(() => Math.random());
      const mockEmbedding3 = Array(1536).fill(0).map(() => Math.random());

      mockOpenAIService.generateEmbedding
        .mockResolvedValueOnce({
          success: true,
          embedding: mockEmbedding1,
          usage: { prompt_tokens: 2, total_tokens: 2 }
        })
        .mockResolvedValueOnce({
          success: true,
          embedding: mockEmbedding2,
          usage: { prompt_tokens: 2, total_tokens: 2 }
        })
        .mockResolvedValueOnce({
          success: true,
          embedding: mockEmbedding3,
          usage: { prompt_tokens: 2, total_tokens: 2 }
        });

      const result = await embeddingService.generateBatchEmbeddings(texts);

      expect(result).toEqual({
        success: true,
        embeddings: [
          { text: 'Text 1', embedding: mockEmbedding1, success: true },
          { text: 'Text 2', embedding: mockEmbedding2, success: true },
          { text: 'Text 3', embedding: mockEmbedding3, success: true }
        ],
        totalUsage: {
          prompt_tokens: 6,
          total_tokens: 6
        },
        successCount: 3,
        failureCount: 0,
        cached: false
      });
    });

    test('should handle partial failures in batch', async () => {
      const texts = ['Text 1', 'Text 2'];
      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());

      mockOpenAIService.generateEmbedding
        .mockResolvedValueOnce({
          success: true,
          embedding: mockEmbedding,
          usage: { prompt_tokens: 2, total_tokens: 2 }
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'API Error',
          errorCode: 429
        });

      const result = await embeddingService.generateBatchEmbeddings(texts);

      expect(result.success).toBe(true);
      expect(result.embeddings).toHaveLength(2);
      expect(result.embeddings[0].success).toBe(true);
      expect(result.embeddings[1].success).toBe(false);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
    });

    test('should handle empty text array', async () => {
      const result = await embeddingService.generateBatchEmbeddings([]);

      expect(result).toEqual({
        success: true,
        embeddings: [],
        totalUsage: {
          prompt_tokens: 0,
          total_tokens: 0
        },
        successCount: 0,
        failureCount: 0,
        cached: false
      });
    });

    test('should respect batch size configuration', async () => {
      const service = new EmbeddingService(mockOpenAIService, { batchSize: 2 });
      const texts = ['Text 1', 'Text 2', 'Text 3', 'Text 4', 'Text 5'];

      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
      mockOpenAIService.generateEmbedding.mockResolvedValue({
        success: true,
        embedding: mockEmbedding,
        usage: { prompt_tokens: 2, total_tokens: 2 }
      });

      await service.generateBatchEmbeddings(texts);

      // Should be called 5 times (one for each text)
      expect(mockOpenAIService.generateEmbedding).toHaveBeenCalledTimes(5);
    });
  });

  describe('generateContextualEmbedding', () => {
    test('should generate contextual embedding with context', async () => {
      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
      const mockResponse = {
        success: true,
        embedding: mockEmbedding,
        usage: { prompt_tokens: 10, total_tokens: 10 }
      };

      mockOpenAIService.generateEmbedding.mockResolvedValue(mockResponse);

      const text = 'Main content';
      const context = 'This is additional context';
      const result = await embeddingService.generateContextualEmbedding(text, context);

      expect(result).toEqual({
        success: true,
        embedding: mockEmbedding,
        dimensions: 1536,
        usage: mockResponse.usage,
        model: 'text-embedding-3-small',
        cached: false,
        contextual: true
      });

      // Should combine text and context
      const expectedText = `Context: ${context}\n\nContent: ${text}`;
      expect(mockOpenAIService.generateEmbedding).toHaveBeenCalledWith(
        expectedText,
        { model: 'text-embedding-3-small' }
      );
    });

    test('should handle missing context gracefully', async () => {
      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
      const mockResponse = {
        success: true,
        embedding: mockEmbedding,
        usage: { prompt_tokens: 5, total_tokens: 5 }
      };

      mockOpenAIService.generateEmbedding.mockResolvedValue(mockResponse);

      const result = await embeddingService.generateContextualEmbedding('Main content');

      expect(result.contextual).toBe(false);
      expect(mockOpenAIService.generateEmbedding).toHaveBeenCalledWith(
        'Main content',
        { model: 'text-embedding-3-small' }
      );
    });
  });

  describe('calculateSimilarity', () => {
    test('should calculate cosine similarity correctly', () => {
      const embedding1 = [1, 0, 0];
      const embedding2 = [0, 1, 0];
      const embedding3 = [1, 0, 0];

      const similarity1 = embeddingService.calculateSimilarity(embedding1, embedding2);
      const similarity2 = embeddingService.calculateSimilarity(embedding1, embedding3);

      expect(similarity1).toBe(0); // Orthogonal vectors
      expect(similarity2).toBe(1); // Identical vectors
    });

    test('should handle zero vectors', () => {
      const embedding1 = [0, 0, 0];
      const embedding2 = [1, 1, 1];

      const similarity = embeddingService.calculateSimilarity(embedding1, embedding2);
      expect(similarity).toBe(0);
    });

    test('should handle different dimensional vectors', () => {
      const embedding1 = [1, 0];
      const embedding2 = [1, 0, 0];

      expect(() => {
        embeddingService.calculateSimilarity(embedding1, embedding2);
      }).toThrow('Embeddings must have the same dimensions');
    });
  });

  describe('findSimilarEmbeddings', () => {
    test('should find similar embeddings above threshold', () => {
      const queryEmbedding = [1, 0, 0];
      const embeddings = [
        { id: '1', embedding: [1, 0, 0], metadata: { title: 'Doc 1' } },
        { id: '2', embedding: [0, 1, 0], metadata: { title: 'Doc 2' } },
        { id: '3', embedding: [0.9, 0.1, 0], metadata: { title: 'Doc 3' } },
        { id: '4', embedding: [-1, 0, 0], metadata: { title: 'Doc 4' } }
      ];

      const results = embeddingService.findSimilarEmbeddings(
        queryEmbedding,
        embeddings,
        { threshold: 0.5, limit: 3 }
      );

      expect(results).toHaveLength(2); // Only docs 1 and 3 should match
      expect(results[0].id).toBe('1');
      expect(results[0].similarity).toBe(1);
      expect(results[1].id).toBe('3');
      expect(results[1].similarity).toBeCloseTo(0.9, 1);
    });

    test('should respect limit parameter', () => {
      const queryEmbedding = [1, 0];
      const embeddings = [
        { id: '1', embedding: [1, 0] },
        { id: '2', embedding: [0.9, 0.1] },
        { id: '3', embedding: [0.8, 0.2] }
      ];

      const results = embeddingService.findSimilarEmbeddings(
        queryEmbedding,
        embeddings,
        { limit: 2 }
      );

      expect(results).toHaveLength(2);
    });

    test('should return empty array when no embeddings match threshold', () => {
      const queryEmbedding = [1, 0];
      const embeddings = [
        { id: '1', embedding: [0, 1] },
        { id: '2', embedding: [-1, 0] }
      ];

      const results = embeddingService.findSimilarEmbeddings(
        queryEmbedding,
        embeddings,
        { threshold: 0.9 }
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    test('should return embedding service statistics', () => {
      const stats = embeddingService.getStats();

      expect(stats).toEqual({
        openaiServiceReady: true,
        model: 'text-embedding-3-small',
        batchSize: 10,
        requestCount: expect.any(Number),
        batchRequestCount: expect.any(Number),
        totalEmbeddingsGenerated: expect.any(Number),
        totalTokensUsed: expect.any(Number),
        averageResponseTime: expect.any(Number),
        errorCount: expect.any(Number),
        cacheHits: expect.any(Number),
        cacheHitRate: expect.any(Number),
        lastRequestTime: expect.any(String)
      });
    });
  });

  describe('close', () => {
    test('should close service gracefully', async () => {
      await expect(embeddingService.close()).resolves.toBeUndefined();
    });
  });
});