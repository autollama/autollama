/**
 * EPUB Parser
 * Handles EPUB file parsing using epub library and cheerio for HTML cleaning
 */

const epub = require('epub');
const cheerio = require('cheerio');
const fs = require('fs');
const tmp = require('tmp');
const { logPerformanceMetric, logError } = require('../../../utils/logger');

class EPUBParser {
  constructor(config = {}) {
    this.config = {
      enableMetadataExtraction: config.enableMetadataExtraction !== false,
      tempDirectory: config.tempDirectory || '/tmp',
      maxChapters: config.maxChapters || null, // No limit by default
      preserveChapterStructure: config.preserveChapterStructure !== false,
      includeImages: config.includeImages || false,
      timeout: config.timeout || 30000 // 30 seconds
    };

    this.logger = require('../../../utils/logger').createChildLogger({ 
      component: 'epub-parser' 
    });
  }

  /**
   * Parse EPUB buffer and extract text content
   * @param {Buffer} buffer - EPUB file buffer
   * @param {string} filename - Original filename
   * @param {Object} options - Parsing options
   * @returns {Promise<Object>} Parsed content and metadata
   */
  async parse(buffer, filename, options = {}) {
    const startTime = Date.now();
    let tempFilePath = null;
    let cleanupCallback = null;

    try {
      this.logger.debug('Starting EPUB parsing', {
        filename,
        bufferSize: buffer.length,
        preserveStructure: this.config.preserveChapterStructure
      });

      // Create temporary file since epub library requires file path
      const tempFile = await this._createTempFile(buffer);
      tempFilePath = tempFile.path;
      cleanupCallback = tempFile.cleanup;

      // Parse EPUB
      const epubData = await this._parseEpubFile(tempFilePath, filename);

      const duration = Date.now() - startTime;

      // Build result object
      const result = {
        content: epubData.content,
        type: 'epub',
        metadata: epubData.metadata,
        processingInfo: {
          parsingTime: duration,
          chaptersProcessed: epubData.chaptersProcessed,
          originalSize: buffer.length,
          contentSize: epubData.content.length,
          compressionRatio: epubData.content.length / buffer.length
        }
      };

      logPerformanceMetric('epub_parsing', duration, 'ms', {
        filename: filename.substring(0, 50),
        chapters: epubData.chaptersProcessed,
        contentLength: epubData.content.length,
        bufferSize: buffer.length
      });

      this.logger.info('EPUB parsing completed successfully', {
        filename,
        duration,
        chapters: epubData.chaptersProcessed,
        contentLength: epubData.content.length,
        title: epubData.metadata.title
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'epub_parsing',
        filename,
        duration,
        bufferSize: buffer.length
      });

      // Provide more specific error messages
      if (error.message.includes('Invalid EPUB')) {
        throw new Error(`Invalid or corrupted EPUB file: ${filename}`);
      } else if (error.message.includes('timeout')) {
        throw new Error(`EPUB parsing timed out for ${filename} (${this.config.timeout}ms)`);
      }

      throw new Error(`EPUB parsing failed for ${filename}: ${error.message}`);

    } finally {
      // Cleanup temporary file
      if (cleanupCallback) {
        try {
          cleanupCallback();
        } catch (cleanupError) {
          this.logger.warn('Failed to cleanup temporary file', {
            tempPath: tempFilePath,
            error: cleanupError.message
          });
        }
      }
    }
  }

  /**
   * Create temporary file from buffer
   * @private
   */
  async _createTempFile(buffer) {
    return new Promise((resolve, reject) => {
      tmp.file({ 
        postfix: '.epub',
        dir: this.config.tempDirectory,
        keep: false
      }, (err, path, fd, cleanupCallback) => {
        if (err) {
          reject(err);
          return;
        }

        fs.writeFile(path, buffer, (writeErr) => {
          if (writeErr) {
            cleanupCallback();
            reject(writeErr);
            return;
          }

          resolve({ path, cleanup: cleanupCallback });
        });
      });
    });
  }

