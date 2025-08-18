/**
 * Environment File Manager
 * Handles reading and writing .env files for persistent configuration changes
 * Used for mode switching and dynamic environment variable updates
 */

const fs = require('fs').promises;
const path = require('path');

class EnvManager {
  constructor() {
    this.envPath = path.join(process.cwd(), '.env');
    this.backupPath = path.join(process.cwd(), '.env.backup');
  }

  /**
   * Read and parse the .env file
   * @returns {Object} Parsed environment variables
   */
  async readEnvFile() {
    try {
      const content = await fs.readFile(this.envPath, 'utf8');
      const parsed = {};
      
      const lines = content.split('\n');
      for (const line of lines) {
        // Skip comments and empty lines
        if (line.trim() === '' || line.trim().startsWith('#')) {
          continue;
        }
        
        // Parse key=value pairs
        const equalIndex = line.indexOf('=');
        if (equalIndex > 0) {
          const key = line.substring(0, equalIndex).trim();
          const value = line.substring(equalIndex + 1).trim();
          parsed[key] = value;
        }
      }
      
      return parsed;
    } catch (error) {
      console.error('❌ Failed to read .env file:', error.message);
      throw new Error(`Failed to read environment file: ${error.message}`);
    }
  }

  /**
   * Update specific environment variables in the .env file
   * @param {Object} updates - Key-value pairs to update
   * @returns {boolean} Success status
   */
  async updateEnvFile(updates) {
    try {
      // Create backup first
      await this.createBackup();
      
      // Read current content
      const content = await fs.readFile(this.envPath, 'utf8');
      const lines = content.split('\n');
      const updatedLines = [];
      const processedKeys = new Set();
      
      // Process existing lines
      for (const line of lines) {
        if (line.trim() === '' || line.trim().startsWith('#')) {
          // Keep comments and empty lines as-is
          updatedLines.push(line);
          continue;
        }
        
        const equalIndex = line.indexOf('=');
        if (equalIndex > 0) {
          const key = line.substring(0, equalIndex).trim();
          
          if (updates.hasOwnProperty(key)) {
            // Update this key with new value
            updatedLines.push(`${key}=${updates[key]}`);
            processedKeys.add(key);
          } else {
            // Keep existing line unchanged
            updatedLines.push(line);
          }
        } else {
          // Keep malformed lines as-is
          updatedLines.push(line);
        }
      }
      
      // Add any new keys that weren't in the original file
      for (const [key, value] of Object.entries(updates)) {
        if (!processedKeys.has(key)) {
          updatedLines.push(`${key}=${value}`);
        }
      }
      
      // Write updated content
      const updatedContent = updatedLines.join('\n');
      await fs.writeFile(this.envPath, updatedContent, 'utf8');
      
      console.log('✅ Environment file updated successfully');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to update .env file:', error.message);
      
      // Attempt to restore backup
      try {
        await this.restoreBackup();
        console.log('🔄 Restored .env file from backup');
      } catch (restoreError) {
        console.error('❌ Failed to restore backup:', restoreError.message);
      }
      
      throw new Error(`Failed to update environment file: ${error.message}`);
    }
  }

  /**
   * Create a backup of the current .env file
   */
  async createBackup() {
    try {
      const content = await fs.readFile(this.envPath, 'utf8');
      await fs.writeFile(this.backupPath, content, 'utf8');
      console.log('📁 Created .env backup');
    } catch (error) {
      console.warn('⚠️ Failed to create .env backup:', error.message);
    }
  }

  /**
   * Restore .env file from backup
   */
  async restoreBackup() {
    try {
      const backupContent = await fs.readFile(this.backupPath, 'utf8');
      await fs.writeFile(this.envPath, backupContent, 'utf8');
      console.log('🔄 Restored .env from backup');
    } catch (error) {
      throw new Error(`Failed to restore backup: ${error.message}`);
    }
  }

  /**
   * Validate environment variable value
   * @param {string} key - Environment variable key
   * @param {string} value - Environment variable value
   * @returns {boolean} Is valid
   */
  validateEnvVar(key, value) {
    switch (key) {
      case 'VECTOR_DB_MODE':
        return ['local', 'cloud'].includes(value);
      case 'VECTOR_DB_MODE_LOCKED':
        return ['true', 'false'].includes(value);
      default:
        return true; // Allow other variables
    }
  }

  /**
   * Update vector database mode with validation
   * @param {string} mode - New mode ('local' or 'cloud')
   * @returns {boolean} Success status
   */
  async updateVectorDbMode(mode) {
    if (!this.validateEnvVar('VECTOR_DB_MODE', mode)) {
      throw new Error(`Invalid vector DB mode: ${mode}. Must be 'local' or 'cloud'`);
    }

    console.log(`🔄 Updating VECTOR_DB_MODE from ${process.env.VECTOR_DB_MODE} to ${mode}`);
    
    const updates = {
      VECTOR_DB_MODE: mode
    };

    const success = await this.updateEnvFile(updates);
    
    if (success) {
      // Update process.env for immediate effect
      process.env.VECTOR_DB_MODE = mode;
      console.log(`✅ Vector DB mode updated to: ${mode}`);
    }
    
    return success;
  }

  /**
   * Get current vector database mode
   * @returns {string} Current mode
   */
  getCurrentMode() {
    return process.env.VECTOR_DB_MODE || 'local';
  }

  /**
   * Check if mode switching is locked
   * @returns {boolean} Is locked
   */
  isModeLocked() {
    return process.env.VECTOR_DB_MODE_LOCKED === 'true';
  }

  /**
   * Clean up backup files
   */
  async cleanup() {
    try {
      await fs.unlink(this.backupPath);
      console.log('🧹 Cleaned up .env backup');
    } catch (error) {
      // Backup file might not exist, which is fine
      console.log('📁 No backup file to clean up');
    }
  }
}

module.exports = new EnvManager();