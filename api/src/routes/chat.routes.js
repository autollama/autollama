/**
 * Chat Routes - RAG-powered AI assistant
 * Provides conversational interface with knowledge base integration
 */

const express = require('express');
const { logger } = require('../utils/logger');

const router = express.Router();

// Initialize with services
let searchService = null;
let vectorService = null;
let database = null;

/**
 * Initialize chat routes with required services
 * @param {Object} services - Services container
 */
function initializeChatRoutes(services) {
  // Use the search service adapter from search routes
  searchService = {
    hybridSearch: async ({ query, limit = 20, threshold = 0.7 }) => {
      const results = await services.database.searchContent(query.trim(), limit);
      return { results };
    },
    vectorSearch: async ({ query, limit = 20, threshold = 0.7 }) => {
      const results = await services.database.searchContent(query.trim(), limit);
      return { results };
    }
  };
  
  vectorService = services.vectorService;
  database = services.storageService || services.database || services.databasePool;
  
  logger.info('Chat routes initialized with services', {
    hasDatabase: !!database,
    hasSearchService: !!searchService,
    hasVectorService: !!vectorService,
    serviceKeys: Object.keys(services),
    databaseServiceType: services.database ? services.database.constructor.name : 'none'
  });
}

/**
 * Send message and get AI response with RAG
 * POST /chat/message
 */
