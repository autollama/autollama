import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Brain, Search, BarChart3, Download, ExternalLink, Clock, CheckCircle, AlertCircle, Loader, File } from 'lucide-react';
import { useAppContext } from '../../App';
import ChunkInspector from './ChunkInspector';
import ErrorBoundary from '../common/ErrorBoundary';

// Utility function to extract filename from URL
const extractFilename = (url) => {
  if (!url) return null;
  
  try {
    // Handle file:// URLs
    if (url.startsWith('file://')) {
      const filename = url.replace('file://', '');
      return filename;
    }
    
    // Handle regular URLs - extract filename from path
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop();
    
    // Return filename if it exists and has an extension
    if (filename && filename.includes('.')) {
      return decodeURIComponent(filename);
    }
    
    // Fallback: return the URL without protocol
    return url.replace(/^https?:\/\//, '');
  } catch (error) {
    // If URL parsing fails, try simple extraction
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1];
    
    if (lastPart && lastPart.includes('.')) {
      return decodeURIComponent(lastPart);
    }
    
    // Final fallback: return cleaned URL
    return url.replace(/^(https?:\/\/|file:\/\/)/, '');
  }
};

// Utility function to truncate filename for display
const truncateFilename = (filename, maxLength = 50) => {
  if (!filename || filename.length <= maxLength) return filename;
  
  // Try to keep the file extension visible
  const lastDot = filename.lastIndexOf('.');
  if (lastDot > 0 && filename.length - lastDot < 8) {
    const name = filename.substring(0, lastDot);
    const ext = filename.substring(lastDot);
    const availableLength = maxLength - ext.length - 3; // -3 for "..."
    
    if (availableLength > 10) {
      return `${name.substring(0, availableLength)}...${ext}`;
    }
  }
  
  // Simple truncation
  return `${filename.substring(0, maxLength - 3)}...`;
};

