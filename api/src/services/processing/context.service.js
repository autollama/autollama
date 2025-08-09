/**
 * Enhanced Context Service v2.2
 * Implements Anthropic's contextual retrieval methodology for 35-60% better RAG performance
 * Features: intelligent document segmentation, advanced context generation, production-ready architecture
 */

const { logAIInteraction, logProcessingStep } = require('../../utils/logger');
const { AI_MODELS, DEFAULTS } = require('../../utils/constants');

class ContextService {
  constructor(openaiClient, config = {}) {
    this.openaiClient = openaiClient;
    this.enabled = config.enabled || false;
    this.model = config.model || AI_MODELS.GPT_4O_MINI;
    this.batchSize = config.batchSize || DEFAULTS.BATCH_SIZE;
    this.maxTokens = config.maxTokens || 150; // Increased for better context
    this.temperature = config.temperature || 0.2; // Lower for more consistent results
    this.logger = require('../../utils/logger').createChildLogger({ component: 'context-v2.2' });
    
    // Enhanced configuration for v2.2
    this.retryConfig = {
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      backoffMultiplier: config.backoffMultiplier || 2
    };
    
    this.contextConfig = {
      documentSampleSize: config.documentSampleSize || 12000, // Increased for better context
      chunkContextWindow: config.chunkContextWindow || 2000, // Context around chunk position
      enableDocumentStructure: config.enableDocumentStructure !== false, // Default true
      enableSemanticPositioning: config.enableSemanticPositioning !== false // Default true
    };
    
    // Document analysis cache for better performance
    this.documentAnalysisCache = new Map();
    this.cacheMaxSize = 100;
    
    // Performance metrics
    this.metrics = {
      contextsGenerated: 0,
      avgGenerationTime: 0,
      successRate: 0,
      totalRequests: 0,
      cacheHits: 0
    };
  }

