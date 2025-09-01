/**
 * Enhanced Chunking Service v2.2
 * Implements intelligent document segmentation with semantic boundary detection
 * Features: structure-aware chunking, adaptive sizing, semantic preservation
 */

const { v4: uuidv4 } = require('uuid');
const { logProcessingStep } = require('../../utils/logger');
const { PROCESSING_LIMITS, DEFAULTS } = require('../../utils/constants');

class ChunkingService {
  constructor(config = {}) {
    this.defaultChunkSize = config.chunkSize || DEFAULTS.CHUNK_SIZE;
    this.defaultOverlap = config.chunkOverlap || DEFAULTS.CHUNK_OVERLAP;
    this.logger = require('../../utils/logger').createChildLogger({ component: 'chunking-v2.2' });
    
    // Enhanced configuration for intelligent segmentation
    this.intelligentConfig = {
      enableSemanticChunking: config.enableSemanticChunking !== false,
      enableStructureAware: config.enableStructureAware !== false,
      respectSentenceBoundaries: config.respectSentenceBoundaries !== false,
      preserveListStructure: config.preserveListStructure !== false,
      headerAwareSplitting: config.headerAwareSplitting !== false,
      minSemanticChunkSize: config.minSemanticChunkSize || 200,
      maxSemanticChunkSize: config.maxSemanticChunkSize || 3000,
      semanticBoundaryBonus: config.semanticBoundaryBonus || 100 // Bonus chars for semantic boundaries
    };
    
    // Performance metrics
    this.metrics = {
      totalChunksCreated: 0,
      semanticBoundariesFound: 0,
      structurePreserved: 0,
      avgChunkSize: 0,
      avgSemanticScore: 0
    };
  }

