/**
 * Text Parser
 * Handles plain text and markdown file parsing with encoding detection
 */

const { logPerformanceMetric, logError } = require('../../../utils/logger');

class TextParser {
  constructor(config = {}) {
    this.config = {
      enableMetadataExtraction: config.enableMetadataExtraction !== false,
      autoDetectEncoding: config.autoDetectEncoding !== false,
      defaultEncoding: config.defaultEncoding || 'utf8',
      preserveFormatting: config.preserveFormatting !== false,
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB for text files
      normalizeLineEndings: config.normalizeLineEndings !== false,
      trimWhitespace: config.trimWhitespace !== false
    };

    this.logger = require('../../../utils/logger').createChildLogger({ 
      component: 'text-parser' 
    });

    // Common text file encodings to try
    this.encodings = ['utf8', 'ascii', 'latin1', 'utf16le'];
  }

  /**
   * Parse text buffer and extract content
   * @param {Buffer} buffer - Text file buffer
   * @param {string} filename - Original filename
   * @param {Object} options - Parsing options
   * @returns {Promise<Object>} Parsed content and metadata
   */
  async parse(buffer, filename, options = {}) {
    const startTime = Date.now();

    try {
      this.logger.debug('Starting text parsing', {
        filename,
        bufferSize: buffer.length,
        autoDetectEncoding: this.config.autoDetectEncoding,
        preserveFormatting: this.config.preserveFormatting
      });

      // Detect encoding and convert to string
      const { content, encoding } = await this._decodeBuffer(buffer, filename);

      // Determine file type
      const fileType = this._determineFileType(filename, content);

      // Process content based on type
      const processedContent = this._processContent(content, fileType);

      // Build metadata
      const metadata = this._buildMetadata(content, processedContent, encoding, fileType, filename, buffer);

      const duration = Date.now() - startTime;

      logPerformanceMetric('text_parsing', duration, 'ms', {
        filename: filename.substring(0, 50),
        contentLength: processedContent.length,
        bufferSize: buffer.length,
        encoding,
        fileType
      });

      this.logger.info('Text parsing completed successfully', {
        filename,
        duration,
        contentLength: processedContent.length,
        encoding,
        fileType,
        originalSize: buffer.length
      });

      return {
        content: processedContent,
        type: fileType,
        metadata,
        processingInfo: {
          parsingTime: duration,
          originalSize: buffer.length,
          contentSize: processedContent.length,
          encoding,
          fileType,
          compressionRatio: processedContent.length / buffer.length
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'text_parsing',
        filename,
        duration,
        bufferSize: buffer.length
      });

      throw new Error(`Text parsing failed for ${filename}: ${error.message}`);
    }
  }

  /**
   * Decode buffer to string with encoding detection
   * @private
   */
  async _decodeBuffer(buffer, filename) {
    // Check for BOM (Byte Order Mark)
    const bom = this._detectBOM(buffer);
    if (bom.encoding) {
      this.logger.debug('BOM detected', { encoding: bom.encoding, filename });
      return {
        content: buffer.toString(bom.encoding, bom.offset),
        encoding: bom.encoding
      };
    }

    // Try configured encoding first
    if (!this.config.autoDetectEncoding) {
      return {
        content: buffer.toString(this.config.defaultEncoding),
        encoding: this.config.defaultEncoding
      };
    }

    // Auto-detect encoding by trying different encodings
    for (const encoding of this.encodings) {
      try {
        const content = buffer.toString(encoding);
        
        // Check if content looks valid (no replacement characters for most of the text)
        const replacementChars = (content.match(/�/g) || []).length;
        const totalChars = content.length;
        
        if (totalChars > 0 && replacementChars / totalChars < 0.01) {
          this.logger.debug('Encoding detected', { encoding, filename, replacementChars, totalChars });
          return { content, encoding };
        }
      } catch (error) {
        // Try next encoding
        continue;
      }
    }

    // Fallback to default encoding
    this.logger.warn('Could not detect encoding, using default', {
      filename,
      defaultEncoding: this.config.defaultEncoding
    });
    
    return {
      content: buffer.toString(this.config.defaultEncoding),
      encoding: this.config.defaultEncoding
    };
  }

  /**
   * Detect Byte Order Mark (BOM)
   * @private
   */
  _detectBOM(buffer) {
    if (buffer.length < 2) return { encoding: null, offset: 0 };

    // UTF-8 BOM
    if (buffer.length >= 3 && 
        buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      return { encoding: 'utf8', offset: 3 };
    }

    // UTF-16 LE BOM
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
      return { encoding: 'utf16le', offset: 2 };
    }

