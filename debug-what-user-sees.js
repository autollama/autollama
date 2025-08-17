// BROWSER DEBUG SCRIPT - Copy and paste this into the browser console
// This will tell me exactly what the user is seeing

(() => {
  console.log('🔍 BROWSER DEBUG - What User Actually Sees');
  console.log('==============================================');
  
  // 1. Check what React components are mounted
  const checkComponents = () => {
    console.log('\n📦 Checking DOM Structure:');
    
    const dashboard = document.querySelector('[class*="dashboard"], [data-testid*="dashboard"]');
    const documentGrid = document.querySelector('[class*="document"], .grid');
    const documentTiles = document.querySelectorAll('[class*="document-tile"], [class*="document-block"], .document-tile');
    
    console.log('Dashboard element:', !!dashboard);
    console.log('Document grid element:', !!documentGrid);
    console.log('Document tiles found:', documentTiles.length);
    
    if (documentTiles.length > 0) {
      console.log('First 3 tile contents:');
      documentTiles.slice(0, 3).forEach((tile, i) => {
        const title = tile.querySelector('h3, [class*="title"]')?.textContent || 'No title found';
        console.log(`  Tile ${i+1}: ${title.substring(0, 50)}...`);
      });
    }
    
    return {
      hasDashboard: !!dashboard,
      hasGrid: !!documentGrid,
      tileCount: documentTiles.length
    };
  };
  
  // 2. Check if document order is wrong
  const checkOrder = () => {
    console.log('\n📋 Checking Document Order:');
    
    const tiles = document.querySelectorAll('[class*="document-tile"], [class*="document-block"], .document-tile');
    const orderInfo = Array.from(tiles).slice(0, 10).map((tile, index) => {
      const title = tile.querySelector('h3, [class*="title"]')?.textContent || 'Unknown';
      const timeElement = tile.querySelector('[class*="time"], [class*="date"], time');
      const time = timeElement?.textContent || timeElement?.getAttribute('datetime') || 'No time found';
      
      return {
        position: index + 1,
        title: title.substring(0, 30),
        time: time
      };
    });
    
    console.table(orderInfo);
    
    return orderInfo;
  };
  
  // 3. Check what view is active
  const checkView = () => {
    console.log('\n👁️ Checking Current View:');
    
    const activeTab = document.querySelector('[class*="active"], [aria-selected="true"], .bg-primary-600');
    const tabName = activeTab?.textContent || 'Unknown';
    
    console.log('Active tab/view:', tabName);
    
    // Check React state if possible
    const reactRoot = document.querySelector('#root')?._reactInternalFiber || 
                     document.querySelector('#root')?._reactRootContainer;
    
    if (reactRoot) {
      console.log('React root found - try React DevTools for state inspection');
    }
    
    return tabName;
  };
  
  // 4. Upload test and monitor
  const monitorForChanges = () => {
    console.log('\n🔄 Starting 30-second Change Monitor:');
    console.log('Upload a document now and watch for changes...');
    
    const initialTiles = document.querySelectorAll('[class*="document-tile"], [class*="document-block"], .document-tile');
    const initialCount = initialTiles.length;
    const initialFirstTitle = initialTiles[0]?.querySelector('h3, [class*="title"]')?.textContent || 'None';
    
    console.log(`Initial state: ${initialCount} tiles, first: "${initialFirstTitle.substring(0, 30)}"`);
    
    let changeCount = 0;
    const interval = setInterval(() => {
      const currentTiles = document.querySelectorAll('[class*="document-tile"], [class*="document-block"], .document-tile');
      const currentCount = currentTiles.length;
      const currentFirstTitle = currentTiles[0]?.querySelector('h3, [class*="title"]')?.textContent || 'None';
      
      if (currentCount !== initialCount || currentFirstTitle !== initialFirstTitle) {
        changeCount++;
        console.log(`🚨 Change detected #${changeCount}:`, {
          oldCount: initialCount,
          newCount: currentCount,
          oldFirst: initialFirstTitle.substring(0, 30),
          newFirst: currentFirstTitle.substring(0, 30),
          timestamp: new Date().toISOString()
        });
      }
    }, 1000);
    
    setTimeout(() => {
      clearInterval(interval);
      console.log(`📊 Monitoring complete. Total changes detected: ${changeCount}`);
      if (changeCount === 0) {
        console.log('❌ NO CHANGES DETECTED - This confirms the bug exists!');
      } else {
        console.log('✅ Changes detected - UI is updating correctly');
      }
    }, 30000);
  };
  
  // 5. Check for React errors
  const checkErrors = () => {
    console.log('\n❌ Checking for React Errors:');
    
    const originalError = console.error;
    const errors = [];
    
    console.error = function(...args) {
      errors.push(args.join(' '));
      originalError.apply(console, args);
    };
    
    setTimeout(() => {
      console.error = originalError;
      console.log('React errors captured:', errors.length);
      errors.forEach((error, i) => {
        console.log(`  Error ${i+1}: ${error}`);
      });
    }, 5000);
  };
  
  // Run all checks
  const results = {
    components: checkComponents(),
    order: checkOrder(),
    activeView: checkView()
  };
  
  checkErrors();
  
  console.log('\n📋 SUMMARY FOR CLAUDE:');
  console.log('====================');
  console.log('- Components found:', results.components);
  console.log('- Active view:', results.activeView);
  console.log('- Document tiles:', results.order.length, 'found');
  console.log('- First document:', results.order[0]?.title || 'None');
  
  console.log('\n💡 NEXT STEPS:');
  console.log('1. Run monitorForChanges() and upload a document');
  console.log('2. Check React DevTools for component state');
  console.log('3. Look for any JavaScript errors in console');
  
  // Make functions available globally
  window.debugUserView = {
    checkComponents,
    checkOrder,
    checkView,
    monitorForChanges,
    
    // Quick test
    quickTest: () => {
      const tiles = document.querySelectorAll('[class*="document-tile"], [class*="document-block"], .document-tile');
      const first = tiles[0]?.querySelector('h3, [class*="title"]')?.textContent || 'None';
      console.log(`Quick test: ${tiles.length} tiles, first: "${first}"`);
      return { count: tiles.length, first };
    }
  };
  
  console.log('\n✨ Debug functions available at: window.debugUserView');
  console.log('Run monitorForChanges() then upload a document to test!');
  console.log('==============================================');
})();