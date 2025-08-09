// Performance Monitoring and Optimization Utilities
// Provides tools for measuring and optimizing application performance

// Performance metrics collection
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.thresholds = {
      api: 2000, // 2 seconds
      render: 100, // 100ms
      navigation: 1000, // 1 second
    };
    this.isRecording = true;
  }

  // Start timing an operation
  startTimer(name, category = 'general') {
    if (!this.isRecording) return;
    
    const key = `${category}:${name}`;
    this.metrics.set(key, {
      name,
      category,
      startTime: performance.now(),
      startMark: `${key}-start`,
    });
    
    // Create performance mark for DevTools
    if (typeof performance.mark === 'function') {
      performance.mark(`${key}-start`);
    }
  }

  // End timing and record result
  endTimer(name, category = 'general', metadata = {}) {
    if (!this.isRecording) return null;
    
    const key = `${category}:${name}`;
    const metric = this.metrics.get(key);
    
    if (!metric) {
      console.warn(`⚠️ No timer found for ${key}`);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - metric.startTime;
    const endMark = `${key}-end`;
    
    // Create performance marks and measure
    if (typeof performance.mark === 'function') {
      performance.mark(endMark);
      if (typeof performance.measure === 'function') {
        performance.measure(key, metric.startMark, endMark);
      }
    }

    const result = {
      name: metric.name,
      category: metric.category,
      duration,
      timestamp: new Date().toISOString(),
      metadata,
      threshold: this.thresholds[category] || this.thresholds.general,
      isSlowOperation: duration > (this.thresholds[category] || 1000),
    };

    // Log slow operations
    if (result.isSlowOperation) {
      console.warn(`🐌 Slow ${category}: ${name} took ${Math.round(duration)}ms`, metadata);
    } else {
      console.log(`⚡ ${category}: ${name} completed in ${Math.round(duration)}ms`);
    }

    // Clean up
    this.metrics.delete(key);

    return result;
  }

  // Time a function execution
  async timeFunction(fn, name, category = 'function', metadata = {}) {
    this.startTimer(name, category);
    
    try {
      const result = await fn();
      this.endTimer(name, category, metadata);
      return result;
    } catch (error) {
      this.endTimer(name, category, { ...metadata, error: error.message });
      throw error;
    }
  }

  // Time an API call
  async timeApiCall(apiCall, endpoint, metadata = {}) {
    return this.timeFunction(
      apiCall,
      endpoint,
      'api',
      { endpoint, ...metadata }
    );
  }

  // Get performance statistics
  getStats() {
    const entries = performance.getEntriesByType('measure');
    const stats = {
      total: entries.length,
      byCategory: {},
      slowOperations: 0,
      averageDuration: 0,
    };

    let totalDuration = 0;

    entries.forEach(entry => {
      const [category] = entry.name.split(':');
      
      if (!stats.byCategory[category]) {
        stats.byCategory[category] = {
          count: 0,
          totalDuration: 0,
          averageDuration: 0,
          slowCount: 0,
        };
      }

      const categoryStats = stats.byCategory[category];
      categoryStats.count++;
      categoryStats.totalDuration += entry.duration;

      if (entry.duration > (this.thresholds[category] || 1000)) {
        categoryStats.slowCount++;
        stats.slowOperations++;
      }

      totalDuration += entry.duration;
    });

    // Calculate averages
    stats.averageDuration = entries.length > 0 ? totalDuration / entries.length : 0;

    Object.values(stats.byCategory).forEach(categoryStats => {
      categoryStats.averageDuration = categoryStats.count > 0 
        ? categoryStats.totalDuration / categoryStats.count 
        : 0;
    });

    return stats;
  }

  // Clear performance data
  clearData() {
    if (typeof performance.clearMarks === 'function') {
      performance.clearMarks();
    }
    if (typeof performance.clearMeasures === 'function') {
      performance.clearMeasures();
    }
    this.metrics.clear();
  }

  // Toggle recording
  setRecording(enabled) {
    this.isRecording = enabled;
  }
}

// Create singleton instance
const perfMonitor = new PerformanceMonitor();

