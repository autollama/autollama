/**
 * Unit Tests for Analysis Service
 * Tests content analysis and metadata extraction functionality
 */

const AnalysisService = require('../../../services/ai/analysis.service');

// Mock the OpenAI service
const mockOpenAIService = {
  generateStructuredCompletion: jest.fn(),
  isReady: jest.fn(),
  getStats: jest.fn()
};

describe('AnalysisService', () => {
  let analysisService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    const config = {
      model: 'gpt-4o-mini',
      maxRetries: 3,
      timeout: 30000,
      batchSize: 5
    };

    analysisService = new AnalysisService(mockOpenAIService, config);
    
    // Setup default mock responses
    mockOpenAIService.isReady.mockReturnValue(true);
    mockOpenAIService.getStats.mockReturnValue({
      requestCount: 0,
      errorCount: 0
    });
  });

  describe('constructor', () => {
    test('should initialize with correct configuration', () => {
      expect(analysisService.config.model).toBe('gpt-4o-mini');
      expect(analysisService.config.maxRetries).toBe(3);
      expect(analysisService.config.timeout).toBe(30000);
    });

    test('should initialize with default values', () => {
      const service = new AnalysisService(mockOpenAIService);
      expect(service.config.model).toBe('gpt-4o-mini');
      expect(service.config.maxRetries).toBe(3);
      expect(service.config.timeout).toBe(30000);
    });
  });

  describe('analyzeContent', () => {
    const mockAnalysisResponse = {
      success: true,
      data: {
        sentiment: 'positive',
        emotions: ['joy', 'excitement'],
        category: 'technology',
        content_type: 'article',
        technical_level: 'intermediate',
        main_topics: ['artificial intelligence', 'machine learning'],
        key_concepts: ['neural networks', 'deep learning'],
        summary: 'An article about AI and machine learning concepts'
      },
      usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 }
    };

    test('should analyze content successfully', async () => {
      mockOpenAIService.generateStructuredCompletion.mockResolvedValue(mockAnalysisResponse);

      const result = await analysisService.analyzeContent('Test content about AI');

      expect(result).toEqual({
        success: true,
        analysis: mockAnalysisResponse.data,
        usage: mockAnalysisResponse.usage,
        model: 'gpt-4o-mini',
        cached: false
      });

      expect(mockOpenAIService.generateStructuredCompletion).toHaveBeenCalledWith(
        expect.stringContaining('Test content about AI'),
        expect.any(Object),
        expect.objectContaining({ model: 'gpt-4o-mini' })
      );
    });

    test('should handle analysis failure', async () => {
      const mockError = {
        success: false,
        error: 'API Error',
        errorCode: 429
      };

      mockOpenAIService.generateStructuredCompletion.mockResolvedValue(mockError);

      const result = await analysisService.analyzeContent('Test content');

      expect(result).toEqual({
        success: false,
        error: 'API Error',
        errorCode: 429,
        model: 'gpt-4o-mini',
        cached: false
      });
    });

    test('should return error when OpenAI service not ready', async () => {
      mockOpenAIService.isReady.mockReturnValue(false);

      const result = await analysisService.analyzeContent('Test content');

      expect(result).toEqual({
        success: false,
        error: 'OpenAI service not ready',
        errorCode: 'SERVICE_NOT_READY',
        model: 'gpt-4o-mini',
        cached: false
      });
    });

    test('should handle empty content', async () => {
      const result = await analysisService.analyzeContent('');

      expect(result).toEqual({
        success: false,
        error: 'Content is required for analysis',
        errorCode: 'INVALID_INPUT',
        model: 'gpt-4o-mini',
        cached: false
      });
    });

    test('should use custom options', async () => {
      mockOpenAIService.generateStructuredCompletion.mockResolvedValue(mockAnalysisResponse);

      const options = {
        model: 'gpt-4',
        includeTopics: false,
        includeConcepts: false
      };

      await analysisService.analyzeContent('Test content', options);

      expect(mockOpenAIService.generateStructuredCompletion).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ model: 'gpt-4' })
      );
    });
  });

  describe('generateSummary', () => {
    test('should generate summary successfully', async () => {
      const mockSummaryResponse = {
        success: true,
        data: {
          summary: 'This is a comprehensive summary of the content.',
          key_points: ['Point 1', 'Point 2', 'Point 3'],
          word_count: 250
        },
        usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 }
      };

      mockOpenAIService.generateStructuredCompletion.mockResolvedValue(mockSummaryResponse);

      const result = await analysisService.generateSummary('Long content to summarize...');

      expect(result).toEqual({
        success: true,
        summary: mockSummaryResponse.data,
        usage: mockSummaryResponse.usage,
        model: 'gpt-4o-mini',
        cached: false
      });
    });

    test('should handle different summary lengths', async () => {
      const mockResponse = {
        success: true,
        data: { summary: 'Brief summary', key_points: ['Point 1'] },
        usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 }
      };

      mockOpenAIService.generateStructuredCompletion.mockResolvedValue(mockResponse);

      await analysisService.generateSummary('Content', { length: 'brief' });

      const call = mockOpenAIService.generateStructuredCompletion.mock.calls[0];
      expect(call[0]).toContain('brief summary');
    });

    test('should handle summary generation failure', async () => {
      const mockError = {
        success: false,
        error: 'Summary generation failed',
        errorCode: 500
      };

      mockOpenAIService.generateStructuredCompletion.mockResolvedValue(mockError);

      const result = await analysisService.generateSummary('Content');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Summary generation failed');
    });
  });

  describe('generateContextualSummary', () => {
    test('should generate contextual summary with document context', async () => {
      const mockResponse = {
        success: true,
        data: {
          contextual_summary: 'This chunk discusses AI in the context of the broader document about technology trends.',
          relationship_to_document: 'Provides specific examples of AI applications mentioned earlier',
          key_connections: ['machine learning', 'automation']
        },
        usage: { prompt_tokens: 150, completion_tokens: 40, total_tokens: 190 }
      };

      mockOpenAIService.generateStructuredCompletion.mockResolvedValue(mockResponse);

      const chunkText = 'This chunk is about AI applications';
      const documentContext = {
        title: 'Technology Trends 2024',
        summary: 'Overview of emerging technologies',
        main_topics: ['AI', 'blockchain', 'IoT']
      };

      const result = await analysisService.generateContextualSummary(chunkText, documentContext);

      expect(result).toEqual({
        success: true,
        contextualSummary: mockResponse.data,
        usage: mockResponse.usage,
        model: 'gpt-4o-mini',
        cached: false
      });

      const call = mockOpenAIService.generateStructuredCompletion.mock.calls[0];
      expect(call[0]).toContain('Technology Trends 2024');
      expect(call[0]).toContain(chunkText);
    });

    test('should handle missing document context', async () => {
      const result = await analysisService.generateContextualSummary('Chunk text');

      expect(result).toEqual({
        success: false,
        error: 'Document context is required for contextual summary',
        errorCode: 'INVALID_INPUT',
        model: 'gpt-4o-mini',
        cached: false
      });
    });
  });

  describe('extractKeywords', () => {
    test('should extract keywords successfully', async () => {
      const mockResponse = {
        success: true,
        data: {
          keywords: ['artificial intelligence', 'machine learning', 'neural networks'],
          entities: ['OpenAI', 'TensorFlow', 'Python'],
          importance_scores: [0.9, 0.8, 0.7]
        },
        usage: { prompt_tokens: 80, completion_tokens: 25, total_tokens: 105 }
      };

      mockOpenAIService.generateStructuredCompletion.mockResolvedValue(mockResponse);

      const result = await analysisService.extractKeywords('Content about AI and ML');

      expect(result).toEqual({
        success: true,
        keywords: mockResponse.data,
        usage: mockResponse.usage,
        model: 'gpt-4o-mini',
        cached: false
      });
    });

    test('should handle keyword extraction with limits', async () => {
      const mockResponse = {
        success: true,
        data: {
          keywords: ['AI', 'ML'],
          entities: ['OpenAI'],
          importance_scores: [0.9, 0.8]
        },
        usage: { prompt_tokens: 60, completion_tokens: 15, total_tokens: 75 }
      };

      mockOpenAIService.generateStructuredCompletion.mockResolvedValue(mockResponse);

      await analysisService.extractKeywords('Content', { maxKeywords: 5, maxEntities: 3 });

      const call = mockOpenAIService.generateStructuredCompletion.mock.calls[0];
      expect(call[0]).toContain('5 keywords');
      expect(call[0]).toContain('3 entities');
    });
  });

  describe('analyzeBatch', () => {
    test('should analyze multiple content pieces', async () => {
      const contents = ['Content 1', 'Content 2'];
      const mockResponse1 = {
        success: true,
        data: { sentiment: 'positive', category: 'tech' },
        usage: { total_tokens: 50 }
      };
      const mockResponse2 = {
        success: true,
        data: { sentiment: 'neutral', category: 'business' },
        usage: { total_tokens: 45 }
      };

      mockOpenAIService.generateStructuredCompletion
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const result = await analysisService.analyzeBatch(contents);

      expect(result).toEqual({
        success: true,
        analyses: [
          { content: 'Content 1', analysis: mockResponse1.data, success: true },
          { content: 'Content 2', analysis: mockResponse2.data, success: true }
        ],
        totalUsage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 95
        },
        successCount: 2,
        failureCount: 0,
        cached: false
      });
    });

    test('should handle partial failures in batch analysis', async () => {
      const contents = ['Content 1', 'Content 2'];
      const mockSuccess = {
        success: true,
        data: { sentiment: 'positive' },
        usage: { total_tokens: 50 }
      };
      const mockFailure = {
        success: false,
        error: 'Analysis failed',
        errorCode: 500
      };

      mockOpenAIService.generateStructuredCompletion
        .mockResolvedValueOnce(mockSuccess)
        .mockResolvedValueOnce(mockFailure);

      const result = await analysisService.analyzeBatch(contents);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.analyses[0].success).toBe(true);
      expect(result.analyses[1].success).toBe(false);
    });

    test('should handle empty content array', async () => {
      const result = await analysisService.analyzeBatch([]);

      expect(result).toEqual({
        success: true,
        analyses: [],
        totalUsage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        },
        successCount: 0,
        failureCount: 0,
        cached: false
      });
    });
  });

  describe('testAnalysis', () => {
    test('should test analysis functionality', async () => {
      const mockResponse = {
        success: true,
        data: {
          sentiment: 'positive',
          emotions: ['happiness'],
          category: 'test'
        },
        usage: { total_tokens: 30 }
      };

      mockOpenAIService.generateStructuredCompletion.mockResolvedValue(mockResponse);

      const result = await analysisService.testAnalysis();

      expect(result).toEqual({
        success: true,
        message: 'Analysis service test completed successfully',
        testResults: mockResponse.data,
        responseTime: expect.any(Number),
        model: 'gpt-4o-mini'
      });
    });

    test('should handle test failure', async () => {
      const mockError = {
        success: false,
        error: 'Test failed',
        errorCode: 500
      };

      mockOpenAIService.generateStructuredCompletion.mockResolvedValue(mockError);

      const result = await analysisService.testAnalysis();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test failed');
    });
  });

  describe('getStats', () => {
    test('should return analysis service statistics', () => {
      const stats = analysisService.getStats();

      expect(stats).toEqual({
        openaiServiceReady: true,
        model: 'gpt-4o-mini',
        requestCount: expect.any(Number),
        batchRequestCount: expect.any(Number),
        totalAnalysesGenerated: expect.any(Number),
        totalTokensUsed: expect.any(Number),
        averageResponseTime: expect.any(Number),
        errorCount: expect.any(Number),
        cacheHits: expect.any(Number),
        cacheHitRate: expect.any(Number),
        lastRequestTime: expect.any(String),
        operationCounts: expect.any(Object)
      });
    });
  });

  describe('close', () => {
    test('should close service gracefully', async () => {
      await expect(analysisService.close()).resolves.toBeUndefined();
    });
  });
});