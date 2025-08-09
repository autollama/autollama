import React, { useState, useRef, useEffect } from 'react';
import { Info, ZoomIn, ZoomOut, Download, Maximize2, X } from 'lucide-react';

const VectorHeatmap = ({ vector, title = "Vector Embedding", className = "" }) => {
  const [hoveredDimension, setHoveredDimension] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Generate heatmap visualization
  useEffect(() => {
    if (!vector || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate dimensions for grid layout
    const dimensions = vector.length;
    const cols = Math.ceil(Math.sqrt(dimensions));
    const rows = Math.ceil(dimensions / cols);
    const cellWidth = width / cols;
    const cellHeight = height / rows;

    // Draw heatmap cells
    vector.forEach((value, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * cellWidth;
      const y = row * cellHeight;
      
      // Calculate color based on value
      const intensity = Math.abs(value);
      const maxIntensity = Math.max(...vector.map(v => Math.abs(v)));
      const normalizedIntensity = intensity / maxIntensity;
      
      // Create color based on sign and intensity
      let color;
      if (value > 0) {
        // Positive values: blue spectrum
        const blue = Math.floor(255 * normalizedIntensity);
        color = `rgb(${255 - blue}, ${255 - blue}, 255)`;
      } else if (value < 0) {
        // Negative values: red spectrum
        const red = Math.floor(255 * normalizedIntensity);
        color = `rgb(255, ${255 - red}, ${255 - red})`;
      } else {
        // Zero values: gray
        color = 'rgb(128, 128, 128)';
      }
      
      // Draw cell
      ctx.fillStyle = color;
      ctx.fillRect(x, y, cellWidth - 1, cellHeight - 1);
      
      // Add subtle border
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cellWidth - 1, cellHeight - 1);
    });
  }, [vector, zoomLevel]);

  // Handle mouse move for hover effects
  const handleMouseMove = (event) => {
    if (!vector || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const cols = Math.ceil(Math.sqrt(vector.length));
    const cellWidth = canvas.width / cols;
    const cellHeight = canvas.height / Math.ceil(vector.length / cols);
    
    const col = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);
    const index = row * cols + col;
    
    if (index >= 0 && index < vector.length) {
      setHoveredDimension(index);
    } else {
      setHoveredDimension(null);
    }
  };

  // Export heatmap as image
  const exportHeatmap = () => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `${title.replace(/\s+/g, '_')}_heatmap.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  // Get statistics about the vector
  const getVectorStats = () => {
    if (!vector) return null;
    
    const values = vector.filter(v => v !== 0);
    const positiveValues = vector.filter(v => v > 0);
    const negativeValues = vector.filter(v => v < 0);
    const zeroValues = vector.filter(v => v === 0);
    
    return {
      dimensions: vector.length,
      nonZero: values.length,
      positive: positiveValues.length,
      negative: negativeValues.length,
      zeros: zeroValues.length,
      min: Math.min(...vector),
      max: Math.max(...vector),
      mean: vector.reduce((sum, v) => sum + v, 0) / vector.length,
      magnitude: Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)),
    };
  };

  const stats = getVectorStats();

  if (!vector || vector.length === 0) {
    return (
      <div className={`vector-heatmap bg-gray-800 rounded-lg p-4 ${className}`}>
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-2">📊</div>
          <p>No vector data available</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`vector-heatmap bg-gray-800 rounded-lg overflow-hidden ${className}`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white flex items-center gap-2">
                <span className="text-xl">🎨</span>
                {title}
              </h3>
              <p className="text-sm text-gray-400">
                {stats.dimensions} dimensions • {stats.nonZero} non-zero values
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.25))}
                className="p-1 hover:bg-gray-700 rounded"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4 text-gray-400" />
              </button>
              <span className="text-xs text-gray-500 px-2">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.25))}
                className="p-1 hover:bg-gray-700 rounded"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={exportHeatmap}
                className="p-1 hover:bg-gray-700 rounded"
                title="Export as PNG"
              >
                <Download className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={() => setShowFullscreen(true)}
                className="p-1 hover:bg-gray-700 rounded"
                title="Fullscreen"
              >
                <Maximize2 className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Heatmap Container */}
        <div className="relative" ref={containerRef}>
          <canvas
            ref={canvasRef}
            width={className.includes('h-full') ? 1200 * zoomLevel : 800 * zoomLevel}
            height={className.includes('h-full') ? 800 * zoomLevel : 600 * zoomLevel}
            className="w-full h-auto cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredDimension(null)}
            style={{ 
              imageRendering: 'pixelated',
              maxHeight: className.includes('h-full') ? '800px' : '600px',
              objectFit: 'contain'
            }}
          />
          
          {/* Dimension Tooltip */}
          {hoveredDimension !== null && (
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-80 text-white p-2 rounded text-xs pointer-events-none">
              <div><strong>Dimension:</strong> {hoveredDimension + 1}</div>
              <div><strong>Value:</strong> {vector[hoveredDimension].toFixed(6)}</div>
              <div><strong>Type:</strong> {
                vector[hoveredDimension] > 0 ? 'Positive (Blue)' : 
                vector[hoveredDimension] < 0 ? 'Negative (Red)' : 
                'Zero (Gray)'
              }</div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-300">Color Legend</span>
            <button
              onClick={() => setShowFullscreen(true)}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <Info className="w-3 h-3" />
              View Details
            </button>
          </div>
          
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-400 rounded"></div>
              <span className="text-gray-400">Positive</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-500 rounded"></div>
              <span className="text-gray-400">Zero</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-400 rounded"></div>
              <span className="text-gray-400">Negative</span>
            </div>
            <div className="ml-auto text-xs text-gray-500">
              Intensity = |value|
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Modal */}
      {showFullscreen && (
        <VectorHeatmapModal
          vector={vector}
          title={title}
          stats={stats}
          onClose={() => setShowFullscreen(false)}
        />
      )}
    </>
  );
};

// Fullscreen Vector Heatmap Modal
const VectorHeatmapModal = ({ vector, title, stats, onClose }) => {
  const [activeTab, setActiveTab] = useState('heatmap');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-[95vw] h-[90vh] overflow-hidden border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold">{title}</h2>
            <p className="text-gray-400">Detailed vector analysis and visualization</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('heatmap')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'heatmap'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Heatmap
          </button>
          <button
            onClick={() => setActiveTab('statistics')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'statistics'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Statistics
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'raw'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Raw Data
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto h-[calc(90vh-200px)]">
          {activeTab === 'heatmap' && (
            <VectorHeatmap 
              vector={vector} 
              title={title} 
              className="max-w-none h-full"
            />
          )}
          
          {activeTab === 'statistics' && (
            <VectorStatistics stats={stats} vector={vector} />
          )}
          
          {activeTab === 'raw' && (
            <VectorRawData vector={vector} />
          )}
        </div>
      </div>
    </div>
  );
};

// Vector Statistics Component
const VectorStatistics = ({ stats, vector }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard title="Dimensions" value={stats.dimensions} />
      <StatCard title="Non-Zero" value={stats.nonZero} />
      <StatCard title="Magnitude" value={stats.magnitude.toFixed(4)} />
      <StatCard title="Mean" value={stats.mean.toFixed(6)} />
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="card">
        <h4 className="font-bold mb-3">Value Distribution</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Positive values:</span>
            <span className="text-blue-400">{stats.positive}</span>
          </div>
          <div className="flex justify-between">
            <span>Negative values:</span>
            <span className="text-red-400">{stats.negative}</span>
          </div>
          <div className="flex justify-between">
            <span>Zero values:</span>
            <span className="text-gray-400">{stats.zeros}</span>
          </div>
        </div>
      </div>
      
      <div className="card">
        <h4 className="font-bold mb-3">Range</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Minimum:</span>
            <span className="font-mono">{stats.min.toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span>Maximum:</span>
            <span className="font-mono">{stats.max.toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span>Range:</span>
            <span className="font-mono">{(stats.max - stats.min).toFixed(6)}</span>
          </div>
        </div>
      </div>
      
      <div className="card">
        <h4 className="font-bold mb-3">Sparsity</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Density:</span>
            <span>{((stats.nonZero / stats.dimensions) * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span>Sparsity:</span>
            <span>{((stats.zeros / stats.dimensions) * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Vector Raw Data Component
const VectorRawData = ({ vector }) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h4 className="font-bold">Raw Vector Values</h4>
      <button
        onClick={() => {
          navigator.clipboard.writeText(JSON.stringify(vector, null, 2));
          alert('Vector copied to clipboard!');
        }}
        className="btn-secondary text-sm"
      >
        Copy to Clipboard
      </button>
    </div>
    
    <div className="bg-gray-800 rounded-lg p-4 max-h-96 overflow-y-auto">
      <pre className="text-xs font-mono text-gray-300">
        {vector.map((value, index) => (
          <div key={index} className="flex justify-between py-1 border-b border-gray-700 border-opacity-30">
            <span className="text-gray-500">[{index.toString().padStart(4, '0')}]</span>
            <span className={`${
              value > 0 ? 'text-blue-400' : value < 0 ? 'text-red-400' : 'text-gray-500'
            }`}>
              {value.toFixed(8)}
            </span>
          </div>
        ))}
      </pre>
    </div>
  </div>
);

// Stat Card Component
const StatCard = ({ title, value }) => (
  <div className="card text-center">
    <div className="text-2xl font-bold text-white">{value}</div>
    <div className="text-sm text-gray-400">{title}</div>
  </div>
);

export default VectorHeatmap;