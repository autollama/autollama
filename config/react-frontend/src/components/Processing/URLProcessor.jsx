import React, { useState, useRef } from 'react';
import { Link, Globe, Search, X, AlertCircle, CheckCircle, Loader, ExternalLink } from 'lucide-react';
import { useAppContext } from '../../App';
import { useSSE } from '../../hooks/useSSE';

const URLProcessor = ({ onSuccess, onError }) => {
  const { api, settings, updateSetting } = useAppContext();
  const [url, setUrl] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processingHistory, setProcessingHistory] = useState([]);
  const [urlError, setUrlError] = useState('');
  const urlInputRef = useRef(null);

  // SSE connection for real-time URL processing progress
  const sse = useSSE('process-url-stream', {
    onMessage: (data) => {
      handleProgressUpdate(data);
    },
    autoConnect: false,
  });

  // Validate URL
  const isValidUrl = (string) => {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  };

  // Process URL
  const processUrl = async () => {
    if (!url.trim()) {
      setUrlError('Please enter a URL');
      return;
    }

    if (!isValidUrl(url)) {
      setUrlError('Please enter a valid HTTP/HTTPS URL');
      return;
    }

    setUrlError('');
    setProcessing(true);

    // Add to processing history
    const processItem = {
      id: generateId(),
      url: url.trim(),
      status: 'processing',
      progress: 0,
      startTime: new Date(),
      sessionId: null,
      error: null,
    };

    setProcessingHistory(prev => [processItem, ...prev]);

    try {
      // Connect to SSE for progress updates
      sse.connect();

      const response = await api.processing.processUrlStream({
        url: url.trim(),
        enableContextual: settings.processing.enableContextualEmbeddings,
        source: 'user',
      });

      // Update processing item with session ID
      setProcessingHistory(prev => prev.map(item =>
        item.id === processItem.id
          ? { ...item, sessionId: response.sessionId }
          : item
      ));

      if (onSuccess) {
        onSuccess({ url: url.trim(), sessionId: response.sessionId });
      }

      // Clear URL input on successful start
      setUrl('');

    } catch (error) {
      console.error('URL processing failed:', error);
      
      setProcessingHistory(prev => prev.map(item =>
        item.id === processItem.id
          ? { 
              ...item, 
              status: 'error', 
              error: error.message || 'Processing failed',
              endTime: new Date()
            }
          : item
      ));

      if (onError) {
        onError({ url: url.trim() }, error);
      }
    } finally {
      setProcessing(false);
    }
  };

  // Handle progress updates from SSE
  const handleProgressUpdate = (data) => {
    try {
      if (!data || typeof data !== 'object') {
        console.warn('Invalid SSE data received:', data);
        return;
      }
      
      if (data.type === 'progress' && data.sessionId) {
        setProcessingHistory(prev => prev.map(item =>
          item.sessionId === data.sessionId
            ? {
                ...item,
                status: data.status || item.status,
                progress: data.progress?.percentage || item.progress,
                error: data.error || item.error,
                endTime: data.status === 'completed' || data.status === 'error' ? new Date() : item.endTime,
              }
            : item
        ));
      }
    } catch (error) {
      console.error('Error handling SSE progress update:', error);
    }
  };

  // Remove from history
  const removeFromHistory = (itemId) => {
    setProcessingHistory(prev => prev.filter(item => item.id !== itemId));
  };

  // Retry processing
  const retryProcessing = (item) => {
    setUrl(item.url);
    urlInputRef.current?.focus();
  };

  // Generate unique ID
  const generateId = () => {
    return Math.random().toString(36).substr(2, 9);
  };

  // Handle enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !processing) {
      processUrl();
    }
  };

  return (
    <div className="space-y-6">
      {/* URL Input */}
      <div className="card">
        <h3 className="font-bold mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary-400" />
          Process URL
        </h3>
        
        <div className="space-y-4">
          <div>
            <div className="relative">
              <Link className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                ref={urlInputRef}
                type="url"
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setUrlError('');
                }}
                onKeyPress={handleKeyPress}
                className={`input-primary pl-10 ${urlError ? 'border-red-500' : ''}`}
                disabled={processing}
              />
            </div>
            {urlError && (
              <div className="flex items-center gap-2 mt-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {urlError}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.processing.enableContextualEmbeddings}
                  onChange={(e) => updateSetting('processing', 'enableContextualEmbeddings', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span>Enable Contextual Embeddings</span>
              </label>
            </div>
            
            <button
              onClick={processUrl}
              disabled={processing || !url.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Process URL
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Quick URL Templates */}
      <div className="card">
        <h4 className="font-bold mb-3">Quick Start Templates</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { label: 'GitHub Repository', template: 'https://github.com/', icon: '🔧' },
            { label: 'Research Paper', template: 'https://arxiv.org/', icon: '📄' },
            { label: 'Documentation', template: 'https://docs.', icon: '📚' },
            { label: 'Blog Article', template: 'https://', icon: '✍️' },
          ].map((template, index) => (
            <button
              key={index}
              onClick={() => setUrl(template.template)}
              className="flex items-center gap-3 p-3 bg-gray-800 bg-opacity-50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors text-left"
            >
              <span className="text-xl">{template.icon}</span>
              <div>
                <div className="font-medium text-sm">{template.label}</div>
                <div className="text-xs text-gray-400">{template.template}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Processing History */}
      {processingHistory.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold">Processing History</h4>
            <div className="text-sm text-gray-400">
              {processingHistory.length} item{processingHistory.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
            {processingHistory.map((item) => (
              <URLProcessingItem
                key={item.id}
                item={item}
                onRemove={() => removeFromHistory(item.id)}
                onRetry={() => retryProcessing(item)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Processing Statistics */}
      {processingHistory.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total URLs"
            value={processingHistory.length}
            color="text-blue-400"
          />
          <StatCard
            title="Completed"
            value={processingHistory.filter(item => item.status === 'completed').length}
            color="text-green-400"
          />
          <StatCard
            title="Processing"
            value={processingHistory.filter(item => item.status === 'processing').length}
            color="text-yellow-400"
          />
          <StatCard
            title="Failed"
            value={processingHistory.filter(item => item.status === 'error').length}
            color="text-red-400"
          />
        </div>
      )}
    </div>
  );
};

// Individual URL Processing Item Component
const URLProcessingItem = ({ item, onRemove, onRetry }) => {
  const statusConfig = {
    processing: {
      color: 'text-yellow-400',
      bg: 'bg-yellow-600',
      icon: Loader,
      action: 'Processing...'
    },
    completed: {
      color: 'text-green-400',
      bg: 'bg-green-600',
      icon: CheckCircle,
      action: 'Completed'
    },
    error: {
      color: 'text-red-400',
      bg: 'bg-red-600',
      icon: AlertCircle,
      action: 'Failed'
    },
  };

  const config = statusConfig[item.status] || statusConfig.processing;
  const StatusIcon = config.icon;

  const formatDuration = (start, end) => {
    if (!end) return 'In progress...';
    const duration = Math.round((end - start) / 1000);
    return `${duration}s`;
  };

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-800 bg-opacity-50 rounded-lg border border-gray-700">
      {/* URL Info */}
      <div className="w-10 h-10 bg-primary-600 bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
        <Globe className="w-5 h-5 text-primary-400" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-white truncate">{item.url}</span>
          <button
            onClick={() => window.open(item.url, '_blank')}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Open URL"
          >
            <ExternalLink className="w-3 h-3 text-gray-400" />
          </button>
        </div>

        {/* Progress Bar */}
        {item.status === 'processing' && (
          <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${config.bg}`}
              style={{ width: `${item.progress || 0}%` }}
            />
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <StatusIcon className={`w-4 h-4 ${config.color} ${
            item.status === 'processing' ? 'animate-spin' : ''
          }`} />
          <span className={config.color}>{config.action}</span>
          {item.progress > 0 && item.status === 'processing' && (
            <span className="text-gray-400">({Math.round(item.progress)}%)</span>
          )}
          <span className="text-gray-500">
            {formatDuration(item.startTime, item.endTime)}
          </span>
        </div>

        {item.error && (
          <div className="text-sm text-red-400 mt-1">
            {item.error}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {item.status === 'error' && (
          <button
            onClick={onRetry}
            className="btn-secondary text-sm"
          >
            Retry
          </button>
        )}
        
        <button
          onClick={onRemove}
          className="p-2 hover:bg-gray-700 rounded transition-colors"
          title="Remove"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ title, value, color }) => (
  <div className="text-center p-4 bg-gray-800 bg-opacity-50 rounded-lg border border-gray-700">
    <div className={`text-2xl font-bold ${color}`}>{value}</div>
    <div className="text-sm text-gray-400">{title}</div>
  </div>
);

export default URLProcessor;