import { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import { getCurrentBreakpoint, GRID_CONFIG } from '../utils/gridAnimations';

/**
 * Custom hook for managing DocumentGrid FLIP animations
 * Provides smooth mempool-style insertions with responsive breakpoint support
 */
export function useGridAnimation(documents, containerRef) {
  const [isAnimating, setIsAnimating] = useState(false);
  const previousDocsRef = useRef([]);
  const breakpointRef = useRef(getCurrentBreakpoint());
  const pendingAnimationRef = useRef(null);
  const elementPositionsRef = useRef(new Map());

  // Performance metrics state
  const [performanceStats, setPerformanceStats] = useState({
    animationCount: 0,
    averageDuration: 0,
    totalFrameDrops: 0,
  });

  /**
   * Capture element positions for FLIP animation
   */
  const captureElementPositions = useCallback(() => {
    if (!containerRef.current) return new Map();
    
    const positions = new Map();
    const tiles = containerRef.current.querySelectorAll('.document-tile');
    
    tiles.forEach((tile, index) => {
      const rect = tile.getBoundingClientRect();
      const docId = tile.dataset.documentId;
      
      positions.set(docId || index, {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        element: tile,
        index
      });
    });
    
    console.log(`🎬 Captured ${positions.size} element positions`);
    return positions;
  }, []);

  /**
   * Perform direct FLIP animation for new documents
   */
  const performFLIPAnimation = useCallback(async (newDocumentIds = [], initialPositions) => {
    if (!containerRef.current || isAnimating) {
      console.log('🎬 Animation skipped - container not ready or already animating');
      return;
    }

    if (newDocumentIds.length === 0) {
      console.log('🎬 No new documents to animate');
      return;
    }

    console.log(`🎬 Starting FLIP animation for ${newDocumentIds.length} new documents:`, newDocumentIds);
    
    setIsAnimating(true);
    const startTime = performance.now();
    
    try {
      // Get current tiles after DOM update
      const currentTiles = Array.from(containerRef.current.querySelectorAll('.document-tile'));
      
      if (currentTiles.length === 0) {
        console.log('🎬 No tiles found after DOM update');
        return;
      }

      const animations = [];
      const currentBreakpoint = getCurrentBreakpoint();
      const { tileWidths, gap } = GRID_CONFIG;
      const shiftDistance = tileWidths[currentBreakpoint] + gap;

      console.log(`🎬 FLIP: ${currentTiles.length} tiles, shift distance: ${shiftDistance}px`);
      console.log(`🎬 Initial positions captured:`, Array.from(initialPositions.keys()));

      // Process each current tile
      currentTiles.forEach((tile, currentIndex) => {
        const docId = tile.dataset.documentId;
        const isNewDocument = newDocumentIds.includes(docId);
        
        console.log(`🎬 Processing tile ${currentIndex}: docId=${docId}, isNew=${isNewDocument}`);
        
        if (isNewDocument) {
          // New document: slide in from left
          console.log(`🎬 Animating NEW document: ${docId}`);
          animations.push(animateNewDocumentSlideIn(tile, currentIndex));
        } else {
          // Existing document: check if it needs to shift
          const initialPos = initialPositions.get(docId);
          if (initialPos) {
            const currentRect = tile.getBoundingClientRect();
            const deltaX = initialPos.x - currentRect.left;
            const deltaY = initialPos.y - currentRect.top;
            
            console.log(`🎬 Existing document ${docId}: delta=(${Math.round(deltaX)}, ${Math.round(deltaY)})`);
            
            if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
              console.log(`🎬 Animating SHIFT for: ${docId}`);
              animations.push(animateExistingDocumentShift(tile, deltaX, deltaY, currentIndex));
            } else {
              console.log(`🎬 No shift needed for: ${docId}`);
            }
          } else {
            console.log(`🎬 WARNING: No initial position found for existing document: ${docId}`);
          }
        }
      });
      
      console.log(`🎬 Total animations queued: ${animations.length}`);
      
      // Wait for all animations to complete
      await Promise.all(animations);
      
      // Add highlight effect to new documents
      await addHighlightEffect(currentTiles, newDocumentIds);
      
      const duration = performance.now() - startTime;
      console.log(`🎬 FLIP animation completed in ${Math.round(duration)}ms`);
      
      // Update performance stats
      setPerformanceStats(prev => ({
        animationCount: prev.animationCount + 1,
        averageDuration: (prev.averageDuration * prev.animationCount + duration) / (prev.animationCount + 1),
        totalFrameDrops: prev.totalFrameDrops + (duration > 1000 ? 1 : 0),
      }));
      
    } catch (error) {
      console.error('🎬 FLIP animation error:', error);
    } finally {
      setIsAnimating(false);
    }
  }, [containerRef, isAnimating]);

  /**
   * Capture positions before DOM updates (useLayoutEffect runs synchronously)
   */
  useLayoutEffect(() => {
    if (documents && documents.length > 0) {
      // Capture current positions before React updates the DOM
      elementPositionsRef.current = captureElementPositions();
    }
  });

  /**
   * Detect new documents and trigger animation AFTER DOM updates
   * Now works with displayedDocuments (paginated subset)
   */
  useEffect(() => {
    if (!documents || documents.length === 0) {
      previousDocsRef.current = [];
      return;
    }

    const prevIds = new Set(previousDocsRef.current.map(doc => doc.id));
    const currentIds = new Set(documents.map(doc => doc.id));
    
    // Find completely new documents in the displayed set
    const newDocumentIds = [...currentIds].filter(id => !prevIds.has(id));
    
    // Also detect documents that just completed processing
    const previousCompleted = new Set(
      previousDocsRef.current
        .filter(doc => doc.processingStatus === 'completed')
        .map(doc => doc.id)
    );
    const currentCompleted = new Set(
      documents
        .filter(doc => doc.processingStatus === 'completed')
        .map(doc => doc.id)
    );
    const newlyCompleted = [...currentCompleted].filter(id => !previousCompleted.has(id));
    
    // Combine new documents and newly completed ones, but only those visible in current page
    const allNewIds = [...new Set([...newDocumentIds, ...newlyCompleted])];
    
    if (allNewIds.length > 0 && previousDocsRef.current.length > 0) {
      console.log(`🎬 Displayed document change detected:`, {
        previousCount: previousDocsRef.current.length,
        currentCount: documents.length,
        newDocuments: newDocumentIds.length,
        newlyCompleted: newlyCompleted.length,
        totalNew: allNewIds.length,
        visibleNewIds: allNewIds,
        newTitles: allNewIds.slice(0, 3).map(id => {
          const doc = documents.find(d => d.id === id);
          return doc ? doc.title?.substring(0, 30) + '...' : 'Unknown';
        })
      });

      // Use the positions captured before DOM update
      const initialPositions = elementPositionsRef.current;
      
      // Cancel any pending animation
      if (pendingAnimationRef.current) {
        cancelAnimationFrame(pendingAnimationRef.current);
      }

      // Small delay to ensure DOM has updated
      pendingAnimationRef.current = requestAnimationFrame(() => {
        performFLIPAnimation(allNewIds, initialPositions);
        pendingAnimationRef.current = null;
      });
    }

    // Update previous documents reference
    previousDocsRef.current = [...documents];
    
  }, [documents, performFLIPAnimation, captureElementPositions]);

  /**
   * Animate new document sliding in from left
   */
  const animateNewDocumentSlideIn = useCallback((element, index) => {
    return new Promise((resolve) => {
      const delay = index * 50; // Stagger delay
      
      // Set initial position (off-screen left)
      element.style.zIndex = '10';
      element.style.transform = 'translateX(-120%) scale(0.9)';
      element.style.opacity = '0';
      element.style.transition = 'none';
      
      // Force layout
      void element.offsetHeight;
      
      setTimeout(() => {
        element.style.transition = 'all 600ms cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        element.style.transform = 'translateX(0) scale(1)';
        element.style.opacity = '1';
        
        const cleanup = () => {
          element.style.zIndex = '';
          element.style.transition = '';
          element.style.transform = '';
          element.style.opacity = '';
          resolve();
        };
        
        element.addEventListener('transitionend', cleanup, { once: true });
        setTimeout(cleanup, 700); // Fallback
        
      }, delay);
    });
  }, []);

  /**
   * Animate existing document shifting to new position
   */
  const animateExistingDocumentShift = useCallback((element, deltaX, deltaY, index) => {
    return new Promise((resolve) => {
      const delay = index * 25; // Shorter stagger for shifts
      
      setTimeout(() => {
        // Apply inverse transform (Invert phase)
        element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        element.style.transition = 'none';
        
        // Force layout
        void element.offsetHeight;
        
        // Animate to final position (Play phase)
        element.style.transition = 'transform 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        element.style.transform = 'translate(0, 0)';
        
        const cleanup = () => {
          element.style.transform = '';
          element.style.transition = '';
          resolve();
        };
        
        element.addEventListener('transitionend', cleanup, { once: true });
        setTimeout(cleanup, 700); // Fallback
        
      }, delay);
    });
  }, []);

  /**
   * Add highlight effect to new documents
   */
  const addHighlightEffect = useCallback(async (elements, newDocumentIds) => {
    const highlightDuration = 2000;
    const fadeDuration = 1000;
    
    // Add highlight animation
    newDocumentIds.forEach(id => {
      const element = elements.find(el => el?.dataset.documentId === id);
      if (element) {
        element.classList.add('animate-highlight-new');
      }
    });
    
    // Wait for highlight duration
    await new Promise(resolve => setTimeout(resolve, highlightDuration));
    
    // Transition to fade animation
    newDocumentIds.forEach(id => {
      const element = elements.find(el => el?.dataset.documentId === id);
      if (element) {
        element.classList.remove('animate-highlight-new');
        element.classList.add('animate-fade-to-normal');
      }
    });
    
    // Wait for fade duration
    await new Promise(resolve => setTimeout(resolve, fadeDuration));
    
    // Final cleanup
    newDocumentIds.forEach(id => {
      const element = elements.find(el => el?.dataset.documentId === id);
      if (element) {
        element.classList.remove('animate-fade-to-normal');
      }
    });
  }, []);

  /**
   * Handle responsive breakpoint changes
   */
  useEffect(() => {
    const handleResize = () => {
      const newBreakpoint = getCurrentBreakpoint();
      
      if (newBreakpoint !== breakpointRef.current) {
        console.log(`🎬 Breakpoint changed: ${breakpointRef.current} → ${newBreakpoint}`);
        breakpointRef.current = newBreakpoint;
        
        if (animatorRef.current) {
          animatorRef.current.updateBreakpoint();
        }
      }
    };

    // Debounced resize handler to prevent excessive calls
    let resizeTimeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 100);
    };

    window.addEventListener('resize', debouncedResize);
    
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimeout);
    };
  }, []);


  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Cancel pending animations
      if (pendingAnimationRef.current) {
        cancelAnimationFrame(pendingAnimationRef.current);
      }
      
      console.log('🎬 Grid animation hook cleaned up');
    };
  }, []);

  /**
   * Manual animation trigger (for testing or special cases)
   */
  const triggerAnimation = useCallback((documentIds = []) => {
    if (documentIds.length > 0) {
      const currentPositions = captureElementPositions();
      performFLIPAnimation(documentIds, currentPositions);
    }
  }, [captureElementPositions, performFLIPAnimation]);

  return {
    isAnimating,
    performanceStats,
    triggerAnimation,
    currentBreakpoint: breakpointRef.current,
  };
}