  /**
   * Enhanced chunking function with intelligent document segmentation
   * @param {string} content - Text content to chunk
   * @param {string} url - Source URL for reference
   * @param {Object} options - Chunking options
   * @returns {Array} Array of chunk objects
   */
  chunkText(content, url, options = {}) {
    // Validate inputs
    if (!content || content.length === 0) {
      throw new Error('No content to chunk');
    }

    if (typeof content !== 'string') {
      throw new Error('Content must be a string');
    }

    const startTime = Date.now();

    // Extract options with enhanced defaults
    const {
      chunkSize = this.defaultChunkSize,
      overlap = this.defaultOverlap,
      enableAdaptive = true,
      preserveStructure = true,
      enableIntelligentSegmentation = this.intelligentConfig.enableSemanticChunking,
      documentType = null // Auto-detect if not provided
    } = options;

    // Validate chunk parameters
    this._validateChunkParameters(chunkSize, overlap);

    // Clean and prepare content
    const cleanContent = this._cleanContent(content, preserveStructure);
    
    // Analyze document structure for intelligent segmentation
    const documentAnalysis = this._analyzeDocumentStructure(cleanContent, documentType);
    
    // Determine optimal chunking strategy
    const chunkingStrategy = this._determineChunkingStrategy(
      cleanContent, 
      documentAnalysis, 
      { chunkSize, overlap, enableAdaptive, enableIntelligentSegmentation }
    );

    // Generate chunks using appropriate strategy
    const chunks = enableIntelligentSegmentation
      ? this._generateIntelligentChunks(cleanContent, url, chunkingStrategy, documentAnalysis)
      : this._generateChunks(cleanContent, url, chunkingStrategy);

    // Update metrics
    this._updateMetrics(chunks, documentAnalysis);

    const processingTime = Date.now() - startTime;

    logProcessingStep('intelligent_chunking_completed', null, {
      contentLength: content.length,
      chunksCreated: chunks.length,
      avgChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.chunk_text.length, 0) / chunks.length),
      chunkSize: chunkingStrategy.chunkSize,
      overlap: chunkingStrategy.overlap,
      documentType: documentAnalysis.type,
      intelligentSegmentation: enableIntelligentSegmentation,
      processingTime
    });

    this.logger.info(`Created ${chunks.length} intelligent chunks from ${Math.round(cleanContent.length/1000)}K characters`, {
      url,
      totalChunks: chunks.length,
      contentSize: cleanContent.length,
      avgChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.chunk_text.length, 0) / chunks.length),
      documentType: documentAnalysis.type,
      structurePreserved: documentAnalysis.hasStructure,
      semanticBoundaries: this.metrics.semanticBoundariesFound,
      processingTime
    });

    return chunks;
  }

  /**
   * Validate chunk parameters
   * @private
   */
  _validateChunkParameters(chunkSize, overlap) {
    if (chunkSize < PROCESSING_LIMITS.MIN_CHUNK_SIZE || chunkSize > PROCESSING_LIMITS.MAX_CHUNK_SIZE) {
      throw new Error(`Chunk size must be between ${PROCESSING_LIMITS.MIN_CHUNK_SIZE} and ${PROCESSING_LIMITS.MAX_CHUNK_SIZE}`);
    }

    if (overlap < PROCESSING_LIMITS.MIN_CHUNK_OVERLAP || overlap > PROCESSING_LIMITS.MAX_CHUNK_OVERLAP) {
      throw new Error(`Chunk overlap must be between ${PROCESSING_LIMITS.MIN_CHUNK_OVERLAP} and ${PROCESSING_LIMITS.MAX_CHUNK_OVERLAP}`);
    }

    if (overlap >= chunkSize) {
      throw new Error('Chunk overlap must be less than chunk size');
    }
  }

  /**
   * Clean and normalize content
   * @private
   */
  _cleanContent(content, preserveStructure = true) {
    let cleaned = content;

    if (preserveStructure) {
      // Preserve paragraph breaks and structure
      cleaned = content
        .replace(/\r\n/g, '\n')  // Normalize line endings
        .replace(/\r/g, '\n')    // Normalize line endings
        .replace(/\n{3,}/g, '\n\n')  // Limit consecutive newlines
        .replace(/[ \t]+/g, ' ')     // Normalize spaces and tabs
        .trim();
    } else {
      // Aggressive cleaning - flatten to single spaces
      cleaned = content.replace(/\s+/g, ' ').trim();
    }

    return cleaned;
  }

  /**
   * Determine adaptive chunk parameters based on content characteristics
   * @private
   */
  _getAdaptiveParameters(content, baseChunkSize, baseOverlap) {
    let adaptiveChunkSize = baseChunkSize;
    let adaptiveOverlap = baseOverlap;

    const contentLength = content.length;

    // Adaptive sizing for large files to reduce processing load
    if (contentLength > 1000000) { // > 1MB text
      adaptiveChunkSize = Math.min(2400, baseChunkSize * 2); // Max 2400 chars
      adaptiveOverlap = Math.min(400, baseOverlap * 2);      // Max 400 chars overlap
      
      this.logger.info('Applied large file adaptive chunking', {
        originalChunkSize: baseChunkSize,
        adaptiveChunkSize,
        originalOverlap: baseOverlap,
        adaptiveOverlap,
        contentLength
      });
    } else if (contentLength > 500000) { // > 500KB text
      adaptiveChunkSize = Math.min(1800, Math.floor(baseChunkSize * 1.5));
      adaptiveOverlap = Math.min(300, Math.floor(baseOverlap * 1.5));
    }

    // Ensure overlap doesn't exceed chunk size
    if (adaptiveOverlap >= adaptiveChunkSize) {
      adaptiveOverlap = Math.floor(adaptiveChunkSize * 0.2); // 20% overlap max
    }

    return {
      chunkSize: adaptiveChunkSize,
      overlap: adaptiveOverlap
    };
  }

  /**
   * Generate chunks from content
   * @private
   */
  _generateChunks(content, url, { chunkSize, overlap }) {
    const chunks = [];
    const step = chunkSize - overlap;
    const totalChunks = Math.ceil(content.length / step);
    
    for (let i = 0; i < content.length; i += step) {
      const chunkText = content.slice(i, i + chunkSize).trim();
      
      // Skip empty chunks
      if (!chunkText) continue;

      const chunkId = uuidv4();
      const chunkIndex = Math.floor(i / step);
      
      chunks.push({
        chunk_text: chunkText,
        chunk_id: chunkId,
        chunk_index: chunkIndex,
        original_url: url,
        total_chunks: totalChunks,
        chunk_size_used: chunkSize,
        overlap_used: overlap,
        character_start: i,
        character_end: Math.min(i + chunkSize, content.length),
        created_at: new Date().toISOString()
      });
    }

    // Validate chunk generation
    if (chunks.length === 0) {
      throw new Error('No valid chunks generated from content');
    }

    return chunks;
  }

  /**
   * Smart chunking that respects sentence boundaries
   * @param {string} content - Content to chunk
   * @param {string} url - Source URL
   * @param {Object} options - Chunking options
   * @returns {Array} Array of chunks
   */
  smartChunk(content, url, options = {}) {
    const { chunkSize = this.defaultChunkSize, overlap = this.defaultOverlap } = options;
    
    // Split content into sentences
    const sentences = this._splitIntoSentences(content);
    const chunks = [];
    let currentChunk = '';
    let chunkIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;

      if (potentialChunk.length <= chunkSize) {
        currentChunk = potentialChunk;
      } else {
        // Current chunk is ready
        if (currentChunk) {
          const smartStrategy = { 
            method: 'smart', 
            overlap: 0, 
            respectBoundaries: true 
          };
          chunks.push(this._createChunkObject(
            currentChunk, 
            url, 
            chunkIndex++, 
            0, 
            currentChunk.length, 
            smartStrategy
          ));
        }
        
        // Start new chunk with current sentence
        currentChunk = sentence;
        
        // Handle very long sentences that exceed chunk size
        if (sentence.length > chunkSize) {
          const smartStrategy = { 
            method: 'smart', 
            overlap: 0, 
            respectBoundaries: true 
          };
          chunks.push(this._createChunkObject(
            sentence, 
            url, 
            chunkIndex++, 
            0, 
            sentence.length, 
            smartStrategy
          ));
          currentChunk = '';
        }
      }
    }

    // Add final chunk if any content remains
    if (currentChunk) {
      const smartStrategy = { 
        method: 'smart', 
        overlap: 0, 
        respectBoundaries: true 
      };
      chunks.push(this._createChunkObject(
        currentChunk, 
        url, 
        chunkIndex, 
        chunks.length + 1, 
        currentChunk.length, 
        smartStrategy
      ));
    }

    // Update total chunks count
    chunks.forEach(chunk => {
      chunk.total_chunks = chunks.length;
    });

    this.logger.info(`Smart chunking created ${chunks.length} sentence-aware chunks`, {
      url,
      totalChunks: chunks.length,
      sentenceCount: sentences.length
    });

    return chunks;
  }

  /**
   * Split content into sentences
   * @private
   */
  _splitIntoSentences(content) {
    // Improved sentence splitting that handles common abbreviations
    const sentenceEnders = /[.!?]+/g;
    const sentences = content
      .replace(/([.!?]+)\s+/g, '$1|SPLIT|')
      .split('|SPLIT|')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return sentences;
  }

  /**
   * Create a standardized chunk object
   * @private
   */
  _createChunkObject(text, url, index, total) {
    return {
      chunk_text: text.trim(),
      chunk_id: uuidv4(),
      chunk_index: index,
      original_url: url,
      total_chunks: total,
      chunk_size_used: text.length,
      overlap_used: 0, // Smart chunking doesn't use traditional overlap
      character_start: null, // Not applicable for sentence-based chunking
      character_end: null,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Get chunking statistics for content
   * @param {string} content - Content to analyze
   * @param {Object} options - Chunking options
   * @returns {Object} Statistics about potential chunking
   */
  getChunkingStats(content, options = {}) {
    const { chunkSize = this.defaultChunkSize, overlap = this.defaultOverlap } = options;
    
    const cleanContent = this._cleanContent(content);
    const step = chunkSize - overlap;
    const estimatedChunks = Math.ceil(cleanContent.length / step);
    
    return {
      contentLength: content.length,
      cleanContentLength: cleanContent.length,
      estimatedChunks,
      chunkSize,
      overlap,
      avgChunkSize: Math.min(chunkSize, Math.ceil(cleanContent.length / estimatedChunks)),
      processingTime: this._estimateProcessingTime(estimatedChunks)
    };
  }

  /**
   * Estimate processing time based on chunk count
   * @private
   */
  _estimateProcessingTime(chunkCount) {
    // Rough estimate: 2-5 seconds per chunk for analysis + embedding + storage
    const avgTimePerChunk = 3.5; // seconds
    const estimatedSeconds = chunkCount * avgTimePerChunk;
    
    return {
      seconds: estimatedSeconds,
      minutes: Math.ceil(estimatedSeconds / 60),
      formatted: estimatedSeconds < 60 
        ? `${Math.ceil(estimatedSeconds)} seconds`
        : `${Math.ceil(estimatedSeconds / 60)} minutes`
    };
  }

  /**
   * Enhanced Methods for Intelligent Document Segmentation v2.2
   */

  /**
   * Analyze document structure to determine optimal chunking strategy
   * @private
   */
  _analyzeDocumentStructure(content, documentType = null) {
    const analysis = {
      type: documentType || this._detectDocumentType(content),
      hasHeaders: this._detectHeaders(content),
      hasList: this._detectLists(content),
      hasCodeBlocks: this._detectCodeBlocks(content),
      hasTable: this._detectTables(content),
      paragraphCount: this._countParagraphs(content),
      sentenceCount: this._countSentences(content),
      avgSentenceLength: this._calculateAvgSentenceLength(content),
      structuralElements: this._identifyStructuralElements(content),
      hasStructure: false
    };

    // Determine if document has clear structure
    analysis.hasStructure = analysis.hasHeaders || analysis.hasList || 
                           analysis.hasCodeBlocks || analysis.hasTable ||
                           analysis.structuralElements.length > 0;

    return analysis;
  }

  /**
   * Determine optimal chunking strategy based on document analysis
   * @private
   */
  _determineChunkingStrategy(content, documentAnalysis, options) {
    const { chunkSize, overlap, enableAdaptive, enableIntelligentSegmentation } = options;
    
    let strategy = {
      chunkSize,
      overlap,
      method: 'fixed',
      respectBoundaries: [],
      preserveElements: []
    };

    if (enableIntelligentSegmentation) {
      // Adapt strategy based on document type
      switch (documentAnalysis.type) {
        case 'academic_paper':
          strategy.respectBoundaries = ['paragraph', 'section'];
          strategy.preserveElements = ['citations', 'formulas'];
          strategy.method = 'semantic';
          break;
        
        case 'documentation':
          strategy.respectBoundaries = ['header', 'code_block', 'list'];
          strategy.preserveElements = ['code', 'examples'];
          strategy.method = 'structural';
          break;
        
        case 'book_or_manual':
          strategy.respectBoundaries = ['chapter', 'section', 'paragraph'];
          strategy.preserveElements = ['footnotes', 'references'];
          strategy.method = 'hierarchical';
          break;
        
        case 'legal_document':
          strategy.respectBoundaries = ['section', 'clause', 'paragraph'];
          strategy.preserveElements = ['definitions', 'references'];
          strategy.method = 'structural';
          break;
        
        default:
          strategy.respectBoundaries = ['paragraph', 'sentence'];
          strategy.method = 'semantic';
          break;
      }

      // Adjust chunk size based on document characteristics
      if (enableAdaptive) {
        strategy = this._adaptStrategyToContent(strategy, documentAnalysis, content);
      }
    } else if (enableAdaptive) {
      // Use existing adaptive logic
      const adaptiveParams = this._getAdaptiveParameters(content, chunkSize, overlap);
      strategy.chunkSize = adaptiveParams.chunkSize;
      strategy.overlap = adaptiveParams.overlap;
    }

    return strategy;
  }

  /**
   * Generate intelligent chunks that respect document structure and semantics
   * @private
   */
  _generateIntelligentChunks(content, url, strategy, documentAnalysis) {
    const chunks = [];
    
    switch (strategy.method) {
      case 'structural':
        return this._generateStructuralChunks(content, url, strategy, documentAnalysis);
      
      case 'semantic':
        return this._generateSemanticChunks(content, url, strategy, documentAnalysis);
      
      case 'hierarchical':
        return this._generateHierarchicalChunks(content, url, strategy, documentAnalysis);
      
      default:
        // Fallback to enhanced fixed chunking with boundary respect
        return this._generateBoundaryRespectingChunks(content, url, strategy);
    }
  }

  /**
   * Generate chunks that respect structural elements (headers, lists, code blocks)
   * @private
   */
  _generateStructuralChunks(content, url, strategy, documentAnalysis) {
    const chunks = [];
    const structuralBreaks = this._findStructuralBreaks(content, documentAnalysis);
    const sections = this._splitByStructuralBreaks(content, structuralBreaks);
    
    let chunkIndex = 0;
    
    for (const section of sections) {
      const sectionChunks = this._chunkSection(
        section, 
        url, 
        strategy, 
        chunkIndex
      );
      chunks.push(...sectionChunks);
      chunkIndex += sectionChunks.length;
    }

    return chunks;
  }

  /**
   * Generate chunks that preserve semantic meaning
   * @private
   */
  _generateSemanticChunks(content, url, strategy, documentAnalysis) {
    const chunks = [];
    const semanticBoundaries = this._findSemanticBoundaries(content, strategy);
    
    let currentChunk = '';
    let chunkStart = 0;
    let chunkIndex = 0;

    for (const boundary of semanticBoundaries) {
      const segment = content.slice(chunkStart, boundary.position);
      
      if (currentChunk.length + segment.length <= strategy.chunkSize) {
        currentChunk += segment;
      } else {
        // Finish current chunk and start new one
        if (currentChunk.trim()) {
          chunks.push(this._createChunkObject(
            currentChunk.trim(),
            url,
            chunkIndex++,
            chunkStart - currentChunk.length,
            chunkStart,
            strategy,
            { semanticBoundary: true, boundaryType: boundary.type }
          ));
        }
        
        currentChunk = segment;
        chunkStart = boundary.position;
        this.metrics.semanticBoundariesFound++;
      }
    }

    // Handle remaining content
    if (currentChunk.trim()) {
      chunks.push(this._createChunkObject(
        currentChunk.trim(),
        url,
        chunkIndex,
        chunkStart - currentChunk.length,
        content.length,
        strategy
      ));
    }

    return chunks;
  }

  /**
   * Generate chunks with hierarchical awareness (for books, manuals)
   * @private
   */
  _generateHierarchicalChunks(content, url, strategy, documentAnalysis) {
    const hierarchy = this._buildDocumentHierarchy(content, documentAnalysis);
    const chunks = [];
    let chunkIndex = 0;

    for (const section of hierarchy) {
      const sectionChunks = this._chunkHierarchicalSection(
        section,
        url,
        strategy,
        chunkIndex
      );
      chunks.push(...sectionChunks);
      chunkIndex += sectionChunks.length;
    }

    return chunks;
  }

  /**
   * Generate chunks that respect boundaries but use fixed sizing
   * @private
   */
  _generateBoundaryRespectingChunks(content, url, strategy) {
    const chunks = [];
    const boundaryPositions = this._findBoundaryPositions(content, strategy.respectBoundaries);
    
    let position = 0;
    let chunkIndex = 0;

    while (position < content.length) {
      const idealEnd = position + strategy.chunkSize;
      const actualEnd = this._findBestBoundary(idealEnd, boundaryPositions, strategy.chunkSize);
      
      const chunkText = content.slice(position, actualEnd).trim();
      
      if (chunkText) {
        chunks.push(this._createChunkObject(
          chunkText,
          url,
          chunkIndex++,
          position,
          actualEnd,
          strategy,
          { boundaryRespected: true }
        ));
      }

      position = actualEnd - strategy.overlap;
    }

    return chunks;
  }

  /**
   * Create a standardized chunk object with enhanced metadata
   * @private
   */
  _createChunkObject(text, url, index, startPos, endPos, strategy, metadata = {}) {
    return {
      chunk_text: text,
      chunk_id: uuidv4(),
      chunk_index: index,
      original_url: url,
      chunk_size_used: text.length,
      overlap_used: strategy.overlap,
      character_start: startPos,
      character_end: endPos,
      created_at: new Date().toISOString(),
      chunking_method: strategy.method,
      boundaries_respected: strategy.respectBoundaries,
      ...metadata
    };
  }

  /**
   * Document analysis helper methods
   * @private
   */
  _detectDocumentType(content) {
    const lower = content.toLowerCase();
    
    if (lower.includes('abstract') && lower.includes('references')) {
      return 'academic_paper';
    } else if (lower.includes('chapter') || lower.match(/\d+\.\s+[A-Z]/)) {
      return 'book_or_manual';
    } else if (lower.includes('```') || lower.includes('## ')) {
      return 'documentation';
    } else if (lower.includes('whereas') || lower.includes('hereby')) {
      return 'legal_document';
    } else {
      return 'general_article';
    }
  }

  _detectHeaders(content) {
    return /^#{1,6}\s+.+$/m.test(content) || /^[A-Z][A-Za-z\s]+:?$/m.test(content);
  }

  _detectLists(content) {
    return /^\s*[-*+]\s+/m.test(content) || /^\s*\d+\.\s+/m.test(content);
  }

  _detectCodeBlocks(content) {
    return /```[\s\S]*?```/.test(content) || /^\s{4,}/m.test(content);
  }

  _detectTables(content) {
    return /\|.*\|/.test(content) && /[-:]+/.test(content);
  }

  _countParagraphs(content) {
    return content.split(/\n\s*\n/).length;
  }

  _countSentences(content) {
    return (content.match(/[.!?]+/g) || []).length;
  }

  _calculateAvgSentenceLength(content) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return 0;
    
    const totalLength = sentences.reduce((sum, s) => sum + s.trim().length, 0);
    return Math.round(totalLength / sentences.length);
  }

  _identifyStructuralElements(content) {
    const elements = [];
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      if (trimmed.match(/^#{1,6}\s+/)) {
        elements.push({ type: 'header', line: index, text: trimmed });
      } else if (trimmed.match(/^\s*[-*+]\s+/) || trimmed.match(/^\s*\d+\.\s+/)) {
        elements.push({ type: 'list_item', line: index, text: trimmed });
      } else if (trimmed.startsWith('```')) {
        elements.push({ type: 'code_block', line: index, text: trimmed });
      }
    });
    
    return elements;
  }

  _findSemanticBoundaries(content, strategy) {
    const boundaries = [];
    
    // Find paragraph boundaries
    const paragraphs = content.split(/\n\s*\n/);
    let position = 0;
    
    for (const paragraph of paragraphs) {
      position += paragraph.length;
      boundaries.push({
        position,
        type: 'paragraph',
        strength: 0.8
      });
      position += 2; // Account for the double newline
    }
    
    // Find sentence boundaries
    const sentences = content.match(/[^.!?]*[.!?]+/g) || [];
    position = 0;
    
    for (const sentence of sentences) {
      position += sentence.length;
      boundaries.push({
        position,
        type: 'sentence',
        strength: 0.4
      });
    }
    
    // Sort by position and filter by strength
    return boundaries
      .sort((a, b) => a.position - b.position)
      .filter(b => b.strength > 0.3);
  }

  _findBoundaryPositions(content, boundaryTypes) {
    const positions = [];
    
    if (boundaryTypes.includes('paragraph')) {
      let pos = 0;
      const parts = content.split(/\n\s*\n/);
      for (const part of parts) {
        pos += part.length + 2;
        positions.push(pos);
      }
    }
    
    if (boundaryTypes.includes('sentence')) {
      const sentences = content.match(/[^.!?]*[.!?]+/g) || [];
      let pos = 0;
      for (const sentence of sentences) {
        pos += sentence.length;
        positions.push(pos);
      }
    }
    
    return positions.sort((a, b) => a - b);
  }

  _findBestBoundary(idealPosition, boundaryPositions, maxDistance) {
    let bestPosition = idealPosition;
    let minDistance = maxDistance;
    
    for (const pos of boundaryPositions) {
      const distance = Math.abs(pos - idealPosition);
      if (distance < minDistance && pos <= idealPosition + maxDistance * 0.2) {
        bestPosition = pos;
        minDistance = distance;
      }
    }
    
    return bestPosition;
  }

  _adaptStrategyToContent(strategy, documentAnalysis, content) {
    // Adjust chunk size based on document characteristics
    let adaptedStrategy = { ...strategy };
    
    // ADAPTIVE CHUNKING BASED ON DOCUMENT SIZE - Fixes 1000+ chunk issue
    const contentLength = content.length;
    
    if (contentLength > 500000) { // 500KB+ (large books, academic papers like the 1000-chunk example)
      adaptedStrategy.chunkSize = Math.min(4000, Math.max(3000, strategy.chunkSize * 1.8));
      adaptedStrategy.overlap = Math.min(400, strategy.overlap * 1.5);
      this.logger.info('Large document detected - using increased chunk size', {
        contentLength,
        originalChunkSize: strategy.chunkSize,
        adaptedChunkSize: adaptedStrategy.chunkSize
      });
    } else if (contentLength > 100000) { // 100KB+ (medium documents)
      adaptedStrategy.chunkSize = Math.min(3000, Math.max(2500, strategy.chunkSize * 1.3));
      adaptedStrategy.overlap = Math.min(300, strategy.overlap * 1.2);
    } else if (contentLength < 10000) { // Small documents - use smaller chunks
      adaptedStrategy.chunkSize = Math.max(1000, strategy.chunkSize * 0.8);
    }
    
    // Document type specific adaptations
    if (documentAnalysis.type === 'academic_paper' || documentAnalysis.type === 'book_or_manual') {
      // Academic papers and books benefit from larger chunks for better context
      adaptedStrategy.chunkSize = Math.min(4000, Math.max(adaptedStrategy.chunkSize, 3000));
      this.logger.info('Academic/book content detected - ensuring minimum chunk size', {
        documentType: documentAnalysis.type,
        finalChunkSize: adaptedStrategy.chunkSize
      });
    }
    
    if (documentAnalysis.avgSentenceLength > 100) {
      // Long sentences - increase chunk size
      adaptedStrategy.chunkSize = Math.min(4000, adaptedStrategy.chunkSize * 1.2);
    } else if (documentAnalysis.avgSentenceLength < 50) {
      // Short sentences - decrease chunk size slightly
      adaptedStrategy.chunkSize = Math.max(1200, adaptedStrategy.chunkSize * 0.9);
    }
    
    if (documentAnalysis.hasCodeBlocks) {
      // Code blocks need larger chunks to preserve context
      adaptedStrategy.chunkSize = Math.min(4000, adaptedStrategy.chunkSize * 1.3);
      adaptedStrategy.overlap = Math.min(500, adaptedStrategy.overlap * 1.5);
    }
    
    return adaptedStrategy;
  }

  _updateMetrics(chunks, documentAnalysis) {
    this.metrics.totalChunksCreated += chunks.length;
    
    if (chunks.length > 0) {
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.chunk_text.length, 0);
      this.metrics.avgChunkSize = totalSize / chunks.length;
    }
    
    if (documentAnalysis.hasStructure) {
      this.metrics.structurePreserved++;
    }
  }

  /**
   * Additional helper methods for structural and hierarchical chunking
   * These are simplified implementations for core functionality
   * @private
   */
  _findStructuralBreaks(content, documentAnalysis) {
    const breaks = [0]; // Start with beginning
    const lines = content.split('\n');
    let position = 0;
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      position += line.length + 1; // +1 for newline
      
      if (trimmed.match(/^#{1,6}\s+/) || trimmed.match(/^[A-Z][A-Z\s]+:?$/)) {
        breaks.push(position);
      }
    });
    
    breaks.push(content.length); // End with total length
    return [...new Set(breaks)].sort((a, b) => a - b);
  }

  _splitByStructuralBreaks(content, breaks) {
    const sections = [];
    
    for (let i = 0; i < breaks.length - 1; i++) {
      const section = content.slice(breaks[i], breaks[i + 1]).trim();
      if (section) {
        sections.push({
          content: section,
          start: breaks[i],
          end: breaks[i + 1]
        });
      }
    }
    
    return sections;
  }

  _chunkSection(section, url, strategy, startIndex) {
    const chunks = [];
    const content = section.content || section;
    const step = strategy.chunkSize - strategy.overlap;
    
    for (let i = 0; i < content.length; i += step) {
      const chunkText = content.slice(i, i + strategy.chunkSize).trim();
      
      if (chunkText) {
        chunks.push(this._createChunkObject(
          chunkText,
          url,
          startIndex + chunks.length,
          (section.start || 0) + i,
          Math.min((section.start || 0) + i + strategy.chunkSize, (section.end || content.length)),
          strategy,
          { sectionBased: true }
        ));
      }
    }
    
    return chunks;
  }

  _buildDocumentHierarchy(content, documentAnalysis) {
    // Simplified hierarchy building - identify major sections
    const hierarchy = [];
    const lines = content.split('\n');
    let currentSection = { content: '', start: 0, level: 0 };
    let position = 0;
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      position += line.length + 1;
      
      // Detect hierarchical markers
      const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        // Finish current section
        if (currentSection.content.trim()) {
          currentSection.end = position - line.length - 1;
          hierarchy.push({ ...currentSection });
        }
        
        // Start new section
        currentSection = {
          content: line + '\n',
          start: position - line.length - 1,
          level: headerMatch[1].length,
          title: headerMatch[2]
        };
      } else {
        currentSection.content += line + '\n';
      }
    });
    
    // Add final section
    if (currentSection.content.trim()) {
      currentSection.end = content.length;
      hierarchy.push(currentSection);
    }
    
    return hierarchy.length > 0 ? hierarchy : [{ content, start: 0, end: content.length, level: 0 }];
  }

  _chunkHierarchicalSection(section, url, strategy, startIndex) {
    // For hierarchical sections, respect the section boundaries
    const chunks = [];
    let content = section.content;
    
    // If section is too large, break it down further
    if (content.length > strategy.chunkSize * 2) {
      const step = strategy.chunkSize - strategy.overlap;
      
      for (let i = 0; i < content.length; i += step) {
        const chunkText = content.slice(i, i + strategy.chunkSize).trim();
        
        if (chunkText) {
          chunks.push(this._createChunkObject(
            chunkText,
            url,
            startIndex + chunks.length,
            section.start + i,
            Math.min(section.start + i + strategy.chunkSize, section.end),
            strategy,
            { 
              hierarchical: true, 
              sectionLevel: section.level,
              sectionTitle: section.title
            }
          ));
        }
      }
    } else {
      // Small section - keep as single chunk
      chunks.push(this._createChunkObject(
        content.trim(),
        url,
        startIndex,
        section.start,
        section.end,
        strategy,
        { 
          hierarchical: true, 
          sectionLevel: section.level,
          sectionTitle: section.title,
          completeSection: true
        }
      ));
    }
    
    return chunks;
  }

  /**
   * Get enhanced statistics for intelligent chunking
   * @returns {Object} Enhanced statistics
   */
  getStats() {
    return {
      totalChunksCreated: this.metrics.totalChunksCreated,
      semanticBoundariesFound: this.metrics.semanticBoundariesFound,
      structurePreserved: this.metrics.structurePreserved,
      avgChunkSize: Math.round(this.metrics.avgChunkSize),
      avgSemanticScore: Math.round(this.metrics.avgSemanticScore * 100) / 100,
      version: '2.2',
      intelligentConfig: this.intelligentConfig,
      defaultChunkSize: this.defaultChunkSize,
      defaultOverlap: this.defaultOverlap
    };
  }
}

module.exports = ChunkingService;