    // UTF-16 BE BOM
    if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
      return { encoding: 'utf16be', offset: 2 };
    }

    return { encoding: null, offset: 0 };
  }

  /**
   * Determine file type based on filename and content
   * @private
   */
  _determineFileType(filename, content) {
    const extension = filename.toLowerCase().split('.').pop();
    
    // Check file extension first
    if (extension === 'md' || extension === 'markdown') {
      return 'markdown';
    }
    
    if (extension === 'txt' || extension === 'text') {
      return 'text';
    }

    // Analyze content for markdown patterns
    if (this._looksLikeMarkdown(content)) {
      return 'markdown';
    }

    return 'text';
  }

  /**
   * Check if content looks like markdown
   * @private
   */
  _looksLikeMarkdown(content) {
    const markdownPatterns = [
      /^#{1,6}\s+/, // Headers
      /\*\*.*?\*\*/, // Bold
      /\*.*?\*/, // Italic
      /\[.*?\]\(.*?\)/, // Links
      /```/, // Code blocks
      /^\s*[-*+]\s+/m, // Lists
      /^\s*\d+\.\s+/m, // Numbered lists
      /^\s*>\s+/m // Blockquotes
    ];

    let matchCount = 0;
    const sampleSize = Math.min(content.length, 2000);
    const sample = content.substring(0, sampleSize);

    for (const pattern of markdownPatterns) {
      if (pattern.test(sample)) {
        matchCount++;
      }
    }

    // If 3 or more markdown patterns are found, consider it markdown
    return matchCount >= 3;
  }

  /**
   * Process content based on file type and configuration
   * @private
   */
  _processContent(content, fileType) {
    let processed = content;

    // Normalize line endings if configured
    if (this.config.normalizeLineEndings) {
      processed = processed.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    // Handle formatting preservation
    if (!this.config.preserveFormatting) {
      // Basic cleanup while preserving structure
      processed = processed
        .replace(/[ \t]+/g, ' ')  // Multiple spaces to single
        .replace(/\n[ \t]+/g, '\n')  // Remove leading whitespace on lines
        .replace(/[ \t]+\n/g, '\n')  // Remove trailing whitespace on lines
        .replace(/\n{4,}/g, '\n\n\n');  // Limit consecutive newlines
    }

    // Trim whitespace if configured
    if (this.config.trimWhitespace) {
      processed = processed.trim();
    }

    return processed;
  }

  /**
   * Build metadata object
   * @private
   */
  _buildMetadata(originalContent, processedContent, encoding, fileType, filename, buffer) {
    const metadata = {
      format: fileType.toUpperCase(),
      filename: filename,
      encoding: encoding,
      originalSize: buffer.length
    };

    if (this.config.enableMetadataExtraction) {
      // Content analysis
      metadata.contentAnalysis = this._analyzeContent(originalContent, fileType);
      
      // Processing summary
      metadata.processing = {
        preservedFormatting: this.config.preserveFormatting,
        normalizedLineEndings: this.config.normalizeLineEndings,
        trimmedWhitespace: this.config.trimWhitespace,
        sizeReduction: ((buffer.length - processedContent.length) / buffer.length) * 100
      };
    }

    // Basic statistics
    metadata.statistics = {
      totalCharacters: processedContent.length,
      totalLines: (processedContent.match(/\n/g) || []).length + 1,
      estimatedWords: processedContent.trim().length > 0 
        ? processedContent.trim().split(/\s+/).length 
        : 0,
      estimatedReadingTime: this._estimateReadingTime(processedContent),
      hasContent: processedContent.trim().length > 0
    };

    return metadata;
  }

  /**
   * Analyze content for additional metadata
   * @private
   */
  _analyzeContent(content, fileType) {
    const analysis = {
      type: fileType,
      language: this._detectLanguage(content),
      structure: this._analyzeStructure(content, fileType)
    };

    // Markdown-specific analysis
    if (fileType === 'markdown') {
      analysis.markdown = this._analyzeMarkdown(content);
    }

    return analysis;
  }

  /**
   * Simple language detection (basic English/non-English)
   * @private
   */
  _detectLanguage(content) {
    const sample = content.substring(0, 1000).toLowerCase();
    
    // Count common English words
    const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const wordCount = englishWords.filter(word => 
      sample.includes(` ${word} `) || sample.startsWith(`${word} `) || sample.endsWith(` ${word}`)
    ).length;

    return wordCount >= 3 ? 'en' : 'unknown';
  }

  /**
   * Analyze text structure
   * @private
   */
  _analyzeStructure(content, fileType) {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    
    const structure = {
      totalLines: lines.length,
      nonEmptyLines: nonEmptyLines.length,
      emptyLines: lines.length - nonEmptyLines.length,
      averageLineLength: nonEmptyLines.length > 0 
        ? Math.round(nonEmptyLines.reduce((sum, line) => sum + line.length, 0) / nonEmptyLines.length)
        : 0,
      longestLine: Math.max(...lines.map(line => line.length)),
      shortestNonEmptyLine: nonEmptyLines.length > 0 
        ? Math.min(...nonEmptyLines.map(line => line.length))
        : 0
    };

    return structure;
  }

  /**
   * Analyze markdown-specific features
   * @private
   */
  _analyzeMarkdown(content) {
    const analysis = {
      headers: {
        h1: (content.match(/^# /gm) || []).length,
        h2: (content.match(/^## /gm) || []).length,
        h3: (content.match(/^### /gm) || []).length,
        h4: (content.match(/^#### /gm) || []).length,
        h5: (content.match(/^##### /gm) || []).length,
        h6: (content.match(/^###### /gm) || []).length
      },
      lists: {
        unordered: (content.match(/^\s*[-*+]\s+/gm) || []).length,
        ordered: (content.match(/^\s*\d+\.\s+/gm) || []).length
      },
      formatting: {
        bold: (content.match(/\*\*.*?\*\*/g) || []).length,
        italic: (content.match(/\*.*?\*/g) || []).length,
        code: (content.match(/`.*?`/g) || []).length,
        codeBlocks: (content.match(/```[\s\S]*?```/g) || []).length
      },
      links: (content.match(/\[.*?\]\(.*?\)/g) || []).length,
      images: (content.match(/!\[.*?\]\(.*?\)/g) || []).length,
      blockquotes: (content.match(/^\s*>\s+/gm) || []).length,
      tables: (content.match(/\|.*\|/g) || []).length > 0
    };

    analysis.totalHeaders = Object.values(analysis.headers).reduce((sum, count) => sum + count, 0);
    analysis.totalLists = analysis.lists.unordered + analysis.lists.ordered;
    analysis.totalFormatting = Object.values(analysis.formatting).reduce((sum, count) => sum + count, 0);

    return analysis;
  }

  /**
   * Estimate reading time in minutes
   * @private
   */
  _estimateReadingTime(content) {
    const wordsPerMinute = 200; // Average reading speed
    const wordCount = content.trim().length > 0 
      ? content.trim().split(/\s+/).length 
      : 0;
    
    return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
  }

  /**
   * Get parser capabilities
   * @returns {Object} Parser capabilities and features
   */
  getCapabilities() {
    return {
      formats: ['text', 'markdown', 'txt'],
      features: {
        textExtraction: true,
        metadataExtraction: this.config.enableMetadataExtraction,
        encodingDetection: this.config.autoDetectEncoding,
        bomSupport: true,
        markdownAnalysis: true,
        structureAnalysis: true,
        languageDetection: true,
        formattingPreservation: this.config.preserveFormatting
      },
      limitations: {
        maxFileSize: `${Math.round(this.config.maxFileSize / 1024 / 1024)}MB`,
        binaryFiles: 'Not supported',
        complexFormatting: 'Basic support only'
      },
      performance: {
        typicalSpeed: 'Very Fast',
        memoryUsage: 'Very Low'
      }
    };
  }

  /**
   * Get parser statistics
   * @returns {Object} Usage statistics
   */
  getStats() {
    return {
      parserType: 'Text/Markdown',
      library: 'native',
      config: {
        enableMetadataExtraction: this.config.enableMetadataExtraction,
        autoDetectEncoding: this.config.autoDetectEncoding,
        defaultEncoding: this.config.defaultEncoding,
        preserveFormatting: this.config.preserveFormatting,
        maxFileSize: this.config.maxFileSize
      },
      capabilities: this.getCapabilities()
    };
  }

  /**
   * Test if parser can handle the given buffer
   * @param {Buffer} buffer - File buffer to test
   * @returns {boolean} True if likely a text file
   */
  canParse(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return false;
    }

    // Check for binary content by looking for null bytes and control characters
    const sample = buffer.slice(0, Math.min(1000, buffer.length));
    let textBytes = 0;
    let controlBytes = 0;

    for (let i = 0; i < sample.length; i++) {
      const byte = sample[i];
      
      if (byte === 0) {
        // Null byte - likely binary
        return false;
      } else if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        // Control character (except tab, LF, CR)
        controlBytes++;
      } else {
        textBytes++;
      }
    }

    // If more than 5% are control characters, probably not text
    return controlBytes / sample.length < 0.05;
  }

  /**
   * Update parser configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Text parser configuration updated', {
      changedFields: Object.keys(newConfig)
    });
  }
}

module.exports = TextParser;