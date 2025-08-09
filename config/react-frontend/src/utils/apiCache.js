// API Response Caching Utility
// Provides in-memory caching for API responses to improve performance

class APICache {
  constructor(defaultTTL = 5 * 60 * 1000) { // 5 minutes default
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    };
  }

  // Generate cache key from request details
  generateKey(endpoint, params = {}) {
    const paramString = JSON.stringify(params, Object.keys(params).sort());
    return `${endpoint}:${paramString}`;
  }

  // Get cached response
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return item.data;
  }

  // Set cached response
  set(key, data, ttl = null) {
    // Handle ttl = 0 as "no caching" (immediate expiry)
    // Handle ttl = null/undefined as "use default TTL"
    const actualTTL = ttl === 0 ? 0 : (ttl !== null ? ttl : this.defaultTTL);
    const expiresAt = Date.now() + actualTTL;
    
    this.cache.set(key, {
      data,
      expiresAt,
      createdAt: Date.now(),
    });
    
    this.stats.sets++;
  }

  // Delete cached item
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  // Clear all cache
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.deletes += size;
  }

  // Clear expired items
  cleanup() {
    const now = Date.now();
    let deleted = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
        deleted++;
      }
    }
    
    this.stats.deletes += deleted;
    return deleted;
  }

  // Get cache statistics
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
    };
  }

  // Check if key exists and is valid
  has(key) {
    const item = this.cache.get(key);
    return item && Date.now() <= item.expiresAt;
  }
}

// Create singleton instance
const apiCache = new APICache();

// Auto-cleanup every 5 minutes
setInterval(() => {
  apiCache.cleanup();
}, 5 * 60 * 1000);

// Cache configurations for different endpoints
export const cacheConfigs = {
  // Short cache for frequently changing data
  realtime: 2 * 1000, // 2 seconds - very short for dashboard tiles
  
  // Medium cache for semi-static data
  documents: 0, // DISABLED - Real-time document updates needed for animations
  stats: 0, // DISABLED - Real-time stats updates needed for live dashboard
  
  // Long cache for static data
  settings: 30 * 1000, // 30 seconds - reduced for debugging
  systemInfo: 30 * 1000, // 30 seconds - reduced for debugging
  
  // Very long cache for rarely changing data
  schemas: 60 * 1000, // 1 minute - reduced for debugging
};

// Cache-aware API wrapper
export const cachedApiCall = async (cacheKey, apiFunction, ttl = null) => {
  // Check cache first
  const cached = apiCache.get(cacheKey);
  if (cached) {
    console.log(`📋 Cache hit: ${cacheKey}`);
    return cached;
  }

  // Make API call
  console.log(`🌐 Cache miss, fetching: ${cacheKey}`);
  try {
    const result = await apiFunction();
    
    // Cache the result
    apiCache.set(cacheKey, result, ttl);
    
    return result;
  } catch (error) {
    console.error(`❌ API call failed for ${cacheKey}:`, error);
    throw error;
  }
};

// Cache invalidation patterns
export const invalidateCache = {
  // Invalidate all document-related cache
  documents: () => {
    const keys = Array.from(apiCache.cache.keys());
    keys.forEach(key => {
      if (key.includes('documents') || key.includes('chunks') || key.includes('search')) {
        apiCache.delete(key);
      }
    });
  },

  // Invalidate statistics cache
  stats: () => {
    const keys = Array.from(apiCache.cache.keys());
    keys.forEach(key => {
      if (key.includes('stats') || key.includes('health')) {
        apiCache.delete(key);
      }
    });
  },

  // Invalidate processing-related cache
  processing: () => {
    const keys = Array.from(apiCache.cache.keys());
    keys.forEach(key => {
      if (key.includes('in-progress') || key.includes('recent') || key.includes('queue')) {
        apiCache.delete(key);
      }
    });
  },

  // Clear all cache
  all: () => apiCache.clear(),
};

export default apiCache;