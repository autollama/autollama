# AutoLlama API Integration Guide

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [Content Processing](#content-processing)
5. [Search & Retrieval](#search--retrieval)
6. [Real-time Updates](#real-time-updates)
7. [Error Handling](#error-handling)
8. [Rate Limiting](#rate-limiting)
9. [SDK & Libraries](#sdk--libraries)
10. [Integration Examples](#integration-examples)
11. [Best Practices](#best-practices)
12. [Troubleshooting](#troubleshooting)

## Overview

AutoLlama v2.1 provides a comprehensive REST API for integrating intelligent content processing and retrieval capabilities into your applications. The API supports contextual embeddings, real-time processing updates, and advanced search functionality.

### API Base URL

```
Development: http://localhost:8080/api
Production:  https://autollama.yourdomain.com/api
```

### API Features

- **Content Processing**: URLs, PDFs, EPUB, DOCX, CSV files
- **Contextual Embeddings**: 35% better retrieval accuracy
- **Real-time Updates**: Server-Sent Events for processing status
- **Advanced Search**: Vector similarity + BM25 hybrid search
- **Multi-format Support**: Various content types and file formats
- **Comprehensive Metadata**: 15+ extracted fields per content chunk

## Authentication

### Current Authentication

AutoLlama v2.1 currently operates without authentication for simplicity in development and self-hosted environments. All endpoints are publicly accessible within your network.

### Future Authentication (Planned)

```javascript
// Future API key authentication
const headers = {
  'Authorization': 'Bearer your-api-key-here',
  'Content-Type': 'application/json'
};

// Future JWT authentication
const headers = {
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  'Content-Type': 'application/json'
};
```

## API Endpoints

### Health & Status

#### GET /api/health
Basic health check endpoint.

```bash
curl http://localhost:8080/api/health
```

Response:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-08-03T10:30:00Z",
  "version": "2.2.0"
}
```

#### GET /api/health/detailed
Comprehensive health check with service status.

```bash
curl http://localhost:8080/api/health/detailed
```

Response:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-08-03T10:30:00Z",
  "services": {
    "database": {
      "status": "healthy",
      "response_time": 45
    },
    "qdrant": {
      "status": "healthy",
      "response_time": 120
    },
    "openai": {
      "status": "healthy",
      "response_time": 890
    }
  },
  "performance": {
    "memory_usage": "1.2GB",
    "cpu_usage": "15%",
    "active_sessions": 3
  }
}
```

### Content Processing

#### POST /api/process-url
Process a URL with basic response.

```javascript
// Basic URL processing
const response = await fetch('http://localhost:8080/api/process-url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: 'https://en.wikipedia.org/wiki/Machine_learning',
    chunkSize: 1200,
    chunkOverlap: 200,
    enableContextualEmbeddings: true
  })
});

const result = await response.json();
console.log('Document processed:', result.data.documentId);
```

Response:
```json
{
  "success": true,
  "data": {
    "documentId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Machine learning - Wikipedia",
    "url": "https://en.wikipedia.org/wiki/Machine_learning",
    "chunksCreated": 47,
    "processingTime": 67400,
    "usesContextualEmbeddings": true,
    "status": "completed"
  },
  "metadata": {
    "timestamp": "2025-08-03T10:30:00Z",
    "api_version": "2.2.0",
    "processing_model": "gpt-4o-mini"
  }
}
```

#### POST /api/process-url-stream
Process a URL with real-time streaming updates.

```javascript
// Streaming URL processing with Server-Sent Events
async function processUrlWithUpdates(url) {
  const response = await fetch('http://localhost:8080/api/process-url-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: url,
      chunkSize: 1200,
      enableContextualEmbeddings: true
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.substring(6));
        handleProgressUpdate(data);
      }
    }
  }
}

function handleProgressUpdate(data) {
  switch (data.event) {
    case 'progress':
      console.log(`Progress: ${data.data.progress}% - ${data.data.message}`);
      break;
    case 'chunk_processed':
      console.log(`Chunk ${data.data.index} processed: ${data.data.title}`);
      break;
    case 'completed':
      console.log('Processing completed:', data.data);
      break;
    case 'error':
      console.error('Processing error:', data.data.error);
      break;
  }
}
```

#### POST /api/process-file
Upload and process files (PDF, EPUB, DOCX, CSV).

```javascript
// File upload with FormData
async function processFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('chunkSize', '1200');
  formData.append('enableContextualEmbeddings', 'true');

  const response = await fetch('http://localhost:8080/api/process-file', {
    method: 'POST',
    body: formData
  });

  return await response.json();
}

// Example usage
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const result = await processFile(file);
```

#### POST /api/process-file-stream
Upload and process files with streaming updates.

```javascript
// File upload with streaming
async function processFileWithUpdates(file, onProgress) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('chunkSize', '1500');
  formData.append('enableContextualEmbeddings', 'true');

  const response = await fetch('http://localhost:8080/api/process-file-stream', {
    method: 'POST',
    body: formData
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.substring(6));
          onProgress(data);
        } catch (e) {
          console.warn('Failed to parse SSE data:', line);
        }
      }
    }
  }
}
```

### Data Retrieval

#### GET /api/documents
Get paginated list of processed documents.

```javascript
// Get documents with pagination and filtering
async function getDocuments(page = 1, limit = 20, filters = {}) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...filters
  });

  const response = await fetch(`http://localhost:8080/api/documents?${params}`);
  return await response.json();
}

// Example usage
const documents = await getDocuments(1, 20, {
  category: 'academic',
  technical_level: 'advanced',
  sentiment: 'positive'
});
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "document_id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Machine learning - Wikipedia",
      "url": "https://en.wikipedia.org/wiki/Machine_learning",
      "category": "academic",
      "technical_level": "advanced",
      "sentiment": "neutral",
      "chunk_count": 47,
      "uses_contextual_embeddings": true,
      "created_at": "2025-08-03T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "pages": 8
  }
}
```

#### GET /api/record/:id
Get detailed information about a specific document.

```javascript
// Get document details
async function getDocument(documentId) {
  const response = await fetch(`http://localhost:8080/api/record/${documentId}`);
  return await response.json();
}

const document = await getDocument('550e8400-e29b-41d4-a716-446655440000');
```

Response:
```json
{
  "success": true,
  "data": {
    "document_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Machine learning - Wikipedia",
    "url": "https://en.wikipedia.org/wiki/Machine_learning",
    "summary": "Comprehensive overview of machine learning concepts...",
    "content_type": "article",
    "category": "academic",
    "technical_level": "advanced",
    "sentiment": "neutral",
    "emotions": ["trust", "anticipation"],
    "people": ["Alan Turing", "Arthur Samuel"],
    "organizations": ["MIT", "Stanford"],
    "locations": ["United States", "Europe"],
    "key_concepts": ["neural networks", "supervised learning", "deep learning"],
    "main_topics": ["artificial intelligence", "computer science", "algorithms"],
    "tags": ["AI", "ML", "algorithms", "data science"],
    "chunk_count": 47,
    "uses_contextual_embeddings": true,
    "processing_duration": 67400,
    "embedding_model": "text-embedding-3-small",
    "contextual_model": "gpt-4o-mini",
    "created_at": "2025-08-03T10:30:00Z",
    "updated_at": "2025-08-03T10:31:07Z"
  }
}
```

#### GET /api/chunks/:documentId
Get all chunks for a specific document.

```javascript
// Get document chunks
async function getDocumentChunks(documentId, includeContext = true) {
  const params = new URLSearchParams({
    include_context: includeContext.toString()
  });

  const response = await fetch(
    `http://localhost:8080/api/chunks/${documentId}?${params}`
  );
  return await response.json();
}

const chunks = await getDocumentChunks('550e8400-e29b-41d4-a716-446655440000');
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "chunk_index": 0,
      "chunk_text": "Machine learning (ML) is a field of artificial intelligence...",
      "contextual_summary": "This is the introductory chunk of a Wikipedia article about machine learning, providing the basic definition and scope of the field.",
      "word_count": 187,
      "character_count": 1198,
      "uses_contextual_embedding": true,
      "processed_at": "2025-08-03T10:30:15Z"
    }
  ],
  "metadata": {
    "document_id": "550e8400-e29b-41d4-a716-446655440000",
    "total_chunks": 47,
    "contextual_chunks": 47
  }
}
```

## Search & Retrieval

#### GET /api/search
Perform hybrid search across all processed content.

```javascript
// Basic search
async function search(query, options = {}) {
  const params = new URLSearchParams({
    q: query,
    limit: options.limit || 20,
    threshold: options.threshold || 0.7,
    ...options
  });

  const response = await fetch(`http://localhost:8080/api/search?${params}`);
  return await response.json();
}

// Advanced search with filters
const results = await search('machine learning algorithms', {
  limit: 50,
  threshold: 0.8,
  category: 'academic',
  technical_level: 'advanced',
  date_from: '2024-01-01',
  include_context: true
});
```

Response:
```json
{
  "success": true,
  "data": {
    "query": "machine learning algorithms",
    "results": [
      {
        "document_id": "550e8400-e29b-41d4-a716-446655440000",
        "chunk_id": 5,
        "title": "Machine learning - Wikipedia",
        "chunk_text": "Supervised learning algorithms build a mathematical model...",
        "contextual_summary": "This chunk explains supervised learning algorithms within the broader context of machine learning approaches.",
        "similarity_score": 0.89,
        "bm25_score": 15.7,
        "combined_score": 0.92,
        "url": "https://en.wikipedia.org/wiki/Machine_learning",
        "category": "academic",
        "technical_level": "advanced",
        "created_at": "2025-08-03T10:30:00Z"
      }
    ],
    "total_results": 127,
    "search_time_ms": 45,
    "filters_applied": {
      "category": "academic",
      "technical_level": "advanced"
    }
  }
}
```

#### POST /api/search/semantic
Perform semantic search using only vector similarity.

```javascript
// Semantic search
async function semanticSearch(query, options = {}) {
  const response = await fetch('http://localhost:8080/api/search/semantic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: query,
      limit: options.limit || 20,
      threshold: options.threshold || 0.7,
      filters: options.filters || {}
    })
  });

  return await response.json();
}

