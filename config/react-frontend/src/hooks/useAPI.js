import { useState, useCallback, useRef } from 'react';
import { 
  apiEndpoints, 
  bm25Endpoints, 
  chatEndpoints, 
  createEnhancedApiCall,
  apiUtils 
} from '../utils/api';
import { useErrorHandler } from './useErrorHandler';
import { useApiPerformance } from './usePerformance';
import { cacheConfigs } from '../utils/apiCache';
import { transformDocument, transformChunk, transformSearchResults } from '../utils/dataTransforms';

export const useAPI = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  
  // Use enhanced hooks
  const { handleApiError, clearErrors } = useErrorHandler('useAPI');
  const { timeApiCall, metrics: performanceMetrics } = useApiPerformance();

  // Enhanced API call wrapper with error handling, caching, and performance tracking
  const callAPI = useCallback(async (apiFunction, endpoint, options = {}, ...args) => {
    setLoading(true);
    setError(null);
    clearErrors();
    
    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    try {
      // Create enhanced API call with caching, retry, and monitoring
      const enhancedCall = createEnhancedApiCall(endpoint, apiFunction, {
        useCache: options.useCache !== false,
        ttl: options.ttl || cacheConfigs.documents,
        useRetry: options.useRetry !== false,
        maxAttempts: options.maxAttempts || 3,
        useMonitoring: options.useMonitoring !== false,
      });
      
      const result = await timeApiCall(() => enhancedCall(...args), endpoint);
      return result?.data || result;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Request was cancelled');
        return null;
      }
      
      const errorData = handleApiError(err, endpoint);
      setError(errorData);
      throw err;
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [handleApiError, clearErrors, timeApiCall]);

  // Document operations with data transformation
  const documents = {
    getAll: useCallback(async (params) => {
      const result = await callAPI(apiEndpoints.getDocuments, 'documents', { ttl: cacheConfigs.documents }, params);
      // /recent-records returns a flat array, so we need to wrap it
      const documents = Array.isArray(result) ? result : (result?.documents || []);
      return {
        documents: documents.map(transformDocument) || []
      };
    }, [callAPI]),
    
    getChunks: useCallback(async (encodedUrl, params) => {
      const result = await callAPI(
        apiEndpoints.getDocumentChunks, 
        `document-chunks-${encodedUrl}`, 
        { ttl: cacheConfigs.documents },
        encodedUrl, 
        params
      );
      return {
        ...result,
        chunks: result?.chunks?.map(transformChunk) || []
      };
    }, [callAPI]),
    
    getSummary: useCallback((encodedUrl) => 
      callAPI(
        apiEndpoints.getDocumentSummary, 
        `document-summary-${encodedUrl}`,
        { ttl: cacheConfigs.documents },
        encodedUrl
      ), [callAPI]),
  };

  // Processing operations (no caching for real-time operations)
  const processing = {
    processUrl: useCallback((data) => 
      callAPI(apiEndpoints.processUrl, 'process-url', { useCache: false }, data), [callAPI]),
    processUrlStream: useCallback((data) => 
      callAPI(apiEndpoints.processUrlStream, 'process-url-stream', { useCache: false }, data), [callAPI]),
    processFile: useCallback((formData) => 
      callAPI(apiEndpoints.processFile, 'process-file', { useCache: false }, formData), [callAPI]),
    processFileStream: useCallback((formData) => 
      callAPI(apiEndpoints.processFileStream, 'process-file-stream', { useCache: false }, formData), [callAPI]),
    getQueue: useCallback(() => 
      callAPI(apiEndpoints.getInProgress, 'processing-queue', { ttl: cacheConfigs.realtime }), [callAPI]),
    stopProcessing: useCallback((sessionId) => 
      callAPI(apiEndpoints.stopProcessing, 'stop-processing', { useCache: false }, sessionId), [callAPI]),
    cancelJob: useCallback((jobId) => 
      callAPI(apiEndpoints.cancelJob, 'cancel-job', { useCache: false }, jobId), [callAPI]),
    getStats: useCallback(() => 
      callAPI(apiEndpoints.getCompletedUploads, 'processing-stats', { ttl: cacheConfigs.stats }), [callAPI]),
  };

  // Search operations with result transformation
  const search = {
    search: useCallback(async (params) => {
      const result = await callAPI(apiEndpoints.search, 'search', { ttl: cacheConfigs.documents }, params);
      return transformSearchResults(result);
    }, [callAPI]),
    
    searchGrouped: useCallback(async (params) => {
      const result = await callAPI(apiEndpoints.searchGrouped, 'search-grouped', { ttl: cacheConfigs.documents }, params);
      return transformSearchResults(result);
    }, [callAPI]),
    
    bm25Search: useCallback((filename, query, topK) => 
      callAPI(bm25Endpoints.search, `bm25-${filename}`, { ttl: cacheConfigs.documents }, filename, query, topK), [callAPI]),
  };

  // Statistics and health with appropriate caching
  const stats = {
    getKnowledgeBase: useCallback(async () => {
      const result = await callAPI(apiEndpoints.getKnowledgeBaseStats, 'kb-stats', { ttl: cacheConfigs.stats });
      // Return the stats object directly, not the wrapper
      return result?.stats || result;
    }, [callAPI]),
    getDatabase: useCallback(async () => {
      const result = await callAPI(apiEndpoints.getDatabaseStats, 'db-stats', { ttl: cacheConfigs.stats });
      // Return the stats object directly, not the wrapper
      return result?.stats || result;
    }, [callAPI]),
    getHealth: useCallback(() => 
      callAPI(apiEndpoints.getHealth, 'health', { ttl: cacheConfigs.realtime }), [callAPI]),
    getPipelineHealth: useCallback(() => 
      callAPI(apiEndpoints.getPipelineHealth, 'pipeline-health', { ttl: cacheConfigs.realtime }), [callAPI]),
    getQdrantActivity: useCallback(() => 
      callAPI(apiEndpoints.getQdrantActivity, 'qdrant-activity', { ttl: cacheConfigs.realtime }), [callAPI]),
    getBM25Stats: useCallback(() => 
      callAPI(bm25Endpoints.getStats, 'bm25-stats', { ttl: cacheConfigs.stats }), [callAPI]),
    getBM25Health: useCallback(() => 
      callAPI(bm25Endpoints.getHealth, 'bm25-health', { ttl: cacheConfigs.realtime }), [callAPI]),
  };

  // Data retrieval with appropriate caching
  const data = {
    getRecentRecords: useCallback((params) => 
      callAPI(apiEndpoints.getRecentRecords, 'recent-records', { ttl: cacheConfigs.realtime }, params), [callAPI]),
    getInProgress: useCallback(() => 
      callAPI(apiEndpoints.getInProgress, 'in-progress', { ttl: cacheConfigs.realtime }), [callAPI]),
    getCompletedUploads: useCallback((params) => 
      callAPI(apiEndpoints.getCompletedUploads, 'completed-uploads', { ttl: cacheConfigs.stats }, params), [callAPI]),
    getChunks: useCallback(async (params) => {
      const result = await callAPI(apiEndpoints.getChunks, 'chunks', { ttl: cacheConfigs.documents }, params);
      return result?.map(transformChunk) || [];
    }, [callAPI]),
  };

  // BM25 index management with optimized caching
  const bm25 = {
    createIndex: useCallback((filename, chunks, replaceExisting) => 
      callAPI(bm25Endpoints.createIndex, `bm25-create-${filename}`, { useCache: false }, filename, chunks, replaceExisting), [callAPI]),
    deleteIndex: useCallback((filename) => 
      callAPI(bm25Endpoints.deleteIndex, `bm25-delete-${filename}`, { useCache: false }, filename), [callAPI]),
    search: useCallback((filename, query, topK) => 
      callAPI(bm25Endpoints.search, `bm25-search-${filename}`, { ttl: cacheConfigs.documents }, filename, query, topK), [callAPI]),
    getStats: useCallback(() => 
      callAPI(bm25Endpoints.getStats, 'bm25-stats', { ttl: cacheConfigs.stats }), [callAPI]),
    getHealth: useCallback(() => 
      callAPI(bm25Endpoints.getHealth, 'bm25-health', { ttl: cacheConfigs.realtime }), [callAPI]),
  };

  // Chat/RAG functionality with appropriate caching
  const chat = {
    sendMessage: useCallback((data) => 
      callAPI(chatEndpoints.sendMessage, 'chat-message', { useCache: false }, data), [callAPI]),
    getConversation: useCallback((id) => 
      callAPI(chatEndpoints.getConversation, `conversation-${id}`, { ttl: cacheConfigs.documents }, id), [callAPI]),
    getConversations: useCallback((params) => 
      callAPI(chatEndpoints.getConversations, 'conversations', { ttl: cacheConfigs.stats }, params), [callAPI]),
    deleteConversation: useCallback((id) => 
      callAPI(chatEndpoints.deleteConversation, `delete-conversation-${id}`, { useCache: false }, id), [callAPI]),
    getStats: useCallback(() => 
      callAPI(chatEndpoints.getStats, 'chat-stats', { ttl: cacheConfigs.stats }), [callAPI]),
    searchRAG: useCallback((query, params) => 
      callAPI(chatEndpoints.searchRAG, 'rag-search', { ttl: cacheConfigs.documents }, query, params), [callAPI]),
    pipelineQuery: useCallback((data) => 
      callAPI(chatEndpoints.pipelineQuery, 'pipeline-query', { useCache: false }, data), [callAPI]),
    getPipelineStatus: useCallback(() => 
      callAPI(chatEndpoints.getPipelineStatus, 'pipeline-status', { ttl: cacheConfigs.realtime }), [callAPI]),
  };

  // Cancel current request
  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Utility functions
  // Settings operations
  const settings = {
    getChunkingSettings: useCallback(() => 
      callAPI(apiEndpoints.getChunkingSettings, 'chunking-settings', { ttl: cacheConfigs.stats }), [callAPI]),
    updateChunkingSettings: useCallback((data) => 
      callAPI(apiEndpoints.updateChunkingSettings, 'update-chunking-settings', { useCache: false }, data), [callAPI]),
  };

  // Admin operations for session management and cleanup
  const admin = {
    getCleanupStatus: useCallback(() => 
      callAPI(apiEndpoints.getCleanupStatus, 'cleanup-status', { ttl: cacheConfigs.realtime }), [callAPI]),
    checkStuckSessions: useCallback(() => 
      callAPI(apiEndpoints.checkStuckSessions, 'stuck-sessions', { ttl: cacheConfigs.realtime }), [callAPI]),
    cleanupSessions: useCallback((data) => 
      callAPI(apiEndpoints.cleanupSessions, 'cleanup-sessions', { useCache: false }, data), [callAPI]),
    advancedCleanup: useCallback((data) => 
      callAPI(apiEndpoints.advancedCleanup, 'advanced-cleanup', { useCache: false }, data), [callAPI]),
    cleanupStuckSessions: useCallback((data) => 
      callAPI(apiEndpoints.cleanupStuckSessions, 'cleanup-stuck-sessions', { useCache: false }, data), [callAPI]),
    getSessionStats: useCallback(() => 
      callAPI(apiEndpoints.getAdminSessionStats, 'admin-session-stats', { ttl: cacheConfigs.realtime }), [callAPI]),
    getSystemHealth: useCallback(() => 
      callAPI(apiEndpoints.getSystemHealth, 'admin-system-health', { ttl: cacheConfigs.realtime }), [callAPI]),
  };

  const utils = {
    invalidateCache: apiUtils.invalidateCache,
    batchApiCalls: apiUtils.batchApiCalls,
    sequentialApiCalls: apiUtils.sequentialApiCalls,
    checkHealth: apiUtils.checkHealth,
    getApiStats: apiUtils.getApiStats,
  };

  return {
    loading,
    error,
    performanceMetrics,
    documents,
    processing,
    search,
    stats,
    data,
    bm25,
    chat,
    settings,
    admin,
    utils,
    cancelRequest,
    clearError: clearErrors,
  };
};

