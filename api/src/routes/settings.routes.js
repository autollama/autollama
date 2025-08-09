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