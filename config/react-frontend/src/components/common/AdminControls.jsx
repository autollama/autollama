import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  MemoryStick,
  Database,
  Clock,
  Activity,
  Settings,
  Eye,
  Play,
  Pause,
  X
} from 'lucide-react';
import { useAppContext } from '../../App';

/**
 * Reusable Admin Control Components for Session Management
 * Matches existing AutoLlama design patterns and styling
 */

// Admin Card Component - matches existing system cards
export const AdminCard = ({ title, value, icon: Icon, description, status, badge, onClick, loading = false, className = "" }) => {
  const getStatusColor = () => {
    if (status === 'error') return 'border-red-500 text-red-400';
    if (status === 'warning') return 'border-yellow-500 text-yellow-400';
    if (status === 'success') return 'border-green-500 text-green-400';
    if (status === 'active') return 'border-blue-500 text-blue-400';
    return 'border-gray-500 text-gray-400';
  };

  const isClickable = !!onClick;

  return (
    <div 
      className={`
        p-4 rounded-lg border-2 transition-all duration-200 relative
        ${getStatusColor()}
        ${isClickable ? 'cursor-pointer hover:bg-gray-800 hover:bg-opacity-30' : ''}
        ${loading ? 'opacity-75' : ''}
        ${className}
      `}
      onClick={isClickable && !loading ? onClick : undefined}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 rounded-lg">
          <RefreshCw className="w-6 h-6 animate-spin text-primary-400" />
        </div>
      )}
      
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-5 h-5" />
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">{value}</span>
          {badge && (
            <span className="px-2 py-1 text-xs rounded-full bg-red-600 text-red-200 font-bold">
              {badge}
            </span>
          )}
        </div>
      </div>
      <div className="text-sm font-medium mb-1">{title}</div>
      <div className="text-xs opacity-80">{description}</div>
    </div>
  );
};

// Quick Action Button - matches existing button styling
export const AdminButton = ({ children, onClick, variant = 'secondary', size = 'md', loading = false, disabled = false, className = "" }) => {
  const baseClasses = "flex items-center gap-2 font-medium transition-all duration-200 rounded-lg";
  
  const variants = {
    primary: "bg-primary-600 hover:bg-primary-700 text-white",
    secondary: "bg-gray-700 hover:bg-gray-600 text-gray-200",
    danger: "bg-red-600 hover:bg-red-700 text-white",
    success: "bg-green-600 hover:bg-green-700 text-white",
    warning: "bg-yellow-600 hover:bg-yellow-700 text-white"
  };
  
  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        ${baseClasses}
        ${variants[variant]}
        ${sizes[size]}
        ${disabled || loading ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};

// Session Status Badge
export const SessionStatusBadge = ({ status, count }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'stuck':
        return { color: 'bg-red-600 text-red-200', icon: AlertTriangle };
      case 'processing':
        return { color: 'bg-blue-600 text-blue-200', icon: Activity };
      case 'failed':
        return { color: 'bg-red-600 text-red-200', icon: X };
      case 'completed':
        return { color: 'bg-green-600 text-green-200', icon: CheckCircle };
      default:
        return { color: 'bg-gray-600 text-gray-200', icon: Activity };
    }
  };

  const { color, icon: Icon } = getStatusConfig();

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      <span>{count}</span>
    </div>
  );
};

// Memory Usage Display
export const MemoryUsageDisplay = ({ memoryData, onClick }) => {
  if (!memoryData) return null;

  const heapUtilization = parseFloat(memoryData.heapUtilization) || 0;
  const getMemoryStatus = () => {
    if (heapUtilization > 90) return 'error';
    if (heapUtilization > 75) return 'warning';
    return 'success';
  };

  return (
    <AdminCard
      title="Memory Usage"
      value={memoryData.heapUtilization}
      icon={MemoryStick}
      description={`${Math.round(memoryData.heapUsed / 1024 / 1024)}MB used`}
      status={getMemoryStatus()}
      onClick={onClick}
    />
  );
};