const semanticResults = await semanticSearch('neural network architectures', {
  limit: 30,
  threshold: 0.8,
  filters: {
    technical_level: 'advanced',
    uses_contextual_embeddings: true
  }
});
```

## Real-time Updates

### Server-Sent Events (SSE)

AutoLlama provides real-time updates through Server-Sent Events for long-running operations.

```javascript
// Generic SSE handler
class AutoLlamaSSEClient {
  constructor(baseUrl = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
    this.eventSources = new Map();
  }

  // Subscribe to processing updates
  subscribeToProcessing(sessionId, handlers = {}) {
    const eventSource = new EventSource(
      `${this.baseUrl}/api/stream/${sessionId}`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleEvent(data, handlers);
      } catch (error) {
        console.error('Failed to parse SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      handlers.onError?.(error);
    };

    this.eventSources.set(sessionId, eventSource);
    return eventSource;
  }

  handleEvent(data, handlers) {
    switch (data.event) {
      case 'started':
        handlers.onStarted?.(data.data);
        break;
      case 'progress':
        handlers.onProgress?.(data.data);
        break;
      case 'chunk_processed':
        handlers.onChunkProcessed?.(data.data);
        break;
      case 'completed':
        handlers.onCompleted?.(data.data);
        this.cleanup(data.data.session_id);
        break;
      case 'error':
        handlers.onError?.(data.data);
        this.cleanup(data.data.session_id);
        break;
      default:
        console.warn('Unknown SSE event:', data.event);
    }
  }

  cleanup(sessionId) {
    const eventSource = this.eventSources.get(sessionId);
    if (eventSource) {
      eventSource.close();
      this.eventSources.delete(sessionId);
    }
  }

  closeAll() {
    this.eventSources.forEach((eventSource) => eventSource.close());
    this.eventSources.clear();
  }
}

// Usage example
const sseClient = new AutoLlamaSSEClient();

async function processUrlWithLiveUpdates(url) {
  // Start processing
  const response = await fetch('http://localhost:8080/api/process-url-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });

  // Get session ID from initial response
  const initialData = await response.json();
  const sessionId = initialData.session_id;

  // Subscribe to updates
  sseClient.subscribeToProcessing(sessionId, {
    onStarted: (data) => {
      console.log('Processing started:', data);
      updateUI({ status: 'processing', message: 'Starting...' });
    },
    
    onProgress: (data) => {
      console.log(`Progress: ${data.progress}%`);
      updateUI({ 
        status: 'processing', 
        progress: data.progress, 
        message: data.message 
      });
    },
    
    onChunkProcessed: (data) => {
      console.log(`Chunk ${data.index} processed:`, data.title);
      addChunkToUI(data);
    },
    
    onCompleted: (data) => {
      console.log('Processing completed:', data);
      updateUI({ 
        status: 'completed', 
        documentId: data.document_id,
        message: `Processing completed. Created ${data.chunks_created} chunks.`
      });
    },
    
    onError: (error) => {
      console.error('Processing failed:', error);
      updateUI({ 
        status: 'error', 
        message: error.message || 'Processing failed' 
      });
    }
  });
}
```

### WebSocket Alternative

For applications requiring bidirectional communication:

```javascript
// WebSocket client (if WebSocket support is enabled)
class AutoLlamaWebSocketClient {
  constructor(baseUrl = 'ws://localhost:3003') {
    this.baseUrl = baseUrl;
    this.socket = null;
    this.handlers = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.baseUrl);
      
      this.socket.onopen = () => {
        console.log('WebSocket connected');
        resolve();
      };
      
      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
      
      this.socket.onclose = () => {
        console.log('WebSocket disconnected');
      };
    });
  }

  subscribe(channel, handler) {
    this.handlers.set(channel, handler);
    this.send({ type: 'subscribe', channel });
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  handleMessage(data) {
    const handler = this.handlers.get(data.channel);
    if (handler) {
      handler(data);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
    }
  }
}
```

## Error Handling

### Error Response Format

All API errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Additional error details",
    "field": "fieldName",
    "suggestion": "Suggested fix or next steps"
  },
  "metadata": {
    "timestamp": "2025-08-03T10:30:00Z",
    "request_id": "req_123456",
    "api_version": "2.2.0"
  }
}
```

