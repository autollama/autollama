/**
 * Global Setup for Performance Tests
 * Configures environment for optimal performance testing
 */

module.exports = async () => {
  console.log('🔧 Setting up performance test environment...');
  
  // Set NODE_ENV for performance testing
  process.env.NODE_ENV = 'test';
  process.env.PERFORMANCE_TEST = 'true';
  
  // Optimize garbage collection for performance testing
  if (global.gc) {
    console.log('✅ Garbage collection available for testing');
    // Run initial GC
    global.gc();
  } else {
    console.log('⚠️  Garbage collection not available. Run with --expose-gc for better memory testing');
  }
  
  // Set process limits for testing
  try {
    // Increase memory limit warnings
    if (process.env.NODE_OPTIONS) {
      process.env.NODE_OPTIONS += ' --max-old-space-size=2048';
    } else {
      process.env.NODE_OPTIONS = '--max-old-space-size=2048';
    }
  } catch (error) {
    console.warn('Could not set Node.js memory limits:', error.message);
  }
  
  // Configure test database settings for performance
  process.env.DB_POOL_SIZE = '20';
  process.env.DB_TIMEOUT = '30000';
  
  // Disable external service calls
  process.env.MOCK_EXTERNAL_SERVICES = 'true';
  process.env.DISABLE_WEBHOOKS = 'true';
  
  // Performance monitoring settings
  process.env.ENABLE_PERFORMANCE_MONITORING = 'true';
  process.env.MEMORY_SNAPSHOT_INTERVAL = '5000';
  
  console.log('✅ Performance test environment configured');
};