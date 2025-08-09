import React, { useState, useEffect } from 'react';
import { X, Settings, Wifi, Zap, Brain, Database, Download, Upload, RotateCcw } from 'lucide-react';
import { useAppContext } from '../../App';
import ConnectionsTab from './ConnectionsTab';
import PipelineTab from './PipelineTab';
import ProcessingTab from './ProcessingTab';
import SystemTab from './SystemTab';

const SettingsModal = () => {
  const { setShowSettings, settings, updateCategory, connectionStatus } = useAppContext();
  const [activeTab, setActiveTab] = useState('connections');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Tab configuration
  const tabs = [
    {
      id: 'connections',
      label: 'Connections',
      icon: Wifi,
      description: 'API keys and database connections',
      component: ConnectionsTab,
      badge: connectionStatus ? Object.values(connectionStatus).filter(Boolean).length : 0,
      badgeTotal: 6,
    },
    {
      id: 'pipeline',
      label: 'OpenWebUI',
      icon: Zap,
      description: 'RAG pipeline configuration',
      component: PipelineTab,
      badge: settings.pipeline?.debugMode ? '🔍' : null,
    },
    {
      id: 'processing',
      label: 'Processing',
      icon: Brain,
      description: 'AI models and contextual embeddings',
      component: ProcessingTab,
      badge: settings.processing?.enableContextualEmbeddings ? '🧠' : null,
    },
    {
      id: 'system',
      label: 'System',
      icon: Database,
      description: 'UI preferences and performance',
      component: SystemTab,
      badge: settings.system?.debugLogging ? '🐛' : null,
    },
  ];

  // Handle close with unsaved changes warning
  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        setShowSettings(false);
        setHasUnsavedChanges(false);
      }
    } else {
      setShowSettings(false);
    }
  };

  // Handle save all settings
  const handleSaveAll = () => {
    // This would save all pending changes
    setHasUnsavedChanges(false);
    // Show success message
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSaveAll();
      }
    };

    // Ensure document is available
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        if (typeof document !== 'undefined') {
          document.removeEventListener('keydown', handleKeyDown);
        }
      };
    }
  }, [hasUnsavedChanges]);

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || ConnectionsTab;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal-content w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 bg-opacity-20 rounded-lg flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">AutoLlama Settings</h2>
              <p className="text-sm text-gray-400">Configure your digital llama's behavior</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <div className="flex items-center gap-2 text-yellow-400 text-sm">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                <span>Unsaved changes</span>
              </div>
            )}
            
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 bg-gray-800 bg-opacity-50 border-r border-gray-700 p-4">
            <nav className="space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-200
                      ${isActive 
                        ? 'bg-primary-600 bg-opacity-20 text-primary-400 border border-primary-600 border-opacity-30' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-700 hover:bg-opacity-50'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{tab.label}</span>
                        {tab.badge && (
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            typeof tab.badge === 'string' 
                              ? 'bg-transparent' 
                              : isActive 
                                ? 'bg-primary-800 text-primary-200' 
                                : 'bg-gray-600 text-gray-200'
                          }`}>
                            {typeof tab.badge === 'number' 
                              ? `${tab.badge}/${tab.badgeTotal || tab.badge}` 
                              : tab.badge
                            }
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 truncate">
                        {tab.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>

            {/* Quick Actions */}
            <div className="mt-8 pt-4 border-t border-gray-700">
              <h4 className="font-medium text-sm text-gray-400 mb-3">Quick Actions</h4>
              <div className="space-y-2">
                <QuickActionBtn
                  icon={Download}
                  label="Export Settings"
                  onClick={() => {/* Implement export */}}
                  className="text-blue-400 hover:bg-blue-900 hover:bg-opacity-20"
                />
                <QuickActionBtn
                  icon={Upload}
                  label="Import Settings"
                  onClick={() => {/* Implement import */}}
                  className="text-green-400 hover:bg-green-900 hover:bg-opacity-20"
                />
                <QuickActionBtn
                  icon={RotateCcw}
                  label="Reset to Defaults"
                  onClick={() => {/* Implement reset */}}
                  className="text-red-400 hover:bg-red-900 hover:bg-opacity-20"
                />
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              <ActiveComponent 
                onSettingsChange={() => setHasUnsavedChanges(true)}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-700 bg-gray-800 bg-opacity-30">
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>AutoLlama v2.0</span>
            <span>•</span>
            <span>Use Ctrl+S to save</span>
            <span>•</span>
            <span>Press Esc to close</span>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAll}
              className={`btn-primary ${hasUnsavedChanges ? 'animate-pulse-slow' : ''}`}
              disabled={!hasUnsavedChanges}
            >
              {hasUnsavedChanges ? 'Save Changes' : 'Saved'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Quick Action Button Component
const QuickActionBtn = ({ icon: Icon, label, onClick, className = '' }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm transition-colors ${className}`}
  >
    <Icon className="w-4 h-4" />
    <span>{label}</span>
  </button>
);

export default SettingsModal;