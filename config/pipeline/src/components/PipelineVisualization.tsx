import React, { useCallback, useMemo, useState, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  Panel
} from 'reactflow';
import { FileData, ChunkData, PipelineNodeData } from '../types';
import { PipelineNode } from './nodes/PipelineNode';
import { AnimatedEdge } from './edges/AnimatedEdge';

const nodeTypes = {
  pipeline: PipelineNode
};

const edgeTypes = {
  animated: AnimatedEdge
};

interface PipelineVisualizationProps {
  selectedFile: FileData | null;
  onChunkSelect: (chunk: ChunkData) => void;
  connectionStatus: string;
  lastUpdate: string | null;
}

export function PipelineVisualization({ 
  selectedFile, 
  onChunkSelect, 
  connectionStatus,
  lastUpdate 
}: PipelineVisualizationProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [animatingChunks, setAnimatingChunks] = useState<Map<string, ChunkData>>(new Map());

  // Pipeline stage definitions
  const pipelineStages = [
    { id: 'queue', label: 'Queue', description: 'Files waiting to be processed', storage: 'Memory' },
    { id: 'context', label: 'Context Generation', description: 'AI context analysis', storage: 'GPT-4o mini' },
    { id: 'prepend', label: 'Context Prepending', description: 'PostgreSQL metadata storage', storage: 'PostgreSQL' },
    { id: 'embeddings', label: 'Embeddings', description: 'Vector generation', storage: 'OpenAI API' },
    { id: 'bm25', label: 'BM25 Index', description: 'Text search indexing', storage: 'BM25S' },
    { id: 'available', label: 'OpenWebUI', description: 'RAG pipeline ready', storage: 'Qdrant' }
  ];

  // Create nodes for pipeline stages
  const createPipelineNodes = useCallback((): Node[] => {
    return pipelineStages.map((stage, index) => {
      const isActive = selectedFile?.status === 'processing';
      const chunksInStage = selectedFile?.chunks?.filter(c => c.stage === stage.id).length || 0;
      
      return {
        id: stage.id,
        type: 'pipeline',
        position: { 
          x: index * 250 + 100, 
          y: 200 
        },
        data: {
          label: stage.label,
          description: stage.description,
          status: isActive && chunksInStage > 0 ? 'processing' : 'completed',
          chunksProcessed: chunksInStage,
          totalChunks: selectedFile?.totalChunks || 0,
          processingRate: isActive ? Math.floor(Math.random() * 10) + 5 : 0,
          storage: stage.storage,
          processing: isActive && chunksInStage > 0
        } as PipelineNodeData,
        draggable: false
      };
    });
  }, [selectedFile, pipelineStages]);

  // Create edges between pipeline stages
  const createPipelineEdges = useCallback((): Edge[] => {
    const edges: Edge[] = [];
    
    for (let i = 0; i < pipelineStages.length - 1; i++) {
      const sourceStage = pipelineStages[i];
      const targetStage = pipelineStages[i + 1];
      
      edges.push({
        id: `${sourceStage.id}-${targetStage.id}`,
        source: sourceStage.id,
        target: targetStage.id,
        type: 'animated',
        data: {
          chunks: selectedFile?.chunks?.filter(c => 
            c.stage === sourceStage.id || c.stage === targetStage.id
          ) || [],
          animationDuration: 3
        },
        animated: selectedFile?.status === 'processing'
      });
    }
    
    return edges;
  }, [selectedFile, pipelineStages]);

  // Update nodes and edges when selected file changes
  useEffect(() => {
    if (selectedFile) {
      fetch(`/api/document/${selectedFile.id}/chunks`)
        .then(res => res.json())
        .then(data => {
          const newNodes = createPipelineNodes();
          const newEdges = createPipelineEdges();
          
          setNodes(newNodes);
          setEdges(newEdges);
          // Assuming the API returns a `chunks` property
          selectedFile.chunks = data.chunks;
        });
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [selectedFile, createPipelineNodes, createPipelineEdges]);

  // Handle node clicks (for chunk selection)
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (selectedFile?.chunks) {
      const chunksInStage = selectedFile.chunks.filter(c => c.stage === node.id);
      if (chunksInStage.length > 0) {
        onChunkSelect(chunksInStage[0]); // Select first chunk in stage
      }
    }
  }, [selectedFile, onChunkSelect]);

  // Mobile-responsive node positioning
  const responsiveNodePositions = useMemo(() => {
    const isMobile = window.innerWidth < 768;
    const isTablet = window.innerWidth < 1024;
    
    if (isMobile) {
      // Vertical layout for mobile
      return pipelineStages.map((_, index) => ({
        x: 50,
        y: index * 180 + 100
      }));
    } else if (isTablet) {
      // Compact horizontal for tablet
      return pipelineStages.map((_, index) => ({
        x: index * 200 + 50,
        y: 150
      }));
    } else {
      // Full horizontal for desktop
      return pipelineStages.map((_, index) => ({
        x: index * 250 + 100,
        y: 200
      }));
    }
  }, [pipelineStages]);

  // Update node positions for responsive design
  useEffect(() => {
    setNodes(prev => prev.map((node, index) => ({
      ...node,
      position: responsiveNodePositions[index] || node.position
    })));
  }, [responsiveNodePositions, setNodes]);

  return (
    <div className="w-full h-full bg-pipeline-bg relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Strict}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        className="pipeline-flow"
        proOptions={{ hideAttribution: true }}
      >
        <Background 
          color="#00d4ff" 
          size={2} 
          style={{ opacity: 0.1 }}
        />
        
        {/* Controls for zoom/pan */}
        <Controls 
          className="bg-pipeline-secondary border-pipeline-primary/30"
          style={{ bottom: 20, left: 20 }}
        />
        
        {/* Mini-map for navigation */}
        <MiniMap
          className="bg-pipeline-secondary border border-pipeline-primary/30"
          style={{ 
            bottom: 20, 
            right: 20,
            width: window.innerWidth < 768 ? 120 : 200,
            height: window.innerWidth < 768 ? 80 : 120
          }}
          nodeColor="#00d4ff"
          nodeStrokeColor="#0a0e27"
          nodeBorderRadius={8}
        />

        {/* Info Panel */}
        <Panel position="top-left" className="bg-pipeline-secondary/90 backdrop-blur-sm border border-pipeline-primary/30 rounded-lg p-4 m-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-pipeline-text">
              {selectedFile ? selectedFile.name : 'No file selected'}
            </h3>
            {selectedFile && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <div className={`status-indicator ${
                    selectedFile.status === 'processing' ? 'status-processing' :
                    selectedFile.status === 'completed' ? 'status-completed' :
                    selectedFile.status === 'failed' ? 'status-error' :
                    'status-queued'
                  }`} />
                  <span className="text-pipeline-text capitalize">
                    {selectedFile.status}
                  </span>
                </div>
                <div className="text-sm text-pipeline-muted">
                  {selectedFile.processedChunks}/{selectedFile.totalChunks} chunks processed
                </div>
                {selectedFile.status === 'processing' && (
                  <div className="w-48 bg-pipeline-bg rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-pipeline-primary to-pipeline-accent h-2 rounded-full transition-all duration-300"
                      style={{ width: `${selectedFile.progress}%` }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </Panel>

        {/* Connection Status Panel */}
        <Panel position="top-right" className="bg-pipeline-secondary/90 backdrop-blur-sm border border-pipeline-primary/30 rounded-lg p-3 m-4">
          <div className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === 'Open' ? 'bg-status-completed' : 'bg-status-error'
            } ${connectionStatus === 'Open' ? '' : 'animate-pulse'}`} />
            <span className="text-pipeline-text">
              {connectionStatus === 'Open' ? 'Live' : 'Offline'}
            </span>
            {lastUpdate && (
              <span className="text-pipeline-muted">
                • {new Date(lastUpdate).toLocaleTimeString()}
              </span>
            )}
          </div>
        </Panel>
      </ReactFlow>

      {/* Empty State */}
      {!selectedFile && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center max-w-md mx-auto p-8">
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-pipeline-primary/20 to-pipeline-accent/20 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-pipeline-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-pipeline-text mb-2">
              Select a File to Monitor
            </h3>
            <p className="text-pipeline-muted">
              Choose a file from the sidebar to watch its chunks flow through the RAG processing pipeline in real-time.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}