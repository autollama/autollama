import React, { useState, useRef } from 'react';
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader } from 'lucide-react';

// Simple file uploader that mimics the working Legacy frontend approach
const SimpleFileUploader = ({ onSuccess, onError }) => {
  console.log('🎯 SimpleFileUploader component instantiated');
  
  const [dragActive, setDragActive] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);
  const fileInputRef = useRef(null);

  // Handle drag events
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // Handle drop
  const handleDrop = (e) => {
    console.log('🎯 handleDrop called');
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      console.log('📁 Drop files detected:', e.dataTransfer.files.length);
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Handle file selection
  const handleFileSelect = (e) => {
    console.log('📂 handleFileSelect called');
    console.log('Files from input:', e.target.files?.length || 0);
    if (e.target.files && e.target.files.length > 0) {
      console.log('✅ Files selected, calling handleFiles');
      handleFiles(Array.from(e.target.files));
    }
  };

  // Process files (immediately start upload like Legacy frontend)
  const handleFiles = (files) => {
    console.log('🎯 handleFiles called with:', files.length, 'files');
    
    files.forEach(file => {
      console.log('🚀 Starting upload for file:', file.name, 'size:', file.size);
      
      const fileId = Math.random().toString(36).substr(2, 9);
      const fileData = {
        id: fileId,
        name: file.name,
        size: file.size,
        file: file,
        status: 'uploading',
        progress: 0,
        steps: []
      };
      
      // Add to queue
      setUploadQueue(prev => [...prev, fileData]);
      
      // Start upload immediately (like Legacy frontend)
      uploadFile(fileData);
    });
  };

  // Upload file using Legacy frontend approach
  const uploadFile = async (fileData) => {
    console.log('🚀 uploadFile called for:', fileData.name);
    
    try {
      // Create FormData exactly like Legacy frontend
      const formData = new FormData();
      formData.append('file', fileData.file);
      
      // Call the streaming API exactly like Legacy frontend
      const response = await fetch('/api/process-file-stream', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Failed to start file processing');
      }
      
      // Handle Server-Sent Events exactly like Legacy frontend
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('📦 SSE Event:', data);
              
              // Update file status based on event
              setUploadQueue(prev => prev.map(f => {
                if (f.id === fileData.id) {
                  const updatedFile = { ...f };
                  
                  if (data.event === 'start') {
                    updatedFile.status = 'processing';
                    updatedFile.progress = 5;
                    updatedFile.steps.push(`📤 ${data.data.message}`);
                  } else if (data.event === 'upload') {
                    updatedFile.progress = data.data.progress || 10;
                    updatedFile.steps.push(`📤 ${data.data.message}`);
                  } else if (data.event === 'parse') {
                    updatedFile.progress = data.data.progress || 40;
                    updatedFile.steps.push(`📄 ${data.data.message}`);
                  } else if (data.event === 'session') {
                    updatedFile.progress = data.data.progress || 60;
                    updatedFile.steps.push(`📊 ${data.data.message}`);
                  } else if (data.event === 'analyze') {
                    updatedFile.progress = data.data.progress || 70;
                    updatedFile.steps.push(`🤖 ${data.data.message}`);
                  } else if (data.event === 'context') {
                    updatedFile.steps.push(`🔍 ${data.data.message}`);
                  } else if (data.event === 'store') {
                    updatedFile.progress = data.data.progress || 85;
                    updatedFile.steps.push(`💾 ${data.data.message}`);
                  } else if (data.event === 'complete') {
                    updatedFile.status = 'completed';
                    updatedFile.progress = 100;
                    updatedFile.steps.push(`✅ ${data.data.message}`);
                    if (onSuccess) onSuccess(updatedFile, data.data);
                  } else if (data.event === 'error') {
                    updatedFile.status = 'error';
                    updatedFile.error = data.data.message;
                    if (onError) onError(updatedFile, data.data);
                  }
                  
                  return updatedFile;
                }
                return f;
              }));
              
              if (data.event === 'complete' || data.event === 'error') {
                break;
              }
              
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError);
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadQueue(prev => prev.map(f => {
        if (f.id === fileData.id) {
          return {
            ...f,
            status: 'error',
            error: error.message
          };
        }
        return f;
      }));
      
      if (onError) onError(fileData, error);
    }
  };

  // Remove file from queue
  const removeFile = (fileId) => {
    setUploadQueue(prev => prev.filter(f => f.id !== fileId));
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
          console.log('🖱️ Upload area clicked');
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
              <p>Files will be processed immediately upon selection</p>
            </div>
          </div>
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
              <div key={fileData.id} className="flex items-center gap-4 p-4 bg-gray-800 bg-opacity-50 rounded-lg border border-gray-700">
                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-primary-400" />
                    <span className="font-medium text-white truncate">{fileData.name}</span>
                    <span className="text-xs text-gray-500">{formatFileSize(fileData.size)}</span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-300 ${
                        fileData.status === 'completed' ? 'bg-green-600' : 
                        fileData.status === 'error' ? 'bg-red-600' : 'bg-blue-600'
                      }`}
                      style={{ width: `${fileData.progress || 0}%` }}
                    />
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm">
                    {fileData.status === 'uploading' && <Loader className="w-4 h-4 text-blue-400 animate-spin" />}
                    {fileData.status === 'processing' && <Loader className="w-4 h-4 text-yellow-400 animate-spin" />}
                    {fileData.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-400" />}
                    {fileData.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
                    
                    <span className={
                      fileData.status === 'completed' ? 'text-green-400' :
                      fileData.status === 'error' ? 'text-red-400' :
                      'text-yellow-400'
                    }>
                      {fileData.status === 'uploading' ? 'Uploading...' :
                       fileData.status === 'processing' ? 'Processing...' :
                       fileData.status === 'completed' ? 'Completed' :
                       fileData.status === 'error' ? 'Failed' : 'Pending'}
                    </span>
                    
                    {fileData.progress > 0 && fileData.status !== 'completed' && (
                      <span className="text-gray-400">({Math.round(fileData.progress)}%)</span>
                    )}
                  </div>
                  
                  {fileData.error && (
                    <div className="text-sm text-red-400 mt-1">
                      {fileData.error}
                    </div>
                  )}
                  
                  {/* Processing Steps */}
                  {fileData.steps.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto text-xs text-gray-400 space-y-1">
                      {fileData.steps.slice(-5).map((step, idx) => (
                        <div key={idx}>{step}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => removeFile(fileData.id)}
                  className="p-2 hover:bg-gray-700 rounded transition-colors"
                  title="Remove"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleFileUploader;