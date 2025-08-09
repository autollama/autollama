import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X, AlertCircle, CheckCircle, Loader, File, Image } from 'lucide-react';
import { useAppContext } from '../../App';
import { useSSE } from '../../hooks/useSSE';

// Helper function to get file icon
const getFileIcon = (type) => {
  if (type.includes('pdf')) return FileText;
  if (type.includes('image')) return Image;
  return File;
};

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const FileUploader = ({ onSuccess, onError }) => {
  
  const { 
    api, 
    settings, 
    updateSetting, 
    uploadQueue,
    addToUploadQueue,
    updateUploadStatus,
    removeFromUploadQueue,
    clearCompletedUploads
  } = useAppContext();
  
  
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // No pre-established SSE connection - we'll get SSE responses from the POST request

  // Handle drag events
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(Array.from(e.dataTransfer.files));
    } else {
    }
  }, []);

  // Handle file selection
  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    } else {
    }
  };

  // Process selected files
  const handleFiles = (files) => {
    
    const validFiles = files.filter(file => isValidFile(file));
    
    const newFiles = addToUploadQueue(validFiles);
    
    // Auto-start upload if enabled
    if (settings?.processing?.autoStartProcessing) {
      newFiles.forEach(fileData => {
        uploadFile(fileData);
      });
    } else {
    }
  };

  // Validate file
  const isValidFile = (file) => {
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/epub+zip',
      'text/csv',
      'application/json',
    ];
    
    const maxSize = 100 * 1024 * 1024; // 100MB for large academic texts
    
    return allowedTypes.includes(file.type) && file.size <= maxSize;
  };

  // Upload individual file with SSE streaming
  const uploadFile = async (fileData) => {
    updateUploadStatus(fileData.id, { status: 'uploading', progress: 0 });

    let timeoutId = null;
    
    try {
      const formData = new FormData();
      formData.append('file', fileData.file);
      formData.append('enableContextual', settings.processing.enableContextualEmbeddings);
      formData.append('source', 'user');

      // Make a fetch request to the streaming endpoint with extended timeout for large files
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 1800000); // 30 minutes timeout for large files
      
      // Store the abort controller so we can cancel the upload
      updateUploadStatus(fileData.id, { abortController: controller });
      
      const response = await fetch('/api/process-file-stream', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Read the SSE stream with proper chunked data handling
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ''; // Buffer for incomplete messages

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete lines from buffer
          const lines = buffer.split('\n');
          
          // Keep the last potentially incomplete line in buffer
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim() === '') continue; // Skip empty lines
            
            if (line.startsWith('data: ')) {
              try {
                const jsonData = line.slice(6).trim(); // Remove 'data: ' prefix and trim
                if (jsonData === '') continue; // Skip empty data lines
                
                const data = JSON.parse(jsonData);
                // Ensure data has the expected structure
                if (data && typeof data === 'object') {
                  handleProgressUpdate({ event: data.event, data: data.data }, fileData);
                }
              } catch (parseError) {
                console.error('Failed to parse SSE data:', parseError, 'Line:', line);
                // Don't fail the entire upload for parse errors
              }
            }
          }
        }
        
        // Process any remaining data in buffer
        if (buffer.trim() && buffer.startsWith('data: ')) {
          try {
            const jsonData = buffer.slice(6).trim();
            if (jsonData) {
              const data = JSON.parse(jsonData);
              if (data && typeof data === 'object') {
                handleProgressUpdate({ event: data.event, data: data.data }, fileData);
              }
            }
          } catch (parseError) {
            console.error('Failed to parse final SSE data:', parseError, 'Buffer:', buffer);
          }
        }
      } finally {
        reader.releaseLock();
        clearTimeout(timeoutId); // Clean up timeout
      }

      // SSE stream ended - if no completion event was received, 
      // the upload may have completed but the event was missed
      
      // Set a reasonable timeout to check for completion if we haven't received a complete event
      setTimeout(() => {
        updateUploadStatus(fileData.id, {
          status: 'processing',
          progress: Math.max(fileData.progress || 0, 95) // Show near completion
        });
      }, 1000);

    } catch (error) {
      console.error('Upload failed:', error);
      if (timeoutId) clearTimeout(timeoutId); // Clean up timeout on error
      
      // Extract meaningful error message from different error types
      let errorMessage = 'Upload failed';
      if (error.name === 'AbortError') {
        // Check if this was a user-initiated cancellation or timeout
        const currentStatus = uploadQueue.find(f => f.id === fileData.id)?.status;
        if (currentStatus === 'cancelled') {
          return; // Don't update status if already marked as cancelled
        }
        errorMessage = 'Upload timeout - file too large or connection too slow';
      } else if (error.response) {
        // HTTP error with response
        if (error.response.status === 413) {
          errorMessage = 'File too large (max 500MB)';
        } else if (error.response.status === 415) {
          errorMessage = 'Unsupported file type';
        } else if (error.response.data?.message) {
          errorMessage = error.response.data.message;
        } else {
          errorMessage = `HTTP ${error.response.status}: ${error.response.statusText || 'Upload failed'}`;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      updateUploadStatus(fileData.id, { 
        status: 'error', 
        error: errorMessage
      });

      if (onError) {
        onError(fileData, error);
      }
    }
  };

  // Handle progress updates from SSE stream
  const handleProgressUpdate = (data, fileData) => {
    
    // Ensure data has the expected structure
    if (!data || typeof data !== 'object') {
      console.warn('Invalid progress update data:', data);
      return;
    }
    
    const event = data.event;
    const eventData = data.data || {};
    
    if (event === 'error') {
      // Enhanced error handling with recovery suggestions
      const errorData = {
        id: Date.now().toString(),
        message: eventData.message || 'Upload failed',
        error_type: eventData.error_type || 'unknown',
        recovery_suggestions: eventData.recovery_suggestions || ['Try uploading again'],
        retry_recommended: eventData.retry_recommended || false,
        severity: eventData.severity || 'high',
        category: eventData.category || 'processing',
        retryable: eventData.retryable || eventData.retry_recommended || false,
        timestamp: new Date().toISOString()
      };
      
      updateUploadStatus(fileData.id, { 
        status: 'error', 
        error: errorData.message,
        error_type: errorData.error_type,
        recovery_suggestions: errorData.recovery_suggestions,
        retry_recommended: errorData.retry_recommended
      });
      
      if (onError) {
        onError(fileData, errorData);
      }
    } else if (event === 'heartbeat_timeout') {
      // Handle heartbeat timeout - processing is stuck
      updateUploadStatus(fileData.id, {
        status: 'stuck',
        message: eventData.message || 'Processing is taking longer than expected...',
        time_since_last_update: eventData.time_since_last_update,
        progress: eventData.total_progress || 50
      });
    } else if (event === 'heartbeat') {
      // Regular heartbeat - system is responsive
      updateUploadStatus(fileData.id, {
        last_heartbeat: eventData.timestamp,
        heartbeat_step: eventData.step
      });
    } else if (event === 'start') {
      // Processing started
      updateUploadStatus(fileData.id, {
        status: 'processing',
        sessionId: eventData.processingId,
        progress: 5
      });
    } else if (event === 'upload') {
      // File upload progress (5-30%)
      updateUploadStatus(fileData.id, {
        status: 'uploading',
        progress: Math.max(eventData.progress || 5, 5)
      });
    } else if (event === 'parse') {
      // File parsing progress (30-50%)
      updateUploadStatus(fileData.id, {
        status: 'processing',
        progress: Math.max(eventData.progress || 40, 30)
      });
    } else if (event === 'chunk') {
      // Chunking progress (50-60%)
      updateUploadStatus(fileData.id, {
        status: 'processing',
        progress: Math.max(eventData.progress || 55, 50)
      });
    } else if (event === 'analyze') {
      // AI analysis progress (60-80%)
      const analysisProgress = eventData.progress || 70;
      updateUploadStatus(fileData.id, {
        status: 'processing',
        progress: Math.max(analysisProgress, 60)
      });
    } else if (event === 'embedding') {
      // Embedding generation progress (80-90%)
      const embeddingProgress = eventData.progress || 85;
      updateUploadStatus(fileData.id, {
        status: 'processing',
        progress: Math.max(embeddingProgress, 80)
      });
    } else if (event === 'qdrant') {
      // Vector storage progress (90-95%)
      updateUploadStatus(fileData.id, {
        status: 'processing',
        progress: Math.max(eventData.progress || 92, 90)
      });
    } else if (event === 'complete') {
      // Processing completed
      updateUploadStatus(fileData.id, { 
        status: 'completed', 
        progress: 100 
      });
      
      if (onSuccess) {
        onSuccess(fileData, eventData);
      }
    } else {
      // Handle any other progress events with generic progress mapping
      const genericProgress = eventData.progress || 0;
      if (genericProgress > 0) {
        updateUploadStatus(fileData.id, {
          status: 'processing',
          progress: Math.min(Math.max(genericProgress, 5), 95) // Keep between 5-95%
        });
      }
    }
  };

  // Remove file from list
  const removeFile = (fileId) => {
    removeFromUploadQueue(fileId);
  };

  // Retry upload
  const retryUpload = (fileData) => {
    uploadFile(fileData);
  };

  // Stop/Cancel upload
  const stopUpload = (fileData) => {
    if (fileData.abortController) {
      fileData.abortController.abort();
      updateUploadStatus(fileData.id, { 
        status: 'cancelled', 
        error: 'Upload cancelled by user',
        abortController: null 
      });
    }
  };



  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer
          ${dragActive 
            ? 'border-primary-400 bg-primary-600 bg-opacity-10' 
            : 'border-gray-600 hover:border-gray-500'
          }
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => {
          fileInputRef.current?.click();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.doc,.docx,.epub,.csv,.json"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <div className="space-y-4">
          <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
            dragActive ? 'bg-primary-500 bg-opacity-20' : 'bg-gray-700'
          }`}>
            <Upload className={`w-8 h-8 ${dragActive ? 'text-primary-400' : 'text-gray-400'}`} />
          </div>
          
          <div>
            <h3 className="text-lg font-bold mb-2">
              {dragActive ? 'Drop files here!' : 'Upload Documents'}
            </h3>
            <p className="text-gray-400 mb-4">
              Drag and drop files here, or click to browse
            </p>
            <div className="text-sm text-gray-500">
              <p>Supported: PDF, TXT, MD, DOC, DOCX, EPUB, CSV, JSON</p>
              <p>Maximum size: 100MB per file</p>
            </div>
          </div>
          
          <button className="btn-primary">
            <Upload className="w-4 h-4" />
            Choose Files
          </button>
        </div>
      </div>

      {/* Processing Options */}
      <div className="card">
        <h4 className="font-bold mb-4">Processing Options</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.processing.enableContextualEmbeddings}
              onChange={(e) => updateSetting('processing', 'enableContextualEmbeddings', e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm">Enable Contextual Embeddings</span>
          </label>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.processing.autoStartProcessing || false}
              onChange={(e) => updateSetting('processing', 'autoStartProcessing', e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm">Auto-start Processing</span>
          </label>
        </div>
      </div>

      {/* Upload Queue */}
      {uploadQueue.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold">Upload Queue</h4>
            <div className="text-sm text-gray-400">
              {uploadQueue.length} file{uploadQueue.length !== 1 ? 's' : ''}
            </div>
          </div>
          
          <div className="space-y-3">
            {uploadQueue.map((fileData) => (
              <FileUploadItem
                key={fileData.id}
                fileData={fileData}
                onRemove={() => removeFile(fileData.id)}
                onRetry={() => retryUpload(fileData)}
                onUpload={() => uploadFile(fileData)}
                onStop={() => stopUpload(fileData)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upload Statistics */}
      {uploadQueue.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Files"
            value={uploadQueue.length}
            color="text-blue-400"
          />
          <StatCard
            title="Completed"
            value={uploadQueue.filter(f => f.status === 'completed').length}
            color="text-green-400"
          />
          <StatCard
            title="Processing"
            value={uploadQueue.filter(f => f.status === 'processing' || f.status === 'uploading').length}
            color="text-yellow-400"
          />
          <StatCard
            title="Failed"
            value={uploadQueue.filter(f => f.status === 'error' || f.status === 'cancelled').length}
            color="text-red-400"
          />
        </div>
      )}
    </div>
  );
};

// Individual File Upload Item Component
const FileUploadItem = ({ fileData, onRemove, onRetry, onUpload, onStop }) => {
  const FileIcon = getFileIcon(fileData.type);
  
  const statusConfig = {
    pending: { 
      color: 'text-gray-400', 
      bg: 'bg-gray-600', 
      icon: FileText,
      action: 'Upload'
    },
    uploading: { 
      color: 'text-blue-400', 
      bg: 'bg-blue-600', 
      icon: Loader,
      action: 'Uploading...'
    },
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
    cancelled: { 
      color: 'text-orange-400', 
      bg: 'bg-orange-600', 
      icon: X,
      action: 'Cancelled'
    },
  };

  const config = statusConfig[fileData.status] || statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-800 bg-opacity-50 rounded-lg border border-gray-700">
      {/* File Icon */}
      <div className="w-10 h-10 bg-primary-600 bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
        <FileIcon className="w-5 h-5 text-primary-400" />
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-white truncate">{fileData.name}</span>
          <span className="text-xs text-gray-500">{formatFileSize(fileData.size)}</span>
        </div>
        
        {/* Progress Bar */}
        {(fileData.status === 'uploading' || fileData.status === 'processing') && (
          <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${config.bg}`}
              style={{ width: `${fileData.progress || 0}%` }}
            />
          </div>
        )}
        
        <div className="flex items-center gap-2 text-sm">
          <StatusIcon className={`w-4 h-4 ${config.color} ${
            fileData.status === 'uploading' || fileData.status === 'processing' ? 'animate-spin' : ''
          }`} />
          <span className={config.color}>{config.action}</span>
          {fileData.progress > 0 && fileData.status !== 'completed' && (
            <span className="text-gray-400">({Math.round(fileData.progress)}%)</span>
          )}
        </div>
        
        {fileData.error && (
          <div className="text-sm text-red-400 mt-1">
            {fileData.error}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {fileData.status === 'pending' && (
          <button
            onClick={onUpload}
            className="btn-primary text-sm"
          >
            Upload
          </button>
        )}
        
        {(fileData.status === 'uploading' || fileData.status === 'processing') && (
          <button
            onClick={onStop}
            className="btn-secondary text-sm bg-red-600 hover:bg-red-700 text-white"
            title="Stop upload"
          >
            Stop
          </button>
        )}
        
        {fileData.status === 'error' && (
          <button
            onClick={onRetry}
            className="btn-secondary text-sm"
          >
            Retry
          </button>
        )}
        
        {fileData.status === 'cancelled' && (
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


export default FileUploader;