### Common Error Codes

```javascript
const ERROR_CODES = {
  // Validation errors (400)
  'VALIDATION_ERROR': 'Invalid input parameters',
  'INVALID_URL': 'URL format is invalid or unreachable',
  'FILE_TOO_LARGE': 'File exceeds maximum size limit',
  'UNSUPPORTED_FORMAT': 'File format is not supported',
  
  // Authentication errors (401)
  'UNAUTHORIZED': 'Authentication required',
  'INVALID_TOKEN': 'Token is invalid or expired',
  
  // Permission errors (403)
  'FORBIDDEN': 'Insufficient permissions',
  'DOMAIN_BLOCKED': 'Domain is not allowed',
  
  // Rate limiting (429)
  'RATE_LIMIT_EXCEEDED': 'Rate limit exceeded',
  'QUOTA_EXCEEDED': 'API quota exceeded',
  
  // Processing errors (422)
  'PROCESSING_FAILED': 'Content processing failed',
  'AI_SERVICE_ERROR': 'AI service temporarily unavailable',
  'PARSING_ERROR': 'Failed to parse content',
  
  // Server errors (500)
  'INTERNAL_ERROR': 'Internal server error',
  'DATABASE_ERROR': 'Database operation failed',
  'EXTERNAL_SERVICE_ERROR': 'External service unavailable'
};
```

