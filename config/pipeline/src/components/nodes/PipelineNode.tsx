import React from 'react';
import { Handle, Position } from 'reactflow';
import { CustomNodeProps } from '../../types';

export function PipelineNode({ data, selected }: CustomNodeProps) {
  const getStatusColor = () => {
    switch (data.status) {
      case 'processing':
        return 'border-status-processing bg-status-processing/10';
      case 'completed':
        return 'border-status-completed bg-status-completed/10';
      case 'failed':
        return 'border-status-error bg-status-error/10';
      case 'queued':
        return 'border-status-queued bg-status-queued/10';
      default:
        return 'border-pipeline-primary/30 bg-pipeline-secondary/50';
    }
  };

  const getStatusIcon = () => {
    switch (data.status) {
      case 'processing':
        return (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-status-processing rounded-full animate-pulse" />
            <span className="text-status-processing text-xs font-medium">Processing</span>
          </div>
        );
      case 'completed':
        return (
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3 text-status-completed" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-status-completed text-xs font-medium">Complete</span>
          </div>
        );
      case 'failed':
        return (
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3 text-status-error" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            <span className="text-status-error text-xs font-medium">Failed</span>
          </div>
        );
      case 'queued':
        return (
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3 text-status-queued" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-status-queued text-xs font-medium">Queued</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-pipeline-muted rounded-full" />
            <span className="text-pipeline-muted text-xs font-medium">Idle</span>
          </div>
        );
    }
  };

  const getStorageIcon = (storage?: string) => {
    switch (storage?.toLowerCase()) {
      case 'postgresql':
      case 'postgres':
        return (
          <svg className="w-4 h-4 text-pipeline-primary" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        );
      case 'qdrant':
        return (
          <svg className="w-4 h-4 text-pipeline-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        );
      case 'openai api':
      case 'gpt-4o mini':
        return (
          <svg className="w-4 h-4 text-pipeline-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        );
      case 'bm25s':
        return (
          <svg className="w-4 h-4 text-pipeline-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        );
      case 'memory':
        return (
          <svg className="w-4 h-4 text-pipeline-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4 text-pipeline-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
          </svg>
        );
    }
  };

  return (
    <div
      className={`
        pipeline-node relative bg-pipeline-secondary backdrop-blur-sm rounded-xl border-2 
        transition-all duration-300 shadow-lg min-w-[200px] max-w-[280px]
        ${getStatusColor()}
        ${selected ? 'ring-2 ring-pipeline-primary ring-opacity-50 glow-primary' : ''}
        ${data.processing ? 'animate-pulse-glow' : ''}
        hover:shadow-xl hover:scale-105
      `}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-pipeline-primary border-2 border-pipeline-bg"
      />

      {/* Node Content */}
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {getStorageIcon(data.storage)}
            <h3 className="font-semibold text-pipeline-text text-sm">
              {data.label}
            </h3>
          </div>
          {getStatusIcon()}
        </div>

        {/* Description */}
        {data.description && (
          <p className="text-xs text-pipeline-muted mb-3">
            {data.description}
          </p>
        )}

        {/* Stats */}
        <div className="space-y-2">
          {/* Chunk Progress */}
          <div className="flex justify-between text-xs">
            <span className="text-pipeline-muted">Chunks</span>
            <span className="text-pipeline-text font-medium">
              {data.chunksProcessed}
              {data.totalChunks > 0 && `/${data.totalChunks}`}
            </span>
          </div>

          {/* Progress Bar */}
          {data.totalChunks > 0 && (
            <div className="w-full bg-pipeline-bg rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  data.processing 
                    ? 'bg-gradient-to-r from-status-processing to-pipeline-primary' 
                    : 'bg-gradient-to-r from-pipeline-primary to-pipeline-accent'
                }`}
                style={{ 
                  width: `${Math.min((data.chunksProcessed / data.totalChunks) * 100, 100)}%` 
                }}
              />
            </div>
          )}

          {/* Processing Rate */}
          {data.processingRate > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-pipeline-muted">Rate</span>
              <span className="text-pipeline-accent font-medium">
                {data.processingRate}/min
              </span>
            </div>
          )}

          {/* Storage Info */}
          {data.storage && (
            <div className="flex justify-between text-xs">
              <span className="text-pipeline-muted">Storage</span>
              <span className="text-pipeline-primary font-medium text-xs">
                {data.storage}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-pipeline-primary border-2 border-pipeline-bg"
      />

      {/* Processing Indicator */}
      {data.processing && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-status-processing rounded-full animate-ping" />
      )}
    </div>
  );
}