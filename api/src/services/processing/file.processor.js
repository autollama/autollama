/**
 * File Processor Service
 * Main orchestrator for file parsing with pluggable parser system
 */

const { logProcessingStep, logError, logPerformanceMetric } = require('../../utils/logger');
const { CONTENT_TYPES, FILE_EXTENSIONS, ERROR_CODES } = require('../../utils/constants');

// Import individual parsers
const PDFParser = require('./parsers/pdf.parser');
const EPUBParser = require('./parsers/epub.parser');
const DOCXParser = require('./parsers/docx.parser');
const CSVParser = require('./parsers/csv.parser');
const TextParser = require('./parsers/text.parser');
const HTMLParser = require('./parsers/html.parser');

class FileProcessor {
  constructor(config = {}) {
    this.config = {
      maxFileSize: config.maxFileSize || 100 * 1024 * 1024, // 100MB
      allowedTypes: config.allowedMimeTypes || [
        CONTENT_TYPES.PDF,
        CONTENT_TYPES.EPUB,
        CONTENT_TYPES.DOCX,
        CONTENT_TYPES.CSV,
        CONTENT_TYPES.PLAIN_TEXT,
        CONTENT_TYPES.HTML,
        CONTENT_TYPES.MARKDOWN
      ],
      tempDirectory: config.tempDir || '/tmp',
      enableMetadataExtraction: config.enableMetadataExtraction !== false
    };

    // Initialize parsers
    this.parsers = new Map();
    this._initializeParsers();

    // MIME type to extension mapping
    this.extensionMap = this._buildExtensionMap();
    
    this.logger = require('../../utils/logger').createChildLogger({ component: 'file-processor' });

    this.logger.info('File processor initialized', {
      supportedTypes: Array.from(this.parsers.keys()),
      maxFileSize: this.config.maxFileSize,
      tempDirectory: this.config.tempDirectory
    });
  }

  /**
   * Initialize parser instances
   * @private
   */
  _initializeParsers() {
    const parserConfig = {
      tempDirectory: this.config.tempDirectory,
      enableMetadataExtraction: this.config.enableMetadataExtraction
    };

    // Register parsers for each MIME type
    this.parsers.set(CONTENT_TYPES.PDF, new PDFParser(parserConfig));
    this.parsers.set(CONTENT_TYPES.EPUB, new EPUBParser(parserConfig));
    this.parsers.set(CONTENT_TYPES.DOCX, new DOCXParser(parserConfig));
    this.parsers.set('application/msword', new DOCXParser(parserConfig)); // Legacy Word
    this.parsers.set(CONTENT_TYPES.CSV, new CSVParser(parserConfig));
    this.parsers.set(CONTENT_TYPES.PLAIN_TEXT, new TextParser(parserConfig));
    this.parsers.set(CONTENT_TYPES.HTML, new HTMLParser(parserConfig));
    this.parsers.set(CONTENT_TYPES.MARKDOWN, new TextParser(parserConfig));
  }

  /**
   * Build file extension to MIME type mapping
   * @private
   */
  _buildExtensionMap() {
    return {
      [FILE_EXTENSIONS.PDF]: CONTENT_TYPES.PDF,
      [FILE_EXTENSIONS.EPUB]: CONTENT_TYPES.EPUB,
      [FILE_EXTENSIONS.DOCX]: CONTENT_TYPES.DOCX,
      '.doc': 'application/msword',
      [FILE_EXTENSIONS.CSV]: CONTENT_TYPES.CSV,
      [FILE_EXTENSIONS.TXT]: CONTENT_TYPES.PLAIN_TEXT,
      [FILE_EXTENSIONS.MD]: CONTENT_TYPES.MARKDOWN,
      [FILE_EXTENSIONS.HTML]: CONTENT_TYPES.HTML,
      '.htm': CONTENT_TYPES.HTML
    };
  }

