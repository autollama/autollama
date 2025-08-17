import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle, AlertCircle, RefreshCw, Wifi, Key, Database, Search, Brain, MessageCircle } from 'lucide-react';
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

  // Load settings from database on component mount
  useEffect(() => {
    const loadDatabaseSettings = async () => {
      try {
        setLoading(true);
        const dbSettings = await settingsManager.loadSettingsFromDatabase();
        setFormData(dbSettings.connections);
        // Update the context as well
        updateCategory('connections', dbSettings.connections);
      } catch (error) {
        console.error('Failed to load database settings:', error);
        // Fallback to existing settings
        setFormData(settings.connections);
      } finally {
        setLoading(false);
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

  // Test connections
  const testConnections = async () => {
    setTesting(prev => ({ ...prev, all: true }));
    try {
      // Use the real validation function from settingsManager
      // Create the settings structure expected by validateConnections
      const settingsForValidation = {
        connections: formData
      };
      const results = await settingsManager.validateConnections(settingsForValidation);
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

  // Connection configurations - streamlined to show only OpenAI and Qdrant
  const connections = [
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
    },
    {
      id: 'qdrant',
      title: 'Qdrant Vector Database',
      description: 'Semantic search and vector embeddings storage',
      icon: Search,
      fields: [
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
    },
  ];

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
                          value={formData[field.key] || ''}
                          onChange={(e) => handleInputChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="input-primary pr-12"
                          required={field.required}
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