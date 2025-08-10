import React, { useState, useEffect } from 'react';
import { Zap, Globe, Key, Database, Sliders, TestTube, CheckCircle, AlertCircle, RefreshCw, Copy, ExternalLink, Settings } from 'lucide-react';
import { useAppContext } from '../../App';

const PipelineTab = ({ onSettingsChange }) => {
  const { settings, updateCategory, api } = useAppContext();
  const [formData, setFormData] = useState(settings.pipeline);
  const [ragSettings, setRagSettings] = useState({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [pipelineStats, setPipelineStats] = useState(null);
  const [copied, setCopied] = useState({});
  const [ragSaving, setRagSaving] = useState(false);

  // Update form data when settings change
  useEffect(() => {
    setFormData(settings.pipeline);
    loadPipelineStats();
    loadRagSettings();
  }, [settings.pipeline]);

  // Check if Anthropic API key is configured
  const hasAnthropicKey = settings.connections?.claudeApiKey && settings.connections.claudeApiKey.trim().length > 0;

  // Load pipeline statistics
  const loadPipelineStats = async () => {
    try {
      const stats = await api.stats.getPipelineHealth();
      setPipelineStats(stats);
    } catch (error) {
      console.error('Failed to load pipeline stats:', error);
    }
  };

  // Load RAG settings
  const loadRagSettings = async () => {
    try {
      const response = await api.getRagSettings();
      setRagSettings(response.data.settings || {});
    } catch (error) {
      console.error('Failed to load RAG settings:', error);
      // Set defaults if loading fails
      setRagSettings({
        ragModel: 'gpt-4o-mini',
        ragMaxTokens: 1000,
        ragTemperature: 0.7,
        searchLimit: 5
      });
    }
  };

  // Update RAG settings
  const updateRagSettings = async (newSettings) => {
    setRagSaving(true);
    try {
      const response = await api.updateRagSettings(newSettings);
      setRagSettings(response.data.settings || newSettings);
      console.log('✅ RAG settings updated successfully');
    } catch (error) {
      console.error('Failed to update RAG settings:', error);
    } finally {
      setRagSaving(false);
    }
  };

  // Handle input changes
  const handleInputChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    updateCategory('pipeline', newData);
    onSettingsChange();
  };

  // Handle RAG settings changes
  const handleRagSettingChange = (field, value) => {
    const newRagSettings = { ...ragSettings, [field]: value };
    setRagSettings(newRagSettings);
    
    // Auto-save after a short delay
    if (handleRagSettingChange.timeout) {
      clearTimeout(handleRagSettingChange.timeout);
    }
    handleRagSettingChange.timeout = setTimeout(() => {
      updateRagSettings(newRagSettings);
    }, 1000); // Save after 1 second of no changes
  };

  // Test pipeline connection
  const testPipeline = async () => {
    setTesting(true);
    try {
      const result = await api.stats.getPipelineHealth();
      setTestResult({
        success: true,
        message: 'Pipeline connection successful',
        details: result,
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Pipeline connection failed',
        error: error.message,
      });
    } finally {
      setTesting(false);
    }
  };

  // Copy text to clipboard with feedback
  const copyToClipboard = (text, key) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(prev => ({ ...prev, [key]: true }));
        setTimeout(() => setCopied(prev => ({ ...prev, [key]: false })), 2000);
      }).catch(() => {
        fallbackCopyToClipboard(text, key);
      });
    } else {
      fallbackCopyToClipboard(text, key);
    }
  };

  // Fallback copy method for older browsers
  const fallbackCopyToClipboard = (text, key) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setCopied(prev => ({ ...prev, [key]: false })), 2000);
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
    document.body.removeChild(textArea);
  };

  // Detect current environment and preferred URLs
  const getPreferredUrl = () => {
    // Use the CORRECT working configuration - direct API access via Tailscale IP
    return 'http://100.64.199.110:3001/api/openwebui';
  };

  const getAlternativeUrls = () => {
    return [
      'http://autollama-on-hstgr-4:3001/api/openwebui',
      'http://localhost:9099',
      'https://autollama.io:9099'
    ];
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold flex items-center gap-3">
            <Zap className="w-6 h-6 text-primary-400" />
            OpenWebUI Pipeline
          </h3>
          <p className="text-gray-400 mt-1">
            Configure RAG pipeline for intelligent conversations with your processed content
          </p>
        </div>
        
        <button
          onClick={testPipeline}
          disabled={testing}
          className="btn-primary"
        >
          <TestTube className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} />
          {testing ? 'Testing...' : 'Test Pipeline'}
        </button>
      </div>

      {/* Pipeline Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard
          title="Pipeline Status"
          status={pipelineStats?.status}
          icon={Zap}
          description="OpenWebUI service connectivity"
        />
        <StatusCard
          title="Collection"
          status={formData.collectionName}
          icon={Database}
          description="Qdrant collection name"
        />
        <StatusCard
          title="Debug Mode"
          status={formData.debugMode}
          icon={TestTube}
          description="Detailed logging enabled"
        />
      </div>

      {/* Configuration Form */}
      <div className="card">
        <h4 className="text-lg font-bold mb-6 flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary-400" />
          Connection Settings
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Pipeline URL
              <span className="text-red-400 ml-1">*</span>
            </label>
            <input
              type="url"
              value={formData.pipelineUrl}
              onChange={(e) => handleInputChange('pipelineUrl', e.target.value)}
              placeholder="http://100.64.199.110:3001/api/openwebui"
              className="input-primary"
              required
            />
            <p className="text-xs text-gray-500">
              URL where the OpenWebUI pipeline service is running
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              API Key
              <span className="text-red-400 ml-1">*</span>
            </label>
            <input
              type="text"
              value={formData.apiKey}
              onChange={(e) => handleInputChange('apiKey', e.target.value)}
              placeholder="0p3n-w3bu!"
              className="input-primary font-mono"
              required
            />
            <p className="text-xs text-gray-500">
              Authentication key for pipeline access
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Collection Name
              <span className="text-red-400 ml-1">*</span>
            </label>
            <input
              type="text"
              value={formData.collectionName}
              onChange={(e) => handleInputChange('collectionName', e.target.value)}
              placeholder="autollama-content"
              className="input-primary font-mono"
              required
            />
            <p className="text-xs text-gray-500">
              Qdrant collection to search for RAG operations
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Max Results
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={formData.maxResults}
              onChange={(e) => handleInputChange('maxResults', parseInt(e.target.value))}
              className="input-primary"
            />
            <p className="text-xs text-gray-500">
              Maximum number of results to return per search
            </p>
          </div>
        </div>
      </div>

      {/* Search Configuration */}
      <div className="card">
        <h4 className="text-lg font-bold mb-6 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-primary-400" />
          Search & Retrieval Settings
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Similarity Threshold
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.1"
                value={formData.similarityThreshold}
                onChange={(e) => handleInputChange('similarityThreshold', parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm font-mono bg-gray-800 px-2 py-1 rounded">
                {formData.similarityThreshold.toFixed(1)}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Minimum similarity score for results (0.1 = loose, 1.0 = strict)
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
              <input
                type="checkbox"
                checked={formData.debugMode}
                onChange={(e) => handleInputChange('debugMode', e.target.checked)}
                className="rounded"
              />
              Debug Mode
            </label>
            <p className="text-xs text-gray-500">
              Enable detailed logging for troubleshooting pipeline issues
            </p>
          </div>
        </div>
      </div>

      {/* RAG Model Configuration */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-lg font-bold flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary-400" />
            RAG Model Configuration
          </h4>
          {ragSaving && (
            <div className="flex items-center gap-2 text-sm text-blue-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Saving settings...
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Language Model
              <span className="text-red-400 ml-1">*</span>
            </label>
            <select
              value={ragSettings.ragModel || 'gpt-4o-mini'}
              onChange={(e) => handleRagSettingChange('ragModel', e.target.value)}
              className="input-primary"
              disabled={ragSaving}
            >
              <optgroup label="OpenAI Models">
                <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cost-Effective)</option>
                <option value="gpt-4o">GPT-4o (Most Capable)</option>
                <option value="gpt-4">GPT-4 (Flagship Model)</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Budget)</option>
              </optgroup>
              {hasAnthropicKey && (
                <optgroup label="Anthropic Models">
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Most Capable)</option>
                  <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku (Fast & Efficient)</option>
                  <option value="claude-3-opus-20240229">Claude 3 Opus (Creative & Complex)</option>
                </optgroup>
              )}
            </select>
            <p className="text-xs text-gray-500">
              Language model used to interpret and synthesize RAG search results
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Max Tokens
            </label>
            <input
              type="number"
              min="100"
              max="4000"
              value={ragSettings.ragMaxTokens || 1000}
              onChange={(e) => handleRagSettingChange('ragMaxTokens', parseInt(e.target.value))}
              className="input-primary"
              disabled={ragSaving}
            />
            <p className="text-xs text-gray-500">
              Maximum tokens for RAG model responses
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Temperature
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.1"
                value={ragSettings.ragTemperature || 0.7}
                onChange={(e) => handleRagSettingChange('ragTemperature', parseFloat(e.target.value))}
                className="flex-1"
                disabled={ragSaving}
              />
              <span className="text-sm font-mono bg-gray-800 px-2 py-1 rounded">
                {(ragSettings.ragTemperature || 0.7).toFixed(1)}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Creativity level (0.0 = focused, 1.0 = creative)
            </p>
          </div>
        </div>

        {/* Model Information Card */}
        <div className="mt-6 p-4 bg-gray-800 bg-opacity-50 rounded-lg border border-gray-700">
          <h5 className="font-medium text-gray-300 mb-3">Model Comparison</h5>
          <div className={`grid grid-cols-1 md:grid-cols-2 ${hasAnthropicKey ? 'lg:grid-cols-4 xl:grid-cols-7' : 'lg:grid-cols-4'} gap-4 text-xs`}>
            {/* OpenAI Models */}
            <div className="space-y-1">
              <div className="font-medium text-blue-400">GPT-4o Mini</div>
              <div className="text-gray-500">Fast, cost-effective</div>
              <div className="text-gray-500">Best for most RAG tasks</div>
            </div>
            <div className="space-y-1">
              <div className="font-medium text-purple-400">GPT-4o</div>
              <div className="text-gray-500">Most capable</div>
              <div className="text-gray-500">Complex reasoning</div>
            </div>
            <div className="space-y-1">
              <div className="font-medium text-green-400">GPT-4</div>
              <div className="text-gray-500">Flagship model</div>
              <div className="text-gray-500">Proven reliability</div>
            </div>
            <div className="space-y-1">
              <div className="font-medium text-yellow-400">GPT-3.5 Turbo</div>
              <div className="text-gray-500">Budget option</div>
              <div className="text-gray-500">Faster responses</div>
            </div>
            
            {/* Anthropic Models - only show if API key is configured */}
            {hasAnthropicKey && (
              <>
                <div className="space-y-1">
                  <div className="font-medium text-orange-400">Claude 3.5 Sonnet</div>
                  <div className="text-gray-500">Superior reasoning</div>
                  <div className="text-gray-500">Excellent for analysis</div>
                </div>
                <div className="space-y-1">
                  <div className="font-medium text-cyan-400">Claude 3.5 Haiku</div>
                  <div className="text-gray-500">Fast, efficient</div>
                  <div className="text-gray-500">Cost-effective choice</div>
                </div>
                <div className="space-y-1">
                  <div className="font-medium text-indigo-400">Claude 3 Opus</div>
                  <div className="text-gray-500">Most creative</div>
                  <div className="text-gray-500">Complex tasks</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Test Results */}
      {testResult && (
        <div className={`card ${
          testResult.success 
            ? 'bg-green-900 bg-opacity-20 border-green-700' 
            : 'bg-red-900 bg-opacity-20 border-red-700'
        }`}>
          <div className="flex items-start gap-3">
            {testResult.success ? (
              <CheckCircle className="w-5 h-5 text-green-400 mt-1" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 mt-1" />
            )}
            <div className="flex-1">
              <h4 className={`font-bold mb-2 ${
                testResult.success ? 'text-green-300' : 'text-red-300'
              }`}>
                {testResult.message}
              </h4>
              
              {testResult.success && testResult.details && (
                <div className="text-sm text-green-200 space-y-1">
                  <p>• Pipeline Version: {testResult.details.version || 'Unknown'}</p>
                  <p>• Response Time: {testResult.details.responseTime || 'N/A'}ms</p>
                  <p>• Collections Available: {testResult.details.collections?.length || 0}</p>
                </div>
              )}
              
              {!testResult.success && testResult.error && (
                <div className="text-sm text-red-200">
                  <p><strong>Error:</strong> {testResult.error}</p>
                  <div className="mt-2 text-xs">
                    <p><strong>Troubleshooting:</strong></p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Verify the pipeline URL is correct and accessible</li>
                      <li>Check that the OpenWebUI service is running</li>
                      <li>Ensure the API key matches the pipeline configuration</li>
                      <li>Confirm network connectivity between services</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Statistics */}
      {pipelineStats && (
        <div className="card">
          <h4 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-primary-400" />
            Pipeline Statistics
          </h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatItem 
              label="Total Queries" 
              value={pipelineStats.totalQueries || 0} 
            />
            <StatItem 
              label="Avg Response Time" 
              value={`${pipelineStats.avgResponseTime || 0}ms`} 
            />
            <StatItem 
              label="Cache Hit Rate" 
              value={`${pipelineStats.cacheHitRate || 0}%`} 
            />
            <StatItem 
              label="Uptime" 
              value={pipelineStats.uptime || '0h'} 
            />
          </div>
        </div>
      )}

      {/* Professional OpenWebUI Integration Guide */}
      <div className="space-y-6">
        {/* Quick Setup Card */}
        <div className="card bg-green-900 bg-opacity-20 border-green-700">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-green-400 mt-1" />
            <div className="flex-1">
              <h4 className="font-bold text-green-300 mb-3">✨ OpenWebUI Integration - Ready!</h4>
              <div className="text-sm text-green-200 space-y-3">
                <p>AutoLlama RAG pipeline is built-in and running automatically. No additional services needed!</p>
                
                {/* Copy-Paste Configuration */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-green-800 bg-opacity-30 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-green-300">Pipeline URL</span>
                      <button
                        onClick={() => copyToClipboard(getPreferredUrl(), 'url')}
                        className="p-1 hover:bg-green-700 rounded transition-colors"
                        title="Copy URL"
                      >
                        {copied.url ? (
                          <CheckCircle className="w-4 h-4 text-green-300" />
                        ) : (
                          <Copy className="w-4 h-4 text-green-400" />
                        )}
                      </button>
                    </div>
                    <code className="text-green-100 text-sm break-all">{getPreferredUrl()}</code>
                  </div>
                  
                  <div className="bg-green-800 bg-opacity-30 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-green-300">API Key</span>
                      <button
                        onClick={() => copyToClipboard(formData.apiKey, 'apikey')}
                        className="p-1 hover:bg-green-700 rounded transition-colors"
                        title="Copy API Key"
                      >
                        {copied.apikey ? (
                          <CheckCircle className="w-4 h-4 text-green-300" />
                        ) : (
                          <Copy className="w-4 h-4 text-green-400" />
                        )}
                      </button>
                    </div>
                    <code className="text-green-100 text-sm">{formData.apiKey}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Setup Instructions */}
        <div className="card bg-blue-900 bg-opacity-20 border-blue-700">
          <div className="flex items-start gap-3">
            <ExternalLink className="w-5 h-5 text-blue-400 mt-1" />
            <div className="flex-1">
              <h4 className="font-bold text-blue-300 mb-3">📋 Step-by-Step Setup Guide</h4>
              <div className="text-sm text-blue-200 space-y-4">
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Left Column - OpenWebUI Steps */}
                  <div>
                    <h5 className="font-semibold text-blue-300 mb-2">In OpenWebUI:</h5>
                    <ol className="list-decimal list-inside space-y-2 ml-2">
                      <li>Go to <span className="font-semibold">Admin Panel → Settings → Connections</span></li>
                      <li>Click <span className="font-semibold">"Add OpenAI API Connection"</span></li>
                      <li>Enter the configuration from the boxes above ⬆️</li>
                      <li>Click <span className="font-semibold">"Save"</span></li>
                      <li>Start chatting with your knowledge base! 🎉</li>
                    </ol>
                  </div>
                  
                  {/* Right Column - Alternative URLs */}
                  <div>
                    <h5 className="font-semibold text-blue-300 mb-2">Alternative URLs:</h5>
                    <div className="space-y-2">
                      {getAlternativeUrls().map((url, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <button
                            onClick={() => copyToClipboard(url, `alt-${index}`)}
                            className="p-1 hover:bg-blue-700 rounded transition-colors"
                            title="Copy URL"
                          >
                            {copied[`alt-${index}`] ? (
                              <CheckCircle className="w-3 h-3 text-blue-300" />
                            ) : (
                              <Copy className="w-3 h-3 text-blue-400" />
                            )}
                          </button>
                          <code className="text-xs text-blue-200">{url}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Pro Tips */}
                <div className="mt-4 p-3 bg-blue-800 bg-opacity-30 rounded-lg">
                  <h6 className="font-semibold text-blue-300 mb-2">💡 Pro Tips:</h6>
                  <ul className="text-xs text-blue-200 space-y-1">
                    <li>• The pipeline automatically accesses your processed documents</li>
                    <li>• Use specific questions for better RAG results</li>
                    <li>• Check the Debug Mode setting above for troubleshooting</li>
                    <li>• Alternative URLs work for different network setups</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Troubleshooting Section */}
        <div className="card bg-yellow-900 bg-opacity-20 border-yellow-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 mt-1" />
            <div className="flex-1">
              <h4 className="font-bold text-yellow-300 mb-3">🔧 Troubleshooting</h4>
              <div className="text-sm text-yellow-200 space-y-3">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h6 className="font-semibold text-yellow-300 mb-1">Common Issues:</h6>
                    <ul className="text-xs space-y-1">
                      <li>• <strong>Pipeline not detected:</strong> Try alternative URLs</li>
                      <li>• <strong>Connection failed:</strong> Check API key matches exactly</li>
                      <li>• <strong>No responses:</strong> Ensure documents are processed</li>
                      <li>• <strong>Domain issues:</strong> Use Tailscale hostname instead</li>
                    </ul>
                  </div>
                  <div>
                    <h6 className="font-semibold text-yellow-300 mb-1">Quick Diagnostics:</h6>
                    <div className="space-y-1">
                      <button
                        onClick={testPipeline}
                        disabled={testing}
                        className="text-xs bg-yellow-800 hover:bg-yellow-700 px-2 py-1 rounded transition-colors disabled:opacity-50 block"
                      >
                        {testing ? 'Testing...' : 'Test Pipeline Connection'}
                      </button>
                      <p className="text-xs text-yellow-300">
                        Status: {pipelineStats ? '✅ Ready' : '⚠️ Unknown'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Status Card Component
const StatusCard = ({ title, status, icon: Icon, description }) => {
  const getStatusColor = () => {
    if (typeof status === 'boolean') {
      return status ? 'border-green-500 text-green-400' : 'border-gray-500 text-gray-400';
    }
    return status ? 'border-green-500 text-green-400' : 'border-gray-500 text-gray-400';
  };

  const getStatusIcon = () => {
    if (typeof status === 'boolean') {
      return status ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />;
    }
    return status ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />;
  };

  const getStatusText = () => {
    if (typeof status === 'boolean') {
      return status ? 'Enabled' : 'Disabled';
    }
    return status || 'Not Set';
  };

  return (
    <div className={`p-4 rounded-lg border-2 transition-colors ${getStatusColor()}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="font-medium">{title}</span>
        </div>
        {getStatusIcon()}
      </div>
      <div className="text-xs opacity-80 mb-1">
        {description}
      </div>
      <div className="text-sm font-medium">
        {getStatusText()}
      </div>
    </div>
  );
};

// Stat Item Component
const StatItem = ({ label, value }) => (
  <div className="text-center">
    <div className="text-2xl font-bold text-white">{value}</div>
    <div className="text-sm text-gray-400">{label}</div>
  </div>
);

export default PipelineTab;