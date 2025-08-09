import { useState, useEffect, useCallback, useRef } from 'react';
import perfMonitor, { getMemoryUsage, getConnectionInfo, getPerformanceRecommendations } from '../utils/performance';

// Hook for monitoring component performance
export const usePerformanceMonitor = (componentName) => {
  const timerRef = useRef(null);
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    // Start timing on mount
    perfMonitor.startTimer(componentName, 'render');
    
    return () => {
      // End timing on unmount
      const result = perfMonitor.endTimer(componentName, 'render');
      if (result) {
        setMetrics(result);
      }
    };
  }, [componentName]);

  const timeOperation = useCallback((operation, operationName) => {
    return perfMonitor.timeFunction(operation, operationName, 'component', {
      component: componentName,
    });
  }, [componentName]);

  return {
    metrics,
    timeOperation,
  };
};

// Hook for monitoring API call performance
export const useApiPerformance = () => {
  const [apiMetrics, setApiMetrics] = useState({
    totalCalls: 0,
    averageResponseTime: 0,
    slowCalls: 0,
    errorRate: 0,
    recentCalls: [],
  });

  const timeApiCall = useCallback(async (apiCall, endpoint) => {
    const startTime = performance.now();
    let success = true;
    let error = null;

    try {
      const result = await apiCall();
      return result;
    } catch (err) {
      success = false;
      error = err.message;
      throw err;
    } finally {
      const duration = performance.now() - startTime;
      
      setApiMetrics(prev => {
        const newCall = {
          endpoint,
          duration: Math.round(duration),
          success,
          error,
          timestamp: new Date().toISOString(),
        };

        const recentCalls = [newCall, ...prev.recentCalls.slice(0, 19)]; // Keep last 20
        const totalCalls = prev.totalCalls + 1;
        const slowCalls = prev.slowCalls + (duration > 2000 ? 1 : 0);
        const errors = recentCalls.filter(call => !call.success).length;
        
        return {
          totalCalls,
          averageResponseTime: Math.round(
            recentCalls.reduce((sum, call) => sum + call.duration, 0) / recentCalls.length
          ),
          slowCalls,
          errorRate: Math.round((errors / recentCalls.length) * 100),
          recentCalls,
        };
      });
    }
  }, []);

  return {
    metrics: apiMetrics,
    timeApiCall,
  };
};

// Hook for system performance monitoring
export const useSystemPerformance = (interval = 5000) => {
  const [systemMetrics, setSystemMetrics] = useState({
    memory: { supported: false },
    connection: { supported: false },
    performance: null,
    recommendations: [],
  });

  const updateMetrics = useCallback(() => {
    const memory = getMemoryUsage();
    const connection = getConnectionInfo();
    const performance = perfMonitor.getStats();
    const recommendations = getPerformanceRecommendations();

    setSystemMetrics({
      memory,
      connection,
      performance,
      recommendations,
      lastUpdated: new Date().toISOString(),
    });
  }, []);

  useEffect(() => {
    // Initial update
    updateMetrics();

    // Set up interval for updates
    const intervalId = setInterval(updateMetrics, interval);

    return () => clearInterval(intervalId);
  }, [updateMetrics, interval]);

  return {
    metrics: systemMetrics,
    refresh: updateMetrics,
  };
};

// Hook for measuring render performance
export const useRenderPerformance = (componentName, dependencies = []) => {
  const [renderMetrics, setRenderMetrics] = useState({
    renderCount: 0,
    averageRenderTime: 0,
    lastRenderTime: 0,
    slowRenders: 0,
  });

  const renderStartTime = useRef(null);

  useEffect(() => {
    renderStartTime.current = performance.now();
  });

  useEffect(() => {
    if (renderStartTime.current) {
      const renderTime = performance.now() - renderStartTime.current;
      
      setRenderMetrics(prev => {
        const renderCount = prev.renderCount + 1;
        const totalTime = (prev.averageRenderTime * prev.renderCount) + renderTime;
        const slowRenders = prev.slowRenders + (renderTime > 16 ? 1 : 0); // 16ms = 60fps

        return {
          renderCount,
          averageRenderTime: Math.round(totalTime / renderCount * 100) / 100,
          lastRenderTime: Math.round(renderTime * 100) / 100,
          slowRenders,
        };
      });

      // Log slow renders
      if (renderTime > 16) {
        console.warn(`🐌 Slow render in ${componentName}: ${Math.round(renderTime)}ms`);
      }

      renderStartTime.current = null;
    }
  }, dependencies);

  return renderMetrics;
};

