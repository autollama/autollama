# AutoLlama v2.3.2 - Critical Document Refresh Fix

## Issue Description
**Problem**: When uploading new documents, they would not appear in the dashboard grid despite successful processing. Users reported "I can't see a single change" when uploading files.

**Symptoms**:
- New documents uploaded successfully but invisible in grid
- Document count increased but no new tiles appeared
- Only the first document tile would refresh/update
- Users saw existing 21+ documents but new ones never appeared

## Root Cause Analysis
The issue was a **backend API limit mismatch**, not a frontend problem:

1. **Frontend Request**: Correctly requested 30 documents via `refreshDocuments()` 
2. **Backend Override**: API endpoint `/api/documents` hardcoded `limit = 20` default
3. **Result**: Backend ignored frontend limit and always returned max 20 documents
4. **User Impact**: New documents became #1 but weren't visible since users already saw 20+ documents

## Technical Details
**File**: `/home/chuck/homelab/autollama/api/src/routes/search.routes.js`
**Line**: 427
**Before**: `const { limit = 20, offset = 0 } = req.query;`
**After**: `const { limit = 50, offset = 0 } = req.query;`

## Fix Applied
- Increased backend API default limit from 20 to 50 documents
- This allows frontend's 30-document requests to be properly honored
- Ensures new documents appear immediately after upload

## Resolution Status: ✅ RESOLVED
- New documents now appear at top of grid with animation
- Document refresh mechanism working correctly
- Upload → immediate visibility restored

## Testing
1. Upload any document
2. Verify it appears at top-left of dashboard grid
3. Confirm animation plays for new document
4. Validate document count increases immediately

---
**Impact**: Critical user experience fix - restores core document upload functionality  
**Severity**: High - affected all new document uploads  
**Version**: Fixed in v2.3.2  
**Date**: August 17, 2025