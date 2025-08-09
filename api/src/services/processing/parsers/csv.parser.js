/**
 * CSV Parser
 * Handles CSV file parsing using csv-parse library with intelligent format detection
 */

const { parse: csvParse } = require('csv-parse');
const { logPerformanceMetric, logError } = require('../../../utils/logger');

class CSVParser {
  constructor(config = {}) {
    this.config = {
      enableMetadataExtraction: config.enableMetadataExtraction !== false,
      autoDetectDelimiter: config.autoDetectDelimiter !== false,
      maxRows: config.maxRows || null, // No limit by default
      maxColumns: config.maxColumns || 1000,
      outputFormat: config.outputFormat || 'structured', // 'structured' or 'narrative'
      includeStatistics: config.includeStatistics !== false,
      sampleSize: config.sampleSize || 1000, // Rows to analyze for structure
      encoding: config.encoding || 'utf8'
    };

    this.logger = require('../../../utils/logger').createChildLogger({ 
      component: 'csv-parser' 
    });
  }

  /**
   * Parse CSV buffer and extract structured content
   * @param {Buffer} buffer - CSV file buffer
   * @param {string} filename - Original filename
   * @param {Object} options - Parsing options
   * @returns {Promise<Object>} Parsed content and metadata
   */
  async parse(buffer, filename, options = {}) {
    const startTime = Date.now();

    try {
      this.logger.debug('Starting CSV parsing', {
        filename,
        bufferSize: buffer.length,
        autoDetectDelimiter: this.config.autoDetectDelimiter,
        outputFormat: this.config.outputFormat
      });

      // Convert buffer to string
      const csvContent = buffer.toString(this.config.encoding);

      // Detect CSV format
      const formatInfo = await this._detectCSVFormat(csvContent);

      // Parse CSV with detected format
      const records = await this._parseCSVContent(csvContent, formatInfo);

      const duration = Date.now() - startTime;

      // Process records based on output format
      const content = this.config.outputFormat === 'narrative'
        ? this._convertToNarrative(records, formatInfo)
        : this._convertToStructured(records, formatInfo);

      // Build metadata
      const metadata = this._buildMetadata(records, formatInfo, filename, buffer);

      // Validate extraction
      this._validateExtraction(records, filename);

      logPerformanceMetric('csv_parsing', duration, 'ms', {
        filename: filename.substring(0, 50),
        rowCount: records.length,
        columnCount: formatInfo.columns?.length || 0,
        bufferSize: buffer.length
      });

      this.logger.info('CSV parsing completed successfully', {
        filename,
        duration,
        rowCount: records.length,
        columnCount: formatInfo.columns?.length || 0,
        delimiter: formatInfo.delimiter,
        outputFormat: this.config.outputFormat
      });

      return {
        content,
        type: 'csv',
        metadata,
        processingInfo: {
          parsingTime: duration,
          rowsProcessed: records.length,
          columnsDetected: formatInfo.columns?.length || 0,
          originalSize: buffer.length,
          contentSize: content.length,
          formatInfo
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logError(error, {
        operation: 'csv_parsing',
        filename,
        duration,
        bufferSize: buffer.length
      });

      // Provide more specific error messages
      if (error.message.includes('Invalid Record Length')) {
        throw new Error(`CSV has inconsistent number of columns: ${filename}`);
      } else if (error.message.includes('Quoted field not terminated')) {
        throw new Error(`CSV has malformed quoted fields: ${filename}`);
      }

      throw new Error(`CSV parsing failed for ${filename}: ${error.message}`);
    }
  }

  /**
   * Detect CSV format (delimiter, headers, etc.)
   * @private
   */
  async _detectCSVFormat(content) {
    const sampleLines = content.split('\n').slice(0, 10);
    const sampleContent = sampleLines.join('\n');

    // Detect delimiter
    const delimiter = this.config.autoDetectDelimiter 
      ? this._detectDelimiter(sampleContent)
      : ',';

    // Parse sample to determine structure
    try {
      const sampleRecords = await this._parseCSVContent(sampleContent, { 
        delimiter, 
        columns: true,
        skipEmptyLines: true
      });

      const columns = sampleRecords.length > 0 ? Object.keys(sampleRecords[0]) : [];
      
      return {
        delimiter,
        hasHeaders: columns.length > 0 && !columns.every(col => col.match(/^column\d+$/)),
        columns,
        estimatedRows: Math.max(content.split('\n').length - (columns.length > 0 ? 1 : 0), 0),
        encoding: this.config.encoding
      };

    } catch (error) {
      // Fallback format
      this.logger.warn('Failed to detect CSV format, using defaults', {
        error: error.message
      });

      return {
        delimiter: ',',
        hasHeaders: false,
        columns: [],
        estimatedRows: content.split('\n').length,
        encoding: this.config.encoding
      };
    }
  }

  /**
   * Detect CSV delimiter
   * @private
   */
  _detectDelimiter(sampleContent) {
    const delimiters = [',', ';', '\t', '|', ':'];
    const scores = {};

    delimiters.forEach(delimiter => {
      const lines = sampleContent.split('\n').slice(0, 5);
      const counts = lines.map(line => 
        (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length
      );

      // Score based on consistency and frequency
      const consistency = this._calculateConsistency(counts);
      const frequency = counts.reduce((sum, count) => sum + count, 0) / counts.length;
      
      scores[delimiter] = consistency * frequency;
    });

    // Return delimiter with highest score
    const bestDelimiter = Object.keys(scores).reduce((a, b) => 
      scores[a] > scores[b] ? a : b
    );

    this.logger.debug('Delimiter detection results', {
      scores,
      selectedDelimiter: bestDelimiter
    });

    return bestDelimiter;
  }

  /**
   * Calculate consistency score for delimiter counts
   * @private
   */
  _calculateConsistency(counts) {
    if (counts.length < 2) return 0;

    const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    const variance = counts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    // Return inverse of coefficient of variation (lower variation = higher consistency)
    return mean > 0 ? 1 / (1 + stdDev / mean) : 0;
  }

  /**
   * Parse CSV content with specified format
   * @private
   */
  async _parseCSVContent(content, formatInfo) {
    return new Promise((resolve, reject) => {
      const options = {
        delimiter: formatInfo.delimiter || ',',
        columns: formatInfo.hasHeaders !== false,
        skip_empty_lines: true,
        trim: true,
        max_record_size: 1000000, // 1MB per record
        relax_column_count: true, // Allow variable column counts
        relax_quotes: true, // Be lenient with quotes
        escape: '\\',
        quote: '"'
      };

      // Apply row limits
      if (this.config.maxRows) {
        options.to = this.config.maxRows + (formatInfo.hasHeaders ? 1 : 0);
      }

      csvParse(content, options, (err, records) => {
        if (err) {
          reject(err);
          return;
        }

        // Limit columns if configured
        if (this.config.maxColumns && records.length > 0) {
          const columnLimit = this.config.maxColumns;
          records = records.map(record => {
            if (Array.isArray(record)) {
              return record.slice(0, columnLimit);
            } else {
              const keys = Object.keys(record).slice(0, columnLimit);
              const limitedRecord = {};
              keys.forEach(key => {
                limitedRecord[key] = record[key];
              });
              return limitedRecord;
            }
          });
        }

        resolve(records);
      });
    });
  }

  /**
   * Convert CSV records to narrative text format
   * @private
   */
  _convertToNarrative(records, formatInfo) {
    if (!records || records.length === 0) {
      return 'Empty CSV file.';
    }

    let narrative = '';

    // Add file description
    const columns = formatInfo.columns || [];
    if (columns.length > 0) {
      narrative += `CSV Data with ${columns.length} columns: ${columns.join(', ')}\n\n`;
    } else {
      narrative += `CSV Data with ${records.length} rows\n\n`;
    }

    // Add data summary
    if (this.config.includeStatistics) {
      const stats = this._generateStatistics(records, columns);
      narrative += this._formatStatistics(stats) + '\n\n';
    }

    // Add sample data
    const sampleSize = Math.min(20, records.length);
    narrative += `Sample Data (first ${sampleSize} rows):\n\n`;

    records.slice(0, sampleSize).forEach((record, index) => {
      narrative += `Row ${index + 1}:\n`;
      
      if (Array.isArray(record)) {
        record.forEach((value, colIndex) => {
          const columnName = columns[colIndex] || `Column ${colIndex + 1}`;
          narrative += `  ${columnName}: ${this._formatValue(value)}\n`;
        });
      } else {
        Object.entries(record).forEach(([key, value]) => {
          narrative += `  ${key}: ${this._formatValue(value)}\n`;
        });
      }
      
      narrative += '\n';
    });

    // Add truncation notice if needed
    if (records.length > sampleSize) {
      narrative += `... and ${records.length - sampleSize} more rows\n`;
    }

    return narrative.trim();
  }

  /**
   * Convert CSV records to structured text format
   * @private
   */
  _convertToStructured(records, formatInfo) {
    if (!records || records.length === 0) {
      return 'Empty CSV file.';
    }

    let structured = '';

    // Add header information
    const columns = formatInfo.columns || [];
    structured += `=== CSV Data Structure ===\n`;
    structured += `Rows: ${records.length}\n`;
    structured += `Columns: ${columns.length}\n`;
    structured += `Delimiter: "${formatInfo.delimiter}"\n\n`;

    // Add column information
    if (columns.length > 0) {
      structured += `=== Columns ===\n`;
      columns.forEach((column, index) => {
        const sampleValues = records.slice(0, 5)
          .map(record => Array.isArray(record) ? record[index] : record[column])
          .filter(value => value !== null && value !== undefined && value !== '');
        
        structured += `${index + 1}. ${column}\n`;
        if (sampleValues.length > 0) {
          structured += `   Sample values: ${sampleValues.slice(0, 3).map(v => `"${v}"`).join(', ')}\n`;
        }
      });
      structured += '\n';
    }

    // Add statistics if enabled
    if (this.config.includeStatistics) {
      const stats = this._generateStatistics(records, columns);
      structured += `=== Statistics ===\n`;
      structured += this._formatStatistics(stats) + '\n\n';
    }

    // Add sample data in table format
    structured += `=== Sample Data ===\n`;
    const sampleRecords = records.slice(0, 10);
    
    if (columns.length > 0 && !Array.isArray(records[0])) {
      // Object format - create table
      structured += this._createTable(sampleRecords, columns);
    } else {
      // Array format - simple listing
      sampleRecords.forEach((record, index) => {
        structured += `Row ${index + 1}: ${Array.isArray(record) ? record.join(' | ') : JSON.stringify(record)}\n`;
      });
    }

    if (records.length > 10) {
      structured += `\n... and ${records.length - 10} more rows\n`;
    }

    return structured.trim();
  }

  /**
   * Create a simple table representation
   * @private
   */
  _createTable(records, columns) {
    if (records.length === 0) return 'No data\n';

    // Calculate column widths
    const colWidths = columns.map(col => {
      const values = records.map(record => String(record[col] || ''));
      return Math.max(col.length, ...values.map(v => v.length), 10);
    });

    let table = '';

    // Header
    table += '| ' + columns.map((col, i) => col.padEnd(colWidths[i])).join(' | ') + ' |\n';
    table += '|' + colWidths.map(w => '-'.repeat(w + 2)).join('|') + '|\n';

    // Data rows
    records.forEach(record => {
      const row = columns.map((col, i) => {
        const value = String(record[col] || '');
        return value.substring(0, colWidths[i]).padEnd(colWidths[i]);
      });
      table += '| ' + row.join(' | ') + ' |\n';
    });

    return table;
  }

  /**
   * Generate statistics for CSV data
   * @private
   */
  _generateStatistics(records, columns) {
    const stats = {
      totalRows: records.length,
      totalColumns: columns.length,
      columnAnalysis: {}
    };

    if (columns.length > 0 && records.length > 0) {
      columns.forEach(column => {
        const values = records
          .map(record => Array.isArray(record) ? record[columns.indexOf(column)] : record[column])
          .filter(value => value !== null && value !== undefined && value !== '');

        const nonEmptyCount = values.length;
        const emptyCount = records.length - nonEmptyCount;
        
        // Detect data type
        const numericValues = values.filter(v => !isNaN(parseFloat(v)) && isFinite(v));
        const isNumeric = numericValues.length > values.length * 0.8;
        
        stats.columnAnalysis[column] = {
          nonEmptyCount,
          emptyCount,
          uniqueCount: new Set(values).size,
          dataType: isNumeric ? 'numeric' : 'text',
          sampleValues: values.slice(0, 3)
        };

        if (isNumeric && numericValues.length > 0) {
          const numbers = numericValues.map(v => parseFloat(v));
          stats.columnAnalysis[column].min = Math.min(...numbers);
          stats.columnAnalysis[column].max = Math.max(...numbers);
          stats.columnAnalysis[column].average = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
        }
      });
    }

    return stats;
  }

  /**
   * Format statistics for display
   * @private
   */
  _formatStatistics(stats) {
    let formatted = `Total Rows: ${stats.totalRows}\n`;
    formatted += `Total Columns: ${stats.totalColumns}\n`;

    if (Object.keys(stats.columnAnalysis).length > 0) {
      formatted += '\nColumn Analysis:\n';
      Object.entries(stats.columnAnalysis).forEach(([column, analysis]) => {
        formatted += `  ${column}:\n`;
        formatted += `    Type: ${analysis.dataType}\n`;
        formatted += `    Non-empty: ${analysis.nonEmptyCount}\n`;
        formatted += `    Unique values: ${analysis.uniqueCount}\n`;
        
        if (analysis.dataType === 'numeric' && analysis.min !== undefined) {
          formatted += `    Range: ${analysis.min} to ${analysis.max}\n`;
          formatted += `    Average: ${Math.round(analysis.average * 100) / 100}\n`;
        }
      });
    }

    return formatted;
  }

  /**
   * Format a single value for display
   * @private
   */
  _formatValue(value) {
    if (value === null || value === undefined) {
      return '(empty)';
    }
    
    if (typeof value === 'string' && value.length > 100) {
      return value.substring(0, 100) + '...';
    }
    
    return String(value);
  }

  /**
   * Build metadata object
   * @private
   */
  _buildMetadata(records, formatInfo, filename, buffer) {
    const metadata = {
      format: 'CSV',
      filename: filename,
      originalSize: buffer.length,
      delimiter: formatInfo.delimiter,
      hasHeaders: formatInfo.hasHeaders,
      encoding: formatInfo.encoding
    };

    // Add structure information
    metadata.structure = {
      rowCount: records.length,
      columnCount: formatInfo.columns?.length || 0,
      columns: formatInfo.columns || [],
      estimatedDataSize: records.length * (formatInfo.columns?.length || 1)
    };

    // Add statistics if enabled
    if (this.config.includeStatistics && records.length > 0) {
      metadata.statistics = this._generateStatistics(records, formatInfo.columns || []);
    }

    return metadata;
  }

  /**
   * Validate extraction results
   * @private
   */
  _validateExtraction(records, filename) {
    if (!records || records.length === 0) {
      this.logger.warn('CSV parsing resulted in no records', { filename });
      return;
    }

    // Check for very wide tables
    const firstRecord = records[0];
    const columnCount = Array.isArray(firstRecord) 
      ? firstRecord.length 
      : Object.keys(firstRecord).length;

    if (columnCount > 100) {
      this.logger.warn('CSV has very many columns', {
        filename,
        columnCount,
        rowCount: records.length
      });
    }

    // Check for inconsistent structure
    const inconsistentRows = records.filter(record => {
      const currentCount = Array.isArray(record) 
        ? record.length 
        : Object.keys(record).length;
      return Math.abs(currentCount - columnCount) > 2;
    });

    if (inconsistentRows.length > records.length * 0.1) {
      this.logger.warn('CSV has inconsistent row structure', {
        filename,
        inconsistentRowCount: inconsistentRows.length,
        totalRows: records.length
      });
    }
  }

  /**
   * Get parser capabilities
   * @returns {Object} Parser capabilities and features
   */
  getCapabilities() {
    return {
      formats: ['csv'],
      features: {
        textExtraction: true,
        metadataExtraction: this.config.enableMetadataExtraction,
        structurePreservation: true,
        delimiterDetection: this.config.autoDetectDelimiter,
        statisticalAnalysis: this.config.includeStatistics,
        multipleOutputFormats: true,
        columnTypeDetection: true,
        dataValidation: true
      },
      limitations: {
        maxFileSize: '100MB',
        complexCellFormats: 'Limited support',
        embeddedCharts: 'Not supported',
        multipleSheets: 'Not applicable'
      },
      performance: {
        typicalSpeed: 'Very Fast',
        memoryUsage: 'Low'
      }
    };
  }

  /**
   * Get parser statistics
   * @returns {Object} Usage statistics
   */
  getStats() {
    return {
      parserType: 'CSV',
      library: 'csv-parse',
      config: {
        enableMetadataExtraction: this.config.enableMetadataExtraction,
        autoDetectDelimiter: this.config.autoDetectDelimiter,
        outputFormat: this.config.outputFormat,
        maxRows: this.config.maxRows,
        maxColumns: this.config.maxColumns
      },
      capabilities: this.getCapabilities()
    };
  }

  /**
   * Test if parser can handle the given buffer
   * @param {Buffer} buffer - File buffer to test
   * @returns {boolean} True if likely a CSV file
   */
  canParse(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return false;
    }

    try {
      // Check first few lines for CSV patterns
      const sample = buffer.toString('utf8', 0, Math.min(1000, buffer.length));
      const lines = sample.split('\n').slice(0, 5);
      
      // Look for common CSV patterns
      const hasDelimiters = lines.some(line => 
        line.includes(',') || line.includes(';') || line.includes('\t')
      );
      
      const hasConsistentStructure = lines.length > 1 && 
        this._calculateConsistency(
          lines.map(line => (line.match(/[,;\t]/g) || []).length)
        ) > 0.7;

      return hasDelimiters && (lines.length === 1 || hasConsistentStructure);
      
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
    this.logger.info('CSV parser configuration updated', {
      changedFields: Object.keys(newConfig)
    });
  }
}

module.exports = CSVParser;