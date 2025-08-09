/**
 * DOCX Parser
 * Handles DOCX/DOC file parsing using mammoth library
 */

const mammoth = require('mammoth');
const { logPerformanceMetric, logError } = require('../../../utils/logger');

class DOCXParser {
  constructor(config = {}) {
    this.config = {
      enableMetadataExtraction: config.enableMetadataExtraction !== false,
      includeEmbeddedObjects: config.includeEmbeddedObjects || false,
      preserveFormatting: config.preserveFormatting || false,
      convertImages: config.convertImages || false,
      styleMap: config.styleMap || null, // Custom style mapping
      transformDocument: config.transformDocument || null // Custom transform function
    };

    this.logger = require('../../../utils/logger').createChildLogger({ 
      component: 'docx-parser' 
    });

    // Configure mammoth options
    this.mammothOptions = this._buildMammothOptions();
  }

  /**
   * Parse DOCX buffer and extract text content
   * @param {Buffer} buffer - DOCX file buffer
   * @param {string} filename - Original filename
   * @param {Object} options - Parsing options
   * @returns {Promise<Object>} Parsed content and metadata
   */
  async parse(buffer, filename, options = {}) {
    const startTime = Date.now();

    try {
      this.logger.debug('Starting DOCX parsing', {
        filename,
        bufferSize: buffer.length,
        preserveFormatting: this.config.preserveFormatting,
        convertImages: this.config.convertImages
      });

      // Parse document with mammoth
      const result = await mammoth.extractRawText({ buffer }, this.mammothOptions);

      const duration = Date.now() - startTime;

      // Extract and clean content
      const content = this._cleanTextContent(result.value);

      // Build metadata
      const metadata = this._buildMetadata(result, filename, buffer);

      // Validate extraction
      this._validateExtraction(content, result, filename);

      logPerformanceMetric('docx_parsing', duration, 'ms', {
        filename: filename.substring(0, 50),
        contentLength: content.length,
        bufferSize: buffer.length,
        messagesCount: result.messages?.length || 0
      });

      this.logger.info('DOCX parsing completed successfully', {
        filename,
        duration,
        contentLength: content.length,
        warningsCount: result.messages?.filter(m => m.type === 'warning').length || 0,
        errorsCount: result.messages?.filter(m => m.type === 'error').length || 0
      });

      return {
        content,
        type: 'docx',
        metadata,
        processingInfo: {
          parsingTime: duration,
          originalSize: buffer.length,
          contentSize: content.length,
          compressionRatio: content.length / buffer.length,
          messages: this._processMessages(result.messages)
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'docx_parsing',
        filename,
        duration,
        bufferSize: buffer.length
      });

      // Provide more specific error messages
      if (error.message.includes('not a valid zip file')) {
        throw new Error(`Invalid or corrupted DOCX file: ${filename}`);
      } else if (error.message.includes('password')) {
        throw new Error(`DOCX file is password protected: ${filename}`);
      } else if (error.message.includes('encrypted')) {
        throw new Error(`DOCX file is encrypted: ${filename}`);
      }

      throw new Error(`DOCX parsing failed for ${filename}: ${error.message}`);
    }
  }

  /**
   * Build mammoth parsing options
   * @private
   */
  _buildMammothOptions() {
    const options = {};

    // Style mapping for better formatting preservation
    if (this.config.styleMap) {
      options.styleMap = this.config.styleMap;
    } else if (this.config.preserveFormatting) {
      // Default style map for basic formatting
      options.styleMap = [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Title'] => h1.title:fresh",
        "p[style-name='Subtitle'] => h2.subtitle:fresh",
        "r[style-name='Strong'] => strong",
        "r[style-name='Emphasis'] => em"
      ].join('\n');
    }

    // Image conversion
    if (this.config.convertImages) {
      options.convertImage = mammoth.images.imgElement((image) => {
        return image.read('base64').then((imageBuffer) => {
          return {
            src: `data:${image.contentType};base64,${imageBuffer}`
          };
        });
      });
    } else {
      // Skip images for text-only extraction
      options.convertImage = mammoth.images.imgElement(() => {
        return Promise.resolve({ src: '' });
      });
    }

    // Document transformation
    if (this.config.transformDocument) {
      options.transformDocument = this.config.transformDocument;
    }

    return options;
  }