// Memory usage monitoring
export const getMemoryUsage = () => {
  if (!performance.memory) {
    return { supported: false };
  }

  return {
    supported: true,
    used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
    total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
    limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
    percentage: Math.round((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100),
  };
};

// Connection quality monitoring
export const getConnectionInfo = () => {
  if (!navigator.connection) {
    return { supported: false };
  }

  const conn = navigator.connection;
  return {
    supported: true,
    effectiveType: conn.effectiveType,
    downlink: conn.downlink,
    rtt: conn.rtt,
    saveData: conn.saveData,
  };
};

// Page load performance
export const getPageLoadMetrics = () => {
  const navigation = performance.getEntriesByType('navigation')[0];
  
  if (!navigation) {
    return { supported: false };
  }

  return {
    supported: true,
    domContentLoaded: Math.round(navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart),
    loadComplete: Math.round(navigation.loadEventEnd - navigation.loadEventStart),
    firstByte: Math.round(navigation.responseStart - navigation.requestStart),
    domInteractive: Math.round(navigation.domInteractive - navigation.navigationStart),
    totalLoadTime: Math.round(navigation.loadEventEnd - navigation.navigationStart),
  };
};

// Resource loading performance
export const getResourceMetrics = () => {
  const resources = performance.getEntriesByType('resource');
  
  const stats = {
    total: resources.length,
    byType: {},
    slowResources: [],
    totalSize: 0,
  };

  resources.forEach(resource => {
    const type = resource.initiatorType || 'other';
    
    if (!stats.byType[type]) {
      stats.byType[type] = {
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
        totalSize: 0,
      };
    }

    const typeStats = stats.byType[type];
    typeStats.count++;
    typeStats.totalDuration += resource.duration;
    
    if (resource.transferSize) {
      typeStats.totalSize += resource.transferSize;
      stats.totalSize += resource.transferSize;
    }

    // Track slow resources (>2s)
    if (resource.duration > 2000) {
      stats.slowResources.push({
        name: resource.name,
        type,
        duration: Math.round(resource.duration),
        size: resource.transferSize || 0,
      });
    }
  });

  // Calculate averages
  Object.values(stats.byType).forEach(typeStats => {
    typeStats.averageDuration = typeStats.count > 0 
      ? typeStats.totalDuration / typeStats.count 
      : 0;
  });

  return stats;
};

// React component performance HOC
export const withPerformanceMonitoring = (WrappedComponent, componentName) => {
  return function PerformanceMonitoredComponent(props) {
    React.useEffect(() => {
      perfMonitor.startTimer(componentName, 'render');
      
      return () => {
        perfMonitor.endTimer(componentName, 'render');
      };
    }, []);

    return React.createElement(WrappedComponent, props);
  };
};

// Performance-aware API wrapper
export const createPerformantApiWrapper = (apiFunction, endpoint) => {
  return async (...args) => {
    return perfMonitor.timeApiCall(
      () => apiFunction(...args),
      endpoint,
      { args: args.length }
    );
  };
};

// Debounced scroll handler for performance
export const createOptimizedScrollHandler = (callback, delay = 16) => {
  let ticking = false;
  
  return () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        callback();
        ticking = false;
      });
      ticking = true;
    }
  };
};

// Bundle analysis helper
export const analyzeBundle = () => {
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  
  return {
    scripts: scripts.map(script => ({
      src: script.src,
      async: script.async,
      defer: script.defer,
    })),
    stylesheets: stylesheets.map(link => ({
      href: link.href,
      media: link.media,
    })),
    totalScripts: scripts.length,
    totalStylesheets: stylesheets.length,
  };
};

// Performance recommendations
export const getPerformanceRecommendations = () => {
  const recommendations = [];
  const memory = getMemoryUsage();
  const connection = getConnectionInfo();
  const pageLoad = getPageLoadMetrics();
  const resources = getResourceMetrics();

  // Memory recommendations
  if (memory.supported && memory.percentage > 80) {
    recommendations.push({
      type: 'memory',
      severity: 'high',
      message: 'High memory usage detected. Consider reducing data in memory or implementing pagination.',
    });
  }

  // Connection recommendations
  if (connection.supported && connection.effectiveType === 'slow-2g') {
    recommendations.push({
      type: 'connection',
      severity: 'medium',
      message: 'Slow connection detected. Consider optimizing images and reducing bundle size.',
    });
  }

  // Page load recommendations
  if (pageLoad.supported && pageLoad.totalLoadTime > 5000) {
    recommendations.push({
      type: 'load',
      severity: 'high',
      message: 'Slow page load time. Consider code splitting and lazy loading.',
    });
  }

  // Resource recommendations
  if (resources.slowResources.length > 0) {
    recommendations.push({
      type: 'resources',
      severity: 'medium',
      message: `${resources.slowResources.length} slow resources detected. Consider optimization.`,
      details: resources.slowResources,
    });
  }

  return recommendations;
};

// Export utilities
export {
  perfMonitor,
};

export default perfMonitor;