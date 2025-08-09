/**
 * HTML Parser
 * Handles HTML file parsing using cheerio for DOM manipulation and text extraction
 */

const cheerio = require('cheerio');
const { logPerformanceMetric, logError } = require('../../../utils/logger');

class HTMLParser {
  constructor(config = {}) {
    this.config = {
      enableMetadataExtraction: config.enableMetadataExtraction !== false,
      preserveStructure: config.preserveStructure !== false,
      includeLinks: config.includeLinks || false,
      includeImages: config.includeImages || false,
      removeScripts: config.removeScripts !== false,
      removeStyles: config.removeStyles !== false,
      removeComments: config.removeComments !== false,
      extractTables: config.extractTables !== false,
      customSelectors: config.customSelectors || null, // Custom elements to remove/extract
      baseUrl: config.baseUrl || null // For resolving relative URLs
    };

    this.logger = require('../../../utils/logger').createChildLogger({ 
      component: 'html-parser' 
    });

    // Define elements to remove by default
    this.elementsToRemove = [
      'script',
      'style',
      'noscript',
      'iframe',
      'object',
      'embed',
      'applet'
    ];

    if (this.config.removeComments) {
      this.elementsToRemove.push('comment');
    }

    // Navigation and UI elements that usually don't contain content
    this.navigationSelectors = [
      'nav',
      '.navigation',
      '.nav',
      '.menu',
      '.sidebar',
      '.header',
      '.footer',
      '.breadcrumb',
      '.pagination',
      '#header',
      '#footer',
      '#sidebar',
      '#navigation'
    ];
  }

  /**
   * Parse HTML buffer and extract text content
   * @param {Buffer} buffer - HTML file buffer
   * @param {string} filename - Original filename
   * @param {Object} options - Parsing options
   * @returns {Promise<Object>} Parsed content and metadata
   */
  async parse(buffer, filename, options = {}) {
    const startTime = Date.now();

    try {
      this.logger.debug('Starting HTML parsing', {
        filename,
        bufferSize: buffer.length,
        preserveStructure: this.config.preserveStructure,
        includeLinks: this.config.includeLinks
      });

      // Convert buffer to string
      const htmlContent = buffer.toString('utf8');

      // Load HTML into cheerio
      const $ = cheerio.load(htmlContent, {
        decodeEntities: true,
        normalizeWhitespace: true
      });

      // Extract metadata first (before modifying DOM)
      const metadata = this.config.enableMetadataExtraction 
        ? this._extractMetadata($, filename, buffer)
        : this._buildBasicMetadata(filename, buffer);

      // Clean up the DOM
      this._cleanupDOM($);

      // Extract content based on configuration
      const content = this.config.preserveStructure
        ? this._extractStructuredContent($)
        : this._extractPlainTextContent($);

      // Post-process content
      const processedContent = this._processContent(content);

      const duration = Date.now() - startTime;

      logPerformanceMetric('html_parsing', duration, 'ms', {
        filename: filename.substring(0, 50),
        contentLength: processedContent.length,
        bufferSize: buffer.length,
        hasMetadata: !!metadata.title
      });

      this.logger.info('HTML parsing completed successfully', {
        filename,
        duration,
        contentLength: processedContent.length,
        originalSize: buffer.length,
        title: metadata.title || 'No title'
      });

      return {
        content: processedContent,
        type: 'html',
        metadata,
        processingInfo: {
          parsingTime: duration,
          originalSize: buffer.length,
          contentSize: processedContent.length,
          compressionRatio: processedContent.length / buffer.length,
          elementsRemoved: this.elementsToRemove.length,
          preservedStructure: this.config.preserveStructure
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'html_parsing',
        filename,
        duration,
        bufferSize: buffer.length
      });

      // Provide more specific error messages
      if (error.message.includes('Parse5')) {
        throw new Error(`Invalid HTML structure in ${filename}: ${error.message}`);
      }

      throw new Error(`HTML parsing failed for ${filename}: ${error.message}`);
    }
  }

  /**
   * Extract metadata from HTML document
   * @private
   */
  _extractMetadata($, filename, buffer) {
    const metadata = {
      format: 'HTML',
      filename: filename,
      originalSize: buffer.length
    };

    // Basic document metadata
    metadata.title = $('title').text().trim() || 
                   $('h1').first().text().trim() || 
                   'No title';

    metadata.description = $('meta[name="description"]').attr('content') ||
                          $('meta[property="og:description"]').attr('content') ||
                          null;

    metadata.keywords = $('meta[name="keywords"]').attr('content') || null;
    metadata.author = $('meta[name="author"]').attr('content') || null;
    metadata.language = $('html').attr('lang') || 
                       $('meta[http-equiv="content-language"]').attr('content') || 
                       'en';

    // Open Graph metadata
    metadata.openGraph = {
      title: $('meta[property="og:title"]').attr('content'),
      description: $('meta[property="og:description"]').attr('content'),
      type: $('meta[property="og:type"]').attr('content'),
      url: $('meta[property="og:url"]').attr('content'),
      image: $('meta[property="og:image"]').attr('content')
    };

    // Remove null values
    Object.keys(metadata.openGraph).forEach(key => {
      if (!metadata.openGraph[key]) {
        delete metadata.openGraph[key];
      }
    });

    if (Object.keys(metadata.openGraph).length === 0) {
      delete metadata.openGraph;
    }

    // Document structure analysis
    metadata.structure = this._analyzeStructure($);

    // Content analysis
    metadata.contentAnalysis = {
      hasImages: $('img').length > 0,
      hasLinks: $('a').length > 0,
      hasTables: $('table').length > 0,
      hasForms: $('form').length > 0,
      hasLists: $('ul, ol').length > 0,
      headingLevels: this._analyzeHeadings($)
    };

    // Link and image information
    if (this.config.includeLinks) {
      metadata.links = this._extractLinks($);
    }

    if (this.config.includeImages) {
      metadata.images = this._extractImages($);
    }

    // Clean up null/undefined values
    Object.keys(metadata).forEach(key => {
      if (metadata[key] === null || metadata[key] === undefined || metadata[key] === '') {
        delete metadata[key];
      }
    });

    return metadata;
  }

  /**
   * Build basic metadata when full extraction is disabled
   * @private
   */
  _buildBasicMetadata(filename, buffer) {
    return {
      format: 'HTML',
      filename: filename,
      originalSize: buffer.length,
      statistics: {
        totalCharacters: 0, // Will be filled after content extraction
        estimatedWords: 0,
        hasContent: false
      }
    };
  }

  /**
   * Analyze document structure
   * @private
   */
  _analyzeStructure($) {
    return {
      headings: {
        h1: $('h1').length,
        h2: $('h2').length,
        h3: $('h3').length,
        h4: $('h4').length,
        h5: $('h5').length,
        h6: $('h6').length
      },
      paragraphs: $('p').length,
      lists: $('ul, ol').length,
      tables: $('table').length,
      images: $('img').length,
      links: $('a').length,
      forms: $('form').length,
      totalElements: $('*').length
    };
  }

  /**
   * Analyze heading structure
   * @private
   */
  _analyzeHeadings($) {
    const headings = [];
    
    $('h1, h2, h3, h4, h5, h6').each((i, element) => {
      const $el = $(element);
      headings.push({
        level: parseInt(element.tagName.substring(1)),
        text: $el.text().trim(),
        id: $el.attr('id') || null
      });
    });

    return headings;
  }

  /**
   * Extract links information
   * @private
   */
  _extractLinks($) {
    const links = [];
    
    $('a[href]').each((i, element) => {
      const $el = $(element);
      const href = $el.attr('href');
      const text = $el.text().trim();
      
      if (href && text) {
        links.push({
          url: this._resolveUrl(href),
          text: text,
          title: $el.attr('title') || null
        });
      }
    });

    return links.slice(0, 50); // Limit to 50 links
  }

  /**
   * Extract images information
   * @private
   */
  _extractImages($) {
    const images = [];
    
    $('img[src]').each((i, element) => {
      const $el = $(element);
      const src = $el.attr('src');
      const alt = $el.attr('alt');
      
      if (src) {
        images.push({
          url: this._resolveUrl(src),
          alt: alt || null,
          title: $el.attr('title') || null,
          width: $el.attr('width') || null,
          height: $el.attr('height') || null
        });
      }
    });

    return images.slice(0, 20); // Limit to 20 images
  }

  /**
   * Resolve relative URLs
   * @private
   */
  _resolveUrl(url) {
    if (!url || url.startsWith('http') || url.startsWith('//')) {
      return url;
    }

    if (this.config.baseUrl) {
      try {
        return new URL(url, this.config.baseUrl).href;
      } catch (error) {
        return url;
      }
    }

    return url;
  }

  /**
   * Clean up DOM by removing unwanted elements
   * @private
   */
  _cleanupDOM($) {
    // Remove script and style elements
    if (this.config.removeScripts) {
      $('script').remove();
    }
    
    if (this.config.removeStyles) {
      $('style').remove();
    }

    // Remove other unwanted elements
    this.elementsToRemove.forEach(selector => {
      $(selector).remove();
    });

    // Remove navigation elements (they rarely contain useful content)
    this.navigationSelectors.forEach(selector => {
      $(selector).remove();
    });

    // Remove custom selectors if configured
    if (this.config.customSelectors && Array.isArray(this.config.customSelectors)) {
      this.config.customSelectors.forEach(selector => {
        $(selector).remove();
      });
    }

    // Remove comments
    if (this.config.removeComments) {
      $('*').contents().filter((i, el) => el.nodeType === 8).remove();
    }

    // Remove empty elements that don't contribute to content
    $('div, span, p').each((i, element) => {
      const $el = $(element);
      if ($el.text().trim() === '' && $el.children().length === 0) {
        $el.remove();
      }
    });
  }

  /**
   * Extract structured content preserving HTML structure
   * @private
   */
  _extractStructuredContent($) {
    let content = '';

    // Try to find main content area first
    const mainContent = this._findMainContent($);
    const $root = mainContent.length > 0 ? mainContent : $('body').length > 0 ? $('body') : $.root();

    // Extract content with structure preservation
    $root.children().each((i, element) => {
      const $el = $(element);
      const tagName = element.tagName ? element.tagName.toLowerCase() : '';

      switch (tagName) {
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          content += '\n' + '#'.repeat(parseInt(tagName.charAt(1))) + ' ' + $el.text().trim() + '\n\n';
          break;
          
        case 'p':
          const text = $el.text().trim();
          if (text) {
            content += text + '\n\n';
          }
          break;
          
        case 'ul':
        case 'ol':
          content += this._extractList($el, tagName === 'ol') + '\n\n';
          break;
          
        case 'blockquote':
          const quoteText = $el.text().trim();
          if (quoteText) {
            content += '> ' + quoteText.replace(/\n/g, '\n> ') + '\n\n';
          }
          break;
          
        case 'table':
          if (this.config.extractTables) {
            content += this._extractTable($el) + '\n\n';
          }
          break;
          
        case 'div':
        case 'section':
        case 'article':
        case 'main':
          // Recursively process container elements
          const containerText = this._extractFromContainer($el);
          if (containerText.trim()) {
            content += containerText + '\n\n';
          }
          break;
          
        default:
          // For other elements, just extract text
          const defaultText = $el.text().trim();
          if (defaultText) {
            content += defaultText + '\n\n';
          }
      }
    });

    return content;
  }

  /**
   * Find main content area
   * @private
   */
  _findMainContent($) {
    // Try common main content selectors
    const mainSelectors = [
      'main',
      '[role="main"]',
      '.main',
      '.content',
      '.post-content',
      '.article-content',
      '.entry-content',
      '#main',
      '#content',
      'article'
    ];

    for (const selector of mainSelectors) {
      const $main = $(selector);
      if ($main.length > 0 && $main.text().trim().length > 100) {
        return $main.first();
      }
    }

    return $();
  }