  /**
   * Process file buffer with appropriate parser
   * @param {Buffer} buffer - File buffer
   * @param {string} mimeType - File MIME type
   * @param {string} filename - Original filename
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Parsed file result
   */
  async processFile(buffer, mimeType, filename, options = {}) {
    const startTime = Date.now();
    const sessionId = options.sessionId || 'file-processing';

    try {
      // Validate file size
      this._validateFileSize(buffer, filename);

      // Validate file type
      this._validateFileType(mimeType, filename);

      logProcessingStep('file_processing_start', sessionId, {
        filename,
        mimeType,
        fileSize: buffer.length,
        enableMetadata: this.config.enableMetadataExtraction
      });

      // Select appropriate parser
      const parser = await this._selectParser(mimeType, filename);
      
      if (!parser) {
        throw new Error(`No parser available for file type: ${mimeType} (${filename})`);
      }

      this.logger.info('Processing file', {
        filename,
        mimeType,
        fileSize: buffer.length,
        parserType: parser.constructor.name,
        sessionId
      });

      // Parse file with selected parser
      const parseResult = await parser.parse(buffer, filename, options);

      const duration = Date.now() - startTime;

      // Validate parse result
      this._validateParseResult(parseResult, filename);

      // Enhance result with processing metadata
      const enrichedResult = {
        ...parseResult,
        processingMetadata: {
          originalFilename: filename,
          mimeType,
          fileSize: buffer.length,
          processingTime: duration,
          parserUsed: parser.constructor.name,
          sessionId,
          processedAt: new Date().toISOString()
        }
      };

      logProcessingStep('file_processing_complete', sessionId, {
        filename,
        contentLength: parseResult.content?.length || 0,
        duration,
        parserType: parser.constructor.name,
        hasMetadata: !!parseResult.metadata
      });

      logPerformanceMetric('file_processing', duration, 'ms', {
        filename: filename.substring(0, 50),
        mimeType,
        fileSize: buffer.length,
        contentLength: parseResult.content?.length || 0,
        parserType: parser.constructor.name
      });

      this.logger.info('File processing completed successfully', {
        filename,
        duration,
        contentLength: parseResult.content?.length || 0,
        parserType: parser.constructor.name,
        sessionId
      });

      return enrichedResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'file_processing',
        filename,
        mimeType,
        duration,
        sessionId
      });

