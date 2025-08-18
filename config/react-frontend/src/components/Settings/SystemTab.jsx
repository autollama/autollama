import React, { useState, useEffect, useRef } from 'react';
import { Database, Monitor, Palette, Zap, Bug, Clock, Eye, Trash2, RefreshCw, Upload, X, CheckCircle } from 'lucide-react';
import { useAppContext } from '../../App';

const SystemTab = ({ onSettingsChange }) => {
  const { settings, updateCategory, api } = useAppContext();
  const [formData, setFormData] = useState(settings.system);
  const [uiData, setUiData] = useState(settings.ui);
  const [systemInfo, setSystemInfo] = useState(null);
  const [clearingCache, setClearingCache] = useState(false);
  
  // Favicon upload state
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [faviconUploadStatus, setFaviconUploadStatus] = useState(null);
  const faviconInputRef = useRef(null);

  // Update form data when settings change
  useEffect(() => {
    setFormData(settings.system);
    setUiData(settings.ui);
    loadSystemInfo();
  }, [settings.system, settings.ui]);

  // Load system information
  const loadSystemInfo = async () => {
    try {
      const [dbStats, health] = await Promise.all([
        api.stats.getDatabase(),
        api.stats.getHealth(),
      ]);
      
      setSystemInfo({
        database: dbStats?.stats || dbStats, // Extract stats field if it exists
        health: health,
        memory: {
          used: Math.round(Math.random() * 512) + 256, // Mock data
          total: 1024,
        },
        uptime: '2d 14h 32m',
        version: '2.0.0',
      });
    } catch (error) {
      console.error('Failed to load system info:', error);
    }
  };

  // Handle input changes
  const handleInputChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    updateCategory('system', newData);
    onSettingsChange();
  };

  // Handle UI setting changes
  const handleUIChange = (field, value) => {
    const newData = { ...uiData, [field]: value };
    setUiData(newData);
    updateCategory('ui', newData);
    onSettingsChange();
  };

  // Clear application cache
  const clearCache = async () => {
    setClearingCache(true);
    try {
      // Clear localStorage cache
      const cacheKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('autollama-cache-') || key.startsWith('autollama-search-')
      );
      cacheKeys.forEach(key => localStorage.removeItem(key));
      
      // Clear any other caches
      await new Promise(resolve => setTimeout(resolve, 1000)); // Mock delay
      
      alert('Cache cleared successfully! The page will refresh.');
      window.location.reload();
    } catch (error) {
      console.error('Failed to clear cache:', error);
      alert('Failed to clear cache. Please try again.');
    } finally {
      setClearingCache(false);
    }
  };

  // Upload favicon
  const uploadFavicon = async (file) => {
    if (!file) return;
    
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.ico')) {
      setFaviconUploadStatus({ type: 'error', message: 'Please select a .ico file' });
      return;
    }
    
    // Validate file size (1MB max)
    if (file.size > 1024 * 1024) {
      setFaviconUploadStatus({ type: 'error', message: 'File size must be under 1MB' });
      return;
    }
    
    setFaviconUploading(true);
    setFaviconUploadStatus(null);
    
    try {
      const formData = new FormData();
      formData.append('favicon', file);
      
      const response = await fetch('/api/settings/favicon', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Update favicon in the DOM immediately
        updateFaviconInDOM();
        
        // Update UI settings
        const newUiData = { 
          ...uiData, 
          customFavicon: true,
          faviconUploadTime: new Date().toISOString()
        };
        setUiData(newUiData);
        updateCategory('ui', newUiData);
        
        setFaviconUploadStatus({ type: 'success', message: 'Favicon uploaded successfully!' });
        onSettingsChange();
      } else {
        setFaviconUploadStatus({ type: 'error', message: result.message || 'Upload failed' });
      }
    } catch (error) {
      console.error('Favicon upload error:', error);
      setFaviconUploadStatus({ type: 'error', message: 'Failed to upload favicon' });
    } finally {
      setFaviconUploading(false);
    }
  };

  // Reset favicon to default
  const resetFavicon = async () => {
    setFaviconUploading(true);
    setFaviconUploadStatus(null);
    
    try {
      const response = await fetch('/api/settings/favicon', {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Reset favicon in the DOM
        resetFaviconInDOM();
        
        // Update UI settings
        const newUiData = { 
          ...uiData, 
          customFavicon: false,
          faviconUploadTime: null
        };
        setUiData(newUiData);
        updateCategory('ui', newUiData);
        
        setFaviconUploadStatus({ type: 'success', message: 'Favicon reset to default!' });
        onSettingsChange();
      } else {
        setFaviconUploadStatus({ type: 'error', message: result.message || 'Reset failed' });
      }
    } catch (error) {
      console.error('Favicon reset error:', error);
      setFaviconUploadStatus({ type: 'error', message: 'Failed to reset favicon' });
    } finally {
      setFaviconUploading(false);
    }
  };

  // Update favicon in DOM
  const updateFaviconInDOM = () => {
    // Remove existing favicon links
    const existingIcons = document.querySelectorAll('link[rel*="icon"]');
    existingIcons.forEach(icon => icon.remove());
    
    // Add new favicon link
    const newIcon = document.createElement('link');
    newIcon.rel = 'icon';
    newIcon.type = 'image/x-icon';
    newIcon.href = `/favicon.ico?v=${Date.now()}`; // Cache bust
    document.head.appendChild(newIcon);
  };

  // Reset favicon in DOM to default
  const resetFaviconInDOM = () => {
    // Remove existing favicon links
    const existingIcons = document.querySelectorAll('link[rel*="icon"]');
    existingIcons.forEach(icon => icon.remove());
    
    // Add default SVG favicon link
    const newIcon = document.createElement('link');
    newIcon.rel = 'icon';
    newIcon.type = 'image/svg+xml';
    newIcon.href = '/llama-icon.svg';
    document.head.appendChild(newIcon);
  };

  // Handle file input change
  const handleFaviconFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      uploadFavicon(file);
    }
    // Reset file input
    if (faviconInputRef.current) {
      faviconInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h3 className="text-2xl font-bold flex items-center gap-3">
          <Database className="w-6 h-6 text-primary-400" />
          System Settings
        </h3>
        <p className="text-gray-400 mt-1">
          Configure UI preferences, performance settings, and system behavior
        </p>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SystemCard
          title="Version"
          value={systemInfo?.version || '2.0.0'}
          icon={Monitor}
          description="AutoLlama release"
        />
        <SystemCard
          title="Uptime"
          value={systemInfo?.uptime || 'Unknown'}
          icon={Clock}
          description="System running time"
        />
        <SystemCard
          title="Memory"
          value={systemInfo ? `${systemInfo.memory.used}MB` : 'Unknown'}
          icon={Database}
          description={systemInfo ? `of ${systemInfo.memory.total}MB` : 'Memory usage'}
        />
        <SystemCard
          title="Debug Mode"
          value={formData.debugLogging ? 'ON' : 'OFF'}
          icon={Bug}
          description="Development logging"
          status={formData.debugLogging}
        />
      </div>

      {/* UI Preferences */}
      <div className="card">
        <h4 className="text-lg font-bold mb-6 flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary-400" />
          User Interface
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Theme
              </label>
              <select
                value={formData.theme}
                onChange={(e) => handleInputChange('theme', e.target.value)}
                className="input-primary"
              >
                <option value="dark">Dark Mode</option>
                <option value="light">Light Mode</option>
                <option value="auto">Auto (System)</option>
              </select>
              <p className="text-xs text-gray-500">
                Choose your preferred theme appearance
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Documents Per Page
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="10"
                  value={uiData.documentsPerPage}
                  onChange={(e) => handleUIChange('documentsPerPage', parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm font-mono bg-gray-800 px-2 py-1 rounded w-12 text-center">
                  {uiData.documentsPerPage}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Number of documents to display per page
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Chunks Per Row
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="5"
                  max="20"
                  step="1"
                  value={uiData.chunksPerRow}
                  onChange={(e) => handleUIChange('chunksPerRow', parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm font-mono bg-gray-800 px-2 py-1 rounded w-12 text-center">
                  {uiData.chunksPerRow}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Number of chunk cells to display per row in document view
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <h5 className="font-medium text-gray-300">Display Options</h5>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={uiData.showVectorHeatmaps}
                  onChange={(e) => handleUIChange('showVectorHeatmaps', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Show Vector Heatmaps</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={uiData.showContextualSummaries}
                  onChange={(e) => handleUIChange('showContextualSummaries', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Show Contextual Summaries</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={uiData.animationsEnabled}
                  onChange={(e) => handleUIChange('animationsEnabled', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Enable Animations</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={uiData.compactMode}
                  onChange={(e) => handleUIChange('compactMode', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Compact Mode</span>
              </label>
            </div>

            {/* Favicon Upload Section */}
            <div className="space-y-3 pt-4 border-t border-gray-700">
              <h5 className="font-medium text-gray-300 flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Custom Favicon
              </h5>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {/* Current favicon preview */}
                  <div className="w-8 h-8 bg-gray-800 rounded border border-gray-600 flex items-center justify-center">
                    <img 
                      src={uiData.customFavicon ? `/favicon.ico?v=${uiData.faviconUploadTime}` : '/llama-icon.svg'} 
                      alt="Current favicon" 
                      className="w-4 h-4"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'block';
                      }}
                    />
                    <div style={{ display: 'none' }} className="w-4 h-4 bg-gray-600 rounded"></div>
                  </div>
                  
                  <div className="flex-1">
                    <p className="text-sm text-gray-300">
                      {uiData.customFavicon ? 'Custom favicon uploaded' : 'Using default llama icon'}
                    </p>
                    {uiData.faviconUploadTime && (
                      <p className="text-xs text-gray-500">
                        Uploaded: {new Date(uiData.faviconUploadTime).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                {/* Upload controls */}
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={faviconInputRef}
                    onChange={handleFaviconFileChange}
                    accept=".ico"
                    className="hidden"
                  />
                  
                  <button
                    onClick={() => faviconInputRef.current?.click()}
                    disabled={faviconUploading}
                    className="btn-secondary flex items-center gap-2 text-xs"
                  >
                    {faviconUploading ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Upload className="w-3 h-3" />
                    )}
                    {faviconUploading ? 'Uploading...' : 'Upload .ico'}
                  </button>
                  
                  {uiData.customFavicon && (
                    <button
                      onClick={resetFavicon}
                      disabled={faviconUploading}
                      className="btn-secondary flex items-center gap-2 text-xs"
                    >
                      {faviconUploading ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                      Reset
                    </button>
                  )}
                </div>

                {/* Status message */}
                {faviconUploadStatus && (
                  <div className={`p-2 rounded text-xs ${
                    faviconUploadStatus.type === 'success' 
                      ? 'bg-green-900 border border-green-700 text-green-200'
                      : 'bg-red-900 border border-red-700 text-red-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      {faviconUploadStatus.type === 'success' ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                      {faviconUploadStatus.message}
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-500">
                  Upload a .ico file (max 1MB) to customize the browser tab icon
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Settings */}
      <div className="card">
        <h4 className="text-lg font-bold mb-6 flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary-400" />
          Performance & Caching
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                SSE Update Interval (seconds)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={formData.sseUpdateInterval / 1000}
                  onChange={(e) => handleInputChange('sseUpdateInterval', parseInt(e.target.value) * 1000)}
                  className="flex-1"
                />
                <span className="text-sm font-mono bg-gray-800 px-2 py-1 rounded w-12 text-center">
                  {formData.sseUpdateInterval / 1000}s
                </span>
              </div>
              <p className="text-xs text-gray-500">
                How often to check for real-time updates
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Cache Timeout (minutes)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="60"
                  value={formData.cacheTimeout / 60000}
                  onChange={(e) => handleInputChange('cacheTimeout', parseInt(e.target.value) * 60000)}
                  className="flex-1"
                />
                <span className="text-sm font-mono bg-gray-800 px-2 py-1 rounded w-12 text-center">
                  {formData.cacheTimeout / 60000}m
                </span>
              </div>
              <p className="text-xs text-gray-500">
                How long to cache API responses
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <h5 className="font-medium text-gray-300">Auto-refresh Options</h5>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.autoRefreshDocuments}
                  onChange={(e) => handleInputChange('autoRefreshDocuments', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Auto-refresh Documents</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.showProcessingDetails}
                  onChange={(e) => handleInputChange('showProcessingDetails', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Show Processing Details</span>
              </label>
            </div>

            <div className="pt-4">
              <button
                onClick={clearCache}
                disabled={clearingCache}
                className="btn-secondary w-full"
              >
                <Trash2 className={`w-4 h-4 ${clearingCache ? 'animate-spin' : ''}`} />
                {clearingCache ? 'Clearing Cache...' : 'Clear Application Cache'}
              </button>
              <p className="text-xs text-gray-500 mt-2">
                Clears stored data and forces a fresh reload
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Development Settings */}
      <div className="card">
        <h4 className="text-lg font-bold mb-6 flex items-center gap-2">
          <Bug className="w-5 h-5 text-primary-400" />
          Development & Debugging
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Log Level
              </label>
              <select
                value={formData.logLevel || 'info'}
                onChange={(e) => handleInputChange('logLevel', e.target.value)}
                className="input-primary"
              >
                <option value="debug">Debug (Verbose)</option>
                <option value="info">Info (Normal)</option>
                <option value="warn">Warning (Important)</option>
                <option value="error">Error (Critical Only)</option>
              </select>
              <p className="text-xs text-gray-500">
                Controls console logging verbosity
              </p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.debugLogging}
                  onChange={(e) => handleInputChange('debugLogging', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Enable Debug Logging</span>
              </label>
              <p className="text-xs text-gray-500 pl-6">
                Enables detailed logging for troubleshooting
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-yellow-900 bg-opacity-20 rounded-lg border border-yellow-700">
              <div className="flex items-start gap-2">
                <Bug className="w-4 h-4 text-yellow-400 mt-0.5" />
                <div className="text-sm text-yellow-200">
                  <p className="font-medium mb-1">Debug Mode Active</p>
                  <p>Detailed logs are being written to the browser console. This may impact performance.</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => window.open('/api/logs', '_blank')}
                className="btn-secondary w-full"
              >
                <Eye className="w-4 h-4" />
                View System Logs
              </button>
              <p className="text-xs text-gray-500">
                Opens server logs in a new window (if available)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* System Information */}
      {systemInfo && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-lg font-bold flex items-center gap-2">
              <Monitor className="w-5 h-5 text-primary-400" />
              System Information
            </h4>
            <button
              onClick={loadSystemInfo}
              className="btn-secondary text-xs"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h5 className="font-medium text-gray-300">Application</h5>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Version:</span>
                  <span className="font-mono">{systemInfo.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Uptime:</span>
                  <span className="font-mono">{systemInfo.uptime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Environment:</span>
                  <span className="font-mono">Production</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h5 className="font-medium text-gray-300">Resources</h5>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Memory Usage:</span>
                  <span className="font-mono">
                    {systemInfo.memory.used}MB / {systemInfo.memory.total}MB
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">PostgreSQL Size:</span>
                  <span className="font-mono">{systemInfo.database?.postgres_size_pretty || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Qdrant Vectors:</span>
                  <span className="font-mono">
                    {systemInfo.database?.qdrant?.vector_count ? 
                      `${systemInfo.database.qdrant.vector_count.toLocaleString()} (${systemInfo.database.qdrant.estimated_size_mb})` :
                      'Unknown'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Cache Size:</span>
                  <span className="font-mono">~2.4MB</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// System Card Component
const SystemCard = ({ title, value, icon: Icon, description, status }) => {
  const getStatusColor = () => {
    if (status !== undefined) {
      return status ? 'border-green-500 text-green-400' : 'border-gray-500 text-gray-400';
    }
    return 'border-blue-500 text-blue-400';
  };

  return (
    <div className={`p-4 rounded-lg border-2 transition-colors ${getStatusColor()}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-5 h-5" />
        <span className="text-lg font-bold">{value}</span>
      </div>
      <div className="text-sm font-medium mb-1">{title}</div>
      <div className="text-xs opacity-80">{description}</div>
    </div>
  );
};

export default SystemTab;