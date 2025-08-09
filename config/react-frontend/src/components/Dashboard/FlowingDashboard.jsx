import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Play, Pause, Settings, Filter, Maximize, Info } from 'lucide-react';
import { useAppContext } from '../../App';

const FlowingDashboard = () => {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [flowSpeed, setFlowSpeed] = useState(1.0);
  const [flowDensity, setFlowDensity] = useState(0.7);
  const [showControls, setShowControls] = useState(false);
  const [hoveredObject, setHoveredObject] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const { systemStats, documents, api, sse, handleDocumentSelect, uploadQueue } = useAppContext();
  
  // Optimized object management with pooling
  const [flowingObjects, setFlowingObjects] = useState([]);
  const flowingObjectsRef = useRef([]);
  const objectPoolRef = useRef({ available: [], inUse: [] });
  
  // SSE event batching with memory limits
  const pendingSSEUpdatesRef = useRef([]);
  const sseUpdateTimerRef = useRef(null);
  const MAX_PENDING_UPDATES = 20; // Reduced from 100 to 20 to prevent memory buildup
  
  // Local processing queue state  
  const [processingQueue, setProcessingQueue] = useState([]);
  
  // Calculate stats the same way as ProcessingQueue component
  const getFlowStats = useMemo(() => {
    // Merge API queue data with upload queue (same logic as ProcessingQueue)
    const combined = [...processingQueue];
    
    // Add upload queue items that are processing/uploading
    uploadQueue.forEach(uploadItem => {
      if (uploadItem.status === 'processing' || uploadItem.status === 'uploading') {
        // Check if this item already exists in API data
        const existsInApi = combined.some(apiItem => 
          apiItem.filename === uploadItem.name || 
          (apiItem.sessionId && apiItem.sessionId === uploadItem.sessionId)
        );
        
        if (!existsInApi) {
          // Add upload queue item to display
          combined.push({
            id: uploadItem.id,
            sessionId: uploadItem.sessionId || uploadItem.id,
            filename: uploadItem.name,
            status: uploadItem.status === 'uploading' ? 'uploading' : 'processing',
            progress: uploadItem.progress || 0,
            source: 'upload_queue'
          });
        }
      }
    });
    
    return {
      totalProcessingCount: combined.filter(item => 
        item.status === 'processing' || item.status === 'uploading'
      ).length,
      apiProcessingCount: processingQueue.filter(item => item.status === 'processing').length,
      uploadProcessingCount: uploadQueue.filter(f => f.status === 'processing' || f.status === 'uploading').length,
      mergedQueueData: combined,
    };
  }, [processingQueue, uploadQueue]);
  
  // Canvas dimensions
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 400 });
  
  // Update canvas size on window resize
  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current) {
        const container = canvasRef.current.parentElement;
        const rect = container.getBoundingClientRect();
        setCanvasSize({
          width: rect.width,
          height: Math.min(400, Math.max(300, rect.height * 0.6))
        });
      }
    };
    
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Optimized processing queue loading with memory management
  useEffect(() => {
    let isMounted = true;
    
    const loadProcessingQueue = async () => {
      if (!isMounted) return;
      
      try {
        const inProgress = await api.data.getInProgress();
        if (isMounted) {
          setProcessingQueue(prevQueue => {
            // Only update if data actually changed (prevent unnecessary re-renders)
            const newQueue = inProgress || [];
            if (JSON.stringify(prevQueue) === JSON.stringify(newQueue)) {
              return prevQueue;
            }
            return newQueue;
          });
        }
      } catch (error) {
        console.error('FlowView: Failed to load processing queue:', error);
        if (isMounted) setProcessingQueue([]);
      }
    };

    loadProcessingQueue();
    // Slower polling to reduce API calls and memory pressure
    const hasActiveProcessing = getFlowStats.totalProcessingCount > 0;
    const pollInterval = hasActiveProcessing ? 5000 : 15000; // 5s when active, 15s when idle
    
    const interval = setInterval(loadProcessingQueue, pollInterval);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [api, getFlowStats.totalProcessingCount]);

  // Debug uploadQueue changes
  useEffect(() => {
    console.log('🌊 FlowView DEBUG: Upload queue changed:', {
      length: uploadQueue.length,
      items: uploadQueue.map(f => ({
        id: f.id,
        name: f.name,
        status: f.status,
        progress: f.progress
      }))
    });
  }, [uploadQueue]);
  
  // Object pool management for memory optimization
  const getPooledObject = useCallback(() => {
    const pool = objectPoolRef.current;
    if (pool.available.length > 0) {
      const obj = pool.available.pop();
      pool.inUse.push(obj);
      return obj;
    }
    
    // Create new object if pool is empty
    const newObj = { id: '', type: '', x: 0, y: 0, width: 0, height: 0, speed: 0, status: '', data: null, opacity: 1, createdAt: 0 };
    pool.inUse.push(newObj);
    return newObj;
  }, []);
  
  const returnToPool = useCallback((obj) => {
    const pool = objectPoolRef.current;
    const index = pool.inUse.indexOf(obj);
    if (index > -1) {
      pool.inUse.splice(index, 1);
      // Reset object properties
      Object.assign(obj, { id: '', type: '', x: 0, y: 0, width: 0, height: 0, speed: 0, status: '', data: null, opacity: 1, createdAt: 0 });
      if (pool.available.length < MAX_POOLED_OBJECTS) {
        pool.available.push(obj);
      }
    }
  }, []);

  // Create flowing objects from real data
  const createFlowingObjects = useCallback(() => {
    const objects = [];
    
    // Create objects from recent documents
    if (documents && documents.length > 0) {
      documents.slice(0, 20).forEach((doc, index) => {
        const processingStatus = doc.processingStatus || 'completed';
        objects.push({
          id: `doc-${doc.url || index}`,
          type: 'document',
          x: -100 - (index * 150), // Stagger starting positions
          y: 50 + (index % 3) * 100, // Multiple lanes
          width: Math.max(60, Math.min(120, (doc.title?.length || 50) * 2)),
          height: 30,
          speed: 0.5 + Math.random() * 1,
          status: processingStatus,
          data: doc,
          opacity: 1,
          createdAt: performance.now(),
        });
      });
    }
    
    // Create processing events from merged queue data (API + Upload)
    getFlowStats.mergedQueueData.forEach((item, i) => {
      const isUpload = item.source === 'upload_queue';
      objects.push({
        id: `processing-${item.id || i}`,
        type: isUpload ? 'processing_upload' : 'processing',
        x: -50 - (i * 100),
        y: 180 + (i % 3) * 60,
        width: Math.max(60, Math.min(140, (item.filename?.length || 20) * 3)),
        height: isUpload ? 30 : 25,
        speed: 1 + Math.random() * 1.5,
        status: item.status || 'processing',
        data: { 
          type: isUpload ? 'upload_processing' : 'processing_event', 
          sessionId: item.sessionId,
          fileName: item.filename,
          status: item.status,
          progress: item.progress,
          source: item.source
        },
        opacity: 0.9,
        createdAt: performance.now(),
      });
    });
    
    // Create chunk flow indicators
    const totalChunks = systemStats.knowledgeBase?.total_chunks || 0;
    if (totalChunks > 0) {
      for (let i = 0; i < Math.min(10, totalChunks / 1000); i++) {
        objects.push({
          id: `chunks-${i}`,
          type: 'chunks',
          x: -30 - (i * 80),
          y: 320 + (i % 2) * 30,
          width: 15,
          height: 15,
          speed: 2 + Math.random() * 2,
          status: 'completed',
          data: { type: 'chunk_batch', count: Math.floor(totalChunks / 10) },
          opacity: 0.6,
          createdAt: performance.now(),
        });
      }
    }
    
    return objects;
  }, [documents, systemStats, getFlowStats]);
  
  // Batch SSE updates with memory limits
  const processPendingSSEUpdates = useCallback(() => {
    if (pendingSSEUpdatesRef.current.length === 0) return;
    
    // Limit processed updates to prevent memory spikes
    const updates = pendingSSEUpdatesRef.current.splice(0, 20);
    
    updates.forEach(update => {
      const { type, data } = update;
      
      switch (type) {
        case 'ADD_OBJECT':
          if (flowingObjectsRef.current.length < maxObjects) {
            flowingObjectsRef.current.push(data);
          }
          break;
        case 'UPDATE_OBJECT':
          const objIndex = flowingObjectsRef.current.findIndex(obj => obj.id === data.id);
          if (objIndex > -1) {
            Object.assign(flowingObjectsRef.current[objIndex], data.updates);
          }
          break;
        case 'REMOVE_OBJECT':
          const removeIndex = flowingObjectsRef.current.findIndex(obj => obj.id === data.id);
          if (removeIndex > -1) {
            const removed = flowingObjectsRef.current.splice(removeIndex, 1)[0];
            returnToPool(removed);
          }
          break;
      }
    });
    
    sseUpdateTimerRef.current = null;
  }, [maxObjects, returnToPool]);
  
  // Queue SSE update with memory limits
  const queueSSEUpdate = useCallback((type, data) => {
    // Prevent unbounded update accumulation
    if (pendingSSEUpdatesRef.current.length >= MAX_PENDING_UPDATES) {
      pendingSSEUpdatesRef.current.shift(); // Remove oldest update
    }
    
    pendingSSEUpdatesRef.current.push({ type, data });
    
    // Clear existing timer and set new one
    if (sseUpdateTimerRef.current) {
      clearTimeout(sseUpdateTimerRef.current);
    }
    
    sseUpdateTimerRef.current = setTimeout(processPendingSSEUpdates, 150); // Increased from 100ms to 150ms
  }, [processPendingSSEUpdates]);
  
  // Optimized object updates with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const newObjects = createFlowingObjects();
      // Return old objects to pool
      flowingObjectsRef.current.forEach(obj => returnToPool(obj));
      flowingObjectsRef.current = newObjects;
      setFlowingObjects(newObjects);
    }, 300); // Debounce object creation
    
    return () => clearTimeout(timeoutId);
  }, [createFlowingObjects, returnToPool]);
  
  // Listen for SSE updates to add new flowing objects
  useEffect(() => {
    if (!sse.isConnected) return;
    
    const handleSSEUpdate = (data) => {
      // Data is already parsed by the SSE hook
      if (!data) return;
      
      // Debug: Log all SSE events
      console.log('🌊 Flow View received SSE event:', data);
      
      // Handle file upload processing events
      if (data.event === 'parse' && data.data && data.data.message && data.data.message.includes('chunks')) {
        // Create a processing object for file upload
        const newFileObj = {
          id: `processing-file-${Date.now()}`,
          type: 'processing_file',
          x: -100 - Math.random() * 50,
          y: 150 + Math.random() * 100,
          width: 120,
          height: 40,
          speed: 0.6 + Math.random() * 0.4,
          status: 'processing',
          data: {
            type: 'processing_file',
            message: data.data.message,
            progress: data.data.progress || 0,
            stage: 'parsing'
          },
          opacity: 0.9,
          createdAt: performance.now(),
        };
        
        queueSSEUpdate('ADD_OBJECT', newFileObj);
      }
      
      // Handle chunk processing events from AI content
      if (data.step === 'chunk_processing_start' && data.chunkData) {
        // Add new processing chunk object
        const newChunkObj = {
          id: `processing-chunk-${data.chunkData.chunkId}-${Date.now()}`,
          type: 'processing_chunk',
          x: -100 - Math.random() * 50,
          y: 100 + (data.chunkData.position * 200) + Math.random() * 30,
          width: Math.max(80, Math.min(150, (data.chunkData.title?.length || 20) * 3)),
          height: 35,
          speed: 0.8 + Math.random() * 0.7,
          status: 'processing',
          data: {
            type: 'processing_chunk',
            chunkId: data.chunkData.chunkId,
            sessionId: data.chunkData.sessionId,
            title: data.chunkData.title,
            currentChunk: data.chunkData.currentChunk,
            totalChunks: data.chunkData.totalChunks,
            preview: data.chunkData.preview,
            stage: 'analyzing'
          },
          opacity: 0.95,
          createdAt: performance.now(),
        };
        
        queueSSEUpdate('ADD_OBJECT', newChunkObj);
      }
      
      // Update chunk processing stage
      if (data.step && data.chunkData && ['analyze', 'analyze_complete', 'context_generate', 'context_complete', 'embedding', 'embed_complete', 'storing', 'store_complete'].includes(data.step)) {
        queueSSEUpdate('UPDATE_OBJECT', {
          id: `processing-chunk-${data.chunkData.chunkId}`,
          updates: {
            data: {
              stage: data.step.replace('_complete', '').replace('_generate', '').replace('_storing', '')
            },
            status: data.step.includes('_complete') ? 'completing' : 'processing'
          }
        });
      }
      
      // Remove completed chunks
      if (data.step === 'chunk_processing_complete' && data.chunkData) {
        // Mark chunk as completed and let it flow off screen naturally
        queueSSEUpdate('UPDATE_OBJECT', {
          id: `processing-chunk-${data.chunkData.chunkId}`,
          updates: {
            status: 'completed',
            data: { stage: 'completed' },
            speed: (flowingObjectsRef.current.find(obj => obj.id === `processing-chunk-${data.chunkData.chunkId}`)?.speed || 1) * 1.5
          }
        });
      }
      
      // Handle file upload stage updates
      if (data.event && ['upload', 'complete', 'session'].includes(data.event)) {
        // Update existing file object or create new one
        const existingIndex = flowingObjectsRef.current.findIndex(obj => 
          obj.type === 'processing_file' && 
          obj.id.includes('processing-file')
        );
        
        if (existingIndex >= 0) {
          // Update existing object
          flowingObjectsRef.current[existingIndex] = {
            ...flowingObjectsRef.current[existingIndex],
            data: {
              ...flowingObjectsRef.current[existingIndex].data,
              stage: data.event,
              message: data.data?.message || data.event,
              progress: data.data?.progress || 0
            }
          };
        } else if (data.event !== 'complete') {
          // Create new object for non-complete events
          const newFileObj = {
            id: `processing-file-${Date.now()}`,
            type: 'processing_file',
            x: -100 - Math.random() * 50,
            y: 150 + Math.random() * 100,
            width: 120,
            height: 40,
            speed: 0.6 + Math.random() * 0.4,
            status: 'processing',
            data: {
              type: 'processing_file',
              message: data.data?.message || data.event,
              progress: data.data?.progress || 0,
              stage: data.event
            },
            opacity: 0.9,
          };
          
          flowingObjectsRef.current = [...flowingObjectsRef.current, newFileObj];
        }
      }
      
      // Handle general processing events
      if (data.step === 'process' || data.step === 'processing_progress') {
        // Add general processing indicator
        const newProcessingObj = {
          id: `live-processing-${Date.now()}`,
          type: 'processing',
          x: -50,
          y: 250 + Math.random() * 80,
          width: 45,
          height: 25,
          speed: 1.5 + Math.random(),
          status: 'processing',
          data: { type: 'live_event', sessionId: data.sessionId || 'unknown' },
          opacity: 0.8,
          createdAt: performance.now(),
        };
        
        queueSSEUpdate('ADD_OBJECT', newProcessingObj);
      }
    };
    
    // Handle SSE data updates
    if (sse.data) {
      handleSSEUpdate(sse.data);
    }
  }, [sse.isConnected, sse.data, queueSSEUpdate]);
  
  // Get color based on status and type
  const getStatusColor = (status, stage = null, type = null) => {
    // Special color for upload processing
    if (type === 'processing_upload') {
      switch (status) {
        case 'uploading': return '#ea580c'; // orange-600
        case 'processing': return '#f97316'; // orange-500
        case 'completed': return '#10b981'; // green
        case 'failed': return '#ef4444'; // red
        default: return '#fb923c'; // orange-400
      }
    }
    
    switch (status) {
      case 'processing': 
        // Color by processing stage for chunk processing
        if (stage) {
          switch (stage) {
            case 'analyzing': return '#f59e0b'; // amber
            case 'analyze': return '#f59e0b'; // amber
            case 'context': return '#8b5cf6'; // purple
            case 'embedding': return '#06b6d4'; // cyan
            case 'storing': return '#84cc16'; // lime
            case 'completing': return '#10b981'; // green
            default: return '#f59e0b'; // amber
          }
        }
        return '#f59e0b'; // amber
      case 'completed': return '#10b981'; // green
      case 'completing': return '#22c55e'; // light green
      case 'failed': return '#ef4444'; // red
      case 'queued': return '#6b7280'; // gray
      default: return '#3b82f6'; // blue
    }
  };
  
  // Get type-specific styling
  const getTypeStyle = (type) => {
    switch (type) {
      case 'document':
        return { borderRadius: 8, shadow: true };
      case 'processing':
        return { borderRadius: 4, pulse: true };
      case 'processing_upload':
        return { borderRadius: 6, pulse: true, border: true };
      case 'processing_chunk':
        return { borderRadius: 6, shadow: true, pulse: true, border: true };
      case 'chunks':
        return { borderRadius: 2, glow: true };
      default:
        return { borderRadius: 4 };
    }
  };
  
  // Animation timing state
  const lastFrameTimeRef = useRef(performance.now());
  const targetFPS = 60;
  const frameInterval = 1000 / targetFPS;
  
  // Enhanced object cleanup settings - aggressive memory management
  const maxObjects = 15; // Reduced from 30 to 15 to prevent browser memory reloads
  const objectLifetime = 15000; // Reduced from 20s to 15s for faster cleanup
  const MAX_POOLED_OBJECTS = 50; // Reduced from 100 to 50 for memory conservation
  const CLEANUP_INTERVAL = 3000; // Cleanup every 3 seconds (more frequent)

  // Animation loop
  const animate = useCallback(() => {
    if (!canvasRef.current || !isPlaying) return;
    
    const now = performance.now();
    const deltaTime = now - lastFrameTimeRef.current;
    
    // Skip frame if we're running too fast (frame rate limiting)
    if (deltaTime < frameInterval) {
      animationFrameRef.current = requestAnimationFrame(animate);
      return;
    }
    
    lastFrameTimeRef.current = now - (deltaTime % frameInterval);
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Enhanced cleanup with object pooling
    const currentTime = now;
    
    for (let i = flowingObjectsRef.current.length - 1; i >= 0; i--) {
      const obj = flowingObjectsRef.current[i];
      const age = currentTime - (obj.createdAt || now);
      const isOffScreenTooLong = obj.x > canvas.width + 200 && age > 3000; // Reduced from 5s to 3s
      const isTooOld = age > objectLifetime;
      
      if (isOffScreenTooLong || isTooOld) {
        const removed = flowingObjectsRef.current.splice(i, 1)[0];
        returnToPool(removed);
      }
    }
    
    // Aggressive object count limiting
    if (flowingObjectsRef.current.length > maxObjects) {
      const excess = flowingObjectsRef.current.splice(0, flowingObjectsRef.current.length - maxObjects);
      excess.forEach(obj => returnToPool(obj));
    }

    // Update and draw flowing objects (in-place for better performance)
    for (let i = 0; i < flowingObjectsRef.current.length; i++) {
      const obj = flowingObjectsRef.current[i];
      
      // Update position in-place
      obj.x += (obj.speed * flowSpeed * 2);
      
      // Reset position if off-screen with deterministic lane-based positioning
      if (obj.x > canvas.width + 100) {
        // Use object ID hash for consistent lane assignment
        const laneHash = obj.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const laneCount = Math.floor(canvas.height / 80); // ~80px per lane
        const assignedLane = laneHash % laneCount;
        
        obj.x = -100 - (Math.random() * 50); // Small random offset to prevent perfect alignment
        obj.y = 50 + (assignedLane * 80) + (Math.random() * 20 - 10); // Lane with small jitter
      }
      
      // Draw object (optimized rendering)
      const style = getTypeStyle(obj.type);
      const color = getStatusColor(obj.status, obj.data?.stage, obj.type);
      
      ctx.save();
      
      // Simplified rendering for better performance
      ctx.globalAlpha = obj.opacity * flowDensity;
      ctx.fillStyle = color;
      
      if (style.borderRadius && obj.width > 20) {
        drawRoundedRect(ctx, obj.x, obj.y, obj.width, obj.height, style.borderRadius);
      } else {
        ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
      }
      
      // Simplified pulse effect (reduced CPU usage)
      if (style.pulse && (obj.status === 'processing' || obj.status === 'completing') && i % 3 === 0) { // Only pulse every 3rd object
        const pulseAlpha = 0.4 + 0.3 * Math.sin(now * 0.003);
        ctx.globalAlpha = pulseAlpha * flowDensity;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(obj.x - 1, obj.y - 1, obj.width + 2, obj.height + 2);
      }
      
      // Simplified text for important objects only
      if (obj.type === 'processing_chunk' && obj.data?.stage && obj.width > 80 && i < 10) { // Limit text rendering
        ctx.globalAlpha = 0.8 * flowDensity;
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          obj.data.stage.substring(0, 6), 
          obj.x + obj.width / 2, 
          obj.y + obj.height / 2 + 3
        );
      }
      
      ctx.restore();
    }
    
    // Continue animation
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [isPlaying, flowSpeed, flowDensity, frameInterval]);
  
  // Start/stop animation
  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Comprehensive cleanup
      if (sseUpdateTimerRef.current) {
        clearTimeout(sseUpdateTimerRef.current);
        sseUpdateTimerRef.current = null;
      }
      
      // Return all objects to pool
      flowingObjectsRef.current.forEach(obj => returnToPool(obj));
      flowingObjectsRef.current = [];
      
      // Clear pending updates
      pendingSSEUpdatesRef.current = [];
    };
  }, [animate, isPlaying]);
  
  // Forced cleanup interval to prevent memory leaks
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const pool = objectPoolRef.current;
      
      // Force cleanup of old objects
      flowingObjectsRef.current = flowingObjectsRef.current.filter(obj => {
        if (now - obj.createdAt > objectLifetime) {
          returnToPool(obj);
          return false;
        }
        return true;
      });
      
      // Limit pool size aggressively to prevent memory buildup
      while (pool.available.length > MAX_POOLED_OBJECTS / 2) {
        pool.available.pop();
      }
      
      // Clear excess pending updates
      if (pendingSSEUpdatesRef.current.length > MAX_PENDING_UPDATES / 2) {
        pendingSSEUpdatesRef.current = pendingSSEUpdatesRef.current.slice(-MAX_PENDING_UPDATES / 2);
      }
      
      console.log(`🧹 Memory cleanup: ${flowingObjectsRef.current.length} objects, ${pool.available.length} pooled, ${pendingSSEUpdatesRef.current.length} pending updates`);
    }, CLEANUP_INTERVAL);
    
    return () => clearInterval(cleanupInterval);
  }, [returnToPool, objectLifetime, MAX_POOLED_OBJECTS, CLEANUP_INTERVAL, MAX_PENDING_UPDATES]);
  
  // Helper function to draw rounded rectangles
  const drawRoundedRect = (ctx, x, y, width, height, radius) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  };
  
  // Handle mouse interactions
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    setMousePos({ x: e.clientX, y: e.clientY });
    
    // Check for hover on flowing objects
    const hoveredObj = flowingObjectsRef.current.find(obj => 
      mouseX >= obj.x && mouseX <= obj.x + obj.width &&
      mouseY >= obj.y && mouseY <= obj.y + obj.height
    );
    
    setHoveredObject(hoveredObj || null);
  };
  
  const handleMouseLeave = () => {
    setHoveredObject(null);
  };
  
  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Find clicked object
    const clickedObj = flowingObjectsRef.current.find(obj => 
      clickX >= obj.x && clickX <= obj.x + obj.width &&
      clickY >= obj.y && clickY <= obj.y + obj.height
    );
    
    if (clickedObj && clickedObj.type === 'document' && clickedObj.data) {
      // Navigate to document view if it's a document object
      if (handleDocumentSelect && clickedObj.data) {
        handleDocumentSelect(clickedObj.data);
      }
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-3xl">🌊</span>
            Flowing Dashboard
          </h2>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span>Live Processing</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          
          <button
            onClick={() => setShowControls(!showControls)}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            title="Controls"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Controls Panel */}
      {showControls && (
        <div className="card p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Flow Speed: {flowSpeed.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.1"
                value={flowSpeed}
                onChange={(e) => setFlowSpeed(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Density: {Math.round(flowDensity * 100)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={flowDensity}
                onChange={(e) => setFlowDensity(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFlowSpeed(1.0);
                  setFlowDensity(0.7);
                }}
                className="btn-secondary text-sm"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Canvas */}
      <div className="card p-0 overflow-hidden relative">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleCanvasClick}
          className="w-full h-full cursor-crosshair"
          style={{ backgroundColor: '#1f2937' }}
        />
        
        {/* Legend */}
        <div className="absolute top-4 left-4 bg-gray-900 bg-opacity-80 rounded-lg p-3 text-sm">
          <div className="font-medium mb-2">Legend</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-2 bg-green-500 rounded"></div>
              <span>Completed Documents</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-3 bg-amber-500 rounded border border-amber-300" style={{boxShadow: '0 0 4px rgba(245, 158, 11, 0.5)'}}></div>
              <span>Processing Chunks</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-2 bg-amber-500 rounded"></div>
              <span>API Processing</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-3 bg-orange-500 rounded border border-orange-300"></div>
              <span>File Uploads</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-400 rounded"></div>
              <span>Chunk Batches</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-gray-400">
            <div>Colors show processing stage:</div>
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="px-1 bg-amber-500 text-black rounded text-xs">analyze</span>
              <span className="px-1 bg-purple-500 text-white rounded text-xs">context</span>
              <span className="px-1 bg-cyan-500 text-black rounded text-xs">embed</span>
              <span className="px-1 bg-lime-500 text-black rounded text-xs">store</span>
            </div>
          </div>
        </div>
        
        {/* Stats Overlay */}
        <div className="absolute top-4 right-4 bg-gray-900 bg-opacity-80 rounded-lg p-3 text-sm">
          <div className="font-medium mb-2">Live Stats</div>
          <div className="space-y-1">
            <div>Documents: {systemStats.knowledgeBase?.total_documents || 0}</div>
            <div>Chunks: {systemStats.knowledgeBase?.total_chunks || 0}</div>
            <div className="text-amber-400 font-medium">Processing: {getFlowStats.totalProcessingCount}</div>
            <div className="text-xs text-gray-400">
              <div>• API Queue: {getFlowStats.apiProcessingCount}</div>
              <div>• Upload Queue: {getFlowStats.uploadProcessingCount}</div>
              <div>• Merged Total: {getFlowStats.mergedQueueData.length}</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Hover Tooltip */}
      {hoveredObject && (
        <div
          className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm pointer-events-none shadow-lg"
          style={{
            left: mousePos.x + 10,
            top: mousePos.y - 10,
            transform: 'translateY(-100%)'
          }}
        >
          <div className="font-medium mb-1">
            {hoveredObject.type === 'document' ? 'Document' : 
             hoveredObject.type === 'processing' ? 'API Processing' : 
             hoveredObject.type === 'processing_upload' ? 'File Upload' :
             hoveredObject.type === 'processing_chunk' ? 'Processing Chunk' : 'Chunk Batch'}
          </div>
          <div className="text-gray-300">
            Status: <span className="capitalize">{hoveredObject.status}</span>
          </div>
          {hoveredObject.type === 'processing_chunk' && (
            <>
              {hoveredObject.data?.stage && (
                <div className="text-gray-300">
                  Stage: <span className="text-amber-400 capitalize">{hoveredObject.data.stage}</span>
                </div>
              )}
              {hoveredObject.data?.currentChunk && hoveredObject.data?.totalChunks && (
                <div className="text-gray-300">
                  Progress: {hoveredObject.data.currentChunk}/{hoveredObject.data.totalChunks}
                </div>
              )}
              {hoveredObject.data?.title && (
                <div className="text-gray-300 max-w-xs truncate">
                  Title: {hoveredObject.data.title}
                </div>
              )}
              {hoveredObject.data?.preview && (
                <div className="text-gray-400 text-xs max-w-xs truncate mt-1">
                  {hoveredObject.data.preview}
                </div>
              )}
            </>
          )}
          {hoveredObject.type === 'processing_upload' && (
            <>
              {hoveredObject.data?.fileName && (
                <div className="text-gray-300 max-w-xs truncate">
                  File: {hoveredObject.data.fileName}
                </div>
              )}
              {hoveredObject.data?.progress !== undefined && (
                <div className="text-gray-300">
                  Progress: {Math.round(hoveredObject.data.progress)}%
                </div>
              )}
              {hoveredObject.data?.size && (
                <div className="text-gray-400 text-xs">
                  Size: {(hoveredObject.data.size / 1024 / 1024).toFixed(1)}MB
                </div>
              )}
            </>
          )}
          {hoveredObject.type !== 'processing_chunk' && hoveredObject.type !== 'processing_upload' && hoveredObject.data?.title && (
            <div className="text-gray-300 max-w-xs truncate">
              {hoveredObject.data.title}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FlowingDashboard;