// Document Analysis Component - MOVED TO TOP TO PREVENT HOISTING ISSUES
const DocumentAnalysis = ({ document, chunks }) => {
  
  const getTopicAnalysis = () => {
    // Aggregate topics from all chunks
    const topicCounts = {};
    const allTopics = [];
    
    // Only collect topics from completed chunks - use transformed field names
    const completedChunks = chunks.filter(chunk => 
      (chunk.status === 'completed' || 
       chunk.status === 'complete') &&
      chunk.index !== -1  // Only count properly indexed chunks as completed
    );
    
    // Collect all topics from completed chunks - API returns camelCase
    completedChunks.forEach(chunk => {
      // API returns mainTopics (camelCase)
      const topics = chunk.mainTopics;
      if (topics && Array.isArray(topics) && topics.length > 0) {
        topics.forEach(topic => {
          allTopics.push(topic);
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        });
      }
    });
    
    // Convert to analysis format and sort by frequency
    return Object.entries(topicCounts)
      .map(([topic, frequency]) => ({
        topic,
        frequency,
        confidence: Math.min(0.95, 0.5 + (frequency / Math.max(completedChunks.length, 1)) * 0.45) // Calculate confidence based on frequency
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 6); // Top 6 topics
  };

  const getProcessingQuality = () => {
    if (!chunks.length) return { contextual: 0, entity: 0, sentiment: 0 };
    
    // Only analyze completed chunks - use same logic as Overview tab
    const completedChunks = chunks.filter(chunk => 
      (chunk.status === 'completed' || 
       chunk.status === 'complete') &&
      chunk.index !== -1  // Only count properly indexed chunks as completed
    );
    
    if (!completedChunks.length) return { contextual: 0, entity: 0, sentiment: 0 };
    
    const withContext = completedChunks.filter(c => c.contextualSummary).length;
    const withEntities = completedChunks.filter(c => {
      const entities = c.keyEntities;
      return entities && typeof entities === 'object' && Object.keys(entities).length > 0;
    }).length;
    const withSentiment = completedChunks.filter(c => c.sentiment && c.sentiment !== 'neutral').length;
    
    return {
      contextual: Math.round((withContext / completedChunks.length) * 100),
      entity: Math.round((withEntities / completedChunks.length) * 100),
      sentiment: Math.round((withSentiment / completedChunks.length) * 100)
    };
  };

  const getComprehensiveAnalysis = () => {
    if (!chunks.length) return { strengths: [], observations: [], ragReadiness: [] };
    
    // Only analyze completed chunks - use same logic as Overview tab
    const completedChunks = chunks.filter(chunk => 
      (chunk.status === 'completed' || 
       chunk.status === 'complete') &&
      chunk.index !== -1  // Only count properly indexed chunks as completed
    );
    
    if (!completedChunks.length) {
      return { 
        strengths: ['Document processing initiated'], 
        observations: ['Analysis in progress - detailed insights available after processing completes'], 
        ragReadiness: ['Preparing for semantic search capabilities'] 
      };
    }
    
    const sentiments = completedChunks.map(c => c.sentiment).filter(Boolean);
    const emotions = completedChunks.flatMap(c => c.emotions || []);
    const entities = completedChunks.flatMap(c => {
      const entityObj = c.keyEntities;
      return entityObj ? Object.values(entityObj).flat() : [];
    });
    const topics = completedChunks.flatMap(c => c.mainTopics || []);
    const contentTypes = completedChunks.map(c => c.contentType).filter(Boolean);
    const techLevels = completedChunks.map(c => c.technicalLevel).filter(Boolean);
    const categories = completedChunks.map(c => c.category).filter(Boolean);
    
    const strengths = [];
    const observations = [];
    const ragReadiness = [];
    
    // Document-specific strengths based on actual data
    if (entities.length > completedChunks.length * 0.5) {
      const uniqueEntities = [...new Set(entities)];
      strengths.push(`Rich entity network (${uniqueEntities.length} unique entities identified)`);
    }
    if (topics.length > completedChunks.length * 0.7) {
      const uniqueTopics = [...new Set(topics)];
      strengths.push(`Comprehensive topic coverage (${uniqueTopics.length} distinct topics)`);
    }
    if (completedChunks.filter(c => c.contextualSummary).length > completedChunks.length * 0.8) {
      strengths.push('Enhanced contextual embeddings for improved retrieval accuracy');
    }
    
    // Sentiment analysis
    const positiveSentiments = sentiments.filter(s => s === 'positive').length;
    const neutralSentiments = sentiments.filter(s => s === 'neutral').length;
    const negativeSentiments = sentiments.filter(s => s === 'negative').length;
    
    if (positiveSentiments > sentiments.length * 0.6) {
      strengths.push('Predominantly positive content tone');
    } else if (neutralSentiments > sentiments.length * 0.7) {
      strengths.push('Objective, informational content style');
    }
    
    // Document-specific observations
    const uniqueContentTypes = [...new Set(contentTypes)];
    const uniqueCategories = [...new Set(categories)];
    const uniqueTechLevels = [...new Set(techLevels)];
    
    if (uniqueContentTypes.length > 1) {
      observations.push(`Multi-format content: ${uniqueContentTypes.join(', ')}`);
    } else if (uniqueContentTypes[0]) {
      observations.push(`Consistent ${uniqueContentTypes[0]} content type`);
    }
    
    if (uniqueCategories.length > 0) {
      observations.push(`Primary subject areas: ${uniqueCategories.slice(0, 3).join(', ')}`);
    }
    
    if (uniqueTechLevels.length > 1) {
      observations.push(`Varied complexity levels: ${uniqueTechLevels.join(', ')}`);
    } else if (uniqueTechLevels[0]) {
      observations.push(`${uniqueTechLevels[0].charAt(0).toUpperCase() + uniqueTechLevels[0].slice(1)} technical level throughout`);
    }
    
    // Emotional content analysis
    if (emotions.length > 0) {
      const uniqueEmotions = [...new Set(emotions)];
      observations.push(`Emotional depth detected: ${uniqueEmotions.slice(0, 3).join(', ')}`);
    }
    
    // RAG readiness assessment based on actual metrics
    const contextualPercentage = Math.round((completedChunks.filter(c => c.contextualSummary).length / completedChunks.length) * 100);
    if (contextualPercentage > 70) {
      ragReadiness.push(`${contextualPercentage}% contextual enhancement coverage`);
    }
    
    if (entities.length > 0) {
      ragReadiness.push(`Entity-relationship mapping for ${entities.length} extracted entities`);
    }
    
    if (topics.length > 0) {
      ragReadiness.push(`Topic-based retrieval for ${[...new Set(topics)].length} semantic themes`);
    }
    
    ragReadiness.push(`Optimized ${completedChunks.length}-chunk structure for vector search`);
    
    // Fallbacks if no specific insights found
    if (strengths.length === 0) strengths.push('Successfully processed and embedded for semantic search');
    if (observations.length === 0) observations.push('Standard content structure with consistent formatting');
    if (ragReadiness.length === 0) ragReadiness.push('Ready for AI-powered question answering');
    
    return { strengths, observations, ragReadiness };
  };

  const topicAnalysis = getTopicAnalysis();
  const processingQuality = getProcessingQuality();
  const comprehensiveAnalysis = getComprehensiveAnalysis();
  
  // Debug logging - use same logic as other functions
  const completedChunks = chunks.filter(chunk => 
    (chunk.status === 'completed' || 
     chunk.status === 'complete') &&
    chunk.index !== -1  // Only count properly indexed chunks as completed
  );

  return (
    <div className="space-y-6">
      {/* Content Analysis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-bold mb-4">Topic Distribution</h3>
          <div className="space-y-3">
            {topicAnalysis.length > 0 ? (
              topicAnalysis.map((item, index) => (
                <div key={index}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{item.topic}</span>
                    <span className="text-gray-400">{item.frequency} mentions</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className="h-2 bg-primary-500 rounded-full"
                      style={{ width: `${item.confidence * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-gray-400">
                <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
                {chunks.some(chunk => chunk.status === 'processing') ? (
                  <>
                    <p>Topics are being analyzed...</p>
                    <p className="text-xs">AI analysis in progress. Topics will appear as chunks complete processing.</p>
                  </>
                ) : (
                  <>
                    <p>No topics detected in chunks</p>
                    <p className="text-xs">Topics may not be available for this document</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="font-bold mb-4">Processing Quality</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Contextual Enhancement</span>
                <span className="text-green-400">{processingQuality.contextual}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div className="h-2 bg-green-500 rounded-full" style={{ width: `${processingQuality.contextual}%` }}></div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Entity Recognition</span>
                <span className="text-blue-400">{processingQuality.entity}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${processingQuality.entity}%` }}></div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Sentiment Analysis</span>
                <span className="text-purple-400">{processingQuality.sentiment}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div className="h-2 bg-purple-500 rounded-full" style={{ width: `${processingQuality.sentiment}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Analysis */}
      <div className="card">
        <h3 className="font-bold mb-4">Comprehensive Analysis Report</h3>
        <div className="prose prose-invert max-w-none">
          <p className="text-gray-300 leading-relaxed">
            {(() => {
              const completedChunks = chunks.filter(chunk => 
                (chunk.status === 'completed' || 
                 chunk.status === 'complete') &&
                chunk.index !== -1  // Only count properly indexed chunks as completed
              );
              
              const processingCount = chunks.length - completedChunks.length;
              
              if (completedChunks.length === 0) {
                return `This document is currently being processed using AutoLlama's advanced contextual embedding system. ${chunks.length} chunks are being analyzed for topics, entities, and semantic relationships.`;
              }
              
              const topics = [...new Set(completedChunks.flatMap(c => c.mainTopics || []))];
              const categories = [...new Set(completedChunks.map(c => c.category).filter(Boolean))];
              const contentTypes = [...new Set(completedChunks.map(c => c.contentType).filter(Boolean))];
              
              let description = `Analysis of ${document?.title || 'this document'} reveals ${completedChunks.length} processed chunks`;
              
              if (processingCount > 0) {
                description += ` (${processingCount} still processing)`;
              }
              
              if (topics.length > 0) {
                description += ` covering primary topics: ${topics.slice(0, 3).join(', ')}`;
                if (topics.length > 3) description += ` and ${topics.length - 3} others`;
              }
              
              if (categories.length > 0) {
                description += `. Content categorized as ${categories.join(', ')}`;
              }
              
              if (contentTypes.length > 0) {
                description += ` with ${contentTypes.join(', ')} formatting`;
              }
              
              description += '. Enhanced with contextual embeddings for superior retrieval accuracy.';
              
              return description;
            })()}
          </p>
          
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-4">
              <h4 className="font-bold text-blue-300 mb-2">Strengths</h4>
              <ul className="text-sm text-blue-200 space-y-1">
                {comprehensiveAnalysis.strengths.length > 0 ? (
                  comprehensiveAnalysis.strengths.map((strength, i) => (
                    <li key={i}>• {strength}</li>
                  ))
                ) : (
                  <li>• Content successfully processed</li>
                )}
              </ul>
            </div>
            
            <div className="bg-yellow-900 bg-opacity-20 border border-yellow-700 rounded-lg p-4">
              <h4 className="font-bold text-yellow-300 mb-2">Observations</h4>
              <ul className="text-sm text-yellow-200 space-y-1">
                {comprehensiveAnalysis.observations.length > 0 ? (
                  comprehensiveAnalysis.observations.map((observation, i) => (
                    <li key={i}>• {observation}</li>
                  ))
                ) : (
                  <li>• Consistent content structure</li>
                )}
              </ul>
            </div>
            
            <div className="bg-green-900 bg-opacity-20 border border-green-700 rounded-lg p-4">
              <h4 className="font-bold text-green-300 mb-2">RAG Readiness</h4>
              <ul className="text-sm text-green-200 space-y-1">
                {comprehensiveAnalysis.ragReadiness.map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DocumentViewer = () => {
  const { selectedDocument, handleBackToDashboard, api } = useAppContext();
  
  const [chunks, setChunks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChunk, setSelectedChunk] = useState(null);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [activeView, setActiveView] = useState('overview'); // 'overview', 'chunks', 'analysis'

  // Load document chunks
  useEffect(() => {
    if (selectedDocument) {
      loadDocumentChunks();
    }
  }, [selectedDocument]);

  const loadDocumentChunks = async () => {
    if (!selectedDocument?.url) return;
    
    setLoading(true);
    try {
      const encodedUrl = btoa(selectedDocument.url);
      
      const response = await api.documents.getChunks(encodedUrl, { limit: 1000 });
      const chunks = response?.chunks || [];
      setChunks(chunks);
    } catch (error) {
      console.error('Failed to load chunks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChunkSelect = (chunk, index) => {
    // Set local state for the ChunkInspector modal
    // Use the actual chunk index from the data, not the array position
    const newChunkIndex = (chunk.index !== undefined) ? chunk.index + 1 : index + 1;
    setChunkIndex(newChunkIndex);
    setSelectedChunk(chunk);
  };

  const handleChunkNavigate = async (newIndex) => {
    try {
      setChunkIndex(newIndex);
      
      // Smart detection: Check if we have broken chunk indexing (all chunks same index)
      const indices = chunks.map(c => c.index !== undefined ? c.index : -1);
      const uniqueIndices = [...new Set(indices)];
      const hasValidIndexes = uniqueIndices.length > 1 || (uniqueIndices.length === 1 && uniqueIndices[0] > 0);
      
      if (!hasValidIndexes) {
        // Broken data: Use array position navigation
        const arrayIndex = newIndex - 1; // Convert to 0-based
        if (arrayIndex >= 0 && arrayIndex < chunks.length) {
          console.log(`🔧 Using array position navigation: chunk ${newIndex} -> array[${arrayIndex}]`);
          setSelectedChunk(chunks[arrayIndex]);
          return;
        }
      } else {
        // Good data: Use index-based navigation
        const existingChunk = chunks.find(c => c.index === (newIndex - 1));
        if (existingChunk) {
          console.log(`✅ Found chunk by index: ${newIndex - 1}`);
          setSelectedChunk(existingChunk);
          return;
        }
      }
      
      // If not found in loaded chunks, fetch it specifically by index
      const encodedUrl = btoa(selectedDocument.url);
      const response = await api.documents.getChunkByIndex(encodedUrl, newIndex - 1);
      if (response.chunk) {
        setSelectedChunk(response.chunk);
      }
    } catch (error) {
      console.error('Failed to navigate to chunk:', error);
      // Enhanced fallback: try array position for broken data
      const arrayIndex = newIndex - 1;
      if (arrayIndex >= 0 && arrayIndex < chunks.length) {
        console.log(`🔧 Fallback to array position: chunk ${newIndex} -> array[${arrayIndex}]`);
        setSelectedChunk(chunks[arrayIndex]);
      }
    }
  };

  if (!selectedDocument) {
    return (
      <div className="card">
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-gray-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">No Document Selected</h2>
          <p className="text-gray-400">Please select a document to view its details.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleBackToDashboard}
          className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        
        <div className="flex items-center gap-2">
          <button className="btn-secondary">
            <Download className="w-4 h-4" />
            Export Analysis
          </button>
          <button className="btn-secondary">
            <ExternalLink className="w-4 h-4" />
            Open Source
          </button>
        </div>
      </div>

      {/* Document Header */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary-600 bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-primary-400" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold mb-2 text-white">
              {selectedDocument.title || selectedDocument.url || 'Untitled Document'}
            </h1>
            
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-4">
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {selectedDocument.processedAt 
                  ? new Date(selectedDocument.processedAt).toLocaleDateString()
                  : 'Recently processed'
                }
              </span>
              <span>{selectedDocument.contentType || 'Document'}</span>
              <span>{chunks.length} chunks</span>
              {selectedDocument.url && (
                <span className="flex items-center gap-1 text-gray-400" title={selectedDocument.url}>
                  <File className="w-4 h-4" />
                  {truncateFilename(extractFilename(selectedDocument.url), 50)}
                </span>
              )}
              {selectedDocument.usesContextualEmbedding && (
                <span className="flex items-center gap-1 text-blue-400">
                  <Brain className="w-4 h-4" />
                  Contextually Enhanced
                </span>
              )}
            </div>
            
            {selectedDocument.summary && (
              <p className="text-gray-300 leading-relaxed">
                {selectedDocument.summary}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex items-center gap-2 bg-gray-800 bg-opacity-50 rounded-lg p-1">
        <ViewTab
          id="overview"
          label="Overview"
          icon={BarChart3}
          active={activeView === 'overview'}
          onClick={() => setActiveView('overview')}
        />
        <ViewTab
          id="chunks"
          label="Chunks"
          icon={FileText}
          active={activeView === 'chunks'}
          onClick={() => setActiveView('chunks')}
          badge={chunks.length}
        />
        <ViewTab
          id="analysis"
          label="Analysis"
          icon={Brain}
          active={activeView === 'analysis'}
          onClick={() => setActiveView('analysis')}
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="card">
          <div className="flex items-center justify-center py-12">
            <Loader className="w-8 h-8 animate-spin text-primary-400 mr-3" />
            <span className="text-lg">Loading document analysis...</span>
          </div>
        </div>
      ) : (
        <>
          {activeView === 'overview' && (
            <DocumentOverview document={selectedDocument} chunks={chunks} />
          )}
          
          {activeView === 'chunks' && (
            <ChunksView chunks={chunks} onChunkSelect={handleChunkSelect} />
          )}
          
          {activeView === 'analysis' && (
            <DocumentAnalysis document={selectedDocument} chunks={chunks} />
          )}
        </>
      )}

      {/* Chunk Inspector Modal */}
      {selectedChunk && (
        <ErrorBoundary 
          onClose={() => setSelectedChunk(null)}
          fallbackTitle="Chunk Inspector Error"
        >
          <ChunkInspector
            chunk={selectedChunk}
            document={selectedDocument}
            chunkIndex={chunkIndex}
            totalChunks={(() => {
              if (chunks.length === 0) return 0;
              
              // Smart detection: Check if all chunks have the same index (broken data)
              const indices = chunks.map(c => c.index !== undefined ? c.index : -1);
              const uniqueIndices = [...new Set(indices)];
              const hasValidIndexes = uniqueIndices.length > 1 || (uniqueIndices.length === 1 && uniqueIndices[0] > 0);
              
              // Use proper index calculation for good data, fallback to length for broken data
              return hasValidIndexes 
                ? Math.max(...indices) + 1 
                : chunks.length;
            })()}
            onClose={() => setSelectedChunk(null)}
            onNavigate={handleChunkNavigate}
          />
        </ErrorBoundary>
      )}
    </div>
  );
};

// View Tab Component
const ViewTab = ({ id, label, icon: Icon, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
      active 
        ? 'bg-primary-600 text-white shadow-lg' 
        : 'text-gray-400 hover:text-white hover:bg-gray-700'
    }`}
  >
    <Icon className="w-4 h-4" />
    <span>{label}</span>
    {badge !== undefined && (
      <span className={`px-2 py-1 text-xs rounded-full font-bold ${
        active 
          ? 'bg-primary-800 text-primary-200' 
          : 'bg-gray-600 text-gray-200'
      }`}>
        {badge}
      </span>
    )}
  </button>
);

// Document Overview Component
const DocumentOverview = ({ document, chunks }) => {
  const processingStats = {
    total: chunks.length,
    completed: chunks.filter(c => 
      (c.status === 'completed' || 
       c.status === 'complete') &&
      c.index !== -1  // Only count properly indexed chunks as completed
    ).length,
    processing: chunks.filter(c => 
      c.status === 'processing' ||
      c.index === -1  // Treat chunks with -1 index as still processing
    ).length,
    failed: chunks.filter(c => 
      c.status === 'error' || 
      c.status === 'failed'
    ).length,
  };

  const completionRate = processingStats.total > 0 
    ? Math.round((processingStats.completed / processingStats.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Processing Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatusCard
          title="Total Chunks"
          value={processingStats.total}
          icon={FileText}
          color="text-blue-400"
        />
        <StatusCard
          title="Completed"
          value={processingStats.completed}
          icon={CheckCircle}
          color="text-green-400"
        />
        <StatusCard
          title="Processing"
          value={processingStats.processing}
          icon={Loader}
          color="text-yellow-400"
          animated={processingStats.processing > 0}
        />
        <StatusCard
          title="Failed"
          value={processingStats.failed}
          icon={AlertCircle}
          color="text-red-400"
        />
      </div>

      {/* Progress Bar */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Processing Progress</h3>
          <span className="text-sm text-gray-400">{completionRate}% Complete</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
          <div 
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${completionRate}%` }}
          />
        </div>
      </div>

      {/* Document Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary-400" />
            AI Analysis
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Content Type:</span>
              <span>{document.contentType || 'article'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Technical Level:</span>
              <span>{document.technicalLevel || 'intermediate'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Sentiment:</span>
              <span className={`${
                document.sentiment === 'positive' ? 'text-green-400' :
                document.sentiment === 'negative' ? 'text-red-400' :
                'text-gray-300'
              }`}>
                {document.sentiment || 'neutral'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Contextual Embeddings:</span>
              <span className={document.usesContextualEmbedding ? 'text-green-400' : 'text-gray-500'}>
                {document.usesContextualEmbedding ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary-400" />
            Content Statistics
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Characters:</span>
              <span>{chunks.reduce((sum, c) => sum + (c.text?.length || 0), 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Avg Chunk Size:</span>
              <span>
                {chunks.length > 0 
                  ? Math.round(chunks.reduce((sum, c) => sum + (c.text?.length || 0), 0) / chunks.length)
                  : 0
                } characters
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Processing Time:</span>
              <span>~{(() => {
                const totalSeconds = Math.round(chunks.length * 2.3);
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                return minutes > 0 ? `${minutes} min, ${seconds} sec` : `${seconds} sec`;
              })()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Storage Size:</span>
              <span>~{Math.round(chunks.length * 1.5)}KB</span>
            </div>
          </div>
        </div>
      </div>

      {/* Topics and Entities - Aggregate from Chunks */}
      <TopicsAndEntitiesCard chunks={chunks} />
    </div>
  );
};

// Chunks View Component
const ChunksView = ({ chunks, onChunkSelect }) => {
  const { settings } = useAppContext();
  const chunksPerRow = settings?.ui?.chunksPerRow || 10;
  
  const statusConfig = {
    queued: { color: 'bg-gray-500', text: 'text-gray-200' },
    processing: { color: 'bg-yellow-500 animate-pulse', text: 'text-yellow-100' },
    completed: { color: 'bg-green-500', text: 'text-green-100' },
    error: { color: 'bg-red-500', text: 'text-red-100' },
  };

  // Generate responsive grid classes for compact, engaging chunk display
  const getGridClasses = () => {
    const baseClass = "grid gap-1.5 max-h-[28rem] overflow-y-auto custom-scrollbar p-3 border border-gray-700 rounded-lg bg-gray-800 bg-opacity-30";
    // Dense responsive grid: more chunks visible per row
    return `${baseClass} grid-cols-6 sm:grid-cols-8 md:grid-cols-12 lg:grid-cols-16 xl:grid-cols-20 2xl:grid-cols-24`;
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-xl">Document Chunks</h3>
        <div className="text-sm text-gray-400">
          Click any chunk to inspect its details (responsive grid layout)
        </div>
      </div>

      <div className={getGridClasses()}>
        {chunks.map((chunk, index) => {
          // Determine chunk status using correct field names
          let chunkStatus = 'completed'; // default
          if (chunk.status === 'processing') {
            chunkStatus = 'processing';
          } else if (chunk.status === 'error' || chunk.status === 'failed') {
            chunkStatus = 'error';
          } else if (chunk.status === 'queued') {
            chunkStatus = 'queued';
          } else if (chunk.status === 'completed' || chunk.status === 'complete') {
            chunkStatus = 'completed';
          }
          
          const config = statusConfig[chunkStatus] || statusConfig.completed;
          
          return (
            <button
              key={chunk.chunk_id || index}
              onClick={() => onChunkSelect(chunk, index)}
              className={`
                chunk-glow w-full aspect-square rounded-md flex items-center justify-center text-xs font-mono font-bold
                transition-all duration-300 cursor-pointer relative overflow-hidden
                ${config.color} ${config.text}
                ${chunkStatus === 'processing' ? 'chunk-pulse' : ''}
                ${chunkStatus === 'completed' ? 'chunk-completed' : ''}
                ${chunkStatus === 'error' ? 'chunk-error' : ''}
                ${chunkStatus === 'queued' ? 'chunk-queued' : ''}
              `}
              title={`Chunk ${index + 1} - Status: ${chunk.status || 'completed'}`}
            >
              <span className="relative z-10">{index + 1}</span>
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span className="text-gray-400">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-yellow-500 rounded animate-pulse"></div>
            <span className="text-gray-400">Processing</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-500 rounded"></div>
            <span className="text-gray-400">Queued</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span className="text-gray-400">Failed</span>
          </div>
        </div>
      </div>
    </div>
  );
};


// Status Card Component
const StatusCard = ({ title, value, icon: Icon, color, animated = false }) => (
  <div className="card text-center">
    <div className="flex items-center justify-center mb-2">
      <Icon className={`w-6 h-6 ${color} ${animated ? 'animate-spin' : ''}`} />
    </div>
    <div className={`text-2xl font-bold ${color}`}>{value}</div>
    <div className="text-sm text-gray-400">{title}</div>
  </div>
);

// Topics and Entities Card Component
const TopicsAndEntitiesCard = ({ chunks }) => {
  // State for managing expanded sections
  const [expandedTopics, setExpandedTopics] = useState(false);
  const [expandedPeople, setExpandedPeople] = useState(false);
  const [expandedOrganizations, setExpandedOrganizations] = useState(false);
  const [expandedLocations, setExpandedLocations] = useState(false);

  // Aggregate topics and entities from all completed chunks
  const completedChunks = chunks.filter(chunk => 
    (chunk.status === 'completed' || 
     chunk.status === 'complete') &&
    chunk.index !== -1
  );

  // Collect all topics from chunks
  const allTopics = [];
  completedChunks.forEach(chunk => {
    if (chunk.mainTopics && Array.isArray(chunk.mainTopics)) {
      allTopics.push(...chunk.mainTopics);
    } else if (chunk.main_topics && Array.isArray(chunk.main_topics)) {
      allTopics.push(...chunk.main_topics);
    }
  });

  // Collect all entities from chunks
  const allEntities = { people: [], locations: [], organizations: [] };
  completedChunks.forEach(chunk => {
    const entities = chunk.keyEntities || chunk.key_entities;
    if (entities && typeof entities === 'object') {
      if (entities.people && Array.isArray(entities.people)) {
        allEntities.people.push(...entities.people);
      }
      if (entities.locations && Array.isArray(entities.locations)) {
        allEntities.locations.push(...entities.locations);
      }
      if (entities.organizations && Array.isArray(entities.organizations)) {
        allEntities.organizations.push(...entities.organizations);
      }
    }
  });

  // Get unique values
  const uniqueTopics = [...new Set(allTopics)].filter(Boolean);
  const uniquePeople = [...new Set(allEntities.people)].filter(Boolean);
  const uniqueLocations = [...new Set(allEntities.locations)].filter(Boolean);
  const uniqueOrganizations = [...new Set(allEntities.organizations)].filter(Boolean);

  const hasTopics = uniqueTopics.length > 0;
  const hasEntities = uniquePeople.length > 0 || uniqueLocations.length > 0 || uniqueOrganizations.length > 0;
  const isProcessing = chunks.some(chunk => 
    chunk.status === 'processing' ||
    chunk.index === -1
  );

  if (!hasTopics && !hasEntities && !isProcessing) {
    return null; // Don't show the section if no data and not processing
  }

  return (
    <div className="card">
      <h3 className="font-bold mb-4">Topics & Entities</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Topics Section */}
        <div>
          <h4 className="font-medium mb-2 text-gray-300">Main Topics</h4>
          {hasTopics ? (
            <div className="flex flex-wrap gap-2">
              {(expandedTopics ? uniqueTopics : uniqueTopics.slice(0, 12)).map((topic, i) => (
                <span key={i} className="px-3 py-1 bg-blue-600 bg-opacity-20 text-blue-300 text-sm rounded-full">
                  {topic}
                </span>
              ))}
              {uniqueTopics.length > 12 && (
                <button
                  onClick={() => setExpandedTopics(!expandedTopics)}
                  className="px-3 py-1 bg-gray-600 bg-opacity-20 text-gray-400 text-sm rounded-full hover:bg-gray-600 hover:bg-opacity-40 hover:text-gray-300 transition-colors cursor-pointer"
                  title={expandedTopics ? 'Show less' : `Show all ${uniqueTopics.length} topics`}
                >
                  {expandedTopics ? 'Show less' : `+${uniqueTopics.length - 12} more`}
                </button>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-400">
              {isProcessing ? 'Topics being analyzed...' : 'No topics detected'}
            </div>
          )}
        </div>
        
        {/* Entities Section */}
        <div>
          <h4 className="font-medium mb-2 text-gray-300">Key Entities</h4>
          {hasEntities ? (
            <div className="space-y-2 text-sm">
              {uniquePeople.length > 0 && (
                <div>
                  <span className="text-gray-400">People:</span>
                  <span className="ml-2">{(expandedPeople ? uniquePeople : uniquePeople.slice(0, 8)).join(', ')}</span>
                  {uniquePeople.length > 8 && (
                    <button
                      onClick={() => setExpandedPeople(!expandedPeople)}
                      className="text-gray-400 hover:text-gray-300 transition-colors cursor-pointer underline ml-1"
                      title={expandedPeople ? 'Show less' : `Show all ${uniquePeople.length} people`}
                    >
                      {expandedPeople ? ' Show less' : ` +${uniquePeople.length - 8} more`}
                    </button>
                  )}
                </div>
              )}
              {uniqueOrganizations.length > 0 && (
                <div>
                  <span className="text-gray-400">Organizations:</span>
                  <span className="ml-2">{(expandedOrganizations ? uniqueOrganizations : uniqueOrganizations.slice(0, 8)).join(', ')}</span>
                  {uniqueOrganizations.length > 8 && (
                    <button
                      onClick={() => setExpandedOrganizations(!expandedOrganizations)}
                      className="text-gray-400 hover:text-gray-300 transition-colors cursor-pointer underline ml-1"
                      title={expandedOrganizations ? 'Show less' : `Show all ${uniqueOrganizations.length} organizations`}
                    >
                      {expandedOrganizations ? ' Show less' : ` +${uniqueOrganizations.length - 8} more`}
                    </button>
                  )}
                </div>
              )}
              {uniqueLocations.length > 0 && (
                <div>
                  <span className="text-gray-400">Locations:</span>
                  <span className="ml-2">{(expandedLocations ? uniqueLocations : uniqueLocations.slice(0, 8)).join(', ')}</span>
                  {uniqueLocations.length > 8 && (
                    <button
                      onClick={() => setExpandedLocations(!expandedLocations)}
                      className="text-gray-400 hover:text-gray-300 transition-colors cursor-pointer underline ml-1"
                      title={expandedLocations ? 'Show less' : `Show all ${uniqueLocations.length} locations`}
                    >
                      {expandedLocations ? ' Show less' : ` +${uniqueLocations.length - 8} more`}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-400">
              {isProcessing ? 'Entities being extracted...' : 'No entities detected'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentViewer;