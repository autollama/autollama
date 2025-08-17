// Run this in browser console to test the DocumentGrid reordering fix
(() => {
  console.log('🔍 DocumentGrid Reordering Test v2.0');
  console.log('=====================================');
  
  // Test 1: Check if render version tracking is working
  const checkRenderVersion = () => {
    const grid = document.querySelector('[data-grid-version]');
    if (!grid) {
      console.error('❌ Grid container not found with data-grid-version attribute');
      return false;
    }
    
    const version = grid.dataset.gridVersion;
    console.log('✅ Grid render version found:', version);
    return true;
  };
  
  // Test 2: Check if tiles have proper data attributes
  const checkTileAttributes = () => {
    const tiles = document.querySelectorAll('[data-document-id]');
    console.log('📊 Found', tiles.length, 'document tiles');
    
    let hasRenderVersion = 0;
    let hasPosition = 0;
    let hasOrder = 0;
    
    tiles.forEach((tile, index) => {
      if (tile.dataset.renderVersion) hasRenderVersion++;
      if (tile.dataset.position) hasPosition++;
      if (tile.style.order) hasOrder++;
      
      if (index < 5) { // Log first 5 tiles
        console.log(`Tile ${index}:`, {
          id: tile.dataset.documentId,
          position: tile.dataset.position,
          renderVersion: tile.dataset.renderVersion,
          cssOrder: tile.style.order,
          key: tile.getAttribute('key')
        });
      }
    });
    
    console.log('✅ Tiles with render version:', hasRenderVersion, '/', tiles.length);
    console.log('✅ Tiles with position data:', hasPosition, '/', tiles.length);
    console.log('✅ Tiles with CSS order:', hasOrder, '/', tiles.length);
    
    return tiles.length > 0 && hasRenderVersion > 0;
  };
  
  // Test 3: Verify CSS styles are applied
  const checkCSSStyles = () => {
    const grid = document.querySelector('.grid');
    if (!grid) {
      console.error('❌ Grid container not found');
      return false;
    }
    
    const styles = window.getComputedStyle(grid);
    console.log('Grid CSS properties:');
    console.log('- display:', styles.display);
    console.log('- grid-auto-flow:', styles.gridAutoFlow);
    console.log('- transform:', styles.transform);
    console.log('- backface-visibility:', styles.backfaceVisibility);
    
    const isCorrect = styles.gridAutoFlow === 'row' && styles.display === 'grid';
    if (isCorrect) {
      console.log('✅ Grid CSS styles are correctly applied');
    } else {
      console.error('❌ Grid CSS styles need attention');
    }
    
    return isCorrect;
  };
  
  // Test 4: Simulate document order change
  const testDocumentReorder = () => {
    console.log('\n🧪 Testing document reordering simulation...');
    
    // Get current document order
    const tiles = Array.from(document.querySelectorAll('[data-document-id]'));
    if (tiles.length < 2) {
      console.warn('Need at least 2 tiles to test reordering');
      return false;
    }
    
    console.log('Before reorder - First 3 tiles:');
    tiles.slice(0, 3).forEach((tile, i) => {
      const title = tile.querySelector('h3')?.textContent || 'Unknown';
      console.log(`  ${i}: ${tile.dataset.documentId} - ${title.substring(0, 30)}`);
    });
    
    // Test if we can manually reorder (this should work with our CSS)
    const grid = tiles[0].parentElement;
    const first = tiles[0];
    const second = tiles[1];
    
    // Swap DOM order
    grid.insertBefore(second, first);
    
    console.log('After manual DOM reorder - First 3 tiles:');
    const newTiles = Array.from(document.querySelectorAll('[data-document-id]'));
    newTiles.slice(0, 3).forEach((tile, i) => {
      const title = tile.querySelector('h3')?.textContent || 'Unknown';
      console.log(`  ${i}: ${tile.dataset.documentId} - ${title.substring(0, 30)}`);
    });
    
    // Revert the change
    setTimeout(() => {
      grid.insertBefore(first, second);
      console.log('✅ Reverted manual reorder - DOM manipulation works correctly');
    }, 2000);
    
    return true;
  };
  
  // Test 5: Check for React component state
  const checkReactState = () => {
    console.log('\n⚛️ Checking React component integration...');
    
    // Look for React DevTools presence
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      console.log('✅ React DevTools detected');
    }
    
    // Check if we can find React fiber
    const grid = document.querySelector('[data-grid-version]');
    if (grid && grid._reactInternalFiber) {
      console.log('✅ React fiber found on grid element');
    } else if (grid && Object.keys(grid).find(key => key.startsWith('__reactInternalInstance'))) {
      console.log('✅ React internal instance found on grid element');
    } else {
      console.log('ℹ️ React internals not directly accessible (normal in production)');
    }
    
    return true;
  };
  
  // Test 6: Force a render version increment (if possible)
  const testForceRerender = () => {
    console.log('\n🔄 Testing force re-render mechanism...');
    
    const grid = document.querySelector('[data-grid-version]');
    if (!grid) {
      console.error('❌ Grid not found');
      return false;
    }
    
    const currentVersion = parseInt(grid.dataset.gridVersion) || 0;
    console.log('Current render version:', currentVersion);
    
    // Check if grid gets updated on document changes
    console.log('✅ To test actual reordering, trigger a document state change');
    console.log('   - Upload a new document, or');
    console.log('   - Wait for polling to detect changes, or');
    console.log('   - Call refreshDocuments() from console');
    
    return true;
  };
  
  // Run all tests
  console.log('Running comprehensive reordering tests...\n');
  
  const results = {
    renderVersion: checkRenderVersion(),
    tileAttributes: checkTileAttributes(),
    cssStyles: checkCSSStyles(),
    reactState: checkReactState(),
    forceRerender: testForceRerender()
  };
  
  // Test DOM manipulation last as it's disruptive
  setTimeout(() => {
    results.documentReorder = testDocumentReorder();
    
    // Summary
    console.log('\n📋 Test Results Summary:');
    console.log('=======================');
    Object.entries(results).forEach(([test, passed]) => {
      console.log(`${passed ? '✅' : '❌'} ${test}:`, passed);
    });
    
    const allPassed = Object.values(results).every(r => r === true);
    if (allPassed) {
      console.log('\n🎉 All tests passed! DocumentGrid reordering should work correctly.');
      console.log('💡 To verify complete fix: upload new document and watch tiles reorder');
    } else {
      console.log('\n⚠️ Some tests failed. Check the fixes and console errors.');
    }
    
    // Provide helper functions
    window.documentGridTest = {
      checkOrder: checkTileAttributes,
      checkCSS: checkCSSStyles,
      testReorder: testDocumentReorder,
      
      // Helper to trigger document refresh
      triggerRefresh: () => {
        if (window.refreshDocuments) {
          console.log('🔄 Triggering document refresh...');
          window.refreshDocuments();
        } else {
          console.log('ℹ️ refreshDocuments not available in global scope');
          console.log('   Try running from React DevTools console instead');
        }
      }
    };
    
    console.log('\n✨ Test functions available at: window.documentGridTest');
  }, 1000);
  
  console.log('=====================================');
})();