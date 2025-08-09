/**
 * Streaming Content Processor
 * Intelligently processes large files by breaking them into logical documents
 * Creates separate document records for each chapter/section during upload
 */

const { v4: uuidv4 } = require('uuid');
const { logProcessingStep, logError, logPerformanceMetric } = require('../../utils/logger');
const { PROCESSING_STATUS, SSE_EVENTS } = require('../../utils/constants');

class StreamingProcessor {
  constructor(dependencies) {
    this.contentProcessor = dependencies.contentProcessor;
    this.fileProcessor = dependencies.fileProcessor;
    this.storageService = dependencies.storageService;
    this.db = dependencies.database || dependencies.databaseService;
    this.sseService = dependencies.sseService;
    this.backgroundQueue = dependencies.backgroundQueue;
    
    this.logger = require('../../utils/logger').createChildLogger({ 
      component: 'streaming-processor' 
    });

    this.logger.info('StreamingProcessor initialized');
  }

  /**
   * Intelligently process large files by breaking them into separate documents
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} filename - Original filename
   * @param {string} mimeType - MIME type
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing result with multiple document records
   */
  async processFileStreaming(fileBuffer, filename, mimeType, options = {}) {
    const startTime = Date.now();
    const sessionId = options.sessionId || uuidv4();
    const sseCallback = options.sseCallback;

    try {
      this.logger.info('Starting streaming file processing', {
        filename,
        mimeType,
        fileSize: fileBuffer.length,
        sessionId
      });

      // Step 1: Parse file and extract structure
      const parseResult = await this.fileProcessor.processFile(
        fileBuffer, 
        mimeType, 
        filename, 
        { sessionId }
      );

      if (sseCallback) {
        sseCallback(SSE_EVENTS.PROCESSING_STARTED, {
          step: 'file_parsed',
          message: `File parsed successfully: ${filename}`,
          sessionId,
          fileType: parseResult.type,
          contentLength: parseResult.content.length
        });
      }

      // Step 2: Determine if file should be processed as streaming
      const shouldStream = this._shouldProcessAsStreaming(parseResult, fileBuffer.length);
      
      if (!shouldStream) {
        this.logger.info('File too small for streaming, using regular processing', {
          filename,
          fileSize: fileBuffer.length,
          sessionId
        });
        
        // Use regular processing for small files
        return await this.contentProcessor.processFileContent(
          fileBuffer, 
          mimeType, 
          filename, 
          options
        );
      }

      // Step 3: Extract logical sections (chapters, parts, etc.)
      const sections = this._extractLogicalSections(parseResult, filename);
      
      if (sections.length <= 1) {
        this.logger.info('No logical sections found, using regular processing', {
          filename,
          sections: sections.length,
          sessionId
        });
        
        // No logical sections, use regular processing
        return await this.contentProcessor.processFileContent(
          fileBuffer, 
          mimeType, 
          filename, 
          options
        );
      }

      this.logger.info('Processing file with streaming approach', {
        filename,
        sections: sections.length,
        sessionId
      });

      // Step 4: Prepare for individual chapter document processing
      if (sseCallback) {
        sseCallback(SSE_EVENTS.PROCESSING_PROGRESS, {
          step: 'preparing_chapter_processing',
          message: `Preparing to process ${sections.length} chapters as individual documents`,
          sessionId,
          totalSections: sections.length
        });
      }

      // Step 5: Queue each section for independent document processing
      const sectionJobs = await this._queueSectionProcessing(
        sections,
        filename,
        parseResult,
        null, // No parent document - each section becomes its own document
        options
      );

      const totalTime = Date.now() - startTime;

      this.logger.info('Streaming file processing setup completed', {
        filename,
        sessionId,
        totalTime,
        documentsToCreate: sections.length,
        sectionJobs: sectionJobs.length,
        sections: sections.length
      });

      // Step 6: Start processing first few sections immediately
      this._startImmediateProcessing(sectionJobs, sseCallback);

      return {
        success: true,
        processingType: 'streaming',
        documentsToCreate: sections.length,
        sectionJobs,
        sectionsQueued: sections.length,
        estimatedProcessingTime: this._estimateProcessingTime(sections),
        fileInfo: {
          filename,
          mimeType,
          size: fileBuffer.length,
          type: parseResult.type
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'streaming_file_processing',
        filename,
        duration,
        bufferSize: fileBuffer.length,
        sessionId
      });

      if (sseCallback) {
        sseCallback(SSE_EVENTS.PROCESSING_ERROR, {
          step: 'streaming_processing_failed',
          message: `Streaming processing failed: ${error.message}`,
          sessionId,
          error: error.message
        });
      }

      throw new Error(`Streaming file processing failed for ${filename}: ${error.message}`);
    }
  }