      throw new Error(`File processing failed for ${filename}: ${error.message}`);
    }
  }

  /**
   * Select appropriate parser for file type
   * @private
   */
  async _selectParser(mimeType, filename) {
    // Try exact MIME type match first
    if (this.parsers.has(mimeType)) {
      return this.parsers.get(mimeType);
    }

    // Fallback to file extension detection
    const extension = this._extractFileExtension(filename);
    const detectedMimeType = this.extensionMap[extension];
    
    if (detectedMimeType && this.parsers.has(detectedMimeType)) {
      this.logger.debug('Using extension-based parser detection', {
        filename,
        originalMimeType: mimeType,
        detectedMimeType,
        extension
      });
      return this.parsers.get(detectedMimeType);
    }

    return null;
  }

  /**
   * Extract file extension from filename
   * @private
   */
  _extractFileExtension(filename) {
    if (!filename || typeof filename !== 'string') {
      return '';
    }
    
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
      return '';
    }
    
    return filename.substring(lastDotIndex).toLowerCase();
  }

  /**
   * Validate file size against limits
   * @private
   */
  _validateFileSize(buffer, filename) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new Error('Invalid file buffer');
    }

    if (buffer.length === 0) {
      throw new Error('File is empty');
    }

    if (buffer.length > this.config.maxFileSize) {
      throw new Error(
        `File size (${Math.round(buffer.length / 1024 / 1024)}MB) exceeds maximum allowed size (${Math.round(this.config.maxFileSize / 1024 / 1024)}MB)`
      );
    }
  }

  /**
   * Validate file type against allowed types
   * @private
   */
  _validateFileType(mimeType, filename) {
    const isAllowedMimeType = this.config.allowedTypes.includes(mimeType);
    
    // Check extension fallback if MIME type is not allowed
    if (!isAllowedMimeType) {
      const extension = this._extractFileExtension(filename);
      const detectedMimeType = this.extensionMap[extension];
      
      if (!detectedMimeType || !this.config.allowedTypes.includes(detectedMimeType)) {
        throw new Error(
          `File type not supported: ${mimeType} (${filename}). Supported types: ${this.config.allowedTypes.join(', ')}`
        );
      }
    }
  }

  /**
   * Validate parse result structure
   * @private
   */
  _validateParseResult(result, filename) {
    if (!result || typeof result !== 'object') {
      throw new Error('Parser returned invalid result');
    }

    if (typeof result.content !== 'string') {
      throw new Error('Parser must return content as string');
    }

    if (!result.type || typeof result.type !== 'string') {
      throw new Error('Parser must specify content type');
    }

    if (result.content.length === 0) {
      this.logger.warn('Parser returned empty content', { filename });
    }
  }

  /**
   * Get supported file types and extensions
   * @returns {Object} Supported types information
   */
  getSupportedTypes() {
    const mimeTypes = Array.from(this.parsers.keys());
    const extensions = Object.keys(this.extensionMap);
    
    return {
      mimeTypes,
      extensions,
      parsers: Array.from(this.parsers.entries()).map(([type, parser]) => ({
        mimeType: type,
        parserClass: parser.constructor.name,
        capabilities: parser.getCapabilities?.() || {}
      }))
    };
  }

  /**
   * Test if file type is supported
   * @param {string} mimeType - MIME type to test
   * @param {string} filename - Optional filename for extension detection
   * @returns {boolean} True if supported
   */
  isSupported(mimeType, filename = '') {
    try {
      this._validateFileType(mimeType, filename);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get parser for specific file type
   * @param {string} mimeType - MIME type
   * @param {string} filename - Optional filename
   * @returns {Object|null} Parser instance or null
   */
  getParser(mimeType, filename = '') {
    try {
      return this._selectParser(mimeType, filename);
    } catch {
      return null;
    }
  }

  /**
   * Get processor statistics
   * @returns {Object} Statistics about the processor
   */
  getStats() {
    const parserStats = {};
    
    for (const [mimeType, parser] of this.parsers.entries()) {
      parserStats[mimeType] = {
        parserClass: parser.constructor.name,
        capabilities: parser.getCapabilities?.() || {},
        stats: parser.getStats?.() || {}
      };
    }

    return {
      supportedTypesCount: this.parsers.size,
      maxFileSize: this.config.maxFileSize,
      allowedTypes: this.config.allowedTypes,
      tempDirectory: this.config.tempDirectory,
      enableMetadataExtraction: this.config.enableMetadataExtraction,
      parsers: parserStats
    };
  }

  /**
   * Update processor configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Reinitialize parsers if relevant config changed
    if (newConfig.tempDirectory || newConfig.enableMetadataExtraction !== undefined) {
      this._initializeParsers();
      this.logger.info('Parsers reinitialized due to configuration change');
    }

    this.logger.info('File processor configuration updated', {
      changedFields: Object.keys(newConfig),
      reinitializedParsers: !!(newConfig.tempDirectory || newConfig.enableMetadataExtraction !== undefined)
    });
  }

  /**
   * Add custom parser for a MIME type
   * @param {string} mimeType - MIME type to handle
   * @param {Object} parser - Parser instance
   */
  addParser(mimeType, parser) {
    if (!parser || typeof parser.parse !== 'function') {
      throw new Error('Parser must have a parse method');
    }

    this.parsers.set(mimeType, parser);
    
    this.logger.info('Custom parser added', {
      mimeType,
      parserClass: parser.constructor.name
    });
  }

  /**
   * Remove parser for a MIME type
   * @param {string} mimeType - MIME type to remove
   */
  removeParser(mimeType) {
    const removed = this.parsers.delete(mimeType);
    
    if (removed) {
      this.logger.info('Parser removed', { mimeType });
    }
    
    return removed;
  }
}

module.exports = FileProcessor;