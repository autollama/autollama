# AutoLlama Debug Session - In Progress Display Issue

## Current Issue
The "In Progress" view shows `undefined/262 chunks (NaN%)` instead of the actual progress numbers, even though file processing is working correctly and Airtable is being populated.

## Recent Changes Made
1. ✅ **Completed**: Added localStorage to remember last used tab (URL vs File Upload)
2. ✅ **Completed**: Added localStorage to remember last active view (sidebar navigation)
3. ✅ **Completed**: Added extensive debug logging to both frontend and backend
4. 🔄 **In Progress**: Fixing API response field mapping issues causing undefined display

## Current Status
- File upload and processing is working correctly
- Airtable "Processed URLs" table is being populated
- Session tracking exists in memory (`activeProcessingSessions` Map)
- Frontend makes successful API calls to `/api/in-progress`
- **Problem**: Frontend displays "undefined/262 chunks (NaN%)" despite API returning data

## Technical Details

### API Endpoint
- **URL**: `/api/in-progress`
- **Method**: GET
- **Returns**: Array of session objects with progress data

### Expected API Response Format
```javascript
{
  id: "session-id",
  filename: "file.epub", 
  totalChunks: 262,
  completedChunks: 6,
  processedChunks: 6,
  progress: 2,
  lastActivity: "2025-07-26T03:00:00.000Z",
  status: "processing",
  // ... other fields
}
```

### Frontend Display Logic
Located in `/home/chuck/homelab/autollama/config/view-manager.js`:
- Expects `session.completedChunks` and `session.totalChunks`
- Calculates progress as: `(completedChunks / totalChunks) * 100`
- Shows: `${completedChunks}/${totalChunks} chunks (${progress}%)`

## Files Modified
1. `/home/chuck/homelab/autollama/config/url-to-webhook-submitter.js` - Added localStorage restoration for tabs
2. `/home/chuck/homelab/autollama/config/view-manager.js` - Added localStorage for views + debug logging
3. `/home/chuck/homelab/autollama/config/index.html` - Updated script versions to v10
4. `/home/chuck/homelab/autollama/api/server.js` - Added debug logging to `/api/in-progress` endpoint

## Debug Evidence
- User confirmed: "File tab clicked! This proves clicking works"
- Processing shown: "Processing 262 chunks with session tracking... Processed 6/262 chunks (2%)"
- Issue: In Progress tab shows "undefined/262 chunks (NaN%)"
- Airtable is populating correctly

## Next Steps to Resume
1. Check API logs for debug output from session data
2. Compare actual API response vs frontend expectations
3. Fix field mapping between API response and frontend display
4. Add defensive programming to handle undefined values
5. Test with active file processing

## Resume Instructions
**File**: `DEBUG_SESSION_PROGRESS.md`

**Prompt to give LLM**:
```
I was working on fixing a bug in AutoLlama where the "In Progress" view shows "undefined/262 chunks (NaN%)" instead of actual progress numbers. The file processing works and Airtable gets populated, but the frontend display is broken. 

I've added debug logging to both the API endpoint (/api/in-progress) and frontend (view-manager.js) to see what data is being passed. The API endpoint maps session.processedChunks to completedChunks for the frontend, but something is still undefined.

Current status: Just rebuilt the API container with debug logging. Need to check what the debug logs show when a user clicks "In Progress" tab during active file processing, then fix the field mapping issue.

Please continue from where I left off and fix this undefined display issue.
```

## Container Commands
```bash
# Rebuild and restart API with changes
docker compose build autollama-api --no-cache && docker compose up -d autollama-api

# Monitor API logs for debug output  
docker compose logs -f autollama-api --tail=20

# Rebuild frontend container
docker compose build autollama --no-cache && docker compose up -d autollama
```

## Test Scenario
1. Upload a large file (like the EPUB mentioned)
2. Navigate away from the upload
3. Click "In Progress" tab in sidebar
4. Observe: Shows filename but "undefined/262 chunks (NaN%)"
5. Check API logs for debug session data output