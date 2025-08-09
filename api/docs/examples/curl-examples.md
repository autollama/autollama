# AutoLlama API - cURL Examples

This guide provides comprehensive cURL examples for testing and integrating with the AutoLlama Context Llama API.

## Basic Setup

```bash
# Set base URL and API key as environment variables
export AUTOLLAMA_BASE_URL="http://localhost:8080/api"
export AUTOLLAMA_API_KEY="your-api-key-here"  # If authentication is enabled

# Helper function for authenticated requests
api_call() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    
    if [ -n "$AUTOLLAMA_API_KEY" ]; then
        auth_header="-H \"Authorization: Bearer $AUTOLLAMA_API_KEY\""
    else
        auth_header=""
    fi
    
    if [ "$method" = "GET" ]; then
        eval curl -s -X GET "$AUTOLLAMA_BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            $auth_header
    else
        eval curl -s -X "$method" "$AUTOLLAMA_BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            $auth_header \
            -d "'$data'"
    fi
}
```

## Health Checks

### Basic Health Check
```bash
# Simple health check
curl -X GET "$AUTOLLAMA_BASE_URL/health" \
  -H "Content-Type: application/json"

# Expected response:
# {
#   "success": true,
#   "status": "healthy",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "uptime": 86400
# }
```

### Comprehensive Health Check
```bash
# Detailed system health
curl -X GET "$AUTOLLAMA_BASE_URL/health/comprehensive" \
  -H "Content-Type: application/json"

# Pretty print the JSON response
curl -X GET "$AUTOLLAMA_BASE_URL/health/comprehensive" \
  -H "Content-Type: application/json" | jq '.'
```

### System Status
```bash
# Get system performance metrics
curl -X GET "$AUTOLLAMA_BASE_URL/system/status" \
  -H "Content-Type: application/json" | jq '.system, .performance'
```

## Content Processing

### Process URL (Synchronous)
```bash
# Basic URL processing
curl -X POST "$AUTOLLAMA_BASE_URL/process-url" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/article",
    "chunkSize": 1000,
    "overlap": 100,
    "enableContextualEmbeddings": true
  }'

# Process with custom settings
curl -X POST "$AUTOLLAMA_BASE_URL/process-url" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://arxiv.org/abs/2301.00001",
    "chunkSize": 1200,
    "overlap": 150,
    "enableContextualEmbeddings": true
  }' | jq '.sessionId, .results'
```

### Process URL with Streaming
```bash
# Start streaming URL processing
RESPONSE=$(curl -X POST "$AUTOLLAMA_BASE_URL/process-url-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/long-article",
    "chunkSize": 1000,
    "enableContextualEmbeddings": true
  }')

# Extract session ID
SESSION_ID=$(echo "$RESPONSE" | jq -r '.sessionId')
echo "Processing started with session: $SESSION_ID"

# Monitor progress
while true; do
  STATUS=$(curl -s -X GET "$AUTOLLAMA_BASE_URL/processing/status/$SESSION_ID" | jq -r '.session.status')
  PROGRESS=$(curl -s -X GET "$AUTOLLAMA_BASE_URL/processing/status/$SESSION_ID" | jq -r '.progress // 0')
  
  echo "Status: $STATUS, Progress: $PROGRESS%"
  
  if [ "$STATUS" = "completed" ]; then
    echo "Processing completed!"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Processing failed!"
    break
  fi
  
  sleep 5
done
```

