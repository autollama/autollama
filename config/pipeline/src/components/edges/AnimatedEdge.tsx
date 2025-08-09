import React, { useEffect, useState } from 'react';
import { getBezierPath, BaseEdge, EdgeProps } from 'reactflow';
import { CustomEdgeProps } from '../../types';

export function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data
}: EdgeProps & CustomEdgeProps) {
  const [animatingChunks, setAnimatingChunks] = useState<Array<{
    id: string;
    progress: number;
    startTime: number;
  }>>([]);

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Animate chunks flowing through the edge
  useEffect(() => {
    if (!data?.chunks || data.chunks.length === 0) {
      setAnimatingChunks([]);
      return;
    }

    const duration = (data.animationDuration || 5) * 1000; // Convert to milliseconds
    const newChunks = data.chunks.map((chunk, index) => ({
      id: chunk.id,
      progress: 0,
      startTime: Date.now() + (index * 500) // Stagger animations by 500ms
    }));

    setAnimatingChunks(newChunks);

    const animate = () => {
      const now = Date.now();
      
      setAnimatingChunks(prev => prev.map(chunk => {
        const elapsed = now - chunk.startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        return {
          ...chunk,
          progress: progress < 0 ? 0 : progress
        };
      }).filter(chunk => chunk.progress < 1)); // Remove completed animations
    };

    const interval = setInterval(animate, 16); // ~60fps

    const timeout = setTimeout(() => {
      setAnimatingChunks([]);
    }, duration + (data.chunks.length * 500)); // Clean up after all animations complete

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [data?.chunks, data?.animationDuration]);

  // Calculate position along the path
  const getPointOnPath = (progress: number) => {
    if (typeof document !== 'undefined') {
      const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathElement.setAttribute('d', edgePath);
      const length = pathElement.getTotalLength();
      const point = pathElement.getPointAtLength(length * progress);
      return { x: point.x, y: point.y };
    }
    
    // Fallback for SSR or when document is not available
    return {
      x: sourceX + (targetX - sourceX) * progress,
      y: sourceY + (targetY - sourceY) * progress
    };
  };

  return (
    <g>
      {/* Base edge path */}
      <BaseEdge 
        id={id} 
        path={edgePath}
        style={{
          stroke: 'rgba(0, 212, 255, 0.3)',
          strokeWidth: 2,
          fill: 'none'
        }}
      />

      {/* Animated edge overlay for active connections */}
      {data?.chunks && data.chunks.length > 0 && (
        <BaseEdge
          id={`${id}-active`}
          path={edgePath}
          style={{
            stroke: 'rgba(0, 212, 255, 0.6)',
            strokeWidth: 3,
            fill: 'none',
            filter: 'drop-shadow(0 0 4px rgba(0, 212, 255, 0.8))'
          }}
        />
      )}

      {/* Animated chunk dots */}
      {animatingChunks.map((chunk) => {
        const position = getPointOnPath(chunk.progress);
        
        return (
          <g key={chunk.id}>
            {/* Glow effect */}
            <circle
              cx={position.x}
              cy={position.y}
              r="12"
              fill="rgba(0, 255, 127, 0.2)"
              style={{
                filter: 'blur(4px)',
                opacity: chunk.progress > 0 ? 0.8 : 0
              }}
            />
            
            {/* Main chunk dot */}
            <circle
              cx={position.x}
              cy={position.y}
              r="8"
              fill="url(#chunkGradient)"
              stroke="rgba(0, 212, 255, 0.8)"
              strokeWidth="2"
              style={{
                opacity: chunk.progress > 0 ? 1 : 0,
                filter: 'drop-shadow(0 0 6px rgba(0, 255, 127, 0.6))'
              }}
            />
            
            {/* Chunk pulse effect */}
            <circle
              cx={position.x}
              cy={position.y}
              r="8"
              fill="none"
              stroke="rgba(0, 255, 127, 0.6)"
              strokeWidth="1"
              style={{
                opacity: chunk.progress > 0 ? 1 : 0,
                animation: 'pulse 1s infinite'
              }}
            />
          </g>
        );
      })}

      {/* SVG Definitions for gradients */}
      <defs>
        <radialGradient id="chunkGradient" cx="0.3" cy="0.3">
          <stop offset="0%" stopColor="#00ff7f" />
          <stop offset="100%" stopColor="#00d4ff" />
        </radialGradient>
        
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge> 
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Flow direction indicator */}
      {data?.chunks && data.chunks.length > 0 && (
        <g>
          {/* Arrow indicator at the end of the edge */}
          <polygon
            points={`${targetX-10},${targetY-5} ${targetX-10},${targetY+5} ${targetX-5},${targetY}`}
            fill="rgba(0, 212, 255, 0.8)"
            style={{
              animation: 'pulse 2s infinite'
            }}
          />
        </g>
      )}

      {/* Edge label for chunk count */}
      {data?.chunks && data.chunks.length > 0 && (
        <text
          x={(sourceX + targetX) / 2}
          y={(sourceY + targetY) / 2 - 10}
          textAnchor="middle"
          className="text-xs font-medium"
          fill="rgba(0, 212, 255, 0.9)"
          style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            textShadow: '0 0 4px rgba(0, 0, 0, 0.8)'
          }}
        >
          {data.chunks.length} chunk{data.chunks.length !== 1 ? 's' : ''}
        </text>
      )}
    </g>
  );
}