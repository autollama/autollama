/**
 * Grid Animation Utilities for Mempool-Style Insertions
 * Handles FLIP animations and responsive grid calculations
 * 
 * FLIP Technique:
 * First - Capture initial positions
 * Last - Allow DOM update to occur
 * Invert - Apply inverse transform to appear in original position
 * Play - Animate to final position
 */

export const GRID_CONFIG = {
  tileWidths: {
    mobile: 160,  // grid-cols-2, w-40
    sm: 176,      // grid-cols-3, w-44  
    md: 192,      // grid-cols-4, w-48
    lg: 192,      // grid-cols-5, w-48
    xl: 192,      // grid-cols-6, w-48
  },
  gap: 16,        // gap-4 = 16px
  columns: {
    mobile: 2,    // grid-cols-2
    sm: 3,        // grid-cols-3
    md: 4,        // grid-cols-4
    lg: 5,        // grid-cols-5
    xl: 6,        // grid-cols-6
  },
  animationDuration: 600,
  staggerDelay: 50,
};

/**
 * Get current responsive breakpoint based on window width
 */
export function getCurrentBreakpoint() {
  const width = window.innerWidth;
  if (width < 640) return 'mobile';
  if (width < 768) return 'sm';
  if (width < 1024) return 'md';
  if (width < 1280) return 'lg';
  return 'xl';
}

/**
 * Calculate grid position for an item at given index
 */
export function calculateGridPosition(index, breakpoint = 'md') {
  const columns = GRID_CONFIG.columns[breakpoint];
  const tileWidth = GRID_CONFIG.tileWidths[breakpoint];
  const gap = GRID_CONFIG.gap;
  
  const row = Math.floor(index / columns);
  const col = index % columns;
  
  return {
    x: col * (tileWidth + gap),
    y: row * (tileWidth + gap),
    row,
    col,
    tileSize: tileWidth + gap,
  };
}

/**
 * Calculate transform for shifting elements between positions
 */
export function calculateShiftTransform(fromIndex, toIndex, breakpoint) {
  const fromPos = calculateGridPosition(fromIndex, breakpoint);
  const toPos = calculateGridPosition(toIndex, breakpoint);
  
  return {
    x: toPos.x - fromPos.x,
    y: toPos.y - fromPos.y,
  };
}

/**
 * Calculate how much to shift existing elements when inserting new ones
 */
export function calculateMemPoolShiftDistance(insertCount = 1, breakpoint = 'md') {
  const { tileSize } = calculateGridPosition(0, breakpoint);
  const { columns } = GRID_CONFIG;
  
  // Shift by number of new items, but max one row worth
  const shiftsInRow = Math.min(insertCount, columns[breakpoint]);
  return shiftsInRow * tileSize;
}

/**
 * FLIP Animation Controller
 * Manages smooth grid animations using First-Last-Invert-Play technique
 */
export class FLIPAnimator {
  constructor(container) {
    this.container = container;
    this.animations = new Map();
    this.breakpoint = getCurrentBreakpoint();
    this.isAnimating = false;
    
    // Performance monitoring
    this.performanceMetrics = {
      animationCount: 0,
      averageDuration: 0,
      totalFrameDrops: 0,
    };
  }

  /**
   * Capture initial state of all grid elements
   */
  captureInitialState(elements) {
    const state = new Map();
    
    elements.forEach((el, index) => {
      if (!el) return;
      
      const rect = el.getBoundingClientRect();
      const id = el.dataset.documentId || index;
      
      state.set(id, {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        element: el,
        index,
      });
    });
    
    return state;
  }