// Cleanup Status Display
export const CleanupStatusDisplay = ({ lastCleanup, recommendationsCount, onCleanup }) => {
  const getTimeAgo = (timestamp) => {
    if (!timestamp) return 'Never';
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <AdminCard
      title="Last Cleanup"
      value={getTimeAgo(lastCleanup)}
      icon={Trash2}
      description={recommendationsCount > 0 ? `${recommendationsCount} issues found` : 'System clean'}
      status={recommendationsCount > 0 ? 'warning' : 'success'}
      badge={recommendationsCount > 0 ? recommendationsCount : null}
      onClick={onCleanup}
    />
  );
};

// System Health Summary
export const SystemHealthSummary = ({ healthData, onDetails }) => {
  if (!healthData) return null;

  const getHealthStatus = () => {
    if (healthData.healthScore >= 90) return 'success';
    if (healthData.healthScore >= 70) return 'warning';
    return 'error';
  };

  // Filter out positive/informational recommendations - only show alerts for actual issues
  const getActualIssuesCount = () => {
    if (!healthData.recommendations || healthData.recommendations.length === 0) return 0;
    
    const positiveMessages = [
      'Memory usage appears normal',
      'System running smoothly', 
      'All services healthy',
      'Performance is optimal',
      'No issues detected'
    ];
    
    const actualIssues = healthData.recommendations.filter(rec => 
      !positiveMessages.some(positive => 
        rec.toLowerCase().includes(positive.toLowerCase())
      )
    );
    
    return actualIssues.length;
  };

  const actualIssuesCount = getActualIssuesCount();

  return (
    <AdminCard
      title="System Health"
      value={`${healthData.healthScore}/100`}
      icon={Activity}
      description={healthData.status}
      status={getHealthStatus()}
      badge={actualIssuesCount > 0 ? actualIssuesCount : null}
      onClick={onDetails}
    />
  );
};

// Confirmation Modal - matches existing modal styling
export const AdminConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", confirmVariant = "danger", loading = false }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-gray-300 mb-6">{message}</p>
          
          <div className="flex gap-3 justify-end">
            <AdminButton
              onClick={onClose}
              variant="secondary"
              disabled={loading}
            >
              Cancel
            </AdminButton>
            <AdminButton
              onClick={onConfirm}
              variant={confirmVariant}
              loading={loading}
            >
              {confirmText}
            </AdminButton>
          </div>
        </div>
      </div>
    </div>
  );
};

// Progress Modal for cleanup operations
export const AdminProgressModal = ({ isOpen, onClose, title, progress, message, canCancel = false }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h3 className="text-lg font-semibold">{title}</h3>
          {canCancel && (
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        
        <div className="p-6">
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span>{message}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-primary-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          
          <div className="flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-primary-400" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Admin Panel Container
export const AdminPanel = ({ title, children, collapsible = false, defaultExpanded = true }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="card">
      <div 
        className={`flex items-center justify-between mb-6 ${collapsible ? 'cursor-pointer' : ''}`}
        onClick={collapsible ? () => setExpanded(!expanded) : undefined}
      >
        <h4 className="text-lg font-bold flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary-400" />
          {title}
        </h4>
        {collapsible && (
          <button className="text-gray-400 hover:text-white">
            {expanded ? <Eye className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
          </button>
        )}
      </div>
      
      {(!collapsible || expanded) && (
        <div className="space-y-4">
          {children}
        </div>
      )}
    </div>
  );
};

// Quick Actions Row
export const AdminQuickActions = ({ actions = [] }) => {
  return (
    <div className="flex flex-wrap gap-3">
      {actions.map((action, index) => (
        <AdminButton
          key={index}
          onClick={action.onClick}
          variant={action.variant || 'secondary'}
          loading={action.loading}
          disabled={action.disabled}
          className="flex-1 min-w-[140px]"
        >
          {action.icon && <action.icon className="w-4 h-4" />}
          {action.label}
          {action.badge && (
            <span className="px-2 py-1 text-xs rounded-full bg-red-600 text-red-200 font-bold ml-1">
              {action.badge}
            </span>
          )}
        </AdminButton>
      ))}
    </div>
  );
};

export default {
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
};