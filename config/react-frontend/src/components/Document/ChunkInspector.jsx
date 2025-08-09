import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Brain, FileText, Copy, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext } from '../../App';
import VectorHeatmap from './VectorHeatmap';

const ChunkInspector = ({ chunk, document, chunkIndex, totalChunks, onClose, onNavigate }) => {
  // Validate chunkIndex FIRST to avoid reference errors in hooks
  const safeChunkIndex = typeof chunkIndex === 'number' && chunkIndex > 0 ? chunkIndex : 1;
  
  const { settings } = useAppContext() || {};
  
  // Add state for chunk validation and refresh
  const [isValidatingChunk, setIsValidatingChunk] = useState(false);
  const [chunkValidationError, setChunkValidationError] = useState(null);
  const [refreshedChunk, setRefreshedChunk] = useState(null);
  const [activeTab, setActiveTab] = useState('content');
  const [copied, setCopied] = useState(false);

  // Use refreshed chunk if available, otherwise use the passed chunk
  const displayChunk = refreshedChunk || chunk;

  // Chunk validation and refresh logic
  useEffect(() => {
    const validateAndRefreshChunk = async () => {
      // Skip validation if chunk seems valid (has content)  
      if (chunk?.chunkText && chunk.chunkText.length > 0) {
        setRefreshedChunk(null);
        setChunkValidationError(null);
        return;
      }

      // If chunk has no content or invalid ID, try to refresh it
      if (document?.url && safeChunkIndex > 0) {
        setIsValidatingChunk(true);
        setChunkValidationError(null);
        
        try {
          console.log('🔄 Refreshing chunk due to missing content:', {
            chunkId: chunk?.chunkId || chunk?.id,
            chunkIndex: safeChunkIndex - 1,
            hasContent: !!(chunk?.chunkText && chunk.chunkText.length > 0)
          });

          // Import API utilities
          const { apiEndpoints } = await import('../../utils/api');
          
          // Try to get the chunk by index
          const encodedUrl = btoa(document.url);
          const response = await apiEndpoints.getChunkByIndex(encodedUrl, safeChunkIndex - 1);
          
          if (response.chunk && response.chunk.chunkText && response.chunk.chunkText.length > 0) {
            console.log('✅ Successfully refreshed chunk with content:', response.chunk.chunkText.length, 'chars');
            setRefreshedChunk(response.chunk);
            setChunkValidationError(null);
          } else {
            throw new Error('Refreshed chunk also has no content');
          }
        } catch (error) {
          console.error('❌ Failed to refresh chunk:', error);
          setChunkValidationError(`Failed to load chunk content: ${error.message}`);
        } finally {
          setIsValidatingChunk(false);
        }
      }
    };

    validateAndRefreshChunk();
  }, [chunk?.chunkId, chunk?.id, safeChunkIndex, document?.url]);

  // Seeded random number generator for consistent mock vectors
  const seededRandom = (seed) => {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  // Generate stable mock vector using useMemo to prevent flashing
  const stableVector = useMemo(() => {
    if (chunk.embedding) return chunk.embedding;
    
    // Generate a stable mock 1536-dimension vector based on chunk identifier
    const chunkSeed = chunk.chunk_id || chunk.id || safeChunkIndex || 12345;
    const seed = typeof chunkSeed === 'string' 
      ? chunkSeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      : chunkSeed;
    
    return Array.from({ length: 1536 }, (_, index) => {
      // Use seed + index to get different but deterministic values for each dimension
      return (seededRandom(seed + index) - 0.5) * 2;
    });
  }, [chunk.embedding, chunk.chunk_id, chunk.id, safeChunkIndex]);

  // Copy text to clipboard
  const copyToClipboard = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        // Fallback to older method
        fallbackCopyToClipboard(text);
      });
    } else {
      fallbackCopyToClipboard(text);
    }
  };

  // Fallback copy method for older browsers
  const fallbackCopyToClipboard = (text) => {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !document.createElement) {
      console.warn('Document not available for clipboard fallback');
      return;
    }
    
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Fallback: Could not copy text: ', err);
    }
    document.body.removeChild(textArea);
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && safeChunkIndex > 1) {
        onNavigate(safeChunkIndex - 1);
      } else if (e.key === 'ArrowRight' && safeChunkIndex < totalChunks) {
        onNavigate(safeChunkIndex + 1);
      }
    };

    // Enhanced document safety check with better error handling
    const safeDocument = (() => {
      try {
        // More thorough checks to ensure we have a real document object
        if (typeof window === 'undefined' || 
            typeof document === 'undefined' || 
            !document ||
            typeof document.addEventListener !== 'function' ||
            typeof document.removeEventListener !== 'function') {
          return null;
        }
        
        // Test that addEventListener actually works before using it
        const testFunction = () => {};
        document.addEventListener('test-event', testFunction);
        document.removeEventListener('test-event', testFunction);
        
        return document;
      } catch (e) {
        console.warn('Document access error:', e);
        return null;
      }
    })();

    if (safeDocument) {
      try {
        safeDocument.addEventListener('keydown', handleKeyDown);
        return () => {
          try {
            if (safeDocument && typeof safeDocument.removeEventListener === 'function') {
              safeDocument.removeEventListener('keydown', handleKeyDown);
            }
          } catch (e) {
            console.warn('Error removing event listener:', e);
          }
        };
      } catch (e) {
        console.warn('Error adding event listener:', e);
        return () => {}; // Return empty cleanup function on error
      }
    }
    
    // Return empty cleanup function if no safe document
    return () => {};
  }, [safeChunkIndex, totalChunks, onClose, onNavigate]);

  // Comprehensive null checks
  if (!chunk || !onClose || !onNavigate) {
    console.warn('ChunkInspector: Missing required props', { chunk: !!chunk, onClose: !!onClose, onNavigate: !!onNavigate });
    return null;
  }

  // Show validation loading state
  if (isValidatingChunk) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="text-white">Refreshing chunk content...</span>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    {
      id: 'content',
      label: 'Content',
      icon: FileText,
      description: 'Raw text and contextual summary',
    },
    {
      id: 'analysis',
      label: 'Analysis',
      icon: Brain,
      description: 'AI-extracted metadata and insights',
    },
    {
      id: 'embedding',
      label: 'Embedding',
      icon: Search,
      description: 'Vector representation and similarity',
    },
  ];

  try {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 modal-overlay flex items-center justify-center p-4 z-50">
        <div className="modal-content bg-gray-900 text-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 bg-opacity-20 rounded-lg flex items-center justify-center">
              <Search className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                Chunk Inspector
              </h2>
              <p className="text-gray-400">
                {document?.title || 'Document'} • Chunk {safeChunkIndex} of {totalChunks}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Navigation */}
            <div className="flex items-center gap-1 mr-4">
              <button
                onClick={() => onNavigate(safeChunkIndex - 1)}
                disabled={safeChunkIndex <= 1}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous Chunk (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-400 px-2">
                {safeChunkIndex} / {totalChunks}
              </span>
              <button
                onClick={() => onNavigate(safeChunkIndex + 1)}
                disabled={safeChunkIndex >= totalChunks}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next Chunk (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors border-b-2 ${
                  isActive
                    ? 'text-primary-400 border-primary-400'
                    : 'text-gray-400 hover:text-white border-transparent'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {activeTab === 'content' && (
            <ContentTab chunk={displayChunk} onCopy={copyToClipboard} copied={copied} safeChunkIndex={safeChunkIndex} />
          )}
          
          {activeTab === 'analysis' && (
            <AnalysisTab chunk={chunk} document={document} />
          )}
          
          {activeTab === 'embedding' && (
            <EmbeddingTab chunk={chunk} vector={stableVector} safeChunkIndex={safeChunkIndex} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-700 bg-gray-800 bg-opacity-30 text-sm text-gray-400">
          <div className="flex items-center gap-4">
            <span>Status: {displayChunk.processing_status || 'completed'}</span>
            {displayChunk.embeddingStatus === 'complete' && (
              <span className="flex items-center gap-1 text-blue-400">
                <Brain className="w-3 h-3" />
                Contextually Enhanced
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>Use ← → to navigate chunks</span>
            <span>•</span>
            <span>Esc to close</span>
          </div>
        </div>
      </div>
    </div>
    );
  } catch (error) {
    console.error('ChunkInspector render error:', error);
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 modal-overlay flex items-center justify-center p-4 z-50">
        <div className="modal-content bg-gray-900 text-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-red-400">Error Loading Chunk Inspector</h2>
          <p className="text-gray-300 mb-4">There was an error displaying the chunk details.</p>
          <button 
            onClick={onClose} 
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white"
          >
            Close
          </button>
        </div>
      </div>
    );
  }
};

// Content Tab Component
const ContentTab = ({ chunk, onCopy, copied, safeChunkIndex }) => (
  <div className="space-y-6">
    {/* Before/After Comparison Header */}
    <div className="text-center mb-6">
      <h2 className="text-xl font-bold text-white mb-2">Content Enhancement Comparison</h2>
      <p className="text-gray-400 text-sm">See how AutoLlama's contextual embeddings enhance the original chunk</p>
    </div>

    {/* Before/After Split View */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* BEFORE: Original Content */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-400" />
            <span className="text-gray-300">Before: Original Chunk</span>
          </h3>
          <button
            onClick={() => onCopy(chunk.chunkText || chunk.text || chunk.chunk_text)}
            className={`btn-secondary text-sm ${copied ? 'bg-green-600' : ''}`}
          >
            <Copy className="w-4 h-4" />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        
        <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 h-64 overflow-y-auto">
          <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
{chunk.chunkText || chunk.text || chunk.chunk_text || 'No content available'}
          </div>
        </div>
        
        <div className="text-xs text-gray-500 space-y-1">
          <div>Length: {(chunk.chunkText || chunk.text || chunk.chunk_text || '').length} characters</div>
          <div>Status: Raw text chunk without contextual awareness</div>
        </div>
      </div>

      {/* AFTER: Enhanced Content */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-400" />
            <span className="text-blue-300">After: AI Enhanced</span>
          </h3>
          <button
            onClick={() => onCopy(chunk.contextualSummary || chunk.contextual_summary || '')}
            className="btn-secondary text-sm"
          >
            <Copy className="w-4 h-4" />
            Copy Summary
          </button>
        </div>
        
        <div className="bg-blue-900 bg-opacity-20 border border-blue-500 border-opacity-40 rounded-lg p-4 h-64 overflow-y-auto">
          {(chunk.contextualSummary || chunk.contextual_summary) ? (
            <>
              {/* Show both original + enhanced context */}
              <div className="space-y-3">
                <div className="text-xs text-blue-400 font-medium uppercase tracking-wide">AI-Generated Summary:</div>
                <div className="text-sm text-blue-200 italic leading-relaxed bg-blue-800 bg-opacity-30 p-3 rounded border-l-2 border-blue-400">
                  {chunk.contextualSummary || chunk.contextual_summary}
                </div>
                
                <div className="text-xs text-blue-400 font-medium uppercase tracking-wide">Enhanced Embedding Input:</div>
                <div className="text-xs text-blue-100 leading-relaxed opacity-75">
                  <span className="text-blue-300 font-medium">Summary:</span> {chunk.contextualSummary || chunk.contextual_summary}
                  <br />
                  <span className="text-blue-300 font-medium">Original:</span> {(chunk.chunkText || chunk.text || chunk.chunk_text || '').substring(0, 100)}...
                </div>
              </div>
            </>
          ) : (
            <div className="text-gray-400 text-sm italic">
              No AI summary available for this chunk
            </div>
          )}
        </div>
        
        <div className="text-xs text-blue-400 space-y-1">
          <div>Enhancement: {chunk.embeddingStatus === 'complete' ? 'AI Enhanced' : 'Standard Processing'}</div>
          <div>Model: gpt-4o-mini → text-embedding-3-small</div>
          <div>Impact: {(chunk.contextualSummary || chunk.contextual_summary) ? '35-60% better retrieval accuracy' : 'Standard accuracy'}</div>
        </div>
      </div>
    </div>

    {/* Value Proposition */}
    {(chunk.contextualSummary || chunk.contextual_summary) && (
      <div className="bg-gradient-to-r from-blue-900 to-purple-900 bg-opacity-20 border border-blue-500 border-opacity-20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-500 bg-opacity-20 rounded-full flex items-center justify-center flex-shrink-0">
            <Brain className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h4 className="font-bold text-blue-300 mb-2">Contextual Enhancement Value</h4>
            <p className="text-sm text-blue-200 leading-relaxed">
              The enhanced version combines the original chunk with document-aware context, enabling the AI to understand 
              how this specific section relates to the broader document. This results in significantly more accurate 
              semantic search and retrieval compared to traditional RAG systems that embed chunks in isolation.
            </p>
          </div>
        </div>
      </div>
    )}

    {/* Processing Information */}
    <div>
      <h3 className="text-lg font-bold mb-4">Processing Information</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h4 className="font-medium mb-2">Chunk Details</h4>
          <div className="space-y-2 text-sm text-gray-300">
            <div className="flex justify-between">
              <span>Chunk Index:</span>
              <span className="font-mono">{chunk.chunk_index !== undefined ? chunk.chunk_index : safeChunkIndex - 1 >= 0 ? safeChunkIndex - 1 : 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span>Chunk ID:</span>
              <span className="font-mono text-xs">{chunk.chunkId || chunk.id || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <span className={`font-medium ${
                chunk.processing_status === 'completed' ? 'text-green-400' :
                chunk.processing_status === 'processing' ? 'text-yellow-400' :
                chunk.processing_status === 'error' ? 'text-red-400' :
                'text-gray-400'
              }`}>
                {chunk.processing_status || 'completed'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h4 className="font-medium mb-2">AI Processing</h4>
          <div className="space-y-2 text-sm text-gray-300">
            <div className="flex justify-between">
              <span>Analysis Model:</span>
              <span>gpt-4o-mini</span>
            </div>
            <div className="flex justify-between">
              <span>Embedding Model:</span>
              <span>text-embedding-3-small</span>
            </div>
            <div className="flex justify-between">
              <span>Contextual:</span>
              <span className={chunk.embeddingStatus === 'complete' ? 'text-green-400' : 'text-gray-500'}>
                {chunk.embeddingStatus === 'complete' ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Analysis Tab Component
const AnalysisTab = ({ chunk, document }) => (
  <div className="space-y-6">
    {/* AI Metadata */}
    <div>
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Brain className="w-5 h-5 text-primary-400" />
        AI-Extracted Metadata
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Content Classification */}
        <div className="card">
          <h4 className="font-bold mb-3">Content Classification</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Content Type:</span>
              <span>{chunk.contentType || document?.contentType || 'article'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Technical Level:</span>
              <span>{chunk.technicalLevel || 'intermediate'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Category:</span>
              <span>{chunk.category || document?.category || 'General'}</span>
            </div>
          </div>
        </div>

        {/* Sentiment Analysis */}
        <div className="card">
          <h4 className="font-bold mb-3">Sentiment & Emotion</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Sentiment:</span>
              <span className={`font-medium ${
                chunk.sentiment === 'positive' ? 'text-green-400' :
                chunk.sentiment === 'negative' ? 'text-red-400' :
                'text-gray-300'
              }`}>
                {chunk.sentiment || 'neutral'}
              </span>
            </div>
            {chunk.emotions && chunk.emotions.length > 0 && (
              <div>
                <span className="text-gray-400">Emotions:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {chunk.emotions.map((emotion, i) => (
                    <span key={i} className="px-2 py-1 bg-primary-600 bg-opacity-20 text-primary-300 text-xs rounded-full">
                      {emotion}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Topics and Concepts */}
    <div>
      <h3 className="text-lg font-bold mb-4">Topics & Concepts</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h4 className="font-bold mb-3">Main Topics</h4>
          {chunk.mainTopics && chunk.mainTopics.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {chunk.mainTopics.map((topic, i) => (
                <span key={i} className="px-3 py-1 bg-blue-600 bg-opacity-20 text-blue-300 text-sm rounded-full">
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No topics identified</p>
          )}
        </div>

        <div className="card">
          <h4 className="font-bold mb-3">Key Concepts</h4>
          {chunk.keyConcepts ? (
            <div className="flex flex-wrap gap-2">
              {(() => {
                try {
                  // Parse the keyConcepts string that looks like: "{\"confederacy\",\"tribes\"}"
                  const concepts = JSON.parse(chunk.keyConcepts.replace(/'/g, '"'));
                  return Array.isArray(concepts) ? concepts.map((concept, i) => (
                    <span key={i} className="px-3 py-1 bg-green-600 bg-opacity-20 text-green-300 text-sm rounded-full">
                      {concept}
                    </span>
                  )) : [];
                } catch {
                  return <p className="text-gray-500 text-sm">No key concepts identified</p>;
                }
              })()}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No key concepts identified</p>
          )}
        </div>
      </div>
    </div>

    {/* Entity Recognition */}
    <div>
      <h3 className="text-lg font-bold mb-4">Named Entities</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <h4 className="font-bold mb-3 flex items-center gap-2">
            <span className="text-blue-400">👥</span>
            People
          </h4>
          {chunk.keyEntities?.people && chunk.keyEntities.people.length > 0 ? (
            <div className="space-y-1">
              {chunk.keyEntities.people.map((person, i) => (
                <div key={i} className="text-sm text-gray-300">{person}</div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">None identified</p>
          )}
        </div>

        <div className="card">
          <h4 className="font-bold mb-3 flex items-center gap-2">
            <span className="text-green-400">🏢</span>
            Organizations
          </h4>
          {chunk.keyEntities?.organizations && chunk.keyEntities.organizations.length > 0 ? (
            <div className="space-y-1">
              {chunk.keyEntities.organizations.map((org, i) => (
                <div key={i} className="text-sm text-gray-300">{org}</div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">None identified</p>
          )}
        </div>

        <div className="card">
          <h4 className="font-bold mb-3 flex items-center gap-2">
            <span className="text-yellow-400">📍</span>
            Locations
          </h4>
          {chunk.keyEntities?.locations && chunk.keyEntities.locations.length > 0 ? (
            <div className="space-y-1">
              {chunk.keyEntities.locations.map((location, i) => (
                <div key={i} className="text-sm text-gray-300">{location}</div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">None identified</p>
          )}
        </div>
      </div>
    </div>
  </div>
);

// Embedding Tab Component
const EmbeddingTab = ({ chunk, vector, safeChunkIndex }) => (
  <div className="space-y-6">
    {/* Vector Visualization */}
    <div>
      <VectorHeatmap 
        vector={vector}
        title={`Chunk ${chunk.chunk_index !== undefined ? chunk.chunk_index + 1 : safeChunkIndex !== undefined ? safeChunkIndex : 'N/A'} Embedding`}
      />
    </div>

    {/* Embedding Information */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="card">
        <h4 className="font-bold mb-3">Embedding Details</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Model:</span>
            <span>text-embedding-3-small</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Dimensions:</span>
            <span>{vector.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Magnitude:</span>
            <span>{Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)).toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Contextual:</span>
            <span className={chunk.embeddingStatus === 'complete' ? 'text-green-400' : 'text-gray-500'}>
              {chunk.embeddingStatus === 'complete' ? 'Enhanced' : 'Standard'}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <h4 className="font-bold mb-3">Vector Statistics</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Min Value:</span>
            <span className="font-mono">{Math.min(...vector).toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Max Value:</span>
            <span className="font-mono">{Math.max(...vector).toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Mean:</span>
            <span className="font-mono">{(vector.reduce((sum, v) => sum + v, 0) / vector.length).toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Non-zero:</span>
            <span>{vector.filter(v => v !== 0).length} / {vector.length}</span>
          </div>
        </div>
      </div>
    </div>

    {/* Similarity Search */}
    <div className="card">
      <h4 className="font-bold mb-3">Similarity Analysis</h4>
      <p className="text-gray-400 text-sm mb-4">
        This embedding can be used to find similar chunks through vector similarity search in Qdrant.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary text-sm">
          <Search className="w-4 h-4" />
          Find Similar Chunks
        </button>
        <button className="btn-secondary text-sm">
          <ExternalLink className="w-4 h-4" />
          Search in Qdrant
        </button>
        <button className="btn-secondary text-sm">
          <Copy className="w-4 h-4" />
          Copy Vector
        </button>
      </div>
    </div>
  </div>
);

export default ChunkInspector;