  /**
   * Apply mempool-style animation for new document insertion
   */
  async animateMemPoolInsertion(elements, initialState, newDocumentIds = []) {
    if (this.isAnimating) {
      console.log('🎬 Animation already in progress, skipping');
      return;
    }

    this.isAnimating = true;
    const startTime = performance.now();
    
    try {
      console.log(`🎬 FLIP Animation: ${newDocumentIds.length} new docs, ${elements.length} total elements`);
      
      const animations = [];
      const shiftDistance = calculateMemPoolShiftDistance(newDocumentIds.length, this.breakpoint);
      
      // Process each element
      elements.forEach((el, finalIndex) => {
        if (!el) return;
        
        const id = el.dataset.documentId || finalIndex;
        const initial = initialState.get(id);
        const isNewDocument = newDocumentIds.includes(id);
        
        if (isNewDocument) {
          // New document: slide in from left
          animations.push(this.animateNewDocumentSlideIn(el, finalIndex * GRID_CONFIG.staggerDelay));
        } else if (initial) {
          // Existing document: shift right if needed
          const final = el.getBoundingClientRect();
          const deltaX = initial.x - final.x;
          const deltaY = initial.y - final.y;
          
          if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
            animations.push(this.animateElementShift(el, deltaX, deltaY, finalIndex * (GRID_CONFIG.staggerDelay / 2)));
          }
        }
      });
      
      // Wait for all animations to complete
      await Promise.all(animations);
      
      // Post-animation highlight for new documents
      await this.addHighlightEffect(elements, newDocumentIds);
      
    } catch (error) {
      console.error('🎬 FLIP Animation error:', error);
    } finally {
      const duration = performance.now() - startTime;
      this.updatePerformanceMetrics(duration);
      this.isAnimating = false;
      
      console.log(`🎬 Animation completed in ${Math.round(duration)}ms`);
    }
  }

  /**
   * Animate new document sliding in from left
   */
  animateNewDocumentSlideIn(element, delay = 0) {
    return new Promise((resolve) => {
      // Ensure element is properly positioned for animation
      element.style.zIndex = '10';
      element.style.transform = 'translateX(-120%) scale(0.9)';
      element.style.opacity = '0';
      element.style.transition = 'none';
      
      // Force layout recalculation
      void element.offsetHeight;
      
      setTimeout(() => {
        element.style.transition = `all ${GRID_CONFIG.animationDuration}ms cubic-bezier(0.175, 0.885, 0.32, 1.275)`;
        element.style.transform = 'translateX(0) scale(1)';
        element.style.opacity = '1';
        
        // Cleanup after animation
        const cleanup = () => {
          element.style.zIndex = '';
          element.style.transition = '';
          element.style.transform = '';
          element.style.opacity = '';
          resolve();
        };
        
        element.addEventListener('transitionend', cleanup, { once: true });
        setTimeout(cleanup, GRID_CONFIG.animationDuration + 100); // Fallback
        
      }, delay);
    });
  }

  /**
   * Animate existing element shifting to new position
   */
  animateElementShift(element, deltaX, deltaY, delay = 0) {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Apply inverse transform (Invert)
        element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        element.style.transition = 'none';
        
        // Force layout
        void element.offsetHeight;
        
        // Animate to final position (Play)
        element.style.transition = `transform ${GRID_CONFIG.animationDuration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        element.style.transform = 'translate(0, 0)';
        
        const cleanup = () => {
          element.style.transform = '';
          element.style.transition = '';
          resolve();
        };
        
        element.addEventListener('transitionend', cleanup, { once: true });
        setTimeout(cleanup, GRID_CONFIG.animationDuration + 100); // Fallback
        
      }, delay);
    });
  }

  /**
   * Add highlight effect to new documents after insertion
   */
  async addHighlightEffect(elements, newDocumentIds) {
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
  }

  /**
   * Handle responsive breakpoint changes
   */
  updateBreakpoint() {
    const newBreakpoint = getCurrentBreakpoint();
    if (newBreakpoint !== this.breakpoint) {
      console.log(`🎬 Breakpoint changed: ${this.breakpoint} → ${newBreakpoint}`);
      this.breakpoint = newBreakpoint;
    }
  }

  /**
   * Update performance metrics for monitoring
   */
  updatePerformanceMetrics(duration) {
    this.performanceMetrics.animationCount++;
    this.performanceMetrics.averageDuration = 
      (this.performanceMetrics.averageDuration * (this.performanceMetrics.animationCount - 1) + duration) / 
      this.performanceMetrics.animationCount;
    
    if (duration > 1000) {
      console.warn(`🎬 Slow animation detected: ${Math.round(duration)}ms`);
      this.performanceMetrics.totalFrameDrops++;
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    return { ...this.performanceMetrics };
  }

  /**
   * Cancel all running animations
   */
  cancelAllAnimations() {
    this.animations.forEach(animation => {
      if (animation.cancel) animation.cancel();
    });
    this.animations.clear();
    this.isAnimating = false;
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.cancelAllAnimations();
    this.container = null;
  }
}

/**
 * Utility function to create and manage FLIP animations
 */
export function createFLIPAnimation(container, callback) {
  const animator = new FLIPAnimator(container);
  
  return {
    async animate(elements, newDocumentIds = []) {
      // First: Capture initial positions
      const initialState = animator.captureInitialState(elements);
      
      // Last: Allow DOM update (caller's responsibility)
      if (callback) await callback();
      
      // Get updated elements after DOM change
      const updatedElements = Array.from(container.querySelectorAll('.document-tile'));
      
      // Invert & Play: Animate to final positions
      await animator.animateMemPoolInsertion(updatedElements, initialState, newDocumentIds);
    },
    
    updateBreakpoint: () => animator.updateBreakpoint(),
    getStats: () => animator.getPerformanceStats(),
    destroy: () => animator.destroy(),
  };
}

export default FLIPAnimator;