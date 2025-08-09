/**
 * Analysis Service
 * Handles content analysis including chunk analysis and contextual summary generation
 */

const { logAIInteraction, logError, logPerformanceMetric } = require('../../utils/logger');
const { AI_MODELS } = require('../../utils/constants');

class AnalysisService {
  constructor(openaiService) {
    this.openaiService = openaiService;
    this.logger = require('../../utils/logger').createChildLogger({ component: 'analysis-service' });
    
    this.config = {
      model: AI_MODELS.GPT_4O_MINI,
      maxTokens: 4000,
      temperature: 0.3,
      maxDocumentLength: 8000,
      maxContextTokens: 100
    };
  }

  /**
   * Analyze a chunk of text and extract structured metadata
   * @param {string} chunkText - Text to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeChunk(chunkText, options = {}) {
    if (!this.openaiService.isReady()) {
      throw new Error('OpenAI service not ready for chunk analysis');
    }

    const {
      model = this.config.model,
      maxTokens = this.config.maxTokens,
      temperature = this.config.temperature
    } = options;

    const startTime = Date.now();

    try {
      logAIInteraction('analysis', 'analyze_chunk', {
        chunkLength: chunkText.length,
        model
      });

      // Use the OpenAI service's analyzeChunk method
      const analysis = await this.openaiService.analyzeChunk(chunkText, {
        model,
        maxTokens,
        temperature
      });

      const duration = Date.now() - startTime;

      logPerformanceMetric('chunk_analysis_service', duration, 'ms', {
        chunkLength: chunkText.length,
        model,
        category: analysis.category,
        sentiment: analysis.sentiment
      });

      this.logger.debug('Chunk analysis completed via service', {
        chunkLength: chunkText.length,
        duration,
        category: analysis.category,
        sentiment: analysis.sentiment,
        tagsCount: analysis.tags?.length || 0,
        conceptsCount: analysis.key_concepts?.length || 0
      });

      return analysis;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'analyze_chunk_service',
        chunkLength: chunkText.length,
        duration,
        model
      });

      throw new Error(`Failed to analyze chunk via service: ${error.message}`);
    }
  }

  /**
   * Generate contextual summary for a chunk within a document
   * @param {string} fullDocument - Full document content
   * @param {string} chunkText - Specific chunk to contextualize
   * @param {Object} options - Context generation options
   * @returns {Promise<string|null>} Contextual summary or null if failed
   */
  async generateChunkContext(fullDocument, chunkText, options = {}) {
    if (!this.openaiService.isReady()) {
      throw new Error('OpenAI service not ready for context generation');
    }

    const {
      model = this.config.model,
      maxTokens = this.config.maxContextTokens,
      temperature = this.config.temperature,
      maxDocumentLength = this.config.maxDocumentLength
    } = options;

    const startTime = Date.now();

    try {
      // Truncate document if too long
      const truncatedDocument = fullDocument.length > maxDocumentLength 
        ? fullDocument.substring(0, maxDocumentLength) + '...[truncated]'
        : fullDocument;

      const prompt = this._buildContextGenerationPrompt(truncatedDocument, chunkText);

      logAIInteraction('analysis', 'generate_chunk_context', {
        documentLength: fullDocument.length,
        truncatedDocumentLength: truncatedDocument.length,
        chunkLength: chunkText.length,
        model
      });

      const response = await this.openaiService.openaiClient.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that provides contextual summaries for document chunks to improve retrieval.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature
      });

      const duration = Date.now() - startTime;
      const context = response.choices[0].message.content.trim();

      logPerformanceMetric('chunk_context_generation', duration, 'ms', {
        documentLength: fullDocument.length,
        chunkLength: chunkText.length,
        contextLength: context.length,
        model,
        tokensUsed: response.usage?.total_tokens || 0
      });

      this.logger.debug('Chunk context generated successfully', {
        documentLength: fullDocument.length,
        chunkLength: chunkText.length,
        contextLength: context.length,
        duration,
        tokensUsed: response.usage?.total_tokens || 0
      });

