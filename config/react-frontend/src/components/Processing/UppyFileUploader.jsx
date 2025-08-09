import React, { useEffect, useState } from 'react';
import Uppy from '@uppy/core';
import { Dashboard } from '@uppy/react';
import XHRUpload from '@uppy/xhr-upload';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useAppContext } from '../../App';

// Import Uppy styles
import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';

const UppyFileUploader = ({ onSuccess, onError }) => {
  const { 
    settings, 
    updateSetting,
    uploadQueue,
    addToUploadQueue,
    updateUploadStatus,
    removeFromUploadQueue
  } = useAppContext();
  
  const [uppy] = useState(() => {
    const uppyInstance = new Uppy({
      id: 'autollama-uploader',
      autoProceed: false,
      restrictions: {
        maxFileSize: 100 * 1024 * 1024, // 100MB
        allowedFileTypes: [
          '.pdf', '.txt', '.md', '.doc', '.docx', 
          '.epub', '.csv', '.json'
        ]
      },
      meta: {
        enableContextual: settings?.processing?.enableContextualEmbeddings || true,
        source: 'user'
      }
    });

    // Configure XHR upload with better error handling
    uppyInstance.use(XHRUpload, {
      endpoint: '/api/process-file-stream',
      formData: true,
      fieldName: 'file',
      timeout: 30 * 60 * 1000, // 30 minutes for large files
      limit: 1, // Process one file at a time
      withCredentials: false,
      headers: {
        'Accept': 'application/json'
      }
    });

    return uppyInstance;
  });

  const [progressConnections] = useState(new Map());

  // Setup Uppy event listeners
  useEffect(() => {
    const handleFileAdded = (file) => {
      // Add to upload queue for tracking
      const fileData = {
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'pending',
        progress: 0,
        file: file.data
      };
      
      addToUploadQueue([fileData]);
    };

    const handleUploadStart = (data) => {
      const fileIds = data.fileIDs;
      fileIds.forEach(fileId => {
        updateUploadStatus(fileId, { status: 'uploading', progress: 5 });
      });
    };

    const handleUploadSuccess = async (file, response) => {
      try {
        const result = response.body;
        
        if (result.success && result.uploadId) {
          // Connect to SSE for progress updates
          const eventSource = new EventSource(`/api/upload-progress/${result.uploadId}`);
          progressConnections.set(file.id, eventSource);
          
          updateUploadStatus(file.id, { 
            status: 'processing', 
            progress: 30,
            uploadId: result.uploadId
          });

          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              handleProgressUpdate(file.id, data);
            } catch (error) {
              console.error('SSE parse error:', error);
            }
          };

          eventSource.onerror = (error) => {
            console.error('SSE connection error:', error);
            eventSource.close();
            progressConnections.delete(file.id);
            
            updateUploadStatus(file.id, { 
              status: 'error', 
              error: 'Connection lost during processing' 
            });
          };
        } else {
          throw new Error(result.message || 'Upload failed');
        }
      } catch (error) {
        console.error('Upload success handler error:', error);
        updateUploadStatus(file.id, { 
          status: 'error', 
          error: error.message 
        });
        
        if (onError) {
          onError({ id: file.id, name: file.name }, error);
        }
      }
    };

    const handleUploadError = (file, error, response) => {
      console.error('Upload error:', error);
      
      let errorMessage = 'Upload failed';
      if (response?.status === 413) {
        errorMessage = 'File too large (max 100MB)';
      } else if (response?.status === 415) {
        errorMessage = 'Unsupported file type';
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      updateUploadStatus(file.id, { 
        status: 'error', 
        error: errorMessage 
      });

      if (onError) {
        onError({ id: file.id, name: file.name }, error);
      }
    };

    const handleComplete = (result) => {
      console.log('Upload batch complete:', result);
    };

    // Attach event listeners
    uppy.on('file-added', handleFileAdded);
    uppy.on('upload', handleUploadStart);
    uppy.on('upload-success', handleUploadSuccess);
    uppy.on('upload-error', handleUploadError);
    uppy.on('complete', handleComplete);

    // Cleanup function
    return () => {
      uppy.off('file-added', handleFileAdded);
      uppy.off('upload', handleUploadStart);
      uppy.off('upload-success', handleUploadSuccess);
      uppy.off('upload-error', handleUploadError);
      uppy.off('complete', handleComplete);
      
      // Close all SSE connections
      progressConnections.forEach(eventSource => {
        eventSource.close();
      });
      progressConnections.clear();
    };
  }, [uppy, addToUploadQueue, updateUploadStatus, onSuccess, onError, progressConnections]);

  // Handle progress updates from SSE
  const handleProgressUpdate = (fileId, data) => {
    const { event, data: eventData } = data;
    
    if (event === 'error') {
      const errorData = {
        message: eventData.message || 'Processing failed',
        error_type: eventData.error_type || 'unknown',
        recovery_suggestions: eventData.recovery_suggestions || ['Try uploading again']
      };
      
      updateUploadStatus(fileId, { 
        status: 'error', 
        error: errorData.message,
        error_type: errorData.error_type,
        recovery_suggestions: errorData.recovery_suggestions
      });
      
      // Close SSE connection
      const eventSource = progressConnections.get(fileId);
      if (eventSource) {
        eventSource.close();
        progressConnections.delete(fileId);
      }
      
      if (onError) {
        onError({ id: fileId }, errorData);
      }
    } else if (event === 'complete') {
      updateUploadStatus(fileId, { 
        status: 'completed', 
        progress: 100 
      });
      
      // Close SSE connection
      const eventSource = progressConnections.get(fileId);
      if (eventSource) {
        eventSource.close();
        progressConnections.delete(fileId);
      }
      
      if (onSuccess) {
        onSuccess({ id: fileId }, eventData);
      }
    } else {
      // Update progress for various stages
      const progressMapping = {
        'upload': Math.max(eventData.progress || 25, 5),
        'queued': Math.max(eventData.progress || 30, 25),
        'parse': Math.max(eventData.progress || 40, 30),
        'chunk': Math.max(eventData.progress || 50, 40),
        'analyze': Math.max(eventData.progress || 70, 50),
        'embedding': Math.max(eventData.progress || 85, 70),
        'qdrant': Math.max(eventData.progress || 95, 85)
      };
      
      const progress = progressMapping[event] || eventData.progress || 0;
      
      updateUploadStatus(fileId, {
        status: 'processing',
        progress: Math.min(progress, 95), // Keep under 100% until complete
        stage: event,
        message: eventData.message
      });
    }
  };

  // Update Uppy meta when settings change
  useEffect(() => {
    uppy.setMeta({
      enableContextual: settings?.processing?.enableContextualEmbeddings || true,
      source: 'user'
    });
  }, [settings?.processing?.enableContextualEmbeddings, uppy]);

  // Auto-start upload if enabled
  useEffect(() => {
    if (settings?.processing?.autoStartProcessing) {
      uppy.setOptions({ autoProceed: true });
    } else {
      uppy.setOptions({ autoProceed: false });
    }
  }, [settings?.processing?.autoStartProcessing, uppy]);

  return (
    <div className="space-y-6">
      {/* Uppy Dashboard */}
      <div className="uppy-dashboard-container">
        <Dashboard
          uppy={uppy}
          plugins={['XHRUpload']}
          height={400}
          theme="dark"
          hideUploadButton={false}
          hideRetryButton={false}
          hidePauseResumeButton={false}
          hideCancelButton={false}
          hideProgressAfterFinish={false}
          showProgressDetails={true}
          note="Upload academic documents up to 100MB. Supported: PDF, TXT, MD, DOC, DOCX, EPUB, CSV, JSON"
          proudlyDisplayPoweredByUppy={false}
        />
      </div>

      {/* Processing Options */}
      <div className="card">
        <h4 className="font-bold mb-4">Processing Options</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.processing?.enableContextualEmbeddings || false}
              onChange={(e) => updateSetting('processing', 'enableContextualEmbeddings', e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm">Enable Contextual Embeddings</span>
          </label>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.processing?.autoStartProcessing || false}
              onChange={(e) => updateSetting('processing', 'autoStartProcessing', e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm">Auto-start Processing</span>
          </label>
        </div>
      </div>

      {/* Upload Queue Status */}
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
            value={uploadQueue.filter(f => f.status === 'error').length}
            color="text-red-400"
          />
        </div>
      )}
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

export default UppyFileUploader;