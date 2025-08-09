// Centralized hooks exports
// Provides a single entry point for all custom hooks

// API hooks
export { useAPI, useHybridSearch } from './useAPI';

// Settings hooks
export { useSettings } from './useSettings';

// SSE hooks
export { useSSE } from './useSSE';

// Performance hooks
export { 
  usePerformanceMonitor,
  useApiPerformance,
  useSystemPerformance,
  useRenderPerformance,
  useLazyLoad,
  useDebounceWithPerformance,
  useVirtualScroll,
  usePerformantState
} from './usePerformance';

// Error handling hooks
export {
  useErrorHandler,
  useErrorBoundary,
  useAsyncError,
  useFormErrors,
  useNetworkError,
  useErrorStats
} from './useErrorHandler';

// Common hook utilities
export const hooks = {
  // API hooks
  api: {
    useAPI,
    useHybridSearch,
  },

  // System hooks
  system: {
    useSettings,
    useSSE,
  },

  // Performance hooks
  performance: {
    usePerformanceMonitor,
    useApiPerformance,
    useSystemPerformance,
    useRenderPerformance,
    useLazyLoad,
    useDebounceWithPerformance,
    useVirtualScroll,
    usePerformantState,
  },

  // Error hooks
  errors: {
    useErrorHandler,
    useErrorBoundary,
    useAsyncError,
    useFormErrors,
    useNetworkError,
    useErrorStats,
  },
};

// Re-export everything for convenience
export * from './useAPI';
export * from './useSettings';
export * from './useSSE';
export * from './usePerformance';
export * from './useErrorHandler';