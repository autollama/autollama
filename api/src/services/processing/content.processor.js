/**
 * Content Processor Service
 * Main orchestrator for content processing pipeline
 * Handles chunking, analysis, context generation, and storage coordination
 */

const { v4: uuidv4 } = require('uuid');
const ChunkingService = require('./chunking.service');
const ContextService = require('./context.service');
const FileProcessor = require('./file.processor');
const URLFetcher = require('./url.fetcher');
const { logProcessingStep, logError, logPerformanceMetric } = require('../../utils/logger');
const { PROCESSING_STATUS, SSE_EVENTS, DEFAULTS } = require('../../utils/constants');

class ContentProcessor {
  constructor(dependencies) {
    // Validate required dependencies
    this._validateDependencies(dependencies);

    // Core services
    this.aiService = dependencies.aiService;
    this.storageService = dependencies.storageService;
    this.vectorService = dependencies.vectorService;
    this.monitoringService = dependencies.monitoringService;
    this.sessionService = dependencies.sessionService;

    // Processing services
    this.chunkingService = new ChunkingService(dependencies.config?.processing);
    this.contextService = new ContextService(
      dependencies.aiService?.client,  // Use .client instead of .openaiClient
      dependencies.config?.ai?.contextualEmbeddings
    );
    this.fileProcessor = new FileProcessor(dependencies.config?.upload);
    this.urlFetcher = new URLFetcher(dependencies.config?.urlFetching);

    // Configuration
    this.config = dependencies.config || {};
    this.processingConfig = this.config.processing || {};
    
    // Processing state tracking
    this.activeProcessingSessions = new Map();
    
    // Logger
    this.logger = require('../../utils/logger').createChildLogger({ component: 'content-processor' });

    this.logger.info('ContentProcessor initialized', {
      contextualEmbeddings: this.contextService.enabled,
      defaultConcurrency: this.processingConfig.maxConcurrentJobs || DEFAULTS.MAX_CONCURRENT_OPERATIONS
    });
  }

  /**
   * Main content processing pipeline
   * @param {string} content - Raw content to process
   * @param {string} url - Source URL
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing results
   */
  async processContentChunks(content, url, options = {}) {
    const startTime = Date.now();
    const sessionId = options.sessionId || uuidv4();
    
    // Extract options
    const {
      sseCallback = null,
      uploadSession = null,
      chunkSize = this.processingConfig.chunkSize,
      chunkOverlap = this.processingConfig.chunkOverlap,
      enableContextual = this.contextService.enabled,
      concurrencyLimit = null
    } = options;

    let processedChunks = 0;
    let qdrantStored = 0;
    let documentRecord = null;

    try {
      // Start monitoring session
      const monitoringSession = this.monitoringService?.startProcessingSession?.(url, sessionId);

      this.logger.info('Starting content processing pipeline', {
        sessionId,
        url,
        contentLength: content.length,
        enableContextual,
        chunkSize,
        chunkOverlap
      });

      // Step 1: Chunk the content
      const chunks = await this._processChunking(content, url, { chunkSize, chunkOverlap }, sseCallback, sessionId);

      // Step 2: Create document record
      documentRecord = await this._createDocumentRecord(content, url, chunks, sseCallback, sessionId);

      // Step 3: Track processing session
      this._trackProcessingSession(sessionId, url, chunks, uploadSession);

      // Step 4: Process chunks in batches
      const processingResults = await this._processChunkBatches(
        content, 
        chunks, 
        { enableContextual, concurrencyLimit, sessionId, sseCallback, documentRecord }
      );

      processedChunks = processingResults.processedChunks;
      qdrantStored = processingResults.qdrantStored;

      // Step 5: Complete processing
      await this._completeProcessing(sessionId, uploadSession, sseCallback);

      const totalTime = Date.now() - startTime;
      
      logPerformanceMetric('content_processing_complete', totalTime, 'ms', {
        sessionId,
        chunksProcessed: processedChunks,
        qdrantStored,
        url
      });

      this.logger.info('Content processing pipeline completed successfully', {
        sessionId,
        totalTime,
        chunksProcessed: processedChunks,
        qdrantStored,
        url
      });

      return {
        success: true,
        sessionId,
        totalChunks: chunks.length,
        processedChunks,
        qdrantStored,
        documentRecord,
        processingTime: totalTime,
        averageTimePerChunk: Math.round(totalTime / chunks.length)
      };

    } catch (error) {
      await this._handleProcessingError(error, sessionId, uploadSession, sseCallback);
      throw error;
    } finally {
      // Cleanup
      this.activeProcessingSessions.delete(sessionId);
      if (this.monitoringService?.endSession) {
        this.monitoringService.endSession(sessionId);
      }
    }
  }

