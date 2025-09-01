# PDF Processing Fails - pdf-parse 'latest' version not found

## Problem Description
PDF documents fail to process with the following error:
```
Cannot find module './pdf.js/latest/build/pdf.js'
Require stack:
- /app/node_modules/pdf-parse/lib/pdf-parse.js
- /app/node_modules/pdf-parse/index.js
- /app/server.js
```

Meanwhile, EPUB and other document types process successfully.

## Root Cause Analysis

### Investigation Results
1. **Library Structure**: The `pdf-parse` npm package (v1.1.1) contains multiple pdf.js versions:
   - `/app/node_modules/pdf-parse/lib/pdf.js/v1.10.100/`
   - `/app/node_modules/pdf-parse/lib/pdf.js/v1.10.88/`
   - `/app/node_modules/pdf-parse/lib/pdf.js/v1.9.426/`
   - `/app/node_modules/pdf-parse/lib/pdf.js/v2.0.550/`
   - **Missing**: `/app/node_modules/pdf-parse/lib/pdf.js/latest/`

2. **Configuration Issue**: Our PDF parser was configured with:
   ```javascript
   // api/src/services/processing/parsers/pdf.parser.js:14
   version: config.version || 'latest'
   ```

3. **Actual Error**: When `pdf-parse` tries to load the module:
   ```javascript
   // node_modules/pdf-parse/lib/pdf-parse.js
   PDFJS = require(`./pdf.js/${options.version}/build/pdf.js`);
   ```
   It looks for `./pdf.js/latest/build/pdf.js` which doesn't exist.

## Affected Files
- **Primary Issue**: `api/src/services/processing/parsers/pdf.parser.js:14`
- **Library**: `node_modules/pdf-parse/lib/pdf-parse.js`
- **Docker**: `api/Dockerfile` (for symlink fix)

## The Fix

### 1. Update Default Version
Changed the default version from non-existent `'latest'` to actual `'v1.10.100'`:
```diff
// api/src/services/processing/parsers/pdf.parser.js
- version: config.version || 'latest'
+ version: config.version || 'v1.10.100' // Fixed: Use actual version instead of non-existent 'latest'
```

### 2. Add Docker Symlink (Belt & Suspenders)
Added symlink creation in Dockerfile for backwards compatibility:
```dockerfile
# Fix pdf-parse 'latest' version issue by creating symlink
RUN cd /app/node_modules/pdf-parse/lib/pdf.js && \
    ln -s v1.10.100 latest || true
```

### 3. Version Fallback Logic
Added automatic fallback if version not found:
```javascript
try {
  pdfData = await pdfParse(buffer, parseOptions);
} catch (versionError) {
  if (versionError.message && versionError.message.includes('Cannot find module')) {
    this.logger.warn('PDF version not found, falling back to v1.10.100', {
      requestedVersion: this.config.version,
      error: versionError.message
    });
    parseOptions.version = 'v1.10.100';
    pdfData = await pdfParse(buffer, parseOptions);
  } else {
    throw versionError;
  }
}
```

## Testing Results
- ✅ PDF files now process successfully
- ✅ Chunks are properly generated
- ✅ Documents appear on homepage
- ✅ Processing completes without errors

## Why Not Migrate to pdfjs-dist?
Initially considered migrating to the modern `pdfjs-dist` library (v5.4.149), but research showed:
- `pdfjs-dist` is overly complex for simple text extraction
- Would require complete rewrite of PDF processing logic
- Has canvas dependency issues on ARM architectures
- `pdf-parse` works perfectly once the version issue is fixed

## Lessons Learned
1. Always verify that library defaults match actual available options
2. The `pdf-parse` package hasn't been updated in 7 years (last publish 2017)
3. Consider modern alternatives like `pdfjs-dist` for new projects
4. Add version validation to prevent similar issues

## Related Information
- npm package: https://www.npmjs.com/package/pdf-parse
- Version: 1.1.1 (7 years old)
- Alternative considered: pdfjs-dist v5.4.149