/**
 * Hook for monitoring animation performance
 */
export function useAnimationPerformance(enabled = true) {
  const [metrics, setMetrics] = useState({
    frameRate: 60,
    jankCount: 0,
    memoryUsage: 0,
    lastUpdate: Date.now(),
  });

  useEffect(() => {
    if (!enabled || !window.performance) return;

    let rafId;
    let lastFrameTime = performance.now();
    let frameCount = 0;
    let jankCount = 0;

    const measurePerformance = () => {
      const now = performance.now();
      const frameTime = now - lastFrameTime;
      
      frameCount++;
      
      // Detect jank (frame time > 16.67ms for 60fps)
      if (frameTime > 16.67) {
        jankCount++;
      }
      
      // Update metrics every second
      if (frameCount >= 60) {
        const avgFrameRate = 1000 / (frameTime / frameCount);
        
        setMetrics(prev => ({
          frameRate: Math.round(avgFrameRate),
          jankCount: prev.jankCount + jankCount,
          memoryUsage: window.performance.memory?.usedJSHeapSize || 0,
          lastUpdate: now,
        }));
        
        frameCount = 0;
        jankCount = 0;
      }
      
      lastFrameTime = now;
      rafId = requestAnimationFrame(measurePerformance);
    };

    rafId = requestAnimationFrame(measurePerformance);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [enabled]);

  return metrics;
}

export default useGridAnimation;