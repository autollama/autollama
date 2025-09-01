/**
 * AutoLlama Validation Utilities
 * Input validation and sanitization for setup wizard
 */

const path = require('path');
const fs = require('fs-extra');

// Validate project name
function validateProjectName(name) {
  if (!name) {
    return { valid: false, error: 'Project name is required' };
  }
  
  if (name.length < 2) {
    return { valid: false, error: 'Project name must be at least 2 characters' };
  }
  
  if (name.length > 50) {
    return { valid: false, error: 'Project name must be less than 50 characters' };
  }
  
  // Check for valid characters (letters, numbers, hyphens, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return { valid: false, error: 'Project name can only contain letters, numbers, hyphens, and underscores' };
  }
  
  // Check for reserved names
  const reserved = ['node_modules', 'src', 'lib', 'bin', 'config', 'scripts', 'api', 'docker', 'autollama'];
  if (reserved.includes(name.toLowerCase())) {
    return { valid: false, error: 'This name is reserved and cannot be used' };
  }
  
  return { valid: true };
}

// Validate directory path
async function validateDirectory(dirPath) {
  try {
    const absolutePath = path.resolve(dirPath);
    
    // Check if directory exists
    const exists = await fs.pathExists(absolutePath);
    if (exists) {
      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) {
        return { valid: false, error: 'Path exists but is not a directory' };
      }
      
      // Check if directory is empty
      const files = await fs.readdir(absolutePath);
      const isEmpty = files.length === 0 || files.every(f => f.startsWith('.'));
      
      return { 
        valid: true, 
        exists: true, 
        isEmpty,
        path: absolutePath 
      };
    }
    
    // Check if parent directory is writable
    const parentDir = path.dirname(absolutePath);
    const parentExists = await fs.pathExists(parentDir);
    
    if (!parentExists) {
      return { valid: false, error: 'Parent directory does not exist' };
    }
    
    try {
      await fs.access(parentDir, fs.constants.W_OK);
      return { 
        valid: true, 
        exists: false, 
        path: absolutePath 
      };
    } catch {
      return { valid: false, error: 'Cannot create directory - permission denied' };
    }
    
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// Validate port number
function validatePort(port) {
  const portNum = parseInt(port);
  
  if (isNaN(portNum)) {
    return { valid: false, error: 'Port must be a number' };
  }
  
  if (portNum < 1024) {
    return { valid: false, error: 'Port must be 1024 or higher' };
  }
  
  if (portNum > 65535) {
    return { valid: false, error: 'Port must be 65535 or lower' };
  }
  
  // Check for commonly used ports that might cause conflicts
  const commonPorts = [3000, 5000, 8000, 9000];
  const warning = commonPorts.includes(portNum) ? 
    `Port ${portNum} is commonly used - consider using a different port if you experience conflicts` : 
    null;
  
  return { valid: true, port: portNum, warning };
}

// Validate database URL
function validateDatabaseUrl(url) {
  if (!url) {
    return { valid: false, error: 'Database URL is required' };
  }
  
  try {
    const parsed = new URL(url);
    
    // Check protocol
    if (!['postgres:', 'postgresql:', 'sqlite:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Database URL must use postgres:// or sqlite:// protocol' };
    }
    
    // For PostgreSQL, check basic structure
    if (parsed.protocol.startsWith('postgres')) {
      if (!parsed.hostname) {
        return { valid: false, error: 'PostgreSQL URL must include hostname' };
      }
      
      if (!parsed.pathname || parsed.pathname === '/') {
        return { valid: false, error: 'PostgreSQL URL must include database name' };
      }
    }
    
    return { valid: true, type: parsed.protocol.replace(':', '') };
    
  } catch {
    return { valid: false, error: 'Invalid database URL format' };
  }
}

// Validate environment variable key
function validateEnvKey(key) {
  if (!key) {
    return { valid: false, error: 'Environment variable key is required' };
  }
  
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    return { valid: false, error: 'Environment variable key must contain only uppercase letters, numbers, and underscores' };
  }
  
  return { valid: true };
}

// Validate configuration object
function validateConfig(config) {
  const errors = [];
  
  // Check required fields
  const required = ['projectName', 'deployment', 'database'];
  required.forEach(field => {
    if (!config[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  });
  
  // Validate deployment mode
  if (config.deployment && !['local', 'hybrid', 'docker'].includes(config.deployment)) {
    errors.push('Invalid deployment mode. Must be: local, hybrid, or docker');
  }
  
  // Validate database choice
  if (config.database && !['sqlite', 'postgresql'].includes(config.database)) {
    errors.push('Invalid database choice. Must be: sqlite or postgresql');
  }
  
  // Validate ports if provided
  if (config.port) {
    const portValidation = validatePort(config.port);
    if (!portValidation.valid) {
      errors.push(`Invalid port: ${portValidation.error}`);
    }
  }
  
  // Validate API key if provided
  if (config.openaiApiKey) {
    const { validateApiKey } = require('./system');
    const apiKeyValidation = validateApiKey(config.openaiApiKey);
    if (!apiKeyValidation.valid) {
      errors.push(`Invalid API key: ${apiKeyValidation.error}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    config: errors.length === 0 ? config : null
  };
}

// Sanitize user input
function sanitizeInput(input, type = 'string') {
  if (!input) return input;
  
  switch (type) {
    case 'projectName':
      return input.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    
    case 'path':
      return path.normalize(input.trim());
    
    case 'port':
      return parseInt(input.trim());
    
    case 'url':
      return input.trim().toLowerCase();
    
    case 'apiKey':
      return input.trim();
    
    default:
      return input.trim();
  }
}

// Generate suggestions based on validation errors
function generateSuggestions(field, error) {
  const suggestions = {
    projectName: [
      'Use only letters, numbers, hyphens, and underscores',
      'Try: my-autollama-project',
      'Avoid reserved names like "api" or "config"'
    ],
    
    port: [
      'Use ports between 1024-65535',
      'Popular choices: 3000, 8080, 8000',
      'Check if port is already in use'
    ],
    
    apiKey: [
      'Get your API key from https://platform.openai.com/api-keys',
      'API key should start with "sk-"',
      'Keep your API key secure and private'
    ],
    
    directory: [
      'Choose an empty directory or create a new one',
      'Ensure you have write permissions',
      'Try using an absolute path'
    ]
  };
  
  return suggestions[field] || [
    'Check the input format and try again',
    'Refer to the documentation for examples'
  ];
}

module.exports = {
  validateProjectName,
  validateDirectory,
  validatePort,
  validateDatabaseUrl,
  validateEnvKey,
  validateConfig,
  sanitizeInput,
  generateSuggestions
};