  /**
   * Extract content from container elements
   * @private
   */
  _extractFromContainer($container) {
    let content = '';
    
    $container.children().each((i, element) => {
      const $el = $(element);
      const tagName = element.tagName ? element.tagName.toLowerCase() : '';
      
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        content += $el.text().trim() + '\n';
      } else if (tagName === 'p') {
        content += $el.text().trim() + '\n';
      } else if (['div', 'section'].includes(tagName)) {
        content += this._extractFromContainer($el);
      } else {
        const text = $el.text().trim();
        if (text) {
          content += text + '\n';
        }
      }
    });

    return content;
  }

  /**
   * Extract list content
   * @private
   */
  _extractList($list, isOrdered = false) {
    let content = '';
    let counter = 1;
    
    $list.children('li').each((i, element) => {
      const $li = $(element);
      const text = $li.text().trim();
      
      if (text) {
        const prefix = isOrdered ? `${counter}. ` : '- ';
        content += prefix + text + '\n';
        counter++;
      }
    });

    return content;
  }

  /**
   * Extract table content
   * @private
   */
  _extractTable($table) {
    let content = '';
    
    // Extract headers
    const $headers = $table.find('thead th, tr:first-child th, tr:first-child td');
    if ($headers.length > 0) {
      const headers = [];
      $headers.each((i, element) => {
        headers.push($(element).text().trim());
      });
      content += '| ' + headers.join(' | ') + ' |\n';
      content += '|' + headers.map(() => '---').join('|') + '|\n';
    }

    // Extract rows
    $table.find('tbody tr, tr').each((i, element) => {
      const $row = $(element);
      if ($row.find('th').length === 0) { // Skip header rows
        const cells = [];
        $row.find('td').each((j, cell) => {
          cells.push($(cell).text().trim());
        });
        if (cells.length > 0) {
          content += '| ' + cells.join(' | ') + ' |\n';
        }
      }
    });

    return content;
  }

  /**
   * Extract plain text content without structure
   * @private
   */
  _extractPlainTextContent($) {
    // Try to find main content first
    const mainContent = this._findMainContent($);
    const $root = mainContent.length > 0 ? mainContent : $('body').length > 0 ? $('body') : $.root();

    return $root.text()
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .trim();
  }

  /**
   * Post-process extracted content
   * @private
   */
  _processContent(content) {
    return content
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      
      // Clean up excessive whitespace
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      
      // Remove common HTML artifacts
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      
      .trim();
  }

  /**
   * Get parser capabilities
   * @returns {Object} Parser capabilities and features
   */
  getCapabilities() {
    return {
      formats: ['html', 'htm'],
      features: {
        textExtraction: true,
        metadataExtraction: this.config.enableMetadataExtraction,
        structurePreservation: this.config.preserveStructure,
        linkExtraction: this.config.includeLinks,
        imageExtraction: this.config.includeImages,
        tableExtraction: this.config.extractTables,
        domCleaning: true,
        mainContentDetection: true,
        markdownConversion: this.config.preserveStructure
      },
      limitations: {
        maxFileSize: '100MB',
        javascriptContent: 'Not executed',
        dynamicContent: 'Static content only',
        cssRendering: 'Not applied'
      },
      performance: {
        typicalSpeed: 'Fast',
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
      parserType: 'HTML',
      library: 'cheerio',
      config: {
        enableMetadataExtraction: this.config.enableMetadataExtraction,
        preserveStructure: this.config.preserveStructure,
        includeLinks: this.config.includeLinks,
        includeImages: this.config.includeImages,
        extractTables: this.config.extractTables
      },
      capabilities: this.getCapabilities()
    };
  }

  /**
   * Test if parser can handle the given buffer
   * @param {Buffer} buffer - File buffer to test
   * @returns {boolean} True if likely an HTML file
   */
  canParse(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return false;
    }

    try {
      const sample = buffer.toString('utf8', 0, Math.min(1000, buffer.length)).toLowerCase();
      
      // Look for HTML indicators
      const htmlIndicators = [
        '<!doctype html',
        '<html',
        '<head>',
        '<body>',
        '<title>',
        '<meta',
        '<div',
        '<p>',
        '<span>'
      ];

      return htmlIndicators.some(indicator => sample.includes(indicator));
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Update parser configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('HTML parser configuration updated', {
      changedFields: Object.keys(newConfig)
    });
  }
}

module.exports = HTMLParser;