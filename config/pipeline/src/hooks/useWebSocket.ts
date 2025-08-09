import { useEffect, useState, useRef, useCallback } from 'react';
import { WebSocketMessage, UseWebSocketReturn } from '../types';

export function useWebSocket(url: string): UseWebSocketReturn & {
  lastJsonMessage: WebSocketMessage | null;
  sendJsonMessage: (message: object) => void;
} {
  const [connectionStatus, setConnectionStatus] = useState<'Connecting' | 'Open' | 'Closing' | 'Closed'>('Connecting');
  const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
  const [lastJsonMessage, setLastJsonMessage] = useState<WebSocketMessage | null>(null);
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;
  const reconnectInterval = 3000; // 3 seconds

  const connect = useCallback(() => {
    try {
      ws.current = new WebSocket(url);
      
      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('Open');
        reconnectAttempts.current = 0;
      };
      
      ws.current.onmessage = (event) => {
        setLastMessage(event);
        
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          setLastJsonMessage(data);
          
          // Handle different message types
          switch (data.type) {
            case 'connection':
              console.log('WebSocket connection confirmed:', data.data);
              break;
            case 'pipeline_update':
              console.log('Pipeline update received:', data.data);
              break;
            case 'file_status':
              console.log('File status update:', data.data);
              break;
            case 'chunk_update':
              console.log('Chunk update:', data.data);
              break;
            default:
              console.log('Unknown message type:', data);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      ws.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setConnectionStatus('Closed');
        
        // Attempt to reconnect if not closed intentionally
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(reconnectInterval * Math.pow(2, reconnectAttempts.current - 1), 30000);
          
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (connectionStatus !== 'Open') {
              connect();
            }
          }, delay);
        }
      };
      
      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('Closed');
      };
      
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('Closed');
    }
  }, [url, connectionStatus]);

  const sendMessage = useCallback((message: string) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(message);
    } else {
      console.warn('WebSocket is not connected. Cannot send message:', message);
    }
  }, []);

  const sendJsonMessage = useCallback((message: object) => {
    sendMessage(JSON.stringify(message));
  }, [sendMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (ws.current) {
      setConnectionStatus('Closing');
      ws.current.close(1000, 'Intentional disconnect');
    }
  }, []);

  // Initial connection
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [url]); // Only reconnect if URL changes

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close(1000, 'Component unmounting');
      }
    };
  }, []);

  // Heartbeat to keep connection alive
  useEffect(() => {
    let heartbeatInterval: NodeJS.Timeout;
    
    if (connectionStatus === 'Open') {
      heartbeatInterval = setInterval(() => {
        sendJsonMessage({
          type: 'ping',
          timestamp: new Date().toISOString()
        });
      }, 30000); // 30 seconds
    }
    
    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    };
  }, [connectionStatus, sendJsonMessage]);

  return {
    connectionStatus,
    lastMessage,
    lastJsonMessage,
    sendMessage,
    sendJsonMessage
  };
}