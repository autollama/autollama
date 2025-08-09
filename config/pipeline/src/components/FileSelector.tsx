import React, { useState, useMemo } from 'react';
import { FileSelectProps, FileData } from '../types';
import { formatDistanceToNow } from 'date-fns';

export function FileSelector({ files, selectedFile, onFileSelect, className = '' }: FileSelectProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'processing' | 'completed' | 'failed'>('all');

  // Filter and search files
  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           file.url?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || file.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [files, searchTerm, statusFilter]);

  // Group files by status for better organization
  const groupedFiles = useMemo(() => {
    const processing = filteredFiles.filter(f => f.status === 'processing');
    const completed = filteredFiles.filter(f => f.status === 'completed');
    const failed = filteredFiles.filter(f => f.status === 'failed');
    const queued = filteredFiles.filter(f => f.status === 'queued');
    
    return { processing, queued, completed, failed };
  }, [filteredFiles]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <div className="status-indicator status-processing" />;
      case 'completed':
        return <div className="status-indicator status-completed" />;
      case 'failed':
        return <div className="status-indicator status-error" />;
      case 'queued':
        return <div className="status-indicator status-queued" />;
      default:
        return <div className="status-indicator bg-pipeline-muted" />;
    }
  };

  const renderFileGroup = (title: string, files: FileData[], defaultExpanded = true) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    
    if (files.length === 0) return null;

    return (
      <div className="mb-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between w-full px-3 py-2 text-left text-sm font-medium text-pipeline-muted hover:text-pipeline-text transition-colors"
        >
          <span className="flex items-center gap-2">
            {title}
            <span className="bg-pipeline-primary/20 text-pipeline-primary px-2 py-0.5 rounded-full text-xs">
              {files.length}
            </span>
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        
        {isExpanded && (
          <div className="space-y-1 mt-2">
            {files.map((file) => (
              <FileItem
                key={file.id}
                file={file}
                isSelected={selectedFile?.id === file.id}
                onSelect={() => onFileSelect(file)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-pipeline-primary/20">
        <h2 className="text-lg font-semibold text-pipeline-text mb-3">Files</h2>
        
        {/* Search */}
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-pipeline-bg border border-pipeline-primary/30 rounded-lg px-3 py-2 pl-9 text-sm text-pipeline-text placeholder-pipeline-muted focus:outline-none focus:ring-2 focus:ring-pipeline-primary/50 focus:border-pipeline-primary"
          />
          <svg
            className="w-4 h-4 text-pipeline-muted absolute left-3 top-1/2 transform -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="w-full bg-pipeline-bg border border-pipeline-primary/30 rounded-lg px-3 py-2 text-sm text-pipeline-text focus:outline-none focus:ring-2 focus:ring-pipeline-primary/50 focus:border-pipeline-primary"
        >
          <option value="all">All Files</option>
          <option value="processing">Processing</option>
          <option value="queued">Queued</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {filteredFiles.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-pipeline-muted mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-pipeline-muted">
              {searchTerm ? 'No files match your search' : 'No files found'}
            </p>
          </div>
        ) : (
          <>
            {renderFileGroup('🟡 Processing', groupedFiles.processing)}
            {renderFileGroup('🔵 Queued', groupedFiles.queued)}
            {renderFileGroup('🟢 Completed', groupedFiles.completed, false)}
            {renderFileGroup('🔴 Failed', groupedFiles.failed)}
          </>
        )}
      </div>

      {/* Footer Stats */}
      <div className="p-4 border-t border-pipeline-primary/20 text-sm text-pipeline-muted">
        <div className="flex justify-between">
          <span>Total: {files.length}</span>
          <span>Showing: {filteredFiles.length}</span>
        </div>
      </div>
    </div>
  );
}

interface FileItemProps {
  file: FileData;
  isSelected: boolean;
  onSelect: () => void;
}

function FileItem({ file, isSelected, onSelect }: FileItemProps) {
  const getFileName = (name: string) => {
    if (name.startsWith('http')) {
      try {
        const url = new URL(name);
        return url.hostname + url.pathname.slice(-20);
      } catch {
        return name.slice(-30);
      }
    }
    return name.length > 25 ? `...${name.slice(-25)}` : name;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing': return 'text-status-processing';
      case 'completed': return 'text-status-completed';
      case 'failed': return 'text-status-error';
      case 'queued': return 'text-status-queued';
      default: return 'text-pipeline-muted';
    }
  };

  return (
    <button
      onClick={onSelect}
      className={`
        file-item w-full text-left p-3 rounded-lg border transition-all duration-200
        ${isSelected 
          ? 'bg-pipeline-primary/20 border-pipeline-primary shadow-lg glow-primary' 
          : 'bg-pipeline-bg/50 border-pipeline-primary/20 hover:border-pipeline-primary/40 hover:bg-pipeline-secondary/30'
        }
      `}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={`status-indicator ${
            file.status === 'processing' ? 'status-processing' :
            file.status === 'completed' ? 'status-completed' :
            file.status === 'failed' ? 'status-error' :
            'status-queued'
          }`} />
          <span className="text-sm font-medium text-pipeline-text truncate">
            {getFileName(file.name)}
          </span>
        </div>
        <span className={`text-xs font-medium ${getStatusColor(file.status)}`}>
          {file.status}
        </span>
      </div>

      {/* Progress Bar */}
      {file.status === 'processing' && (
        <div className="mb-2">
          <div className="flex justify-between text-xs text-pipeline-muted mb-1">
            <span>{file.processedChunks}/{file.totalChunks} chunks</span>
            <span>{file.progress}%</span>
          </div>
          <div className="w-full bg-pipeline-bg rounded-full h-1.5">
            <div
              className="bg-gradient-to-r from-pipeline-primary to-pipeline-accent h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${file.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="text-xs text-pipeline-muted space-y-1">
        <div className="flex justify-between">
          <span>Chunks: {file.totalChunks}</span>
          <span>
            {formatDistanceToNow(new Date(file.lastActivity), { addSuffix: true })}
          </span>
        </div>
        {file.url && (
          <div className="truncate" title={file.url}>
            🔗 {file.url}
          </div>
        )}
      </div>
    </button>
  );
}