### File Upload
```bash
# Upload and process a PDF file
curl -X POST "$AUTOLLAMA_BASE_URL/process-file" \
  -F "file=@./documents/research-paper.pdf" \
  -F "chunkSize=1200" \
  -F "overlap=150" \
  -F "enableContextualEmbeddings=true"

# Upload with progress monitoring
curl -X POST "$AUTOLLAMA_BASE_URL/process-file-stream" \
  -F "file=@./documents/large-document.pdf" \
  -F "chunkSize=800" \
  -F "overlap=100" \
  -F "enableContextualEmbeddings=true" | jq '.sessionId'

# Upload multiple file types
curl -X POST "$AUTOLLAMA_BASE_URL/process-file" \
  -F "file=@./documents/report.docx" \
  -F "chunkSize=1000"

curl -X POST "$AUTOLLAMA_BASE_URL/process-file" \
  -F "file=@./documents/data.csv" \
  -F "chunkSize=500"
```

### Pre-Upload Check
```bash
# Check system readiness before upload
curl -X POST "$AUTOLLAMA_BASE_URL/pre-upload-check" \
  -H "Content-Type: application/json" | jq '.ready, .checks, .recommendations'
```

## Search Operations

### Basic Search
```bash
# Simple text search
curl -X GET "$AUTOLLAMA_BASE_URL/search?q=artificial%20intelligence&limit=10" \
  -H "Content-Type: application/json" | jq '.results[] | {title, similarity_score, chunk_text: .chunk_text[:100]}'

# Search with advanced parameters
curl -X GET "$AUTOLLAMA_BASE_URL/search" \
  -H "Content-Type: application/json" \
  -G \
  -d "q=machine learning neural networks" \
  -d "limit=20" \
  -d "offset=0" \
  -d "includeChunks=true" \
  -d "threshold=0.8"

# Search and extract key information
curl -X GET "$AUTOLLAMA_BASE_URL/search?q=deep%20learning&limit=5" \
  -H "Content-Type: application/json" | \
  jq '.results[] | "Score: \(.similarity_score | floor * 1000 / 1000) - \(.title)"'
```

### Vector Search
```bash
# Pure vector similarity search
curl -X POST "$AUTOLLAMA_BASE_URL/search/vector" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "neural networks deep learning algorithms",
    "limit": 10,
    "threshold": 0.85
  }' | jq '.results[] | {score, title: .content.title}'

# Vector search with lower threshold
curl -X POST "$AUTOLLAMA_BASE_URL/search/vector" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "natural language processing",
    "limit": 15,
    "threshold": 0.7
  }'
```

### Document Search
```bash
# Search documents by title and content
curl -X GET "$AUTOLLAMA_BASE_URL/search/documents" \
  -H "Content-Type: application/json" \
  -G \
  -d "q=research papers" \
  -d "sortBy=created_at" \
  -d "sortOrder=desc" \
  -d "limit=10" | jq '.documents[] | {title, chunk_count, created_at}'

# Search with specific sorting
curl -X GET "$AUTOLLAMA_BASE_URL/search/documents?q=AI&sortBy=relevance&limit=5" \
  -H "Content-Type: application/json" | jq '.total, .documents[].title'
```

### Similar Chunks
```bash
# Find similar chunks (replace with actual chunk ID)
CHUNK_ID="your-chunk-id-here"
curl -X GET "$AUTOLLAMA_BASE_URL/search/similar/$CHUNK_ID?limit=5" \
  -H "Content-Type: application/json" | jq '.similarChunks[] | {chunk_id, similarity_score}'
```

## Document Management

### List Documents
```bash
# Get all documents with pagination
curl -X GET "$AUTOLLAMA_BASE_URL/documents?page=1&limit=20" \
  -H "Content-Type: application/json" | jq '.documents[] | {document_id, title, chunk_count, status}'

# Search documents by title
curl -X GET "$AUTOLLAMA_BASE_URL/documents" \
  -H "Content-Type: application/json" \
  -G \
  -d "search=research" \
  -d "limit=10" \
  -d "sortBy=updated_at" | jq '.documents[].title'

# Get document count
curl -X GET "$AUTOLLAMA_BASE_URL/documents?limit=1" \
  -H "Content-Type: application/json" | jq '.pagination.total'
```

