# Known Bugs - AutoLlama v2.3

## Critical Issues

### BUG-001: Anthropic API Key Not Persisting in Database

**Severity:** High  
**Status:** Unresolved  
**Date Reported:** 2025-08-10  
**Component:** Settings Management / Database Persistence  

**Description:**
The Anthropic Claude API key is not being properly saved to or loaded from the database, causing the key to disappear when the settings modal is closed and reopened.

**Steps to Reproduce:**
1. Go to Settings > Connections > Anthropic Claude
2. Enter a valid Anthropic API key
3. Click "Test" button - shows successful connection
4. Close the settings modal
5. Reopen Settings > Connections
6. Observe that the API key field is empty

**Expected Behavior:**
- API key should persist in database after successful test
- Key should be visible when reopening settings
- OpenWebUI RAG Model Configuration should show Anthropic models in dropdown

**Actual Behavior:**
- API key disappears after closing settings modal
- Key is not saved to database despite successful validation
- OpenWebUI dropdown does not show Anthropic models

**Technical Details:**
- Frontend test button works correctly (validates against Anthropic API)
- Issue appears to be in settingsManager.js database persistence layer
- Attempted fix: Added claudeApiKey mappings in save/load functions
- Fix unsuccessful - deeper database/API integration issue suspected

**Impact:**
- Users cannot use Anthropic Claude models in OpenWebUI integration
- API key must be re-entered every session
- Prevents full Claude integration functionality

**Workaround:**
None currently available.

**Investigation Status:**
- Frontend test functionality: Working
- Database mapping functions: Attempted fix
- API endpoint validation: Working
- Root cause: Still investigating deeper persistence mechanism

## Minor Issues

### BUG-002: Search Performance Optimization

**Status:** Fixed  
**Date:** 2025-08-10  
**Component:** Search System

**Description:** Search queries were taking 10+ seconds due to expensive ILIKE patterns and missing database indexes.

**Fix Applied:**
- Added GIN full-text search indexes
- Optimized search query structure
- Improved frontend debouncing and request cancellation
- Performance improved from 10s to ~1.3s (87% improvement)

---

*For reporting new bugs or contributing fixes, please see the GitHub repository.*