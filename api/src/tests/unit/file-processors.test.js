/**
 * Unit tests for file processors
 * Tests the file processing services and parsers
 */

const FileProcessor = require('../../services/processing/file.processor');
const PDFParser = require('../../services/processing/parsers/pdf.parser');
const TextParser = require('../../services/processing/parsers/text.parser');
const CSVParser = require('../../services/processing/parsers/csv.parser');
const URLFetcher = require('../../services/processing/url.fetcher');

describe('FileProcessor', () => {
  let fileProcessor;

  beforeEach(() => {
    fileProcessor = new FileProcessor({
      maxFileSize: 1024 * 1024, // 1MB for tests
      allowedMimeTypes: [
        'application/pdf',
        'text/plain',
        'text/csv',
        'text/html'
      ]
    });
  });

  describe('isSupported', () => {
    it('should identify supported file types', () => {
      expect(fileProcessor.isSupported('application/pdf', 'test.pdf')).toBe(true);
      expect(fileProcessor.isSupported('text/plain', 'test.txt')).toBe(true);
      expect(fileProcessor.isSupported('text/csv', 'test.csv')).toBe(true);
    });

    it('should identify unsupported file types', () => {
      expect(fileProcessor.isSupported('application/zip', 'test.zip')).toBe(false);
      expect(fileProcessor.isSupported('image/jpeg', 'test.jpg')).toBe(false);
    });

    it('should fall back to extension detection', () => {
      expect(fileProcessor.isSupported('application/octet-stream', 'test.pdf')).toBe(true);
      expect(fileProcessor.isSupported('application/octet-stream', 'test.txt')).toBe(true);
    });
  });

  describe('getSupportedTypes', () => {
    it('should return supported types information', () => {
      const supportedTypes = fileProcessor.getSupportedTypes();
      
      expect(supportedTypes).toHaveProperty('mimeTypes');
      expect(supportedTypes).toHaveProperty('extensions');
      expect(supportedTypes).toHaveProperty('parsers');
      
      expect(Array.isArray(supportedTypes.mimeTypes)).toBe(true);
      expect(Array.isArray(supportedTypes.extensions)).toBe(true);
      expect(Array.isArray(supportedTypes.parsers)).toBe(true);
      
      expect(supportedTypes.mimeTypes.length).toBeGreaterThan(0);
    });
  });

  describe('getParser', () => {
    it('should return appropriate parser for MIME type', () => {
      const pdfParser = fileProcessor.getParser('application/pdf');
      const textParser = fileProcessor.getParser('text/plain');
      
      expect(pdfParser).toBeDefined();
      expect(textParser).toBeDefined();
      expect(pdfParser.constructor.name).toBe('PDFParser');
      expect(textParser.constructor.name).toBe('TextParser');
    });

    it('should return null for unsupported types', () => {
      const unsupportedParser = fileProcessor.getParser('application/zip');
      expect(unsupportedParser).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return processor statistics', () => {
      const stats = fileProcessor.getStats();
      
      expect(stats).toHaveProperty('supportedTypesCount');
      expect(stats).toHaveProperty('maxFileSize');
      expect(stats).toHaveProperty('allowedTypes');
      expect(stats).toHaveProperty('parsers');
      
      expect(typeof stats.supportedTypesCount).toBe('number');
      expect(stats.supportedTypesCount).toBeGreaterThan(0);
    });
  });
});

describe('PDFParser', () => {
  let pdfParser;

  beforeEach(() => {
    pdfParser = new PDFParser({
      enableMetadataExtraction: true
    });
  });

  describe('canParse', () => {
    it('should identify PDF buffers', () => {
      const pdfBuffer = Buffer.from('%PDF-1.4\n%test content');
      const textBuffer = Buffer.from('This is plain text');
      
      expect(pdfParser.canParse(pdfBuffer)).toBe(true);
      expect(pdfParser.canParse(textBuffer)).toBe(false);
    });

    it('should handle invalid inputs', () => {
      expect(pdfParser.canParse(null)).toBe(false);
      expect(pdfParser.canParse(Buffer.alloc(0))).toBe(false);
      expect(pdfParser.canParse(Buffer.alloc(2))).toBe(false);
    });
  });

  describe('getCapabilities', () => {
    it('should return parser capabilities', () => {
      const capabilities = pdfParser.getCapabilities();
      
      expect(capabilities).toHaveProperty('formats');
      expect(capabilities).toHaveProperty('features');
      expect(capabilities).toHaveProperty('limitations');
      expect(capabilities).toHaveProperty('performance');
      
      expect(capabilities.formats).toContain('pdf');
      expect(capabilities.features.textExtraction).toBe(true);
      expect(capabilities.features.metadataExtraction).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return parser statistics', () => {
      const stats = pdfParser.getStats();
      
      expect(stats).toHaveProperty('parserType');
      expect(stats).toHaveProperty('library');
      expect(stats).toHaveProperty('config');
      expect(stats).toHaveProperty('capabilities');
      
      expect(stats.parserType).toBe('PDF');
      expect(stats.library).toBe('pdf-parse');
    });
  });
});