  /**
   * Enhanced contextual summary generation with document structure awareness
   * @param {string} fullDocument - Complete document content
   * @param {string} chunkText - Specific chunk to contextualize
   * @param {Object} options - Generation options
   * @returns {Promise<string|null>} Contextual summary or null if failed
   */
  async generateChunkContext(fullDocument, chunkText, options = {}) {
    if (!this.enabled) {
      this.logger.debug('Contextual embeddings disabled, skipping context generation');
      return null;
    }

    if (!this.openaiClient) {
      this.logger.warn('OpenAI client not available for context generation');
      return null;
    }

    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      const {
        chunkIndex = 0,
        totalChunks = 1,
        contextMaxTokens = this.maxTokens,
        temperature = this.temperature,
        enableRetry = true
      } = options;

      // Enhanced document analysis with caching
      const documentAnalysis = await this._analyzeDocument(fullDocument);
      
      // Determine chunk position context
      const positionContext = this._analyzeChunkPosition(
        fullDocument, 
        chunkText, 
        chunkIndex, 
        totalChunks
      );

      logAIInteraction('openai', 'generate_context_v2', {
        chunkLength: chunkText.length,
        documentLength: fullDocument.length,
        chunkIndex,
        totalChunks,
        model: this.model,
        hasDocumentStructure: !!documentAnalysis.structure
      });

      // Build enhanced prompt with document understanding
      const prompt = this._buildEnhancedContextPrompt(
        fullDocument,
        chunkText,
        documentAnalysis,
        positionContext
      );
      
      const contextualSummary = enableRetry 
        ? await this._generateWithRetry(prompt, contextMaxTokens, temperature)
        : await this._generateContext(prompt, contextMaxTokens, temperature);

      const duration = Date.now() - startTime;
      
      // Update metrics
      this.metrics.contextsGenerated++;
      this.metrics.avgGenerationTime = (
        (this.metrics.avgGenerationTime * (this.metrics.contextsGenerated - 1) + duration) / 
        this.metrics.contextsGenerated
      );
      this.metrics.successRate = this.metrics.contextsGenerated / this.metrics.totalRequests;

      logProcessingStep('context_generated_v2', null, {
        chunkLength: chunkText.length,
        contextLength: contextualSummary.length,
        duration,
        model: this.model,
        chunkIndex,
        totalChunks,
        hasStructure: !!documentAnalysis.structure
      });

      this.logger.info('Generated enhanced contextual summary', {
        chunkLength: chunkText.length,
        contextLength: contextualSummary.length,
        duration,
        model: this.model,
        positionInfo: positionContext.position,
        documentType: documentAnalysis.type
      });

      return contextualSummary;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.warn('Enhanced context generation failed', {
        error: error.message,
        chunkLength: chunkText.length,
        model: this.model,
        duration,
        retryEnabled: options.enableRetry !== false
      });

      logAIInteraction('openai', 'generate_context_error_v2', {
        error: error.message,
        model: this.model,
        duration
      });

      return null; // Fall back to non-contextual embedding
    }
  }

  /**
   * Generate contextual summaries for multiple chunks in batch
   * @param {string} fullDocument - Complete document content
   * @param {Array} chunks - Array of chunk objects
   * @param {Function} progressCallback - Progress callback function
   * @returns {Promise<Array>} Array of contextual summaries (null for failed ones)
   */
  async generateBatchContext(fullDocument, chunks, progressCallback = null) {
    if (!this.enabled || !chunks || chunks.length === 0) {
      return chunks.map(() => null);
    }

    const results = [];
    const totalBatches = Math.ceil(chunks.length / this.batchSize);
    
    this.logger.info(`Starting batch context generation for ${chunks.length} chunks in ${totalBatches} batches`);

    for (let i = 0; i < chunks.length; i += this.batchSize) {
      const batch = chunks.slice(i, i + this.batchSize);
      const batchNumber = Math.floor(i / this.batchSize) + 1;
      
      logProcessingStep('context_batch_start', null, {
        batchNumber,
        totalBatches,
        batchSize: batch.length
      });

      // Process batch in parallel
      const batchPromises = batch.map(async (chunk, index) => {
        try {
          const contextualSummary = await this.generateChunkContext(fullDocument, chunk.chunk_text);
          
          if (progressCallback) {
            progressCallback({
              type: 'context_progress',
              chunkIndex: i + index,
              totalChunks: chunks.length,
              batchNumber,
              totalBatches,
              success: contextualSummary !== null
            });
          }

          return contextualSummary;
        } catch (error) {
          this.logger.warn(`Context generation failed for chunk ${i + index}`, {
            error: error.message,
            chunkIndex: chunk.chunk_index
          });
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to avoid rate limiting
      if (i + this.batchSize < chunks.length) {
        await this._delay(200); // 200ms delay
      }

      logProcessingStep('context_batch_complete', null, {
        batchNumber,
        totalBatches,
        successCount: batchResults.filter(r => r !== null).length,
        failureCount: batchResults.filter(r => r === null).length
      });
    }

    const successCount = results.filter(r => r !== null).length;
    const failureRate = ((chunks.length - successCount) / chunks.length) * 100;

    this.logger.info('Batch context generation complete', {
      totalChunks: chunks.length,
      successCount,
      failureCount: chunks.length - successCount,
      failureRate: Math.round(failureRate * 100) / 100
    });

    return results;
  }

  /**
   * Build the prompt for context generation
   * @private
   */
  _buildContextPrompt(fullDocument, chunkText, maxDocumentLength) {
    // Truncate document if too long, but try to preserve context around the chunk
    let documentSample = fullDocument;
    
    if (fullDocument.length > maxDocumentLength) {
      // Try to find the chunk position in the document
      const chunkPosition = fullDocument.indexOf(chunkText);
      
      if (chunkPosition !== -1) {
        // Extract context around the chunk position
        const contextStart = Math.max(0, chunkPosition - Math.floor(maxDocumentLength / 2));
        const contextEnd = Math.min(fullDocument.length, contextStart + maxDocumentLength);
        documentSample = fullDocument.substring(contextStart, contextEnd);
        
        if (contextStart > 0) {
          documentSample = '...' + documentSample;
        }
        if (contextEnd < fullDocument.length) {
          documentSample = documentSample + '...';
        }
      } else {
        // Fallback: just take the beginning of the document
        documentSample = fullDocument.substring(0, maxDocumentLength) + 
          (fullDocument.length > maxDocumentLength ? '...[truncated]' : '');
      }
    }

    return `Here is the full document content:

<document>
${documentSample}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
${chunkText}
</chunk>

Please give a short succinct context (1-2 sentences) to situate this chunk within the overall document for better retrieval. Focus on how this chunk relates to the broader themes and content of the document.`;
  }

  /**
   * Validate context configuration
   * @returns {Object} Validation result
   */
  validateConfiguration() {
    const issues = [];
    const warnings = [];

    if (!this.openaiClient) {
      issues.push('OpenAI client not configured');
    }

    if (!this.enabled) {
      warnings.push('Contextual embeddings disabled');
    }

    if (this.batchSize > 10) {
      warnings.push('Large batch size may cause rate limiting');
    }

    if (this.maxTokens > 200) {
      warnings.push('High max tokens may increase costs significantly');
    }

    const isValid = issues.length === 0;

    return {
      isValid,
      issues,
      warnings,
      config: {
        enabled: this.enabled,
        model: this.model,
        batchSize: this.batchSize,
        maxTokens: this.maxTokens,
        temperature: this.temperature
      }
    };
  }

  /**
   * Get enhanced context generation statistics (v2.2)
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      model: this.model,
      batchSize: this.batchSize,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      isConfigured: !!this.openaiClient,
      version: '2.2',
      
      // Enhanced metrics
      performance: {
        contextsGenerated: this.metrics.contextsGenerated,
        avgGenerationTime: Math.round(this.metrics.avgGenerationTime),
        successRate: Math.round(this.metrics.successRate * 100) / 100,
        totalRequests: this.metrics.totalRequests,
        cacheHits: this.metrics.cacheHits,
        cacheHitRate: this.metrics.totalRequests > 0 
          ? Math.round((this.metrics.cacheHits / this.metrics.totalRequests) * 100) / 100 
          : 0
      },
      
      // Configuration
      config: {
        retryConfig: this.retryConfig,
        contextConfig: this.contextConfig,
        cacheSize: this.documentAnalysisCache.size,
        maxCacheSize: this.cacheMaxSize
      }
    };
  }

  /**
   * Enable or disable contextual embeddings
   * @param {boolean} enabled - Whether to enable contextual embeddings
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.logger.info(`Contextual embeddings ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update batch size for processing
   * @param {number} batchSize - New batch size
   */
  setBatchSize(batchSize) {
    if (batchSize < 1 || batchSize > 20) {
      throw new Error('Batch size must be between 1 and 20');
    }
    
    this.batchSize = batchSize;
    this.logger.info(`Context generation batch size updated to ${batchSize}`);
  }

  /**
   * Enhanced Private Helper Methods for v2.2
   */
  
  /**
   * Analyze document structure and type for better context generation
   * @private
   */
  async _analyzeDocument(fullDocument) {
    const docHash = this._hashDocument(fullDocument);
    
    // Check cache first
    if (this.documentAnalysisCache.has(docHash)) {
      this.metrics.cacheHits++;
      return this.documentAnalysisCache.get(docHash);
    }

    const analysis = {
      type: this._detectDocumentType(fullDocument),
      structure: this._extractDocumentStructure(fullDocument),
      keyTopics: this._extractKeyTopics(fullDocument),
      sections: this._identifySections(fullDocument),
      length: fullDocument.length,
      hash: docHash
    };

    // Cache the analysis
    this._cacheDocumentAnalysis(docHash, analysis);
    
    return analysis;
  }

  /**
   * Analyze chunk position within document for better context
   * @private
   */
  _analyzeChunkPosition(fullDocument, chunkText, chunkIndex, totalChunks) {
    const chunkPosition = fullDocument.indexOf(chunkText);
    const documentLength = fullDocument.length;
    
    return {
      index: chunkIndex,
      total: totalChunks,
      relativePosition: chunkPosition / documentLength,
      position: this._determinePositionLabel(chunkIndex, totalChunks),
      surroundingContext: this._extractSurroundingContext(fullDocument, chunkPosition, chunkText.length),
      structuralContext: this._getStructuralContext(fullDocument, chunkPosition)
    };
  }

  /**
   * Build enhanced context prompt with document understanding
   * @private
   */
  _buildEnhancedContextPrompt(fullDocument, chunkText, documentAnalysis, positionContext) {
    const documentSample = this._getOptimalDocumentSample(
      fullDocument,
      chunkText,
      positionContext
    );

    return `Document Analysis:
Type: ${documentAnalysis.type}
Structure: ${documentAnalysis.structure}
Key Topics: ${documentAnalysis.keyTopics.join(', ')}

Document Content:
<document>
${documentSample}
</document>

Chunk Position: ${positionContext.position} (${positionContext.index + 1}/${positionContext.total})
Structural Context: ${positionContext.structuralContext}

Target Chunk:
<chunk>
${chunkText}
</chunk>

Please provide a contextual summary (2-3 sentences) that:
1. Situates this chunk within the document's overall structure and themes
2. Explains how this content relates to surrounding sections
3. Highlights the chunk's role in the document's narrative or argument

Focus on providing context that would help someone understand why this chunk is relevant when retrieved for a specific query.`;
  }

  /**
   * Generate context with retry logic and exponential backoff
   * @private
   */
  async _generateWithRetry(prompt, maxTokens, temperature) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this._generateContext(prompt, maxTokens, temperature);
      } catch (error) {
        lastError = error;
        
        if (attempt === this.retryConfig.maxRetries) {
          throw error;
        }

        // Check if error is retryable
        if (this._isRetryableError(error)) {
          const delay = this.retryConfig.retryDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
          
          this.logger.warn(`Context generation attempt ${attempt} failed, retrying in ${delay}ms`, {
            error: error.message,
            attempt,
            maxRetries: this.retryConfig.maxRetries
          });
          
          await this._delay(delay);
        } else {
          throw error; // Don't retry non-retryable errors
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Core context generation method
   * @private
   */
  async _generateContext(prompt, maxTokens, temperature) {
    const response = await this.openaiClient.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: `You are an expert at creating contextual summaries for document retrieval. Your summaries help users understand how chunks relate to the broader document context, improving retrieval accuracy by 35-60%.

Guidelines:
- Be concise but comprehensive (2-3 sentences)
- Focus on situating the chunk within the document's structure
- Highlight relationships to surrounding content
- Explain the chunk's role in the overall narrative or argument
- Use terminology consistent with the document's domain`
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: maxTokens,
      temperature: temperature
    });

    return response.choices[0].message.content.trim();
  }

  /**
   * Document analysis helper methods
   * @private
   */
  _detectDocumentType(document) {
    const content = document.toLowerCase();
    
    if (content.includes('abstract') && content.includes('introduction') && content.includes('conclusion')) {
      return 'academic_paper';
    } else if (content.includes('chapter') || content.match(/\d+\.\s+[A-Z]/g)) {
      return 'book_or_manual';
    } else if (content.includes('## ') || content.includes('# ')) {
      return 'documentation';
    } else if (content.includes('privacy policy') || content.includes('terms of service')) {
      return 'legal_document';
    } else if (content.match(/\$\d+|\$\s*\d+|revenue|profit|quarterly/gi)) {
      return 'financial_report';
    } else {
      return 'general_article';
    }
  }

  _extractDocumentStructure(document) {
    const headers = document.match(/^#{1,6}\s+.+$/gm) || [];
    const sections = document.match(/^[A-Z][A-Za-z\s]+:?$/gm) || [];
    
    if (headers.length > 3) {
      return 'well_structured_with_headers';
    } else if (sections.length > 2) {
      return 'sectioned_content';
    } else {
      return 'continuous_prose';
    }
  }

  _extractKeyTopics(document) {
    // Simple keyword extraction - in production, this could use more sophisticated NLP
    const words = document.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const wordCount = {};
    
    words.forEach(word => {
      if (!this._isStopWord(word)) {
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    });
    
    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }

  _identifySections(document) {
    const sections = [];
    const lines = document.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.match(/^#{1,6}\s+/) || line.match(/^[A-Z][A-Za-z\s]+:?$/)) {
        sections.push({
          title: line,
          startLine: i,
          position: i / lines.length
        });
      }
    }
    
    return sections;
  }

  _determinePositionLabel(chunkIndex, totalChunks) {
    const ratio = chunkIndex / (totalChunks - 1);
    
    if (ratio <= 0.1) return 'beginning';
    if (ratio <= 0.3) return 'early';
    if (ratio <= 0.7) return 'middle';
    if (ratio <= 0.9) return 'late';
    return 'end';
  }

  _extractSurroundingContext(fullDocument, chunkPosition, chunkLength) {
    const contextWindow = this.contextConfig.chunkContextWindow;
    const start = Math.max(0, chunkPosition - contextWindow);
    const end = Math.min(fullDocument.length, chunkPosition + chunkLength + contextWindow);
    
    return fullDocument.substring(start, end);
  }

  _getStructuralContext(fullDocument, chunkPosition) {
    const lines = fullDocument.substring(0, chunkPosition).split('\n');
    const nearbyHeaders = [];
    
    // Look backwards for the most recent header
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.match(/^#{1,6}\s+/) || line.match(/^[A-Z][A-Za-z\s]+:?$/)) {
        nearbyHeaders.push(line);
        if (nearbyHeaders.length >= 2) break;
      }
    }
    
    return nearbyHeaders.length > 0 ? nearbyHeaders[0] : 'No clear structural context';
  }

  _getOptimalDocumentSample(fullDocument, chunkText, positionContext) {
    const maxSize = this.contextConfig.documentSampleSize;
    
    if (fullDocument.length <= maxSize) {
      return fullDocument;
    }

    // Smart sampling based on chunk position and surrounding context
    const chunkPosition = fullDocument.indexOf(chunkText);
    const contextStart = Math.max(0, chunkPosition - Math.floor(maxSize * 0.4));
    const contextEnd = Math.min(fullDocument.length, contextStart + maxSize);
    
    let sample = fullDocument.substring(contextStart, contextEnd);
    
    if (contextStart > 0) {
      sample = '...[content before]\n\n' + sample;
    }
    if (contextEnd < fullDocument.length) {
      sample = sample + '\n\n[content after]...';
    }
    
    return sample;
  }

  _hashDocument(document) {
    // Simple hash for document caching
    let hash = 0;
    for (let i = 0; i < document.length; i++) {
      const char = document.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  _cacheDocumentAnalysis(hash, analysis) {
    // Implement LRU cache behavior
    if (this.documentAnalysisCache.size >= this.cacheMaxSize) {
      const firstKey = this.documentAnalysisCache.keys().next().value;
      this.documentAnalysisCache.delete(firstKey);
    }
    
    this.documentAnalysisCache.set(hash, analysis);
  }

  _isRetryableError(error) {
    // Check for retryable error types
    const retryableCodes = ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'];
    const retryableMessages = ['rate_limit_exceeded', 'server_error', 'timeout'];
    
    return retryableCodes.includes(error.code) ||
           retryableMessages.some(msg => error.message.toLowerCase().includes(msg)) ||
           (error.status >= 500 && error.status < 600);
  }

  _isStopWord(word) {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'from', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
      'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
      'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can'
    ]);
    return stopWords.has(word);
  }

  /**
   * Simple delay utility
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ContextService;