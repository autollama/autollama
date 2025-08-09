/**
 * URL Fetcher Service
 * Handles fetching and parsing content from URLs with intelligent content detection
 */

const axios = require('axios');
const cheerio = require('cheerio');
const TurndownService = require('turndown');
const { logPerformanceMetric, logError } = require('../../utils/logger');
const { CONTENT_TYPES, ERROR_CODES } = require('../../utils/constants');

class URLFetcher {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 30000,
      maxRedirects: config.maxRedirects || 5,
      maxContentLength: config.maxContentLength || 50 * 1024 * 1024, // 50MB
      userAgent: config.userAgent || 'AutoLlama Content Fetcher/2.1',
      followRedirects: config.followRedirects !== false,
      validateSSL: config.validateSSL !== false,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000,
      enableContentDetection: config.enableContentDetection !== false,
      extractMetadata: config.extractMetadata !== false,
      convertToMarkdown: config.convertToMarkdown !== false
    };

    // Initialize axios instance
    this.httpClient = axios.create({
      timeout: this.config.timeout,
      maxRedirects: this.config.maxRedirects,
      maxContentLength: this.config.maxContentLength,
      headers: {
        'User-Agent': this.config.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      validateStatus: (status) => status < 400, // Accept all status codes < 400
      httpsAgent: this.config.validateSSL ? undefined : new (require('https').Agent)({
        rejectUnauthorized: false
      })
    });

    // Initialize Turndown service for HTML to Markdown conversion
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced'
    });

    this.logger = require('../../utils/logger').createChildLogger({ 
      component: 'url-fetcher' 
    });

    this.logger.info('URL fetcher initialized', {
      timeout: this.config.timeout,
      maxContentLength: this.config.maxContentLength,
      userAgent: this.config.userAgent,
      retries: this.config.retries
    });
  }

  /**
   * Fetch and parse content from URL
   * @param {string} url - URL to fetch
   * @param {Object} options - Fetching options
   * @returns {Promise<Object>} Fetched and parsed content
   */
  async fetchContent(url, options = {}) {
    const startTime = Date.now();
    let attemptCount = 0;
    let lastError = null;

    // Validate URL
    this._validateURL(url);

    try {
      this.logger.info('Starting URL fetch', {
        url: url.substring(0, 100),
        retries: this.config.retries,
        timeout: this.config.timeout
      });

      // Attempt fetch with retries
      while (attemptCount <= this.config.retries) {
        try {
          const result = await this._attemptFetch(url, options, attemptCount);
          
          const duration = Date.now() - startTime;
          
          logPerformanceMetric('url_fetch', duration, 'ms', {
            url: url.substring(0, 50),
            contentLength: result.content?.length || 0,
            contentType: result.type,
            attempts: attemptCount + 1,
            finalUrl: result.metadata?.finalUrl?.substring(0, 50) || url.substring(0, 50)
          });

          this.logger.info('URL fetch completed successfully', {
            url: url.substring(0, 100),
            duration,
            contentLength: result.content?.length || 0,
            contentType: result.type,
            attempts: attemptCount + 1,
            statusCode: result.metadata?.statusCode
          });

          return result;

        } catch (error) {
          lastError = error;
          attemptCount++;

          if (attemptCount <= this.config.retries) {
            const delay = this.config.retryDelay * attemptCount;
            this.logger.warn(`URL fetch attempt ${attemptCount} failed, retrying in ${delay}ms`, {
              url: url.substring(0, 100),
              error: error.message,
              attempt: attemptCount
            });
            
            await this._delay(delay);
          }
        }
      }

      // All attempts failed
      const duration = Date.now() - startTime;
      
      logError(lastError, {
        operation: 'url_fetch',
        url: url.substring(0, 100),
        duration,
        totalAttempts: attemptCount
      });

      throw new Error(`Failed to fetch URL after ${attemptCount} attempts: ${lastError.message}`);

    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error.message.includes('Failed to fetch URL after')) {
        throw error; // Re-throw retry error as-is
      }

      logError(error, {
        operation: 'url_fetch',
        url: url.substring(0, 100),
        duration
      });

      throw new Error(`URL fetch failed for ${url}: ${error.message}`);
    }
  }

  /**
   * Attempt to fetch URL once
   * @private
   */
  async _attemptFetch(url, options, attemptNumber) {
    // Merge options with defaults
    const requestOptions = {
      ...options,
      headers: {
        ...this.httpClient.defaults.headers,
        ...options.headers
      }
    };

    // Make HTTP request
    const response = await this.httpClient.get(url, requestOptions);

    // Detect and validate content type
    const contentType = this._detectContentType(response);
    
    // Extract content based on type
    const content = await this._extractContent(response, contentType, url);

    // Build metadata
    const metadata = this._buildMetadata(response, url, contentType);

    return {
      content,
      type: contentType,
      metadata,
      processingInfo: {
        fetchTime: Date.now(),
        attempts: attemptNumber + 1,
        originalUrl: url,
        finalUrl: response.request.responseURL || url,
        statusCode: response.status,
        contentSize: content.length,
        responseSize: response.data.length
      }
    };
  }

  /**
   * Validate URL format and protocol
   * @private
   */
  _validateURL(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('URL must be a non-empty string');
    }

    try {
      const urlObj = new URL(url);
      
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error(`Unsupported protocol: ${urlObj.protocol}`);
      }

      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
        this.logger.warn('Fetching localhost URL', { url });
      }

    } catch (error) {
      if (error.message.includes('Invalid URL')) {
        throw new Error(`Invalid URL format: ${url}`);
      }
      throw error;
    }
  }

  /**
   * Detect content type from response
   * @private
   */
  _detectContentType(response) {
    const contentType = response.headers['content-type'] || '';
    const url = response.request.responseURL || response.config.url;

    // Check MIME type first
    if (contentType.includes('text/html')) {
      return 'html';
    } else if (contentType.includes('application/pdf')) {
      return 'pdf';
    } else if (contentType.includes('text/plain')) {
      return 'text';
    } else if (contentType.includes('application/json')) {
      return 'json';
    } else if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
      return 'xml';
    }

    // Fallback to URL extension
    const extension = url.split('.').pop().toLowerCase();
    switch (extension) {
      case 'html':
      case 'htm':
        return 'html';
      case 'pdf':
        return 'pdf';
      case 'txt':
        return 'text';
      case 'json':
        return 'json';
      case 'xml':
        return 'xml';
      default:
        // Default to HTML for web content
        return 'html';
    }
  }

  /**
   * Extract content based on content type
   * @private
   */
  async _extractContent(response, contentType, url) {
    const rawContent = response.data;

    switch (contentType) {
      case 'html':
        return this._extractHTMLContent(rawContent, url);
      
      case 'pdf':
        throw new Error('PDF content from URLs should be processed through FileProcessor');
      
      case 'text':
        return this._extractTextContent(rawContent);
      
      case 'json':
        return this._extractJSONContent(rawContent);
      
      case 'xml':
        return this._extractXMLContent(rawContent);
      
      default:
        // Try to extract as HTML first, then fall back to text
        try {
          return this._extractHTMLContent(rawContent, url);
        } catch (error) {
          return this._extractTextContent(rawContent);
        }
    }
  }

  /**
   * Extract content from HTML
   * @private
   */
  _extractHTMLContent(html, url) {
    const $ = cheerio.load(html);
    
    // Remove unwanted elements
    $('script, style, nav, header, footer, aside, .nav, .navigation, .sidebar').remove();
    
    // Try to find main content
    let mainContent = $('main, [role="main"], .main, .content, article, .post, .entry');
    
    if (mainContent.length === 0 || mainContent.text().trim().length < 100) {
      // Fallback to body content
      mainContent = $('body');
    }

    if (this.config.convertToMarkdown) {
      // Convert to markdown
      const html = mainContent.html() || '';
      return this.turndownService.turndown(html);
    } else {
      // Extract plain text
      return mainContent.text()
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  /**
   * Extract content from plain text
   * @private
   */
  _extractTextContent(text) {
    if (typeof text !== 'string') {
      text = String(text);
    }

    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[ ]+/g, ' ')
      .trim();
  }

  /**
   * Extract content from JSON
   * @private
   */
  _extractJSONContent(json) {
    try {
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      
      // Convert JSON to readable text
      return this._jsonToText(parsed);
    } catch (error) {
      // If parsing fails, return as text
      return this._extractTextContent(json);
    }
  }

  /**
   * Convert JSON object to readable text
   * @private
   */
  _jsonToText(obj, depth = 0) {
    const indent = '  '.repeat(depth);
    
    if (Array.isArray(obj)) {
      if (obj.length === 0) return 'Empty array';
      
      return obj.map((item, index) => 
        `${indent}Item ${index + 1}: ${this._jsonToText(item, depth + 1)}`
      ).join('\n');
    }
    
    if (obj && typeof obj === 'object') {
      const entries = Object.entries(obj);
      if (entries.length === 0) return 'Empty object';
      
      return entries.map(([key, value]) => 
        `${indent}${key}: ${this._jsonToText(value, depth + 1)}`
      ).join('\n');
    }
    
    return String(obj);
  }

  /**
   * Extract content from XML
   * @private
   */
  _extractXMLContent(xml) {
    const $ = cheerio.load(xml, { xmlMode: true });
    
    // Extract text content from all elements
    return $.text()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Build metadata object
   * @private
   */
  _buildMetadata(response, originalUrl, contentType) {
    const metadata = {
      originalUrl,
      finalUrl: response.request.responseURL || originalUrl,
      statusCode: response.status,
      statusText: response.statusText,
      contentType: response.headers['content-type'] || 'unknown',
      contentLength: response.headers['content-length'] || null,
      lastModified: response.headers['last-modified'] || null,
      etag: response.headers['etag'] || null,
      server: response.headers['server'] || null,
      detectedType: contentType
    };

    // Extract HTML-specific metadata if applicable
    if (contentType === 'html' && this.config.extractMetadata) {
      try {
        const $ = cheerio.load(response.data);
        
        metadata.htmlMetadata = {
          title: $('title').text().trim() || null,
          description: $('meta[name="description"]').attr('content') || 
                      $('meta[property="og:description"]').attr('content') || null,
          keywords: $('meta[name="keywords"]').attr('content') || null,
          author: $('meta[name="author"]').attr('content') || null,
          language: $('html').attr('lang') || 
                   $('meta[http-equiv="content-language"]').attr('content') || null,
          canonical: $('link[rel="canonical"]').attr('href') || null,
          robots: $('meta[name="robots"]').attr('content') || null
        };

        // Remove null values
        Object.keys(metadata.htmlMetadata).forEach(key => {
          if (metadata.htmlMetadata[key] === null) {
            delete metadata.htmlMetadata[key];
          }
        });

        if (Object.keys(metadata.htmlMetadata).length === 0) {
          delete metadata.htmlMetadata;
        }
      } catch (error) {
        // Ignore metadata extraction errors
        this.logger.debug('Failed to extract HTML metadata', {
          url: originalUrl,
          error: error.message
        });
      }
    }

    // Add redirect information if applicable
    if (metadata.finalUrl !== originalUrl) {
      metadata.redirected = true;
      metadata.redirectCount = response.request._redirectCount || 0;
    }

    // Clean up null values
    Object.keys(metadata).forEach(key => {
      if (metadata[key] === null || metadata[key] === undefined) {
        delete metadata[key];
      }
    });

    return metadata;
  }

  /**
   * Test if URL is accessible
   * @param {string} url - URL to test
   * @returns {Promise<Object>} Test result
   */
  async testURL(url) {
    try {
      this._validateURL(url);
      
      const startTime = Date.now();
      const response = await this.httpClient.head(url, { timeout: 10000 });
      const duration = Date.now() - startTime;

      return {
        accessible: true,
        statusCode: response.status,
        contentType: response.headers['content-type'],
        contentLength: response.headers['content-length'],
        lastModified: response.headers['last-modified'],
        responseTime: duration,
        finalUrl: response.request.responseURL || url
      };

    } catch (error) {
      return {
        accessible: false,
        error: error.message,
        statusCode: error.response?.status || null
      };
    }
  }

  /**
   * Get fetcher capabilities
   * @returns {Object} Fetcher capabilities and features
   */
  getCapabilities() {
    return {
      protocols: ['http', 'https'],
      contentTypes: ['html', 'text', 'json', 'xml'],
      features: {
        redirectHandling: this.config.followRedirects,
        retryLogic: this.config.retries > 0,
        contentTypeDetection: this.config.enableContentDetection,
        metadataExtraction: this.config.extractMetadata,
        markdownConversion: this.config.convertToMarkdown,
        htmlCleaning: true,
        customHeaders: true,
        timeoutHandling: true
      },
      limitations: {
        maxContentLength: `${Math.round(this.config.maxContentLength / 1024 / 1024)}MB`,
        timeout: `${this.config.timeout}ms`,
        maxRedirects: this.config.maxRedirects,
        javascriptExecution: 'Not supported',
        authenticationRequired: 'Basic support only'
      },
      performance: {
        typicalSpeed: 'Network dependent',
        memoryUsage: 'Low to Moderate'
      }
    };
  }

  /**
   * Get fetcher statistics
   * @returns {Object} Usage statistics
   */
  getStats() {
    return {
      fetcherType: 'HTTP/HTTPS',
      library: 'axios + cheerio',
      config: {
        timeout: this.config.timeout,
        maxRedirects: this.config.maxRedirects,
        maxContentLength: this.config.maxContentLength,
        retries: this.config.retries,
        followRedirects: this.config.followRedirects,
        validateSSL: this.config.validateSSL
      },
      capabilities: this.getCapabilities()
    };
  }

  /**
   * Update fetcher configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };

    // Update axios client if relevant config changed
    if (newConfig.timeout || newConfig.maxRedirects || newConfig.maxContentLength || 
        newConfig.userAgent || newConfig.validateSSL) {
      
      this.httpClient = axios.create({
        timeout: this.config.timeout,
        maxRedirects: this.config.maxRedirects,
        maxContentLength: this.config.maxContentLength,
        headers: {
          'User-Agent': this.config.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        validateStatus: (status) => status < 400,
        httpsAgent: this.config.validateSSL ? undefined : new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });
    }

    this.logger.info('URL fetcher configuration updated', {
      changedFields: Object.keys(newConfig),
      rebuiltClient: !!(newConfig.timeout || newConfig.maxRedirects || 
                       newConfig.maxContentLength || newConfig.userAgent || 
                       newConfig.validateSSL)
    });
  }

  /**
   * Simple delay utility
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = URLFetcher;