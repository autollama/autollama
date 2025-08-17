import React, { useState, useEffect } from 'react';
import { Upload, Globe, Settings, Activity, FileText, Clock, TrendingUp, X, Square } from 'lucide-react';
import { useAppContext } from '../../App';
import FileUploader from './FileUploader';
import URLProcessor from './URLProcessor';

const ProcessingManager = () => {
  const { api, documents, systemStats, refreshDocuments } = useAppContext();
  const [activeTab, setActiveTab] = useState('files'); // 'files', 'urls', 'queue'
  const [processingQueue, setProcessingQueue] = useState([]);
  const [processingStats, setProcessingStats] = useState({
    totalProcessed: 0,
    successfulProcessing: 0,
    failedProcessing: 0,
    averageTime: 0,
  });

  // Load processing queue and stats
  useEffect(() => {
    loadProcessingData();
    const interval = setInterval(loadProcessingData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadProcessingData = async () => {
    try {
      const [queueData, statsData] = await Promise.all([
        api.processing.getQueue(),
        api.processing.getStats(),
      ]);
      
      setProcessingQueue(queueData || []);
      setProcessingStats(prev => ({ ...prev, ...statsData }));
    } catch (error) {
      console.error('Failed to load processing data:', error);
    }
  };

  // Handle successful processing
  const handleProcessingSuccess = async (item, response) => {
    console.log('Processing started successfully:', item, response);
    
    // Refresh documents to show new content
    setTimeout(() => {
      refreshDocuments();
    }, 1000);

    // Update stats
    setProcessingStats(prev => ({
      ...prev,
      totalProcessed: prev.totalProcessed + 1,
    }));
  };

  // Handle processing error
  const handleProcessingError = (item, error) => {
    console.error('Processing failed:', item, error);
    
    // Update stats
    setProcessingStats(prev => ({
      ...prev,
      totalProcessed: prev.totalProcessed + 1,
      failedProcessing: prev.failedProcessing + 1,
    }));
  };

  const tabs = [
    {
      id: 'files',
      label: 'File Upload',
      icon: Upload,
      description: 'Upload and process documents',
      component: FileUploader,
    },
    {
      id: 'urls',
      label: 'URL Processing',
      icon: Globe,
      description: 'Process content from URLs',
      component: URLProcessor,
    },
    {
      id: 'queue',
      label: 'Processing Queue',
      icon: Activity,
      description: 'Monitor processing status',
      component: ProcessingQueue,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Processing Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Documents"
          value={systemStats.knowledgeBase?.total_documents || 0}
          icon={FileText}
          color="text-blue-400"
          change="+12 today"
        />
        <StatCard
          title="Processing Queue"
          value={processingQueue.length}
          icon={Activity}
          color="text-yellow-400"
          change={processingQueue.length > 0 ? `${processingQueue.filter(item => item.status === 'processing').length} active` : 'Empty'}
        />
        <StatCard
          title="Success Rate"
          value={`${processingStats.totalProcessed > 0 
            ? Math.round(((processingStats.totalProcessed - processingStats.failedProcessing) / processingStats.totalProcessed) * 100)
            : 100}%`}
          icon={TrendingUp}
          color="text-green-400"
          change={`${processingStats.failedProcessing} failed`}
        />
        <StatCard
          title="Avg Processing Time"
          value={`${processingStats.averageTime || 45}s`}
          icon={Clock}
          color="text-purple-400"
          change="Per document"
        />
      </div>

      {/* Processing Tabs */}
      <div className="card">
        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mb-6 bg-gray-800 bg-opacity-50 rounded-lg p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-md text-sm font-medium transition-all duration-200 flex-1 ${ 
                  isActive
                    ? 'bg-primary-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <div className="text-left">
                  <div>{tab.label}</div>
                  <div className="text-xs opacity-75">{tab.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="min-h-[500px]">
          {activeTab === 'files' && (
            <FileUploader 
              onSuccess={handleProcessingSuccess}
              onError={handleProcessingError}
            />
          )}
          
          {activeTab === 'urls' && (
            <URLProcessor 
              onSuccess={handleProcessingSuccess}
              onError={handleProcessingError}
            />
          )}
          
          {activeTab === 'queue' && (
            <ProcessingQueue 
              queue={processingQueue}
              onRefresh={loadProcessingData}
            />
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <RecentActivity documents={documents?.slice(0, 5) || []} />
    </div>
  );
};

// Processing Queue Component
const ProcessingQueue = ({ queue, onRefresh }) => {
  const { api } = useAppContext();

  // Stop processing function
  const stopProcessing = async (sessionId, itemTitle) => {
    try {
      console.log(`🛑 Attempting to stop processing session: ${sessionId}`);
      await api.processing.stopProcessing(sessionId);
      console.log(`✅ Successfully stopped processing for: ${itemTitle}`);
      
      // Refresh the queue to show updated status
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error(`❌ Failed to stop processing session ${sessionId}:`, error.response?.data || error.message);
      // Show user-friendly error message - could be implemented with toast notification
      alert('Failed to stop processing session. Please try again.');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'queued': return 'text-gray-400';
      case 'processing': return 'text-yellow-400';
      case 'completed': return 'text-green-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'queued': return Clock;
      case 'processing': return Activity;
      case 'completed': return FileText;
      case 'error': return Activity;
      default: return Clock;
    }
  };

  if (queue.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold mb-2">No Active Processing</h3>
        <p className="text-gray-400 mb-6">
          Upload files or process URLs to see them appear in the queue.
        </p>
        <button onClick={onRefresh} className="btn-primary">
          <Activity className="w-4 h-4" />
          Refresh Queue
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">Active Processing Queue</h3>
        <button onClick={onRefresh} className="btn-secondary text-sm">
          <Activity className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
        {queue.map((item, index) => {
          const StatusIcon = getStatusIcon(item.status);
          const statusColor = getStatusColor(item.status);
          
          
          return (
            <div key={item.id || index} className="flex items-center gap-4 p-4 bg-gray-800 bg-opacity-50 rounded-lg border border-gray-700">
              <div className="w-10 h-10 bg-primary-600 bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
                <StatusIcon className={`w-5 h-5 ${statusColor} ${item.status === 'processing' ? 'animate-spin' : ''}`} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-white truncate">
                    {item.title || item.url || item.filename || 'Unknown Item'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {item.completedChunks || 0} / {item.totalChunks || 0} chunks
                  </span>
                </div>
                
                {item.status === 'processing' && item.progress && (
                  <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                    <div 
                      className="h-2 bg-yellow-500 rounded-full transition-all duration-300"
                      style={{ width: `${item.progress || 0}%` }}
                    />
                  </div>
                )}
                
                <div className="flex items-center gap-2 text-sm">
                  <span className={statusColor}>
                    {item.status === 'processing' ? 'Processing...' : 
                     item.status === 'completed' ? 'Completed' :
                     item.status === 'error' ? 'Failed' : 'Queued'}
                  </span>
                  {item.progress && (
                    <span className="text-gray-400">({Math.round(item.progress)}%)</span>
                  )}
                  {item.estimatedTime && (
                    <span className="text-gray-500">• ~{item.estimatedTime}s remaining</span>
                  )}
                </div>
                
                {item.error && (
                  <div className="text-sm text-red-400 mt-1">
                    {item.error}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <div className="text-xs text-gray-500">
                  {item.startedAt || item.createdAt ? new Date(item.startedAt || item.createdAt).toLocaleTimeString() : 'Pending'}
                </div>
                
                {/* Stop button for processing items */}
                {(item.status === 'processing' || item.status === 'queued') && item.id && (
                  <button
                    onClick={() => stopProcessing(item.id, item.title || item.filename || 'Unknown Item')}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-sm font-medium flex items-center gap-1 min-w-fit"
                    title="Stop processing"
                  >
                    <Square className="w-4 h-4" />
                    Stop
                  </button>
                )}
                
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Recent Activity Component
const RecentActivity = ({ documents }) => {
  if (!documents || documents.length === 0) {
    return null;
  }

  return (
    <div className="card">
      <h3 className="font-bold mb-4 flex items-center gap-2">
        <Clock className="w-5 h-5 text-primary-400" />
        Recent Activity
      </h3>
      
      <div className="space-y-3">
        {documents.map((doc, index) => (
          <div key={doc.id || index} className="flex items-center gap-3 p-3 bg-gray-800 bg-opacity-30 rounded-lg">
            <div className="w-8 h-8 bg-primary-600 bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-primary-400" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white truncate">
                {doc.title || doc.url || 'Untitled Document'}
              </div>
              <div className="text-sm text-gray-400">
                {doc.chunkCount || 0} chunks • {doc.contentType || 'document'}
              </div>
            </div>
            
            <div className="text-xs text-gray-500">
              {doc.processedAt ? new Date(doc.processedAt).toLocaleDateString() : 'Recently'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ title, value, icon: Icon, color, change }) => (
  <div className="card text-center">
    <div className="flex items-center justify-center mb-2">
      <Icon className={`w-6 h-6 ${color}`} />
    </div>
    <div className={`text-2xl font-bold ${color} mb-1`}>{value}</div>
    <div className="text-sm text-gray-400 mb-1">{title}</div>
    {change && (
      <div className="text-xs text-gray-500">{change}</div>
    )}
  </div>
);

export default ProcessingManager;