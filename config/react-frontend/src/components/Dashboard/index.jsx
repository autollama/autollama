import React, { useState, useEffect, lazy, Suspense } from 'react';
import { LayoutGrid, Activity, BarChart3, Upload } from 'lucide-react';
import DocumentGrid from './DocumentGrid';
import { useAppContext } from '../../App';


// Lazy load heavy components
const ProcessingQueue = lazy(() => import('./ProcessingQueue'));
const StatsPanel = lazy(() => import('./StatsPanel'));

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('documents');
  const [processingQueue, setProcessingQueue] = useState([]);
  const { documents, systemStats, sse, uploadQueue, api, loadSystemStats, refreshDocuments } = useAppContext();

  // Load processing queue data
  useEffect(() => {
    const loadProcessingQueue = async () => {
      try {
        const inProgress = await api.data.getInProgress();
        setProcessingQueue(inProgress || []);
      } catch (error) {
        console.error('Failed to load processing queue:', error);
        setProcessingQueue([]);
      }
    };

    loadProcessingQueue();
    // Use faster polling during active processing
    const hasActiveProcessing = uploadQueue.length > 0 || 
      (systemStats.processing?.totalProcessing > 0);
    const pollInterval = hasActiveProcessing ? 3000 : 8000; // 3s when active, 8s when idle
    
    const interval = setInterval(async () => {
      await loadProcessingQueue();
      // During active processing, also refresh system stats to update document counts
      if (hasActiveProcessing) {
        await loadSystemStats();
      }
    }, pollInterval);
    return () => clearInterval(interval);
  }, [api, uploadQueue.length, systemStats.processing?.totalProcessing, loadSystemStats]);

  // Listen for SSE events to force immediate refresh during processing
  useEffect(() => {
    if (!sse?.lastMessage) return;
    
    const messageData = sse.lastMessage;
    const eventType = messageData.type || messageData.step; // Handle both type and step fields
    
    // Force immediate refresh for processing completion events
    if (eventType === 'processing_complete' ||
        eventType === 'file_processing_complete' ||
        eventType === 'session_complete' ||
        eventType === 'document_created' ||
        eventType === 'content_processed') {
      console.log('🔄 Dashboard: Immediate refresh triggered by SSE event:', eventType);
      // Force immediate stats refresh
      loadSystemStats();
      // Small delay to ensure processing is fully complete
      setTimeout(() => {
        loadSystemStats();
      }, 1000);
    }
  }, [sse?.lastMessage, loadSystemStats]);

  // Get summary statistics
  const getSummaryStats = () => {
    const totalDocs = systemStats.knowledgeBase?.total_documents || 0;
    const processingDocs = documents.filter(doc => doc.processingStatus === 'processing').length;
    const completedDocs = documents.filter(doc => doc.processingStatus === 'completed').length;
    // Use system stats for total chunks instead of summing corrupted document data
    const totalChunks = systemStats.knowledgeBase?.total_chunks || 0;
    
    // Upload queue statistics
    const uploadStats = {
      total: uploadQueue.length,
      pending: uploadQueue.filter(f => f.status === 'pending').length,
      processing: uploadQueue.filter(f => f.status === 'processing' || f.status === 'uploading').length,
      completed: uploadQueue.filter(f => f.status === 'completed').length,
      failed: uploadQueue.filter(f => f.status === 'error').length,
    };

    // Processing queue statistics (from API)
    const apiProcessingCount = processingQueue.filter(item => 
      item.status === 'processing'
    ).length;
    
    // Total processing count with smart deduplication to avoid double-counting
    // Count upload queue items that don't have corresponding API sessions
    const uploadProcessingWithoutApi = uploadStats.processing > 0 && apiProcessingCount === 0 ? uploadStats.processing : 0;
    const totalProcessingCount = Math.max(apiProcessingCount, uploadProcessingWithoutApi);
    
    return {
      totalDocs,
      processingDocs,
      completedDocs,
      totalChunks,
      contextualDocs: systemStats.knowledgeBase?.contextual_count || 0,
      uploadQueue: uploadStats,
      totalProcessingCount,
      apiProcessingCount,
    };
  };

  const stats = getSummaryStats();

  // Tab configuration
  const tabs = [
    {
      id: 'documents',
      label: 'Documents',
      icon: LayoutGrid,
      badge: stats.totalDocs,
      component: DocumentGrid,
    },
    {
      id: 'processing',
      label: 'Processing',
      icon: Activity,
      badge: stats.totalProcessingCount > 0 ? stats.totalProcessingCount : null,
      component: ProcessingQueue,
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: BarChart3,
      badge: null,
      component: StatsPanel,
    },
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || DocumentGrid;

  return (
    <div className="space-y-6">
      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <QuickStat
          label="Total Documents"
          value={stats.totalDocs}
          icon="📚"
          trend={stats.totalDocs > 0 ? '+' : ''}
        />
        <QuickStat
          label="Processing Queue"
          value={stats.totalProcessingCount}
          icon="⚡"
          trend={stats.totalProcessingCount > 0 ? 'active' : 'empty'}
          pulsing={stats.totalProcessingCount > 0}
        />
        <QuickStat
          label="Total Chunks"
          value={stats.totalChunks}
          icon="✂️"
          trend={stats.totalChunks > 0 ? 'ready' : ''}
        />
        <QuickStat
          label="Contextual AI"
          value={stats.contextualDocs}
          icon="🧠"
          trend={stats.contextualDocs > 0 ? 'enhanced' : ''}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center bg-gray-800 bg-opacity-50 rounded-lg p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
                  ${isActive 
                    ? 'bg-primary-600 text-white shadow-lg' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge !== null && tab.badge > 0 && (
                  <span className={`
                    px-2 py-1 text-xs rounded-full font-bold
                    ${isActive 
                      ? 'bg-primary-800 text-primary-200' 
                      : 'bg-gray-600 text-gray-200'
                    }
                  `}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* System Status */}
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-gray-400">
              System Online
            </span>
          </div>
          
          {systemStats.lastUpdated && (
            <div className="text-gray-500">
              Updated {systemStats.lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-[500px]">
        <Suspense fallback={
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3">
              <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full"></div>
              <span className="text-gray-400">Loading...</span>
            </div>
          </div>
        }>
          <ActiveComponent />
        </Suspense>
      </div>

      {/* Quick Actions Float */}
      <QuickActionButton setActiveTab={setActiveTab} />
    </div>
  );
};

// Quick Stats Component
const QuickStat = ({ label, value, icon, trend, pulsing }) => (
  <div className={`card p-4 transition-all duration-300 ${pulsing ? 'animate-pulse-slow ring-2 ring-primary-500 ring-opacity-50' : ''}`}>
    <div className="flex items-center justify-between">
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-sm text-gray-400">{label}</div>
        {trend && (
          <div className="text-xs text-primary-400 mt-1">{trend}</div>
        )}
      </div>
      <div className={`text-2xl transition-opacity duration-300 ${pulsing ? 'opacity-80' : 'opacity-50'}`}>{icon}</div>
    </div>
  </div>
);

// Quick Action Button Component
const QuickActionButton = ({ setActiveTab }) => {
  const [showActions, setShowActions] = useState(false);
  const { setCurrentView } = useAppContext();

  const handleUploadFiles = () => {
    setCurrentView('processing');
    setShowActions(false);
  };

  const handleProcessUrl = () => {
    setCurrentView('processing'); 
    setShowActions(false);
  };

  const handleViewAnalytics = () => {
    // Stay on dashboard but switch to analytics tab
    setActiveTab('analytics');
    setShowActions(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-40">
      {/* Action Menu */}
      {showActions && (
        <div className="absolute bottom-16 right-0 bg-gray-800 rounded-lg shadow-2xl border border-gray-700 p-2 space-y-2 min-w-[200px]">
          <button 
            onClick={handleUploadFiles}
            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4 text-primary-400" />
            <span>Upload Files</span>
          </button>
          <button 
            onClick={handleProcessUrl}
            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-700 rounded-lg transition-colors"
          >
            <LayoutGrid className="w-4 h-4 text-primary-400" />
            <span>Process URL</span>
          </button>
          <button 
            onClick={handleViewAnalytics}
            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-700 rounded-lg transition-colors"
          >
            <BarChart3 className="w-4 h-4 text-primary-400" />
            <span>View Analytics</span>
          </button>
        </div>
      )}

      {/* Main Action Button */}
      <button
        onClick={() => setShowActions(!showActions)}
        className={`
          w-14 h-14 bg-primary-600 hover:bg-primary-500 rounded-full shadow-lg 
          flex items-center justify-center transition-all duration-300 group
          ${showActions ? 'rotate-45' : 'hover:scale-110'}
        `}
      >
        <div className="text-2xl group-hover:scale-110 transition-transform">
          {showActions ? '✕' : '🦙'}
        </div>
      </button>
    </div>
  );
};

export default Dashboard;