  /**
   * Clean and normalize extracted text content
   * @private
   */
  _cleanTextContent(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      
      // Clean up whitespace
      .replace(/[ \t]+/g, ' ')           // Multiple spaces/tabs to single space
      .replace(/\n[ \t]+/g, '\n')        // Remove leading whitespace on lines
      .replace(/[ \t]+\n/g, '\n')        // Remove trailing whitespace on lines
      .replace(/\n{3,}/g, '\n\n')        // Multiple newlines to double newline
      
      // Remove Word-specific artifacts
      .replace(/\u00A0/g, ' ')           // Non-breaking space to regular space
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width characters
      .replace(/\ufeff/g, '')            // Byte order mark
      
      // Clean up common Word export issues
      .replace(/([.!?])\s*([A-Z])/g, '$1 $2') // Ensure space after sentences
      .replace(/([a-z])([A-Z])/g, '$1 $2')    // Add space between camelCase
      .replace(/\u2013|\u2014/g, '-')         // Em/en dashes to hyphens
      .replace(/\u2018|\u2019/g, "'")         // Smart quotes to regular
      .replace(/\u201C|\u201D/g, '"')         // Smart double quotes
      .replace(/\u2026/g, '...')              // Ellipsis to three dots
      
      .trim();
  }

  /**
   * Build metadata object from parsing result
   * @private
   */
  _buildMetadata(result, filename, buffer) {
    const metadata = {
      format: 'DOCX',
      filename: filename,
      originalSize: buffer.length
    };

    // Add content statistics
    const textLength = result.value?.length || 0;
    metadata.statistics = {
      totalCharacters: textLength,
      estimatedWords: textLength > 0 ? Math.round(textLength / 5) : 0,
      estimatedPages: textLength > 0 ? Math.ceil(textLength / 2000) : 0, // ~2000 chars per page
      hasText: textLength > 0
    };

    // Process mammoth messages for metadata
    if (result.messages && result.messages.length > 0) {
      const warnings = result.messages.filter(m => m.type === 'warning');
      const errors = result.messages.filter(m => m.type === 'error');
      const info = result.messages.filter(m => m.type === 'info');

      metadata.processingMessages = {
        total: result.messages.length,
        warnings: warnings.length,
        errors: errors.length,
        info: info.length
      };

      // Add details if metadata extraction is enabled
      if (this.config.enableMetadataExtraction) {
        metadata.detailedMessages = {
          warnings: warnings.map(m => m.message).slice(0, 5), // Limit to 5
          errors: errors.map(m => m.message).slice(0, 5),
          info: info.map(m => m.message).slice(0, 5)
        };
      }
    }

    // Document features detected
    metadata.features = {
      hasImages: result.messages?.some(m => m.message.includes('image')) || false,
      hasTables: result.messages?.some(m => m.message.includes('table')) || false,
      hasStyles: result.messages?.some(m => m.message.includes('style')) || false,
      hasFootnotes: result.messages?.some(m => m.message.includes('footnote')) || false,
      hasHeaders: result.messages?.some(m => m.message.includes('header')) || false
    };

    return metadata;
  }

  /**
   * Process mammoth messages for reporting
   * @private
   */
  _processMessages(messages) {
    if (!messages || !Array.isArray(messages)) {
      return { summary: 'No processing messages' };
    }

    const processed = {
      total: messages.length,
      byType: {
        error: messages.filter(m => m.type === 'error').length,
        warning: messages.filter(m => m.type === 'warning').length,
        info: messages.filter(m => m.type === 'info').length
      },
      commonIssues: this._analyzeCommonIssues(messages)
    };

    return processed;
  }

  /**
   * Analyze common issues in mammoth messages
   * @private
   */
  _analyzeCommonIssues(messages) {
    const issues = {
      unsupportedStyles: 0,
      unsupportedElements: 0,
      imageConversionIssues: 0,
      tableConversionIssues: 0,
      footnoteIssues: 0
    };

    messages.forEach(message => {
      const msg = message.message.toLowerCase();
      
      if (msg.includes('style') && msg.includes('unrecognised')) {
        issues.unsupportedStyles++;
      } else if (msg.includes('image')) {
        issues.imageConversionIssues++;
      } else if (msg.includes('table')) {
        issues.tableConversionIssues++;
      } else if (msg.includes('footnote')) {
        issues.footnoteIssues++;
      } else if (msg.includes('element') && msg.includes('ignored')) {
        issues.unsupportedElements++;
      }
    });

    return issues;
  }