// Hook for lazy loading with performance tracking
export const useLazyLoad = (threshold = 0.1) => {
  const [isVisible, setIsVisible] = useState(false);
  const [loadTime, setLoadTime] = useState(null);
  const elementRef = useRef(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const startTime = performance.now();

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setLoadTime(Math.round(performance.now() - startTime));
          observer.disconnect();
        }
      },
      { threshold }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [threshold]);

  return {
    ref: elementRef,
    isVisible,
    loadTime,
  };
};

// Hook for debounced operations with performance tracking
export const useDebounceWithPerformance = (callback, delay, operationName) => {
  const [metrics, setMetrics] = useState({
    callCount: 0,
    executionCount: 0,
    averageDelay: 0,
    lastExecutionTime: null,
  });

  const timeoutRef = useRef(null);
  const callTimesRef = useRef([]);

  const debouncedCallback = useCallback((...args) => {
    const callTime = performance.now();
    callTimesRef.current.push(callTime);

    setMetrics(prev => ({
      ...prev,
      callCount: prev.callCount + 1,
    }));

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      const executionTime = performance.now();
      const actualDelay = executionTime - callTime;

      try {
        await perfMonitor.timeFunction(
          () => callback(...args),
          operationName,
          'debounced'
        );

        setMetrics(prev => {
          const executionCount = prev.executionCount + 1;
          const totalDelay = (prev.averageDelay * prev.executionCount) + actualDelay;

          return {
            ...prev,
            executionCount,
            averageDelay: Math.round(totalDelay / executionCount),
            lastExecutionTime: new Date().toISOString(),
          };
        });
      } catch (error) {
        console.error(`Error in debounced operation ${operationName}:`, error);
      }
    }, delay);
  }, [callback, delay, operationName]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    debouncedCallback,
    metrics,
  };
};

// Hook for virtual scrolling with performance optimization
export const useVirtualScroll = (items, itemHeight, containerHeight, overscan = 5) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeout = useRef(null);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = items.slice(startIndex, endIndex + 1).map((item, index) => ({
    ...item,
    index: startIndex + index,
    top: (startIndex + index) * itemHeight,
  }));

  const handleScroll = useCallback((event) => {
    const newScrollTop = event.target.scrollTop;
    setScrollTop(newScrollTop);
    setIsScrolling(true);

    // Clear existing timeout
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }

    // Set scrolling to false after scroll ends
    scrollTimeout.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, []);

  return {
    visibleItems,
    totalHeight,
    handleScroll,
    isScrolling,
    startIndex,
    endIndex,
  };
};

// Hook for performance-aware state updates
export const usePerformantState = (initialState, updateThreshold = 16) => {
  const [state, setState] = useState(initialState);
  const pendingUpdate = useRef(null);
  const lastUpdateTime = useRef(performance.now());

  const setStateOptimized = useCallback((newState) => {
    const now = performance.now();
    const timeSinceLastUpdate = now - lastUpdateTime.current;

    if (timeSinceLastUpdate < updateThreshold && pendingUpdate.current) {
      // Queue update for next frame
      pendingUpdate.current = newState;
      return;
    }

    // Apply update immediately
    if (pendingUpdate.current) {
      cancelAnimationFrame(pendingUpdate.current);
    }

    pendingUpdate.current = requestAnimationFrame(() => {
      setState(typeof newState === 'function' ? newState : () => newState);
      lastUpdateTime.current = performance.now();
      pendingUpdate.current = null;
    });
  }, [updateThreshold]);

  useEffect(() => {
    return () => {
      if (pendingUpdate.current) {
        cancelAnimationFrame(pendingUpdate.current);
      }
    };
  }, []);

  return [state, setStateOptimized];
};