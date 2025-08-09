// Core pipeline types
export interface ChunkData {
  id: string;
  text: string;
  metadata?: Record<string, any>;
  filename?: string;
  position?: number;
  stage?: PipelineStage;
  sessionId?: string;
}

export interface FileData {
  id: string;
  name: string;
  status: ProcessingStatus;
  progress: number;
  totalChunks: number;
  processedChunks: number;
  completedChunks: number;
  startedAt: string;
  lastActivity: string;
  completedAt?: string;
  url?: string;
  chunks?: ChunkData[];
}

export interface PipelineUpdate {
  type: 'pipeline_update' | 'connection' | 'file_status';
  data: any;
  timestamp: string;
}

export interface SSEData {
  step: string;
  message: string;
  progress?: number;
  timestamp: string;
  chunkId?: string;
  stage?: PipelineStage;
  filename?: string;
  position?: number;
  metadata?: string;
  sessionId?: string;
  totalChunks?: number;
  currentChunk?: number;
}

// Pipeline stage definitions
export type PipelineStage = 
  | 'queue'
  | 'fetch'
  | 'convert' 
  | 'chunk'
  | 'analyze'
  | 'context'
  | 'embed'
  | 'bm25'
  | 'store'
  | 'available'
  | 'complete'
  | 'error';

export type ProcessingStatus = 
  | 'queued'
  | 'processing' 
  | 'completed'
  | 'failed'
  | 'paused';

// Node types for React Flow
export interface PipelineNodeData {
  label: string;
  status: ProcessingStatus;
  chunksProcessed: number;
  totalChunks: number;
  processingRate: number;
  storage?: string;
  processing?: boolean;
  description?: string;
}

export interface AnimatedEdgeData {
  chunks?: ChunkData[];
  animationDuration?: number;
}

// Model configurations
export interface ModelConfig {
  id: string;
  name: string;
  costPer1M: number;
  description?: string;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    costPer1M: 0.15,
    description: 'Fast and cost-effective'
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    costPer1M: 2.50,
    description: 'High quality analysis'
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    costPer1M: 3.00,
    description: 'Advanced reasoning'
  }
];

// Statistics and monitoring
export interface PipelineStats {
  totalCost: number;
  throughput: number; // chunks per minute
  activeFiles: number;
  totalFiles: number;
  recentFiles: FileData[];
  systemHealth: {
    api: boolean;
    bm25: boolean;
    qdrant: boolean;
    postgres: boolean;
  };
}

// WebSocket message types
export interface WebSocketMessage {
  type: 'connection' | 'pipeline_update' | 'file_status' | 'chunk_update';
  data?: any;
  timestamp: string;
  status?: string;
}

// React Flow specific types
export interface CustomNodeProps {
  data: PipelineNodeData;
  selected?: boolean;
}

export interface CustomEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number; 
  targetY: number;
  data?: AnimatedEdgeData;
}

// Hook return types
export interface UsePipelineState {
  files: FileData[];
  selectedFile: FileData | null;
  setSelectedFile: (file: FileData | null) => void;
  stats: PipelineStats;
  isConnected: boolean;
  lastUpdate: string | null;
}

export interface UseWebSocketReturn {
  connectionStatus: 'Connecting' | 'Open' | 'Closing' | 'Closed';
  lastMessage: MessageEvent | null;
  sendMessage: (message: string) => void;
}

// Component prop types
export interface FileSelectProps {
  files: FileData[];
  selectedFile: FileData | null;
  onFileSelect: (file: FileData) => void;
  className?: string;
}

export interface HeaderProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  stats: PipelineStats;
  connectionStatus: string;
}

export interface ChunkDetailProps {
  chunk: ChunkData | null;
  isOpen: boolean;
  onClose: () => void;
}