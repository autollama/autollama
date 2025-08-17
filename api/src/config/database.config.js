/**
 * AutoLlama v2.3.4 - Database Configuration with Mode Switching
 * Enforces mutually exclusive Local vs Cloud deployment modes for enterprise air-gapped environments
 */

const VECTOR_DB_MODE = process.env.VECTOR_DB_MODE || 'local'; // 'local' | 'cloud'
const MODE_LOCKED = process.env.VECTOR_DB_MODE_LOCKED === 'true';

console.log(`🔧 AutoLlama Vector DB Mode: ${VECTOR_DB_MODE.toUpperCase()}${MODE_LOCKED ? ' (LOCKED)' : ''}`);

/**
 * Get Qdrant configuration based on deployment mode
 * LOCAL MODE: Zero external connections, complete isolation
 * CLOUD MODE: External services only
 */
function getQdrantConfig() {
  if (VECTOR_DB_MODE === 'local') {
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
  } else if (VECTOR_DB_MODE === 'cloud') {
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
    throw new Error(`Invalid VECTOR_DB_MODE: ${VECTOR_DB_MODE}. Must be 'local' or 'cloud'`);
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
  
  if (VECTOR_DB_MODE === 'local') {
    console.log('🏠 LOCAL MODE: Using local PostgreSQL instance');
    if (databaseUrl.includes('amazonaws.com') || databaseUrl.includes('cloud')) {
      console.warn('⚠️ WARNING: Cloud database URL detected in LOCAL MODE');
    }
  }
  
  return {
    url: databaseUrl,
    ssl: VECTOR_DB_MODE === 'cloud' ? { rejectUnauthorized: false } : false,
    pool: {
      max: VECTOR_DB_MODE === 'local' ? 20 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    }
  };
}

/**
 * Check if mode switching is allowed
 */
function isModeChangeable() {
  return !MODE_LOCKED;
}

/**
 * Get deployment mode information for frontend
 */
function getModeInfo() {
  return {
    mode: VECTOR_DB_MODE,
    locked: MODE_LOCKED,
    changeable: isModeChangeable(),
    description: VECTOR_DB_MODE === 'local' 
      ? 'All data stored locally - No external connections'
      : 'Connected to external cloud services',
    securityLevel: VECTOR_DB_MODE === 'local' ? 'air-gapped' : 'cloud-connected'
  };
}

module.exports = {
  VECTOR_DB_MODE,
  MODE_LOCKED,
  getQdrantConfig,
  getPostgresConfig,
  validateModeConfiguration,
  isModeChangeable,
  getModeInfo
};