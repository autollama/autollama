import { useState, useEffect, useCallback, useRef } from 'react';
import errorHandler, { 
  getUserFriendlyMessage, 
  retry, 
  ERROR_LEVELS, 
  ERROR_CATEGORIES 
} from '../utils/errorHandler';

// Hook for centralized error handling in components
export const useErrorHandler = (componentName = 'Unknown') => {
  const [errors, setErrors] = useState([]);
  const [hasError, setHasError] = useState(false);
  const errorCallbackRef = useRef(null);

  // Register error callback on mount
  useEffect(() => {
    errorCallbackRef.current = errorHandler.onError((errorData) => {
      // Only handle errors from this component or global errors
      if (errorData.context.component === componentName || errorData.context.component === 'Global') {
        setErrors(prev => [errorData, ...prev.slice(0, 9)]); // Keep last 10 errors
        setHasError(true);
      }
    });

    return () => {
      if (errorCallbackRef.current) {
        errorCallbackRef.current();
      }
    };
  }, [componentName]);

  // Handle error with context
  const handleError = useCallback((error, context = {}) => {
    const errorData = errorHandler.handle(error, {
      component: componentName,
      ...context,
    });

    return errorData;
  }, [componentName]);

  // Handle API errors specifically
  const handleApiError = useCallback((error, action = 'API Call') => {
    return handleError(error, {
      action,
      category: ERROR_CATEGORIES.API,
    });
  }, [handleError]);

  // Handle validation errors
  const handleValidationError = useCallback((error, field = 'Unknown') => {
    return handleError(error, {
      action: `Validation: ${field}`,
      category: ERROR_CATEGORIES.VALIDATION,
      severity: ERROR_LEVELS.MEDIUM,
    });
  }, [handleError]);

  // Handle processing errors
  const handleProcessingError = useCallback((error, operation = 'Processing') => {
    return handleError(error, {
      action: operation,
      category: ERROR_CATEGORIES.PROCESSING,
    });
  }, [handleError]);

  // Clear errors
  const clearErrors = useCallback(() => {
    setErrors([]);
    setHasError(false);
  }, []);

  // Clear specific error
  const clearError = useCallback((errorId) => {
    setErrors(prev => prev.filter(err => err.id !== errorId));
    setHasError(prev => errors.length > 1);
  }, [errors.length]);

  // Get user-friendly error messages
  const getErrorMessages = useCallback(() => {
    return errors
      .filter(error => {
        // Extra defensive filtering
        if (!error || typeof error !== 'object') return false;
        if (!error.id) return false;
        return true;
      })
      .map(error => {
        // Additional safety checks for each property
        try {
          // Ensure error object has all required properties with safe access
          const safeError = {
            id: String(error.id || 'unknown'),
            message: String(error.message || 'Unknown error occurred'),
            severity: String(error.severity || 'medium'),
            timestamp: String(error.timestamp || new Date().toISOString()),
            retryable: Boolean(error.retryable),
          };
          
          // Try to get user-friendly message safely
          try {
            const friendlyMessage = getUserFriendlyMessage(error);
            if (friendlyMessage && typeof friendlyMessage === 'string') {
              safeError.message = friendlyMessage;
            }
          } catch (userMessageError) {
            console.warn('Error getting user-friendly message:', userMessageError);
            // Keep the original message
          }
          
          return safeError;
        } catch (e) {
          // Fallback for any mapping errors
          console.warn('Error processing error message:', e, error);
          return {
            id: 'error-processing-' + Date.now(),
            message: 'Error processing error message',
            severity: 'medium',
            timestamp: new Date().toISOString(),
            retryable: false,
          };
        }
      });
  }, [errors]);

  // Get current error state
  const errorState = {
    hasError,
    errorCount: errors.length,
    latestError: errors[0] || null,
    errors,
    messages: getErrorMessages(),
  };

  return {
    ...errorState,
    handleError,
    handleApiError,
    handleValidationError,
    handleProcessingError,
    clearErrors,
    clearError,
  };
};

// Hook for error boundary functionality
export const useErrorBoundary = () => {
  const [error, setError] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);
  const [hasError, setHasError] = useState(false);

  const captureError = useCallback((error, errorInfo = {}) => {
    const errorData = errorHandler.handle(error, {
      component: 'ErrorBoundary',
      action: 'ComponentError',
      category: ERROR_CATEGORIES.UI,
      severity: ERROR_LEVELS.HIGH,
      ...errorInfo,
    });

    setError(error);
    setErrorInfo(errorInfo);
    setHasError(true);

    return errorData;
  }, []);

  const resetError = useCallback(() => {
    setError(null);
    setErrorInfo(null);
    setHasError(false);
  }, []);

  return {
    hasError,
    error,
    errorInfo,
    captureError,
    resetError,
  };
};

// Hook for async operation error handling with retry
export const useAsyncError = (maxRetries = 3) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const { handleError } = useErrorHandler('AsyncOperation');

  const executeWithRetry = useCallback(async (operation, context = {}) => {
    setLoading(true);
    setError(null);

    try {
      const result = await retry(operation, {
        maxAttempts: maxRetries,
        retryIf: (error, attempt) => {
          setRetryCount(attempt - 1);
          
          // Log retry attempt
          console.log(`🔄 Retry attempt ${attempt}/${maxRetries} for operation`);
          
          // Handle the error but continue retrying if it's retryable
          const errorData = handleError(error, {
            action: 'AsyncRetry',
            attempt,
            ...context,
          });
          
          return errorData.retryable;
        },
      });

      setRetryCount(0);
      return result;
    } catch (finalError) {
      const errorData = handleError(finalError, {
        action: 'AsyncFinalFailure',
        totalAttempts: maxRetries,
        ...context,
      });
      
      setError({
        original: finalError,
        processed: errorData,
        userMessage: getUserFriendlyMessage(errorData),
      });
      
      throw finalError;
    } finally {
      setLoading(false);
    }
  }, [maxRetries, handleError]);

  const clearError = useCallback(() => {
    setError(null);
    setRetryCount(0);
  }, []);

  return {
    loading,
    error,
    retryCount,
    executeWithRetry,
    clearError,
  };
};

// Hook for form validation errors
export const useFormErrors = () => {
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState(null);
  const { handleValidationError } = useErrorHandler('FormValidation');

  const setFieldError = useCallback((field, error) => {
    if (error) {
      handleValidationError(new Error(error), field);
    }
    
    setFieldErrors(prev => ({
      ...prev,
      [field]: error,
    }));
  }, [handleValidationError]);

  const setGeneralFormError = useCallback((error) => {
    if (error) {
      handleValidationError(error instanceof Error ? error : new Error(error), 'General');
    }
    
    setGeneralError(error);
  }, [handleValidationError]);

  const clearFieldError = useCallback((field) => {
    setFieldErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  const clearAllErrors = useCallback(() => {
    setFieldErrors({});
    setGeneralError(null);
  }, []);

  const hasErrors = Object.keys(fieldErrors).length > 0 || generalError !== null;
  const getFieldError = useCallback((field) => fieldErrors[field] || null, [fieldErrors]);

  return {
    fieldErrors,
    generalError,
    hasErrors,
    setFieldError,
    setGeneralFormError,
    clearFieldError,
    clearAllErrors,
    getFieldError,
  };
};

// Hook for network error handling
export const useNetworkError = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [networkError, setNetworkError] = useState(null);
  const { handleError } = useErrorHandler('NetworkMonitor');

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setNetworkError(null);
      console.log('🌐 Network connection restored');
    };

    const handleOffline = () => {
      setIsOnline(false);
      const error = new Error('Network connection lost');
      
      const errorData = handleError(error, {
        action: 'NetworkOffline',
        category: ERROR_CATEGORIES.NETWORK,
        severity: ERROR_LEVELS.HIGH,
      });
      
      setNetworkError(errorData);
      console.warn('📵 Network connection lost');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleError]);

  const checkNetworkStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/health', { 
        method: 'HEAD',
        cache: 'no-cache',
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      if (!isOnline) {
        setIsOnline(true);
        setNetworkError(null);
      }
      
      return true;
    } catch (error) {
      const errorData = handleError(error, {
        action: 'NetworkCheck',
        category: ERROR_CATEGORIES.NETWORK,
      });
      
      setNetworkError(errorData);
      return false;
    }
  }, [isOnline, handleError]);

  return {
    isOnline,
    networkError,
    checkNetworkStatus,
  };
};

// Hook for global error statistics
export const useErrorStats = () => {
  const [stats, setStats] = useState(null);

  const refreshStats = useCallback(() => {
    const errorStats = errorHandler.getStats();
    setStats({
      ...errorStats,
      lastUpdated: new Date().toISOString(),
    });
  }, []);

  useEffect(() => {
    // Initial load
    refreshStats();

    // Refresh every 30 seconds
    const interval = setInterval(refreshStats, 30000);

    return () => clearInterval(interval);
  }, [refreshStats]);

  const clearErrorLog = useCallback(() => {
    errorHandler.clearErrorLog();
    refreshStats();
  }, [refreshStats]);

  return {
    stats,
    refreshStats,
    clearErrorLog,
  };
};