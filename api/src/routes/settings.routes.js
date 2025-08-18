/**
 * Settings Management Routes
 * Handles configuration and settings endpoints
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();

// Configure multer for favicon uploads (memory storage)
const faviconUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024, // 1MB limit for favicon
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Only allow .ico files
    if (file.originalname.toLowerCase().endsWith('.ico')) {
      cb(null, true);
    } else {
      cb(new Error('Only .ico files are allowed'), false);
    }
  }
});

// Initialize controller with services (set during route setup)
let settingsController = null;

/**
 * Route definitions for settings management:
 * 
 * GET /settings - Get all settings
 * POST /settings - Update settings
 * GET /settings/:key - Get specific setting
 * POST /settings/test-connections - Test connections
 */

// Controller integration
const SettingsController = require('../controllers/settings.controller');

// Use controller-based handlers
router.get('/settings', async (req, res) => {
  if (settingsController) {
    return settingsController.getAllSettings(req, res);
  }
  
  // Fallback if controller not initialized
  console.log('⚙️ Get all settings requested (fallback)');
  try {
    const db = require('../../database');
    const settings = await db.getApiSettings();
    res.json({
      success: true,
      settings: settings || {},
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to get settings:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve settings',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/settings', async (req, res) => {
  if (settingsController) {
    return settingsController.updateSettings(req, res);
  }
  
  // Fallback if controller not initialized  
  console.log('⚙️ Update settings requested (fallback)');
  res.status(500).json({
    success: false,
    error: 'Controller not initialized',
    timestamp: new Date().toISOString()
  });
});

// Debug middleware specifically for settings routes
router.use((req, res, next) => {
  console.log('📋 Settings route middleware hit:', req.method, req.url, req.path);
  next();
});

// Test endpoint to verify RAG settings functionality
router.get('/test-rag-settings', async (req, res) => {
  console.log('🧪 RAG settings test endpoint hit, controller initialized:', !!settingsController);
  
  try {
    const db = require('../../database');
    const ragSettings = await db.getRagSettings();
    
    res.json({
      success: true,
      message: 'RAG settings test successful',
      settings: ragSettings,
      controllerInitialized: !!settingsController,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('🧪 RAG settings test error:', error.message);
    res.status(500).json({
      success: false,
      error: 'RAG settings test failed',
      message: error.message,
      controllerInitialized: !!settingsController,
      timestamp: new Date().toISOString()
    });
  }
});

// RAG-specific settings endpoints (MUST come BEFORE generic /settings/:key route)
router.get('/settings/rag', async (req, res) => {
  console.log('🎯 RAG GET endpoint hit, controller initialized:', !!settingsController);
  
  try {
    const db = require('../../database');
    const ragSettings = await db.getRagSettings();
    
    res.json({
      success: true,
      settings: ragSettings,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to get RAG settings:', error.message);
    
    // Fallback with defaults
    res.json({
      success: true,
      settings: {
        ragModel: 'gpt-4o-mini',
        ragMaxTokens: 1000,
        ragTemperature: 0.7,
        searchLimit: 5
      },
      timestamp: new Date().toISOString()
    });
  }
});

router.put('/settings/rag', async (req, res) => {
  console.log('🎯 RAG PUT endpoint hit, controller initialized:', !!settingsController);
  
  try {
    const ragSettings = req.body;
    
    if (!ragSettings || typeof ragSettings !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        message: 'RAG settings object is required',
        timestamp: new Date().toISOString()
      });
    }
    
    const db = require('../../database');
    const result = await db.updateRagSettings(ragSettings);
    
    console.log('✅ RAG settings updated successfully');
    
    res.json({
      success: true,
      message: 'RAG settings updated successfully',
      updated: result.updated,
      settings: await db.getRagSettings(), // Return updated settings
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to update RAG settings:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update RAG settings',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/settings/:key', async (req, res) => {
  if (settingsController) {
    return settingsController.getSetting(req, res);
  }
  
  // Fallback if controller not initialized
  const { key } = req.params;
  console.log('⚙️ Get specific setting requested (fallback):', key);
  
  try {
    const db = require('../../database');
    const value = await db.getApiSetting(key);
    
    res.json({
      success: true,
      key,
      value: value || null,
      exists: value !== null && value !== undefined,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to get setting:', error.message);
    res.status(500).json({
      success: false,
      key,
      error: 'Failed to retrieve setting',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/settings/test-connections', async (req, res) => {
  if (settingsController) {
    return settingsController.testConnections(req, res);
  }
  
  // Fallback implementation if controller not initialized
  res.json({
    success: false,
    connections: {
      database: false,
      openai: false,
      qdrant: false,
      bm25: false
    },
    error: 'Controller not initialized',
    timestamp: new Date().toISOString()
  });
});

// Test Claude API connection endpoint
router.post('/test-claude', async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required'
      });
    }

    console.log('🧪 Testing Claude API connection...');

    // Import axios for HTTP requests
    const axios = require('axios');

    // Test the Claude API with a simple request
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      timeout: 10000 // 10 second timeout
    });

    if (response.status === 200 && response.data) {
      console.log('✅ Claude API test successful');
      res.json({
        success: true,
        message: 'Claude API connection successful',
        model: 'claude-3-5-haiku-20241022',
        response_id: response.data.id
      });
    } else {
      throw new Error('Unexpected response from Claude API');
    }

  } catch (error) {
    console.error('❌ Claude API test failed:', error.message);
    
    let errorMessage = 'Unknown error';
    let statusCode = 500;
    
    if (error.response) {
      statusCode = error.response.status;
      if (error.response.status === 401) {
        errorMessage = 'Invalid API key - please check your Anthropic API key';
      } else if (error.response.status === 403) {
        errorMessage = 'API key does not have permission to access Claude models';
      } else if (error.response.status === 429) {
        errorMessage = 'Rate limit exceeded - please try again later';
      } else {
        errorMessage = error.response.data?.error?.message || `HTTP ${error.response.status} error`;
      }
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Connection timeout - please check your internet connection';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Unable to reach Anthropic API - please check your internet connection';
    } else {
      errorMessage = error.message;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: error.response?.data || null
    });
  }
});

// Favicon upload endpoint with error handling
router.post('/settings/favicon', (req, res) => {
  // Handle multer upload with custom error handling
  faviconUpload.single('favicon')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        error: 'File upload error',
        message: err.message,
        timestamp: new Date().toISOString()
      });
    }
    
    // No multer error, proceed with controller
    if (settingsController) {
      return settingsController.uploadFavicon(req, res);
    }
    
    res.status(500).json({
      success: false,
      error: 'Controller not initialized',
      timestamp: new Date().toISOString()
    });
  });
});

// Favicon reset endpoint
router.delete('/settings/favicon', async (req, res) => {
  if (settingsController) {
    return settingsController.resetFavicon(req, res);
  }
  
  res.status(500).json({
    success: false,
    error: 'Controller not initialized',
    timestamp: new Date().toISOString()
  });
});

// Mode switching endpoints for v2.3.4 Pure Local Mode
router.get('/config/mode', async (req, res) => {
  try {
    console.log('🔧 Get deployment mode info requested');
    
    const { getModeInfo } = require('../config/database.config');
    const modeInfo = getModeInfo();
    
    res.json({
      success: true,
      mode: modeInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to get mode info:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve mode information',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/config/mode', async (req, res) => {
  try {
    const { mode } = req.body;
    console.log(`🔄 Mode switch requested: ${mode}`);
    
    if (!mode || !['local', 'cloud'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid mode. Must be "local" or "cloud"',
        timestamp: new Date().toISOString()
      });
    }
    
    const { isModeChangeable, getModeInfo } = require('../config/database.config');
    const envManager = require('../utils/env-manager');
    
    if (!isModeChangeable()) {
      return res.status(403).json({
        success: false,
        error: 'Mode switching is locked. Set VECTOR_DB_MODE_LOCKED=false to enable switching.',
        timestamp: new Date().toISOString()
      });
    }

    const currentMode = getModeInfo().mode;
    if (currentMode === mode) {
      return res.json({
        success: true,
        message: `Already in ${mode} mode`,
        currentMode: getModeInfo(),
        changed: false,
        timestamp: new Date().toISOString()
      });
    }
    
    // Actually update the environment file
    try {
      await envManager.updateVectorDbMode(mode);
      
      // Verify the change was applied
      const updatedModeInfo = getModeInfo();
      
      res.json({
        success: true,
        message: `Mode successfully switched to ${mode}`,
        previousMode: currentMode,
        currentMode: updatedModeInfo,
        changed: true,
        persistent: true,
        instructions: [
          `Mode switched from ${currentMode} to ${mode}`,
          'Change has been saved to environment file',
          'New mode is active immediately',
          'Refresh the page to see updated data isolation'
        ],
        timestamp: new Date().toISOString()
      });
      
    } catch (envError) {
      console.error('❌ Failed to update environment file:', envError.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to persist mode change',
        message: envError.message,
        fallback: {
          instructions: [
            `Manually set VECTOR_DB_MODE=${mode} in your .env file`,
            'Restart the application to apply the new mode',
            'Verify the mode change in Settings → Connections'
          ]
        },
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Failed to switch mode:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to switch deployment mode',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/config/mode/status', async (req, res) => {
  try {
    console.log('📊 Mode status check requested');
    
    const { getModeInfo, validateModeConfiguration } = require('../config/database.config');
    
    let modeInfo = getModeInfo();
    let configValid = false;
    let configError = null;
    
    try {
      validateModeConfiguration();
      configValid = true;
    } catch (validationError) {
      configError = validationError.message;
    }
    
    res.json({
      success: true,
      mode: modeInfo,
      configValid,
      configError,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to get mode status:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve mode status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Initialize settings routes with services
 * @param {Object} services - Service container
 */
function initializeSettingsRoutes(services) {
  console.log('🚀 Initializing settings controller with services:', !!services);
  settingsController = new SettingsController(services);
  console.log('✅ Settings controller initialized:', !!settingsController);
}

module.exports = router;
module.exports.initializeSettingsRoutes = initializeSettingsRoutes;