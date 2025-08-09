import React, { useState, useEffect, useRef } from 'react';
import { FileText, Book, GraduationCap, Link, AlertCircle, Clock, CheckCircle, Loader } from 'lucide-react';
import { useAppContext } from '../../App';

const DocumentGrid = () => {
  const { 
    documents, 
    handleDocumentSelect, 
    settings 
  } = useAppContext();

  // Track new documents for animation
  const [displayedDocuments, setDisplayedDocuments] = useState([]);
  const [newDocumentIds, setNewDocumentIds] = useState(new Set());
  const [shiftingDocumentIds, setShiftingDocumentIds] = useState(new Set());
  const [highlightedDocumentIds, setHighlightedDocumentIds] = useState(new Set());
  const [fadingDocumentIds, setFadingDocumentIds] = useState(new Set());
  const [tilesPerRow, setTilesPerRow] = useState(8); // Default estimate
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
      bg: 'bg-green-900', 
      text: 'text-green-300', 
      border: 'border-green-700', 
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

  // Calculate how many tiles fit in one row based on container width
  const calculateTilesPerRow = () => {
    if (!containerRef.current) return 8; // Default fallback
    
    const containerWidth = containerRef.current.offsetWidth;
    // Responsive tile widths: 160px (mobile), 176px (sm), 192px (md+)
    const tileWidth = window.innerWidth >= 768 ? 192 : (window.innerWidth >= 640 ? 176 : 160);
    const gap = 16; // gap-4 = 16px
    
    const tilesPerRow = Math.floor((containerWidth + gap) / (tileWidth + gap));
    return Math.max(1, tilesPerRow); // At least 1 tile
  };

  // Update tiles per row on window resize and initial mount
  useEffect(() => {
    const updateTilesPerRow = () => {
      const newTilesPerRow = calculateTilesPerRow();
      if (newTilesPerRow !== tilesPerRow) {
        console.log(`📐 Single row capacity: ${newTilesPerRow} tiles`);
        setTilesPerRow(newTilesPerRow);
      }
    };

    // Calculate on mount and window resize
    updateTilesPerRow();
    window.addEventListener('resize', updateTilesPerRow);
    
    return () => window.removeEventListener('resize', updateTilesPerRow);
  }, [tilesPerRow]);

  // Track new documents and animate them in
  useEffect(() => {
    console.log(`📋 DocumentGrid: Documents changed, total: ${documents.length}`);
    
    const previousIds = new Set(previousDocumentsRef.current.map(doc => doc.id));
    const currentIds = new Set(documents.map(doc => doc.id));
    
    console.log(`📋 DocumentGrid: Previous: ${previousIds.size}, Current: ${currentIds.size}`);
    
    // Find new documents that weren't in the previous list
    const newIds = new Set([...currentIds].filter(id => !previousIds.has(id)));
    
    if (newIds.size > 0) {
      console.log(`📋 DocumentGrid: Found ${newIds.size} completely new document IDs`);
    }
    
    // Also find documents that have moved to the front (newer timestamps)
    // This handles the case where refreshDocuments() gets the latest 20 documents
    const currentDocumentsByTime = documents.slice().sort((a, b) => 
      new Date(b.created_time || b.processedAt) - new Date(a.created_time || a.processedAt)
    );
    const previousDocumentsByTime = previousDocumentsRef.current.slice().sort((a, b) => 
      new Date(b.created_time || b.processedAt) - new Date(a.created_time || a.processedAt)
    );
    
    // Check if the newest document is actually new (not just re-ordered)
    const newestCurrent = currentDocumentsByTime[0];
    const newestPrevious = previousDocumentsByTime[0];
    
    // If we have a newest document and it's different from before, it might be new
    if (newestCurrent && (!newestPrevious || newestCurrent.id !== newestPrevious.id)) {
      newIds.add(newestCurrent.id);
    }
    
    // Also check for documents that just completed processing
    const previousCompleted = new Set(
      previousDocumentsRef.current
        .filter(doc => doc.processingStatus === 'completed')
        .map(doc => doc.id)
    );
    const currentCompleted = new Set(
      documents
        .filter(doc => doc.processingStatus === 'completed')
        .map(doc => doc.id)
    );
    const newlyCompleted = new Set([...currentCompleted].filter(id => !previousCompleted.has(id)));
    
    // Combine both new documents and newly completed ones for animation
    const allNewIds = new Set([...newIds, ...newlyCompleted]);
    
    if (allNewIds.size > 0) {
      console.log(`🎬 Multi-phase mempool animation starting for documents:`, {
        newDocuments: newIds.size,
        newlyCompleted: newlyCompleted.size,
        total: allNewIds.size,
        existingDocuments: previousDocumentsRef.current.length,
        newDocumentTitles: [...allNewIds].map(id => {
          const doc = documents.find(d => d.id === id);
          return doc ? doc.title?.substring(0, 40) : 'Unknown';
        })
      });
      
      // Clear any existing timeouts for these documents
      allNewIds.forEach(id => {
        if (animationTimeoutsRef.current.has(id)) {
          clearTimeout(animationTimeoutsRef.current.get(id));
          animationTimeoutsRef.current.delete(id);
        }
      });
      
      // Identify existing documents that need to shift right (mempool-style)
      const existingIds = new Set(
        previousDocumentsRef.current
          .filter(doc => !allNewIds.has(doc.id))
          .map(doc => doc.id)
      );
      
      console.log(`🎬 Mempool shift: ${existingIds.size} existing documents will shift right`);
      
      // Phase 1: Simultaneous shift-right + slide-in (0-600ms)
      setNewDocumentIds(allNewIds);        // New documents slide in from left
      setShiftingDocumentIds(existingIds); // Existing documents shift right
      
      // Phase 2: Stop shift animation, start highlighting (600ms)
      const highlightTimeout = setTimeout(() => {
        setNewDocumentIds(new Set());       // Stop slide animation
        setShiftingDocumentIds(new Set());  // Stop shift animation  
        setHighlightedDocumentIds(allNewIds); // Start highlight animation on new docs
        
        // Phase 3: Start fading to normal (after 2.5 seconds total)
        const fadeTimeout = setTimeout(() => {
          setHighlightedDocumentIds(new Set()); // Stop highlight animation
          setFadingDocumentIds(allNewIds); // Start fade animation
          
          // Phase 4: Complete animation cycle (after 3.5 seconds total)
          const completeTimeout = setTimeout(() => {
            setFadingDocumentIds(prev => {
              const newSet = new Set(prev);
              allNewIds.forEach(id => newSet.delete(id));
              return newSet;
            });
            
            // Clean up timeouts
            allNewIds.forEach(id => {
              animationTimeoutsRef.current.delete(id);
            });
          }, 1000); // Fade animation duration
          
          allNewIds.forEach(id => {
            animationTimeoutsRef.current.set(id, completeTimeout);
          });
        }, 1900); // Highlight duration
        
        allNewIds.forEach(id => {
          animationTimeoutsRef.current.set(id, fadeTimeout);
        });
      }, 600); // Slide-in + shift duration
      
      allNewIds.forEach(id => {
        animationTimeoutsRef.current.set(id, highlightTimeout);
      });
    }
    
    // Update displayed documents (limit to single row) and previous reference
    const visibleDocuments = documents.slice(0, tilesPerRow);
    console.log(`📐 Showing ${visibleDocuments.length} of ${documents.length} documents in single row`);
    
    setDisplayedDocuments(visibleDocuments);
    // CRITICAL FIX: Store full document list for animation detection, not just visible slice
    previousDocumentsRef.current = documents;
  }, [documents, tilesPerRow]);

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
      {/* Documents Grid - Single Row */}
      <div 
        ref={containerRef}
        className="flex gap-4 justify-start overflow-hidden" 
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
              key={doc.id || index}
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
                w-40 h-40 sm:w-44 sm:h-44 md:w-48 md:h-48 flex-shrink-0
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
                    <p className="text-xs text-gray-400 line-clamp-2">
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