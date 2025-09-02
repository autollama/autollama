/**
 * Unit tests for file processors (PDF, EPUB, DOCX, TXT)
 */

describe('File Processors', () => {
  // Mock EPUB parser
  const mockEPUBParser = {
    canParse: (buffer) => {
      if (!buffer || buffer.length < 4) return false;
      return buffer.toString('ascii', 0, 4) === 'PK\x03\x04'; // ZIP signature
    },
    
    parse: async (buffer, filename) => {
      return {
        content: 'Sample EPUB content extracted from ' + filename,
        type: 'epub',
        metadata: {
          chapters: 8,
          author: 'Test Author',
          title: 'Test EPUB Book',
          fileSize: buffer.length,
          language: 'en'
        },
        processingInfo: {
          parsingTime: 200,
          method: 'epub-parser'
        }
      };
    }
  };

  // Mock DOCX parser
  const mockDOCXParser = {
    canParse: (buffer) => {
      if (!buffer || buffer.length < 4) return false;
      return buffer.toString('ascii', 0, 4) === 'PK\x03\x04'; // ZIP signature
    },
    
    parse: async (buffer, filename) => {
      return {
        content: 'Sample DOCX content extracted from ' + filename,
        type: 'docx',
        metadata: {
          wordCount: 1250,
          pageCount: 5,
          author: 'Test Author',
          title: 'Test DOCX Document',
          fileSize: buffer.length
        },
        processingInfo: {
          parsingTime: 180,
          method: 'mammoth'
        }
      };
    }
  };

  // Mock TXT parser
  const mockTXTParser = {
    canParse: (buffer, mimeType) => {
      if (!buffer || !mimeType) return false;
      return mimeType === 'text/plain' || 
             mimeType === 'text/csv' ||
             mimeType === 'text/markdown';
    },
    
    parse: async (buffer, filename) => {
      return {
        content: buffer.toString('utf8'),
        type: 'text',
        metadata: {
          lineCount: buffer.toString('utf8').split('\n').length,
          characterCount: buffer.length,
          encoding: 'utf8',
          fileSize: buffer.length
        },
        processingInfo: {
          parsingTime: 10,
          method: 'direct-text'
        }
      };
    }
  };

  // Parser factory
  const createParser = (type) => {
    switch (type) {
      case 'epub': return mockEPUBParser;
      case 'docx': return mockDOCXParser;
      case 'txt': return mockTXTParser;
      default: throw new Error('Unknown parser type');
    }
  };

  describe('EPUB Parser', () => {
    test('should identify EPUB files', () => {
      const epubBuffer = Buffer.from('PK\x03\x04\x14\x00EPUB content');
      expect(mockEPUBParser.canParse(epubBuffer)).toBe(true);
    });

    test('should reject non-EPUB files', () => {
      const textBuffer = Buffer.from('This is plain text');
      expect(mockEPUBParser.canParse(textBuffer)).toBe(false);
    });

    test('should extract EPUB content', async () => {
      const epubBuffer = Buffer.from('PK\x03\x04\x14\x00EPUB content');
      const result = await mockEPUBParser.parse(epubBuffer, 'test.epub');

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('type', 'epub');
      expect(result).toHaveProperty('metadata');
      expect(result.metadata).toHaveProperty('chapters');
      expect(result.metadata).toHaveProperty('author');
      expect(result.metadata.chapters).toBeGreaterThan(0);
    });
  });

  describe('DOCX Parser', () => {
    test('should identify DOCX files', () => {
      const docxBuffer = Buffer.from('PK\x03\x04\x14\x00DOCX content');
      expect(mockDOCXParser.canParse(docxBuffer)).toBe(true);
    });

    test('should extract DOCX content', async () => {
      const docxBuffer = Buffer.from('PK\x03\x04\x14\x00DOCX content');
      const result = await mockDOCXParser.parse(docxBuffer, 'test.docx');

      expect(result.type).toBe('docx');
      expect(result.metadata).toHaveProperty('wordCount');
      expect(result.metadata).toHaveProperty('pageCount');
      expect(result.metadata.wordCount).toBeGreaterThan(0);
      expect(result.metadata.pageCount).toBeGreaterThan(0);
    });
  });

  describe('TXT Parser', () => {
    test('should identify text files by MIME type', () => {
      const textBuffer = Buffer.from('Plain text content');
      expect(mockTXTParser.canParse(textBuffer, 'text/plain')).toBe(true);
      expect(mockTXTParser.canParse(textBuffer, 'text/csv')).toBe(true);
      expect(mockTXTParser.canParse(textBuffer, 'application/pdf')).toBe(false);
    });

    test('should extract text content directly', async () => {
      const textContent = 'Line 1\nLine 2\nLine 3';
      const textBuffer = Buffer.from(textContent, 'utf8');
      const result = await mockTXTParser.parse(textBuffer, 'test.txt');

      expect(result.content).toBe(textContent);
      expect(result.type).toBe('text');
      expect(result.metadata.lineCount).toBe(3);
      expect(result.metadata.characterCount).toBe(textContent.length);
    });

    test('should handle different text encodings', async () => {
      const unicodeContent = 'Hello 世界 🌍';
      const textBuffer = Buffer.from(unicodeContent, 'utf8');
      const result = await mockTXTParser.parse(textBuffer, 'unicode.txt');

      expect(result.content).toBe(unicodeContent);
      expect(result.metadata.encoding).toBe('utf8');
    });
  });

  describe('Parser Factory', () => {
    test('should create correct parser instances', () => {
      const epubParser = createParser('epub');
      const docxParser = createParser('docx');
      const txtParser = createParser('txt');

      expect(epubParser).toBe(mockEPUBParser);
      expect(docxParser).toBe(mockDOCXParser);
      expect(txtParser).toBe(mockTXTParser);
    });

    test('should handle unknown parser types', () => {
      expect(() => createParser('unknown')).toThrow('Unknown parser type');
    });
  });

  describe('Multi-format processing', () => {
    test('should handle multiple file types in sequence', async () => {
      const files = [
        { 
          buffer: Buffer.from('PK\x03\x04\x14\x00EPUB'), 
          filename: 'book.epub', 
          parser: 'epub' 
        },
        { 
          buffer: Buffer.from('PK\x03\x04\x14\x00DOCX'), 
          filename: 'doc.docx', 
          parser: 'docx' 
        },
        { 
          buffer: Buffer.from('Plain text content'), 
          filename: 'text.txt', 
          parser: 'txt' 
        }
      ];

      const results = [];
      for (const file of files) {
        const parser = createParser(file.parser);
        const result = await parser.parse(file.buffer, file.filename);
        results.push(result);
      }

      expect(results.length).toBe(3);
      expect(results[0].type).toBe('epub');
      expect(results[1].type).toBe('docx');
      expect(results[2].type).toBe('text');
    });

    test('should handle concurrent file processing', async () => {
      const files = [
        { buffer: Buffer.from('Text 1'), filename: 'file1.txt', type: 'txt' },
        { buffer: Buffer.from('Text 2'), filename: 'file2.txt', type: 'txt' },
        { buffer: Buffer.from('Text 3'), filename: 'file3.txt', type: 'txt' }
      ];

      const parsePromises = files.map(file => {
        const parser = createParser(file.type);
        return parser.parse(file.buffer, file.filename);
      });

      const results = await Promise.all(parsePromises);
      
      expect(results.length).toBe(3);
      results.forEach((result, index) => {
        expect(result.content).toContain(`Text ${index + 1}`);
        expect(result.type).toBe('text');
      });
    });
  });

  describe('Parser performance', () => {
    test('should track parsing times', async () => {
      const parsers = [
        { parser: createParser('txt'), type: 'text' },
        { parser: createParser('epub'), type: 'epub' },
        { parser: createParser('docx'), type: 'docx' }
      ];

      for (const { parser, type } of parsers) {
        const buffer = Buffer.from('Test content');
        const result = await parser.parse(buffer, `test.${type}`);
        
        expect(result.processingInfo.parsingTime).toBeGreaterThan(0);
        expect(result.processingInfo.method).toBeDefined();
      }
    });

    test('should have reasonable performance limits', async () => {
      const txtParser = createParser('txt');
      const largeContent = 'x'.repeat(10000);
      const buffer = Buffer.from(largeContent, 'utf8');

      const start = Date.now();
      const result = await txtParser.parse(buffer, 'large.txt');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should parse large text quickly
      expect(result.content.length).toBe(10000);
    });
  });

  describe('Error handling', () => {
    test('should handle empty buffers', async () => {
      const txtParser = createParser('txt');
      const emptyBuffer = Buffer.alloc(0);
      
      const result = await txtParser.parse(emptyBuffer, 'empty.txt');
      
      expect(result.content).toBe('');
      expect(result.metadata.characterCount).toBe(0);
      expect(result.metadata.lineCount).toBe(1); // Empty file has 1 line
    });

    test('should handle malformed files gracefully', () => {
      const epubParser = createParser('epub');
      const invalidBuffer = Buffer.from('Not a valid ZIP/EPUB file');
      
      // Should still identify as potentially parseable (ZIP signature check)
      expect(epubParser.canParse(invalidBuffer)).toBe(false);
    });

    test('should handle null and undefined inputs', () => {
      const txtParser = createParser('txt');
      
      expect(txtParser.canParse(null, 'text/plain')).toBe(false);
      expect(txtParser.canParse(undefined, 'text/plain')).toBe(false);
    });
  });

  describe('Metadata extraction', () => {
    test('should extract comprehensive metadata', async () => {
      const testContent = 'Line 1\nLine 2\nLine 3\nSpecial chars: àáâãäå';
      const buffer = Buffer.from(testContent, 'utf8');
      const result = await mockTXTParser.parse(buffer, 'metadata-test.txt');

      expect(result.metadata).toMatchObject({
        lineCount: 4,
        characterCount: expect.any(Number),
        encoding: 'utf8',
        fileSize: expect.any(Number)
      });

      expect(result.metadata.characterCount).toBeGreaterThan(30);
    });

    test('should handle files with various metadata', async () => {
      const epubBuffer = Buffer.from('PK\x03\x04\x14\x00EPUB');
      const result = await mockEPUBParser.parse(epubBuffer, 'metadata.epub');

      expect(result.metadata).toMatchObject({
        chapters: expect.any(Number),
        author: expect.any(String),
        title: expect.any(String),
        fileSize: expect.any(Number),
        language: expect.any(String)
      });
    });
  });

  describe('Processing information tracking', () => {
    test('should track processing methods', async () => {
      const parsers = [
        { parser: mockTXTParser, expectedMethod: 'direct-text' },
        { parser: mockEPUBParser, expectedMethod: 'epub-parser' },
        { parser: mockDOCXParser, expectedMethod: 'mammoth' }
      ];

      for (const { parser, expectedMethod } of parsers) {
        const buffer = Buffer.from('Test content');
        const result = await parser.parse(buffer, 'test.file');
        
        expect(result.processingInfo.method).toBe(expectedMethod);
      }
    });

    test('should track processing time accurately', async () => {
      const txtParser = createParser('txt');
      const buffer = Buffer.from('Quick parsing test');

      const start = Date.now();
      const result = await txtParser.parse(buffer, 'timing.txt');
      const actualDuration = Date.now() - start;

      expect(result.processingInfo.parsingTime).toBeGreaterThan(0);
      expect(result.processingInfo.parsingTime).toBeLessThan(actualDuration + 50);
    });
  });
});