  /**
   * Determine if file should be processed with streaming approach
   * @private
   */
  _shouldProcessAsStreaming(parseResult, fileSize) {
    // File size threshold (500KB+)
    const MIN_STREAMING_SIZE = 500 * 1024;
    
    if (fileSize < MIN_STREAMING_SIZE) {
      return false;
    }

    // Content length threshold (long documents)
    const MIN_CONTENT_LENGTH = 50000; // 50k characters
    
    if (parseResult.content.length < MIN_CONTENT_LENGTH) {
      return false;
    }

    // File types that support logical sections
    const STREAMABLE_TYPES = ['epub', 'pdf', 'docx'];
    
    return STREAMABLE_TYPES.includes(parseResult.type);
  }

  /**
   * Extract logical sections from parsed content
   * @private
   */
  _extractLogicalSections(parseResult, filename) {
    const sections = [];

    if (parseResult.type === 'epub' && parseResult.metadata.chapters) {
      // EPUB: Use chapters as sections
      parseResult.metadata.chapters.forEach((chapter, index) => {
        if (chapter.length > 1000) { // Only include substantial chapters
          sections.push({
            type: 'chapter',
            title: chapter.title || `Chapter ${index + 1}`,
            index: index,
            wordCount: chapter.wordCount,
            length: chapter.length,
            estimatedChunks: Math.ceil(chapter.length / 2000)
          });
        }
      });
    } else if (parseResult.type === 'pdf') {
      // PDF: Could implement page-based or section-based splitting
      // For now, split by estimated content size
      const contentLength = parseResult.content.length;
      const SECTION_SIZE = 20000; // 20k characters per section
      const numSections = Math.ceil(contentLength / SECTION_SIZE);
      
      for (let i = 0; i < numSections; i++) {
        sections.push({
          type: 'section',
          title: `Section ${i + 1}`,
          index: i,
          startChar: i * SECTION_SIZE,
          endChar: Math.min((i + 1) * SECTION_SIZE, contentLength),
          length: Math.min(SECTION_SIZE, contentLength - (i * SECTION_SIZE)),
          estimatedChunks: Math.ceil(SECTION_SIZE / 2000)
        });
      }
    } else {
      // Generic approach: Split large content into sections
      const contentLength = parseResult.content.length;
      const SECTION_SIZE = 15000; // 15k characters per section
      const numSections = Math.ceil(contentLength / SECTION_SIZE);
      
      if (numSections > 1) {
        for (let i = 0; i < numSections; i++) {
          sections.push({
            type: 'part',
            title: `Part ${i + 1}`,
            index: i,
            startChar: i * SECTION_SIZE,
            endChar: Math.min((i + 1) * SECTION_SIZE, contentLength),
            length: Math.min(SECTION_SIZE, contentLength - (i * SECTION_SIZE)),
            estimatedChunks: Math.ceil(SECTION_SIZE / 2000)
          });
        }
      }
    }

    this.logger.debug('Extracted logical sections', {
      filename,
      type: parseResult.type,
      totalSections: sections.length,
      sectionTypes: [...new Set(sections.map(s => s.type))]
    });

    return sections;
  }