describe('TextParser', () => {
  let textParser;

  beforeEach(() => {
    textParser = new TextParser({
      autoDetectEncoding: true,
      preserveFormatting: true
    });
  });

  describe('canParse', () => {
    it('should identify text content', () => {
      const textBuffer = Buffer.from('This is plain text content\nWith multiple lines');
      const binaryBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);
      
      expect(textParser.canParse(textBuffer)).toBe(true);
      expect(textParser.canParse(binaryBuffer)).toBe(false);
    });

    it('should handle UTF-8 content', () => {
      const utf8Buffer = Buffer.from('Hello 世界! 🌍', 'utf8');
      expect(textParser.canParse(utf8Buffer)).toBe(true);
    });

    it('should reject null bytes', () => {
      const nullByteBuffer = Buffer.from('Text with\x00null byte');
      expect(textParser.canParse(nullByteBuffer)).toBe(false);
    });
  });

  describe('parse', () => {
    it('should parse plain text successfully', async () => {
      const content = 'This is a test document\nWith multiple lines\nAnd some content.';
      const buffer = Buffer.from(content, 'utf8');
      
      const result = await textParser.parse(buffer, 'test.txt');
      
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('processingInfo');
      
      expect(result.content).toBe(content);
      expect(result.type).toBe('text');
      expect(result.metadata.encoding).toBe('utf8');
    });

    it('should detect markdown content', async () => {
      const markdownContent = '# Test Document\n\nThis is **bold** text with [links](http://example.com).\n\n## Section 2\n\n- List item 1\n- List item 2';
      const buffer = Buffer.from(markdownContent, 'utf8');
      
      const result = await textParser.parse(buffer, 'test.md');
      
      expect(result.type).toBe('markdown');
      expect(result.metadata.contentAnalysis.markdown).toBeDefined();
      expect(result.metadata.contentAnalysis.markdown.totalHeaders).toBeGreaterThan(0);
    });

    it('should handle BOM detection', async () => {
      // UTF-8 BOM
      const bomBuffer = Buffer.concat([
        Buffer.from([0xEF, 0xBB, 0xBF]), // UTF-8 BOM
        Buffer.from('Test content', 'utf8')
      ]);
      
      const result = await textParser.parse(bomBuffer, 'test.txt');
      
      expect(result.content).toBe('Test content');
      expect(result.metadata.encoding).toBe('utf8');
    });
  });

  describe('getCapabilities', () => {
    it('should return text parser capabilities', () => {
      const capabilities = textParser.getCapabilities();
      
      expect(capabilities.formats).toContain('text');
      expect(capabilities.formats).toContain('markdown');
      expect(capabilities.features.encodingDetection).toBe(true);
      expect(capabilities.features.markdownAnalysis).toBe(true);
    });
  });
});