  /**
   * Process content chunking step
   * @private
   */
  async _processChunking(content, url, chunkOptions, sseCallback, sessionId) {
    logProcessingStep('chunking_start', sessionId, { contentLength: content.length });

    if (sseCallback) {
      sseCallback(SSE_EVENTS.PROCESSING_STARTED, {
        step: 'chunking',
        message: 'Starting content chunking...',
        sessionId
      });
    }

    const chunks = this.chunkingService.chunkText(content, url, chunkOptions);

    if (sseCallback) {
      sseCallback(SSE_EVENTS.CHUNK_PROCESSED, {
        step: 'chunking_complete',
        message: `Created ${chunks.length} chunks`,
        sessionId,
        totalChunks: chunks.length
      });
    }

    logProcessingStep('chunking_complete', sessionId, { 
      chunksCreated: chunks.length,
      avgChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.chunk_text.length, 0) / chunks.length)
    });

    return chunks;
  }

  /**
   * Create document record
   * @private
   */
  async _createDocumentRecord(content, url, chunks, sseCallback, sessionId) {
    try {
      if (sseCallback) {
        sseCallback(SSE_EVENTS.PROCESSING_STARTED, {
          step: 'document_creation',
          message: 'Creating document record...',
          sessionId
        });
      }

      // Extract title and generate summary
      const title = this._extractTitle(content, url);
      const summary = await this._generateDocumentSummary(content, url);

      const documentRecord = await this.storageService.createDocumentRecord({
        url,
        title,
        summary,
        full_content: content.substring(0, 5000), // Store first 5000 chars as preview
        upload_source: 'user',
        metadata: {
          total_chunks: chunks.length,
          content_length: content.length,
          processing_session: sessionId
        }
      });

      if (sseCallback) {
        sseCallback(SSE_EVENTS.SESSION_UPDATED, {
          step: 'document_created',
          message: `Document created: ${title}`,
          sessionId,
          documentId: documentRecord.id,
          title,
          totalChunks: chunks.length
        });
      }

      logProcessingStep('document_created', sessionId, {
        documentId: documentRecord.id,
        title,
        totalChunks: chunks.length
      });

      return documentRecord;

    } catch (error) {
      this.logger.warn('Failed to create document record', {
        error: error.message,
        sessionId,
        url
      });
      return null; // Continue processing even if document creation fails
    }
  }

  /**
   * Track processing session
   * @private
   */
  _trackProcessingSession(sessionId, url, chunks, uploadSession) {
    this.activeProcessingSessions.set(sessionId, {
      id: sessionId,
      url,
      filename: url.split('/').pop() || 'Unknown File',
      totalChunks: chunks.length,
      processedChunks: 0,
      startTime: new Date(),
      lastUpdate: new Date(),
      status: PROCESSING_STATUS.PROCESSING,
      uploadSession
    });

    logProcessingStep('session_tracked', sessionId, {
      totalChunks: chunks.length,
      url
    });
  }

  /**
   * Process chunks in batches with concurrency control
   * @private
   */
  async _processChunkBatches(content, chunks, options) {
    const { enableContextual, concurrencyLimit, sessionId, sseCallback, documentRecord } = options;
    
    // Determine optimal concurrency
    const optimalConcurrency = this._calculateOptimalConcurrency(chunks.length, concurrencyLimit);
    
    let processedChunks = 0;
    let qdrantStored = 0;

    this.logger.info('Starting batch processing', {
      sessionId,
      totalChunks: chunks.length,
      concurrency: optimalConcurrency,
      enableContextual
    });

    // Process chunks in batches
    for (let i = 0; i < chunks.length; i += optimalConcurrency) {
      const batch = chunks.slice(i, i + optimalConcurrency);
      
      const batchPromises = batch.map(async (chunk) => {
        // Add timeout wrapper for individual chunk processing
        return Promise.race([
          this._processSingleChunk(content, chunk, {
            enableContextual,
            sessionId,
            sseCallback,
            documentRecord,
            totalChunks: chunks.length
          }),
          // Timeout individual chunks after 10 minutes
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Chunk ${chunk.chunk_index + 1} processing timeout after 10 minutes`));
            }, 600000); // 10 minutes
          })
        ]).catch(error => {
          this.logger.warn('Chunk processing failed or timed out', {
            chunkIndex: chunk.chunk_index,
            sessionId,
            error: error.message
          });
          
          // Return partial success for timeout/error cases
          return { processed: false, stored: false, error: error.message };
        });
      });

      const batchResults = await Promise.all(batchPromises);
      
      // Update counters
      batchResults.forEach(result => {
        if (result.processed) processedChunks++;
        if (result.stored) qdrantStored++;
      });

      // Update session tracking
      this._updateSessionProgress(sessionId, processedChunks);

      // Send progress update
      if (sseCallback) {
        const progress = Math.round((processedChunks / chunks.length) * 100);
        sseCallback(SSE_EVENTS.PROGRESS_UPDATE, {
          step: 'batch_processing',
          message: `Processed ${processedChunks}/${chunks.length} chunks (${progress}%)`,
          sessionId,
          progress,
          processedChunks,
          totalChunks: chunks.length
        });
      }

      // Progress heartbeat and delay between batches
      if (sseCallback) {
        sseCallback(SSE_EVENTS.PROGRESS_UPDATE, {
          step: 'batch_heartbeat',
          message: `Batch ${Math.ceil(i / optimalConcurrency) + 1} completed`,
          sessionId,
          processedChunks,
          totalChunks: chunks.length,
          heartbeat: true
        });
      }
      
      // Small delay between batches to prevent overwhelming external services
      if (i + optimalConcurrency < chunks.length) {
        await this._delay(200); // Slightly longer delay for stability
      }
    }

    return { processedChunks, qdrantStored };
  }

  /**
   * Process a single chunk through the complete pipeline
   * @private
   */
  async _processSingleChunk(content, chunk, options) {
    const { enableContextual, sessionId, sseCallback, documentRecord, totalChunks } = options;
    const chunkStartTime = Date.now();

    try {
      const progress = Math.round(((chunk.chunk_index + 1) / totalChunks) * 100);
      
      this.logger.debug('Processing chunk', {
        sessionId,
        chunkIndex: chunk.chunk_index + 1,
        totalChunks,
        progress
      });

      // Enhanced chunk data for monitoring
      const chunkData = {
        chunkId: chunk.chunk_id,
        sessionId,
        currentChunk: chunk.chunk_index + 1,
        totalChunks,
        title: documentRecord?.title || `Chunk ${chunk.chunk_index + 1}`,
        preview: chunk.chunk_text?.substring(0, 200) + '...',
        position: chunk.chunk_index / totalChunks
      };

      // Step 1: Analyze chunk
      if (sseCallback) {
        sseCallback(SSE_EVENTS.PROCESSING_STARTED, {
          step: 'analyze',
          message: `Analyzing chunk ${chunk.chunk_index + 1}/${totalChunks}...`,
          sessionId,
          chunkData,
          progress
        });
      }

      const analysis = await this.aiService.analyzeChunk(chunk.chunk_text);

      if (sseCallback) {
        sseCallback(SSE_EVENTS.ANALYSIS_COMPLETED, {
          step: 'analyze_complete',
          message: `Analyzed chunk ${chunk.chunk_index + 1}: ${analysis.sentiment || 'neutral'}`,
          sessionId,
          chunkData
        });
      }

      // Step 2: Generate contextual summary (if enabled)
      let contextualSummary = null;
      if (enableContextual) {
        if (sseCallback) {
          sseCallback(SSE_EVENTS.PROCESSING_STARTED, {
            step: 'context_generate',
            message: `Generating contextual summary for chunk ${chunk.chunk_index + 1}/${totalChunks}...`,
            sessionId,
            chunkData,
            heartbeat: true
          });
        }

        contextualSummary = await this.contextService.generateChunkContext(content, chunk.chunk_text, {
          chunkIndex: chunk.chunk_index,
          totalChunks: totalChunks,
          enableRetry: true
        });

        if (sseCallback) {
          sseCallback(SSE_EVENTS.PROCESSING_STARTED, {
            step: 'context_complete',
            message: `Generated context for chunk ${chunk.chunk_index + 1}`,
            sessionId,
            chunkData,
            heartbeat: true
          });
        }
      }

      // Step 3: Generate embedding
      if (sseCallback) {
        sseCallback(SSE_EVENTS.EMBEDDING_CREATED, {
          step: 'embedding',
          message: `Creating ${contextualSummary ? 'contextual ' : ''}embeddings for chunk ${chunk.chunk_index + 1}...`,
          sessionId,
          chunkData
        });
      }

      const embedding = await this.aiService.generateEmbedding(chunk.chunk_text, contextualSummary);

      // Step 4: Store in vector database
      let stored = false;
      try {
        if (sseCallback) {
          sseCallback(SSE_EVENTS.PROCESSING_STARTED, {
            step: 'embed_storing',
            message: `Storing chunk ${chunk.chunk_index + 1} in vector database...`,
            sessionId,
            chunkData
          });
        }

        await this.vectorService.storeInQdrant(chunk, embedding, analysis, contextualSummary);
        stored = true;

        if (sseCallback) {
          sseCallback(SSE_EVENTS.PROCESSING_COMPLETED, {
            step: 'embed_complete',
            message: `Stored chunk ${chunk.chunk_index + 1} in vector database`,
            sessionId,
            chunkData
          });
        }

      } catch (storageError) {
        this.logger.warn('Vector storage failed for chunk', {
          chunkIndex: chunk.chunk_index,
          error: storageError.message,
          sessionId
        });

        if (sseCallback) {
          sseCallback(SSE_EVENTS.ERROR_OCCURRED, {
            step: 'embed_error',
            message: `Vector storage failed for chunk ${chunk.chunk_index + 1}: ${storageError.message}`,
            sessionId,
            chunkData,
            error: storageError.message
          });
        }
      }

      // Step 5: Store chunk in PostgreSQL with enhanced metadata
      try {
        const enhancedMetadata = {
          document_type: documentRecord?.metadata?.document_type || 'general_article',
          chunking_method: chunk.chunking_method || 'fixed',
          boundaries_respected: chunk.boundaries_respected || [],
          semantic_boundary_type: chunk.boundaryType || null,
          structural_context: chunk.structuralContext || null,
          document_position: (chunk.chunk_index + 1) / totalChunks,
          section_title: chunk.sectionTitle || null,
          section_level: chunk.sectionLevel || null,
          context_generation_method: contextualSummary ? 'enhanced_v2.2' : null,
          context_generation_time: Date.now() - chunkStartTime,
          context_cache_hit: false // Will be updated by context service if cached
        };
        
        await this.storageService.storeChunkRecord(chunk, analysis, contextualSummary, documentRecord?.id, enhancedMetadata);
      } catch (dbError) {
        this.logger.warn('Database storage failed for chunk', {
          chunkIndex: chunk.chunk_index,
          error: dbError.message,
          sessionId
        });
      }

      const chunkTime = Date.now() - chunkStartTime;
      logPerformanceMetric('chunk_processing_time', chunkTime, 'ms', {
        chunkIndex: chunk.chunk_index,
        sessionId,
        hasContext: !!contextualSummary,
        stored
      });

      return { processed: true, stored };

    } catch (error) {
      logError(error, {
        chunkIndex: chunk.chunk_index,
        sessionId,
        step: 'chunk_processing'
      });

      if (sseCallback) {
        sseCallback(SSE_EVENTS.ERROR_OCCURRED, {
          step: 'chunk_error',
          message: `Error processing chunk ${chunk.chunk_index + 1}: ${error.message}`,
          sessionId,
          error: error.message
        });
      }

      return { processed: false, stored: false };
    }
  }

  /**
   * Calculate optimal concurrency based on chunk count and system limits
   * @private
   */
  _calculateOptimalConcurrency(chunkCount, userLimit = null) {
    if (userLimit !== null) {
      return Math.max(1, Math.min(userLimit, this.processingConfig.maxConcurrentJobs || DEFAULTS.MAX_CONCURRENT_OPERATIONS));
    }

    // Enhanced adaptive concurrency for better timeout handling
    let concurrency = 2; // Conservative default for reliability
    
    if (chunkCount > 1000) {
      concurrency = 1; // Serial processing for very large files to prevent timeouts
    } else if (chunkCount > 200) {
      concurrency = 1; // Serial for large files to ensure stability
    } else if (chunkCount > 50) {
      concurrency = 2; // Limited concurrency for medium files
    } else if (chunkCount < 10) {
      concurrency = 3; // Higher for small files
    }

    const maxConcurrency = this.processingConfig.maxConcurrentJobs || DEFAULTS.MAX_CONCURRENT_OPERATIONS;
    const finalConcurrency = Math.min(concurrency, maxConcurrency);
    
    this.logger.info('Calculated optimal concurrency', {
      chunkCount,
      calculatedConcurrency: concurrency,
      maxAllowed: maxConcurrency,
      finalConcurrency
    });
    
    return finalConcurrency;
  }

  /**
   * Update session progress tracking
   * @private
   */
  _updateSessionProgress(sessionId, processedChunks) {
    const session = this.activeProcessingSessions.get(sessionId);
    if (session) {
      session.processedChunks = processedChunks;
      session.lastUpdate = new Date();
    }
  }

  /**
   * Complete processing and cleanup
   * @private
   */
  async _completeProcessing(sessionId, uploadSession, sseCallback) {
    try {
      // Update upload session if exists
      if (uploadSession && this.sessionService?.updateSession) {
        await this.sessionService.updateSession(uploadSession.sessionId, {
          status: PROCESSING_STATUS.COMPLETED,
          completed_at: new Date()
        });
      }

      // Update active session
      const session = this.activeProcessingSessions.get(sessionId);
      if (session) {
        session.status = PROCESSING_STATUS.COMPLETED;
      }

      if (sseCallback) {
        sseCallback(SSE_EVENTS.PROCESSING_COMPLETED, {
          step: 'completed',
          message: 'Content processing completed successfully',
          sessionId
        });
      }

      logProcessingStep('processing_completed', sessionId);

    } catch (error) {
      this.logger.warn('Error completing processing session', {
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * Handle processing errors
   * @private
   */
  async _handleProcessingError(error, sessionId, uploadSession, sseCallback) {
    logError(error, { sessionId, step: 'content_processing' });

    // Update session status
    const session = this.activeProcessingSessions.get(sessionId);
    if (session) {
      session.status = PROCESSING_STATUS.FAILED;
    }

    if (uploadSession && this.sessionService?.updateSession) {
      try {
        await this.sessionService.updateSession(uploadSession.sessionId, {
          status: PROCESSING_STATUS.FAILED,
          error_message: error.message
        });
      } catch (updateError) {
        this.logger.warn('Failed to update session error status', {
          sessionId,
          error: updateError.message
        });
      }
    }

    if (sseCallback) {
      sseCallback(SSE_EVENTS.ERROR_OCCURRED, {
        step: 'processing_error',
        message: `Processing failed: ${error.message}`,
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * Extract title from content or URL
   * @private
   */
  _extractTitle(content, url) {
    // Try to extract title from content first
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Look for markdown headers or obvious titles
    for (const line of lines.slice(0, 10)) { // Check first 10 non-empty lines
      if (line.startsWith('# ') || line.startsWith('## ')) {
        return line.replace(/^#+\s+/, '').trim();
      }
      if (line.length > 10 && line.length < 100 && !line.includes('.')) {
        return line;
      }
    }
    
    // Fallback to URL-based title
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.split('/').pop() || urlObj.hostname;
    } catch {
      return 'Unknown Document';
    }
  }

  /**
   * Generate document summary
   * @private
   */
  async _generateDocumentSummary(content, url) {
    try {
      // Take first 2000 characters for summary
      const previewContent = content.substring(0, 2000);
      return await this.aiService.generateSummary(previewContent);
    } catch (error) {
      this.logger.warn('Failed to generate document summary', {
        error: error.message,
        url
      });
      return 'Summary generation failed';
    }
  }

  /**
   * Validate required dependencies
   * @private
   */
  _validateDependencies(dependencies) {
    const required = ['aiService', 'storageService', 'vectorService'];
    const missing = required.filter(dep => !dependencies[dep]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required dependencies: ${missing.join(', ')}`);
    }
  }

  /**
   * Simple delay utility
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Process file content through the complete pipeline
   * @param {Buffer} fileBuffer - File buffer to process
   * @param {string} mimeType - File MIME type
   * @param {string} filename - Original filename
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing results
   */
  async processFileContent(fileBuffer, mimeType, filename, options = {}) {
    const startTime = Date.now();
    const sessionId = options.sessionId || uuidv4();

    try {
      this.logger.info('Starting file content processing', {
        filename,
        mimeType,
        fileSize: fileBuffer.length,
        sessionId
      });

      // Step 1: Parse file with FileProcessor
      const parseResult = await this.fileProcessor.processFile(
        fileBuffer, 
        mimeType, 
        filename, 
        { sessionId }
      );

      if (options.sseCallback) {
        options.sseCallback(SSE_EVENTS.PROCESSING_STARTED, {
          step: 'file_parsed',
          message: `File parsed successfully: ${filename}`,
          sessionId,
          fileType: parseResult.type,
          contentLength: parseResult.content.length
        });
      }

      // Step 2: Process the extracted content through the main pipeline
      const processingResult = await this.processContentChunks(
        parseResult.content,
        `file://${filename}`,
        {
          ...options,
          sessionId,
          metadata: {
            originalFile: {
              filename,
              mimeType,
              size: fileBuffer.length,
              type: parseResult.type,
              metadata: parseResult.metadata
            }
          }
        }
      );

      const totalTime = Date.now() - startTime;

      this.logger.info('File content processing completed', {
        filename,
        sessionId,
        totalTime,
        chunksProcessed: processingResult.processedChunks,
        fileType: parseResult.type
      });

      return {
        ...processingResult,
        fileInfo: {
          filename,
          mimeType,
          type: parseResult.type,
          size: fileBuffer.length,
          metadata: parseResult.metadata,
          processingInfo: parseResult.processingInfo
        },
        totalProcessingTime: totalTime
      };

    } catch (error) {
      logError(error, {
        operation: 'file_content_processing',
        filename,
        mimeType,
        sessionId
      });

      throw new Error(`File processing failed for ${filename}: ${error.message}`);
    }
  }

  /**
   * Process URL content through the complete pipeline
   * @param {string} url - URL to fetch and process
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing results
   */
  async processURLContent(url, options = {}) {
    const startTime = Date.now();
    const sessionId = options.sessionId || uuidv4();

    try {
      this.logger.info('Starting URL content processing', {
        url: url.substring(0, 100),
        sessionId
      });

      // Step 1: Fetch content from URL
      const fetchResult = await this.urlFetcher.fetchContent(url, options.fetchOptions);

      if (options.sseCallback) {
        options.sseCallback(SSE_EVENTS.PROCESSING_STARTED, {
          step: 'url_fetched',
          message: `Content fetched from URL: ${url.substring(0, 50)}...`,
          sessionId,
          contentType: fetchResult.type,
          contentLength: fetchResult.content.length,
          finalUrl: fetchResult.metadata.finalUrl
        });
      }

      // Step 2: Process the fetched content through the main pipeline
      const processingResult = await this.processContentChunks(
        fetchResult.content,
        fetchResult.metadata.finalUrl || url,
        {
          ...options,
          sessionId,
          metadata: {
            originalUrl: {
              url,
              finalUrl: fetchResult.metadata.finalUrl,
              type: fetchResult.type,
              metadata: fetchResult.metadata
            }
          }
        }
      );

      const totalTime = Date.now() - startTime;

      this.logger.info('URL content processing completed', {
        url: url.substring(0, 100),
        sessionId,
        totalTime,
        chunksProcessed: processingResult.processedChunks,
        contentType: fetchResult.type
      });

      return {
        ...processingResult,
        urlInfo: {
          originalUrl: url,
          finalUrl: fetchResult.metadata.finalUrl,
          type: fetchResult.type,
          metadata: fetchResult.metadata,
          processingInfo: fetchResult.processingInfo
        },
        totalProcessingTime: totalTime
      };

    } catch (error) {
      logError(error, {
        operation: 'url_content_processing',
        url: url.substring(0, 100),
        sessionId
      });

      throw new Error(`URL processing failed for ${url}: ${error.message}`);
    }
  }

  /**
   * Test file processing capability
   * @param {Buffer} fileBuffer - File buffer to test
   * @param {string} mimeType - File MIME type
   * @param {string} filename - Original filename
   * @returns {Promise<Object>} Test result
   */
  async testFileProcessing(fileBuffer, mimeType, filename) {
    try {
      const isSupported = this.fileProcessor.isSupported(mimeType, filename);
      
      if (!isSupported) {
        return {
          supported: false,
          reason: 'File type not supported',
          mimeType,
          filename
        };
      }

      const parser = await this.fileProcessor.getParser(mimeType, filename);
      
      return {
        supported: true,
        mimeType,
        filename,
        parser: parser?.constructor.name || 'Unknown',
        capabilities: parser?.getCapabilities?.() || {}
      };

    } catch (error) {
      return {
        supported: false,
        reason: error.message,
        mimeType,
        filename
      };
    }
  }

  /**
   * Test URL accessibility
   * @param {string} url - URL to test
   * @returns {Promise<Object>} Test result
   */
  async testURLAccess(url) {
    try {
      return await this.urlFetcher.testURL(url);
    } catch (error) {
      return {
        accessible: false,
        error: error.message,
        url: url.substring(0, 100)
      };
    }
  }

  /**
   * Get current processing statistics
   * @returns {Object} Processing statistics
   */
  getProcessingStats() {
    const activeSessions = Array.from(this.activeProcessingSessions.values());
    
    return {
      activeSessions: activeSessions.length,
      totalChunksInProgress: activeSessions.reduce((sum, s) => sum + s.totalChunks, 0),
      totalChunksProcessed: activeSessions.reduce((sum, s) => sum + s.processedChunks, 0),
      contextualEnabled: this.contextService.enabled,
      chunkingStats: this.chunkingService.getStats?.() || {},
      contextStats: this.contextService.getStats(),
      fileProcessorStats: this.fileProcessor.getStats(),
      urlFetcherStats: this.urlFetcher.getStats()
    };
  }

  /**
   * Stop/cancel an active processing session
   * @param {string} sessionId - Session ID to stop
   * @returns {Object} Stop result
   */
  stopProcessingSession(sessionId) {
    try {
      const session = this.activeProcessingSessions.get(sessionId);
      
      if (!session) {
        return {
          success: false,
          error: 'Session not found or already completed',
          sessionId
        };
      }

      // Mark session as cancelled
      session.status = PROCESSING_STATUS.CANCELLED || 'cancelled';
      session.lastUpdate = new Date();
      session.cancelled = true;

      // Remove from active sessions
      this.activeProcessingSessions.delete(sessionId);

      // End monitoring session if available
      if (this.monitoringService?.endSession) {
        this.monitoringService.endSession(sessionId);
      }

      this.logger.info('Processing session stopped', {
        sessionId,
        url: session.url,
        processedChunks: session.processedChunks,
        totalChunks: session.totalChunks
      });

      return {
        success: true,
        message: 'Processing session stopped successfully',
        sessionId,
        session: {
          id: session.id,
          url: session.url,
          filename: session.filename,
          processedChunks: session.processedChunks,
          totalChunks: session.totalChunks
        }
      };

    } catch (error) {
      this.logger.error('Error stopping processing session', {
        sessionId,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        sessionId
      };
    }
  }
}

module.exports = ContentProcessor;