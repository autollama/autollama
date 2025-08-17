import React, { useState, useRef } from 'react';
import { getCurrentBreakpoint, calculateGridPosition, GRID_CONFIG } from '../../utils/gridAnimations';
import { useGridAnimation } from '../../hooks/useGridAnimation';

/**
 * Animation Test Component
 * Tests FLIP animations across all responsive breakpoints
 */
const AnimationTest = () => {
  const [testDocuments, setTestDocuments] = useState([]);
  const [isRunningTest, setIsRunningTest] = useState(false);
  const containerRef = useRef(null);
  const { isAnimating, performanceStats } = useGridAnimation(testDocuments, containerRef);

  const generateTestDocument = (id) => ({
    id: `test-${id}`,
    title: `Test Document ${id}`,
    summary: `This is a test document for animation testing. Document ID: ${id}`,
    processingStatus: 'completed',
    contentType: 'test',
    created_time: new Date().toISOString(),
  });

  const runBreakpointTest = async () => {
    if (isRunningTest) return;
    
    setIsRunningTest(true);
    console.log('🧪 Starting responsive breakpoint animation test');
    
    // Start with empty grid
    setTestDocuments([]);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Test each scenario
    const scenarios = [
      { count: 3, name: '3 documents (mobile: 2x2, tablet: 3x1)' },
      { count: 6, name: '6 documents (mobile: 3x2, tablet: 2x3, desktop: 6x1)' },
      { count: 12, name: '12 documents (multiple rows)' },
      { count: 20, name: '20 documents (grid capacity test)' },
    ];
    
    for (const scenario of scenarios) {
      console.log(`🧪 Testing: ${scenario.name}`);
      
      // Add documents one by one to test insertion animation
      for (let i = 1; i <= scenario.count; i++) {
        const newDoc = generateTestDocument(Date.now() + i);
        setTestDocuments(prev => [newDoc, ...prev]);
        
        // Wait for animation to complete
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      // Wait before next scenario
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Clear grid for next test
      setTestDocuments([]);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('🧪 Animation test completed');
    setIsRunningTest(false);
  };

  const addSingleDocument = () => {
    const newDoc = generateTestDocument(Date.now());
    setTestDocuments(prev => [newDoc, ...prev]);
  };

  const clearDocuments = () => {
    setTestDocuments([]);
  };

  const currentBreakpoint = getCurrentBreakpoint();
  const gridInfo = {
    breakpoint: currentBreakpoint,
    columns: GRID_CONFIG.columns[currentBreakpoint],
    tileWidth: GRID_CONFIG.tileWidths[currentBreakpoint],
    gap: GRID_CONFIG.gap,
  };

  return (
    <div className="p-6 bg-gray-800 rounded-lg">
      <h2 className="text-2xl font-bold text-white mb-4">🧪 Animation Test Suite</h2>
      
      {/* Grid Information */}
      <div className="mb-6 p-4 bg-gray-700 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-2">Current Grid Configuration</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Breakpoint:</span>
            <span className="text-white ml-2 font-mono">{gridInfo.breakpoint}</span>
          </div>
          <div>
            <span className="text-gray-400">Columns:</span>
            <span className="text-white ml-2 font-mono">{gridInfo.columns}</span>
          </div>
          <div>
            <span className="text-gray-400">Tile Width:</span>
            <span className="text-white ml-2 font-mono">{gridInfo.tileWidth}px</span>
          </div>
          <div>
            <span className="text-gray-400">Gap:</span>
            <span className="text-white ml-2 font-mono">{gridInfo.gap}px</span>
          </div>
        </div>
      </div>

      {/* Performance Stats */}
      {performanceStats.animationCount > 0 && (
        <div className="mb-6 p-4 bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-2">Performance Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Animations:</span>
              <span className="text-white ml-2 font-mono">{performanceStats.animationCount}</span>
            </div>
            <div>
              <span className="text-gray-400">Avg Duration:</span>
              <span className="text-white ml-2 font-mono">{Math.round(performanceStats.averageDuration)}ms</span>
            </div>
            <div>
              <span className="text-gray-400">Frame Drops:</span>
              <span className="text-white ml-2 font-mono">{performanceStats.totalFrameDrops}</span>
            </div>
          </div>
        </div>
      )}

      {/* Test Controls */}
      <div className="mb-6 flex flex-wrap gap-4">
        <button
          onClick={runBreakpointTest}
          disabled={isRunningTest || isAnimating}
          className={`
            px-4 py-2 rounded-lg font-medium transition-all duration-200
            ${isRunningTest || isAnimating
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
            }
          `}
        >
          {isRunningTest ? '🔄 Running Test...' : '🧪 Run Full Test Suite'}
        </button>
        
        <button
          onClick={addSingleDocument}
          disabled={isAnimating}
          className={`
            px-4 py-2 rounded-lg font-medium transition-all duration-200
            ${isAnimating
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700 active:scale-95'
            }
          `}
        >
          ➕ Add Document
        </button>
        
        <button
          onClick={clearDocuments}
          disabled={isAnimating}
          className={`
            px-4 py-2 rounded-lg font-medium transition-all duration-200
            ${isAnimating
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700 active:scale-95'
            }
          `}
        >
          🗑️ Clear All
        </button>
      </div>

      {/* Animation Status */}
      {isAnimating && (
        <div className="mb-6 p-4 bg-blue-900 border border-blue-700 rounded-lg">
          <div className="flex items-center">
            <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full mr-3"></div>
            <span className="text-blue-200">Animation in progress...</span>
          </div>
        </div>
      )}

      {/* Test Grid */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white mb-2">
          Test Grid ({testDocuments.length} documents)
        </h3>
      </div>

      <div 
        ref={containerRef}
        className={`
          grid gap-4 w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6
          ${isAnimating ? 'pointer-events-none' : ''}
        `}
        style={{
          willChange: isAnimating ? 'contents' : 'auto',
        }}
      >
        {testDocuments.map((doc, index) => (
          <div
            key={doc.id}
            data-document-id={doc.id}
            className="document-tile relative overflow-hidden rounded-lg border-2 border-gray-600 bg-gray-700 cursor-pointer p-3 aspect-square"
            style={{
              transform: 'translateZ(0)', // Force GPU acceleration
              backfaceVisibility: 'hidden',
              willChange: 'transform',
            }}
          >
            <div className="relative h-full flex flex-col justify-between">
              {/* Header */}
              <div className="flex items-start justify-between gap-1 mb-2">
                <h3 className="font-semibold text-white truncate text-xs">
                  {doc.title}
                </h3>
                <span className="text-xs text-green-400">✓</span>
              </div>

              {/* Summary */}
              <div className="flex-1">
                <p className="text-xs text-gray-400 line-clamp-3">
                  {doc.summary}
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-600 border-opacity-30">
                <span className="text-xs text-gray-400">
                  Position: {index}
                </span>
                <span className="text-xs text-blue-400">
                  {currentBreakpoint}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div className="mt-6 p-4 bg-gray-700 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-2">Test Instructions</h3>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>• Run the full test suite to see animations across different document counts</li>
          <li>• Add single documents to test individual insertion animations</li>
          <li>• Resize your browser window to test responsive breakpoint changes</li>
          <li>• Watch the console for detailed animation logs</li>
          <li>• Check performance metrics to ensure 60fps target</li>
        </ul>
      </div>
    </div>
  );
};

export default AnimationTest;