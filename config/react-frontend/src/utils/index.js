// Centralized utility exports
// Provides a single entry point for all utility functions

// API utilities
export { 
  api, 
  bm25Api, 
  createEnhancedApiCall, 
  createCachedApiCall, 
  createRetryableApiCall, 
  createMonitoredApiCall,
  apiUtils,
  createSSEConnection 
} from './api';

// Caching utilities
export { 
  default as apiCache, 
  cachedApiCall, 
  cacheConfigs, 
  invalidateCache 
} from './apiCache';

// Error handling utilities
export { 
  default as errorHandler,
  handleApiError,
  handleNetworkError,
  handleValidationError,
  handleProcessingError,
  handleUIError,
  getUserFriendlyMessage,
  retry,
  ERROR_LEVELS,
  ERROR_CATEGORIES
} from './errorHandler';

// Performance utilities
export { 
  default as perfMonitor,
  getMemoryUsage,
  getConnectionInfo,
  getPageLoadMetrics,
  getResourceMetrics,
  getPerformanceRecommendations,
  withPerformanceMonitoring,
  createPerformantApiWrapper,
  createOptimizedScrollHandler
} from './performance';

// Data transformation utilities
export {
  formatDate,
  formatRelativeTime,
  formatFileSize,
  formatNumber,
  formatPercentage,
  formatDuration,
  transformDocument,
  transformChunk,
  transformSearchResults,
  transformError,
  sanitizeText,
  extractPreview,
  getCategoryColor,
  getStatusConfig,
  generateId,
  deepClone,
  debounce,
  throttle,
  groupBy,
  multiSort
} from './dataTransforms';

// Common utility functions
export const utils = {
  // Date and time utilities
  date: {
    format: formatDate,
    relative: formatRelativeTime,
  },

  // Formatting utilities
  format: {
    fileSize: formatFileSize,
    number: formatNumber,
    percentage: formatPercentage,
    duration: formatDuration,
  },

  // Data transformation utilities
  transform: {
    document: transformDocument,
    chunk: transformChunk,
    searchResults: transformSearchResults,
    error: transformError,
  },

  // Text utilities
  text: {
    sanitize: sanitizeText,
    preview: extractPreview,
  },

  // UI utilities
  ui: {
    getCategoryColor,
    getStatusConfig,
  },

  // Function utilities
  function: {
    debounce,
    throttle,
    deepClone,
  },

  // Array utilities
  array: {
    groupBy,
    multiSort,
  },

  // ID generation
  generateId,
};

// Performance monitoring utilities
export const performance = {
  monitor: perfMonitor,
  memory: getMemoryUsage,
  connection: getConnectionInfo,
  pageLoad: getPageLoadMetrics,
  resources: getResourceMetrics,
  recommendations: getPerformanceRecommendations,
  
  // HOCs and wrappers
  withMonitoring: withPerformanceMonitoring,
  wrapApi: createPerformantApiWrapper,
  optimizeScroll: createOptimizedScrollHandler,
};

// Error handling utilities
export const errors = {
  handler: errorHandler,
  api: handleApiError,
  network: handleNetworkError,
  validation: handleValidationError,
  processing: handleProcessingError,
  ui: handleUIError,
  
  // Utilities
  getUserMessage: getUserFriendlyMessage,
  retry,
  
  // Constants
  LEVELS: ERROR_LEVELS,
  CATEGORIES: ERROR_CATEGORIES,
};

// Caching utilities
export const cache = {
  instance: apiCache,
  call: cachedApiCall,
  configs: cacheConfigs,
  invalidate: invalidateCache,
};

// Re-export everything for convenience
export * from './api';
export * from './apiCache';
export * from './errorHandler';
export * from './performance';
export * from './dataTransforms';