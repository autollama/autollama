import React, { useState, useEffect } from 'react';
import { PipelineVisualization } from './components/PipelineVisualization';
import { Header } from './components/Header';
import { FileSelector } from './components/FileSelector';
import { ChunkDetail } from './components/ChunkDetail';
import { usePipelineState } from './hooks/usePipelineState';
import { useWebSocket } from './hooks/useWebSocket';
import { ChunkData, FileData } from './types';

function App() {
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [selectedChunk, setSelectedChunk] = useState<ChunkData | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const {
    files,
    selectedFile,
    setSelectedFile,
    stats,
    isConnected,
    lastUpdate
  } = usePipelineState();

  const { connectionStatus } = useWebSocket('ws://localhost:3003');

  // Handle chunk selection for detail view
  const handleChunkSelect = (chunk: ChunkData) => {
    setSelectedChunk(chunk);
  };

  // Handle file selection
  const handleFileSelect = (file: FileData) => {
    setSelectedFile(file);
    // Close mobile menu on selection
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  };

  // Mobile responsive handling
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobileMenuOpen]);

  return (
    <div className=\"min-h-screen bg-pipeline-bg text-pipeline-text\">
      {/* Header */}
      <Header
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        stats={stats}
        connectionStatus={connectionStatus}
      />

      <div className=\"flex h-[calc(100vh-4rem)]\">
        {/* Mobile Menu Toggle */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className=\"fixed top-20 left-4 z-50 md:hidden bg-pipeline-secondary p-2 rounded-lg border border-pipeline-primary/30 hover:bg-pipeline-primary/10 transition-colors\"
          aria-label=\"Toggle file menu\"
        >
          <svg className=\"w-6 h-6\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">
            <path strokeLinecap=\"round\" strokeLinejoin=\"round\" strokeWidth={2} d=\"M4 6h16M4 12h16M4 18h16\" />
          </svg>
        </button>

        {/* File Selector Sidebar */}
        <div className={`
          fixed md:relative top-16 md:top-0 left-0 z-40 w-80 h-full
          bg-pipeline-secondary border-r border-pipeline-primary/30
          transform transition-transform duration-300 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <FileSelector
            files={files}
            selectedFile={selectedFile}
            onFileSelect={handleFileSelect}
            className=\"h-full\"
          />
        </div>

        {/* Mobile Overlay */}
        {isMobileMenuOpen && (
          <div
            className=\"fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden\"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Main Pipeline Visualization */}
        <div className=\"flex-1 relative\">
          <PipelineVisualization
            selectedFile={selectedFile}
            onChunkSelect={handleChunkSelect}
            connectionStatus={connectionStatus}
            lastUpdate={lastUpdate}
          />
        </div>
      </div>

      {/* Chunk Detail Modal */}
      <ChunkDetail
        chunk={selectedChunk}
        isOpen={!!selectedChunk}
        onClose={() => setSelectedChunk(null)}
      />

      {/* Connection Status Indicator */}
      <div className=\"fixed bottom-4 right-4 z-50\">
        <div className={`
          px-3 py-2 rounded-lg text-sm font-medium border
          ${isConnected 
            ? 'bg-status-completed/20 border-status-completed text-status-completed' 
            : 'bg-status-error/20 border-status-error text-status-error'
          }
        `}>
          <div className=\"flex items-center gap-2\">
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-status-completed' : 'bg-status-error'
            } ${isConnected ? '' : 'animate-pulse'}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;