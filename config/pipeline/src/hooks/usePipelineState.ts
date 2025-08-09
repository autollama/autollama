import { useState, useEffect, useCallback } from 'react';
import { FileData, PipelineStats, UsePipelineState } from '../types';

const API_BASE = '/api';

export function usePipelineState(): UsePipelineState {
  const [files, setFiles] = useState<FileData[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [stats, setStats] = useState<PipelineStats>({
    totalCost: 0,
    throughput: 0,
    activeFiles: 0,
    totalFiles: 0,
    recentFiles: [],
    systemHealth: {
      api: false,
      bm25: false,
      qdrant: false,
      postgres: false
    }
  });
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  // Fetch initial data
  const fetchFiles = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/documents`);
      if (response.ok) {
        const { documents } = await response.json();
        
        const filesArray = documents.map((doc: any) => ({
          id: doc.id,
          name: doc.title || doc.url,
          status: 'completed', // Assuming all fetched documents are complete
          progress: 100,
          totalChunks: doc.chunk_count || 0,
          processedChunks: doc.chunk_count || 0,
          completedChunks: doc.chunk_count || 0,
          startedAt: doc.created_at || new Date().toISOString(),
          lastActivity: doc.updated_at || new Date().toISOString(),
          completedAt: doc.updated_at,
          url: doc.url,
          chunks: [] // Chunks will be fetched on demand
        }));
        
        setFiles(filesArray);
        setStats(prev => ({
          ...prev,
          totalFiles: filesArray.length,
          activeFiles: filesArray.filter(f => f.status === 'processing').length,
          recentFiles: filesArray.slice(0, 10)
        }));
        
        setIsConnected(true);
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
      setIsConnected(false);
    }
  }, []);

  // Fetch system health
  const fetchHealth = useCallback(async () => {
    try {
      const [apiHealth, bm25Health] = await Promise.allSettled([
        fetch(`${API_BASE}/health`),
        fetch(`${API_BASE}/health`) // We'll add BM25 health endpoint later
      ]);

      setStats(prev => ({
        ...prev,
        systemHealth: {
          api: apiHealth.status === 'fulfilled' && apiHealth.value.ok,
          bm25: bm25Health.status === 'fulfilled' && bm25Health.value.ok,
          qdrant: true, // We'll implement proper health checks
          postgres: true
        }
      }));
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }, []);

  // Update file with real-time data
  const updateFile = useCallback((fileUpdate: Partial<FileData> & { id: string }) => {
    setFiles(prev => prev.map(file => 
      file.id === fileUpdate.id 
        ? { ...file, ...fileUpdate, lastActivity: new Date().toISOString() }
        : file
    ));
    
    setLastUpdate(new Date().toISOString());
  }, []);

  // Add new file (for new processing sessions)
  const addFile = useCallback((newFile: FileData) => {
    setFiles(prev => {
      const exists = prev.find(f => f.id === newFile.id);
      if (exists) {
        return prev.map(f => f.id === newFile.id ? newFile : f);
      }
      return [newFile, ...prev];
    });
    
    setStats(prev => ({
      ...prev,
      totalFiles: prev.totalFiles + 1,
      activeFiles: prev.activeFiles + (newFile.status === 'processing' ? 1 : 0)
    }));
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchFiles();
    fetchHealth();
    
    // Refresh data periodically
    const interval = setInterval(() => {
      fetchFiles();
      fetchHealth();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [fetchFiles, fetchHealth]);

  // Listen for SSE updates (for legacy compatibility)
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/stream`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Handle SSE updates here if needed
        setLastUpdate(new Date().toISOString());
      } catch (error) {
        console.error('SSE parse error:', error);
      }
    };
    
    eventSource.onerror = () => {
      setIsConnected(false);
    };
    
    eventSource.onopen = () => {
      setIsConnected(true);
    };
    
    return () => {
      eventSource.close();
    };
  }, []);

  return {
    files,
    selectedFile,
    setSelectedFile,
    stats,
    isConnected,
    lastUpdate
  };
}