### Get Document Details
```bash
# Get specific document (replace with actual document ID)
DOC_ID="your-document-id-here"
curl -X GET "$AUTOLLAMA_BASE_URL/documents/$DOC_ID" \
  -H "Content-Type: application/json" | jq '.document | {title, chunk_count, status, created_at}'

# Get document with limited chunks
curl -X GET "$AUTOLLAMA_BASE_URL/documents/$DOC_ID?chunkLimit=10" \
  -H "Content-Type: application/json" | jq '.chunks[] | {chunk_index, sentiment, contextual_summary}'

# Get document metadata only
curl -X GET "$AUTOLLAMA_BASE_URL/documents/$DOC_ID?chunkLimit=0" \
  -H "Content-Type: application/json" | jq '.document.metadata'
```

### Update Document
```bash
# Update document metadata
DOC_ID="your-document-id-here"
curl -X PUT "$AUTOLLAMA_BASE_URL/documents/$DOC_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Research Paper Title",
    "metadata": {
      "category": "research",
      "tags": ["ai", "machine-learning", "neural-networks"],
      "priority": "high",
      "notes": "Important paper on latest AI developments"
    }
  }' | jq '.document.title, .document.metadata'

# Update just the title
curl -X PUT "$AUTOLLAMA_BASE_URL/documents/$DOC_ID" \
  -H "Content-Type: application/json" \
  -d '{"title": "New Document Title"}'
```

### Delete Document
```bash
# Delete document and all associated data
DOC_ID="your-document-id-here"
curl -X DELETE "$AUTOLLAMA_BASE_URL/documents/$DOC_ID" \
  -H "Content-Type: application/json" | jq '.message, .deletedChunks, .vectorEntriesDeleted'

# Confirm deletion
curl -X GET "$AUTOLLAMA_BASE_URL/documents/$DOC_ID" \
  -H "Content-Type: application/json" 2>/dev/null || echo "Document successfully deleted"
```

### Get Document Chunks
```bash
# Get paginated chunks for a document
DOC_ID="your-document-id-here"
curl -X GET "$AUTOLLAMA_BASE_URL/documents/$DOC_ID/chunks?page=1&limit=10" \
  -H "Content-Type: application/json" | jq '.chunks[] | {chunk_index, sentiment, main_topics}'

# Search within document chunks
curl -X GET "$AUTOLLAMA_BASE_URL/documents/$DOC_ID/chunks" \
  -H "Content-Type: application/json" \
  -G \
  -d "search=specific topic" \
  -d "limit=5" | jq '.chunks[] | {chunk_text: .chunk_text[:100], contextual_summary}'

# Get chunks with embeddings (warning: large response)
curl -X GET "$AUTOLLAMA_BASE_URL/documents/$DOC_ID/chunks?includeEmbeddings=true&limit=1" \
  -H "Content-Type: application/json" | jq '.chunks[0] | {chunk_id, embedding: (.embedding | length)}'
```

### Document Statistics
```bash
# Get comprehensive document statistics
DOC_ID="your-document-id-here"
curl -X GET "$AUTOLLAMA_BASE_URL/documents/$DOC_ID/stats" \
  -H "Content-Type: application/json" | jq '.stats'

# Get specific stats
curl -X GET "$AUTOLLAMA_BASE_URL/documents/$DOC_ID/stats" \
  -H "Content-Type: application/json" | \
  jq '.stats | {totalChunks, completedChunks, avgChunkSize, processingTime, sentimentDistribution}'
```

### Reprocess Document
```bash
# Trigger document reprocessing with new parameters
DOC_ID="your-document-id-here"
curl -X POST "$AUTOLLAMA_BASE_URL/documents/$DOC_ID/reprocess" \
  -H "Content-Type: application/json" \
  -d '{
    "chunkSize": 1200,
    "overlap": 150,
    "enableContextualEmbeddings": true
  }' | jq '.message, .document.status'
```

## Session Management

