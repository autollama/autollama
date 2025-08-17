/**
 * Settings Controller
 * Handles configuration and settings management endpoints
 */

const { logger } = require('../utils/logger');

class SettingsController {
  constructor(services) {
    this.services = services;
    this.logger = logger.child({ component: 'settings-controller' });
  }

  /**
   * Get all settings
   * GET /api/settings
   */
  async getAllSettings(req, res) {
    this.logger.debug('Get all settings requested');
    
    try {
      const db = this.services.database || require('../../database');
      const settings = await db.getApiSettings();
      
      // Return settings with success flag
      res.json({
        success: true,
        settings: settings || {},
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to get settings', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve settings',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Update settings
   * POST /api/settings
   */
  async updateSettings(req, res) {
    this.logger.debug('Update settings requested', { body: req.body });
    
    try {
      const { settings } = req.body;
      
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          message: 'Settings object is required',
          timestamp: new Date().toISOString()
        });
      }

      const db = this.services.database || require('../../database');
      const results = {};
      
      // Update each setting
      for (const [key, value] of Object.entries(settings)) {
        if (value && value.trim && value.trim() !== '') {
          try {
            // Determine if setting should be encrypted (API keys)
            const shouldEncrypt = key.toLowerCase().includes('key') || key.toLowerCase().includes('secret');
            await db.setApiSetting(key, value, shouldEncrypt);
            results[key] = 'updated';
            this.logger.info(`Setting updated: ${key}`, { encrypted: shouldEncrypt });
          } catch (error) {
            this.logger.warn(`Failed to update setting: ${key}`, { error: error.message });
            results[key] = 'failed';
          }
        } else {
          results[key] = 'skipped (empty value)';
        }
      }
      
      res.json({
        success: true,
        message: 'Settings updated successfully',
        results,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to update settings', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to update settings',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get specific setting
   * GET /api/settings/:key
   */
  async getSetting(req, res) {
    const { key } = req.params;
    this.logger.debug('Get specific setting requested', { key });
    
    try {
      const db = this.services.database || require('../../database');
      const value = await db.getApiSetting(key);
      
      res.json({
        success: true,
        key,
        value: value || null,
        exists: value !== null && value !== undefined,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to get setting', {
        key,
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        key,
        error: 'Failed to retrieve setting',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Upload custom favicon
   * POST /api/settings/favicon
   */
  async uploadFavicon(req, res) {
    this.logger.debug('Favicon upload requested', {
      hasFile: !!req.file,
      workingDir: process.cwd(),
      userId: process.getuid(),
      groupId: process.getgid()
    });
    
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
          message: 'Please select a favicon.ico file to upload',
          timestamp: new Date().toISOString()
        });
      }
      
      const file = req.file;
      this.logger.debug('File received', {
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        bufferLength: file.buffer ? file.buffer.length : 0
      });
      
      // Validate file type
      if (!file.originalname.toLowerCase().endsWith('.ico')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file type',
          message: 'Please upload a .ico file only',
          timestamp: new Date().toISOString()
        });
      }
      
      // Validate file size (max 1MB)
      if (file.size > 1024 * 1024) {
        return res.status(400).json({
          success: false,
          error: 'File too large',
          message: 'Favicon file must be under 1MB',
          timestamp: new Date().toISOString()
        });
      }
      
      // Use /app/uploads directory - SHOULD exist from Dockerfile
      const uploadsDir = '/app/uploads';
      this.logger.info(`Using upload directory: ${uploadsDir}, exists: ${fs.existsSync(uploadsDir)}`);
      
      // Directory should exist from Dockerfile, but create if not
      if (!fs.existsSync(uploadsDir)) {
        this.logger.warn(`Upload directory missing, attempting to create: ${uploadsDir}`);
        try {
          fs.mkdirSync(uploadsDir, { recursive: true });
          this.logger.info(`Successfully created upload directory: ${uploadsDir}`);
        } catch (mkdirError) {
          this.logger.error(`Failed to create upload directory: ${mkdirError.message}`);
          return res.status(500).json({
            success: false,
            error: 'Upload directory creation failed',
            message: mkdirError.message,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // Save favicon file (overwrites existing)
      const faviconPath = path.join(uploadsDir, 'favicon.ico');
      this.logger.info(`Writing favicon to: ${faviconPath}`);
      
      try {
        fs.writeFileSync(faviconPath, file.buffer);
        this.logger.info(`Successfully wrote favicon file: ${faviconPath}`);
      } catch (writeError) {
        this.logger.error(`Failed to write favicon file: ${writeError.message}`);
        return res.status(500).json({
          success: false,
          error: 'File write failed',
          message: writeError.message,
          timestamp: new Date().toISOString()
        });
      }
      
      // Update setting to indicate custom favicon is active
      const db = this.services.database || require('../../database');
      await db.setApiSetting('customFavicon', 'true', false);
      
      this.logger.info('Favicon uploaded successfully', {
        originalName: file.originalname,
        size: file.size,
        path: faviconPath
      });
      
      res.json({
        success: true,
        message: 'Favicon uploaded successfully',
        file: {
          originalName: file.originalname,
          size: file.size,
          uploadTime: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to upload favicon', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to upload favicon',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Reset favicon to default
   * DELETE /api/settings/favicon
   */
  async resetFavicon(req, res) {
    this.logger.debug('Favicon reset requested');
    
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Remove custom favicon file if it exists
      const faviconPath = '/app/uploads/favicon.ico';
      if (fs.existsSync(faviconPath)) {
        fs.unlinkSync(faviconPath);
      }
      
      // Update setting to indicate no custom favicon
      const db = this.services.database || require('../../database');
      await db.setApiSetting('customFavicon', 'false', false);
      
      this.logger.info('Favicon reset to default');
      
      res.json({
        success: true,
        message: 'Favicon reset to default successfully',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to reset favicon', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to reset favicon',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Test connections with current settings
   * POST /api/settings/test-connections
   */
  async testConnections(req, res) {
    this.logger.debug('Test connections requested');
    
    try {
      const db = this.services.database || require('../../database');
      const dbSettings = await db.getApiSettings();
      
      // Use settings from request body if provided, fallback to database settings
      const frontendConnections = req.body?.connections || {};
      const settings = {
        // Merge database settings with frontend overrides
        ...dbSettings,
        // Map frontend camelCase to backend snake_case
        openai_api_key: frontendConnections.openaiApiKey || dbSettings.openai_api_key,
        qdrant_url: frontendConnections.qdrantUrl || dbSettings.qdrant_url,
        qdrant_api_key: frontendConnections.qdrantApiKey || dbSettings.qdrant_api_key,
      };
      
      const results = {
        openai: false,
        qdrant: false,
      };

      // Test OpenAI connection - Direct API call
      if (settings.openai_api_key) {
        try {
          const axios = require('axios');
          const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 1
          }, {
            headers: {
              'Authorization': `Bearer ${settings.openai_api_key}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          });
          results.openai = response.status === 200;
          this.logger.debug('OpenAI connection test passed');
        } catch (error) {
          this.logger.warn('OpenAI connection test failed', { error: error.message });
          // Check if it's an auth error vs connection error
          results.openai = error.response?.status === 401 ? false : false;
        }
      }

      // Test Qdrant connection - Direct API call
      if (settings.qdrant_url && settings.qdrant_api_key) {
        try {
          const axios = require('axios');
          const cleanUrl = settings.qdrant_url.replace(/\/+$/, ''); // Remove trailing slashes
          const response = await axios.get(`${cleanUrl}/collections`, {
            headers: {
              'api-key': settings.qdrant_api_key,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          });
          results.qdrant = response.status === 200;
          this.logger.debug('Qdrant connection test passed');
        } catch (error) {
          this.logger.warn('Qdrant connection test failed', { error: error.message });
          results.qdrant = false;
        }
      }

      const successCount = Object.values(results).filter(Boolean).length;
      const totalCount = Object.keys(results).length;

      res.json({
        success: true,
        connections: results,
        summary: {
          successful: successCount,
          total: totalCount,
          success_rate: Math.round((successCount / totalCount) * 100)
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Connection test failed', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        error: 'Connection test failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get RAG settings
   * GET /api/settings/rag
   */
  async getRagSettings(req, res) {
    this.logger.debug('Get RAG settings requested');
    
    try {
      const db = this.services.database || require('../../database');
      const ragSettings = await db.getRagSettings();
      
      res.json({
        success: true,
        settings: ragSettings,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to get RAG settings', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve RAG settings',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Update RAG settings
   * PUT /api/settings/rag
   */
  async updateRagSettings(req, res) {
    this.logger.debug('Update RAG settings requested', { body: req.body });
    
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

      const db = this.services.database || require('../../database');
      const result = await db.updateRagSettings(ragSettings);
      
      // Log the update
      this.logger.info('RAG settings updated', {
        updated: result.updated,
        settings: ragSettings
      });
      
      res.json({
        success: true,
        message: 'RAG settings updated successfully',
        updated: result.updated,
        settings: await db.getRagSettings(), // Return updated settings
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to update RAG settings', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to update RAG settings',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = SettingsController;