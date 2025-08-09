/**
 * Search & Retrieval Routes
 * Handles search, documents, and data retrieval endpoints
 */

const express = require('express');
const db = require('../../database'); // Add direct database access for fallback

/**
 * Route definitions for search and retrieval:
 * 
 * GET /search - Main search endpoint
 * GET /search/grouped - Grouped search results
 * GET /documents - List all documents
 * GET /document-chunks - Get document chunks
 * GET /document/[id]/chunks - Get chunks for specific document
 * GET /document/:encodedUrl/summary - Get document summary
 * GET /chunks - List all chunks
 * GET /record - Get specific record
 * GET /recent-records - Get recent records
 * GET /qdrant/activity - Qdrant activity monitoring
 * GET /database/stats - Database statistics
 */

/**
 * Create search routes with dependency injection
 * @param {Object} services - Injected services (searchService, storageService, etc.)
 * @returns {express.Router} Configured router
 */
function createRoutes(services = {}) {
  const router = express.Router();
  
  // Service injection validation
  if (!services.searchService) {
    console.warn('⚠️ No searchService provided, using fallback implementation');
  }
  
  // Extract services with defaults (using direct database access as fallback)
  const {
    searchService = {
      search: async ({ query, limit = 20 }) => {
        const results = await db.searchContent(query.trim(), limit);
        return { results };
      },
      vectorSearch: async ({ query, limit = 20 }) => {
        const results = await db.searchContent(query.trim(), limit);
        return { results };
      },
      hybridSearch: async ({ query, limit = 20 }) => {
        const results = await db.searchContent(query.trim(), limit);
        return { results };
      },
      groupedSearch: async ({ query, limit = 20 }) => {
        const results = await db.searchContentGrouped(query.trim(), limit);
        return { groups: results };
      }
    },
    storageService = {
      query: async () => ({ rows: [] }),
      getDocuments: async () => ({ rows: [] }),
      getChunks: async () => ({ rows: [] }),
      getDocumentChunks: async () => ({ rows: [] }),
      getDatabaseStats: async () => ({ stats: {} })
    },
    vectorService = {
      getSimilarChunks: async () => ({ results: [] }),
      getActivity: async () => ({ activity: [] })
    }
  } = services;

  // Main search endpoint
  router.get('/search', async (req, res) => {
    try {
      
      const { 
        q: query,
        limit = 20,
        offset = 0,
        includeChunks = false,
        threshold = 0.7,
        type = 'hybrid'
      } = req.query;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Query parameter "q" is required'
        });
      }
      
      if (query.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Query must be at least 2 characters long'
        });
      }
      
      let results;
      
      if (type === 'hybrid') {
        results = await searchService.hybridSearch({
          query,
          limit: parseInt(limit),
          offset: parseInt(offset),
          includeChunks: includeChunks === 'true',
          threshold: parseFloat(threshold)
        });
      } else if (type === 'vector') {
        results = await searchService.vectorSearch({
          query,
          limit: parseInt(limit),
          threshold: parseFloat(threshold)
        });
      } else {
        results = await searchService.search({
          query,
          limit: parseInt(limit),
          offset: parseInt(offset)
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
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: results.hasMore || false
          }
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

  // Vector similarity search endpoint
  router.post('/search/vector', async (req, res) => {
    try {
      const { query, limit = 20, threshold = 0.7 } = req.body;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Query is required in request body'
        });
      }
      
      const results = await searchService.vectorSearch({
        query,
        limit: parseInt(limit),
        threshold: parseFloat(threshold)
      });
      
      res.json({
        success: true,
        query,
        searchType: 'vector',
        results: results.results || results,
        metadata: {
          totalResults: results.results ? results.results.length : results.length,
          searchTime: results.searchTime || 0,
          threshold: parseFloat(threshold)
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

  // Grouped search results
  router.get('/search/grouped', async (req, res) => {
    try {
      const { q: query, limit = 20 } = req.query;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Query parameter "q" is required'
        });
      }
      
      const results = await searchService.groupedSearch({
        query,
        limit: parseInt(limit)
      });
      
      res.json({
        success: true,
        query,
        groups: results.groups || [],
        metadata: {
          totalGroups: results.groups ? results.groups.length : 0,
          searchTime: results.searchTime || 0
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

  // Document search
  router.get('/search/documents', async (req, res) => {
    try {
      const { q: query, limit = 20, filter } = req.query;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Query parameter "q" is required'
        });
      }
      
      const results = await storageService.searchDocuments({
        query,
        limit: parseInt(limit),
        filter
      });
      
      res.json({
        success: true,
        query,
        documents: results.rows || results,
        metadata: {
          totalResults: results.rows ? results.rows.length : results.length
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

  // Similar chunks endpoint
  router.get('/search/similar/:chunkId', async (req, res) => {
    try {
      const { chunkId } = req.params;
      const { limit = 10, threshold = 0.7 } = req.query;
      
      if (!chunkId || chunkId.length < 3) {
        return res.status(400).json({
          success: false,
          error: 'Valid chunk ID is required'
        });
      }
      
      const results = await vectorService.getSimilarChunks({
        chunkId,
        limit: parseInt(limit),
        threshold: parseFloat(threshold)
      });
      
      if (!results || results.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Chunk not found or no similar chunks available'
        });
      }
      
      res.json({
        success: true,
        chunkId,
        similarChunks: results.results || results,
        metadata: {
          totalResults: results.results ? results.results.length : results.length,
          threshold: parseFloat(threshold)
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

  // Test route to verify router is working
  router.get('/documents-test', async (req, res) => {
    console.log('🔥 /documents-test route hit! This router IS working!');
    res.json({ message: "Router is working!" });
  });

  // List all documents - RESTORED ORIGINAL VERSION (DON'T BREAK THE API!)
  router.get('/documents', async (req, res) => {
    try {
      const { limit = 20, offset = 0, sortBy = 'created_time' } = req.query;
      
      if (!storageService || !storageService.getDocuments) {
        return res.json({
          success: true,
          documents: [{ error: "storageService not available" }],
          pagination: { limit: parseInt(limit), offset: parseInt(offset), total: 0 }
        });
      }
      
      const results = await storageService.getDocuments({
        limit: parseInt(limit),
        offset: parseInt(offset),
        sortBy
      });
      
      res.json({
        success: true,
        documents: results.rows || results,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: results.totalCount || results.length
        }
      });
      
    } catch (error) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch documents',
        details: error.message 
      });
    }
  });


  // Get document chunks - ENABLED as fallback since server.js route registration fails
  router.get('/document-chunks', async (req, res) => {
    console.log('🟡 MODULAR route handling /api/document-chunks (fallback)');
    try {
      const url = req.query.url;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 100;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL parameter is required'
        });
      }
      
      // Use direct database import since storageService adapter is unreliable
      const database = require('../../database');
      console.log('🟡 Using direct database import for getDocumentChunks');
      
      const result = await database.getDocumentChunks(url, page, limit);
      
      console.log('🟡 Modular route successfully got chunks:', result.chunks.length);
      
      res.json({
        success: true,
        chunks: result.chunks,
        pagination: result.pagination
      });
      
    } catch (error) {
      console.error('🟡 Modular route error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get chunks for specific document
  router.get('/document/:id/chunks', async (req, res) => {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      const results = await storageService.getDocumentChunks(id, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      res.json({
        success: true,
        documentId: id,
        chunks: results.rows || results,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: results.totalCount || results.length
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

  // Get document summary
  router.get('/document/:encodedUrl/summary', async (req, res) => {
    try {
      const { encodedUrl } = req.params;
      const url = decodeURIComponent(encodedUrl);
      
      const result = await storageService.query(
        'SELECT title, summary, created_time, updated_at FROM processed_content WHERE url = $1',
        [url]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }
      
      res.json({
        success: true,
        url,
        summary: result.rows[0]
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // List all chunks
  router.get('/chunks', async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;
      
      const results = await storageService.getChunks({
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      res.json({
        success: true,
        chunks: results.rows || results,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: results.totalCount || results.length
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

  // Get specific record
  router.get('/record', async (req, res) => {
    try {
      const { id, url } = req.query;
      
      if (!id && !url) {
        return res.status(400).json({
          success: false,
          error: 'Either id or url parameter is required'
        });
      }
      
      const query = id ? 
        'SELECT * FROM processed_content WHERE id = $1' :
        'SELECT * FROM processed_content WHERE url = $1';
      const params = [id || url];
      
      const result = await storageService.query(query, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Record not found'
        });
      }
      
      res.json({
        success: true,
        record: result.rows[0]
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get recent records
  router.get('/recent-records', async (req, res) => {
    try {
      const { limit = 10 } = req.query;
      
      const result = await storageService.query(
        'SELECT * FROM processed_content ORDER BY created_time DESC LIMIT $1',
        [parseInt(limit)]
      );
      
      res.json({
        success: true,
        records: result.rows,
        count: result.rows.length
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Qdrant activity monitoring
  router.get('/qdrant/activity', async (req, res) => {
    try {
      const activity = await vectorService.getActivity();
      
      res.json({
        success: true,
        activity: activity.activity || [],
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Database statistics (PostgreSQL + Qdrant)
  router.get('/database/stats', async (req, res) => {
    try {
      const db = require('../../database');
      const [pgStats, qdrantStats] = await Promise.all([
        db.getDatabaseStats(),
        // Get Qdrant statistics with fallback for errors
        vectorService.getCollectionStats ? 
          vectorService.getCollectionStats().catch(error => ({
            vector_count: 0,
            estimated_size_mb: 'Unknown',
            status: 'error',
            error: error.message
          })) :
          Promise.resolve({
            vector_count: 0,
            estimated_size_mb: 'Unknown',
            status: 'not_available'
          })
      ]);

      // Combine PostgreSQL and Qdrant statistics
      const combinedStats = {
        ...pgStats,
        qdrant: qdrantStats
      };
      
      res.json({
        success: true,
        stats: combinedStats,
        timestamp: new Date().toISOString()
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