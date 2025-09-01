import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Settings, Search as SearchIcon, Home, FileText, Activity, Database, MessageCircle } from 'lucide-react';

// Import hooks
import { useSettings } from './hooks/useSettings';
import { useSSE } from './hooks/useSSE';
import { useAPI } from './hooks/useAPI';

// Import utilities
import { transformDocument } from './utils/dataTransforms';

// Import components with lazy loading
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const Search = React.lazy(() => import('./components/Search'));
const SettingsModal = React.lazy(() => import('./components/Settings').then(module => ({ default: module.SettingsModal })));
const DocumentViewer = React.lazy(() => import('./components/Document').then(module => ({ default: module.DocumentViewer })));
const ProcessingManager = React.lazy(() => import('./components/Processing'));
const RAGChat = React.lazy(() => import('./components/Chat'));
const ChunkInspector = React.lazy(() => import('./components/Document/ChunkInspector'));
const ErrorBoundary = React.lazy(() => import('./components/common/ErrorBoundary'));

// Global App Context
const AppContext = createContext();

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

// Global error handler for catching remaining severity access errors
if (typeof window !== 'undefined') {
  const originalErrorHandler = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    if (message && message.includes('severity')) {
      console.warn('🔍 Caught severity access error:', message, 'Source:', source, 'Line:', lineno);
      console.warn('🔍 Error object:', error);
      // Prevent this error from propagating and breaking the UI
      return true;
    }
    // Call original handler if it exists
    if (originalErrorHandler) {
      return originalErrorHandler.call(this, message, source, lineno, colno, error);
    }
    return false;
  };
}

