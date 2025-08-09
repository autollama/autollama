/**
 * PDF Parser
 * Handles PDF file parsing using pdf-parse library
 */

const pdfParse = require('pdf-parse');
const { logPerformanceMetric, logError } = require('../../../utils/logger');

class PDFParser {
  constructor(config = {}) {
    this.config = {
      enableMetadataExtraction: config.enableMetadataExtraction !== false,
      maxPages: config.maxPages || null, // No limit by default
      version: config.version || 'latest'
    };

    this.logger = require('../../../utils/logger').createChildLogger({ 
      component: 'pdf-parser' 
    });
  }

  /**
   * Parse PDF buffer and extract text content
   * @param {Buffer} buffer - PDF file buffer
   * @param {string} filename - Original filename
   * @param {Object} options - Parsing options
   * @returns {Promise<Object>} Parsed content and metadata
   */
  async parse(buffer, filename, options = {}) {
    const startTime = Date.now();

    try {
      this.logger.debug('Starting PDF parsing', {
        filename,
        bufferSize: buffer.length,
        enableMetadata: this.config.enableMetadataExtraction
      });

      // Configure pdf-parse options
      const parseOptions = {
        // Basic options
        max: this.config.maxPages || 0, // 0 = no limit
        version: this.config.version,
        
        // Performance options
        normalizeWhitespace: true,
        disableCombineTextItems: false
      };

      // Parse PDF
      const pdfData = await pdfParse(buffer, parseOptions);

      const duration = Date.now() - startTime;

      // Extract and clean text content
      const content = this._cleanTextContent(pdfData.text);

      // Build metadata object
      const metadata = this._buildMetadata(pdfData, filename);

      // Validate extraction
      this._validateExtraction(content, pdfData, filename);

      logPerformanceMetric('pdf_parsing', duration, 'ms', {
        filename: filename.substring(0, 50),
        pages: pdfData.numpages,
        contentLength: content.length,
        bufferSize: buffer.length
      });

      this.logger.info('PDF parsing completed successfully', {
        filename,
        duration,
        pages: pdfData.numpages,
        contentLength: content.length,
        hasMetadata: !!metadata.info
      });

      return {
        content,
        type: 'pdf',
        metadata,
        processingInfo: {
          parsingTime: duration,
          pagesProcessed: pdfData.numpages,
          originalSize: buffer.length,
          contentSize: content.length,
          compressionRatio: content.length / buffer.length
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'pdf_parsing',
        filename,
        duration,
        bufferSize: buffer.length
      });

      // Provide more specific error messages
      if (error.message.includes('Invalid PDF')) {
        throw new Error(`Invalid or corrupted PDF file: ${filename}`);
      } else if (error.message.includes('Encrypted')) {
        throw new Error(`PDF file is encrypted and cannot be processed: ${filename}`);
      } else if (error.message.includes('password')) {
        throw new Error(`PDF file is password protected: ${filename}`);
      }

      throw new Error(`PDF parsing failed for ${filename}: ${error.message}`);
    }
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
      
      // Remove excessive whitespace but preserve paragraph structure
      .replace(/[ \t]+/g, ' ')           // Multiple spaces/tabs to single space
      .replace(/\n[ \t]+/g, '\n')        // Remove leading whitespace on lines
      .replace(/[ \t]+\n/g, '\n')        // Remove trailing whitespace on lines
      .replace(/\n{3,}/g, '\n\n')        // Multiple newlines to double newline
      
      // Remove common PDF artifacts
      .replace(/\f/g, '\n')              // Form feed to newline
      .replace(/\u00A0/g, ' ')           // Non-breaking space to regular space
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width characters
      
      // Clean up common PDF extraction issues
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between lowercase and uppercase
      .replace(/(\w)(\d)/g, '$1 $2')     // Add space between word and number
      .replace(/(\d)(\w)/g, '$1 $2')     // Add space between number and word
      
      .trim();
  }