### Error Handling Best Practices

```javascript
// Comprehensive error handling
async function makeAPIRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    
    // Handle HTTP errors
    if (!response.ok) {
      const errorData = await response.json();
      throw new AutoLlamaAPIError(
        errorData.error.message,
        errorData.error.code,
        response.status,
        errorData
      );
    }
    
    return await response.json();
    
  } catch (error) {
    if (error instanceof AutoLlamaAPIError) {
      throw error;
    }
    
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new AutoLlamaAPIError(
        'Network error: Unable to connect to AutoLlama API',
        'NETWORK_ERROR',
        0,
        { originalError: error }
      );
    }
    
    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      throw new AutoLlamaAPIError(
        'Invalid response format from API',
        'PARSE_ERROR',
        0,
        { originalError: error }
      );
    }
    
    throw error;
  }
}

// Custom error class
class AutoLlamaAPIError extends Error {
  constructor(message, code, statusCode, details = {}) {
    super(message);
    this.name = 'AutoLlamaAPIError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  isRetryable() {
    return this.statusCode >= 500 || this.code === 'RATE_LIMIT_EXCEEDED';
  }

  getRetryDelay() {
    if (this.code === 'RATE_LIMIT_EXCEEDED') {
      return this.details.retry_after * 1000 || 60000;
    }
    return Math.min(1000 * Math.pow(2, this.retryCount || 0), 30000);
  }
}

// Usage with retry logic
async function processUrlWithRetry(url, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await makeAPIRequest('http://localhost:8080/api/process-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
    } catch (error) {
      lastError = error;
      
      if (!(error instanceof AutoLlamaAPIError) || !error.isRetryable()) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = error.getRetryDelay();
        console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}
```

## Rate Limiting

### Rate Limit Information

Rate limits are included in response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 85
X-RateLimit-Reset: 1691936400
X-RateLimit-Window: 900
```

### Handling Rate Limits

```javascript
// Rate limit aware client
class RateLimitedClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.remainingRequests = 100;
    this.resetTime = Date.now() + 900000;
  }

  async makeRequest(endpoint, options = {}) {
    // Check rate limit
    if (this.remainingRequests <= 0 && Date.now() < this.resetTime) {
      const waitTime = this.resetTime - Date.now();
      throw new AutoLlamaAPIError(
        `Rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds`,
        'RATE_LIMIT_EXCEEDED',
        429,
        { retry_after: Math.ceil(waitTime / 1000) }
      );
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, options);
    
    // Update rate limit info from headers
    this.updateRateLimitInfo(response.headers);
    
    return response;
  }

  updateRateLimitInfo(headers) {
    this.remainingRequests = parseInt(headers.get('X-RateLimit-Remaining')) || 0;
    this.resetTime = parseInt(headers.get('X-RateLimit-Reset')) * 1000 || Date.now();
  }

  getRemainingRequests() {
    return this.remainingRequests;
  }

  getTimeUntilReset() {
    return Math.max(0, this.resetTime - Date.now());
  }
}
```

## SDK & Libraries

### JavaScript/TypeScript SDK

```typescript
// AutoLlama TypeScript SDK
interface ProcessingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  enableContextualEmbeddings?: boolean;
  aiModel?: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-3.5-turbo';
}