describe('CSVParser', () => {
  let csvParser;

  beforeEach(() => {
    csvParser = new CSVParser({
      autoDetectDelimiter: true,
      outputFormat: 'structured'
    });
  });

  describe('canParse', () => {
    it('should identify CSV content', () => {
      const csvBuffer = Buffer.from('name,age,city\nJohn,25,NYC\nJane,30,LA');
      const textBuffer = Buffer.from('This is just plain text without delimiters');
      
      expect(csvParser.canParse(csvBuffer)).toBe(true);
      expect(csvParser.canParse(textBuffer)).toBe(false);
    });

    it('should handle different delimiters', () => {
      const semicolonCSV = Buffer.from('name;age;city\nJohn;25;NYC');
      const tabCSV = Buffer.from('name\tage\tcity\nJohn\t25\tNYC');
      
      expect(csvParser.canParse(semicolonCSV)).toBe(true);
      expect(csvParser.canParse(tabCSV)).toBe(true);
    });
  });

  describe('parse', () => {
    it('should parse CSV with headers successfully', async () => {
      const csvContent = 'name,age,city,country\nJohn,25,New York,USA\nJane,30,Los Angeles,USA\nBob,35,London,UK';
      const buffer = Buffer.from(csvContent, 'utf8');
      
      const result = await csvParser.parse(buffer, 'test.csv');
      
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('type', 'csv');
      expect(result).toHaveProperty('metadata');
      
      expect(result.metadata.structure.columnCount).toBe(4);
      expect(result.metadata.structure.rowCount).toBe(3);
      expect(result.metadata.structure.columns).toEqual(['name', 'age', 'city', 'country']);
      
      expect(result.content).toContain('CSV Data Structure');
      expect(result.content).toContain('Rows: 3');
      expect(result.content).toContain('Columns: 4');
    });

    it('should detect delimiter automatically', async () => {
      const semicolonCSV = 'name;age;city\nJohn;25;NYC\nJane;30;LA';
      const buffer = Buffer.from(semicolonCSV, 'utf8');
      
      const result = await csvParser.parse(buffer, 'test.csv');
      
      expect(result.metadata.delimiter).toBe(';');
    });

    it('should handle narrative output format', async () => {
      const narrativeParser = new CSVParser({ outputFormat: 'narrative' });
      const csvContent = 'name,age\nJohn,25\nJane,30';
      const buffer = Buffer.from(csvContent, 'utf8');
      
      const result = await narrativeParser.parse(buffer, 'test.csv');
      
      expect(result.content).toContain('CSV Data with 2 columns');
      expect(result.content).toContain('name, age');
      expect(result.content).toContain('Row 1:');
    });
  });

  describe('getCapabilities', () => {
    it('should return CSV parser capabilities', () => {
      const capabilities = csvParser.getCapabilities();
      
      expect(capabilities.formats).toContain('csv');
      expect(capabilities.features.delimiterDetection).toBe(true);
      expect(capabilities.features.statisticalAnalysis).toBe(true);
      expect(capabilities.features.multipleOutputFormats).toBe(true);
    });
  });
});

describe('URLFetcher', () => {
  let urlFetcher;

  beforeEach(() => {
    urlFetcher = new URLFetcher({
      timeout: 10000,
      retries: 1,
      userAgent: 'Test Agent'
    });
  });

  describe('getCapabilities', () => {
    it('should return URL fetcher capabilities', () => {
      const capabilities = urlFetcher.getCapabilities();
      
      expect(capabilities).toHaveProperty('protocols');
      expect(capabilities).toHaveProperty('contentTypes');
      expect(capabilities).toHaveProperty('features');
      expect(capabilities).toHaveProperty('limitations');
      
      expect(capabilities.protocols).toContain('http');
      expect(capabilities.protocols).toContain('https');
      expect(capabilities.contentTypes).toContain('html');
      expect(capabilities.features.redirectHandling).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return fetcher statistics', () => {
      const stats = urlFetcher.getStats();
      
      expect(stats).toHaveProperty('fetcherType');
      expect(stats).toHaveProperty('library');
      expect(stats).toHaveProperty('config');
      expect(stats).toHaveProperty('capabilities');
      
      expect(stats.fetcherType).toBe('HTTP/HTTPS');
      expect(stats.library).toBe('axios + cheerio');
      expect(stats.config.timeout).toBe(10000);
      expect(stats.config.retries).toBe(1);
    });
  });

  // Note: Actual URL fetching tests would require network access
  // In a real test environment, you might want to mock axios or use a test server
});

describe('Integration', () => {
  describe('FileProcessor with parsers', () => {
    it('should integrate all parsers correctly', () => {
      const fileProcessor = new FileProcessor();
      const supportedTypes = fileProcessor.getSupportedTypes();
      
      // Check that all expected parsers are registered
      const parserTypes = supportedTypes.parsers.map(p => p.parserClass);
      expect(parserTypes).toContain('PDFParser');
      expect(parserTypes).toContain('TextParser');
      expect(parserTypes).toContain('CSVParser');
      expect(parserTypes).toContain('EPUBParser');
      expect(parserTypes).toContain('DOCXParser');
      expect(parserTypes).toContain('HTMLParser');
    });

    it('should maintain consistent capabilities structure', () => {
      const fileProcessor = new FileProcessor();
      const supportedTypes = fileProcessor.getSupportedTypes();
      
      supportedTypes.parsers.forEach(parser => {
        expect(parser).toHaveProperty('mimeType');
        expect(parser).toHaveProperty('parserClass');
        expect(parser).toHaveProperty('capabilities');
        
        if (Object.keys(parser.capabilities).length > 0) {
          expect(parser.capabilities).toHaveProperty('formats');
          expect(parser.capabilities).toHaveProperty('features');
          expect(Array.isArray(parser.capabilities.formats)).toBe(true);
        }
      });
    });
  });
});