  /**
   * Build metadata object from PDF data
   * @private
   */
  _buildMetadata(pdfData, filename) {
    const metadata = {
      pages: pdfData.numpages || 0,
      version: pdfData.version || null,
      filename: filename
    };

    // Add PDF info if metadata extraction is enabled
    if (this.config.enableMetadataExtraction && pdfData.info) {
      const info = pdfData.info;
      
      metadata.info = {
        title: this._cleanMetadataString(info.Title),
        author: this._cleanMetadataString(info.Author),
        subject: this._cleanMetadataString(info.Subject),
        keywords: this._cleanMetadataString(info.Keywords),
        creator: this._cleanMetadataString(info.Creator),
        producer: this._cleanMetadataString(info.Producer),
        creationDate: this._parseDate(info.CreationDate),
        modificationDate: this._parseDate(info.ModDate || info.ModificationDate),
        trapped: info.Trapped,
        encrypted: info.IsEncrypted || false,
        linearized: info.IsLinearized || false,
        acroform: info.IsAcroFormPresent || false,
        xfa: info.IsXFAPresent || false
      };

      // Remove null/undefined values
      Object.keys(metadata.info).forEach(key => {
        if (metadata.info[key] === null || metadata.info[key] === undefined || metadata.info[key] === '') {
          delete metadata.info[key];
        }
      });
    }

    // Add content statistics
    const textLength = pdfData.text?.length || 0;
    metadata.statistics = {
      totalCharacters: textLength,
      estimatedWords: textLength > 0 ? Math.round(textLength / 5) : 0,
      averageCharactersPerPage: metadata.pages > 0 ? Math.round(textLength / metadata.pages) : 0,
      hasText: textLength > 0
    };

    return metadata;
  }

  /**
   * Clean metadata strings
   * @private
   */
  _cleanMetadataString(value) {
    if (!value || typeof value !== 'string') {
      return null;
    }

    return value
      .replace(/^\(|\)$/g, '') // Remove surrounding parentheses
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim() || null;
  }

  /**
   * Parse PDF date strings
   * @private
   */
  _parseDate(dateString) {
    if (!dateString || typeof dateString !== 'string') {
      return null;
    }

    try {
      // PDF date format: D:YYYYMMDDHHmmSSOHH'mm'
      // Remove D: prefix if present
      const cleanDate = dateString.replace(/^D:/, '');
      
      // Extract date components
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      const hour = cleanDate.substring(8, 10) || '00';
      const minute = cleanDate.substring(10, 12) || '00';
      const second = cleanDate.substring(12, 14) || '00';

      // Create ISO date string
      const isoDate = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
      const parsed = new Date(isoDate);
      
      return isNaN(parsed.getTime()) ? null : parsed.toISOString();
    } catch (error) {
      this.logger.debug('Failed to parse PDF date', {
        dateString,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Validate extraction results
   * @private
   */
  _validateExtraction(content, pdfData, filename) {
    // Check if extraction was successful
    if (!content || content.length === 0) {
      this.logger.warn('PDF extraction resulted in empty content', {
        filename,
        pages: pdfData.numpages,
        hasInfo: !!pdfData.info
      });
    }

    // Check for very short content relative to pages
    if (pdfData.numpages > 1 && content.length < 100) {
      this.logger.warn('PDF extraction resulted in very little content for page count', {
        filename,
        pages: pdfData.numpages,
        contentLength: content.length
      });
    }

    // Check for potential OCR needs (images-only PDF)
    const wordsPerPage = content.length > 0 ? (content.split(/\s+/).length / pdfData.numpages) : 0;
    if (wordsPerPage < 10 && pdfData.numpages > 1) {
      this.logger.warn('PDF may contain mostly images and require OCR', {
        filename,
        pages: pdfData.numpages,
        wordsPerPage: Math.round(wordsPerPage)
      });
    }
  }

  /**
   * Get parser capabilities
   * @returns {Object} Parser capabilities and features
   */
  getCapabilities() {
    return {
      formats: ['pdf'],
      features: {
        textExtraction: true,
        metadataExtraction: this.config.enableMetadataExtraction,
        structurePreservation: false,
        imageExtraction: false,
        ocrSupport: false,
        encryptedFiles: false,
        passwordProtected: false,
        formFields: false
      },
      limitations: {
        maxFileSize: '100MB',
        imagesOnlyPDFs: 'Limited text extraction',
        handwriting: 'Not supported',
        complexLayouts: 'May lose formatting'
      },
      performance: {
        typicalSpeed: '1-5 pages/second',
        memoryUsage: 'Moderate'
      }
    };
  }

  /**
   * Get parser statistics
   * @returns {Object} Usage statistics
   */
  getStats() {
    return {
      parserType: 'PDF',
      library: 'pdf-parse',
      config: {
        enableMetadataExtraction: this.config.enableMetadataExtraction,
        maxPages: this.config.maxPages,
        version: this.config.version
      },
      capabilities: this.getCapabilities()
    };
  }

  /**
   * Test if parser can handle the given buffer
   * @param {Buffer} buffer - File buffer to test
   * @returns {boolean} True if likely a PDF file
   */
  canParse(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
      return false;
    }

    // Check for PDF magic bytes
    const header = buffer.toString('ascii', 0, 4);
    return header === '%PDF';
  }

  /**
   * Update parser configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('PDF parser configuration updated', {
      changedFields: Object.keys(newConfig)
    });
  }
}

module.exports = PDFParser;