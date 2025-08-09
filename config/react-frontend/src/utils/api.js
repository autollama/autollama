import axios from 'axios';
import { cachedApiCall, cacheConfigs, invalidateCache } from './apiCache';
import errorHandler, { handleApiError, retry } from './errorHandler';
import perfMonitor from './performance';

// Create API client with default configuration
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// BM25 API client for search functionality
const bm25Api = axios.create({
  baseURL: '/bm25',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging, auth, and performance tracking
api.interceptors.request.use(
  (config) => {
    // Start performance timing
    config.metadata = {
      startTime: performance.now(),
      endpoint: `${config.method?.toUpperCase()} ${config.url}`,
    };
    
    console.log(`🔄 API Request: ${config.metadata.endpoint}`);
    return config;
  },
  (error) => {
    handleApiError(error, { action: 'RequestInterceptor' });
    return Promise.reject(error);
  }
);

// Response interceptor for error handling and performance tracking
api.interceptors.response.use(
  (response) => {
    // Calculate response time
    if (response.config.metadata) {
      const duration = performance.now() - response.config.metadata.startTime;
      perfMonitor.endTimer(
        response.config.metadata.endpoint,
        'api',
        { status: response.status, duration }
      );
      
      console.log(`✅ API Response: ${response.config.metadata.endpoint} - ${response.status} (${Math.round(duration)}ms)`);
    }
    
    return response;
  },
  (error) => {
    // Track error performance
    if (error.config?.metadata) {
      const duration = performance.now() - error.config.metadata.startTime;
      perfMonitor.endTimer(
        error.config.metadata.endpoint,
        'api',
        { status: error.response?.status || 'error', duration, error: true }
      );
    }
    
    // Handle and log error
    const errorData = handleApiError(error, {
      action: 'ResponseInterceptor',
      endpoint: error.config?.url,
      method: error.config?.method,
    });
    
    // Invalidate relevant cache on error
    if (error.response?.status >= 500) {
      invalidateCache.all();
    }
    
    return Promise.reject(error);
  }
);

// BM25 API interceptors
bm25Api.interceptors.request.use(
  (config) => {
    console.log(`🔍 BM25 Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => Promise.reject(error)
);

bm25Api.interceptors.response.use(
  (response) => {
    console.log(`✅ BM25 Response: ${response.status}`);
    return response;
  },
  (error) => {
    console.error('❌ BM25 Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// API endpoints
export const apiEndpoints = {
  // Document management
  getDocuments: (params = {}) => api.get('/documents', { params }),
  getDocumentChunks: (encodedUrl, params = {}) => api.get(`/document-chunks`, { params: { url: atob(encodedUrl), ...params } }),
  getChunkByIndex: async (encodedUrl, chunkIndex) => {
    const url = atob(encodedUrl);
    console.log(`🔍 Getting chunk by index: ${chunkIndex} for URL: ${url.substring(0, 80)}...`);
    
    try {
      // Try to load a reasonable number of chunks and find the right one
      const response = await api.get(`/document-chunks`, { 
        params: { 
          url: url, 
          limit: Math.max(200, chunkIndex + 50) // Load enough chunks to include target
        } 
      });
      
      if (response.data.chunks && response.data.chunks.length > 0) {
        // First try to find exact chunk index match
        let chunk = response.data.chunks.find(c => c.chunkIndex === chunkIndex);
        
        if (chunk) {
          console.log(`✅ Found chunk by index ${chunkIndex}:`, {
            chunkId: chunk.chunkId || chunk.id,
            hasContent: !!(chunk.chunkText && chunk.chunkText.length > 0),
            contentLength: chunk.chunkText ? chunk.chunkText.length : 0
          });
          return { chunk };
        }
        
        // If exact match not found, try loading all chunks
        console.log(`⚠️ Chunk index ${chunkIndex} not found in ${response.data.chunks.length} chunks, loading all...`);
        
        const fullResponse = await api.get(`/document-chunks`, { 
          params: { 
            url: url, 
            limit: 2000 // Load maximum chunks
          } 
        });
        
        if (fullResponse.data.chunks) {
          chunk = fullResponse.data.chunks.find(c => c.chunkIndex === chunkIndex);
          if (chunk) {
            console.log(`✅ Found chunk by index ${chunkIndex} in full load:`, {
              chunkId: chunk.chunkId || chunk.id,
              hasContent: !!(chunk.chunkText && chunk.chunkText.length > 0),
              contentLength: chunk.chunkText ? chunk.chunkText.length : 0
            });
            return { chunk };
          }
        }
        
        // Log available chunk indices for debugging
        const availableIndices = [...new Set(response.data.chunks.map(c => c.chunkIndex))].sort((a, b) => a - b);
        console.warn(`❌ Chunk index ${chunkIndex} not found. Available indices:`, {
          total: response.data.chunks.length,
          uniqueIndices: availableIndices.length,
          range: `${availableIndices[0]} to ${availableIndices[availableIndices.length - 1]}`,
          sample: availableIndices.slice(0, 10)
        });
        
        throw new Error(`Chunk with index ${chunkIndex} not found. Available range: ${availableIndices[0]} to ${availableIndices[availableIndices.length - 1]}`);
      }
      
      throw new Error('No chunks returned from API');
    } catch (error) {
      console.error('Error fetching chunk by index:', error);
      throw error;
    }
  },
  getDocumentSummary: (encodedUrl) => api.get(`/document/${encodedUrl}/summary`),
  
  // Processing
  processUrl: (data) => api.post('/process-url', data),
  processUrlStream: (data) => api.post('/process-url-stream', data),
  processFile: (formData) => api.post('/process-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  processFileStream: (formData) => api.post('/process-file-stream', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  
  // Search
  search: (params) => api.get('/search', { params }),
  searchGrouped: (params) => api.get('/search/grouped', { params }),
  
  // Statistics and health
  getKnowledgeBaseStats: () => api.get('/knowledge-base/stats'),
  getDatabaseStats: () => api.get('/database/stats'),
  getHealth: () => axios.get('/health'), // Direct call, not through API proxy
  getPipelineHealth: () => api.get('/pipeline/health'),
  getQdrantActivity: () => api.get('/qdrant/activity'),
  
  // Recent and in-progress
  getRecentRecords: (params = {}) => api.get('/documents', { params }),
  getInProgress: () => api.get('/in-progress'),
  getCompletedUploads: (params = {}) => api.get('/in-progress', { params }),
  stopProcessing: (sessionId) => api.post(`/stop-processing/${sessionId}`),
  cancelJob: (jobId) => api.post(`/cancel-job/${jobId}`),
  
  // Chunks
  getChunks: (params = {}) => api.get('/chunks', { params }),
  
  // Chunking settings
  getChunkingSettings: () => api.get('/chunking-settings'),
  updateChunkingSettings: (data) => api.put('/chunking-settings', data),
  
  // RAG settings
  getRagSettings: () => api.get('/settings/rag'),
  updateRagSettings: (data) => api.put('/settings/rag', data),
  
  // Admin endpoints for session management and cleanup
  getCleanupStatus: () => api.get('/cleanup-status'),
  checkStuckSessions: () => api.get('/upload-sessions/check-stuck'),
  cleanupSessions: (data = {}) => api.post('/cleanup-sessions', data),
  advancedCleanup: (data = {}) => api.post('/cleanup-sessions/advanced', data),
  cleanupStuckSessions: (data = {}) => api.post('/upload-sessions/cleanup-stuck', data),
  getAdminSessionStats: () => api.get('/admin/session-stats'),
  getSystemHealth: () => api.get('/admin/system-health'),
};

// Chat/RAG endpoints
export const chatEndpoints = {
  sendMessage: (data) => api.post('/chat/message', data),
  getConversation: (conversationId) => api.get(`/chat/conversation/${conversationId}`),
  getConversations: (params = {}) => api.get('/chat/conversations', { params }),
  deleteConversation: (conversationId) => api.delete(`/chat/conversation/${conversationId}`),
  getStats: () => api.get('/chat/stats'),
  searchRAG: (query, params = {}) => api.post('/chat/rag-search', { query, ...params }),
  
  // OpenWebUI pipeline integration
  pipelineQuery: (data) => api.post('/chat/pipeline', data),
  getPipelineStatus: () => api.get('/chat/pipeline/status'),
};

// BM25 search endpoints
export const bm25Endpoints = {
  search: (filename, query, topK = 10) => bm25Api.post(`/search/${filename}`, {
    query,
    filename,
    top_k: topK
  }),
  createIndex: (filename, chunks, replaceExisting = true) => bm25Api.post(`/index/${filename}`, {
    chunks,
    filename,
    replace_existing: replaceExisting
  }),
  getStats: () => bm25Api.get('/stats'),
  deleteIndex: (filename) => bm25Api.delete(`/index/${filename}`),
  getHealth: () => bm25Api.get('/health'),
};

// Enhanced SSE connection helper with error handling and performance tracking
export const createSSEConnection = (endpoint, onMessage, onError = null) => {
  const url = endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`;
  const connectionStart = performance.now();
  
  console.log(`🔄 Creating SSE connection to: ${url}`);
  
  try {
    const eventSource = new EventSource(url, {
      withCredentials: false, // Ensure CORS compatibility
    });
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle ping messages silently (keep-alive)
        if (data.type === 'ping') {
          console.log('🏓 SSE ping received');
          return;
        }
        
        console.log('📨 SSE message received:', data.type);
        onMessage(data);
      } catch (error) {
        const errorData = handleApiError(error, {
          action: 'SSE_Parse',
          endpoint: url,
        });
        console.error('❌ SSE parsing error:', error);
        onMessage({ 
          type: 'error', 
          message: 'Failed to parse SSE data', 
          errorId: errorData.id,
          severity: 'medium',
          category: 'sse_parse',
          timestamp: new Date().toISOString()
        });
      }
    };
    
    eventSource.onerror = (error) => {
      const errorData = handleApiError(error, {
        action: 'SSE_Connection',
        endpoint: url,
        readyState: eventSource.readyState,
      });
      console.error('❌ SSE connection error:', error, 'ReadyState:', eventSource.readyState);
      if (onError) onError(error, errorData);
    };
    
    eventSource.onopen = () => {
      const connectionTime = performance.now() - connectionStart;
      console.log(`✅ SSE connection established: ${url} (${Math.round(connectionTime)}ms)`);
      
      perfMonitor.endTimer(`SSE_${endpoint}`, 'sse', {
        endpoint: url,
        connectionTime,
      });
    };
    
    // Start performance timing
    perfMonitor.startTimer(`SSE_${endpoint}`, 'sse');
    
    return eventSource;
  } catch (error) {
    console.error('❌ Failed to create SSE connection:', error);
    handleApiError(error, {
      action: 'SSE_Create',
      endpoint: url,
    });
    throw error;
  }
};

// Cache-aware API functions
export const createCachedApiCall = (endpoint, apiFunction, ttl = null) => {
  return (...args) => {
    const cacheKey = `${endpoint}:${JSON.stringify(args)}`;
    return cachedApiCall(cacheKey, () => apiFunction(...args), ttl);
  };
};

// Retry-enabled API functions
export const createRetryableApiCall = (apiFunction, maxAttempts = 3) => {
  return async (...args) => {
    return retry(() => apiFunction(...args), { maxAttempts });
  };
};

// Performance-monitored API functions
export const createMonitoredApiCall = (endpoint, apiFunction) => {
  return async (...args) => {
    return perfMonitor.timeApiCall(
      () => apiFunction(...args),
      endpoint,
      { args: args.length }
    );
  };
};

// Combined enhanced API call (cache + retry + monitoring)
export const createEnhancedApiCall = (endpoint, apiFunction, options = {}) => {
  const {
    useCache = true,
    ttl = null,
    useRetry = true,
    maxAttempts = 3,
    useMonitoring = true,
  } = options;

  let enhancedFunction = apiFunction;

  // Add monitoring
  if (useMonitoring) {
    enhancedFunction = createMonitoredApiCall(endpoint, enhancedFunction);
  }

  // Add retry logic
  if (useRetry) {
    enhancedFunction = createRetryableApiCall(enhancedFunction, maxAttempts);
  }

  // Add caching
  if (useCache) {
    enhancedFunction = createCachedApiCall(endpoint, enhancedFunction, ttl);
  }

  return enhancedFunction;
};

// Utility functions for common operations
export const apiUtils = {
  // Invalidate cache for specific patterns
  invalidateCache: {
    documents: () => invalidateCache.documents(),
    stats: () => invalidateCache.stats(),
    processing: () => invalidateCache.processing(),
    all: () => invalidateCache.all(),
  },

  // Batch API calls with performance tracking
  batchApiCalls: async (calls) => {
    const startTime = performance.now();
    
    try {
      const results = await Promise.all(calls.map(call => call()));
      const duration = performance.now() - startTime;
      
      console.log(`📦 Batch API calls completed: ${calls.length} requests in ${Math.round(duration)}ms`);
      
      return results;
    } catch (error) {
      handleApiError(error, {
        action: 'BatchApiCalls',
        callCount: calls.length,
      });
      throw error;
    }
  },

  // Sequential API calls with delay
  sequentialApiCalls: async (calls, delay = 100) => {
    const results = [];
    
    for (let i = 0; i < calls.length; i++) {
      try {
        const result = await calls[i]();
        results.push(result);
        
        // Add delay between calls (except for last call)
        if (i < calls.length - 1 && delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        handleApiError(error, {
          action: 'SequentialApiCall',
          callIndex: i,
          totalCalls: calls.length,
        });
        throw error;
      }
    }
    
    return results;
  },

  // Check API health
  checkHealth: async () => {
    try {
      const response = await axios.get('/health', { timeout: 5000 });
      return {
        status: 'healthy',
        response: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },

  // Get API statistics
  getApiStats: () => {
    return {
      performance: perfMonitor.getStats(),
      errors: errorHandler.getStats(),
      cache: {
        // Add cache stats if needed
      },
    };
  },
};

export { api, bm25Api };