  /**
   * Create parent document record
   * @private
   */
  async _createParentDocument(filename, parseResult, fileSize, sectionsCount, sessionId) {
    const title = parseResult.metadata?.title || filename.replace(/\.[^/.]+$/, '');
    const author = parseResult.metadata?.author;
    
    let summary = `📚 ${parseResult.type.toUpperCase()} document with ${sectionsCount} sections`;
    if (author) {
      summary += ` by ${author}`;
    }
    summary += `. Processing ${sectionsCount} sections independently for optimal performance.`;

    const chunkId = `doc_parent_${uuidv4()}`;
    
    try {
      const query = `
        INSERT INTO processed_content (
          url, title, summary, chunk_text, chunk_id, chunk_index,
          sentiment, emotions, category, content_type, technical_level,
          main_topics, key_concepts, tags, key_entities, embedding_status,
          processing_status, contextual_summary, uses_contextual_embedding,
          created_time, processed_date, upload_source, record_type, parent_document_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        )
        RETURNING *
      `;
      
      const values = [
        `file://${filename}`, // url
        title, // title
        summary, // summary
        '', // chunk_text (empty for parent document)
        chunkId, // chunk_id
        -1, // chunk_index (-1 indicates parent document)
        'neutral', // sentiment
        {}, // emotions
        parseResult.metadata?.subject || 'document', // category
        parseResult.type, // content_type
        'intermediate', // technical_level
        [], // main_topics
        [], // key_concepts
        [], // tags
        {}, // key_entities
        'not_applicable', // embedding_status (parent documents don't need embeddings)
        'processing', // processing_status
        null, // contextual_summary
        true, // uses_contextual_embedding
        new Date(), // created_time
        new Date(), // processed_date
        'user', // upload_source
        'parent_document', // record_type
        null // parent_document_id (this is the parent)
      ];
      
      const result = await this.db.query(query, values);
      const parentDocument = result.rows[0];
      
      this.logger.info('Created parent document record', {
        parentDocumentId: parentDocument.id,
        title,
        filename,
        sectionsCount,
        sessionId
      });
      
      return parentDocument;
      
    } catch (error) {
      this.logger.error('Failed to create parent document record', {
        error: error.message,
        filename,
        sessionId
      });
      throw error;
    }
  }

  /**
   * Queue each section for independent document processing
   * @private
   */
  async _queueSectionProcessing(sections, filename, parseResult, parentDocument, options) {
    const sectionJobs = [];
    
    for (const section of sections) {
      // Extract section content
      const sectionContent = this._extractSectionContent(section, parseResult);
      
      // Create unique URL for each chapter document
      const sectionUrl = `file://${filename}#${section.type}-${section.index + 1}`;
      
      // Queue section for document processing
      const job = {
        type: 'chapter_document_processing',
        id: uuidv4(),
        sessionId: options.sessionId,
        section: section,
        content: sectionContent,
        url: sectionUrl,
        originalFilename: filename,
        options: {
          ...options,
          sectionInfo: section,
          documentTitle: `${parseResult.metadata?.title || filename} - ${section.title}`,
          chapterProcessing: true
        },
        priority: section.index < 3 ? 1 : 2, // Process first 3 sections with high priority
        createdAt: new Date()
      };
      
      sectionJobs.push(job);
    }
    
    this.logger.info('Created chapter document processing jobs', {
      filename,
      totalChapterDocuments: sections.length,
      totalJobs: sectionJobs.length
    });
    
    return sectionJobs;
  }

  /**
   * Extract content for a specific section
   * @private
   */
  _extractSectionContent(section, parseResult) {
    if (section.type === 'chapter') {
      // For EPUB chapters, we need to re-extract the chapter content
      // This is a simplified approach - in a full implementation,
      // you'd want to store chapter contents separately during parsing
      const fullContent = parseResult.content;
      const chapterMarker = `## ${section.title}`;
      const chapterStart = fullContent.indexOf(chapterMarker);
      
      if (chapterStart !== -1) {
        const nextChapterStart = fullContent.indexOf('\n## ', chapterStart + chapterMarker.length);
        const chapterEnd = nextChapterStart !== -1 ? nextChapterStart : fullContent.length;
        
        return fullContent.substring(chapterStart, chapterEnd).trim();
      }
      
      // Fallback: estimate chapter content by position
      const avgChapterLength = Math.floor(fullContent.length / parseResult.metadata.chapters.length);
      const start = section.index * avgChapterLength;
      const end = Math.min(start + avgChapterLength, fullContent.length);
      
      return fullContent.substring(start, end).trim();
    } else {
      // For sections with defined start/end positions
      return parseResult.content.substring(section.startChar, section.endChar).trim();
    }
  }