router.post('/message', async (req, res) => {
  try {
    const { message, model = 'gpt-4o-mini', ragEnabled = true, conversationId, systemContext } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({
        error: 'Message is required',
        timestamp: new Date().toISOString()
      });
    }

    logger.info('Processing chat message', { 
      messageLength: message.length,
      model,
      ragEnabled,
      conversationId: conversationId ? conversationId.substring(0, 8) : null
    });

    let ragContext = '';
    let sources = [];

    // Perform RAG search if enabled
    if (ragEnabled && searchService) {
      try {
        const searchResults = await searchService.hybridSearch({
          query: message,
          limit: 5,
          threshold: 0.3
        });

        if (searchResults && searchResults.results && searchResults.results.length > 0) {
          // Extract relevant context from search results
          ragContext = searchResults.results
            .slice(0, 3)
            .map((result, index) => `[Context ${index + 1}]: ${result.content || result.text}`)
            .join('\n\n');

          // Prepare sources for response
          sources = searchResults.results.map(result => ({
            title: result.title || result.url || 'Unknown Source',
            url: result.url || '#',
            score: result.score || result.similarity || 0,
            snippet: (result.content || result.text || '').substring(0, 150) + '...'
          }));
        }
      } catch (ragError) {
        logger.warn('RAG search failed, continuing without context', { error: ragError.message });
      }
    }

    // Create enhanced system prompt
    const enhancedSystemContext = [
      systemContext || "You are AutoLlama's AI assistant. Use the provided context to give helpful, accurate responses.",
      ragContext ? `\n\nKnowledge Base Context:\n${ragContext}` : '',
      ragContext ? '\n\nPlease cite sources when using information from the context above.' : '',
      !ragContext ? '\n\nNo relevant context found in the knowledge base. Answer based on your general knowledge.' : ''
    ].filter(Boolean).join('');

    // Simulate AI response (replace with actual OpenAI call)
    const aiResponse = await generateAIResponse(message, enhancedSystemContext, model);

    const response = {
      content: aiResponse,
      model,
      ragEnabled,
      sources: ragEnabled ? sources : [],
      timestamp: new Date().toISOString(),
      conversationId,
      metadata: {
        contextUsed: !!ragContext,
        sourceCount: sources.length,
        model
      }
    };

    res.json(response);

  } catch (error) {
    logger.error('Chat message processing failed', { 
      error: error.message,
      stack: error.stack 
    });

    res.status(500).json({
      error: 'Failed to process chat message',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get conversation by ID
 * GET /chat/conversation/:conversationId
 */
router.get('/conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // For now, return empty conversation (implement conversation storage later)
    res.json({
      id: conversationId,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get conversation', { error: error.message });
    res.status(500).json({
      error: 'Failed to retrieve conversation',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get all conversations
 * GET /chat/conversations
 */
router.get('/conversations', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    // For now, return empty list (implement conversation storage later)
    res.json({
      conversations: [],
      totalCount: 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    logger.error('Failed to get conversations', { error: error.message });
    res.status(500).json({
      error: 'Failed to retrieve conversations',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Delete conversation
 * DELETE /chat/conversation/:conversationId
 */
router.delete('/conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // For now, just return success (implement conversation storage later)
    res.json({
      success: true,
      deletedConversationId: conversationId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to delete conversation', { error: error.message });
    res.status(500).json({
      error: 'Failed to delete conversation',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get chat statistics
 * GET /chat/stats
 */
router.get('/stats', async (req, res) => {
  try {
    // Basic stats (enhance when conversation storage is implemented)
    const stats = {
      totalConversations: 0,
      totalMessages: 0,
      avgMessagesPerConversation: 0,
      modelsUsed: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
      ragEnabled: true,
      timestamp: new Date().toISOString()
    };

    res.json(stats);

  } catch (error) {
    logger.error('Failed to get chat stats', { error: error.message });
    res.status(500).json({
      error: 'Failed to retrieve chat statistics',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * RAG search endpoint
 * POST /chat/rag-search
 */
router.post('/rag-search', async (req, res) => {
  try {
    const { query, limit = 5, threshold = 0.3 } = req.body;
    
    if (!query || !query.trim()) {
      return res.status(400).json({
        error: 'Query is required',
        timestamp: new Date().toISOString()
      });
    }

    if (!searchService) {
      return res.status(503).json({
        error: 'Search service not available',
        timestamp: new Date().toISOString()
      });
    }

    const results = await searchService.hybridSearch({
      query: query.trim(),
      limit: parseInt(limit),
      threshold: parseFloat(threshold)
    });

    res.json({
      query,
      results: results.results || [],
      totalFound: results.results ? results.results.length : 0,
      threshold,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('RAG search failed', { error: error.message });
    res.status(500).json({
      error: 'RAG search failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Pipeline query endpoint (for compatibility)
 * POST /chat/pipeline
 */
router.post('/pipeline', async (req, res) => {
  try {
    const { query, ...options } = req.body;
    
    // Redirect to message endpoint
    req.body = {
      message: query,
      ...options
    };
    
    // Forward to message handler
    return router.post('/message', req, res);

  } catch (error) {
    logger.error('Pipeline query failed', { error: error.message });
    res.status(500).json({
      error: 'Pipeline query failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get pipeline status
 * GET /chat/pipeline/status
 */
router.get('/pipeline/status', async (req, res) => {
  try {
    const status = {
      available: true,
      ragEnabled: !!searchService,
      vectorService: !!vectorService,
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
      timestamp: new Date().toISOString()
    };

    res.json(status);

  } catch (error) {
    logger.error('Failed to get pipeline status', { error: error.message });
    res.status(500).json({
      error: 'Failed to retrieve pipeline status',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Generate AI response (mock implementation)
 * Replace this with actual OpenAI API calls
 */
async function generateAIResponse(message, systemContext, model) {
  // Check if this is asking about recent uploads
  const isRecentUploadsQuery = /recent\s+upload|latest\s+document|newest\s+file|recently\s+added/i.test(message);
  
  if (isRecentUploadsQuery) {
    try {
      logger.info('Attempting to fetch recent uploads', {
        hasDatabase: !!database,
        databaseType: database ? database.constructor.name : 'none',
        hasMethods: database ? Object.getOwnPropertyNames(database) : []
      });
      
      if (database && database.pool) {
        // Query recent documents directly using the database pool
        const query = `
          SELECT title, summary, created_time, url 
          FROM processed_content 
          ORDER BY created_time DESC 
          LIMIT 5
        `;
        const result = await database.pool.query(query);
        const recentDocs = result.rows || [];
        
        logger.info('Retrieved recent uploads', { count: recentDocs.length });
        
        if (recentDocs.length === 0) {
          return "I don't see any recent uploads in your knowledge base yet. Try uploading some documents first using the Upload tab or by providing URLs to process.";
        }

        const recentSummary = recentDocs
          .slice(0, 5)
          .map((doc, index) => {
            const date = doc.created_time ? new Date(doc.created_time).toLocaleDateString() : 'Unknown date';
            return `${index + 1}. **${doc.title || 'Untitled'}** (${date})\n   ${doc.summary || 'No summary available'}`;
          })
          .join('\n\n');

        return `Here are your recent uploads:\n\n${recentSummary}\n\nWould you like me to elaborate on any specific document or help you search for something within these uploads?`;
      } else {
        logger.warn('Database not available or missing getSmartContentMix method', {
          hasDatabase: !!database,
          hasMethod: database ? !!database.getSmartContentMix : false
        });
      }
    } catch (error) {
      logger.warn('Failed to fetch recent uploads for chat', { error: error.message, stack: error.stack });
    }
    
    return "I'd be happy to help you with your recent uploads, but I'm having trouble accessing your knowledge base right now. Please try again, or check if you have any documents processed in your dashboard.";
  }

  // Default responses based on context
  if (systemContext && systemContext.includes('Knowledge Base Context:')) {
    return `Based on your knowledge base, I can see relevant information about "${message}". The context provided helps me understand your specific documents and content. 

I can help you explore this topic further or search for related information in your processed documents. What specific aspect would you like me to focus on?`;
  }

  // Generic helpful responses
  const helpfulResponses = [
    "I'm here to help you explore and understand your processed documents. What specific information are you looking for?",
    "I can help you search through your knowledge base and find relevant information. What would you like to know more about?",
    "Let me help you find information from your processed documents. Can you be more specific about what you're looking for?",
    "I'm your AutoLlama AI assistant, ready to help you navigate your knowledge base. What can I help you discover today?"
  ];

  return helpfulResponses[Math.floor(Math.random() * helpfulResponses.length)];
}

module.exports = {
  router,
  initializeChatRoutes
};