interface SearchOptions {
  limit?: number;
  threshold?: number;
  filters?: {
    category?: string;
    technical_level?: string;
    sentiment?: string;
    date_from?: string;
    date_to?: string;
  };
}

class AutoLlamaSDK {
  private baseUrl: string;
  private headers: HeadersInit;

  constructor(baseUrl: string = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
    this.headers = {
      'Content-Type': 'application/json'
    };
  }

  // Process URL
  async processUrl(
    url: string, 
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const response = await fetch(`${this.baseUrl}/api/process-url`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ url, ...options })
    });

    if (!response.ok) {
      throw await this.handleError(response);
    }

    return await response.json();
  }

  // Process URL with streaming
  async processUrlStream(
    url: string,
    options: ProcessingOptions = {},
    onUpdate?: (data: any) => void
  ): Promise<ProcessingResult> {
    const response = await fetch(`${this.baseUrl}/api/process-url-stream`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ url, ...options })
    });

    if (!response.ok) {
      throw await this.handleError(response);
    }

    return this.handleStream(response, onUpdate);
  }

  // Search content
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const params = new URLSearchParams({
      q: query,
      ...this.objectToParams(options)
    });

    const response = await fetch(`${this.baseUrl}/api/search?${params}`);

    if (!response.ok) {
      throw await this.handleError(response);
    }

    return await response.json();
  }

  // Get document
  async getDocument(documentId: string): Promise<Document> {
    const response = await fetch(`${this.baseUrl}/api/record/${documentId}`);

    if (!response.ok) {
      throw await this.handleError(response);
    }

    return await response.json();
  }

  // Private methods
  private async handleStream(
    response: Response,
    onUpdate?: (data: any) => void
  ): Promise<any> {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let result: any = null;

    if (!reader) {
      throw new Error('Stream not available');
    }

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            onUpdate?.(data);
            
            if (data.event === 'completed') {
              result = data.data;
            }
          } catch (e) {
            console.warn('Failed to parse SSE data:', line);
          }
        }
      }
    }

    return result;
  }

  private async handleError(response: Response): Promise<Error> {
    try {
      const errorData = await response.json();
      return new AutoLlamaAPIError(
        errorData.error.message,
        errorData.error.code,
        response.status,
        errorData
      );
    } catch {
      return new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  private objectToParams(obj: any): Record<string, string> {
    const params: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          for (const [subKey, subValue] of Object.entries(value)) {
            if (subValue !== undefined && subValue !== null) {
              params[`${key}.${subKey}`] = String(subValue);
            }
          }
        } else {
          params[key] = String(value);
        }
      }
    }
    
    return params;
  }
}

// Usage
const autollama = new AutoLlamaSDK('http://localhost:8080');

// Process URL with progress updates
const result = await autollama.processUrlStream(
  'https://en.wikipedia.org/wiki/Machine_learning',
  { 
    chunkSize: 1500,
    enableContextualEmbeddings: true
  },
  (update) => {
    console.log('Processing update:', update);
  }
);

// Search for content
const searchResults = await autollama.search('neural networks', {
  limit: 30,
  filters: {
    category: 'academic',
    technical_level: 'advanced'
  }
});
```

### Python SDK

```python
# AutoLlama Python SDK
import requests
from typing import Optional, Dict, Any, Callable
import json
from dataclasses import dataclass

@dataclass
class ProcessingOptions:
    chunk_size: Optional[int] = 1200
    chunk_overlap: Optional[int] = 200
    enable_contextual_embeddings: Optional[bool] = True
    ai_model: Optional[str] = 'gpt-4o-mini'

@dataclass
class SearchOptions:
    limit: Optional[int] = 20
    threshold: Optional[float] = 0.7
    filters: Optional[Dict[str, Any]] = None

