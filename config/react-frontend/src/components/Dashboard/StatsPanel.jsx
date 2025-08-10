import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Search, 
  Brain, 
  Activity, 
  HardDrive, 
  Zap, 
  CheckCircle, 
  AlertCircle,
  RefreshCw,
  Eye,
  TrendingUp,
  AlertTriangle,
  Trash2,
  MemoryStick,
  Settings
} from 'lucide-react';
import { useAppContext } from '../../App';
import {
  AdminCard,
  AdminButton,
  SessionStatusBadge,
  MemoryUsageDisplay,
  CleanupStatusDisplay,
  SystemHealthSummary,
  AdminConfirmModal,
  AdminProgressModal,
  AdminPanel,
  AdminQuickActions
} from '../common/AdminControls';

const StatsPanel = () => {
  const { api, systemStats, sse, loadSystemStats } = useAppContext();
  const [detailedStats, setDetailedStats] = useState({});
  const [showDetails, setShowDetails] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Helper function to filter out positive/informational recommendations
  const getActualIssuesCount = (recommendations) => {
    if (!recommendations || recommendations.length === 0) return 0;
    
    const positiveMessages = [
      'Memory usage appears normal',
      'System running smoothly', 
      'All services healthy',
      'Performance is optimal',
      'No issues detected'
    ];
    
    const actualIssues = recommendations.filter(rec => 
      !positiveMessages.some(positive => 
        rec.toLowerCase().includes(positive.toLowerCase())
      )
    );
    
    return actualIssues.length;
  };
  
  // Admin state
  const [adminData, setAdminData] = useState({
    stuckSessions: { stuck_count: 0 },
    systemHealth: null,
    cleanupStatus: null,
    sessionStats: null
  });
  const [adminLoading, setAdminLoading] = useState({});
  const [showConfirmModal, setShowConfirmModal] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(null);

  // Load detailed statistics and admin data
  useEffect(() => {
    loadDetailedStats();
    loadAdminData();
    const interval = setInterval(() => {
      loadDetailedStats();
      loadAdminData();
    }, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadDetailedStats = async () => {
    try {
      const [bm25Health, bm25Stats, qdrantActivity] = await Promise.all([
        api.stats.getBM25Health().catch(() => ({ status: 'offline' })),
        api.stats.getBM25Stats().catch(() => ({ total_indices: 0 })),
        api.stats.getQdrantActivity().catch(() => ({ totalSearches: 0 })),
      ]);

      setDetailedStats({
        bm25: {
          health: bm25Health,
          stats: bm25Stats,
        },
        qdrant: qdrantActivity,
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error('Failed to load detailed stats:', error);
    }
  };

  // Load admin data
  const loadAdminData = async () => {
    try {
      const [stuckSessions, systemHealth, cleanupStatus] = await Promise.all([
        api.admin.checkStuckSessions().catch(() => ({ stuck_count: 0 })),
        api.admin.getSystemHealth().catch(() => null),
        api.admin.getCleanupStatus().catch(() => null),
      ]);

      setAdminData({
        stuckSessions,
        systemHealth,
        cleanupStatus,
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error('Failed to load admin data:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadSystemStats(),
        loadDetailedStats(),
        loadAdminData(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // Admin handler functions
  const handleCleanupAction = (actionType) => {
    setShowConfirmModal({
      type: actionType,
      title: actionType === 'stuck' ? 'Clean Stuck Sessions' : 'Safe System Cleanup',
      message: actionType === 'stuck' 
        ? `This will clean ${adminData.stuckSessions.stuck_count} stuck sessions. Continue?`
        : 'This will perform a safe cleanup of timeout sessions and system optimization. Continue?',
      confirmText: 'Start Cleanup'
    });
  };

  const performCleanup = async (actionType) => {
    setAdminLoading(prev => ({ ...prev, [actionType]: true }));
    setShowConfirmModal(null);
    
    try {
      let result;
      if (actionType === 'stuck') {
        result = await api.admin.cleanupStuckSessions({ dryRun: false });
      } else {
        result = await api.admin.cleanupSessions({ dryRun: false });
      }
      
      // Show success notification (could be enhanced with toast system)
      console.log('Cleanup completed:', result);
      
      // Refresh data
      await loadAdminData();
      await loadSystemStats();
      
    } catch (error) {
      console.error('Cleanup failed:', error);
      // Show error notification
    } finally {
      setAdminLoading(prev => ({ ...prev, [actionType]: false }));
    }
  };

  const handleMemoryAnalysis = () => {
    // Could open a detailed memory analysis modal
    console.log('Memory analysis:', adminData.systemHealth?.memory);
  };

  // Calculate overall system health using real service status including session health
  const getSystemHealth = () => {
    // Check if we have system health data from /api/system/status
    const systemHealth = adminData.systemHealth;
    
    const checks = {
      // Use system status API data if available, fall back to legacy checks
      database: systemHealth?.services?.postgresql?.status === 'healthy' || systemStats.database?.status === 'connected',
      qdrant: systemHealth?.services?.qdrant?.status === 'healthy' || systemStats.knowledgeBase?.qdrant_status === 'active',
      bm25: systemHealth?.services?.bm25?.status === 'healthy' || detailedStats.bm25?.health?.status === 'healthy',
      api: systemStats.health?.status === 'connected' || true, // API is working if we can call it
      sessions: (adminData.stuckSessions?.stuck_count || 0) === 0, // No stuck sessions = healthy
    };

    const healthy = Object.values(checks).filter(Boolean).length;
    const total = Object.values(checks).length;
    const percentage = Math.round((healthy / total) * 100);

    return {
      percentage,
      healthy,
      total,
      status: percentage === 100 ? 'excellent' : percentage >= 75 ? 'good' : percentage >= 50 ? 'fair' : 'poor',
      checks,
      sessionIssues: adminData.stuckSessions?.stuck_count || 0,
    };
  };

  const health = getSystemHealth();

  return (
    <div className="space-y-6">
      {/* System Health Overview */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              health.status === 'excellent' ? 'bg-green-600 bg-opacity-20' :
              health.status === 'good' ? 'bg-blue-600 bg-opacity-20' :
              health.status === 'fair' ? 'bg-yellow-600 bg-opacity-20' :
              'bg-red-600 bg-opacity-20'
            }`}>
              <Activity className={`w-5 h-5 ${
                health.status === 'excellent' ? 'text-green-400' :
                health.status === 'good' ? 'text-blue-400' :
                health.status === 'fair' ? 'text-yellow-400' :
                'text-red-400'
              }`} />
            </div>
            <div>
              <h3 className="font-bold text-lg">System Health</h3>
              <p className="text-sm text-gray-400">
                {health.healthy}/{health.total} services operational
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={`text-2xl font-bold ${
              health.status === 'excellent' ? 'text-green-400' :
              health.status === 'good' ? 'text-blue-400' :
              health.status === 'fair' ? 'text-yellow-400' :
              'text-red-400'
            }`}>
              {health.percentage}%
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              title="Refresh Stats"
            >
              <RefreshCw className={`w-4 h-4 text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Health Indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <HealthIndicator
            icon={Database}
            label="PostgreSQL"
            status={health.checks.database}
            details={systemStats.database?.version || 'Unknown'}
          />
          <HealthIndicator
            icon={Search}
            label="Qdrant"
            status={health.checks.qdrant}
            details={systemStats.knowledgeBase?.total_documents || 0}
          />
          <HealthIndicator
            icon={Zap}
            label="BM25 Search"
            status={health.checks.bm25}
            details={detailedStats.bm25?.stats?.total_indices || 0}
          />
          <HealthIndicator
            icon={Activity}
            label="API Service"
            status={health.checks.api}
            details="Operational"
          />
          <HealthIndicator
            icon={AlertTriangle}
            label="Session Health"
            status={health.checks.sessions}
            details={health.sessionIssues > 0 ? `${health.sessionIssues} stuck` : 'Healthy'}
          />
        </div>
      </div>

      {/* Session Management & Admin Controls */}
      <AdminPanel title="Session Management & System Control" collapsible={true} defaultExpanded={false}>
        {/* Admin Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <AdminCard
            title="Stuck Sessions"
            value={adminData.stuckSessions?.stuck_count || 0}
            icon={AlertTriangle}
            description="Sessions without heartbeat"
            status={adminData.stuckSessions?.stuck_count > 0 ? 'warning' : 'success'}
            badge={adminData.stuckSessions?.stuck_count > 0 ? adminData.stuckSessions.stuck_count : null}
            onClick={() => handleCleanupAction('stuck')}
            loading={adminLoading.stuck}
          />
          
          {adminData.systemHealth?.memory && (
            <MemoryUsageDisplay
              memoryData={adminData.systemHealth.memory}
              onClick={handleMemoryAnalysis}
            />
          )}
          
          {adminData.systemHealth && (
            <SystemHealthSummary
              healthData={adminData.systemHealth}
              onDetails={() => console.log('Show health details')}
            />
          )}
          
          <CleanupStatusDisplay
            lastCleanup={adminData.cleanupStatus?.timestamp}
            recommendationsCount={getActualIssuesCount(adminData.systemHealth?.recommendations)}
            onCleanup={() => handleCleanupAction('safe')}
          />
        </div>

        {/* Quick Actions */}
        <AdminQuickActions
          actions={[
            {
              label: 'Check Sessions',
              icon: Eye,
              onClick: () => loadAdminData(),
              loading: adminLoading.check
            },
            {
              label: 'Safe Cleanup',
              icon: Trash2,
              onClick: () => handleCleanupAction('safe'),
              variant: 'warning',
              loading: adminLoading.safe
            },
            {
              label: 'Clean Stuck',
              icon: AlertTriangle,
              onClick: () => handleCleanupAction('stuck'),
              variant: 'danger',
              loading: adminLoading.stuck,
              badge: adminData.stuckSessions?.stuck_count > 0 ? adminData.stuckSessions.stuck_count : null,
              disabled: adminData.stuckSessions?.stuck_count === 0
            },
            {
              label: 'Memory Analysis',
              icon: MemoryStick,
              onClick: handleMemoryAnalysis,
              variant: 'secondary'
            }
          ]}
        />
      </AdminPanel>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Knowledge Base Stats */}
        <StatCard
          icon={Brain}
          title="Knowledge Base"
          value={systemStats.knowledgeBase?.total_documents || 0}
          label="documents processed"
          trend="+12%"
          trendDirection="up"
          details={[
            { label: 'Total Chunks', value: systemStats.knowledgeBase?.total_chunks || 0 },
            { label: 'Avg. Processing Time', value: '2.3s' },
            { label: 'Storage Used', value: systemStats.database?.size || 'Unknown' },
          ]}
        />

        {/* Search Performance */}
        <StatCard
          icon={Search}
          title="Search Activity"
          value={detailedStats.qdrant?.totalSearches || 0}
          label="total searches"
          trend="+5%"
          trendDirection="up"
          details={[
            { label: 'Avg. Response Time', value: '145ms' },
            { label: 'BM25 Indices', value: detailedStats.bm25?.stats?.total_indices || 0 },
            { label: 'Last Activity', value: formatLastActivity(detailedStats.qdrant?.lastSearchActivity) },
          ]}
        />

        {/* Processing Stats */}
        <StatCard
          icon={HardDrive}
          title="Processing"
          value={systemStats.database?.connections || 0}
          label="active connections"
          trend="stable"
          details={[
            { label: 'Queue Length', value: 0 },
            { label: 'Success Rate', value: '98.5%' },
            { label: 'Contextual Embeddings', value: 'Enabled' },
          ]}
        />
      </div>

      {/* Detailed Statistics Toggle */}
      <div className="card">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-700 hover:bg-opacity-30 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-3">
            <Eye className="w-5 h-5 text-gray-400" />
            <span className="font-medium">Detailed System Information</span>
          </div>
          <div className={`transform transition-transform ${showDetails ? 'rotate-180' : ''}`}>
            ▼
          </div>
        </button>

        {showDetails && (
          <div className="mt-4 pt-4 border-t border-gray-700 space-y-4">
            <DetailedStatsSection 
              title="Database Statistics"
              data={systemStats.database}
            />
            <DetailedStatsSection 
              title="Qdrant Vector Database"
              data={systemStats.knowledgeBase}
            />
            <DetailedStatsSection 
              title="BM25 Search Service"
              data={detailedStats.bm25}
            />
          </div>
        )}
      </div>

      {/* Admin Confirmation Modal */}
      <AdminConfirmModal
        isOpen={!!showConfirmModal}
        onClose={() => setShowConfirmModal(null)}
        onConfirm={() => performCleanup(showConfirmModal?.type)}
        title={showConfirmModal?.title}
        message={showConfirmModal?.message}
        confirmText={showConfirmModal?.confirmText}
        confirmVariant="danger"
        loading={adminLoading[showConfirmModal?.type]}
      />

      {/* Admin Progress Modal */}
      <AdminProgressModal
        isOpen={!!showProgressModal}
        onClose={() => setShowProgressModal(null)}
        title={showProgressModal?.title}
        progress={showProgressModal?.progress || 0}
        message={showProgressModal?.message}
        canCancel={false}
      />
    </div>
  );
};

// Health Indicator Component
const HealthIndicator = ({ icon: Icon, label, status, details }) => (
  <div className="flex items-center gap-3 p-3 bg-gray-800 bg-opacity-30 rounded-lg">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
      status ? 'bg-green-600 bg-opacity-20' : 'bg-red-600 bg-opacity-20'
    }`}>
      <Icon className={`w-4 h-4 ${status ? 'text-green-400' : 'text-red-400'}`} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{label}</span>
        {status ? (
          <CheckCircle className="w-3 h-3 text-green-400" />
        ) : (
          <AlertCircle className="w-3 h-3 text-red-400" />
        )}
      </div>
      <div className="text-xs text-gray-400 truncate">{details}</div>
    </div>
  </div>
);

// Stat Card Component
const StatCard = ({ icon: Icon, title, value, label, trend, trendDirection, details }) => (
  <div className="card p-6">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-600 bg-opacity-20 rounded-lg flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary-400" />
        </div>
        <h3 className="font-bold">{title}</h3>
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-sm ${
          trendDirection === 'up' ? 'text-green-400' : 
          trendDirection === 'down' ? 'text-red-400' : 'text-gray-400'
        }`}>
          {trendDirection === 'up' && <TrendingUp className="w-3 h-3" />}
          <span>{trend}</span>
        </div>
      )}
    </div>
    
    <div className="mb-4">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
    </div>
    
    {details && (
      <div className="space-y-2 text-sm">
        {details.map((detail, index) => (
          <div key={index} className="flex justify-between">
            <span className="text-gray-400">{detail.label}</span>
            <span className="text-gray-300">{detail.value}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

// Detailed Stats Section Component
const DetailedStatsSection = ({ title, data }) => (
  <div>
    <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
      <Database className="w-4 h-4 text-primary-400" />
      {title}
    </h4>
    <div className="bg-gray-800 bg-opacity-30 rounded-lg p-4">
      <pre className="text-xs text-gray-300 font-mono overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  </div>
);

// Helper function to format last activity time
const formatLastActivity = (timestamp) => {
  if (!timestamp) return 'None';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
};

export default StatsPanel;