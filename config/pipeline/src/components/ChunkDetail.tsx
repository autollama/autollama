import React, { useEffect } from 'react';
import { ChunkDetailProps } from '../types';
import { formatDistanceToNow } from 'date-fns';

export function ChunkDetail({ chunk, isOpen, onClose }: ChunkDetailProps) {
  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !chunk) return null;

  const getStageColor = (stage?: string) => {
    switch (stage) {
      case 'queue': return 'text-status-queued';
      case 'context': return 'text-status-processing';
      case 'prepend': return 'text-pipeline-primary';
      case 'embeddings': return 'text-pipeline-accent';
      case 'bm25': return 'text-status-completed';
      case 'available': return 'text-status-completed';
      default: return 'text-pipeline-muted';
    }
  };

  const getStageDescription = (stage?: string) => {
    switch (stage) {
      case 'queue': return 'Waiting in processing queue';
      case 'context': return 'AI context generation in progress';
      case 'prepend': return 'Context metadata being stored';
      case 'embeddings': return 'Vector embeddings being generated';
      case 'bm25': return 'Text search index being created';
      case 'available': return 'Ready for RAG queries';
      default: return 'Unknown processing stage';
    }
  };

  const formatMetadata = (metadata: any) => {
    if (!metadata || typeof metadata !== 'object') return {};
    
    // Filter out undefined/null values and format nicely
    const formatted: Record<string, any> = {};
    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        formatted[key] = value;
      }
    });
    
    return formatted;
  };

  const formattedMetadata = formatMetadata(chunk.metadata);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-pipeline-secondary border border-pipeline-primary/30 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-pipeline-primary/20">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex items-center gap-2 text-pipeline-muted hover:text-pipeline-text transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-sm font-medium">Back to Pipeline View</span>
              </button>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Stage Indicator */}
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  chunk.stage === 'queue' ? 'bg-status-queued' :
                  chunk.stage === 'context' ? 'bg-status-processing animate-pulse' :
                  chunk.stage === 'prepend' ? 'bg-pipeline-primary' :
                  chunk.stage === 'embeddings' ? 'bg-pipeline-accent' :
                  chunk.stage === 'bm25' ? 'bg-status-completed' :
                  chunk.stage === 'available' ? 'bg-status-completed' :
                  'bg-pipeline-muted'
                }`} />
                <span className={`text-sm font-medium capitalize ${getStageColor(chunk.stage)}`}>
                  {chunk.stage || 'Unknown'}
                </span>
              </div>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="p-2 text-pipeline-muted hover:text-pipeline-text transition-colors rounded-lg hover:bg-pipeline-bg/50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar">
            <div className="space-y-6">
              {/* Processing Status */}
              <div className="bg-pipeline-bg/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-pipeline-text">
                    Processing Status
                  </h3>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    chunk.stage === 'available' ? 'bg-status-completed/20 text-status-completed' :
                    chunk.stage === 'context' ? 'bg-status-processing/20 text-status-processing' :
                    'bg-pipeline-primary/20 text-pipeline-primary'
                  }`}>
                    {chunk.stage === 'available' ? 'Complete' : 'In Progress'}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-pipeline-muted mb-1">Current Stage</div>
                    <div className="text-pipeline-text font-medium capitalize">
                      {chunk.stage || 'Unknown'}
                    </div>
                    <div className="text-xs text-pipeline-muted mt-1">
                      {getStageDescription(chunk.stage)}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-pipeline-muted mb-1">File</div>
                    <div className="text-pipeline-text font-medium truncate" title={chunk.filename}>
                      {chunk.filename || 'Unknown'}
                    </div>
                  </div>
                </div>
              </div>

              {/* File Information */}
              {chunk.filename && (
                <div className="bg-pipeline-bg/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-pipeline-text mb-3">
                    📄 {chunk.filename}
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-pipeline-muted">Chunk ID:</span>
                      <span className="text-pipeline-text ml-2 font-mono text-xs">
                        {chunk.id}
                      </span>
                    </div>
                    
                    {chunk.position !== undefined && (
                      <div>
                        <span className="text-pipeline-muted">Position:</span>
                        <span className="text-pipeline-text ml-2">
                          #{chunk.position}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Content Preview */}
              <div className="bg-pipeline-bg/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-pipeline-text mb-3">
                  Content Preview
                </h3>
                
                <div className="bg-pipeline-bg rounded-lg p-4 border border-pipeline-primary/20">
                  <pre className="text-sm text-pipeline-text whitespace-pre-wrap font-mono leading-relaxed">
                    {chunk.text.length > 500 
                      ? `${chunk.text.substring(0, 500)}...` 
                      : chunk.text
                    }
                  </pre>
                  
                  {chunk.text.length > 500 && (
                    <div className="mt-3 pt-3 border-t border-pipeline-primary/20">
                      <span className="text-xs text-pipeline-muted">
                        Showing first 500 characters of {chunk.text.length} total
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata */}
              {Object.keys(formattedMetadata).length > 0 && (
                <div className="bg-pipeline-bg/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-pipeline-text mb-3">
                    Metadata
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(formattedMetadata).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <div className="text-sm font-medium text-pipeline-muted capitalize">
                          {key.replace(/_/g, ' ')}
                        </div>
                        <div className="text-sm text-pipeline-text">
                          {Array.isArray(value) ? value.join(', ') : 
                           typeof value === 'object' ? JSON.stringify(value, null, 2) :
                           String(value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Processing Pipeline Progress */}
              <div className="bg-pipeline-bg/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-pipeline-text mb-3">
                  Pipeline Progress
                </h3>
                
                <div className="space-y-3">
                  {[
                    { id: 'queue', label: 'Queue', desc: 'File submitted for processing' },
                    { id: 'context', label: 'Context Generation', desc: 'AI analysis and context creation' },
                    { id: 'prepend', label: 'Context Storage', desc: 'Metadata stored in PostgreSQL' },
                    { id: 'embeddings', label: 'Vector Embeddings', desc: 'Semantic embeddings generated' },
                    { id: 'bm25', label: 'Search Index', desc: 'BM25 text search index created' },
                    { id: 'available', label: 'Available', desc: 'Ready for RAG queries' }
                  ].map((stage, index, array) => {
                    const isCompleted = chunk.stage && array.findIndex(s => s.id === chunk.stage) >= index;
                    const isCurrent = chunk.stage === stage.id;
                    
                    return (
                      <div key={stage.id} className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          isCompleted ? 'bg-status-completed' :
                          isCurrent ? 'bg-status-processing animate-pulse' :
                          'bg-pipeline-muted'
                        }`} />
                        
                        <div className="flex-1">
                          <div className={`text-sm font-medium ${
                            isCompleted ? 'text-status-completed' :
                            isCurrent ? 'text-status-processing' :
                            'text-pipeline-muted'
                          }`}>
                            {stage.label}
                          </div>
                          <div className="text-xs text-pipeline-muted">
                            {stage.desc}
                          </div>
                        </div>
                        
                        {isCompleted && (
                          <svg className="w-4 h-4 text-status-completed" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}