class AutoLlamaSDK:
    def __init__(self, base_url: str = 'http://localhost:8080'):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json'
        })

    def process_url(self, url: str, options: ProcessingOptions = None) -> Dict[str, Any]:
        """Process a URL and return the result."""
        if options is None:
            options = ProcessingOptions()
        
        payload = {
            'url': url,
            'chunkSize': options.chunk_size,
            'chunkOverlap': options.chunk_overlap,
            'enableContextualEmbeddings': options.enable_contextual_embeddings,
            'aiModel': options.ai_model
        }
        
        response = self.session.post(f'{self.base_url}/api/process-url', json=payload)
        response.raise_for_status()
        return response.json()

    def process_url_stream(
        self, 
        url: str, 
        options: ProcessingOptions = None,
        on_update: Optional[Callable[[Dict[str, Any]], None]] = None
    ) -> Dict[str, Any]:
        """Process a URL with streaming updates."""
        if options is None:
            options = ProcessingOptions()
        
        payload = {
            'url': url,
            'chunkSize': options.chunk_size,
            'chunkOverlap': options.chunk_overlap,
            'enableContextualEmbeddings': options.enable_contextual_embeddings,
            'aiModel': options.ai_model
        }
        
        response = self.session.post(
            f'{self.base_url}/api/process-url-stream',
            json=payload,
            stream=True
        )
        response.raise_for_status()
        
        result = None
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    try:
                        data = json.loads(line[6:])
                        if on_update:
                            on_update(data)
                        
                        if data.get('event') == 'completed':
                            result = data.get('data')
                    except json.JSONDecodeError:
                        continue
        
        return result

    def search(self, query: str, options: SearchOptions = None) -> Dict[str, Any]:
        """Search processed content."""
        if options is None:
            options = SearchOptions()
        
        params = {
            'q': query,
            'limit': options.limit,
            'threshold': options.threshold
        }
        
        if options.filters:
            params.update(options.filters)
        
        response = self.session.get(f'{self.base_url}/api/search', params=params)
        response.raise_for_status()
        return response.json()

    def get_document(self, document_id: str) -> Dict[str, Any]:
        """Get document details."""
        response = self.session.get(f'{self.base_url}/api/record/{document_id}')
        response.raise_for_status()
        return response.json()

    def get_documents(
        self, 
        page: int = 1, 
        limit: int = 20, 
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Get paginated list of documents."""
        params = {
            'page': page,
            'limit': limit
        }
        
        if filters:
            params.update(filters)
        
        response = self.session.get(f'{self.base_url}/api/documents', params=params)
        response.raise_for_status()
        return response.json()

# Usage example
if __name__ == '__main__':
    sdk = AutoLlamaSDK('http://localhost:8080')
    
    # Process URL with progress updates
    def handle_update(data):
        if data.get('event') == 'progress':
            print(f"Progress: {data.get('data', {}).get('progress', 0)}%")
    
    result = sdk.process_url_stream(
        'https://en.wikipedia.org/wiki/Machine_learning',
        ProcessingOptions(chunk_size=1500),
        on_update=handle_update
    )
    
    print(f"Processing completed: {result}")
    
    # Search for content
    search_results = sdk.search('neural networks', SearchOptions(
        limit=30,
        filters={'category': 'academic'}
    ))
    
    print(f"Found {len(search_results['data']['results'])} results")
```

## Integration Examples

### React Component Integration

```jsx
// React component with AutoLlama integration
import React, { useState, useCallback } from 'react';
import { AutoLlamaSDK } from '@autollama/sdk';

const DocumentProcessor = () => {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const sdk = new AutoLlamaSDK('http://localhost:8080');

  const handleProcess = useCallback(async () => {
    if (!url) return;

    setStatus('processing');
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const result = await sdk.processUrlStream(
        url,
        {
          chunkSize: 1200,
          enableContextualEmbeddings: true
        },
        (update) => {
          switch (update.event) {
            case 'progress':
              setProgress(update.data.progress);
              break;
            case 'completed':
              setStatus('completed');
              setResult(update.data);
              break;
            case 'error':
              setStatus('error');
              setError(update.data.error);
              break;
          }
        }
      );
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  }, [url]);

  return (
    <div className="document-processor">
      <div className="input-section">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter URL to process..."
          disabled={status === 'processing'}
        />
        <button 
          onClick={handleProcess}
          disabled={!url || status === 'processing'}
        >
          {status === 'processing' ? 'Processing...' : 'Process URL'}
        </button>
      </div>

      {status === 'processing' && (
        <div className="progress-section">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progress}%` }}
            />
          </div>
          <p>{progress}% complete</p>
        </div>
      )}

      {status === 'completed' && result && (
        <div className="result-section">
          <h3>Processing Complete!</h3>
          <p>Document ID: {result.documentId}</p>
          <p>Chunks created: {result.chunksCreated}</p>
          <p>Processing time: {result.processingTime}ms</p>
        </div>
      )}

      {status === 'error' && error && (
        <div className="error-section">
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
};

export default DocumentProcessor;
```

### Node.js Backend Integration

```javascript
// Express.js backend with AutoLlama integration
const express = require('express');
const { AutoLlamaSDK } = require('@autollama/sdk');

const app = express();
const autollama = new AutoLlamaSDK('http://localhost:8080');

app.use(express.json());

// Process documents endpoint
app.post('/api/documents/process', async (req, res) => {
  try {
    const { url, options = {} } = req.body;

    // Validate input
    if (!url) {
      return res.status(400).json({
        error: 'URL is required'
      });
    }

    // Process with AutoLlama
    const result = await autollama.processUrl(url, {
      chunkSize: options.chunkSize || 1200,
      enableContextualEmbeddings: options.enableContextualEmbeddings ?? true
    });

    // Store in your database
    await storeDocument(result.data);

    res.json({
      success: true,
      documentId: result.data.documentId,
      message: 'Document processed successfully'
    });

  } catch (error) {
    console.error('Processing failed:', error);
    res.status(500).json({
      error: 'Failed to process document',
      details: error.message
    });
  }
});

// Search endpoint with caching
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

app.get('/api/search', async (req, res) => {
  try {
    const { q: query, ...options } = req.query;

    if (!query) {
      return res.status(400).json({
        error: 'Query parameter "q" is required'
      });
    }

    // Check cache
    const cacheKey = JSON.stringify({ query, options });
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }

    // Search with AutoLlama
    const results = await autollama.search(query, {
      limit: parseInt(options.limit) || 20,
      threshold: parseFloat(options.threshold) || 0.7,
      filters: {
        category: options.category,
        technical_level: options.technical_level,
        sentiment: options.sentiment
      }
    });

    // Cache results
    cache.set(cacheKey, {
      data: results,
      timestamp: Date.now()
    });

    res.json(results);

  } catch (error) {
    console.error('Search failed:', error);
    res.status(500).json({
      error: 'Search failed',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check AutoLlama health
    const response = await fetch('http://localhost:8080/api/health');
    const health = await response.json();

    res.json({
      status: 'healthy',
      autollama: health.success ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Python FastAPI Integration

```python
# FastAPI backend with AutoLlama integration
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, HttpUrl
from typing import Optional, Dict, Any
import asyncio
import aiohttp
import json
from datetime import datetime, timedelta

app = FastAPI(title="AutoLlama Integration API")

class ProcessingRequest(BaseModel):
    url: HttpUrl
    chunk_size: Optional[int] = 1200
    enable_contextual_embeddings: Optional[bool] = True

class SearchRequest(BaseModel):
    query: str
    limit: Optional[int] = 20
    threshold: Optional[float] = 0.7
    filters: Optional[Dict[str, Any]] = None

# Cache for search results
search_cache = {}
CACHE_TTL = timedelta(minutes=5)

@app.post("/api/documents/process")
async def process_document(request: ProcessingRequest, background_tasks: BackgroundTasks):
    """Process a document URL with AutoLlama."""
    try:
        async with aiohttp.ClientSession() as session:
            payload = {
                "url": str(request.url),
                "chunkSize": request.chunk_size,
                "enableContextualEmbeddings": request.enable_contextual_embeddings
            }
            
            async with session.post(
                "http://localhost:8080/api/process-url",
                json=payload
            ) as response:
                if response.status != 200:
                    error_data = await response.json()
                    raise HTTPException(
                        status_code=response.status,
                        detail=error_data.get("error", {}).get("message", "Processing failed")
                    )
                
                result = await response.json()
                
                # Store in database (background task)
                background_tasks.add_task(store_document, result["data"])
                
                return {
                    "success": True,
                    "document_id": result["data"]["documentId"],
                    "message": "Document processed successfully"
                }
                
    except aiohttp.ClientError as e:
        raise HTTPException(status_code=503, detail=f"AutoLlama service unavailable: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/api/search")
async def search_content(request: SearchRequest):
    """Search processed content with caching."""
    try:
        # Check cache
        cache_key = json.dumps({
            "query": request.query,
            "limit": request.limit,
            "threshold": request.threshold,
            "filters": request.filters
        }, sort_keys=True)
        
        cached_result = search_cache.get(cache_key)
        if cached_result and datetime.now() - cached_result["timestamp"] < CACHE_TTL:
            return cached_result["data"]
        
        # Search with AutoLlama
        async with aiohttp.ClientSession() as session:
            params = {
                "q": request.query,
                "limit": request.limit,
                "threshold": request.threshold
            }
            
            if request.filters:
                params.update(request.filters)
            
            async with session.get(
                "http://localhost:8080/api/search",
                params=params
            ) as response:
                if response.status != 200:
                    error_data = await response.json()
                    raise HTTPException(
                        status_code=response.status,
                        detail=error_data.get("error", {}).get("message", "Search failed")
                    )
                
                result = await response.json()
                
                # Cache result
                search_cache[cache_key] = {
                    "data": result,
                    "timestamp": datetime.now()
                }
                
                return result
                
    except aiohttp.ClientError as e:
        raise HTTPException(status_code=503, detail=f"AutoLlama service unavailable: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:8080/api/health") as response:
                health_data = await response.json()
                
                return {
                    "status": "healthy",
                    "autollama": "connected" if health_data.get("success") else "disconnected",
                    "timestamp": datetime.now().isoformat()
                }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

async def store_document(document_data: Dict[str, Any]):
    """Background task to store document in database."""
    # Implement your database storage logic here
    print(f"Storing document: {document_data['documentId']}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

## Best Practices

### API Usage Patterns

1. **Use streaming for long operations**: Always use streaming endpoints for URL processing and file uploads
2. **Implement proper error handling**: Handle all error codes appropriately
3. **Cache search results**: Implement caching for frequently searched queries
4. **Rate limit awareness**: Monitor rate limits and implement backoff strategies
5. **Batch operations**: Group multiple operations when possible

### Performance Optimization

```javascript
// Batch processing pattern
class BatchProcessor {
  constructor(sdk, batchSize = 5) {
    this.sdk = sdk;
    this.batchSize = batchSize;
    this.queue = [];
  }

  async addUrl(url, options = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({ url, options, resolve, reject });
      this.processBatch();
    });
  }

  async processBatch() {
    if (this.queue.length < this.batchSize) {
      return;
    }

    const batch = this.queue.splice(0, this.batchSize);
    
    try {
      const results = await Promise.allSettled(
        batch.map(item => this.sdk.processUrl(item.url, item.options))
      );

      results.forEach((result, index) => {
        const item = batch[index];
        if (result.status === 'fulfilled') {
          item.resolve(result.value);
        } else {
          item.reject(result.reason);
        }
      });
    } catch (error) {
      batch.forEach(item => item.reject(error));
    }
  }
}
```

### Error Recovery Strategies

```javascript
// Resilient API client with circuit breaker
class ResilientAutoLlamaClient {
  constructor(baseUrl, options = {}) {
    this.sdk = new AutoLlamaSDK(baseUrl);
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
    this.retryOptions = options.retry || { maxRetries: 3, baseDelay: 1000 };
  }

  async processUrlWithFallback(url, options = {}) {
    try {
      return await this.circuitBreaker.execute(() => 
        this.retryOperation(() => this.sdk.processUrl(url, options))
      );
    } catch (error) {
      // Fallback: Store for later processing
      await this.queueForLaterProcessing(url, options);
      throw new Error('Processing queued for later retry');
    }
  }

  async retryOperation(operation) {
    let lastError;
    
    for (let attempt = 0; attempt < this.retryOptions.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        if (attempt < this.retryOptions.maxRetries - 1) {
          const delay = this.retryOptions.baseDelay * Math.pow(2, attempt);
          await this.delay(delay);
        }
      }
    }
    
    throw lastError;
  }

  isRetryableError(error) {
    return error.statusCode >= 500 || 
           error.code === 'RATE_LIMIT_EXCEEDED' ||
           error.code === 'NETWORK_ERROR';
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async queueForLaterProcessing(url, options) {
    // Implement queue storage (Redis, database, etc.)
    console.log(`Queuing ${url} for later processing`);
  }
}
```

## Troubleshooting

### Common Issues

#### Connection Refused
```javascript
// Check if AutoLlama is running
try {
  const response = await fetch('http://localhost:8080/api/health');
  console.log('AutoLlama is running');
} catch (error) {
  console.error('AutoLlama is not accessible:', error.message);
  // Check Docker containers: docker-compose ps
}
```

#### Slow Processing
```javascript
// Monitor processing performance
const startTime = Date.now();
const result = await sdk.processUrl(url, {
  enableContextualEmbeddings: false // Try disabling for faster processing
});
const duration = Date.now() - startTime;
console.log(`Processing took ${duration}ms`);
```

#### Memory Issues
```javascript
// Process large files in chunks
async function processLargeDocument(content, chunkSize = 1000) {
  const chunks = splitIntoChunks(content, chunkSize);
  const results = [];
  
  for (const chunk of chunks) {
    const result = await sdk.processUrl(chunk.url);
    results.push(result);
    
    // Allow garbage collection
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}
```

### Debug Mode

```javascript
// Enable debug logging
const sdk = new AutoLlamaSDK('http://localhost:8080', {
  debug: true,
  logRequests: true,
  logResponses: true
});

// Custom logging
sdk.on('request', (config) => {
  console.log('API Request:', config);
});

sdk.on('response', (response) => {
  console.log('API Response:', response);
});

sdk.on('error', (error) => {
  console.error('API Error:', error);
});
```

This comprehensive integration guide provides everything needed to successfully integrate with the AutoLlama API, from basic usage to advanced patterns and error handling strategies.