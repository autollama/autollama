/**
 * Embedding Service
 * Handles text embeddings with contextual enhancement capabilities
 */

const { logAIInteraction, logError, logPerformanceMetric } = require('../../utils/logger');
const { AI_MODELS } = require('../../utils/constants');

class EmbeddingService {
  constructor(openaiService) {
    this.openaiService = openaiService;
    this.logger = require('../../utils/logger').createChildLogger({ component: 'embedding-service' });
    
    this.config = {
      model: AI_MODELS.TEXT_EMBEDDING_3_SMALL,
      dimensions: 1536,
      maxTextLength: 8192,
      contextSeparator: '\n\n'
    };
  }

  /**
   * Generate embeddings for text with optional contextual enhancement
   * @param {string} text - Text to embed
   * @param {string} context - Optional contextual summary for enhanced retrieval
   * @param {Object} options - Embedding options
   * @returns {Promise<Array>} Embedding vector
   */
  async generateEmbedding(text, context = null, options = {}) {
    if (!this.openaiService.isReady()) {
      throw new Error('OpenAI service not ready for embedding generation');
    }

    const {
      model = this.config.model,
      dimensions = this.config.dimensions,
      enhanceWithContext = true
    } = options;

    const startTime = Date.now();

    try {
      // Combine context with text for better retrieval if context is provided
      const enhancedText = context && enhanceWithContext 
        ? `${context}${this.config.contextSeparator}${text}` 
        : text;

      // Truncate if text is too long
      const processedText = this._truncateText(enhancedText, this.config.maxTextLength);

      logAIInteraction('embedding', 'generate_embedding', {
        textLength: text.length,
        hasContext: !!context,
        contextLength: context?.length || 0,
        enhancedTextLength: enhancedText.length,
        processedTextLength: processedText.length,
        model
      });

      // Use the OpenAI service to generate embedding
      const embedding = await this.openaiService.generateEmbedding(processedText, null, {
        model,
        dimensions
      });

      const duration = Date.now() - startTime;

      logPerformanceMetric('contextual_embedding_generation', duration, 'ms', {
        textLength: text.length,
        hasContext: !!context,
        enhancedLength: enhancedText.length,
        model,
        dimensions: embedding.length
      });

      this.logger.debug('Embedding generated successfully', {
        originalTextLength: text.length,
        hasContext: !!context,
        enhancedTextLength: enhancedText.length,
        duration,
        dimensions: embedding.length,
        isContextual: !!context
      });

      return embedding;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'generate_contextual_embedding',
        textLength: text.length,
        hasContext: !!context,
        duration,
        model
      });

      throw new Error(`Failed to generate contextual embedding: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param {Array} textItems - Array of {text, context} objects
   * @param {Object} options - Batch options
   * @returns {Promise<Array>} Array of embeddings
   */
  async generateBatchEmbeddings(textItems, options = {}) {
    const {
      batchSize = 10,
      concurrency = 3
    } = options;

    const results = [];
    
    for (let i = 0; i < textItems.length; i += batchSize) {
      const batch = textItems.slice(i, i + batchSize);
      
      // Process batch with limited concurrency
      const batchPromises = batch.map(async (item, index) => {
        try {
          const embedding = await this.generateEmbedding(item.text, item.context, options);
          return {
            index: i + index,
            embedding,
            success: true
          };
        } catch (error) {
          this.logger.warn('Failed to generate embedding for batch item', {
            batchIndex: i + index,
            error: error.message
          });
          return {
            index: i + index,
            embedding: null,
            success: false,
            error: error.message
          };
        }
      });

      // Process with concurrency limit
      const batchResults = await this._processConcurrently(batchPromises, concurrency);
      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    this.logger.info('Batch embedding generation completed', {
      totalItems: textItems.length,
      successCount,
      failureCount,
      successRate: (successCount / results.length * 100).toFixed(2) + '%'
    });

    return results;
  }

  /**
   * Compare embeddings and calculate similarity
   * @param {Array} embedding1 - First embedding vector
   * @param {Array} embedding2 - Second embedding vector
   * @returns {number} Cosine similarity score (-1 to 1)
   */
  calculateCosineSimilarity(embedding1, embedding2) {
    if (!Array.isArray(embedding1) || !Array.isArray(embedding2)) {
      throw new Error('Embeddings must be arrays');
    }

    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Validate embedding vector
   * @param {Array} embedding - Embedding to validate
   * @returns {boolean} True if valid
   */
  validateEmbedding(embedding) {
    if (!Array.isArray(embedding)) {
      return false;
    }

    if (embedding.length !== this.config.dimensions) {
      return false;
    }

    // Check if all values are numbers
    return embedding.every(val => typeof val === 'number' && !isNaN(val));
  }

  /**
   * Get embedding service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      model: this.config.model,
      dimensions: this.config.dimensions,
      maxTextLength: this.config.maxTextLength,
      openaiServiceReady: this.openaiService.isReady(),
      supportedFeatures: {
        contextualEmbeddings: true,
        batchProcessing: true,
        similarityCalculation: true,
        embeddingValidation: true
      }
    };
  }

  /**
   * Update embedding service configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    this.logger.info('Embedding service configuration updated', {
      changedFields: Object.keys(newConfig)
    });
  }

  /**
   * Truncate text to maximum length while preserving word boundaries
   * @private
   */
  _truncateText(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }

    const truncated = text.substring(0, maxLength);
    const lastSpaceIndex = truncated.lastIndexOf(' ');
    
    // If we found a space and it's reasonably close to the end, truncate there
    if (lastSpaceIndex > maxLength * 0.8) {
      return truncated.substring(0, lastSpaceIndex) + '...';
    }
    
    return truncated + '...';
  }

  /**
   * Process promises with concurrency limit
   * @private
   */
  async _processConcurrently(promises, concurrency) {
    const results = [];
    
    for (let i = 0; i < promises.length; i += concurrency) {
      const batch = promises.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }
    
    return results;
  }
}

module.exports = EmbeddingService;