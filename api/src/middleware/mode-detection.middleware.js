/**
 * Mode Detection Middleware
 * Detects current vector database deployment mode and vendor for each request
 * Enables mode and vendor-aware API responses for data isolation
 */

const { getModeInfo } = require('../config/database.config');
const { vectorDbFactory, SUPPORTED_VENDORS, SUPPORTED_MODES } = require('../services/vector-db/vector-db-factory');

/**
 * Middleware to detect and attach current deployment mode and vendor to requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object  
 * @param {Function} next - Express next function
 */
const detectMode = (req, res, next) => {
  try {
    // Get current deployment mode from configuration
    const modeInfo = getModeInfo();
    
    // Get current vector database configuration
    const vectorDbConfig = vectorDbFactory.getCurrentConfig();
    
    // Attach mode and vendor information to request object
    req.vectorDbMode = modeInfo.mode; // 'local' or 'cloud'
    req.vectorDbVendor = vectorDbConfig.vendor; // 'qdrant', 'pinecone', etc.
    req.vectorDbConfig = vectorDbConfig.config; // Vendor-specific config
    req.modeInfo = modeInfo;
    
    // Add comprehensive mode info to response headers for debugging
    res.set('X-Vector-DB-Mode', modeInfo.mode);
    res.set('X-Vector-DB-Vendor', vectorDbConfig.vendor);
    res.set('X-Mode-Locked', modeInfo.locked.toString());
    res.set('X-Mode-Changeable', modeInfo.changeable.toString());
    
    // Log mode detection for debugging
    console.log(`🔍 Mode Detection: ${req.method} ${req.path} - Mode: ${modeInfo.mode}, Vendor: ${vectorDbConfig.vendor}`);
    
    next();
  } catch (error) {
    console.error('❌ Mode detection failed:', error.message);
    
    // Fallback to cloud mode with qdrant if detection fails
    req.vectorDbMode = 'cloud';
    req.vectorDbVendor = 'qdrant';
    req.vectorDbConfig = {};
    req.modeInfo = {
      mode: 'cloud',
      locked: false,
      changeable: false,
      description: 'Fallback mode (mode detection failed)'
    };
    
    res.set('X-Vector-DB-Mode', 'cloud');
    res.set('X-Vector-DB-Vendor', 'qdrant');
    res.set('X-Mode-Detection-Error', error.message);
    
    next();
  }
};

/**
 * Middleware to validate mode and vendor-aware requests
 * Ensures the requested mode/vendor matches current deployment
 */
