/**
 * Global Teardown for Performance Tests
 * Cleanup and reporting after performance test completion
 */

const fs = require('fs').promises;
const path = require('path');

module.exports = async () => {
  console.log('🧹 Cleaning up performance test environment...');
  
  // Force final garbage collection
  if (global.gc) {
    global.gc();
    console.log('✅ Final garbage collection completed');
  }
  
  // Clean up any temporary test files
  try {
    const tempFiles = await fs.readdir('/tmp');
    const performanceFiles = tempFiles.filter(file => 
      file.startsWith('performance-report-') || 
      file.startsWith('autollama-performance-')
    );
    
    if (performanceFiles.length > 0) {
      console.log(`📁 Found ${performanceFiles.length} performance report files in /tmp/`);
      
      // Keep only the most recent 5 reports
      const sortedFiles = performanceFiles
        .map(file => ({ name: file, path: path.join('/tmp', file) }))
        .sort((a, b) => b.name.localeCompare(a.name))
        .slice(5); // Remove all but the 5 most recent
      
      for (const file of sortedFiles) {
        try {
          await fs.unlink(file.path);
          console.log(`🗑️  Cleaned up old report: ${file.name}`);
        } catch (error) {
          console.warn(`Could not remove ${file.name}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.warn('Could not clean up temporary files:', error.message);
  }
  
  // Display final memory usage
  const finalMemory = process.memoryUsage();
  console.log('📊 Final memory usage:');
  console.log(`   Heap Used: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
  console.log(`   Heap Total: ${Math.round(finalMemory.heapTotal / 1024 / 1024)}MB`);
  console.log(`   External: ${Math.round(finalMemory.external / 1024 / 1024)}MB`);
  console.log(`   RSS: ${Math.round(finalMemory.rss / 1024 / 1024)}MB`);
  
  // Display performance test completion message
  console.log('✅ Performance test environment cleanup completed');
  console.log('📈 Check /tmp/ for detailed performance reports');
};