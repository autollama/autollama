// Settings management utility for AutoLlama frontend
class SettingsManager {
  constructor() {
    this.storageKey = 'autollama-settings';
    this.defaultSettings = {
      // Connection settings
      connections: {
        openaiApiKey: '',
        claudeApiKey: '',
        qdrantUrl: '',
        qdrantApiKey: '',
        databaseUrl: '',
        testConnections: false,
      },
      
      // OpenWebUI Pipeline settings
      pipeline: {
        pipelineUrl: 'http://autollama-on-hstgr:9099',
        apiKey: '0p3n-w3bu!',
        collectionName: 'autollama-content',
        maxResults: 5,
        similarityThreshold: 0.3,
        debugMode: true,
      },
      
      // Processing settings
      processing: {
        enableContextualEmbeddings: true,
        contextualModel: 'gpt-4o-mini',
        contextBatchSize: 5,
        chunkSize: 1200,
        chunkOverlap: 200,
        processingTimeout: 30000,
        autoStartProcessing: true, // Auto-start file processing after upload
      },
      
      // System settings
      system: {
        theme: 'dark',
        sseUpdateInterval: 5000,
        cacheTimeout: 300000, // 5 minutes
        debugLogging: true,
        showProcessingDetails: true,
        autoRefreshDocuments: true,
      },
      
      // Search settings
      search: {
        enableBM25: true,
        enableSemantic: true,
        hybridSearchWeight: 0.5, // 0 = full BM25, 1 = full semantic
        maxSearchResults: 20,
        searchTimeout: 10000,
        enableSearchHistory: true,
      },
      
      // UI preferences
      ui: {
        documentsPerPage: 50,
        chunksPerRow: 10,
        showVectorHeatmaps: true,
        showContextualSummaries: true,
        animationsEnabled: true,
        compactMode: false,
        customFavicon: false,
        faviconUploadTime: null,
      }
    };
  }