  /**
   * Start processing first few sections immediately
   * @private
   */
  async _startImmediateProcessing(sectionJobs, sseCallback) {
    // Process first 2-3 high-priority sections immediately
    const immediateJobs = sectionJobs.filter(job => job.priority === 1).slice(0, 3);
    
    for (const job of immediateJobs) {
      // Start processing this section
      this._processSectionJob(job, sseCallback).catch(error => {
        this.logger.error('Immediate section processing failed', {
          jobId: job.id,
          section: job.section.title,
          error: error.message
        });
      });
    }
    
    // Queue remaining sections for background processing
    const backgroundJobs = sectionJobs.filter(job => !immediateJobs.includes(job));
    for (const job of backgroundJobs) {
      // Add to background queue with delay
      setTimeout(() => {
        this._processSectionJob(job, sseCallback).catch(error => {
          this.logger.error('Background section processing failed', {
            jobId: job.id,
            section: job.section.title,
            error: error.message
          });
        });
      }, job.section.index * 2000); // Stagger by 2 seconds each
    }
  }

  /**
   * Process a single section as an independent document
   * @private
   */
  async _processSectionJob(job, sseCallback) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing section job', {
        jobId: job.id,
        section: job.section.title,
        parentDocumentId: job.parentDocumentId
      });

      if (sseCallback) {
        sseCallback(SSE_EVENTS.PROCESSING_PROGRESS, {
          step: 'section_processing_started',
          message: `Processing ${job.section.title}`,
          sessionId: job.sessionId,
          sectionTitle: job.section.title,
          sectionIndex: job.section.index + 1,
          parentDocumentId: job.parentDocumentId
        });
      }

      // Process section content as an individual document
      const result = await this.contentProcessor.processFileContent(
        Buffer.from(job.content, 'utf8'),
        'text/plain', // Since we already extracted the text content
        `${job.section.title}.txt`,
        {
          ...job.options,
          sessionId: job.sessionId,
          url: job.url,
          metadata: {
            ...job.options.metadata,
            section: job.section,
            chapterTitle: job.section.title,
            chapterIndex: job.section.index + 1,
            isChapterDocument: true
          }
        }
      );

      const totalTime = Date.now() - startTime;

      this.logger.info('Section processing completed', {
        jobId: job.id,
        section: job.section.title,
        totalTime,
        chunksProcessed: result.processedChunks || result.totalChunks,
        documentCreated: true
      });

      if (sseCallback) {
        sseCallback(SSE_EVENTS.PROCESSING_PROGRESS, {
          step: 'section_processing_completed',
          message: `Completed ${job.section.title}`,
          sessionId: job.sessionId,
          sectionTitle: job.section.title,
          sectionIndex: job.section.index + 1,
          chunksProcessed: result.processedChunks || result.totalChunks,
          processingTime: totalTime,
          documentCreated: true
        });
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Section processing failed', {
        jobId: job.id,
        section: job.section.title,
        error: error.message,
        duration,
        chapterTitle: job.section.title
      });

      if (sseCallback) {
        sseCallback(SSE_EVENTS.PROCESSING_ERROR, {
          step: 'section_processing_failed',
          message: `Failed to process ${job.section.title}: ${error.message}`,
          sessionId: job.sessionId,
          sectionTitle: job.section.title,
          error: error.message,
          chapterTitle: job.section.title
        });
      }

      throw error;
    }
  }

  /**
   * Estimate total processing time for all sections
   * @private
   */
  _estimateProcessingTime(sections) {
    // Base time per section (in seconds)
    const BASE_TIME_PER_SECTION = 30;
    
    // Additional time based on section complexity
    const totalComplexity = sections.reduce((sum, section) => {
      return sum + (section.estimatedChunks * 5); // 5 seconds per estimated chunk
    }, 0);
    
    const estimatedSeconds = (sections.length * BASE_TIME_PER_SECTION) + totalComplexity;
    
    return {
      estimatedSeconds,
      estimatedMinutes: Math.ceil(estimatedSeconds / 60),
      breakdown: {
        sections: sections.length,
        avgTimePerSection: BASE_TIME_PER_SECTION,
        complexityTime: totalComplexity,
        totalTime: estimatedSeconds
      }
    };
  }
}

module.exports = StreamingProcessor;