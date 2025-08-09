import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Loader, CheckCircle, AlertCircle, Play, Pause, X, Eye } from 'lucide-react';
import { useAppContext } from '../../App';

const ProcessingQueue = () => {
  const { api, sse, documents, uploadQueue } = useAppContext();
  const [queueData, setQueueData] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load queue data on mount and refresh periodically, but with a slight delay to avoid duplicate calls
  useEffect(() => {
    // Use a small delay to let any existing cache populate first
    const timer = setTimeout(() => {
      loadQueueData();
    }, 100);
    
    const interval = setInterval(loadQueueData, 10000); // Refresh every 10 seconds
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  // Update queue when SSE messages arrive
  useEffect(() => {
    if (sse.data && sse.data.type === 'processing_progress') {
      updateQueueItem(sse.data);
    }
  }, [sse.data]);

  const loadQueueData = async () => {
    setLoading(true);
    try {
      const inProgress = await api.data.getInProgress();
      setQueueData(inProgress || []);
    } catch (error) {
      console.error('Failed to load queue data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateQueueItem = (progressData) => {
    setQueueData(prev => prev.map(item => 
      item.sessionId === progressData.sessionId
        ? { ...item, ...progressData }
        : item
    ));
  };

  // Memoize merged queue data to prevent expensive recalculations on every render
  const mergedQueueData = useMemo(() => {
    const combined = [...queueData];
    
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
            url: `file://${uploadItem.name}`,
            status: uploadItem.status === 'uploading' ? 'uploading' : 'processing',
            progress: uploadItem.progress || 0,
            totalChunks: uploadItem.totalChunks || 0,
            processedChunks: uploadItem.processedChunks || 0,
            startTime: uploadItem.startTime || new Date(),
            lastUpdate: new Date(),
            source: 'upload_queue'
          });
        }
      }
    });
    
    return combined;
  }, [queueData, uploadQueue]);

  // Memoize processing statistics to prevent recalculation on every render
  const stats = useMemo(() => {
    return {
      total: mergedQueueData.length,
      processing: mergedQueueData.filter(item => 
        item.status === 'processing' || item.status === 'uploading'
      ).length,
      queued: mergedQueueData.filter(item => item.status === 'queued').length,
      completed: mergedQueueData.filter(item => item.status === 'completed').length,
      failed: mergedQueueData.filter(item => item.status === 'error').length,
    };
  }, [mergedQueueData]);

  // If no queue items, show minimal display
  if (mergedQueueData.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-600 bg-opacity-20 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Processing Queue</h3>
              <p className="text-sm text-gray-400">All caught up! No items in queue.</p>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            🦙 Llama is resting
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {/* Queue Header */}
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-yellow-600 bg-opacity-20 rounded-lg flex items-center justify-center">
              <Loader className={`w-5 h-5 text-yellow-400 ${stats.processing > 0 ? 'animate-spin' : ''}`} />
            </div>
            {stats.processing > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-white">{stats.processing}</span>
              </div>
            )}
          </div>
          <div>
            <h3 className="font-bold text-lg">Processing Queue</h3>
            <p className="text-sm text-gray-400">
              {stats.processing} processing • {stats.queued} queued • {stats.completed} completed
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Queue Statistics */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <Loader className="w-4 h-4 text-yellow-400" />
              <span>{stats.processing}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>{stats.queued}</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span>{stats.completed}</span>
            </div>
            {stats.failed > 0 && (
              <div className="flex items-center gap-1">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span>{stats.failed}</span>
              </div>
            )}
          </div>
          
          {/* Expand/Collapse Arrow */}
          <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </div>
        </div>
      </div>

      {/* Expanded Queue Details */}
      {isExpanded && (
        <div className="mt-6 space-y-3 border-t border-gray-700 pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-6 h-6 animate-spin text-primary-400" />
              <span className="ml-2 text-gray-400">Loading queue...</span>
            </div>
          ) : (
            mergedQueueData.map((item, index) => (
              <QueueItem key={item.sessionId || index} item={item} />
            ))
          )}
        </div>
      )}

      {/* Real-time Activity Indicator */}
      {stats.processing > 0 && (
        <div className="mt-4 flex items-center gap-2 text-sm text-yellow-400">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          <span>Llama is actively processing {stats.processing} item{stats.processing !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
};

// Individual queue item component
const QueueItem = ({ item }) => {
  const [showDetails, setShowDetails] = useState(false);

  const statusConfig = {
    queued: { 
      icon: Clock, 
      color: 'text-gray-400', 
      bg: 'bg-gray-600',
      label: 'Queued'
    },
    processing: { 
      icon: Loader, 
      color: 'text-yellow-400', 
      bg: 'bg-yellow-600',
      label: 'Processing',
      animate: true
    },
    completed: { 
      icon: CheckCircle, 
      color: 'text-green-400', 
      bg: 'bg-green-600',
      label: 'Completed'
    },
    error: { 
      icon: AlertCircle, 
      color: 'text-red-400', 
      bg: 'bg-red-600',
      label: 'Failed'
    },
  };

  const config = statusConfig[item.status] || statusConfig.queued;
  const StatusIcon = config.icon;
  const progress = item.progress || {};

  return (
    <div className="bg-gray-800 bg-opacity-50 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between">
        {/* Item Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 ${config.bg} bg-opacity-20 rounded-lg flex items-center justify-center`}>
            <StatusIcon className={`w-4 h-4 ${config.color} ${config.animate ? 'animate-spin' : ''}`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-white truncate">
                {item.title || item.url || `Session ${item.sessionId?.slice(0, 8)}`}
              </h4>
              <span className="text-xs px-2 py-1 bg-gray-700 rounded-full text-gray-300">
                {config.label}
              </span>
            </div>
            
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
              <span>{progress.currentChunk || 0} / {progress.totalChunks || 0} chunks</span>
              {progress.percentage && (
                <span>{Math.round(progress.percentage)}% complete</span>
              )}
              {item.startTime && (
                <span>Started {new Date(item.startTime).toLocaleTimeString()}</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="p-1 hover:bg-gray-700 rounded"
            title="View Details"
          >
            <Eye className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {item.status === 'processing' && progress.percentage !== undefined && (
        <div className="mt-3 bg-gray-700 rounded-full h-2 overflow-hidden">
          <div 
            className="h-full bg-yellow-400 transition-all duration-300 ease-out"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      )}

      {/* Detailed Information */}
      {showDetails && (
        <div className="mt-4 p-3 bg-gray-900 bg-opacity-50 rounded border border-gray-600 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-gray-400">Session ID:</span>
              <span className="ml-2 font-mono text-xs">{item.sessionId}</span>
            </div>
            <div>
              <span className="text-gray-400">Content Type:</span>
              <span className="ml-2">{item.contentType || 'Unknown'}</span>
            </div>
            {progress.currentStep && (
              <div className="col-span-2">
                <span className="text-gray-400">Current Step:</span>
                <span className="ml-2">{progress.currentStep}</span>
              </div>
            )}
            {item.error && (
              <div className="col-span-2">
                <span className="text-red-400">Error:</span>
                <span className="ml-2 text-red-300">{item.error}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessingQueue;