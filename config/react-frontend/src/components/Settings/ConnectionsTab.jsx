import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle, AlertCircle, RefreshCw, Wifi, Key, Database, Search, Brain, MessageCircle, Toggle, Home, Cloud, Lock, Shield } from 'lucide-react';
import { useAppContext } from '../../App';
import settingsManager from '../../utils/settingsManager';

const ConnectionsTab = ({ onSettingsChange }) => {
  const { settings, connectionStatus, updateCategory } = useAppContext();
  const [formData, setFormData] = useState(settings.connections);
  const [showKeys, setShowKeys] = useState({});
  const [testing, setTesting] = useState({ all: false });
  const [testResults, setTestResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Mode switching state for v2.3.4
  const [modeInfo, setModeInfo] = useState({ mode: 'cloud', locked: false, changeable: true });
  const [currentMode, setCurrentMode] = useState('cloud');
  const [modeLoading, setModeLoading] = useState(true);
  const [modeSwitching, setModeSwitching] = useState(false);

  // Load settings and mode info from database on component mount
  useEffect(() => {
    const loadDatabaseSettings = async () => {
      try {
        setLoading(true);
        setModeLoading(true);
        
        // Load regular settings
        const dbSettings = await settingsManager.loadSettingsFromDatabase();
        setFormData(dbSettings.connections);
        updateCategory('connections', dbSettings.connections);
        
        // Load mode information
        const mode = await settingsManager.getModeInfo();
        setModeInfo(mode);
        setCurrentMode(mode.mode);
        console.log('🔧 Loaded mode info:', mode);
        
      } catch (error) {
        console.error('Failed to load database settings:', error);
        // Fallback to existing settings
        setFormData(settings.connections);
      } finally {
        setLoading(false);
        setModeLoading(false);
      }
    };

    loadDatabaseSettings();
  }, []); // Run only on mount

  // Update form data when settings change from other sources
  useEffect(() => {
    if (!loading) {
      setFormData(settings.connections);
    }
  }, [settings.connections, loading]);

  // Handle input changes
  const handleInputChange = async (field, value) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    updateCategory('connections', newData);
    onSettingsChange();
    
    // Save to database with debouncing
    setSaving(true);
    try {
      await settingsManager.saveConnectionsToDatabase(newData);
    } catch (error) {
      console.error('Failed to save settings to database:', error);
    } finally {
      // Add a small delay to show the saving state
      setTimeout(() => setSaving(false), 500);
    }
  };

  // Toggle API key visibility
  const toggleKeyVisibility = (field) => {
    setShowKeys(prev => ({ ...prev, [field]: !prev[field] }));
  };

  // Mode switching handler
  const handleModeSwitch = async (newMode) => {
    if (newMode === currentMode) return;
    
    setModeSwitching(true);
    try {
      const result = await settingsManager.switchMode(newMode);
      
      if (result.success) {
        // Show instructions for restart
        alert(`Mode switch initiated!\n\n${result.instructions.join('\n')}`);
        // Update UI to reflect new mode
        setCurrentMode(newMode);
      } else {
        alert(`Failed to switch mode: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to switch mode:', error);
      alert('Failed to switch deployment mode');
    } finally {
      setModeSwitching(false);
    }
  };

  // Test connections (mode-aware)
  const testConnections = async () => {
    setTesting(prev => ({ ...prev, all: true }));
    try {
      // Use mode-aware validation
      const settingsForValidation = {
        connections: formData
      };
      const results = await settingsManager.validateConnectionsForMode(currentMode, settingsForValidation);
      setTestResults(results);
      
      // Log results for debugging
      console.log('✅ Connection test results:', results);
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      // Set all as failed on error
      setTestResults({
        openai: false,
        qdrant: false,
      });
    } finally {
      setTesting(prev => ({ ...prev, all: false }));
    }
  };

  // Individual connection testing removed - using main validateConnections instead

  // Connection status indicator
  const getStatusIndicator = (service) => {
    const isConnected = connectionStatus[service];
    const testResult = testResults[service];
    
    if (testing.all) {
      return <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />;
    }
    
    if (testResult !== undefined) {
      return testResult 
        ? <CheckCircle className="w-4 h-4 text-green-400" />
        : <AlertCircle className="w-4 h-4 text-red-400" />;
    }
    
    return isConnected 
      ? <CheckCircle className="w-4 h-4 text-green-400" />
      : <AlertCircle className="w-4 h-4 text-gray-400" />;
  };

  // Dynamic connection configurations based on mode
  const getConnections = () => {
    const baseConnections = [
      {
        id: 'openai',
        title: 'OpenAI API',
        description: 'GPT models for AI analysis and contextual embeddings',
        icon: Brain,
        fields: [
          {
            key: 'openaiApiKey',
            label: 'API Key',
            type: 'password',
            placeholder: 'sk-proj-...',
            required: true,
            help: 'Get your API key from https://platform.openai.com/api-keys',
          },
        ],
      }
    ];

    const qdrantConfig = {
      id: 'qdrant',
      title: `Qdrant Vector Database ${currentMode === 'local' ? '(Local)' : '(Cloud)'}`,
      description: currentMode === 'local' 
        ? 'Local vector database - no configuration needed'
        : 'Cloud vector database for semantic search and embeddings',
      icon: Search,
      fields: currentMode === 'local' ? [
        {
          key: 'qdrantLocalUrl',
          label: 'Local URL',
          type: 'url',
          placeholder: 'http://localhost:6333',
          required: false,
          readonly: true,
          help: 'Local Qdrant instance automatically configured',
        }
      ] : [
        {
          key: 'qdrantUrl',
          label: 'Cluster URL',
          type: 'url',
          placeholder: 'https://your-cluster.qdrant.io',
          required: true,
          help: 'Your Qdrant cluster URL from the cloud dashboard',
        },
        {
          key: 'qdrantApiKey',
          label: 'API Key',
          type: 'password',
          placeholder: 'Enter your Qdrant API key',
          required: true,
          help: 'API key for your Qdrant cluster',
        },
      ],
    };

    return [...baseConnections, qdrantConfig];
  };

  const connections = getConnections();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold flex items-center gap-3">
            <Wifi className="w-6 h-6 text-primary-400" />
            Connection Settings
            {saving && (
              <span className="text-sm text-yellow-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Saving...
              </span>
            )}
          </h3>
          <p className="text-gray-400 mt-1">
            Configure OpenAI and Qdrant connections for AutoLlama services
          </p>
        </div>
        
        <button
          onClick={testConnections}
          disabled={testing.all}
          className="btn-primary"
        >
          <RefreshCw className={`w-4 h-4 ${testing.all ? 'animate-spin' : ''}`} />
          {testing.all ? 'Testing...' : 'Test All'}
        </button>
      </div>

      {/* Connection Status Overview */}
      <div className="grid grid-cols-2 gap-4">
        <StatusCard
          title="OpenAI"
          status={connectionStatus.openai}
          testResult={testResults.openai}
          testing={testing}
        />
        <StatusCard
          title="Qdrant"
          status={connectionStatus.qdrant}
          testResult={testResults.qdrant}
          testing={testing}
        />
      </div>

      {/* Deployment Mode Toggle - v2.3.4 */}
      {!modeLoading && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                currentMode === 'local' ? 'bg-green-600 bg-opacity-20' : 'bg-blue-600 bg-opacity-20'
              }`}>
                {currentMode === 'local' ? (
                  <Home className="w-5 h-5 text-green-400" />
                ) : (
                  <Cloud className="w-5 h-5 text-blue-400" />
                )}
              </div>
              <div>
                <h4 className="text-lg font-bold flex items-center gap-2">
                  Deployment Mode
                  {modeInfo.locked && (
                    <Lock className="w-4 h-4 text-orange-400" title="Mode locked in production" />
                  )}
                </h4>
                <p className="text-sm text-gray-400">{modeInfo.description}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium text-gray-300">
                  {currentMode === 'local' ? '🏠 Local Mode' : '☁️ Cloud Mode'}
                </div>
                <div className="text-xs text-gray-500">
                  {currentMode === 'local' ? 'Air-gapped security' : 'External services'}
                </div>
              </div>
              
              {!modeInfo.locked && (
                <button
                  onClick={() => handleModeSwitch(currentMode === 'local' ? 'cloud' : 'local')}
                  disabled={modeSwitching}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                    currentMode === 'local' ? 'bg-green-600' : 'bg-gray-600'
                  } ${modeSwitching ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                      currentMode === 'local' ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                  {modeSwitching && (
                    <RefreshCw className="absolute inset-0 w-3 h-3 m-auto animate-spin text-gray-400" />
                  )}
                </button>
              )}
            </div>
          </div>
          
          {/* Mode Information */}
          <div className="space-y-3">
            <div className={`p-3 rounded-lg border ${
              currentMode === 'local' 
                ? 'bg-green-900 bg-opacity-20 border-green-700'
                : 'bg-blue-900 bg-opacity-20 border-blue-700'
            }`}>
              <div className="flex items-start gap-3">
                <Shield className="w-4 h-4 text-current mt-0.5" />
                <div className="text-sm">
                  {currentMode === 'local' ? (
                    <div>
                      <div className="font-medium text-green-300 mb-1">Air-Gapped Local Deployment</div>
                      <div className="text-green-200">
                        • Complete data isolation and privacy<br/>
                        • Local PostgreSQL + Qdrant + Redis stack<br/>
                        • Zero external connections (except OpenAI API)<br/>
                        • Enterprise compliance ready
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="font-medium text-blue-300 mb-1">Cloud-Connected Deployment</div>
                      <div className="text-blue-200">
                        • External Qdrant Cloud service<br/>
                        • External PostgreSQL database<br/>
                        • Optimized for development and small teams<br/>
                        • Full cloud service integration
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {modeInfo.locked && (
              <div className="text-xs text-orange-400 flex items-center gap-2">
                <Lock className="w-3 h-3" />
                Mode switching is locked for production safety. Set VECTOR_DB_MODE_LOCKED=false to enable.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Loading connection settings...</span>
          </div>
        </div>
      )}

      {/* Connection Forms */}
      {!loading && (
        <div className="space-y-6">
          {connections.map((connection) => {
          const Icon = connection.icon;
          
          return (
            <div key={connection.id} className="card">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-600 bg-opacity-20 rounded-lg flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold">{connection.title}</h4>
                    <p className="text-sm text-gray-400">{connection.description}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {getStatusIndicator(connection.id)}
                  <span className="text-sm text-gray-400">
                    {connectionStatus[connection.id] ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                {connection.fields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">
                      {field.label}
                      {field.required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={field.type === 'password' && !showKeys[field.key] ? 'password' : 'text'}
                          value={field.key === 'qdrantLocalUrl' ? 'http://localhost:6333' : (formData[field.key] || '')}
                          onChange={field.readonly ? undefined : (e) => handleInputChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className={`input-primary pr-12 ${field.readonly ? 'bg-gray-800 text-gray-400 cursor-not-allowed' : ''}`}
                          required={field.required}
                          readOnly={field.readonly}
                        />
                        
                        {field.type === 'password' && (
                          <button
                            type="button"
                            onClick={() => toggleKeyVisibility(field.key)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                          >
                            {showKeys[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                      
                      {/* Individual test buttons removed - using main "Test All" instead */}
                    </div>
                    
                    {field.help && (
                      <p className="text-xs text-gray-500">{field.help}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Test Results */}
              {testResults[connection.id] !== undefined && (
                <div className={`mt-4 p-3 rounded-lg border ${
                  testResults[connection.id]
                    ? 'bg-green-900 bg-opacity-20 border-green-700 text-green-300'
                    : 'bg-red-900 bg-opacity-20 border-red-700 text-red-300'
                }`}>
                  <div className="flex items-center gap-2">
                    {testResults[connection.id] ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    <span className="font-medium">
                      {testResults[connection.id] 
                        ? `${connection.title} connection successful`
                        : `${connection.title} connection failed`
                      }
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
          })}
        </div>
      )}

      {/* Security Notice */}
      {!loading && (
        <div className="card bg-yellow-900 bg-opacity-20 border-yellow-700">
          <div className="flex items-start gap-3">
            <Key className="w-5 h-5 text-yellow-400 mt-1" />
            <div>
              <h4 className="font-bold text-yellow-300 mb-2">Security Notice</h4>
              <div className="text-sm text-yellow-200 space-y-1">
                <p>• API keys are stored securely in the database and synchronized with environment variables</p>
                <p>• Keys are never transmitted to external servers except their respective APIs</p>
                <p>• Changes take effect immediately and are automatically saved</p>
                <p>• Regularly rotate your API keys for enhanced security</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Status Card Component
const StatusCard = ({ title, status, testResult, testing }) => {
  const getStatusColor = () => {
    if (testing.all) return 'border-yellow-500 text-yellow-400';
    if (testResult !== undefined) {
      return testResult ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400';
    }
    return status ? 'border-green-500 text-green-400' : 'border-gray-500 text-gray-400';
  };

  const getStatusIcon = () => {
    if (testing.all) return <RefreshCw className="w-4 h-4 animate-spin" />;
    if (testResult !== undefined) {
      return testResult ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />;
    }
    return status ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />;
  };

  const getStatusText = () => {
    if (testing.all) return 'Testing...';
    if (testResult !== undefined) {
      return testResult ? 'Connected' : 'Failed';
    }
    return status ? 'Connected' : 'Offline';
  };

  return (
    <div className={`p-4 rounded-lg border-2 transition-colors ${getStatusColor()}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">{title}</span>
        {getStatusIcon()}
      </div>
      <div className="text-sm opacity-80">
        {getStatusText()}
      </div>
    </div>
  );
};

export default ConnectionsTab;