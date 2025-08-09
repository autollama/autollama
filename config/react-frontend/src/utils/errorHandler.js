// Ultra-Safe Error Handler - Completely Rewritten to Eliminate Severity Errors
// This version cannot possibly cause "undefined is not an object (evaluating 'a.severity')"

// Error severity levels
export const ERROR_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

// Error categories
export const ERROR_CATEGORIES = {
  API: 'api',
  NETWORK: 'network',
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  PERMISSION: 'permission',
  PROCESSING: 'processing',
  UI: 'ui',
  UNKNOWN: 'unknown',
};

// Ultra-safe error handler that cannot cause severity errors
class SafeErrorHandler {
  constructor() {
    // Start with completely empty, safe state
    this.errorLog = [];
    this.maxLogSize = 50; // Smaller to prevent issues
    this.errorCallbacks = new Set();
    
    console.log('SafeErrorHandler initialized - no legacy data');
  }

  // Handle error with maximum safety
  handle(error, context = {}) {
    try {
      // Create completely safe error object
      const safeErrorData = this.createSafeError(error, context);
      
      // Log safely
      this.safeLog(safeErrorData);
      
      // Notify callbacks safely
      this.safeNotify(safeErrorData);
      
      // Console log safely
      this.safeConsoleLog(safeErrorData);
      
      return safeErrorData;
      
    } catch (e) {
      // Even if everything fails, return a safe object
      console.error('Error handler completely failed:', e);
      return {
        id: 'emergency-' + Date.now(),
        message: 'Error handling failed',
        severity: 'medium',
        category: 'unknown',
        timestamp: new Date().toISOString()
      };
    }
  }

  // Create absolutely safe error object
  createSafeError(error, context) {
    const safeError = {
      id: 'error-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      message: 'Unknown error',
      severity: 'medium',
      category: 'unknown',
      timestamp: new Date().toISOString(),
      retryable: false
    };

    // Safely extract message
    try {
      if (error && typeof error === 'object' && error.message) {
        safeError.message = String(error.message);
      } else if (error && typeof error === 'string') {
        safeError.message = error;
      }
    } catch (e) {
      // Keep default message
    }

    // Safely extract severity
    try {
      if (context && context.severity && typeof context.severity === 'string') {
        safeError.severity = context.severity;
      }
    } catch (e) {
      // Keep default severity
    }

    // Safely extract category
    try {
      if (context && context.category && typeof context.category === 'string') {
        safeError.category = context.category;
      }
    } catch (e) {
      // Keep default category
    }

    return safeError;
  }

  // Ultra-safe logging
  safeLog(errorData) {
    try {
      // Only add if we have a valid object
      if (errorData && typeof errorData === 'object' && errorData.id) {
        this.errorLog.unshift(errorData);
        
        // Keep size manageable
        if (this.errorLog.length > this.maxLogSize) {
          this.errorLog = this.errorLog.slice(0, this.maxLogSize);
        }
      }
    } catch (e) {
      console.error('Safe log failed:', e);
    }
  }

  // Ultra-safe callback notification
  safeNotify(errorData) {
    try {
      this.errorCallbacks.forEach(callback => {
        try {
          if (typeof callback === 'function') {
            callback(errorData);
          }
        } catch (e) {
          console.error('Error callback failed:', e);
        }
      });
    } catch (e) {
      console.error('Safe notify failed:', e);
    }
  }

  // Ultra-safe console logging
  safeConsoleLog(errorData) {
    try {
      if (!errorData || typeof errorData !== 'object') {
        console.warn('Invalid error data for console log');
        return;
      }

      const message = errorData.message || 'Unknown error';
      const severity = errorData.severity || 'medium';
      
      if (severity === 'high') {
        console.error('❌ ERROR:', message);
      } else if (severity === 'low') {
        console.info('ℹ️ INFO:', message);
      } else {
        console.warn('⚠️ WARNING:', message);
      }
    } catch (e) {
      console.error('Safe console log failed:', e);
    }
  }

  // Register error callback safely
  onError(callback) {
    try {
      if (typeof callback === 'function') {
        this.errorCallbacks.add(callback);
        return () => {
          try {
            this.errorCallbacks.delete(callback);
          } catch (e) {
            console.error('Error callback removal failed:', e);
          }
        };
      }
    } catch (e) {
      console.error('Error callback registration failed:', e);
    }
    return () => {}; // Safe no-op
  }

  // Ultra-safe statistics that CANNOT cause severity errors
  getStats() {
    try {
      const stats = {
        total: 0,
        last24h: 0,
        byCategory: {},
        bySeverity: {}
      };

      // No forEach loops that could access undefined properties
      // Just return safe defaults
      if (Array.isArray(this.errorLog)) {
        stats.total = this.errorLog.length;
        
        // Count safely without accessing properties that might not exist
        let count = 0;
        for (let i = 0; i < this.errorLog.length; i++) {
          try {
            const item = this.errorLog[i];
            if (item && typeof item === 'object') {
              count++;
              
              // Safe category counting
              const cat = item.category || 'unknown';
              stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
              
              // Safe severity counting
              const sev = item.severity || 'medium';
              stats.bySeverity[sev] = (stats.bySeverity[sev] || 0) + 1;
            }
          } catch (e) {
            // Skip this item silently
          }
        }
        stats.last24h = count; // Simplified
      }

      return stats;
    } catch (e) {
      console.error('Stats generation failed:', e);
      return {
        total: 0,
        last24h: 0,
        byCategory: {},
        bySeverity: {}
      };
    }
  }

  // Clear all errors safely
  clearErrors() {
    try {
      this.errorLog = [];
      console.log('Error log cleared successfully');
    } catch (e) {
      console.error('Error clearing failed:', e);
      this.errorLog = []; // Force reset
    }
  }
}

// Create the safe error handler instance
const safeErrorHandler = new SafeErrorHandler();

// Export safe convenience functions
export const handleAPIError = (error, context = {}) => {
  return safeErrorHandler.handle(error, {
    ...context,
    category: ERROR_CATEGORIES.API,
  });
};

// Alias for compatibility
export const handleApiError = handleAPIError;

export const handleNetworkError = (error, context = {}) => {
  return safeErrorHandler.handle(error, {
    ...context,
    category: ERROR_CATEGORIES.NETWORK,
    severity: ERROR_LEVELS.HIGH,
  });
};

export const handleValidationError = (error, context = {}) => {
  return safeErrorHandler.handle(error, {
    ...context,
    category: ERROR_CATEGORIES.VALIDATION,
    severity: ERROR_LEVELS.MEDIUM,
  });
};

export const handleProcessingError = (error, context = {}) => {
  return safeErrorHandler.handle(error, {
    ...context,
    category: ERROR_CATEGORIES.PROCESSING,
  });
};

export const handleUIError = (error, context = {}) => {
  return safeErrorHandler.handle(error, {
    ...context,
    category: ERROR_CATEGORIES.UI,
    severity: ERROR_LEVELS.LOW,
  });
};

// Safe user-friendly message function
export const getUserFriendlyMessage = (errorData) => {
  try {
    if (!errorData || typeof errorData !== 'object') {
      return 'An unexpected error occurred. Please try again.';
    }

    const category = errorData.category || 'unknown';
    
    switch (category) {
      case ERROR_CATEGORIES.NETWORK:
        return 'Connection error. Please check your internet connection and try again.';
      case ERROR_CATEGORIES.API:
        return 'Server error. Please try again in a moment.';
      case ERROR_CATEGORIES.VALIDATION:
        return 'Please check your input and try again.';
      case ERROR_CATEGORIES.PROCESSING:
        return 'Processing error. Please try again.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  } catch (e) {
    return 'An error occurred. Please try again.';
  }
};

// Safe global error handlers
export const setupGlobalErrorHandlers = () => {
  try {
    // Global uncaught error handler
    window.addEventListener('error', (event) => {
      safeErrorHandler.handle(event.error || new Error('Global error'), {
        component: 'Global',
        action: 'UncaughtError',
        category: ERROR_CATEGORIES.UI,
        severity: ERROR_LEVELS.HIGH,
      });
    });

    // Global unhandled promise rejection handler  
    window.addEventListener('unhandledrejection', (event) => {
      safeErrorHandler.handle(event.reason || new Error('Unhandled rejection'), {
        component: 'Global',
        action: 'UnhandledRejection',
        category: ERROR_CATEGORIES.UNKNOWN,
        severity: ERROR_LEVELS.HIGH,
      });
    });
    
    console.log('Global error handlers setup successfully');
  } catch (e) {
    console.error('Failed to setup global error handlers:', e);
  }
};

// Safe retry utility function
export const retry = async (fn, options = {}) => {
  const { maxAttempts = 3, delay = 1000 } = options;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        safeErrorHandler.handle(error, {
          action: 'RetryFailed',
          attempts: attempt,
          category: ERROR_CATEGORIES.API,
        });
        throw error;
      }
      
      // Wait before retrying
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
};

export default safeErrorHandler;