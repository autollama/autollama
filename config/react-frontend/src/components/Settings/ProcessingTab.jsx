import React, { useState, useEffect } from 'react';
import { Brain, Cpu, Zap, Settings, BarChart3, Clock, DollarSign, Layers } from 'lucide-react';
import { useAppContext } from '../../App';
import { useAPI } from '../../hooks/useAPI';

const ProcessingTab = ({ onSettingsChange }) => {
  const { settings, updateCategory } = useAppContext();
  const api = useAPI();
  const [formData, setFormData] = useState(settings.processing);
  const [costEstimate, setCostEstimate] = useState(null);
  const [chunkingSettings, setChunkingSettings] = useState({ chunk_size: 1200, overlap_size: 200 });
  const [chunkingLoading, setChunkingLoading] = useState(false);
  const [chunkingSaving, setChunkingSaving] = useState(false);

  // Load chunking settings on component mount
  useEffect(() => {
    loadChunkingSettings();
  }, []);

  // Update form data when settings change
  useEffect(() => {
    setFormData(settings.processing);
    calculateCostEstimate();
  }, [settings.processing]);

  // Load chunking settings from database
  const loadChunkingSettings = async () => {
    setChunkingLoading(true);
    try {
      const data = await api.settings.getChunkingSettings();
      setChunkingSettings(data);
    } catch (error) {
      console.error('Failed to load chunking settings:', error);
      // Keep default values on error
    } finally {
      setChunkingLoading(false);
    }
  };

  // Save chunking settings to database
  const saveChunkingSettings = async (newSettings) => {
    setChunkingSaving(true);
    try {
      const savedSettings = await api.settings.updateChunkingSettings(newSettings);
      setChunkingSettings(savedSettings);
      onSettingsChange && onSettingsChange();
      
      // Show success feedback
      // You could add a toast notification here
      console.log('Chunking settings saved successfully');
    } catch (error) {
      console.error('Failed to save chunking settings:', error);
      // Could show error feedback here
    } finally {
      setChunkingSaving(false);
    }
  };

  // Handle input changes
  const handleInputChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    updateCategory('processing', newData);
    onSettingsChange();
  };

  // Handle chunking settings changes
  const handleChunkingChange = (field, value) => {
    const newSettings = { ...chunkingSettings, [field]: value };
    setChunkingSettings(newSettings);
    
    // Auto-save after a delay to avoid too many API calls
    clearTimeout(window.chunkingTimeout);
    window.chunkingTimeout = setTimeout(() => {
      saveChunkingSettings(newSettings);
    }, 1000);
  };

  // Calculate cost estimates
  const calculateCostEstimate = () => {
    const avgDocumentTokens = 50000; // Average document size in tokens
    const contextualCostPer1M = 1.02; // Cost per million tokens for context generation
    const embeddingCostPer1M = 0.13; // Cost per million tokens for embeddings
    
    const contextualCost = formData.enableContextualEmbeddings 
      ? (avgDocumentTokens / 1000000) * contextualCostPer1M
      : 0;
    
    const embeddingCost = (avgDocumentTokens / 1000000) * embeddingCostPer1M;
    const totalPerDocument = contextualCost + embeddingCost;
    
    setCostEstimate({
      perDocument: totalPerDocument,
      contextual: contextualCost,
      embedding: embeddingCost,
      perMonth: totalPerDocument * 100, // Assuming 100 documents per month
    });
  };

  // Model options
  const modelOptions = [
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      description: 'Fast and cost-effective, recommended for most use cases',
      costPer1M: 0.15,
      speed: 'Fast',
      quality: 'High',
      recommended: true,
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      description: 'Most capable model with superior reasoning',
      costPer1M: 5.00,
      speed: 'Medium',
      quality: 'Highest',
      recommended: false,
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      description: 'Legacy model, lower cost but reduced quality',
      costPer1M: 0.50,
      speed: 'Very Fast',
      quality: 'Medium',
      recommended: false,
    },
  ];

  const currentModel = modelOptions.find(m => m.id === formData.contextualModel) || modelOptions[0];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h3 className="text-2xl font-bold flex items-center gap-3">
          <Brain className="w-6 h-6 text-primary-400" />
          Processing Configuration
        </h3>
        <p className="text-gray-400 mt-1">
          Configure AI models, contextual embeddings, and processing parameters
        </p>
      </div>

      {/* Processing Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <OverviewCard
          title="Contextual AI"
          value={formData.enableContextualEmbeddings ? 'ON' : 'OFF'}
          icon={Brain}
          status={formData.enableContextualEmbeddings}
          description="Enhanced document understanding"
        />
        <OverviewCard
          title="AI Model"
          value={currentModel.name}
          icon={Cpu}
          status={true}
          description="Analysis and context generation"
        />
        <OverviewCard
          title="Batch Size"
          value={formData.contextBatchSize}
          icon={Layers}
          status={true}
          description="Concurrent processing chunks"
        />
        <OverviewCard
          title="Est. Cost"
          value={costEstimate ? `$${costEstimate.perDocument.toFixed(3)}` : '...'}
          icon={DollarSign}
          status={true}
          description="Per document processing"
        />
      </div>

      {/* Contextual Embeddings Configuration */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h4 className="text-lg font-bold flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary-400" />
              Contextual Embeddings (v2.0 Feature)
            </h4>
            <p className="text-gray-400 text-sm mt-1">
              Generate document-aware summaries for each chunk to improve retrieval accuracy by 35-60%
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.enableContextualEmbeddings}
                onChange={(e) => handleInputChange('enableContextualEmbeddings', e.target.checked)}
                className="w-5 h-5 rounded"
              />
              <span className="font-medium">Enable Contextual Processing</span>
            </label>
          </div>
        </div>

        {formData.enableContextualEmbeddings && (
          <div className="space-y-6 pt-4 border-t border-gray-700">
            {/* Model Selection */}
            <div className="space-y-4">
              <h5 className="font-medium text-gray-300">AI Model for Context Generation</h5>
              <div className="grid grid-cols-1 gap-3">
                {modelOptions.map((model) => (
                  <label
                    key={model.id}
                    className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                      formData.contextualModel === model.id
                        ? 'border-primary-500 bg-primary-600 bg-opacity-10'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="contextualModel"
                      value={model.id}
                      checked={formData.contextualModel === model.id}
                      onChange={(e) => handleInputChange('contextualModel', e.target.value)}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{model.name}</span>
                        {model.recommended && (
                          <span className="px-2 py-1 bg-green-600 bg-opacity-20 text-green-300 text-xs rounded-full">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{model.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>Cost: ${model.costPer1M}/1M tokens</span>
                        <span>Speed: {model.speed}</span>
                        <span>Quality: {model.quality}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Performance Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Context Generation Batch Size
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={formData.contextBatchSize}
                    onChange={(e) => handleInputChange('contextBatchSize', parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono bg-gray-800 px-2 py-1 rounded w-12 text-center">
                    {formData.contextBatchSize}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Number of chunks to process simultaneously (higher = faster but more expensive)
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Processing Timeout (seconds)
                </label>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={formData.processingTimeout / 1000}
                  onChange={(e) => handleInputChange('processingTimeout', parseInt(e.target.value) * 1000)}
                  className="input-primary"
                />
                <p className="text-xs text-gray-500">
                  Maximum time to wait for AI processing per batch
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Document Chunking Configuration */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h4 className="text-lg font-bold flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary-400" />
              Document Chunking Settings
            </h4>
            <p className="text-gray-400 text-sm mt-1">
              Configure how documents are split into chunks for processing (saved to database)
            </p>
          </div>
          
          {chunkingLoading && (
            <div className="text-sm text-gray-400">Loading...</div>
          )}
          {chunkingSaving && (
            <div className="text-sm text-yellow-400 flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              Saving...
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Chunk Size (characters)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="100"
                max="5000"
                step="100"
                value={chunkingSettings.chunk_size}
                onChange={(e) => handleChunkingChange('chunk_size', parseInt(e.target.value))}
                className="flex-1"
                disabled={chunkingLoading}
              />
              <span className="text-sm font-mono bg-gray-800 px-2 py-1 rounded w-16 text-center">
                {chunkingSettings.chunk_size}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Target size for each text chunk (100-5000 chars, recommended: 1200)
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Chunk Overlap (characters)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max={Math.max(0, chunkingSettings.chunk_size - 100)}
                step="25"
                value={chunkingSettings.overlap_size}
                onChange={(e) => handleChunkingChange('overlap_size', parseInt(e.target.value))}
                className="flex-1"
                disabled={chunkingLoading}
              />
              <span className="text-sm font-mono bg-gray-800 px-2 py-1 rounded w-16 text-center">
                {chunkingSettings.overlap_size}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Character overlap between chunks (0 to {Math.max(0, chunkingSettings.chunk_size - 100)}, recommended: 200)
            </p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-900 bg-opacity-20 rounded-lg border border-blue-700">
          <div className="text-sm text-blue-200">
            <strong>Processing Flow Preview:</strong> With current settings, a 10,000 character document will be split into approximately{' '}
            <span className="font-mono bg-blue-800 px-1 rounded">
              {Math.ceil(10000 / Math.max(1, chunkingSettings.chunk_size - chunkingSettings.overlap_size))}
            </span>{' '}
            chunks with{' '}
            <span className="font-mono bg-blue-800 px-1 rounded">
              {chunkingSettings.overlap_size}
            </span>{' '}
            character overlap for context preservation.
          </div>
          <div className="text-xs text-gray-400 mt-2">
            • Settings apply to new document processing only (existing chunks unchanged)
            • Changes are automatically saved after 1 second of inactivity
            • Larger chunks = better context but less precise search results
          </div>
        </div>
      </div>

      {/* Cost Analysis */}
      {costEstimate && (
        <div className="card">
          <h4 className="text-lg font-bold mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary-400" />
            Cost Analysis
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-gray-800 bg-opacity-50 rounded-lg">
              <div className="text-2xl font-bold text-green-400">
                ${costEstimate.embedding.toFixed(4)}
              </div>
              <div className="text-sm text-gray-400">Embedding Cost</div>
            </div>
            
            <div className="text-center p-4 bg-gray-800 bg-opacity-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">
                ${costEstimate.contextual.toFixed(4)}
              </div>
              <div className="text-sm text-gray-400">Contextual Cost</div>
            </div>
            
            <div className="text-center p-4 bg-gray-800 bg-opacity-50 rounded-lg">
              <div className="text-2xl font-bold text-white">
                ${costEstimate.perDocument.toFixed(4)}
              </div>
              <div className="text-sm text-gray-400">Total Per Document</div>
            </div>
            
            <div className="text-center p-4 bg-gray-800 bg-opacity-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-400">
                ${costEstimate.perMonth.toFixed(2)}
              </div>
              <div className="text-sm text-gray-400">Est. Monthly (100 docs)</div>
            </div>
          </div>

          <div className="text-sm text-gray-400 space-y-1">
            <p>• Costs are estimates based on current OpenAI pricing</p>
            <p>• Contextual embeddings add significant value but increase processing cost</p>
            <p>• Actual costs depend on document size and complexity</p>
            <p>• Consider using prompt caching for repeated processing to reduce costs by up to 90%</p>
          </div>
        </div>
      )}

      {/* Performance Impact Notice */}
      <div className="card bg-yellow-900 bg-opacity-20 border-yellow-700">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-yellow-400 mt-1" />
          <div>
            <h4 className="font-bold text-yellow-300 mb-2">Performance Impact</h4>
            <div className="text-sm text-yellow-200 space-y-1">
              <p>• <strong>Contextual Embeddings ON:</strong> ~2-3 seconds per chunk, 35-60% better retrieval accuracy</p>
              <p>• <strong>Contextual Embeddings OFF:</strong> ~0.5 seconds per chunk, standard accuracy</p>
              <p>• <strong>Batch Size:</strong> Higher values increase speed but use more API quota simultaneously</p>
              <p>• <strong>Chunk Size:</strong> Larger chunks provide more context but may dilute specific information</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Overview Card Component
const OverviewCard = ({ title, value, icon: Icon, status, description }) => {
  const getStatusColor = () => {
    if (typeof status === 'boolean') {
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

export default ProcessingTab;