### Processing Status
```bash
# Check processing session status
SESSION_ID="your-session-id-here"
curl -X GET "$AUTOLLAMA_BASE_URL/processing/status/$SESSION_ID" \
  -H "Content-Type: application/json" | jq '.session.status, .progress, .isActive'

# Monitor multiple sessions
for session in "session-1" "session-2" "session-3"; do
  STATUS=$(curl -s -X GET "$AUTOLLAMA_BASE_URL/processing/status/$session" | jq -r '.session.status // "not_found"')
  echo "Session $session: $STATUS"
done
```

### Processing Queue
```bash
# Get current processing queue
curl -X GET "$AUTOLLAMA_BASE_URL/processing/queue" \
  -H "Content-Type: application/json" | jq '.summary'

# Get detailed queue information
curl -X GET "$AUTOLLAMA_BASE_URL/processing/queue" \
  -H "Content-Type: application/json" | jq '.queue | {active: .active | length, waiting: .waiting | length}'

# List active sessions
curl -X GET "$AUTOLLAMA_BASE_URL/processing/queue" \
  -H "Content-Type: application/json" | jq '.queue.active[] | {session_id, progress, started_at}'
```

### Cleanup Operations
```bash
# Clean up stuck sessions
curl -X POST "$AUTOLLAMA_BASE_URL/processing/cleanup" \
  -H "Content-Type: application/json" | jq '.cleanedSessions, .details'

# Check cleanup status before running
curl -X GET "$AUTOLLAMA_BASE_URL/processing/queue" \
  -H "Content-Type: application/json" | jq '.summary.failed'

# Run cleanup and check results
curl -X POST "$AUTOLLAMA_BASE_URL/processing/cleanup" \
  -H "Content-Type: application/json" | jq '.message'
```

## Settings Management

### Get Settings
```bash
# Get all system settings
curl -X GET "$AUTOLLAMA_BASE_URL/settings" \
  -H "Content-Type: application/json" | jq '.settings'

# Get specific setting category
curl -X GET "$AUTOLLAMA_BASE_URL/settings" \
  -H "Content-Type: application/json" | jq '.settings.processing'

# Get individual setting
curl -X GET "$AUTOLLAMA_BASE_URL/settings/processing.defaultChunkSize" \
  -H "Content-Type: application/json" | jq '.value'
```

### Update Settings
```bash
# Update processing settings
curl -X POST "$AUTOLLAMA_BASE_URL/settings" \
  -H "Content-Type: application/json" \
  -d '{
    "processing": {
      "defaultChunkSize": 1200,
      "defaultOverlap": 150,
      "enableContextualEmbeddings": true
    },
    "search": {
      "defaultLimit": 25,
      "defaultThreshold": 0.75
    }
  }' | jq '.settings.processing'
```

## Batch Operations and Automation

### Process Multiple URLs
```bash
#!/bin/bash
# Script to process multiple URLs

URLS=(
  "https://example.com/article1"
  "https://example.com/article2"
  "https://example.com/article3"
)

SESSION_IDS=()

# Start all processing
for url in "${URLS[@]}"; do
  echo "Processing: $url"
  
  RESPONSE=$(curl -s -X POST "$AUTOLLAMA_BASE_URL/process-url-stream" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\", \"chunkSize\": 1000}")
  
  SESSION_ID=$(echo "$RESPONSE" | jq -r '.sessionId')
  SESSION_IDS+=("$SESSION_ID")
  echo "Started session: $SESSION_ID"
done

# Monitor all sessions
echo "Monitoring sessions..."
while true; do
  all_complete=true
  
  for session_id in "${SESSION_IDS[@]}"; do
    STATUS=$(curl -s -X GET "$AUTOLLAMA_BASE_URL/processing/status/$session_id" | jq -r '.session.status')
    
    if [ "$STATUS" != "completed" ] && [ "$STATUS" != "failed" ]; then
      all_complete=false
    fi
    
    echo "Session $session_id: $STATUS"
  done
  
  if [ "$all_complete" = true ]; then
    echo "All sessions completed!"
    break
  fi
  
  sleep 10
done
```

