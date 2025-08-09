/**
 * OpenAI Service
 * Handles all OpenAI API interactions including analysis, embeddings, and summaries
 */

const OpenAI = require('openai');
const { logAIInteraction, logError, logPerformanceMetric } = require('../../utils/logger');
const { AI_MODELS, ERROR_CODES } = require('../../utils/constants');

class OpenAIService {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey,
      defaultModel: config.defaultModel || AI_MODELS.GPT_4O_MINI,
      embeddingModel: config.embeddingModel || AI_MODELS.TEXT_EMBEDDING_3_SMALL,
      maxTokens: config.maxTokens || 4000,
      temperature: config.temperature || 0.3,
      timeoutMs: config.timeoutMs || 30000,
      maxRetries: config.maxRetries || 3
    };

    this.client = null;
    this.isInitialized = false;
    this.logger = require('../../utils/logger').createChildLogger({ component: 'openai-service' });

    // Initialize client if API key is provided
    if (this.config.apiKey) {
      this.initializeClient(this.config.apiKey);
    }
  }

  /**
   * Initialize OpenAI client with API key
   * @param {string} apiKey - OpenAI API key
   */
  initializeClient(apiKey) {
    try {
      if (!apiKey || !apiKey.startsWith('sk-')) {
        throw new Error('Invalid OpenAI API key format');
      }

      this.client = new OpenAI({
        apiKey: apiKey,
        timeout: this.config.timeoutMs,
        maxRetries: this.config.maxRetries
      });

      this.config.apiKey = apiKey;
      this.isInitialized = true;

      this.logger.info('OpenAI client initialized successfully', {
        model: this.config.defaultModel,
        embeddingModel: this.config.embeddingModel,
        maxTokens: this.config.maxTokens
      });

    } catch (error) {
      this.logger.error('Failed to initialize OpenAI client', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Analyze a chunk of text and extract structured metadata
   * @param {string} chunkText - Text to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeChunk(chunkText, options = {}) {
    if (!this.isInitialized) {
      throw new Error('OpenAI client not initialized');
    }

    const {
      model = this.config.defaultModel,
      maxTokens = this.config.maxTokens,
      temperature = this.config.temperature
    } = options;

    const startTime = Date.now();

    try {
      logAIInteraction('openai', 'analyze_chunk', {
        chunkLength: chunkText.length,
        model
      });

      const systemPrompt = this._buildAnalysisSystemPrompt();
      
      const response = await this.client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Process this text chunk: ${chunkText}` }
        ],
        response_format: { type: 'json_object' },
        max_tokens: maxTokens,
        temperature
      });

      const duration = Date.now() - startTime;
      const analysis = JSON.parse(response.choices[0].message.content);

      logPerformanceMetric('chunk_analysis', duration, 'ms', {
        chunkLength: chunkText.length,
        model,
        tokensUsed: response.usage?.total_tokens || 0
      });

      this.logger.debug('Chunk analysis completed', {
        chunkLength: chunkText.length,
        duration,
        sentiment: analysis.sentiment,
        category: analysis.category,
        tokensUsed: response.usage?.total_tokens || 0
      });

      // Validate and normalize analysis result
      return this._normalizeAnalysisResult(analysis);

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'analyze_chunk',
        chunkLength: chunkText.length,
        duration,
        model
      });

      throw new Error(`Failed to analyze chunk: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for text with optional context
   * @param {string} text - Text to embed
   * @param {string} context - Optional contextual summary
   * @param {Object} options - Embedding options
   * @returns {Promise<Array>} Embedding vector
   */
  async generateEmbedding(text, context = null, options = {}) {
    if (!this.isInitialized) {
      throw new Error('OpenAI client not initialized');
    }

    const {
      model = this.config.embeddingModel,
      dimensions = 1536
    } = options;

    const startTime = Date.now();

    try {
      // Combine context with text if context is provided
      const enhancedText = context ? `${context}\n\n${text}` : text;

      logAIInteraction('openai', 'generate_embedding', {
        textLength: text.length,
        hasContext: !!context,
        contextLength: context?.length || 0,
        model
      });

      const response = await this.client.embeddings.create({
        model,
        input: enhancedText,
        dimensions: model === AI_MODELS.TEXT_EMBEDDING_3_SMALL ? dimensions : undefined
      });

      const duration = Date.now() - startTime;
      const embedding = response.data[0].embedding;

      logPerformanceMetric('embedding_generation', duration, 'ms', {
        textLength: text.length,
        hasContext: !!context,
        model,
        dimensions: embedding.length,
        tokensUsed: response.usage?.total_tokens || 0
      });

      this.logger.debug('Embedding generated successfully', {
        textLength: text.length,
        hasContext: !!context,
        duration,
        dimensions: embedding.length,
        tokensUsed: response.usage?.total_tokens || 0
      });

      return embedding;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'generate_embedding',
        textLength: text.length,
        hasContext: !!context,
        duration,
        model
      });

      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Generate a summary for document content
   * @param {string} content - Content to summarize
   * @param {Object} options - Summary options
   * @returns {Promise<string>} Generated summary
   */
  async generateSummary(content, options = {}) {
    if (!this.isInitialized) {
      throw new Error('OpenAI client not initialized');
    }

    const {
      model = this.config.defaultModel,
      maxTokens = 200,
      temperature = this.config.temperature,
      maxContentLength = 4000
    } = options;

    const startTime = Date.now();

    try {
      // Truncate content if too long
      const truncatedContent = content.length > maxContentLength 
        ? content.substring(0, maxContentLength) + '...[truncated]'
        : content;

      logAIInteraction('openai', 'generate_summary', {
        contentLength: content.length,
        truncatedLength: truncatedContent.length,
        model
      });

      const response = await this.client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates concise, informative summaries. Provide a 2-3 sentence summary that captures the main themes and key information.'
          },
          {
            role: 'user',
            content: `Please summarize this content:\n\n${truncatedContent}`
          }
        ],
        max_tokens: maxTokens,
        temperature
      });

      const duration = Date.now() - startTime;
      const summary = response.choices[0].message.content.trim();

      logPerformanceMetric('summary_generation', duration, 'ms', {
        contentLength: content.length,
        summaryLength: summary.length,
        model,
        tokensUsed: response.usage?.total_tokens || 0
      });

      this.logger.debug('Summary generated successfully', {
        contentLength: content.length,
        summaryLength: summary.length,
        duration,
        tokensUsed: response.usage?.total_tokens || 0
      });

      return summary;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'generate_summary',
        contentLength: content.length,
        duration,
        model
      });

      throw new Error(`Failed to generate summary: ${error.message}`);
    }
  }

  /**
   * Test OpenAI connectivity and API key validity
   * @returns {Promise<Object>} Test results
   */
  async testConnection() {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'OpenAI client not initialized',
        details: { apiKeyConfigured: !!this.config.apiKey }
      };
    }

    try {
      const startTime = Date.now();
      
      // Test with a simple completion
      const response = await this.client.chat.completions.create({
        model: this.config.defaultModel,
        messages: [
          { role: 'user', content: 'Say "test successful" if you can read this.' }
        ],
        max_tokens: 10
      });

      const duration = Date.now() - startTime;
      const isValid = response.choices[0].message.content.toLowerCase().includes('test successful');

      logAIInteraction('openai', 'connection_test', {
        success: isValid,
        duration,
        model: this.config.defaultModel
      });

      return {
        success: isValid,
        duration,
        model: this.config.defaultModel,
        tokensUsed: response.usage?.total_tokens || 0,
        details: {
          apiKeyValid: true,
          responseReceived: true,
          expectedResponse: isValid
        }
      };

    } catch (error) {
      logError(error, {
        operation: 'connection_test',
        model: this.config.defaultModel
      });

      return {
        success: false,
        error: error.message,
        details: {
          apiKeyConfigured: !!this.config.apiKey,
          errorType: error.code || 'unknown'
        }
      };
    }
  }

  /**
   * Get service statistics and configuration
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      hasValidApiKey: !!this.config.apiKey && this.config.apiKey.startsWith('sk-'),
      defaultModel: this.config.defaultModel,
      embeddingModel: this.config.embeddingModel,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      timeoutMs: this.config.timeoutMs,
      maxRetries: this.config.maxRetries
    };
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Reinitialize client if API key changed
    if (newConfig.apiKey && newConfig.apiKey !== oldConfig.apiKey) {
      this.initializeClient(newConfig.apiKey);
    }

    this.logger.info('OpenAI service configuration updated', {
      changedFields: Object.keys(newConfig),
      reinitializedClient: !!newConfig.apiKey
    });
  }

  /**
   * Build system prompt for chunk analysis
   * @private
   */
  _buildAnalysisSystemPrompt() {
    return `You are a RAG content analyzer. Extract structured metadata from text chunks.

Return JSON with these exact fields:
{
  "title": "Main title/topic (string)",
  "summary": "2-3 sentence summary (string)", 
  "category": "Primary category (string)",
  "tags": ["tag1", "tag2", "tag3"] (array of strings),
  "key_concepts": ["concept1", "concept2"] (array of strings),
  "content_type": "article|blog|academic|news|reference|other (string)",
  "technical_level": "beginner|intermediate|advanced (string)",
  "sentiment": "positive|negative|neutral|mixed (string)",
  "emotions": ["emotion1", "emotion2"] (array from: joy, sadness, anger, fear, surprise, disgust, trust, anticipation),
  "key_entities": {
    "people": ["name1", "name2"] (array of person names mentioned),
    "organizations": ["org1", "org2"] (array of organization names),
    "locations": ["location1", "location2"] (array of place names)
  },
  "main_topics": ["topic1", "topic2", "topic3"] (array of broader topics beyond the title)
}

Analyze thoroughly but keep responses concise and focused.`;
  }

  /**
   * Normalize and validate analysis result
   * @private
   */
  _normalizeAnalysisResult(analysis) {
    const defaultAnalysis = {
      title: 'Untitled Content',
      summary: 'No summary available',
      category: 'general',
      tags: [],
      key_concepts: [],
      content_type: 'other',
      technical_level: 'beginner',
      sentiment: 'neutral',
      emotions: ['neutral'],
      key_entities: {
        people: [],
        organizations: [],
        locations: []
      },
      main_topics: []
    };

    // Merge with defaults and ensure proper types
    const normalized = { ...defaultAnalysis, ...analysis };

    // Ensure arrays are arrays
    ['tags', 'key_concepts', 'emotions', 'main_topics'].forEach(field => {
      if (!Array.isArray(normalized[field])) {
        normalized[field] = [];
      }
    });

    // Ensure key_entities structure
    if (!normalized.key_entities || typeof normalized.key_entities !== 'object') {
      normalized.key_entities = defaultAnalysis.key_entities;
    } else {
      ['people', 'organizations', 'locations'].forEach(entityType => {
        if (!Array.isArray(normalized.key_entities[entityType])) {
          normalized.key_entities[entityType] = [];
        }
      });
    }

    // Validate enums
    const validContentTypes = ['article', 'blog', 'academic', 'news', 'reference', 'other'];
    if (!validContentTypes.includes(normalized.content_type)) {
      normalized.content_type = 'other';
    }

    const validTechnicalLevels = ['beginner', 'intermediate', 'advanced'];
    if (!validTechnicalLevels.includes(normalized.technical_level)) {
      normalized.technical_level = 'beginner';
    }

    const validSentiments = ['positive', 'negative', 'neutral', 'mixed'];
    if (!validSentiments.includes(normalized.sentiment)) {
      normalized.sentiment = 'neutral';
    }

    return normalized;
  }

  /**
   * Get the OpenAI client instance (for advanced usage)
   * @returns {OpenAI|null} OpenAI client instance
   */
  get openaiClient() {
    return this.client;
  }

  /**
   * Check if service is ready for use
   * @returns {boolean} True if service is ready
   */
  isReady() {
    return this.isInitialized && !!this.client;
  }
}

module.exports = OpenAIService;