      return context;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'generate_chunk_context',
        documentLength: fullDocument.length,
        chunkLength: chunkText.length,
        duration,
        model
      });

      this.logger.warn(`Context generation failed: ${error.message}`, {
        documentLength: fullDocument.length,
        chunkLength: chunkText.length,
        duration
      });

      return null; // Fall back to non-contextual processing
    }
  }

  /**
   * Analyze multiple chunks in batch
   * @param {Array} chunks - Array of text chunks
   * @param {Object} options - Batch analysis options
   * @returns {Promise<Array>} Array of analysis results
   */
  async analyzeBatchChunks(chunks, options = {}) {
    const {
      batchSize = 5,
      concurrency = 3,
      continueOnError = true
    } = options;

    const results = [];
    let processedCount = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      // Process batch with limited concurrency
      const batchPromises = batch.map(async (chunk, index) => {
        try {
          const analysis = await this.analyzeChunk(chunk, options);
          processedCount++;
          
          this.logger.debug('Batch chunk analysis progress', {
            current: processedCount,
            total: chunks.length,
            percentage: Math.round((processedCount / chunks.length) * 100)
          });

          return {
            index: i + index,
            chunk,
            analysis,
            success: true
          };
        } catch (error) {
          this.logger.warn('Failed to analyze chunk in batch', {
            batchIndex: i + index,
            chunkLength: chunk.length,
            error: error.message
          });

          if (!continueOnError) {
            throw error;
          }

          return {
            index: i + index,
            chunk,
            analysis: null,
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

    this.logger.info('Batch chunk analysis completed', {
      totalChunks: chunks.length,
      successCount,
      failureCount,
      successRate: (successCount / results.length * 100).toFixed(2) + '%'
    });

    return results;
  }

  /**
   * Generate document summary from content
   * @param {string} content - Document content
   * @param {Object} options - Summary options
   * @returns {Promise<string>} Generated summary
   */
  async generateDocumentSummary(content, options = {}) {
    if (!this.openaiService.isReady()) {
      throw new Error('OpenAI service not ready for summary generation');
    }

    try {
      const summary = await this.openaiService.generateSummary(content, options);
      
      this.logger.debug('Document summary generated via service', {
        contentLength: content.length,
        summaryLength: summary.length
      });

      return summary;

    } catch (error) {
      logError(error, {
        operation: 'generate_document_summary',
        contentLength: content.length
      });

      throw new Error(`Failed to generate document summary: ${error.message}`);
    }
  }

  /**
   * Get analysis service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      maxDocumentLength: this.config.maxDocumentLength,
      maxContextTokens: this.config.maxContextTokens,
      openaiServiceReady: this.openaiService.isReady(),
      supportedFeatures: {
        chunkAnalysis: true,
        contextGeneration: true,
        batchProcessing: true,
        documentSummary: true
      }
    };
  }

  /**
   * Update analysis service configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    this.logger.info('Analysis service configuration updated', {
      changedFields: Object.keys(newConfig)
    });
  }

  /**
   * Test analysis service functionality
   * @returns {Promise<Object>} Test results
   */
  async testAnalysis() {
    const testChunk = "This is a test document about artificial intelligence and machine learning technologies.";
    
    try {
      const startTime = Date.now();
      const analysis = await this.analyzeChunk(testChunk);
      const duration = Date.now() - startTime;

      return {
        success: true,
        duration,
        analysis: {
          title: analysis.title,
          category: analysis.category,
          sentiment: analysis.sentiment,
          tagsCount: analysis.tags?.length || 0
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build prompt for context generation
   * @private
   */
  _buildContextGenerationPrompt(document, chunk) {
    return `Here is the full document content:

<document>
${document}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
${chunk}
</chunk>

Please give a short succinct context (1-2 sentences) to situate this chunk within the overall document for better retrieval.`;
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

module.exports = AnalysisService;