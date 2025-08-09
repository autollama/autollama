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
      query: async () => ({ rows: [] }),
      getDocuments: async () => ({ rows: [] }),
      getDocumentChunks: async () => ({ rows: [] }),
      deleteDocument: async () => ({ rowCount: 0 })
    },
    searchService = {
      searchDocuments: async () => ({ results: [] }),
      hybridSearch: async () => ({ results: [] })
    }
  } = services;

  // Get all documents with pagination
  router.get('/documents', async (req, res) => {
    console.log('🔥🔥🔥 DOCUMENTS.ROUTES.JS HIT!!! This is the separate documents router!');
    res.json({
      success: true,
      documents: [{ source: "documents.routes.js", message: "This is the separate documents router!" }],
      pagination: { limit: 20, offset: 0, total: 1 }
    });
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