// Custom hook for hybrid search (BM25 + Semantic)
export const useHybridSearch = () => {
  const [results, setResults] = useState({ bm25: [], semantic: [], combined: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const api = useAPI();

  const hybridSearch = useCallback(async (query, options = {}) => {
    const {
      filename = 'default',
      maxResults = 10,
      bm25Weight = 0.5,
      semanticWeight = 0.5,
      enableBM25 = true,
      enableSemantic = true,
    } = options;

    setLoading(true);
    setError(null);

    try {
      const promises = [];
      
      // BM25 search
      if (enableBM25) {
        promises.push(
          api.bm25.search(filename, query, maxResults)
            .then(data => ({ type: 'bm25', data: data?.results || [] }))
            .catch(err => ({ type: 'bm25', data: [], error: { ...err, severity: 'medium', category: 'search' } }))
        );
      }

      // Semantic search
      if (enableSemantic) {
        promises.push(
          api.search.search({ q: query, limit: maxResults, type: 'semantic' })
            .then(data => ({ type: 'semantic', data: data?.results || [] }))
            .catch(err => ({ type: 'semantic', data: [], error: { ...err, severity: 'medium', category: 'search' } }))
        );
      }

      const searchResults = await Promise.all(promises);
      
      const bm25Results = searchResults.find(r => r.type === 'bm25')?.data || [];
      const semanticResults = searchResults.find(r => r.type === 'semantic')?.data || [];

      // Combine and rank results
      const combinedResults = combineSearchResults(
        bm25Results,
        semanticResults,
        bm25Weight,
        semanticWeight
      );

      setResults({
        bm25: bm25Results,
        semantic: semanticResults,
        combined: combinedResults.slice(0, maxResults),
      });

      return {
        bm25: bm25Results,
        semantic: semanticResults,
        combined: combinedResults.slice(0, maxResults),
      };
      
    } catch (err) {
      console.error('Hybrid search failed:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api]);

  return {
    results,
    loading,
    error,
    hybridSearch,
  };
};

// Helper function to combine BM25 and semantic search results
const combineSearchResults = (bm25Results, semanticResults, bm25Weight, semanticWeight) => {
  const resultMap = new Map();
  
  // Add BM25 results
  bm25Results.forEach((result, index) => {
    const key = result.chunk_id || result.id;
    resultMap.set(key, {
      ...result,
      bm25Score: result.score || 0,
      bm25Rank: index + 1,
      semanticScore: 0,
      semanticRank: null,
      combinedScore: (result.score || 0) * bm25Weight,
      source: 'bm25',
    });
  });
  
  // Add or merge semantic results
  semanticResults.forEach((result, index) => {
    const key = result.chunk_id || result.id;
    if (resultMap.has(key)) {
      const existing = resultMap.get(key);
      existing.semanticScore = result.score || 0;
      existing.semanticRank = index + 1;
      existing.combinedScore = existing.bm25Score * bm25Weight + (result.score || 0) * semanticWeight;
      existing.source = 'hybrid';
    } else {
      resultMap.set(key, {
        ...result,
        bm25Score: 0,
        bm25Rank: null,
        semanticScore: result.score || 0,
        semanticRank: index + 1,
        combinedScore: (result.score || 0) * semanticWeight,
        source: 'semantic',
      });
    }
  });
  
  // Sort by combined score and return array
  return Array.from(resultMap.values())
    .sort((a, b) => b.combinedScore - a.combinedScore);
};