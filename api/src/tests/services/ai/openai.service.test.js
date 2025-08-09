/**
 * Unit Tests for OpenAI Service
 * Tests the core OpenAI API integration functionality
 */

const OpenAIService = require('../../../services/ai/openai.service');

// Mock the OpenAI library
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    },
    embeddings: {
      create: jest.fn()
    }
  }));
});

describe('OpenAIService', () => {
  let openaiService;
  let mockOpenAI;

  beforeEach(() => {
    // Clear the mock and create a fresh instance
    jest.clearAllMocks();
    
    const config = {
      apiKey: 'test-api-key',
      defaultModel: 'gpt-4o-mini',
      maxTokens: 1000,
      temperature: 0.3,
      timeoutMs: 30000,
      maxRetries: 3
    };

    openaiService = new OpenAIService(config);
    mockOpenAI = openaiService.client;
  });

  describe('constructor', () => {
    test('should initialize with correct configuration', () => {
      expect(openaiService.config.apiKey).toBe('test-api-key');
      expect(openaiService.config.defaultModel).toBe('gpt-4o-mini');
      expect(openaiService.config.maxTokens).toBe(1000);
      expect(openaiService.config.temperature).toBe(0.3);
    });

    test('should initialize with default values when config is incomplete', () => {
      const service = new OpenAIService({ apiKey: 'test' });
      expect(service.config.defaultModel).toBe('gpt-4o-mini');
      expect(service.config.maxTokens).toBe(4000);
      expect(service.config.temperature).toBe(0.3);
    });

    test('should mark as not ready when no API key provided', () => {
      const service = new OpenAIService({});
      expect(service.isReady()).toBe(false);
    });
  });

  describe('isReady', () => {
    test('should return true when properly configured', () => {
      expect(openaiService.isReady()).toBe(true);
    });

    test('should return false when API key is missing', () => {
      openaiService.config.apiKey = null;
      expect(openaiService.isReady()).toBe(false);
    });
  });

  describe('generateCompletion', () => {
    test('should generate completion successfully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Test completion response'
          }
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await openaiService.generateCompletion('Test prompt');

      expect(result).toEqual({
        success: true,
        content: 'Test completion response',
        usage: mockResponse.usage,
        model: 'gpt-4o-mini',
        cached: false
      });

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Test prompt' }],
        max_tokens: 1000,
        temperature: 0.3
      });
    });

    test('should handle custom options', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Custom response'
          }
        }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const options = {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 500
      };

      await openaiService.generateCompletion('Test prompt', options);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test prompt' }],
        max_tokens: 500,
        temperature: 0.7
      });
    });

    test('should handle system messages', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'System response'
          }
        }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const options = {
        systemPrompt: 'You are a helpful assistant'
      };

      await openaiService.generateCompletion('Test prompt', options);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Test prompt' }
        ],
        max_tokens: 1000,
        temperature: 0.3
      });
    });

    test('should handle API errors gracefully', async () => {
      const error = new Error('API Error');
      error.status = 429;
      mockOpenAI.chat.completions.create.mockRejectedValue(error);

      const result = await openaiService.generateCompletion('Test prompt');

      expect(result).toEqual({
        success: false,
        error: 'API Error',
        errorCode: 429,
        model: 'gpt-4o-mini',
        cached: false
      });
    });

    test('should return error when service not ready', async () => {
      openaiService.config.apiKey = null;

      const result = await openaiService.generateCompletion('Test prompt');

      expect(result).toEqual({
        success: false,
        error: 'OpenAI service not properly configured',
        errorCode: 'SERVICE_NOT_READY',
        model: 'gpt-4o-mini',
        cached: false
      });
    });
  });

  describe('generateEmbedding', () => {
    test('should generate embedding successfully', async () => {
      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
      const mockResponse = {
        data: [{
          embedding: mockEmbedding
        }],
        usage: {
          prompt_tokens: 5,
          total_tokens: 5
        }
      };

      mockOpenAI.embeddings.create.mockResolvedValue(mockResponse);

      const result = await openaiService.generateEmbedding('Test text');

      expect(result).toEqual({
        success: true,
        embedding: mockEmbedding,
        usage: mockResponse.usage,
        model: 'text-embedding-3-small',
        cached: false
      });

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'Test text'
      });
    });

    test('should handle custom model', async () => {
      const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
      const mockResponse = {
        data: [{ embedding: mockEmbedding }],
        usage: { prompt_tokens: 5, total_tokens: 5 }
      };

      mockOpenAI.embeddings.create.mockResolvedValue(mockResponse);

      await openaiService.generateEmbedding('Test text', { model: 'text-embedding-ada-002' });

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-ada-002',
        input: 'Test text'
      });
    });

    test('should handle embedding API errors', async () => {
      const error = new Error('Embedding API Error');
      error.status = 500;
      mockOpenAI.embeddings.create.mockRejectedValue(error);

      const result = await openaiService.generateEmbedding('Test text');

      expect(result).toEqual({
        success: false,
        error: 'Embedding API Error',
        errorCode: 500,
        model: 'text-embedding-3-small',
        cached: false
      });
    });
  });

  describe('generateStructuredCompletion', () => {
    test('should generate structured completion with valid JSON', async () => {
      const responseData = { title: 'Test Title', summary: 'Test Summary' };
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify(responseData)
          }
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await openaiService.generateStructuredCompletion(
        'Test prompt',
        { title: 'string', summary: 'string' }
      );

      expect(result).toEqual({
        success: true,
        data: responseData,
        usage: mockResponse.usage,
        model: 'gpt-4o-mini',
        cached: false
      });
    });

    test('should handle invalid JSON response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await openaiService.generateStructuredCompletion(
        'Test prompt',
        { title: 'string', summary: 'string' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON response');
    });
  });

  describe('testConnection', () => {
    test('should test connection successfully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Hello!'
          }
        }],
        usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await openaiService.testConnection();

      expect(result).toEqual({
        success: true,
        message: 'OpenAI API connection successful',
        model: 'gpt-4o-mini',
        responseTime: expect.any(Number)
      });
    });

    test('should handle connection test failure', async () => {
      const error = new Error('Connection failed');
      mockOpenAI.chat.completions.create.mockRejectedValue(error);

      const result = await openaiService.testConnection();

      expect(result).toEqual({
        success: false,
        error: 'Connection failed',
        model: 'gpt-4o-mini',
        responseTime: expect.any(Number)
      });
    });

    test('should return error when service not ready', async () => {
      openaiService.config.apiKey = null;

      const result = await openaiService.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('OpenAI service not properly configured');
    });
  });

  describe('getStats', () => {
    test('should return service statistics', () => {
      const stats = openaiService.getStats();

      expect(stats).toEqual({
        isReady: true,
        model: 'gpt-4o-mini',
        embeddingModel: 'text-embedding-3-small',
        requestCount: expect.any(Number),
        totalTokensUsed: expect.any(Number),
        totalCost: expect.any(Number),
        lastRequestTime: expect.any(String),
        averageResponseTime: expect.any(Number),
        errorCount: expect.any(Number),
        cacheHits: expect.any(Number),
        cacheHitRate: expect.any(Number)
      });
    });
  });

  describe('close', () => {
    test('should close service gracefully', async () => {
      await expect(openaiService.close()).resolves.toBeUndefined();
    });
  });
});