  // Load settings from localStorage with fallbacks
  loadSettings() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsedSettings = JSON.parse(stored);
        // Merge with defaults to ensure all keys exist
        return this.mergeWithDefaults(parsedSettings);
      }
    } catch (error) {
      console.error('❌ Failed to load settings:', error);
    }
    
    return { ...this.defaultSettings };
  }

  // Load settings from database API
  async loadSettingsFromDatabase() {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.settings) {
          // Map database settings to frontend settings format
          const dbSettings = data.settings;
          const mappedSettings = { ...this.defaultSettings };
          
          // Map database keys to frontend format
          if (dbSettings.openai_api_key) {
            mappedSettings.connections.openaiApiKey = dbSettings.openai_api_key;
          }
          if (dbSettings.claude_api_key) {
            mappedSettings.connections.claudeApiKey = dbSettings.claude_api_key;
          }
          if (dbSettings.qdrant_url) {
            mappedSettings.connections.qdrantUrl = dbSettings.qdrant_url;
          }
          if (dbSettings.qdrant_api_key) {
            mappedSettings.connections.qdrantApiKey = dbSettings.qdrant_api_key;
          }
          if (dbSettings.database_url) {
            mappedSettings.connections.databaseUrl = dbSettings.database_url;
          }
          
          console.log('✅ Settings loaded from database');
          return mappedSettings;
        }
      }
    } catch (error) {
      console.error('❌ Failed to load settings from database:', error);
    }
    
    // Fallback to localStorage if database fails
    return this.loadSettings();
  }

  // Save settings to localStorage
  saveSettings(settings) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(settings));
      console.log('✅ Settings saved successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to save settings:', error);
      return false;
    }
  }

  // Save connection settings to database
  async saveConnectionsToDatabase(connections) {
    try {
      // Map frontend settings to database format
      const dbSettings = {};
      
      if (connections.openaiApiKey && connections.openaiApiKey.trim()) {
        dbSettings.openai_api_key = connections.openaiApiKey;
      }
      if (connections.claudeApiKey && connections.claudeApiKey.trim()) {
        dbSettings.claude_api_key = connections.claudeApiKey;
      }
      if (connections.qdrantUrl && connections.qdrantUrl.trim()) {
        dbSettings.qdrant_url = connections.qdrantUrl;
      }
      if (connections.qdrantApiKey && connections.qdrantApiKey.trim()) {
        dbSettings.qdrant_api_key = connections.qdrantApiKey;
      }
      if (connections.databaseUrl && connections.databaseUrl.trim()) {
        dbSettings.database_url = connections.databaseUrl;
      }
      
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings: dbSettings }),
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Connection settings saved to database:', data.updated);
        return true;
      } else {
        const error = await response.json();
        console.error('❌ Failed to save settings to database:', error.error);
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to save settings to database:', error);
      return false;
    }
  }

  // Merge stored settings with defaults to handle version changes
  mergeWithDefaults(stored) {
    const merged = { ...this.defaultSettings };
    
    Object.keys(stored).forEach(category => {
      if (merged[category] && typeof merged[category] === 'object') {
        merged[category] = { ...merged[category], ...stored[category] };
      } else {
        merged[category] = stored[category];
      }
    });
    
    return merged;
  }

  // Get a specific setting value
  getSetting(category, key) {
    const settings = this.loadSettings();
    return settings[category]?.[key];
  }

  // Update a specific setting
  updateSetting(category, key, value) {
    const settings = this.loadSettings();
    if (!settings[category]) {
      settings[category] = {};
    }
    settings[category][key] = value;
    return this.saveSettings(settings);
  }

  // Update multiple settings in a category
  updateCategory(category, updates) {
    const settings = this.loadSettings();
    settings[category] = { ...settings[category], ...updates };
    return this.saveSettings(settings);
  }

  // Reset settings to defaults
  resetSettings() {
    try {
      localStorage.removeItem(this.storageKey);
      console.log('✅ Settings reset to defaults');
      return true;
    } catch (error) {
      console.error('❌ Failed to reset settings:', error);
      return false;
    }
  }

  // Export settings as JSON
  exportSettings() {
    const settings = this.loadSettings();
    const dataStr = JSON.stringify(settings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `autollama-settings-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  }

  // Import settings from JSON file
  async importSettings(file) {
    try {
      const text = await file.text();
      const importedSettings = JSON.parse(text);
      const mergedSettings = this.mergeWithDefaults(importedSettings);
      
      if (this.saveSettings(mergedSettings)) {
        console.log('✅ Settings imported successfully');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Failed to import settings:', error);
      return false;
    }
  }

  // Validate connection settings
  async validateConnections(settings = null) {
    const config = settings || this.loadSettings();
    
    try {
      // Use the backend API to test connections properly
      const response = await fetch('/api/settings/test-connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connections: config.connections
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Connection test results from backend:', result);
        
        // Return only the connections we care about
        return {
          openai: result.connections?.openai || false,
          qdrant: result.connections?.qdrant || false,
        };
      } else {
        console.error('❌ Backend connection test failed:', response.status);
        return {
          openai: false,
          qdrant: false,
        };
      }
    } catch (error) {
      console.error('❌ Connection validation failed:', error);
      return {
        openai: false,
        qdrant: false,
      };
    }
  }

  // Mode switching methods for v2.3.4 Pure Local Mode
  async getModeInfo() {
    try {
      const response = await fetch('/api/config/mode');
      if (response.ok) {
        const result = await response.json();
        return result.mode;
      }
      throw new Error('Failed to get mode info');
    } catch (error) {
      console.error('❌ Failed to get mode info:', error);
      return {
        mode: 'unknown',
        locked: false,
        changeable: false,
        description: 'Unable to determine deployment mode'
      };
    }
  }

  async getModeStatus() {
    try {
      const response = await fetch('/api/config/mode/status');
      if (response.ok) {
        const result = await response.json();
        return result;
      }
      throw new Error('Failed to get mode status');
    } catch (error) {
      console.error('❌ Failed to get mode status:', error);
      return {
        mode: { mode: 'unknown' },
        configValid: false,
        configError: 'Unable to check mode status'
      };
    }
  }

  async switchMode(newMode) {
    try {
      const response = await fetch('/api/config/mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: newMode })
      });
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('❌ Failed to switch mode:', error);
      return {
        success: false,
        error: 'Failed to switch deployment mode',
        message: error.message
      };
    }
  }

  // Mode-aware connection validation
  async validateConnectionsForMode(mode, settings = null) {
    const config = settings || this.loadSettings();
    
    if (mode === 'local') {
      // Local mode validation - only OpenAI needed
      return {
        openai: !!(config.connections?.openaiApiKey),
        qdrant: true, // Local Qdrant doesn't need API validation
        mode: 'local'
      };
    } else {
      // Cloud mode validation - use existing method
      const result = await this.validateConnections(config);
      return {
        ...result,
        mode: 'cloud'
      };
    }
  }
}

// Create singleton instance
const settingsManager = new SettingsManager();

export default settingsManager;