  /**
   * Parse EPUB file and extract content
   * @private
   */
  async _parseEpubFile(filePath, filename) {
    return new Promise((resolve, reject) => {
      const epubParser = new epub(filePath);
      
      // Set timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`EPUB parsing timeout (${this.config.timeout}ms)`));
      }, this.config.timeout);

      epubParser.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`EPUB parsing error: ${error.message}`));
      });

      epubParser.on('end', async () => {
        try {
          clearTimeout(timeoutId);
          
          const result = await this._extractContent(epubParser, filename);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      // Start parsing
      epubParser.parse();
    });
  }

  /**
   * Extract content from parsed EPUB
   * @private
   */
  async _extractContent(epubParser, filename) {
    const chapters = epubParser.flow || [];
    const metadata = this._extractMetadata(epubParser);

    // Handle empty EPUB
    if (chapters.length === 0) {
      this.logger.warn('EPUB contains no chapters', { filename });
      return {
        content: '',
        metadata,
        chaptersProcessed: 0
      };
    }

    // Limit chapters if configured
    const chaptersToProcess = this.config.maxChapters 
      ? chapters.slice(0, this.config.maxChapters)
      : chapters;

    // Extract text from each chapter
    const chapterContents = await this._extractChapterContents(
      epubParser, 
      chaptersToProcess, 
      filename
    );

    // Combine content
    const content = this.config.preserveChapterStructure
      ? this._combineWithStructure(chapterContents, metadata)
      : this._combineAsPlainText(chapterContents);

    return {
      content: this._cleanContent(content),
      metadata: {
        ...metadata,
        chapters: chapterContents.map(ch => ({
          title: ch.title,
          length: ch.content.length,
          wordCount: ch.content.split(/\s+/).length
        }))
      },
      chaptersProcessed: chapterContents.length
    };
  }

  /**
   * Extract metadata from EPUB
   * @private
   */
  _extractMetadata(epubParser) {
    const metadata = {
      format: 'EPUB'
    };

    if (this.config.enableMetadataExtraction && epubParser.metadata) {
      const meta = epubParser.metadata;
      
      metadata.title = this._cleanString(meta.title) || 'Unknown Title';
      metadata.author = this._cleanString(meta.creator) || 'Unknown Author';
      metadata.language = this._cleanString(meta.language) || 'en';
      metadata.publisher = this._cleanString(meta.publisher);
      metadata.description = this._cleanString(meta.description);
      metadata.rights = this._cleanString(meta.rights);
      metadata.date = this._cleanString(meta.date);
      metadata.identifier = this._cleanString(meta.identifier);
      metadata.subject = this._cleanString(meta.subject);

      // Clean up null/undefined values
      Object.keys(metadata).forEach(key => {
        if (metadata[key] === null || metadata[key] === undefined || metadata[key] === '') {
          delete metadata[key];
        }
      });
    }

    return metadata;
  }

  /**
   * Extract content from all chapters
   * @private
   */
  async _extractChapterContents(epubParser, chapters, filename) {
    const chapterContents = [];
    const promises = [];

    // Process chapters sequentially to avoid overwhelming the parser
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      
      try {
        const content = await this._extractSingleChapter(epubParser, chapter);
        chapterContents.push({
          id: chapter.id,
          title: chapter.title || `Chapter ${i + 1}`,
          content: content,
          index: i
        });
      } catch (error) {
        this.logger.warn('Failed to extract chapter content', {
          filename,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          error: error.message
        });
        
        // Add empty chapter to maintain structure
        chapterContents.push({
          id: chapter.id,
          title: chapter.title || `Chapter ${i + 1}`,
          content: '',
          index: i,
          error: error.message
        });
      }
    }

    return chapterContents;
  }

  /**
   * Extract content from a single chapter
   * @private
   */
  async _extractSingleChapter(epubParser, chapter) {
    return new Promise((resolve, reject) => {
      epubParser.getChapter(chapter.id, (error, html) => {
        if (error) {
          reject(error);
          return;
        }

        if (!html) {
          resolve('');
          return;
        }

        try {
          // Parse HTML and extract text
          const $ = cheerio.load(html);
          
          // Remove unwanted elements
          $('script, style, nav, .navigation, .nav').remove();
          
          // Extract text content
          const text = $.text();
          
          resolve(this._cleanChapterText(text));
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
  }

  /**
   * Clean chapter text content
   * @private
   */
  _cleanChapterText(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      // Normalize whitespace
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[ ]+/g, ' ')
      
      // Clean up line breaks
      .replace(/\n[ ]+/g, '\n')
      .replace(/[ ]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      
      // Remove common artifacts
      .replace(/\u00A0/g, ' ')  // Non-breaking space
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width characters
      
      .trim();
  }

  /**
   * Combine chapters with preserved structure
   * @private
   */
  _combineWithStructure(chapterContents, metadata) {
    let combined = '';
    
    // Add title if available
    if (metadata.title) {
      combined += `# ${metadata.title}\n\n`;
      
      if (metadata.author) {
        combined += `*By ${metadata.author}*\n\n`;
      }
      
      combined += '---\n\n';
    }

    // Add each chapter with structure
    chapterContents.forEach((chapter, index) => {
      if (chapter.content.trim()) {
        // Add chapter heading
        if (chapter.title && chapter.title !== `Chapter ${index + 1}`) {
          combined += `## ${chapter.title}\n\n`;
        } else {
          combined += `## Chapter ${index + 1}\n\n`;
        }
        
        combined += chapter.content.trim() + '\n\n';
      }
    });

    return combined.trim();
  }

  /**
   * Combine chapters as plain text
   * @private
   */
  _combineAsPlainText(chapterContents) {
    return chapterContents
      .map(chapter => chapter.content.trim())
      .filter(content => content.length > 0)
      .join('\n\n');
  }

  /**
   * Final content cleaning
   * @private
   */
  _cleanContent(content) {
    if (!content) return '';

    return content
      .replace(/\n{4,}/g, '\n\n\n')  // Limit consecutive newlines
      .replace(/[ \t]{2,}/g, ' ')    // Multiple spaces to single
      .trim();
  }

  /**
   * Clean metadata strings
   * @private
   */
  _cleanString(value) {
    if (!value || typeof value !== 'string') {
      return null;
    }

    return value
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\s+/g, ' ')
      .trim() || null;
  }

  /**
   * Get parser capabilities
   * @returns {Object} Parser capabilities and features
   */
  getCapabilities() {
    return {
      formats: ['epub'],
      features: {
        textExtraction: true,
        metadataExtraction: this.config.enableMetadataExtraction,
        structurePreservation: this.config.preserveChapterStructure,
        imageExtraction: this.config.includeImages,
        chapterSeparation: true,
        tableOfContents: true,
        htmlCleaning: true
      },
      limitations: {
        maxFileSize: '100MB',
        drmProtected: 'Not supported',
        corruptedFiles: 'May fail',
        complexLayouts: 'Basic structure only'
      },
      performance: {
        typicalSpeed: '1-3 chapters/second',
        memoryUsage: 'Moderate to High'
      }
    };
  }

  /**
   * Get parser statistics
   * @returns {Object} Usage statistics
   */
  getStats() {
    return {
      parserType: 'EPUB',
      library: 'epub + cheerio',
      config: {
        enableMetadataExtraction: this.config.enableMetadataExtraction,
        maxChapters: this.config.maxChapters,
        preserveChapterStructure: this.config.preserveChapterStructure,
        timeout: this.config.timeout
      },
      capabilities: this.getCapabilities()
    };
  }

  /**
   * Test if parser can handle the given buffer
   * @param {Buffer} buffer - File buffer to test
   * @returns {boolean} True if likely an EPUB file
   */
  canParse(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
      return false;
    }

    // Check for ZIP magic bytes (EPUB is a ZIP file)
    const header = buffer.toString('hex', 0, 4);
    return header === '504b0304' || header === '504b0506' || header === '504b0708';
  }

  /**
   * Update parser configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('EPUB parser configuration updated', {
      changedFields: Object.keys(newConfig)
    });
  }
}

module.exports = EPUBParser;