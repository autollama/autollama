/**
 * AutoLlama v2.3.5 - Database Configuration with Dynamic Mode Switching
 * Enforces mutually exclusive Local vs Cloud deployment modes for enterprise air-gapped environments
 * Supports persistent mode switching with environment file updates
 */

// Dynamic mode detection with environment variable updates
function getCurrentMode() {
  return process.env.VECTOR_DB_MODE || 'local';
}

function isModeLocked() {
  return process.env.VECTOR_DB_MODE_LOCKED === 'true';
}

console.log(`🔧 AutoLlama Vector DB Mode: ${getCurrentMode().toUpperCase()}${isModeLocked() ? ' (LOCKED)' : ''}`);

/**
 * Get Qdrant configuration based on deployment mode
 * LOCAL MODE: Zero external connections, complete isolation
 * CLOUD MODE: External services only
 */
function getQdrantConfig() {
  const currentMode = getCurrentMode();
  
  if (currentMode === 'local') {
    console.log('🏠 LOCAL MODE: Using local Qdrant instance');
    return {
      mode: 'local',
      url: process.env.QDRANT_LOCAL_URL || 'http://localhost:6333',
      apiKey: null, // No API key needed for local
      collection: process.env.QDRANT_COLLECTION || 'autollama-content',
      telemetryDisabled: true,
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 10000
    };
  } else if (currentMode === 'cloud') {
    console.log('☁️ CLOUD MODE: Using Qdrant Cloud service');
    const url = process.env.QDRANT_URL;
    const apiKey = process.env.QDRANT_API_KEY;
    
    if (!url || !apiKey) {
      throw new Error('CLOUD MODE requires QDRANT_URL and QDRANT_API_KEY environment variables');
    }
    
    return {
      mode: 'cloud',
      url: url,
      apiKey: apiKey,
      collection: process.env.QDRANT_COLLECTION || 'autollama-content',
      telemetryDisabled: false,
      maxRetries: 5,
      retryDelay: 2000,
      timeout: 30000
    };
  } else {
    throw new Error(`Invalid VECTOR_DB_MODE: ${currentMode}. Must be 'local' or 'cloud'`);
  }
}

/**
 * Validate that the current mode configuration is secure and complete
 */
function validateModeConfiguration() {
  const config = getQdrantConfig();
  
  if (config.mode === 'local') {
    // Validate local mode security
    if (config.url.includes('qdrant.io') || config.url.includes('cloud')) {
      throw new Error('LOCAL MODE cannot use cloud URLs. Check QDRANT_LOCAL_URL configuration.');
    }
    
    if (config.apiKey) {
      console.warn('⚠️ WARNING: API key detected in LOCAL MODE. Local Qdrant does not require API keys.');
    }
    
    console.log('✅ LOCAL MODE validation passed - Air-gapped configuration confirmed');
  } else {
    // Validate cloud mode configuration
    if (!config.url.includes('https://')) {
      console.warn('⚠️ WARNING: Cloud mode should use HTTPS URLs for security');
    }
    
    if (!config.apiKey || config.apiKey.length < 10) {
      throw new Error('CLOUD MODE requires a valid QDRANT_API_KEY');
    }
    
    console.log('✅ CLOUD MODE validation passed');
  }
  
  return config;
}

/**
 * Get PostgreSQL configuration
 */
function getPostgresConfig() {
  const defaultLocal = 'postgresql://autollama:autollama_password@localhost:5432/autollama';
  const databaseUrl = process.env.DATABASE_URL || defaultLocal;
  const currentMode = getCurrentMode();
  
  if (currentMode === 'local') {
    console.log('🏠 LOCAL MODE: Using local PostgreSQL instance');
    if (databaseUrl.includes('amazonaws.com') || databaseUrl.includes('cloud')) {
      console.warn('⚠️ WARNING: Cloud database URL detected in LOCAL MODE');
    }
  }
  
  return {
    url: databaseUrl,
    ssl: currentMode === 'cloud' ? { rejectUnauthorized: false } : false,
    pool: {
      max: currentMode === 'local' ? 20 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    }
  };
}

/**
 * Check if mode switching is allowed
 */
function isModeChangeable() {
  return !isModeLocked();
}

/**
 * Get deployment mode information for frontend
 */
function getModeInfo() {
  const currentMode = getCurrentMode();
  const locked = isModeLocked();
  
  return {
    mode: currentMode,
    locked: locked,
    changeable: isModeChangeable(),
    description: currentMode === 'local' 
      ? 'All data stored locally - No external connections'
      : 'Connected to external cloud services',
    securityLevel: currentMode === 'local' ? 'air-gapped' : 'cloud-connected'
  };
}

/**
 * Validate mode configuration and detect issues
 */
function validateModeConfiguration() {
  const currentMode = getCurrentMode();
  const config = getQdrantConfig();
  const issues = [];
  
  if (currentMode === 'local') {
    // Validate local mode security
    if (config.url.includes('qdrant.io') || config.url.includes('cloud')) {
      issues.push('LOCAL MODE cannot use cloud URLs. Check QDRANT_LOCAL_URL configuration.');
    }
    
    if (config.apiKey) {
      issues.push('WARNING: API key detected in LOCAL MODE. Local Qdrant does not require API keys.');
    }
    
    if (issues.length === 0) {
      console.log('✅ LOCAL MODE validation passed - Air-gapped configuration confirmed');
    }
  } else {
    // Validate cloud mode configuration
    if (!config.url.includes('https://')) {
      issues.push('WARNING: Cloud mode should use HTTPS URLs for security');
    }
    
    if (!config.apiKey || config.apiKey.length < 10) {
      issues.push('CLOUD MODE requires a valid QDRANT_API_KEY');
    }
    
    if (issues.length === 0) {
      console.log('✅ CLOUD MODE validation passed');
    }
  }
  
  if (issues.length > 0) {
    console.warn('⚠️ Mode configuration issues detected:', issues);
  }
  
  return {
    valid: issues.length === 0,
    mode: currentMode,
    config,
    issues
  };
}

module.exports = {
  getCurrentMode,
  isModeLocked,
  getQdrantConfig,
  getPostgresConfig,
  validateModeConfiguration,
  isModeChangeable,
  getModeInfo,
  // Legacy exports for backward compatibility
  VECTOR_DB_MODE: getCurrentMode(),
  MODE_LOCKED: isModeLocked()
};