/**
 * Documents Routes
 * Handles document retrieval and search endpoints
 */

const express = require('express');

/**
 * Route definitions for document management:
 * 
 * GET /documents - Get all documents with pagination
 * GET /documents/:id - Get specific document
 * GET /documents/:id/chunks - Get document chunks
 * GET /documents/search - Search documents
 * DELETE /documents/:id - Delete document
 */

/**
 * Create document routes with dependency injection
 * @param {Object} services - Injected services (storageService, searchService, etc.)
 * @returns {express.Router} Configured router
 */
function createRoutes(services = {}) {
  const router = express.Router();
  
  // Extract services with defaults
  const {
    storageService = {
      query: async (sql, params) => {
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        try {
          const result = await pool.query(sql, params);
          await pool.end();
          return result;
        } catch (error) {
          await pool.end();
          throw error;
        }
      },
      getDocuments: async () => ({ rows: [] }),
      getDocumentChunks: async (id, options = {}) => {
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        try {
          const { limit = 50, offset = 0 } = options;
          const result = await pool.query(`
            SELECT 
              chunk_id, chunk_text, chunk_index, main_topics,
              sentiment, technical_level, contextual_summary
            FROM processed_content 
            WHERE (id = $1 OR url = $1) AND record_type = 'chunk'
            ORDER BY chunk_index
            LIMIT $2 OFFSET $3
          `, [id, limit, offset]);
          await pool.end();
          return result;
        } catch (error) {
          await pool.end();
          throw error;
        }
      },
      deleteDocument: async (id) => {
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        try {
          const result = await pool.query('DELETE FROM processed_content WHERE id = $1 OR url = $1', [id]);
          await pool.end();
          return result;
        } catch (error) {
          await pool.end();
          throw error;
        }
      }
    },
    searchService = {
      searchDocuments: async () => ({ results: [] }),
      hybridSearch: async () => ({ results: [] })
    }
  } = services;

  // Get all documents with pagination
  router.get('/documents', async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        sortBy = 'created_time', 
        sortOrder = 'desc',
        q: searchQuery 
      } = req.query;
      
      const offset = (page - 1) * limit;
      
      let whereClause = "WHERE record_type = 'document'";
      let params = [parseInt(limit), offset];
      
      if (searchQuery) {
        whereClause += " AND (title ILIKE $3 OR summary ILIKE $3)";
        params.push(`%${searchQuery}%`);
      }
      
      const result = await storageService.query(`
        SELECT 
          id, url, title, summary, created_time, updated_at,
          document_type, main_topics, technical_level
        FROM processed_content 
        ${whereClause}
        ORDER BY ${sortBy} ${sortOrder.toUpperCase()}
        LIMIT $1 OFFSET $2
      `, params);
      
      // Get total count for pagination
      const countResult = await storageService.query(`
        SELECT COUNT(*) as total 
        FROM processed_content 
        ${whereClause}
      `, searchQuery ? [`%${searchQuery}%`] : []);
      
      res.json({
        success: true,
        documents: result.rows,
        pagination: { 
          page: parseInt(page), 
          limit: parseInt(limit), 
          offset,
          total: parseInt(countResult.rows[0].total)
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get specific document
  router.get('/documents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await storageService.query(
        'SELECT * FROM processed_content WHERE id = $1 OR url = $1',
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }
      
      res.json({
        success: true,
        document: result.rows[0]
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get document chunks
  router.get('/documents/:id/chunks', async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 50 } = req.query;
      
      const offset = (page - 1) * limit;
      
      const result = await storageService.getDocumentChunks(id, {
        limit: parseInt(limit),
        offset
      });
      
      res.json({
        success: true,
        chunks: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.totalCount || result.rows.length
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Search documents
  router.get('/documents/search', async (req, res) => {
    try {
      const { 
        q: query,
        type = 'hybrid',
        limit = 20,
        threshold = 0.7,
        includeChunks = false
      } = req.query;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Query parameter "q" is required'
        });
      }
      
      let results;
      
      if (type === 'hybrid') {
        results = await searchService.hybridSearch({
          query,
          limit: parseInt(limit),
          threshold: parseFloat(threshold),
          includeChunks: includeChunks === 'true'
        });
      } else {
        results = await searchService.searchDocuments({
          query,
          limit: parseInt(limit),
          threshold: parseFloat(threshold)
        });
      }
      
      res.json({
        success: true,
        query,
        searchType: type,
        results: results.results || results,
        metadata: {
          totalResults: results.results ? results.results.length : results.length,
          searchTime: results.searchTime || 0,
          threshold
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Update document metadata
  router.put('/documents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const result = await storageService.query(
        'UPDATE processed_content SET title = $1, updated_at = NOW() WHERE id = $2 OR url = $2 RETURNING *',
        [updateData.title || 'Updated Document', id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }
      
      res.json({
        success: true,
        document: result.rows[0]
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get document statistics
  router.get('/documents/:id/stats', async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await storageService.query(`
        SELECT 
          COUNT(*) as total_chunks,
          AVG(LENGTH(chunk_text)) as avg_chunk_size,
          COUNT(CASE WHEN main_topics IS NOT NULL THEN 1 END) as analyzed_chunks,
          COUNT(CASE WHEN uses_contextual_embedding = true THEN 1 END) as embedded_chunks
        FROM processed_content 
        WHERE (id = $1 OR url = $1) AND record_type = 'chunk'
      `, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }
      
      res.json({
        success: true,
        documentId: id,
        stats: result.rows[0]
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Reprocess document
  router.post('/documents/:id/reprocess', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if document exists
      const docResult = await storageService.query(
        'SELECT * FROM processed_content WHERE id = $1 OR url = $1 LIMIT 1',
        [id]
      );
      
      if (docResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }
      
      // Mark for reprocessing (simplified implementation)
      const result = await storageService.query(
        'UPDATE processed_content SET processing_status = $1, updated_at = NOW() WHERE id = $2 OR url = $2',
        ['queued', id]
      );
      
      res.json({
        success: true,
        message: 'Document queued for reprocessing',
        documentId: id
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Delete document
  router.delete('/documents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await storageService.deleteDocument(id);
      
      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Document deleted successfully',
        deletedId: id
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}

// Default router for backward compatibility
const router = createRoutes();

module.exports = router;
module.exports.createRoutes = createRoutes;