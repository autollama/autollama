import React, { useState, useEffect, useRef } from 'react';
import { FileText, Book, GraduationCap, Link, AlertCircle, Clock, CheckCircle, Loader } from 'lucide-react';
import { useAppContext } from '../../App';

const DocumentGrid = () => {
  const { 
    documents, 
    handleDocumentSelect, 
    settings,
    newlyCreatedDocumentIds,
    clearNewlyCreatedFlag
  } = useAppContext();

  // Track new documents for animation
  const [displayedDocuments, setDisplayedDocuments] = useState([]);
  const [newDocumentIds, setNewDocumentIds] = useState(new Set());
  const [shiftingDocumentIds, setShiftingDocumentIds] = useState(new Set());
  const [highlightedDocumentIds, setHighlightedDocumentIds] = useState(new Set());
  const [fadingDocumentIds, setFadingDocumentIds] = useState(new Set());
  const previousDocumentsRef = useRef([]);
  const animationTimeoutsRef = useRef(new Map());
  const containerRef = useRef(null);

  // Status configurations with icons and styles
  const statusConfig = {
    queued: { 
      bg: 'bg-gray-700', 
      text: 'text-gray-300', 
      border: 'border-gray-600', 
      icon: Clock,
      pulse: false 
    },
    processing: { 
      bg: 'bg-yellow-900', 
      text: 'text-yellow-300', 
      border: 'border-yellow-700', 
      icon: Loader,
      pulse: true 
    },
    completed: { 
      bg: 'bg-gray-700', 
      text: 'text-blue-300', 
      border: 'border-gray-600', 
      icon: CheckCircle,
      pulse: false 
    },
    error: { 
      bg: 'bg-red-900', 
      text: 'text-red-300', 
      border: 'border-red-700', 
      icon: AlertCircle,
      pulse: false 
    },
  };


  // Track new documents and animate them in - ONLY for truly new documents from SSE events
  useEffect(() => {
    console.log(`📋 DocumentGrid: Documents changed, total: ${documents.length}`);
    console.log(`📋 DocumentGrid: Currently marked as newly created:`, Array.from(newlyCreatedDocumentIds));
    
    // Check if any of the current documents are marked as newly created
    const currentlyNewIds = new Set();
    documents.forEach(doc => {
      // Multiple fallback strategies for ID matching
      const possibleIdentifiers = [
        doc.id,
        doc.url,
        doc.title,
        // Also check for partial URL matches in case of encoding differences
        doc.url && decodeURIComponent(doc.url),
        doc.title && doc.title.substring(0, 50) // Match by title prefix
      ].filter(Boolean);
      
      const isMarkedAsNew = possibleIdentifiers.some(identifier => 
        newlyCreatedDocumentIds.has(identifier)
      );
      
      if (isMarkedAsNew) {
        console.log(`📋 DocumentGrid: Found newly created document:`, {
          docId: doc.id,
          docUrl: doc.url,
          docTitle: doc.title,
          matchedIdentifier: possibleIdentifiers.find(id => newlyCreatedDocumentIds.has(id))
        });
        currentlyNewIds.add(doc.id);
      }
    });
    
    // If we have newly created IDs but no matching documents yet, set up retry logic
    if (newlyCreatedDocumentIds.size > 0 && currentlyNewIds.size === 0) {
      console.log(`⏳ Documents not yet loaded for newly created IDs, setting up retry...`);
      console.log(`⏳ Waiting for documents with IDs:`, Array.from(newlyCreatedDocumentIds));
      console.log(`⏳ Current documents:`, documents.map(d => ({ id: d.id, url: d.url, title: d.title?.substring(0, 30) })));
      
      // Retry after a short delay if documents haven't appeared yet
      const retryTimeout = setTimeout(() => {
        console.log(`🔄 Retrying animation check after delay...`);
        // This will trigger the useEffect again with the same data
        setDisplayedDocuments(prev => [...prev]);
      }, 500);
      
      return () => clearTimeout(retryTimeout);
    }

    if (currentlyNewIds.size > 0) {
      console.log(`🎬 Found ${currentlyNewIds.size} truly new documents from SSE events for animation:`, {
        newDocumentTitles: [...currentlyNewIds].map(id => {
          const doc = documents.find(d => d.id === id);
          return doc ? doc.title?.substring(0, 40) : 'Unknown';
        })
      });
      
      // Clear any existing timeouts for these documents
      currentlyNewIds.forEach(id => {
        if (animationTimeoutsRef.current.has(id)) {
          clearTimeout(animationTimeoutsRef.current.get(id));
          animationTimeoutsRef.current.delete(id);
        }
      });
      
      // Identify existing documents that need to shift right (mempool-style)
      const existingIds = new Set(
        documents
          .filter(doc => !currentlyNewIds.has(doc.id))
          .map(doc => doc.id)
      );
      
      console.log(`🎬 Mempool shift: ${existingIds.size} existing documents will shift right`);
      
      // Phase 1: Simultaneous shift-right + slide-in (0-600ms)
      setNewDocumentIds(currentlyNewIds);        // New documents slide in from left
      setShiftingDocumentIds(existingIds); // Existing documents shift right
      
      // Phase 2: Stop shift animation, start highlighting (600ms)
      const highlightTimeout = setTimeout(() => {
        setNewDocumentIds(new Set());       // Stop slide animation
        setShiftingDocumentIds(new Set());  // Stop shift animation  
        setHighlightedDocumentIds(currentlyNewIds); // Start highlight animation on new docs
        
        // Phase 3: Start fading to normal (after 2.5 seconds total)
        const fadeTimeout = setTimeout(() => {
          setHighlightedDocumentIds(new Set()); // Stop highlight animation
          setFadingDocumentIds(currentlyNewIds); // Start fade animation
          
          // Phase 4: Complete animation cycle (after 3.5 seconds total)
          const completeTimeout = setTimeout(() => {
            setFadingDocumentIds(prev => {
              const newSet = new Set(prev);
              currentlyNewIds.forEach(id => newSet.delete(id));
              return newSet;
            });
            
            // Clean up timeouts and clear the newly created flags
            currentlyNewIds.forEach(id => {
              animationTimeoutsRef.current.delete(id);
              // Clear the newly created flag so this document won't animate again
              const doc = documents.find(d => d.id === id);
              if (doc) {
                console.log(`🧹 Clearing newly created flags for animated document:`, {
                  docId: doc.id,
                  docUrl: doc.url,
                  docTitle: doc.title
                });
                
                // Clear all possible identifiers that might have been used
                const identifiersToClean = [
                  doc.id,
                  doc.url,
                  doc.title,
                  doc.url && decodeURIComponent(doc.url),
                  doc.title && doc.title.substring(0, 50)
                ].filter(Boolean);
                
                identifiersToClean.forEach(identifier => {
                  clearNewlyCreatedFlag(identifier);
                });
              }
            });
          }, 1000); // Fade animation duration
          
          currentlyNewIds.forEach(id => {
            animationTimeoutsRef.current.set(id, completeTimeout);
          });
        }, 1900); // Highlight duration
        
        currentlyNewIds.forEach(id => {
          animationTimeoutsRef.current.set(id, fadeTimeout);
        });
      }, 600); // Slide-in + shift duration
      
      currentlyNewIds.forEach(id => {
        animationTimeoutsRef.current.set(id, highlightTimeout);
      });
    }
    
    // Show all available documents in a proper grid layout
    const visibleDocuments = documents; // Show all documents, no artificial limit
    console.log(`📐 Showing ${visibleDocuments.length} of ${documents.length} documents in grid layout`);
    
    setDisplayedDocuments(visibleDocuments);
  }, [documents, newlyCreatedDocumentIds, clearNewlyCreatedFlag]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      // Clear all animation timeouts
      animationTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      animationTimeoutsRef.current.clear();
    };
  }, []);

  // Content type icons
  const getContentIcon = (contentType) => {
    const icons = {
      pdf: FileText,
      url: Link,
      file: FileText,
      book: Book,
      article: FileText,
      academic: GraduationCap,
      reference: Book,
    };
    return icons[contentType] || FileText;
  };


  // Format document title
  const formatTitle = (doc) => {
    return doc.title || doc.url || 'Untitled Document';
  };

  // Format processing progress
  const formatProgress = (doc) => {
    if (doc.processingProgress) {
      return `${Math.round(doc.processingProgress.percentage || 0)}%`;
    }
    return '';
  };

  if (displayedDocuments.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-gray-500">
        <div className="text-center">
          <div className="text-8xl mb-4">🦙</div>
          <h3 className="text-2xl font-bold mb-2">No Documents Yet</h3>
          <p className="text-lg text-gray-600 mb-4">
            Your digital pasture is empty! Upload some content to get started.
          </p>
          <div className="text-sm text-gray-500 space-y-1">
            <p>• Upload PDFs, documents, or paste URLs</p>
            <p>• AI will analyze and create contextual embeddings</p>
            <p>• Search and chat with your processed content</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Documents Grid - Proper Grid Layout */}
      <div 
        ref={containerRef}
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4" 
        style={{ alignItems: 'flex-start' }}>
        {displayedDocuments.map((doc, index) => {
          const config = statusConfig[doc.processingStatus] || statusConfig.queued;
          const ContentIcon = getContentIcon(doc.contentType);
          const StatusIcon = config.icon;
          const chunkCount = doc.chunkCount || 0;
          const title = formatTitle(doc);
          const progress = formatProgress(doc);
          const isSliding = newDocumentIds.has(doc.id);
          const isShifting = shiftingDocumentIds.has(doc.id);
          const isHighlighted = highlightedDocumentIds.has(doc.id);
          const isFading = fadingDocumentIds.has(doc.id);
          const isNewlyCompleted = (isSliding || isHighlighted || isFading) && doc.processingStatus === 'completed';

          return (
            <div
              key={`${doc.url}-${doc.created_time}`}
              onClick={() => handleDocumentSelect(doc)}
              className={`
                document-block relative overflow-hidden rounded-lg border-2 cursor-pointer p-3
                transition-all duration-300 hover:shadow-lg hover:shadow-primary-500/20
                ${config.bg} ${config.border} ${config.pulse ? 'animate-processing' : ''}
                ${isSliding ? 'animate-slide-in-from-left' : ''}
                ${isShifting ? 'animate-shift-right' : ''}
                ${isHighlighted ? 'animate-highlight-new' : ''}
                ${isFading ? 'animate-fade-to-normal' : ''}
                ${isNewlyCompleted ? 'animate-mempool-glow' : ''}
                h-40 sm:h-44 md:h-48 flex-shrink-0
              `}
              title={`${title} - ${doc.processingStatus}`}
              style={{
                '--normal-border': config.border.includes('gray-600') ? '#4b5563' : 
                                 config.border.includes('yellow-700') ? '#a16207' :
                                 config.border.includes('green-700') ? '#15803d' :
                                 config.border.includes('red-700') ? '#b91c1c' : '#4b5563',
                '--normal-bg': config.bg.includes('gray-700') ? '#374151' :
                              config.bg.includes('yellow-900') ? '#451a03' :
                              config.bg.includes('green-900') ? '#14532d' :
                              config.bg.includes('red-900') ? '#450a0a' : '#374151'
              }}
            >
              {/* Background Pattern */}
              <div className="absolute inset-0 opacity-5">
                <div className="w-full h-full bg-gradient-to-br from-white to-transparent" />
              </div>

              {/* Content */}
              <div className="relative h-full flex flex-col justify-between">
                {/* Header */}
                <div className="flex items-start justify-between gap-1 mb-2">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <ContentIcon className="w-4 h-4 text-primary-400 flex-shrink-0" />
                    <h3 className="font-semibold text-white truncate text-xs">
                      {title}
                    </h3>
                  </div>
                  <StatusIcon className={`w-3 h-3 flex-shrink-0 ${config.text}`} />
                </div>

                {/* Metadata */}
                <div className="space-y-1 flex-1">
                  {doc.summary && (
                    <p className="text-xs text-gray-400 line-clamp-4">
                      {doc.summary}
                    </p>
                  )}
                  
                  {/* Tags */}
                  {doc.mainTopics && doc.mainTopics.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {doc.mainTopics.slice(0, 2).map((topic, i) => (
                        <span 
                          key={i}
                          className="px-1.5 py-0.5 bg-primary-600 bg-opacity-20 text-primary-300 text-xs rounded-full"
                        >
                          {topic}
                        </span>
                      ))}
                      {doc.mainTopics.length > 2 && (
                        <span className="px-1.5 py-0.5 text-gray-400 text-xs">
                          +{doc.mainTopics.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-600 border-opacity-30">
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-medium ${config.text}`}>
                      {doc.processingStatus === 'error' ? 'Error' : `${chunkCount}`}
                    </span>
                    {progress && (
                      <span className="text-xs text-gray-400">
                        {progress}
                      </span>
                    )}
                  </div>
                  
                  {/* Contextual Embeddings Badge */}
                  {doc.usesContextualEmbedding && (
                    <div className="flex items-center" title="Uses Contextual Embeddings">
                      <span className="text-xs font-bold text-green-400">🧠</span>
                    </div>
                  )}
                </div>

                {/* Processing Progress Bar */}
                {doc.processingStatus === 'processing' && doc.processingProgress && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                    <div 
                      className="h-full bg-yellow-400 transition-all duration-300"
                      style={{ width: `${doc.processingProgress.percentage || 0}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DocumentGrid;