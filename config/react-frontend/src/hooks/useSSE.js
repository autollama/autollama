import { useState, useEffect, useRef, useCallback } from 'react';
import { createSSEConnection } from '../utils/api';

export const useSSE = (endpoint, options = {}) => {
  const [data, setData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [messageHistory, setMessageHistory] = useState([]);
  
  const eventSourceRef = useRef(null);
  const timeoutsRef = useRef(new Set()); // Track timeouts for cleanup
  const {
    autoConnect = true,
    maxHistorySize = 10, // Reduced from 50 to 10 to prevent memory leaks causing browser reloads
    onMessage = null,
    onError = null,
    onConnect = null,
    onDisconnect = null,
  } = options;

  // Tracked setTimeout to prevent memory leaks
  const setTrackedTimeout = useCallback((callback, delay) => {
    const timeoutId = setTimeout(() => {
      timeoutsRef.current.delete(timeoutId);
      callback();
    }, delay);
    timeoutsRef.current.add(timeoutId);
    return timeoutId;
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((messageData) => {
    setData(messageData);
    setError(null);
    
    // Add to history with memory management
    setMessageHistory(prev => {
      const newHistory = [...prev, { ...messageData, timestamp: new Date() }];
      // More aggressive history pruning for memory conservation
      return newHistory.slice(-maxHistorySize);
    });
    
    // Call custom message handler
    if (onMessage) {
      onMessage(messageData);
    }
  }, [onMessage, maxHistorySize]);

  // Handle errors
  const handleError = useCallback((errorEvent) => {
    setError(errorEvent);
    setIsConnected(false);
    
    if (onError) {
      onError(errorEvent);
    }
    
    if (onDisconnect) {
      onDisconnect();
    }
  }, [onError, onDisconnect]);

  // Connect to SSE endpoint
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      eventSourceRef.current = createSSEConnection(
        endpoint,
        handleMessage,
        handleError
      );

      eventSourceRef.current.onopen = () => {
        setIsConnected(true);
        setError(null);
        
        if (onConnect) {
          onConnect();
        }
      };

      return true;
    } catch (err) {
      console.error('Failed to create SSE connection:', err);
      setError(err);
      return false;
    }
  }, [endpoint, handleMessage, handleError, onConnect]);

  // Disconnect from SSE endpoint
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
      
      if (onDisconnect) {
        onDisconnect();
      }
    }
  }, [onDisconnect]);

  // Reconnect with exponential backoff
  const reconnect = useCallback((attempt = 1) => {
    const maxAttempts = 3; // Reduced from 5 to 3 for faster recovery
    const baseDelay = 1000; // 1 second
    
    if (attempt > maxAttempts) {
      console.error('Max reconnection attempts reached');
      return false;
    }
    
    const delay = baseDelay * Math.pow(2, attempt - 1);
    console.log(`Reconnecting in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
    
    setTrackedTimeout(() => {
      if (connect()) {
        console.log('Reconnection successful');
      } else {
        reconnect(attempt + 1);
      }
    }, delay);
    
    return true;
  }, [connect, setTrackedTimeout]);

  // Clear message history
  const clearHistory = useCallback(() => {
    setMessageHistory([]);
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && endpoint) {
      connect();
    }

    return () => {
      disconnect();
      // Cleanup all tracked timeouts
      timeoutsRef.current.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      timeoutsRef.current.clear();
    };
  }, [endpoint, autoConnect, connect, disconnect]);

  // Auto-reconnect on connection loss with debouncing
  useEffect(() => {
    if (error && isConnected === false && autoConnect && endpoint) {
      console.log('SSE Connection lost, attempting to reconnect...', error);
      
      // Use tracked timeout for proper cleanup
      const reconnectTimer = setTrackedTimeout(() => {
        reconnect();
      }, 2000); // Wait 2 seconds before reconnecting
      
      return () => {
        timeoutsRef.current.delete(reconnectTimer);
        clearTimeout(reconnectTimer);
      };
    }
  }, [error, isConnected, autoConnect, reconnect, endpoint, setTrackedTimeout]);

  return {
    data,
    isConnected,
    error,
    messageHistory,
    connect,
    disconnect,
    reconnect,
    clearHistory,
  };
};