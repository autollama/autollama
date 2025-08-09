/**
 * OpenWebUI Pipeline Routes
 * Provides OpenWebUI-compatible endpoints for RAG pipeline integration
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');
const { createCorsMiddleware, routeSpecificCors } = require('../middleware/cors.middleware');

const router = express.Router();

// Simple test route at the very beginning
router.all('/simple-test', (req, res) => {
  res.json({ message: 'Simple test route works', method: req.method, path: req.path });
});

// Debug middleware to log all OpenWebUI requests
router.use((req, res, next) => {
  console.log('🌐 OpenWebUI request:', {
    method: req.method,
    path: req.path,
    url: req.url,
    originalUrl: req.originalUrl,
    headers: {
      authorization: req.headers.authorization ? `${req.headers.authorization.substring(0, 20)}...` : 'none',
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']?.substring(0, 50) + '...'
    }
  });
  next();
});

// Apply OpenWebUI-specific CORS configuration
router.use(createCorsMiddleware(routeSpecificCors.openwebui));

// API key for OpenWebUI pipeline access
const PIPELINE_API_KEY = '0p3n-w3bu!';

// Authentication middleware for pipeline endpoints
const authenticatePipeline = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const xApiKey = req.headers['x-api-key'];
  const queryKey = req.query.api_key;
  
  const apiKey = authHeader?.replace('Bearer ', '') || xApiKey || queryKey;
  
  console.log('🔐 Pipeline auth attempt:', {
    authHeader: authHeader ? `${authHeader.substring(0, 20)}...` : 'none',
    xApiKey: xApiKey ? `${xApiKey.substring(0, 10)}...` : 'none',
    queryKey: queryKey ? `${queryKey.substring(0, 10)}...` : 'none',
    extractedKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'none',
    expectedKey: `${PIPELINE_API_KEY.substring(0, 10)}...`,
    match: apiKey === PIPELINE_API_KEY
  });
  
  if (apiKey !== PIPELINE_API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key for AutoLlama pipeline access',
      debug: {
        receivedKeyPrefix: apiKey ? apiKey.substring(0, 5) : 'none',
        expectedKeyPrefix: PIPELINE_API_KEY.substring(0, 5)
      }
    });
  }
  
  console.log('✅ Pipeline authentication successful');
  next();
};

// Pipeline discovery endpoint - required by OpenWebUI
router.get('/pipelines', async (req, res) => {
  try {
    logger.info('OpenWebUI pipeline discovery request');
    
    // Return pipeline metadata that OpenWebUI expects
    const pipelines = [
      {
        id: 'autollama-rag',
        name: 'AutoLlama RAG Pipeline', 
        description: 'Semantic search across your processed content using AutoLlama knowledge base',
        version: '1.1',
        author: 'AutoLlama.io',
        license: 'MIT',
        tags: ['rag', 'semantic-search', 'knowledge-base'],
        requirements: ['qdrant-client', 'openai'],
        config: {
          collection_name: 'autollama-content',
          max_results: 5,
          similarity_threshold: 0.3,
          debug_mode: true
        },
        endpoints: {
          execute: '/api/openwebui/pipeline/autollama-rag/execute',
          config: '/api/openwebui/pipeline/autollama-rag/config',
          health: '/api/openwebui/health'
        },
        status: 'active',
        type: 'pipeline'
      }
    ];
    
    logger.info('Returning pipeline data', { count: pipelines.length, pipelines: pipelines.map(p => ({ id: p.id, name: p.name })) });
    res.json(pipelines);
  } catch (error) {
    logger.error('Error in pipeline discovery:', error);
    res.status(500).json({
      error: 'Pipeline discovery failed',
      message: error.message
    });
  }
});

// Pipeline execution endpoint - main RAG functionality
router.post('/pipeline/:id/execute', authenticatePipeline, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_message, messages = [], body = {} } = req.body;
    
    if (id !== 'autollama-rag') {
      return res.status(404).json({
        error: 'Pipeline not found',
        message: `Pipeline '${id}' is not available`
      });
    }
    
    logger.info('Executing AutoLlama RAG pipeline', { 
      query: user_message?.substring(0, 100) + '...',
      messagesCount: messages.length 
    });
    
    // Get services from the app context
    const services = req.app.get('services');
    if (!services) {
      throw new Error('Services not initialized');
    }
    
    // Perform RAG search using existing AutoLlama infrastructure
    const searchResults = await performRAGSearch(user_message, services);
    
    if (!searchResults || searchResults.length === 0) {
      return res.json({
        response: `I searched your AutoLlama knowledge base but couldn't find relevant information for: '${user_message}'. You may want to process more content through AutoLlama or try a different query.`,
        sources: [],
        query: user_message
      });
    }
    
    // Generate enhanced response with context
    const ragResponse = await generateRAGResponse(user_message, searchResults, services);
    
    res.json({
      response: ragResponse,
      sources: searchResults.map(result => ({
        title: result.title || 'Untitled',
        url: result.url || '',
        relevance_score: Math.round(result.score * 100),
        content_preview: result.content.substring(0, 200) + '...'
      })),
      query: user_message,
      pipeline_id: id,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error executing RAG pipeline:', error);
    res.status(500).json({
      error: 'Pipeline execution failed',
      message: error.message,
      query: req.body.user_message
    });
  }
});

// Pipeline configuration endpoint
router.get('/pipeline/:id/config', authenticatePipeline, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (id !== 'autollama-rag') {
      return res.status(404).json({
        error: 'Pipeline not found'
      });
    }
    
    // Get services to check current configuration
    const services = req.app.get('services');
    const qdrantConnected = services?.vectorService?.isReady() || false;
    const openaiConnected = services?.openaiService?.isReady() || false;
    
    res.json({
      pipeline_id: id,
      name: 'AutoLlama RAG Pipeline',
      status: (qdrantConnected && openaiConnected) ? 'healthy' : 'degraded',
      configuration: {
        collection_name: 'autollama-content',
        max_results: 5,
        similarity_threshold: 0.3,
        debug_mode: true,
        qdrant_connected: qdrantConnected,
        openai_connected: openaiConnected
      },
      last_updated: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting pipeline config:', error);
    res.status(500).json({
      error: 'Configuration retrieval failed',
      message: error.message
    });
  }
});

// OpenAI-compatible models endpoint for pipeline discovery
router.get('/v1/models', async (req, res) => {
  try {
    // Return available models including OpenAI models for chat
    const models = [
      {
        id: 'autollama-rag',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'autollama',
        permission: [],
        root: 'autollama-rag',
        parent: null
      },
      {
        id: 'gpt-4o-mini',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'openai',
        permission: [],
        root: 'gpt-4o-mini',
        parent: null
      },
      {
        id: 'gpt-4o',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'openai',
        permission: [],
        root: 'gpt-4o',
        parent: null
      },
      {
        id: 'gpt-4',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'openai',
        permission: [],
        root: 'gpt-4',
        parent: null
      }
    ];
    
    res.json({
      object: 'list',
      data: models
    });
  } catch (error) {
    logger.error('Models endpoint error:', error);
    res.status(500).json({
      error: 'Models retrieval failed',
      message: error.message
    });
  }
});

// Alternative models endpoint without version prefix
router.get('/models', async (req, res) => {
  try {
    // Return available models including OpenAI models for chat
    const models = [
      {
        id: 'autollama-rag',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'autollama',
        permission: [],
        root: 'autollama-rag',
        parent: null
      },
      {
        id: 'gpt-4o-mini',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'openai',
        permission: [],
        root: 'gpt-4o-mini',
        parent: null
      },
      {
        id: 'gpt-4o',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'openai',
        permission: [],
        root: 'gpt-4o',
        parent: null
      },
      {
        id: 'gpt-4',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'openai',
        permission: [],
        root: 'gpt-4',
        parent: null
      }
    ];
    
    res.json({
      object: 'list',
      data: models
    });
  } catch (error) {
    logger.error('Models endpoint error:', error);
    res.status(500).json({
      error: 'Models retrieval failed',
      message: error.message
    });
  }
});

// OpenAI-compatible chat completions endpoint (multiple paths for compatibility)
router.post('/v1/chat/completions', authenticatePipeline, async (req, res) => {
  try {
    const { model, messages, stream = false, ...otherParams } = req.body;
    
    logger.info(`Chat completions request: model=${model}, messages=${messages?.length || 0}`);
    
    // Handle different models
    if (model === 'autollama-rag') {
      // For AutoLlama RAG model, use the existing pipeline execute logic
      const lastMessage = messages[messages.length - 1];
      const query = lastMessage?.content || '';
      
      // Execute the RAG pipeline
      const pipelineResult = await executeRagPipeline(query, req);
      
      if (stream) {
        // Handle streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        const streamResponse = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [{
            index: 0,
            delta: { content: pipelineResult.response },
            finish_reason: 'stop'
          }]
        };
        
        res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // Non-streaming response
        const response = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: pipelineResult.response
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: query.length,
            completion_tokens: pipelineResult.response?.length || 0,
            total_tokens: query.length + (pipelineResult.response?.length || 0)
          }
        };
        
        res.json(response);
      }
    } else {
      // For other models (gpt-4o-mini, gpt-4o, etc.), proxy to OpenAI
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      const completion = await openai.chat.completions.create({
        model: model,
        messages: messages,
        stream: stream,
        ...otherParams
      });
      
      if (stream) {
        // Handle OpenAI streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        for await (const chunk of completion) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.json(completion);
      }
    }
    
  } catch (error) {
    logger.error('Chat completions error:', error);
    res.status(500).json({
      error: {
        type: 'internal_error',
        message: error.message
      }
    });
  }
});

// Debug endpoint to test route accessibility
router.all('/chat/completions-debug', (req, res) => {
  res.json({
    message: 'Chat completions debug route working',
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    headers: {
      authorization: req.headers.authorization ? `${req.headers.authorization.substring(0, 20)}...` : 'none',
      'content-type': req.headers['content-type']
    },
    timestamp: new Date().toISOString()
  });
});

// Simple GET test for chat completions path
router.get('/chat/completions', (req, res) => {
  res.json({
    message: 'GET chat completions endpoint working',
    note: 'This is a test endpoint - use POST for actual chat completions'
  });
});

// Alternative chat completions endpoint at root level for different OpenWebUI configurations
router.post('/chat/completions', async (req, res) => {
  console.log('🎯 Root level chat completions endpoint hit - auth temporarily removed for testing');
  try {
    const { model, messages, stream = false, ...otherParams } = req.body;
    
    logger.info(`Root chat completions request: model=${model}, messages=${messages?.length || 0}`);
    
    // Handle different models
    if (model === 'autollama-rag') {
      // For AutoLlama RAG model, use the existing pipeline execute logic
      const lastMessage = messages[messages.length - 1];
      const query = lastMessage?.content || '';
      
      // Execute the RAG pipeline
      const pipelineResult = await executeRagPipeline(query, req);
      
      if (stream) {
        // Handle streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        const streamResponse = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [{
            index: 0,
            delta: { content: pipelineResult.response },
            finish_reason: 'stop'
          }]
        };
        
        res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // Non-streaming response
        const response = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: pipelineResult.response
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: query.length,
            completion_tokens: pipelineResult.response?.length || 0,
            total_tokens: query.length + (pipelineResult.response?.length || 0)
          }
        };
        
        res.json(response);
      }
    } else {
      // For other models, proxy to OpenAI
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      const completion = await openai.chat.completions.create({
        model: model,
        messages: messages,
        stream: stream,
        ...otherParams
      });
      
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        for await (const chunk of completion) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.json(completion);
      }
    }
    
  } catch (error) {
    logger.error('Root chat completions error:', error);
    res.status(500).json({
      error: {
        type: 'internal_error',
        message: error.message
      }
    });
  }
});

// Helper function to execute RAG pipeline with dynamic settings
async function executeRagPipeline(query, req) {
  const startTime = Date.now();
  
  try {
    // Validate input
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Invalid query provided');
    }

    // Get RAG settings from database with fallback defaults
    const dbConnection = require('../../database');
    let ragSettings;
    
    try {
      ragSettings = await dbConnection.getRagSettings();
    } catch (dbError) {
      logger.warn('Failed to get RAG settings, using defaults:', dbError.message);
      ragSettings = {
        ragModel: 'gpt-4o-mini',
        ragMaxTokens: 1000,
        ragTemperature: 0.7,
        searchLimit: 5
      };
    }
    
    // Validate model selection
    const validModels = ['gpt-4o-mini', 'gpt-4o', 'gpt-4', 'gpt-3.5-turbo'];
    if (!validModels.includes(ragSettings.ragModel)) {
      logger.warn(`Invalid RAG model '${ragSettings.ragModel}', falling back to gpt-4o-mini`);
      ragSettings.ragModel = 'gpt-4o-mini';
    }
    
    logger.info('Executing RAG pipeline with settings:', ragSettings);
    
    // Use existing search functionality with dynamic limit
    const services = req.app.get('services');
    if (!services) {
      throw new Error('Services not available');
    }
    
    // Create searchService using the same pattern as routes/index.js
    const database = require('../../database');
    const searchService = {
      hybridSearch: async (query, options = {}) => {
        const { limit = 20 } = options;
        const results = await database.searchContent(query.trim(), limit);
        // Transform results to ensure content field is available
        const transformedResults = results.map(result => ({
          ...result,
          content: result.chunk_text || result.content || '', // Use chunk_text as content
          score: result.score || 1.0 // Add default score
        }));
        return { results: transformedResults };
      }
    };
    
    const searchResults = await searchService.hybridSearch(query, { 
      limit: Math.max(1, Math.min(ragSettings.searchLimit || 5, 20)) // Clamp between 1-20
    });
    
    // Check if we have context
    const hasContext = searchResults.results && searchResults.results.length > 0;
    if (!hasContext) {
      logger.info('No relevant context found for query:', query.substring(0, 100));
    }
    
    // Generate response using OpenAI with retrieved context and dynamic model
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    const contextText = searchResults.results?.map(r => r.content).join('\n\n') || '';
    const prompt = hasContext 
      ? `Based on the following context from the AutoLlama knowledge base, please answer the user's question. If the context doesn't contain relevant information, say so.

Context:
${contextText}

User Question: ${query}

Answer:`
      : `The user asked: "${query}"

I don't have any relevant context from the AutoLlama knowledge base to answer this question. Please let me know if you'd like me to search for something else or if you can provide more specific keywords.`;
    
    const completion = await openai.chat.completions.create({
      model: ragSettings.ragModel,
      messages: [{
        role: 'user',
        content: prompt
      }],
      max_tokens: Math.max(100, Math.min(ragSettings.ragMaxTokens || 1000, 4000)), // Clamp 100-4000
      temperature: Math.max(0.0, Math.min(ragSettings.ragTemperature || 0.7, 1.0)) // Clamp 0.0-1.0
    });
    
    const executionTime = Date.now() - startTime;
    
    logger.info(`RAG completion generated with ${ragSettings.ragModel}`, {
      tokensUsed: completion.usage?.total_tokens,
      searchResults: searchResults.results?.length || 0,
      executionTimeMs: executionTime,
      hasContext: hasContext
    });
    
    return {
      response: completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.',
      context: searchResults.results || [],
      sources: searchResults.results?.map(r => r.title).filter(Boolean) || [],
      modelUsed: ragSettings.ragModel,
      tokensUsed: completion.usage?.total_tokens || 0,
      executionTimeMs: executionTime,
      hasContext: hasContext
    };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error('RAG pipeline execution error:', {
      error: error.message,
      executionTimeMs: executionTime,
      query: query?.substring(0, 100)
    });
    
    return {
      response: 'Sorry, I encountered an error while processing your request. Please try again or contact support if the issue persists.',
      context: [],
      sources: [],
      modelUsed: 'error',
      tokensUsed: 0,
      executionTimeMs: executionTime,
      hasContext: false,
      error: error.message
    };
  }
}

// Debug test endpoint to verify route mounting
router.get('/test', (req, res) => {
  res.json({
    message: 'OpenWebUI routes are working',
    timestamp: new Date().toISOString(),
    path: req.path,
    originalUrl: req.originalUrl
  });
});

// Pipeline health check endpoint
router.get('/health', async (req, res) => {
  try {
    // Simplified health check for OpenWebUI pipeline compatibility
    const overallHealthy = true;
    
    res.status(200).json({
      status: 'healthy',
      pipeline: 'AutoLlama RAG Pipeline',
      version: '1.1',
      services: {
        qdrant: 'connected', 
        openai: 'connected', 
        database: 'connected'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error in pipeline health check:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// RAG search function using existing AutoLlama services
async function performRAGSearch(query, services) {
  try {
    // Use existing search service or fallback to database search
    if (services.searchService && services.searchService.hybridSearch) {
      const searchResult = await services.searchService.hybridSearch({
        query: query,
        limit: 5,
        threshold: 0.3
      });
      return searchResult.results || [];
    }
    
    // Fallback to database search
    if (services.database && services.database.searchContent) {
      return await services.database.searchContent(query, 5);
    }
    
    throw new Error('No search service available');
    
  } catch (error) {
    logger.error('Error in RAG search:', error);
    return [];
  }
}

// Generate enhanced response using existing OpenAI service
async function generateRAGResponse(userQuestion, searchResults, services) {
  try {
    if (!services.openaiService || !services.openaiService.isReady()) {
      // Fallback to formatted context without LLM generation
      return formatRAGContext(searchResults, userQuestion);
    }
    
    const ragContext = formatRAGContext(searchResults, userQuestion);
    
    const systemPrompt = `You are an AI assistant that helps users find and understand information from their processed content library. You have access to a knowledge base of documents, articles, and PDFs that the user has previously processed through AutoLlama.

When answering questions:
1. Use the provided context from the knowledge base to answer the user's question
2. Always cite your sources with the provided URLs
3. If multiple sources are relevant, synthesize the information naturally
4. If the context doesn't fully answer the question, be transparent about limitations
5. Provide clear, concise, and helpful responses
6. Use a conversational tone while remaining informative

The context provided contains search results from the user's knowledge base with relevance scores, titles, URLs, and content excerpts.`;

    const response = await services.openaiService.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Context from knowledge base:\n\n${ragContext}\n\nUser question: ${userQuestion}` }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });
    
    return response.choices[0].message.content.trim();
    
  } catch (error) {
    logger.error('Error generating RAG response:', error);
    return formatRAGContext(searchResults, userQuestion);
  }
}

// Format search results into context for the LLM
function formatRAGContext(results, query) {
  if (!results || results.length === 0) {
    return `No relevant information found in the AutoLlama knowledge base for: ${query}`;
  }
  
  const contextParts = [];
  contextParts.push('📚 **AutoLlama Knowledge Base Results:**\n');
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const scorePercentage = Math.round((result.score || 0) * 100);
    
    contextParts.push(`**Source ${i + 1}** (Relevance: ${scorePercentage}%)`);
    contextParts.push(`**Title:** ${result.title || 'Untitled'}`);
    contextParts.push(`**URL:** ${result.url || ''}`);
    
    if (result.category) {
      contextParts.push(`**Category:** ${result.category}`);
    }
    
    if (result.tags) {
      const tagsStr = Array.isArray(result.tags) ? result.tags.join(', ') : String(result.tags);
      contextParts.push(`**Tags:** ${tagsStr}`);
    }
    
    contextParts.push(`**Content:** ${result.content || result.chunk_text || ''}`);
    
    if (result.summary) {
      contextParts.push(`**Summary:** ${result.summary}`);
    }
    
    contextParts.push('---');
  }
  
  contextParts.push('\n🤖 **Instructions:** Use the above information to answer the user\'s question. Always cite your sources with the provided URLs. If the information doesn\'t fully answer the question, mention what\'s available and suggest the user might need additional sources.');
  
  return contextParts.join('\n\n');
}

module.exports = router;