// Main App Component
function App() {
  console.log('🔥 APP COMPONENT STARTING - REACT IS RUNNING');
  
  // Add immediate visible alert for debugging
  if (typeof window !== 'undefined') {
    window.AUTOLLAMA_DEBUG = window.AUTOLLAMA_DEBUG || {};
    window.AUTOLLAMA_DEBUG.appStarted = true;
    console.log('🔥 AUTOLLAMA DEBUG: App component mounted successfully');
  }
  // Global state
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedChunk, setSelectedChunk] = useState(null);
  const [selectedChunks, setSelectedChunks] = useState([]);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [totalDocumentCount, setTotalDocumentCount] = useState(0);
  const [systemStats, setSystemStats] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [newlyCreatedDocumentIds, setNewlyCreatedDocumentIds] = useState(new Set());

  // EventSource tracking for memory leak prevention
  const eventSourcesRef = useRef(new Map());
  // Timeout tracking for proper cleanup
  const timeoutsRef = useRef(new Set());

  // Cleanup function for EventSources
  const cleanupEventSource = (sessionId) => {
    const eventSource = eventSourcesRef.current.get(sessionId);
    if (eventSource) {
      console.log('🧹 Closing EventSource for session:', sessionId);
      eventSource.close();
      eventSourcesRef.current.delete(sessionId);
    }
  };

  // Tracked setTimeout to prevent memory leaks
  const setTrackedTimeout = (callback, delay) => {
    const timeoutId = setTimeout(() => {
      timeoutsRef.current.delete(timeoutId);
      callback();
    }, delay);
    timeoutsRef.current.add(timeoutId);
    return timeoutId;
  };

  // Cleanup all EventSources and timeouts on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 Cleaning up all EventSources and timeouts on unmount');
      
      // Close all EventSources
      eventSourcesRef.current.forEach((eventSource, sessionId) => {
        eventSource.close();
      });
      eventSourcesRef.current.clear();
      
      // Clear all tracked timeouts
      timeoutsRef.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      timeoutsRef.current.clear();
    };
  }, []);

  // Hooks
  const settings = useSettings();
  const api = useAPI();
  
  // SSE connection for real-time updates
  const sse = useSSE('/api/stream', {
    onMessage: (data) => {
      handleRealTimeUpdate(data);
    },
    onError: (error) => {
      console.error('SSE connection error:', error);
    },
  });

  // Handle real-time updates from SSE
  const handleRealTimeUpdate = (data) => {
    const eventType = data.type || data.step; // Handle both type and step fields
    
    // Add comprehensive diagnostic logging for SSE events
    console.log('🔄 SSE Event received:', {
      type: data.type,
      step: data.step,
      eventType: eventType,
      documentId: data.documentId,
      url: data.url,
      title: data.title,
      sessionId: data.sessionId,
      nestedData: data.data,
      fullData: data
    });
    
    // Check if this is a nested event structure (like processing_progress with embedded events)
    if (data.data && typeof data.data === 'object') {
      console.log('🔍 Checking nested event data:', {
        nestedType: data.data.type,
        nestedEvent: data.data.event,
        nestedStep: data.data.step,
        nestedData: data.data.data
      });
      
      // If there's a nested event with document_created step, handle it
      if (data.data.data && data.data.data.step === 'document_created') {
        console.log('📄 Found nested document_created event!', data.data.data);
        const nestedEventData = data.data.data;
        
        // Extract identifiers from nested structure
        const documentIdentifiers = [
          nestedEventData.documentId,
          nestedEventData.url,
          nestedEventData.title
        ].filter(Boolean);
        
        if (documentIdentifiers.length > 0) {
          console.log('📄 Adding nested document identifiers to newly created set:', documentIdentifiers);
          setNewlyCreatedDocumentIds(prev => {
            const updated = new Set(prev);
            documentIdentifiers.forEach(id => updated.add(id));
            return updated;
          });
          
          // Trigger document refresh with delay
          api.utils.invalidateCache.stats();
          api.utils.invalidateCache.documents();
          loadSystemStats();
          
          setTrackedTimeout(() => {
            console.log('📄 Delayed document refresh for nested animation');
            refreshDocuments();
          }, 250);
        }
      }
    }
    
    switch (eventType) {
      case 'connection':
        console.log('✅ SSE Connected:', data.message);
        break;
      case 'system_update':
        // Update system stats with real-time data from SSE
        if (data.data) {
          // Invalidate stats cache to force fresh API calls for missing data
          api.utils.invalidateCache.stats();
          
          setSystemStats(prev => ({
            ...prev,
            database: {
              ...prev.database,
              status: data.data.database?.status || 'unknown',
              healthy: data.data.database?.healthy || false,
            },
            knowledgeBase: {
              ...prev.knowledgeBase,
              qdrant_status: data.data.qdrant?.status === 'connected' ? 'active' : 'inactive',
              total_documents: data.data.qdrant?.documents || prev.knowledgeBase?.total_documents || 0,
              total_chunks: data.data.qdrant?.chunks || prev.knowledgeBase?.total_chunks || 0,
              // Force refresh of contextual_documents by calling API
              contextual_documents: prev.knowledgeBase?.contextual_documents || 0,
            },
            processing: {
              activeSessions: data.data.processing?.activeSessions || 0,
              totalProcessing: data.data.processing?.totalProcessing || 0,
            },
            lastUpdated: new Date(),
          }));
          
          // Trigger background refresh of knowledge base stats to get complete data
          setTimeout(() => {
            api.stats.getKnowledgeBase().then(kbStats => {
              setSystemStats(prev => ({
                ...prev,
                knowledgeBase: {
                  ...prev.knowledgeBase,
                  ...kbStats, // This will include contextual_documents and other missing fields
                },
              }));
            }).catch(error => {
              console.error('Failed to refresh knowledge base stats:', error);
            });
          }, 100); // Small delay to avoid race conditions
        }
        break;

      case 'processing_progress':
        // Check if this processing_progress event contains document creation info
        if (data.data && data.data.data && data.data.data.step === 'document_created') {
          console.log('📄 Document created via processing_progress event!', data.data.data);
          const nestedEventData = data.data.data;
          
          // Extract identifiers
          const documentIdentifiers = [
            nestedEventData.documentId,
            nestedEventData.url,
            nestedEventData.title
          ].filter(Boolean);
          
          if (documentIdentifiers.length > 0) {
            console.log('📄 Adding processing_progress document identifiers:', documentIdentifiers);
            setNewlyCreatedDocumentIds(prev => {
              const updated = new Set(prev);
              documentIdentifiers.forEach(id => updated.add(id));
              return updated;
            });
            
            // Trigger document refresh
            api.utils.invalidateCache.stats();
            api.utils.invalidateCache.documents();
            loadSystemStats();
            
            setTrackedTimeout(() => {
              console.log('📄 Delayed document refresh for processing_progress animation');
              refreshDocuments();
            }, 250);
          }
        }
        
        updateDocumentProgress(data.sessionId, data.progress);
        break;
      case 'chunk_update':
        updateChunkStatus(data.chunkId, data.status);
        break;
      case 'system_stats':
        setSystemStats(prev => ({ ...prev, ...data.stats }));
        break;
        
      // Document creation - immediate stats refresh for real-time count update
      case 'document_created':
        console.log('📄 Document created, refreshing selectively:', data);
        // Track this as a newly created document for animation
        if (data.documentId || data.url) {
          const documentId = data.documentId || data.url;
          setNewlyCreatedDocumentIds(prev => new Set([...prev, documentId]));
          console.log('📄 Marked document as newly created for animation:', documentId);
        }
        // Only invalidate stats and documents, not all cache
        api.utils.invalidateCache.stats();
        api.utils.invalidateCache.documents();
        // Immediate stats refresh with no delay for real-time feedback
        loadSystemStats();
        // Also refresh documents list to show new document
        refreshDocuments();
        // Single delayed refresh to ensure DB commit is visible
        setTrackedTimeout(() => {
          console.log('📄 Double-checking stats after document creation');
          api.utils.invalidateCache.stats();
          loadSystemStats();
        }, 500);
        break;
        
      // Document refresh events - trigger when processing completes
      case 'processing_complete':
      case 'file_processing_complete':
      case 'session_complete':
      case 'content_processed':
        console.log('🔄 Refreshing documents due to processing completion:', eventType);
        
        // Mark corresponding upload queue item as completed
        if (data.sessionId) {
          markSessionCompleted(data.sessionId);
        }
        
        // Selectively invalidate only relevant cache
        api.utils.invalidateCache.stats();
        api.utils.invalidateCache.documents();
        // Immediate stats refresh (no delay)
        loadSystemStats();
        // Refresh documents to show newly processed content  
        refreshDocuments();
        break;
      
      // Handle chunk processing completion to refresh when all chunks are done
      case 'chunk_processing_complete':
        // Check if this was the last chunk by looking at the data
        if (data.chunkData && data.chunkData.currentChunk === data.chunkData.totalChunks) {
          console.log('🔄 All chunks completed, refreshing documents');
          api.utils.invalidateCache.stats();
          api.utils.invalidateCache.documents();
          refreshDocuments();
          loadSystemStats();
        }
        break;
        
      // Handle session_updated events that contain step-based updates
      case 'session_updated':
        console.log('📋 Session updated event:', data);
        // Check if this is a document creation step
        if (data.step === 'document_created') {
          console.log('📄 Document created via session_updated, processing...', data);
          // Extract all possible identifiers for matching
          const documentIdentifiers = [
            data.documentId,
            data.url,
            data.title
          ].filter(Boolean);
          
          if (documentIdentifiers.length > 0) {
            console.log('📄 Adding document identifiers to newly created set:', documentIdentifiers);
            setNewlyCreatedDocumentIds(prev => {
              const updated = new Set(prev);
              documentIdentifiers.forEach(id => updated.add(id));
              return updated;
            });
          }
          
          // Trigger document refresh with delay to ensure DB commit is visible
          api.utils.invalidateCache.stats();
          api.utils.invalidateCache.documents();
          loadSystemStats();
          
          // Add delay to ensure document appears in list before animation
          setTrackedTimeout(() => {
            console.log('📄 Delayed document refresh for animation');
            refreshDocuments();
          }, 250);
        }
        break;
        
      case 'error':
        console.error('SSE Error:', data.message);
        break;
      default:
        console.log('Unknown SSE message type:', eventType);
    }
  };

  // Load initial data and restore upload sessions
  useEffect(() => {
    console.log('🚀 App useEffect running - initial data load');
    loadInitialData();
    restoreUploadSessions();
    
    // Clean up stale upload queue items after initial data load
    setTrackedTimeout(() => {
      cleanupStaleUploadItems();
    }, 1000);
    
    // FORCE REFRESH DOCUMENTS AFTER 2 SECONDS (debugging)
    setTrackedTimeout(() => {
      console.log('🚀 Force refresh documents after delay');
      refreshDocuments();
    }, 2000);
  }, []); // Empty dependency array to prevent circular dependencies

  // Intelligent unified polling strategy to prevent memory leaks
  useEffect(() => {
    const hasActiveProcessing = uploadQueue.some(f => 
      f.status === 'processing' || f.status === 'uploading'
    ) || systemStats.processing?.totalProcessing > 0;

    // Single interval that handles both stats and documents intelligently
    const pollFrequency = hasActiveProcessing ? 8000 : 15000; // 8s active, 15s idle
    
    console.log(`📊 Starting unified polling (${pollFrequency/1000}s interval, active: ${hasActiveProcessing})`);
    
    const unifiedInterval = setInterval(() => {
      console.log('📊 Unified poll: refreshing data with smart cache management');
      
      // Smart cache invalidation - only invalidate stats during active processing
      if (hasActiveProcessing) {
        api.utils.invalidateCache.stats();
      }
      
      // Load stats (lightweight)
      loadSystemStats();
      
      // Only refresh documents occasionally to reduce memory usage
      if (hasActiveProcessing || (Date.now() % 30000 < pollFrequency)) { // Every ~30s when idle
        refreshDocuments();
      }
    }, pollFrequency);
    
    return () => {
      console.log('📊 Stopping unified polling');
      clearInterval(unifiedInterval);
    };
  }, [uploadQueue, systemStats.processing?.totalProcessing]);

  // Prevent page refresh during active processing
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      const hasActiveProcessing = uploadQueue.some(f => 
        f.status === 'processing' || f.status === 'uploading'
      ) || systemStats.processing?.totalProcessing > 0;

      if (hasActiveProcessing) {
        const message = 'Processing is currently active. Refreshing the page will interrupt the upload/processing. Are you sure you want to continue?';
        event.preventDefault();
        event.returnValue = message; // For older browsers
        return message; // For modern browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [uploadQueue, systemStats.processing?.totalProcessing]);

  const loadInitialData = async () => {
    try {
      // Clear cache selectively to ensure fresh initial data
      api.utils.invalidateCache.stats();
      api.utils.invalidateCache.documents();
      
      await Promise.all([
        refreshDocuments(),
        loadSystemStats(),
        checkStuckProcessing(),
      ]);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const restoreUploadSessions = () => {
    try {
      const savedSessions = localStorage.getItem('autollama_upload_sessions');
      if (savedSessions) {
        const sessions = JSON.parse(savedSessions);
        console.log('🔄 Restoring upload sessions from localStorage:', sessions.length);
        
        sessions.forEach(session => {
          // Only restore sessions that were processing
          if (session.status === 'processing' || session.status === 'uploading') {
            // Mark as reconnecting and add to queue
            addToUploadQueue({
              ...session,
              status: 'reconnecting',
              reconnected: true
            });
            
            // Try to reconnect to the session
            reconnectToSession(session.sessionId);
          }
        });
      }
    } catch (error) {
      console.error('Failed to restore upload sessions:', error);
      // Clear corrupted data
      localStorage.removeItem('autollama_upload_sessions');
    }
  };

  const reconnectToSession = async (sessionId) => {
    try {
      // Check if session is still active on server
      const response = await fetch(`/api/upload-session/${sessionId}`);
      if (response.ok) {
        const sessionData = await response.json();
        
        if (sessionData.status === 'processing') {
          // Session is still active, reconnect to SSE stream
          console.log('🔗 Reconnecting to active session:', sessionId);
          updateUploadStatus(sessionId, 'processing');
          
          // Clean up any existing EventSource for this session first
          cleanupEventSource(sessionId);
          
          // Reconnect to SSE stream for this session
          const eventSource = new EventSource(`/api/session-stream/${sessionId}`);
          eventSourcesRef.current.set(sessionId, eventSource);
          
          eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleRealTimeUpdate(data);
          };
          
          eventSource.onerror = () => {
            console.warn('SSE reconnection failed for session:', sessionId);
            cleanupEventSource(sessionId);
            updateUploadStatus(sessionId, 'failed');
          };
        } else {
          // Session completed or failed while offline
          updateUploadStatus(sessionId, sessionData.status);
          if (sessionData.status === 'completed') {
            // Refresh documents to show new content
            refreshDocuments();
            loadSystemStats();
          }
        }
      } else {
        // Session not found, mark as failed
        updateUploadStatus(sessionId, 'failed');
      }
    } catch (error) {
      console.error('Failed to reconnect to session:', sessionId, error);
      updateUploadStatus(sessionId, 'failed');
    }
  };

  const checkStuckProcessing = async () => {
    try {
      // Check for stuck upload sessions using cleanup status
      const response = await fetch('/api/cleanup-status');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.current_stuck_sessions > 0) {
          const shouldRecover = window.confirm(
            `Found ${data.current_stuck_sessions} interrupted processing session(s). ` +
            'Would you like to clean them up and allow new uploads?'
          );
          
          if (shouldRecover) {
            const cleanupResponse = await fetch('/api/cleanup-sessions', { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ threshold: 5 }) // 5 minute threshold
            });
            
            if (cleanupResponse.ok) {
              const cleanupData = await cleanupResponse.json();
              console.log('🧹 Cleaned up stuck processing sessions:', cleanupData.message);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to check stuck processing:', error);
    }
  };

  const refreshDocuments = useCallback(async (reset = false) => {
    try {
      console.log('🔄 refreshDocuments called - force cache clear and fetch latest');
      // Force clear only document cache before fetching documents
      api.utils.invalidateCache.documents();
      
      // Flexible document fetch limit
      const fetchLimit = settings.settings?.ui?.documentsPerPage || 100; // Default to 100 documents
      console.log(`🔄 Fetching ${fetchLimit} documents (configurable limit)`);
      
      const docs = await api.documents.getAll({ 
        limit: fetchLimit,
        offset: 0
      });
      
      // Documents are already sorted by database (ORDER BY created_time DESC)
      const rawDocuments = docs?.documents || [];
      const totalCount = docs?.pagination?.total || 0;
      
      // Transform documents to standardize field names and status
      const documents = rawDocuments.map(transformDocument);
      
      console.log('📅 LATEST DOCUMENTS from API (first 5):');
      documents.slice(0, 5).forEach((doc, i) => {
        console.log(`  ${i+1}. "${doc.title?.substring(0, 50)}" - ${doc.created_time} - Status: ${doc.processingStatus}`);
      });
      
      console.log('📋 Setting documents in state:', documents.length, 'visible,', totalCount, 'total documents');
      console.log('🔍 DEBUG: Refresh limit vs display - fetched:', documents.length, 'will display up to 24 in grid');
      
      setDocuments(documents);
      setTotalDocumentCount(totalCount);
    } catch (error) {
      console.error('❌ Failed to load documents:', error);
    }
  }, []); // Simplified - access api and settings directly inside function

  const loadSystemStats = useCallback(async () => {
    try {
      console.log('📊 loadSystemStats called - force clearing stats cache');
      // Force clear cache before stats fetch
      api.utils.invalidateCache.stats();
      
      const [kbStats, dbStats, health] = await Promise.all([
        api.stats.getKnowledgeBase(),
        api.stats.getDatabase(),
        api.stats.getHealth(),
      ]);
      
      console.log('📊 Raw stats from API:');
      console.log('  Knowledge Base:', kbStats);
      console.log('  Database:', dbStats);
      console.log('  Health:', health);
      
      const newStats = {
        knowledgeBase: kbStats,
        database: dbStats,
        health: health,
        lastUpdated: new Date(),
      };
      
      console.log('📊 Setting new stats in state:', newStats);
      setSystemStats(newStats);
    } catch (error) {
      console.error('❌ Failed to load system stats:', error);
    }
  }, []); // Simplified - access api directly inside function

  // Memory monitoring to prevent browser reloads
  useEffect(() => {
    const checkMemoryUsage = () => {
      if (performance.memory) {
        const usage = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
        const usedMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
        const totalMB = Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024);
        
        if (usage > 0.8) {
          console.warn(`⚠️ High memory usage: ${usedMB}MB / ${totalMB}MB (${Math.round(usage * 100)}%)`);
          // Trigger aggressive cleanup
          api.utils.invalidateCache.all();
          
          // Force garbage collection if available (dev tools)
          if (window.gc) {
            window.gc();
          }
        } else if (usage > 0.6) {
          console.log(`📊 Memory usage: ${usedMB}MB / ${totalMB}MB (${Math.round(usage * 100)}%)`);
        }
      }
    };
    
    // Check memory every 30 seconds
    const memoryInterval = setInterval(checkMemoryUsage, 30000);
    
    return () => clearInterval(memoryInterval);
  }, [api]);

  const updateDocumentProgress = (sessionId, progress) => {
    setDocuments(prev => prev.map(doc => 
      doc.sessionId === sessionId 
        ? { ...doc, processingProgress: progress }
        : doc
    ));
  };

  const updateChunkStatus = (chunkId, status) => {
    if (selectedDocument) {
      setSelectedDocument(prev => ({
        ...prev,
        chunks: prev.chunks?.map(chunk =>
          chunk.chunk_id === chunkId
            ? { ...chunk, status }
            : chunk
        ) || []
      }));
    }
  };

  // Upload queue management
  const addToUploadQueue = (files) => {
    const newFiles = files.map(file => ({
      id: generateId(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'pending',
      progress: 0,
      error: null,
      sessionId: null,
      timestamp: new Date(),
    }));
    setUploadQueue(prev => [...prev, ...newFiles]);
    return newFiles;
  };

  const updateUploadStatus = (fileId, updates) => {
    setUploadQueue(prev => {
      const newQueue = prev.map(f => 
        f.id === fileId ? { ...f, ...updates } : f
      );
      
      // Auto-cleanup completed items after a short delay to allow UI feedback
      if (updates.status === 'completed') {
        setTrackedTimeout(() => {
          setUploadQueue(current => current.filter(f => f.id !== fileId));
        }, 3000); // Remove after 3 seconds
      }
      
      // Save to localStorage for persistence
      saveUploadSessionsToStorage(newQueue);
      return newQueue;
    });
  };

  const saveUploadSessionsToStorage = (queue) => {
    try {
      // Only save sessions that are processing or uploading (not completed/failed)
      const sessionsToSave = queue
        .filter(f => f.status === 'processing' || f.status === 'uploading')
        .map(f => ({
          id: f.id,
          name: f.name,
          size: f.size,
          type: f.type,
          status: f.status,
          progress: f.progress,
          sessionId: f.sessionId,
          timestamp: f.timestamp
        }));
      
      localStorage.setItem('autollama_upload_sessions', JSON.stringify(sessionsToSave));
    } catch (error) {
      console.error('Failed to save upload sessions to localStorage:', error);
    }
  };

  const removeFromUploadQueue = (fileId) => {
    setUploadQueue(prev => prev.filter(f => f.id !== fileId));
  };

  const clearCompletedUploads = () => {
    setUploadQueue(prev => prev.filter(f => f.status !== 'completed'));
  };

  const cleanupStaleUploadItems = async () => {
    try {
      // Get current API processing sessions
      const inProgress = await api.data.getInProgress();
      const apiSessionIds = new Set(inProgress.map(session => session.id));
      
      setUploadQueue(prev => {
        const cleaned = prev.filter(item => {
          // Keep items that are not processing, or are processing and have corresponding API session
          if (item.status !== 'processing') return true;
          if (item.sessionId && apiSessionIds.has(item.sessionId)) return true;
          
          // Remove stale processing items
          console.log('🧹 Removing stale upload queue item:', item.name);
          return false;
        });
        
        if (cleaned.length !== prev.length) {
          console.log(`🧹 Cleaned ${prev.length - cleaned.length} stale upload queue items`);
          saveUploadSessionsToStorage(cleaned);
        }
        
        return cleaned;
      });
    } catch (error) {
      console.error('Failed to cleanup stale upload items:', error);
    }
  };

  const markSessionCompleted = (sessionId) => {
    // Clean up EventSource when session completes
    cleanupEventSource(sessionId);
    
    setUploadQueue(prev => {
      const updated = prev.map(item => {
        if (item.sessionId === sessionId && item.status === 'processing') {
          console.log('✅ Marking upload queue item as completed:', item.name);
          return { ...item, status: 'completed' };
        }
        return item;
      });
      
      // Auto-cleanup completed items after a short delay
      const completedItem = updated.find(item => item.sessionId === sessionId && item.status === 'completed');
      if (completedItem) {
        setTrackedTimeout(() => {
          setUploadQueue(current => current.filter(f => f.id !== completedItem.id));
        }, 3000); // Remove after 3 seconds
      }
      
      saveUploadSessionsToStorage(updated);
      return updated;
    });
  };

  const generateId = () => {
    return Math.random().toString(36).substr(2, 9);
  };

  // Navigation handlers
  const handleDocumentSelect = async (document) => {
    setSelectedDocument(document);
    setCurrentView('document');
    
    // Load document chunks if not already loaded
    if (!document.chunks) {
      try {
        const encodedUrl = btoa(document.url);
        const chunksData = await api.documents.getChunks(encodedUrl, { limit: 1000 });
        setSelectedDocument(prev => ({
          ...prev,
          chunks: chunksData?.chunks || []
        }));
      } catch (error) {
        console.error('Failed to load document chunks:', error);
      }
    }
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    setSelectedDocument(null);
    setSelectedChunk(null);
    setSelectedChunks([]);
    setChunkIndex(0);
  };

  const handleChunkSelect = (chunk, chunks = [], index = 0) => {
    setSelectedChunk(chunk);
    setSelectedChunks(chunks);
    setChunkIndex(index + 1); // 1-based index for display
  };

  const handleChunkNavigate = (newIndex) => {
    if (newIndex >= 1 && newIndex <= selectedChunks.length) {
      setChunkIndex(newIndex);
      setSelectedChunk(selectedChunks[newIndex - 1]);
    }
  };

  const handleSearchQueryChange = (query) => {
    console.log('🔄 handleSearchQueryChange called:', { query, currentView });
    setSearchQuery(query);
    
    // Switch to search view if we have a query and we're not already there
    if (query.trim() && currentView !== 'search') {
      console.log('🔄 Switching to search view');
      setCurrentView('search');
    }
    
    // If query is empty and we're in search view, go back to dashboard
    if (!query.trim() && currentView === 'search') {
      console.log('🔄 Switching to dashboard view');
      setCurrentView('dashboard');
    }
  };

  // Context value
  const contextValue = {
    // State
    currentView,
    selectedDocument,
    selectedChunk,
    selectedChunks,
    chunkIndex,
    showSettings,
    documents,
    totalDocumentCount,
    systemStats,
    searchQuery,
    searchResults,
    uploadQueue,
    newlyCreatedDocumentIds,
    
    // Settings and API
    settings: settings.settings,
    connectionStatus: settings.connectionStatus,
    updateSetting: settings.updateSetting,
    updateCategory: settings.updateCategory,
    api,
    sse,
    
    // Handlers
    setCurrentView,
    setShowSettings,
    handleDocumentSelect,
    handleBackToDashboard,
    handleChunkSelect,
    handleChunkNavigate,
    handleSearchQueryChange,
    refreshDocuments,
    loadSystemStats,
    
    // Document animation management
    clearNewlyCreatedFlag: (documentId) => {
      setNewlyCreatedDocumentIds(prev => {
        const updated = new Set(prev);
        updated.delete(documentId);
        return updated;
      });
    },
    
    // Upload queue management
    addToUploadQueue,
    updateUploadStatus,
    removeFromUploadQueue,
    clearCompletedUploads,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <Router>
        <div className="min-h-screen bg-gray-900 text-white bg-pattern">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 opacity-50" />
          
          {/* Main content */}
          <div className="relative z-10">
            <Routes>
              <Route path="/" element={<MainLayout />} />
              <Route path="/dashboard" element={<MainLayout />} />
              <Route path="/document/:id" element={<MainLayout />} />
              <Route path="/search" element={<MainLayout />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          
          {/* Settings Modal */}
          {showSettings && (
            <React.Suspense fallback={<div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>}>
              <SettingsModal />
            </React.Suspense>
          )}
          
          {/* Global Chunk Inspector Modal - For search results and other views */}
          {selectedChunk && currentView !== 'document' && (
            <React.Suspense fallback={<div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>}>
              <ErrorBoundary 
                onClose={() => {
                  setSelectedChunk(null);
                  setSelectedChunks([]);
                  setChunkIndex(0);
                }}
                fallbackTitle="Chunk Inspector Error"
              >
                <ChunkInspector
                  chunk={selectedChunk}
                  document={{ url: selectedChunk.url || selectedChunk.source }} // Provide document context from chunk
                  chunkIndex={chunkIndex}
                  totalChunks={selectedChunks.length || 1}
                  onClose={() => {
                    setSelectedChunk(null);
                    setSelectedChunks([]);
                    setChunkIndex(0);
                  }}
                  onNavigate={handleChunkNavigate}
                />
              </ErrorBoundary>
            </React.Suspense>
          )}
          
          {/* Footer */}
          <Footer />
        </div>
      </Router>
    </AppContext.Provider>
  );
}

// Main Layout Component
const MainLayout = () => {
  const { currentView, showSettings, setShowSettings } = useAppContext();

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8">
      {/* Header */}
      <Header />
      
      {/* Main Content */}
      <main className="mt-8">
        <React.Suspense fallback={<div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>}>
          {currentView === 'dashboard' && <Dashboard />}
          {currentView === 'document' && <DocumentViewer />}
          {currentView === 'search' && <Search />}
          {currentView === 'processing' && <ProcessingManager />}
          {currentView === 'chat' && <RAGChat />}
        </React.Suspense>
      </main>
    </div>
  );
};

// Header Component
const Header = () => {
  const { 
    searchQuery, 
    handleSearchQueryChange, 
    setShowSettings,
    setCurrentView,
    systemStats,
    sse 
  } = useAppContext();

  // Safety check for context initialization
  if (!handleSearchQueryChange) {
    console.warn('⚠️ Header: handleSearchQueryChange not available from context, using no-op');
  }

  return (
    <header className="text-center mb-8">
      {/* Logo and Title */}
      <div className="mb-6">
        <h1 className="text-4xl md:text-5xl font-bold mb-2 flex items-center justify-center gap-3">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer bg-transparent border-none"
          >
            <span className="text-gradient">AutoLlama</span>
          </button>
        </h1>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search documents, chunks, topics..."
            value={searchQuery}
            onChange={(e) => {
              if (handleSearchQueryChange) {
                handleSearchQueryChange(e.target.value);
              } else {
                console.warn('⚠️ Header: handleSearchQueryChange not available, ignoring search input');
              }
            }}
            className="input-primary pl-10"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentView('chat')}
            className="btn-primary"
          >
            <MessageCircle className="w-5 h-5" />
            AI Chat
          </button>
          
          <button 
            onClick={() => setCurrentView('processing')}
            className="btn-secondary"
          >
            <FileText className="w-5 h-5" />
            Process
          </button>
          
          <button 
            onClick={() => setShowSettings(true)}
            className="btn-secondary"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};






// Footer Component
const Footer = () => {
  const { systemStats, sse } = useAppContext();

  return (
    <footer className="text-center p-4 text-xs text-gray-500 relative z-10 border-t border-gray-800 mt-16">
      <div className="flex flex-wrap justify-center items-center gap-4">
        <span>Your Knowledge Deserves Better</span>
        <span>•</span>
        <span>Version 2.3</span>
      </div>
    </footer>
  );
};

export default App;