const validateModeRequest = (req, res, next) => {
  const requestedMode = req.query.mode || req.body.mode;
  const requestedVendor = req.query.vendor || req.body.vendor;
  
  // Validate requested mode
  if (requestedMode && requestedMode !== req.vectorDbMode) {
    console.warn(`⚠️ Mode mismatch: Requested ${requestedMode}, but current mode is ${req.vectorDbMode}`);
    
    return res.status(400).json({
      success: false,
      error: 'Mode mismatch',
      message: `Current deployment mode is ${req.vectorDbMode}, but ${requestedMode} was requested`,
      currentMode: req.vectorDbMode,
      currentVendor: req.vectorDbVendor,
      requestedMode: requestedMode,
      requestedVendor: requestedVendor,
      timestamp: new Date().toISOString()
    });
  }
  
  // Validate requested vendor
  if (requestedVendor && requestedVendor !== req.vectorDbVendor) {
    console.warn(`⚠️ Vendor mismatch: Requested ${requestedVendor}, but current vendor is ${req.vectorDbVendor}`);
    
    return res.status(400).json({
      success: false,
      error: 'Vendor mismatch',
      message: `Current vector database vendor is ${req.vectorDbVendor}, but ${requestedVendor} was requested`,
      currentMode: req.vectorDbMode,
      currentVendor: req.vectorDbVendor,
      requestedMode: requestedMode,
      requestedVendor: requestedVendor,
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};

/**
 * Helper function to add mode and vendor filtering to database queries
 * @param {string} baseQuery - Base SQL query
 * @param {string} vectorDbMode - Current vector database mode
 * @param {string} vectorDbVendor - Current vector database vendor
 * @param {Array} params - Query parameters array
 * @returns {Object} Modified query and parameters
 */
const addModeVendorFilter = (baseQuery, vectorDbMode, vectorDbVendor, params = []) => {
  // Add mode and vendor filters to WHERE clause
  const modeFilterCondition = 'vector_db_mode = $' + (params.length + 1);
  const vendorFilterCondition = 'vector_db_vendor = $' + (params.length + 2);
  const combinedFilter = `${modeFilterCondition} AND ${vendorFilterCondition}`;
  
  let modifiedQuery;
  if (baseQuery.toLowerCase().includes('where')) {
    // Query already has WHERE clause, add AND condition
    modifiedQuery = baseQuery.replace(
      /where\s+/i, 
      `WHERE ${combinedFilter} AND `
    );
  } else if (baseQuery.toLowerCase().includes('order by')) {
    // No WHERE clause, add before ORDER BY
    modifiedQuery = baseQuery.replace(
      /order\s+by/i,
      `WHERE ${combinedFilter} ORDER BY`
    );
  } else if (baseQuery.toLowerCase().includes('group by')) {
    // No WHERE clause, add before GROUP BY  
    modifiedQuery = baseQuery.replace(
      /group\s+by/i,
      `WHERE ${combinedFilter} GROUP BY`
    );
  } else {
    // No WHERE, ORDER BY, or GROUP BY - add at end
    modifiedQuery = `${baseQuery} WHERE ${combinedFilter}`;
  }
  
  // Add mode and vendor parameters
  const modifiedParams = [...params, vectorDbMode, vectorDbVendor];
  
  return {
    query: modifiedQuery,
    params: modifiedParams
  };
};

/**
 * Helper function to create mode and vendor-aware database query wrapper
 * @param {Object} req - Express request object (contains vectorDbMode and vectorDbVendor)
 * @returns {Function} Query wrapper function
 */
const createModeVendorAwareQuery = (req) => {
  return (baseQuery, params = []) => {
    return addModeVendorFilter(baseQuery, req.vectorDbMode, req.vectorDbVendor, params);
  };
};

/**
 * Mode and vendor-aware response wrapper
 * Adds mode and vendor information to API responses
 */
const wrapModeVendorAwareResponse = (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    // Add mode and vendor information to successful responses
    if (data && typeof data === 'object' && data.success !== false) {
      data.vectorDbMode = req.vectorDbMode;
      data.vectorDbVendor = req.vectorDbVendor;
      data.modeInfo = {
        mode: req.vectorDbMode,
        vendor: req.vectorDbVendor,
        description: `Data from ${req.vectorDbMode} ${req.vectorDbVendor} vector database`,
        isolated: req.vectorDbMode === 'local',
        dataIsolation: {
          mode: req.vectorDbMode,
          vendor: req.vectorDbVendor,
          scope: req.vectorDbMode === 'local' ? 'Air-gapped local deployment' : 'Cloud-connected deployment'
        }
      };
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * Middleware to ensure vector database connection is available
 * Validates that the current mode/vendor combination is properly configured
 */
const ensureVectorDbConnection = async (req, res, next) => {
  try {
    // Get or create connector for current mode/vendor
    const connector = vectorDbFactory.getCurrentConnector();
    
    // Test connection
    await connector.ping();
    
    // Attach connector to request for later use
    req.vectorDbConnector = connector;
    
    next();
  } catch (error) {
    console.error(`❌ Vector DB connection failed (${req.vectorDbMode}/${req.vectorDbVendor}):`, error.message);
    
    return res.status(503).json({
      success: false,
      error: 'Vector database unavailable',
      message: `Cannot connect to ${req.vectorDbVendor} in ${req.vectorDbMode} mode`,
      details: error.message,
      vectorDbMode: req.vectorDbMode,
      vectorDbVendor: req.vectorDbVendor,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Utility function to get mode/vendor-specific collection name
 * @param {string} baseCollectionName - Base collection name
 * @param {string} mode - Vector database mode
 * @param {string} vendor - Vector database vendor
 * @returns {string} Mode/vendor-specific collection name
 */
const getModeVendorCollectionName = (baseCollectionName, mode, vendor) => {
  // Create unique collection names for different mode/vendor combinations
  // This ensures complete data isolation
  return `${baseCollectionName}_${mode}_${vendor}`;
};

/**
 * Middleware to add collection name context based on mode/vendor
 */
const addCollectionContext = (req, res, next) => {
  // Helper function to get collection name for current mode/vendor
  req.getCollectionName = (baseCollectionName) => {
    return getModeVendorCollectionName(baseCollectionName, req.vectorDbMode, req.vectorDbVendor);
  };
  
  next();
};

module.exports = {
  detectMode,
  validateModeRequest,
  addModeVendorFilter,
  createModeVendorAwareQuery,
  wrapModeVendorAwareResponse,
  ensureVectorDbConnection,
  getModeVendorCollectionName,
  addCollectionContext
};