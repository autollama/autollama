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
let openaiService = null;
let dbModule = null;

/**
 * Initialize chat routes with required services
 * @param {Object} services - Services container
 */
function initializeChatRoutes(services) {
  console.log('🚀 INITIALIZING CHAT ROUTES');
  
  // Use the working search service passed from index.js
  if (services.searchService) {
    console.log('✅ Using working search service from index.js');
    searchService = services.searchService;
  } else {
    console.log('❌ No search service provided, creating fallback');
    // Fallback to creating our own (shouldn't happen now)
    try {
      dbModule = require('../../database');
      console.log('✅ Database module loaded for chat routes');
      
      searchService = {
        hybridSearch: async ({ query, limit = 20, threshold = 0.01 }) => {
          console.log('🔍 FALLBACK HYBRID SEARCH called with:', { query, limit, threshold });
          const results = await dbModule.searchContent(query.trim(), limit);
          console.log('🔍 FALLBACK HYBRID SEARCH results:', { count: results?.length || 0 });
          return { results };
        }
      };
    } catch (error) {
      console.error('❌ Failed to create fallback search service:', error.message);
    }
  }
  
  vectorService = services.vectorService;
  database = services.database || dbModule; // Use the database from services
  openaiService = services.openaiService;
  
  logger.info('Chat routes initialized with services', {
    hasDatabase: !!database,
    hasSearchService: !!searchService,
    hasVectorService: !!vectorService,
    hasOpenAI: !!openaiService,
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
    
    console.log('🗨️ CHAT MESSAGE RECEIVED:', { message, model, ragEnabled });
    console.log('🗨️ CHAT MESSAGE Services available:', { 
      hasSearchService: !!searchService,
      hasOpenAI: !!openaiService,
      hasDatabase: !!database 
    });
    
    // Test if we can run search manually
    if (searchService) {
      console.log('🔍 Testing search service...');
      try {
        const testSearch = await searchService.hybridSearch({
          query: 'whale',
          limit: 2
        });
        console.log('🔍 Test search results:', {
          hasResults: !!testSearch,
          count: testSearch?.results?.length || 0
        });
      } catch (testError) {
        console.log('❌ Test search failed:', testError.message);
      }
    }
    
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
    if (ragEnabled) {
      try {
        console.log('🔍 RAG SEARCH: Starting search for:', message);
        
        // Use direct database search (guaranteed to work)
        const dbModule = require('../../database');
        const searchResults = await dbModule.searchContent(message.trim(), 5);
        
        console.log('🔍 RAG SEARCH: Results received:', {
          hasResults: !!searchResults,
          resultsCount: searchResults?.length || 0
        });
        
        if (searchResults && searchResults.length > 0) {
          // Extract relevant context from search results
          ragContext = searchResults
            .slice(0, 3)
            .map((result, index) => `[Context ${index + 1}]: ${result.chunk_text || result.content || result.text}`)
            .join('\n\n');

          // Prepare sources for response
          sources = searchResults.map(result => ({
            title: result.title || result.url || 'Unknown Source',
            url: result.url || '#',
            score: result.score || result.similarity || 0,
            snippet: (result.chunk_text || result.content || result.text || '').substring(0, 150) + '...'
          }));
          
          console.log('🔍 RAG SEARCH: Context prepared:', {
            contextLength: ragContext.length,
            sourcesCount: sources.length
          });
        }
      } catch (ragError) {
        console.log('⚠️ RAG search failed:', ragError.message);
      }
    } else {
      console.log('⚠️ RAG search skipped:', {
        ragEnabled,
        hasSearchService: !!searchService
      });
    }

    // Create enhanced system prompt
    const enhancedSystemContext = [
      systemContext || "You are AutoLlama's AI assistant. Use the provided context to give helpful, accurate responses.",
      ragContext ? `\n\nKnowledge Base Context:\n${ragContext}` : '',
      ragContext ? '\n\nPlease cite sources when using information from the context above.' : '',
      !ragContext ? '\n\nNo relevant context found in the knowledge base. Answer based on your general knowledge.' : ''
    ].filter(Boolean).join('');

    console.log('🤖 SYSTEM CONTEXT for OpenAI:', { 
      hasRagContext: !!ragContext,
      ragContextLength: ragContext?.length || 0,
      sourcesCount: sources.length,
      systemContextLength: enhancedSystemContext.length
    });

    // Generate AI response with context
    const aiResponse = await generateAIResponse(message, enhancedSystemContext, model);

    const response = {
      content: ragContext ? `🔍 RAG ACTIVE (${ragContext.length} chars): ${aiResponse}` : aiResponse,
      model,
      ragEnabled,
      sources: ragEnabled ? sources : [],
      timestamp: new Date().toISOString(),
      conversationId,
      metadata: {
        contextUsed: !!ragContext,
        sourceCount: sources.length,
        ragContextLength: ragContext?.length || 0,
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

    console.log('🔍 RAG SEARCH ENDPOINT HIT:', { query, limit, threshold });

    // Use the search service directly instead of HTTP calls
    const searchResults = await searchService.hybridSearch({
      query: query,
      limit: parseInt(limit),
      threshold: parseFloat(threshold)
    });
    const results = searchResults;

    console.log('🔍 RAG SEARCH ENDPOINT RESULTS:', { 
      hasResults: !!results,
      count: results?.results?.length || 0 
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
 * Generate AI response using OpenAI API
 */
async function generateAIResponse(message, systemContext, model) {
  if (!openaiService || !openaiService.isReady()) {
    logger.warn('OpenAI service not available for chat', {
      hasService: !!openaiService,
      isReady: openaiService ? openaiService.isReady() : false
    });
    return "I'm having trouble connecting to the AI service right now. Please check that your OpenAI API key is configured correctly in your environment variables.";
  }

  try {
    const startTime = Date.now();
    
    const response = await openaiService.openaiClient.chat.completions.create({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemContext },
        { role: 'user', content: message }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    const duration = Date.now() - startTime;
    const aiResponse = response.choices[0].message.content.trim();

    logger.info('AI response generated successfully', {
      model,
      duration,
      messageLength: message.length,
      responseLength: aiResponse.length,
      tokensUsed: response.usage?.total_tokens || 0
    });

    return aiResponse;

  } catch (error) {
    logger.error('Failed to generate AI response', {
      error: error.message,
      model,
      messageLength: message.length
    });

    // Fallback for specific query types
    const isRecentUploadsQuery = /recent\s+upload|latest\s+document|newest\s+file|recently\s+added/i.test(message);
    
    if (isRecentUploadsQuery) {
      try {
        const db = dbModule || require('../../database');
        const query = `
          SELECT title, summary, created_time, url 
          FROM processed_content 
          WHERE record_type != 'document'
          ORDER BY created_time DESC 
          LIMIT 5
        `;
        const result = await db.pool.query(query);
        const recentDocs = result.rows || [];
        
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

        return `Here are your recent uploads:\n\n${recentSummary}\n\nWould you like me to elaborate on any specific document?`;
      } catch (dbError) {
        logger.error('Failed to fetch recent uploads as fallback', { error: dbError.message });
      }
    }

    return `I encountered an error while processing your request: ${error.message}. Please try again or check that your OpenAI API key is configured correctly.`;
  }
}

module.exports = {
  router,
  initializeChatRoutes
};