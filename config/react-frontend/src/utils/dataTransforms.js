// Data Transformation Utilities
// Provides consistent data formatting and transformation functions

// Format dates consistently across the application
export const formatDate = (dateString, options = {}) => {
  if (!dateString) return 'Unknown';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  
  const defaults = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  
  return date.toLocaleDateString('en-US', { ...defaults, ...options });
};

// Format relative time (e.g., "2 hours ago")
export const formatRelativeTime = (dateString) => {
  if (!dateString) return 'Unknown';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return formatDate(dateString, { year: 'numeric', month: 'short', day: 'numeric' });
};

// Format file sizes
export const formatFileSize = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  if (!bytes || bytes < 0) return 'Unknown';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Format numbers with locale-specific formatting
export const formatNumber = (number, options = {}) => {
  if (typeof number !== 'number' || isNaN(number)) return '0';
  
  const defaults = {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  };
  
  return number.toLocaleString('en-US', { ...defaults, ...options });
};

// Format percentages
export const formatPercentage = (value, total, decimals = 1) => {
  if (!value || !total || total === 0) return '0%';
  const percentage = (value / total) * 100;
  return `${percentage.toFixed(decimals)}%`;
};

// Format duration in seconds to human readable
export const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

// Transform document data for consistency
export const transformDocument = (doc) => {
  if (!doc) return null;
  
  return {
    id: doc.id || doc.chunk_id || generateId(),
    title: doc.title || doc.url || 'Untitled Document',
    url: doc.url || '',
    contentType: doc.content_type || doc.contentType || 'document',
    processedAt: doc.processed_at || doc.processedAt || doc.created_time || doc.created_at,
    chunkCount: doc.chunk_count || doc.chunkCount || 0,
    status: doc.status || 'completed',
    sentiment: doc.sentiment || 'neutral',
    technicalLevel: doc.technical_level || doc.technicalLevel || 'intermediate',
    summary: doc.summary || '',
    mainTopics: doc.main_topics || doc.mainTopics || [],
    keyEntities: doc.key_entities || doc.keyEntities || {},
    usesContextualEmbedding: doc.uses_contextual_embedding || doc.usesContextualEmbedding || false,
    uploadSource: doc.upload_source || doc.uploadSource || 'user',
  };
};

// Transform chunk data for consistency
export const transformChunk = (chunk) => {
  if (!chunk) return null;
  
  return {
    id: chunk.chunk_id || chunk.id || generateId(),
    index: chunk.chunk_index !== undefined ? chunk.chunk_index : (chunk.index !== undefined ? chunk.index : 0),
    text: chunk.chunkText || chunk.chunk_text || chunk.text || '',
    url: chunk.url || '',
    title: chunk.title || 'Untitled',
    status: chunk.processing_status || chunk.status || 'completed',
    sentiment: chunk.sentiment || 'neutral',
    technicalLevel: chunk.technical_level || chunk.technicalLevel || 'intermediate',
    contentType: chunk.content_type || chunk.contentType || 'text',
    mainTopics: chunk.main_topics || chunk.mainTopics || [],
    keyEntities: chunk.key_entities || chunk.keyEntities || {},
    contextualSummary: chunk.contextual_summary || chunk.contextualSummary || null,
    usesContextualEmbedding: chunk.uses_contextual_embedding || chunk.usesContextualEmbedding || false,
    embedding: chunk.embedding || null,
    people: chunk.people || [],
    organizations: chunk.organizations || [],
    locations: chunk.locations || [],
    emotions: chunk.emotions || [],
    keyConcepts: chunk.key_concepts || chunk.keyConcepts || [],
  };
};

// Transform search results for consistency
export const transformSearchResults = (results) => {
  if (!results || !Array.isArray(results)) return [];
  
  return results.map(result => ({
    id: result.id || generateId(),
    score: result.score || 0,
    document: transformDocument(result.document || result),
    chunk: result.chunk ? transformChunk(result.chunk) : null,
    highlight: result.highlight || '',
    type: result.type || 'document',
  }));
};

// Transform API errors for user display
export const transformError = (error) => {
  if (!error) return { message: 'Unknown error occurred' };
  
  // Handle different error types
  if (error.response) {
    // API response error
    return {
      message: error.response.data?.message || error.response.data?.error || 'Server error occurred',
      status: error.response.status,
      type: 'api_error',
      details: error.response.data?.details || null,
    };
  } else if (error.request) {
    // Network error
    return {
      message: 'Network error - please check your connection',
      type: 'network_error',
      details: error.message,
    };
  } else {
    // Other error
    return {
      message: error.message || 'An unexpected error occurred',
      type: 'unknown_error',
      details: error.stack || null,
    };
  }
};

// Sanitize text content for display
export const sanitizeText = (text, maxLength = null) => {
  if (!text || typeof text !== 'string') return '';
  
  // Remove extra whitespace and normalize
  let sanitized = text.trim().replace(/\s+/g, ' ');
  
  // Truncate if needed
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }
  
  return sanitized;
};

// Extract preview text from content
export const extractPreview = (text, length = 150) => {
  return sanitizeText(text, length);
};

// Generate consistent color for categories/topics
export const getCategoryColor = (category) => {
  if (!category) return 'text-gray-400';
  
  const colors = [
    'text-blue-400',
    'text-green-400',
    'text-purple-400',
    'text-yellow-400',
    'text-pink-400',
    'text-indigo-400',
    'text-red-400',
    'text-orange-400',
  ];
  
  // Simple hash to get consistent color
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
};

// Get status color and icon
export const getStatusConfig = (status) => {
  const configs = {
    pending: { color: 'text-gray-400', bg: 'bg-gray-600', label: 'Pending' },
    queued: { color: 'text-blue-400', bg: 'bg-blue-600', label: 'Queued' },
    processing: { color: 'text-yellow-400', bg: 'bg-yellow-600', label: 'Processing' },
    completed: { color: 'text-green-400', bg: 'bg-green-600', label: 'Completed' },
    error: { color: 'text-red-400', bg: 'bg-red-600', label: 'Failed' },
    cancelled: { color: 'text-gray-400', bg: 'bg-gray-600', label: 'Cancelled' },
  };
  
  return configs[status] || configs.pending;
};

// Generate unique IDs
export const generateId = () => {
  return Math.random().toString(36).substr(2, 9);
};

// Deep clone objects safely
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(deepClone);
  
  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
};

// Debounce function calls
export const debounce = (func, wait, immediate = false) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  };
};

// Throttle function calls
export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// Group array items by key
export const groupBy = (array, key) => {
  return array.reduce((result, item) => {
    const group = item[key];
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {});
};

// Sort array by multiple criteria
export const multiSort = (array, ...sortKeys) => {
  return [...array].sort((a, b) => {
    for (const key of sortKeys) {
      const [field, direction = 'asc'] = key.split(':');
      const aVal = a[field];
      const bVal = b[field];
      
      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    }
    return 0;
  });
};