### Bulk Document Operations
```bash
#!/bin/bash
# Bulk document management

# Get all documents and update metadata
DOCUMENTS=$(curl -s -X GET "$AUTOLLAMA_BASE_URL/documents?limit=100" | jq -r '.documents[].document_id')

for doc_id in $DOCUMENTS; do
  echo "Updating document: $doc_id"
  
  curl -s -X PUT "$AUTOLLAMA_BASE_URL/documents/$doc_id" \
    -H "Content-Type: application/json" \
    -d '{
      "metadata": {
        "lastReviewed": "'$(date -Iseconds)'",
        "bulkUpdated": true
      }
    }' > /dev/null
done

echo "Bulk update completed"
```

### Search and Export Results
```bash
#!/bin/bash
# Search and export results to CSV

QUERY="artificial intelligence"
OUTPUT_FILE="search_results.csv"

echo "query,title,similarity_score,url,chunk_index" > "$OUTPUT_FILE"

RESULTS=$(curl -s -X GET "$AUTOLLAMA_BASE_URL/search" \
  -G -d "q=$QUERY" -d "limit=100" | jq -r '.results[]')

echo "$RESULTS" | jq -r "[\"$QUERY\", .title, .similarity_score, .url, .chunk_index] | @csv" >> "$OUTPUT_FILE"

echo "Results exported to $OUTPUT_FILE"
```

### Health Monitoring Script
```bash
#!/bin/bash
# Continuous health monitoring

LOG_FILE="autollama_health.log"

while true; do
  TIMESTAMP=$(date -Iseconds)
  
  # Get health status
  HEALTH=$(curl -s -X GET "$AUTOLLAMA_BASE_URL/health" | jq -r '.status')
  
  # Get queue status
  QUEUE=$(curl -s -X GET "$AUTOLLAMA_BASE_URL/processing/queue" | jq '.summary.active')
  
  # Log status
  echo "$TIMESTAMP,health=$HEALTH,active_sessions=$QUEUE" >> "$LOG_FILE"
  
  # Alert if unhealthy
  if [ "$HEALTH" != "healthy" ]; then
    echo "ALERT: AutoLlama API is $HEALTH at $TIMESTAMP"
  fi
  
  sleep 60  # Check every minute
done
```

## Testing and Debugging

### Validate API Responses
```bash
# Test all endpoints for basic functionality
echo "Testing AutoLlama API endpoints..."

# Health check
echo -n "Health check: "
curl -s -X GET "$AUTOLLAMA_BASE_URL/health" | jq -r '.status'

# Search
echo -n "Search test: "
curl -s -X GET "$AUTOLLAMA_BASE_URL/search?q=test&limit=1" | jq -r '.success'

# Document list
echo -n "Document list: "
curl -s -X GET "$AUTOLLAMA_BASE_URL/documents?limit=1" | jq -r '.success'

# Processing queue
echo -n "Processing queue: "
curl -s -X GET "$AUTOLLAMA_BASE_URL/processing/queue" | jq -r '.success'

echo "API testing completed"
```

### Performance Testing
```bash
#!/bin/bash
# Simple performance test

ENDPOINT="$AUTOLLAMA_BASE_URL/health"
REQUESTS=100

echo "Running $REQUESTS requests to $ENDPOINT"

START_TIME=$(date +%s)

for i in $(seq 1 $REQUESTS); do
  curl -s -X GET "$ENDPOINT" > /dev/null
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
RPS=$((REQUESTS / DURATION))

echo "Completed $REQUESTS requests in ${DURATION}s (${RPS} req/s)"
```

This comprehensive cURL guide provides examples for all major AutoLlama API operations, including automation scripts and monitoring tools.