  /**
   * Validate extraction results
   * @private
   */
  _validateExtraction(content, result, filename) {
    // Check if extraction was successful
    if (!content || content.length === 0) {
      this.logger.warn('DOCX extraction resulted in empty content', {
        filename,
        hasMessages: !!result.messages,
        messagesCount: result.messages?.length || 0
      });
    }

    // Check for excessive warnings/errors
    const errors = result.messages?.filter(m => m.type === 'error') || [];
    const warnings = result.messages?.filter(m => m.type === 'warning') || [];

    if (errors.length > 10) {
      this.logger.warn('DOCX extraction had many errors', {
        filename,
        errorCount: errors.length,
        contentLength: content.length
      });
    }

    if (warnings.length > 20) {
      this.logger.warn('DOCX extraction had many warnings', {
        filename,
        warningCount: warnings.length,
        contentLength: content.length
      });
    }

    // Check for very short content relative to file size
    const contentRatio = content.length / result.value.length;
    if (contentRatio < 0.5 && result.value.length > 1000) {
      this.logger.warn('DOCX extraction resulted in significantly reduced content', {
        filename,
        originalLength: result.value.length,
        cleanedLength: content.length,
        ratio: Math.round(contentRatio * 100) / 100
      });
    }
  }

  /**
   * Get parser capabilities
   * @returns {Object} Parser capabilities and features
   */
  getCapabilities() {
    return {
      formats: ['docx', 'doc'],
      features: {
        textExtraction: true,
        metadataExtraction: this.config.enableMetadataExtraction,
        structurePreservation: this.config.preserveFormatting,
        imageExtraction: this.config.convertImages,
        tableExtraction: true,
        styleMapping: true,
        footnoteExtraction: true,
        headerFooterExtraction: true
      },
      limitations: {
        maxFileSize: '100MB',
        passwordProtected: 'Not supported',
        macroEnabled: 'Macros ignored',
        complexFormatting: 'May lose some formatting',
        embeddedObjects: 'Limited support'
      },
      performance: {
        typicalSpeed: 'Fast',
        memoryUsage: 'Low to Moderate'
      }
    };
  }

  /**
   * Get parser statistics
   * @returns {Object} Usage statistics
   */
  getStats() {
    return {
      parserType: 'DOCX',
      library: 'mammoth',
      config: {
        enableMetadataExtraction: this.config.enableMetadataExtraction,
        preserveFormatting: this.config.preserveFormatting,
        convertImages: this.config.convertImages,
        includeEmbeddedObjects: this.config.includeEmbeddedObjects
      },
      capabilities: this.getCapabilities()
    };
  }

  /**
   * Test if parser can handle the given buffer
   * @param {Buffer} buffer - File buffer to test
   * @returns {boolean} True if likely a DOCX file
   */
  canParse(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
      return false;
    }

    // Check for ZIP magic bytes (DOCX is a ZIP-based format)
    const header = buffer.toString('hex', 0, 4);
    const isZip = header === '504b0304' || header === '504b0506' || header === '504b0708';
    
    if (!isZip) {
      return false;
    }

    // Look for DOCX-specific content in the first few KB
    const firstKB = buffer.toString('ascii', 0, Math.min(1024, buffer.length));
    return firstKB.includes('word/') || firstKB.includes('docProps/');
  }

  /**
   * Update parser configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Rebuild mammoth options if relevant config changed
    if (newConfig.styleMap || newConfig.preserveFormatting !== undefined || 
        newConfig.convertImages !== undefined) {
      this.mammothOptions = this._buildMammothOptions();
    }
    
    this.logger.info('DOCX parser configuration updated', {
      changedFields: Object.keys(newConfig),
      rebuiltOptions: !!(newConfig.styleMap || newConfig.preserveFormatting !== undefined || 
                        newConfig.convertImages !== undefined)
    });
  }
}

module.exports = DOCXParser;