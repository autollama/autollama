# Document/Chunk Distinction Implementation

## Overview
This implementation adds support for distinguishing between Documents (user uploads) and Doc Chunks (created by AutoLlama), following LangChain's document/chunk pattern.

## Database Changes

### New Columns Added
- `record_type` VARCHAR(20) - Values: 'document' or 'chunk'
- `parent_document_id` UUID - Links chunks to their parent document

### New Views
- `documents_view` - Shows only document records
- `chunks_with_document` - Shows chunks with their parent document info
- `document_summaries` - Aggregates chunk data by document

### New Functions
- `create_document_record()` - Creates a document entry
- `getDocumentsOnly()` - Fetches only documents
- `getChunksByDocumentId()` - Gets chunks for a specific document
- `linkChunksToDocument()` - Links chunks to their parent document

## Implementation Steps

1. **Run Migration**
   ```bash
   ./run_document_migration.sh
   ```

2. **Update Processing Flow**
   When processing content:
   - Create a document record first
   - Store the document ID
   - Link all chunks to the parent document

3. **API Endpoints**
   - `/api/documents` - List all documents
   - `/api/document/:id/chunks` - Get chunks for a document

## Data Model

### Document Record
```json
{
  "record_type": "document",
  "url": "https://example.com/article",
  "title": "Article Title",
  "summary": "Document summary",
  "chunk_text": "Full content preview (first 5000 chars)",
  "upload_source": "user"
}
```

### Chunk Record
```json
{
  "record_type": "chunk",
  "parent_document_id": "uuid-of-parent-document",
  "chunk_text": "Actual chunk content",
  "chunk_index": 0,
  "contextual_summary": "Context-aware summary",
  "upload_source": "user"
}
```

## Benefits

1. **Clear Separation** - Documents vs Chunks are clearly distinguished
2. **Better Organization** - Chunks are linked to their parent documents
3. **Improved Queries** - Can query documents separately from chunks
4. **Analytics** - Can track document-level metrics
5. **UI Flexibility** - Can show document list with expandable chunks

## Migration Safety

- Existing records are marked as 'chunk' by default
- No data is lost during migration
- Views provide backward compatibility
- Can be rolled back if needed