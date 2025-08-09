# AutoLlama API - JavaScript/Node.js Examples

This guide provides comprehensive JavaScript examples for integrating with the AutoLlama Context Llama API.

## Installation

```bash
npm install axios form-data
```

## Basic Setup

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// API Configuration
const API_BASE_URL = 'http://localhost:8080/api';
const API_KEY = 'your-api-key-here'; // If authentication is enabled

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
    ...(API_KEY && { 'Authorization': `Bearer ${API_KEY}` })
  }
});

// Add response interceptor for error handling
api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', {
      status: error.response?.status,
      message: error.response?.data?.error?.message || error.message,
      code: error.response?.data?.error?.code
    });
    return Promise.reject(error);
  }
);
```

## Health Check

```javascript
async function checkHealth() {
  try {
    const response = await api.get('/health');
    console.log('API Health:', response.data);
    return response.data.success;
  } catch (error) {
    console.error('Health check failed:', error.message);
    return false;
  }
}

async function getComprehensiveHealth() {
  try {
    const response = await api.get('/health/comprehensive');
    console.log('System Status:', response.data);
    return response.data;
  } catch (error) {
    console.error('Comprehensive health check failed:', error.message);
    throw error;
  }
}
```

## Content Processing

### Process URL

```javascript
async function processURL(url, options = {}) {
  const request = {
    url,
    chunkSize: options.chunkSize || 1000,
    overlap: options.overlap || 100,
    enableContextualEmbeddings: options.enableContextualEmbeddings !== false
  };

  try {
    const response = await api.post('/process-url', request);
    console.log('URL processed successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('URL processing failed:', error.response?.data || error.message);
    throw error;
  }
}

// Example usage
processURL('https://example.com/article', {
  chunkSize: 1200,
  overlap: 150,
  enableContextualEmbeddings: true
}).then(result => {
  console.log('Processing completed:', result.sessionId);
});
```

### Process URL with Streaming

```javascript
async function processURLWithStreaming(url, options = {}) {
  const request = {
    url,
    chunkSize: options.chunkSize || 1000,
    overlap: options.overlap || 100,
    enableContextualEmbeddings: options.enableContextualEmbeddings !== false
  };

  try {
    // Start processing
    const response = await api.post('/process-url-stream', request);
    const sessionId = response.data.sessionId;
    
    console.log('Processing started:', sessionId);
    
    // Monitor progress
    return await monitorProcessingProgress(sessionId);
  } catch (error) {
    console.error('Streaming processing failed:', error.response?.data || error.message);
    throw error;
  }
}

async function monitorProcessingProgress(sessionId) {
  const maxAttempts = 60; // 5 minutes with 5-second intervals
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const response = await api.get(`/processing/status/${sessionId}`);
      const status = response.data.session.status;
      
      console.log(`Progress: ${response.data.progress || 0}% - Status: ${status}`);
      
      if (status === 'completed') {
        console.log('Processing completed successfully!');
        return response.data;
      } else if (status === 'failed') {
        throw new Error(`Processing failed: ${response.data.session.error_message}`);
      }
      
      // Wait 5 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    } catch (error) {
      console.error('Error checking progress:', error.message);
      throw error;
    }
  }
  
  throw new Error('Processing timeout - took longer than expected');
}
```

### File Upload

```javascript
async function uploadFile(filePath, options = {}) {
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    formData.append('chunkSize', options.chunkSize || 1000);
    formData.append('overlap', options.overlap || 100);
    formData.append('enableContextualEmbeddings', options.enableContextualEmbeddings !== false);

    const response = await api.post('/process-file', formData, {
      headers: {
        ...formData.getHeaders(),
        ...(API_KEY && { 'Authorization': `Bearer ${API_KEY}` })
      },
      timeout: 300000 // 5 minutes for file uploads
    });

    console.log('File processed successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('File upload failed:', error.response?.data || error.message);
    throw error;
  }
}

// Example usage
uploadFile('./documents/research-paper.pdf', {
  chunkSize: 800,
  overlap: 120
}).then(result => {
  console.log('File processing completed:', result.sessionId);
});
```

### Pre-Upload Check

```javascript
async function checkSystemReadiness() {
  try {
    const response = await api.post('/pre-upload-check');
    
    if (response.data.ready) {
      console.log('System is ready for upload');
      return true;
    } else {
      console.warn('System not ready:', response.data.recommendations);
      return false;
    }
  } catch (error) {
    console.error('Pre-upload check failed:', error.message);
    return false;
  }
}
```

## Search Operations

### Basic Search

```javascript
async function search(query, options = {}) {
  const params = {
    q: query,
    limit: options.limit || 20,
    offset: options.offset || 0,
    includeChunks: options.includeChunks || false,
    threshold: options.threshold || 0.7
  };

  try {
    const response = await api.get('/search', { params });
    console.log(`Found ${response.data.total} results for "${query}"`);
    return response.data;
  } catch (error) {
    console.error('Search failed:', error.response?.data || error.message);
    throw error;
  }
}

// Example usage
search('artificial intelligence machine learning', {
  limit: 10,
  includeChunks: true,
  threshold: 0.8
}).then(results => {
  results.results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.title} (Score: ${result.similarity_score})`);
  });
});
```

### Vector Search

```javascript
async function vectorSearch(query, options = {}) {
  const request = {
    query,
    limit: options.limit || 10,
    threshold: options.threshold || 0.7
  };

  try {
    const response = await api.post('/search/vector', request);
    console.log(`Vector search found ${response.data.results.length} results`);
    return response.data;
  } catch (error) {
    console.error('Vector search failed:', error.response?.data || error.message);
    throw error;
  }
}
```

### Document Search

```javascript
async function searchDocuments(query, options = {}) {
  const params = {
    q: query,
    sortBy: options.sortBy || 'relevance',
    sortOrder: options.sortOrder || 'desc',
    limit: options.limit || 20
  };

  try {
    const response = await api.get('/search/documents', { params });
    console.log(`Found ${response.data.total} documents`);
    return response.data;
  } catch (error) {
    console.error('Document search failed:', error.response?.data || error.message);
    throw error;
  }
}
```

### Similar Chunks

```javascript
async function findSimilarChunks(chunkId, limit = 10) {
  try {
    const response = await api.get(`/search/similar/${chunkId}`, {
      params: { limit }
    });
    
    console.log(`Found ${response.data.similarChunks.length} similar chunks`);
    return response.data;
  } catch (error) {
    console.error('Similar chunks search failed:', error.response?.data || error.message);
    throw error;
  }
}
```

## Document Management

### List Documents

```javascript
async function listDocuments(options = {}) {
  const params = {
    page: options.page || 1,
    limit: options.limit || 20,
    search: options.search,
    sortBy: options.sortBy || 'created_at',
    sortOrder: options.sortOrder || 'desc'
  };

  try {
    const response = await api.get('/documents', { params });
    console.log(`Retrieved ${response.data.documents.length} documents`);
    return response.data;
  } catch (error) {
    console.error('Failed to list documents:', error.response?.data || error.message);
    throw error;
  }
}
```

### Get Document Details

```javascript
async function getDocument(documentId, options = {}) {
  const params = {
    chunkLimit: options.chunkLimit || 50,
    chunkOffset: options.chunkOffset || 0
  };

  try {
    const response = await api.get(`/documents/${documentId}`, { params });
    console.log(`Document: ${response.data.document.title}`);
    console.log(`Chunks: ${response.data.chunks.length}`);
    return response.data;
  } catch (error) {
    console.error('Failed to get document:', error.response?.data || error.message);
    throw error;
  }
}
```

### Update Document

```javascript
async function updateDocument(documentId, updates) {
  try {
    const response = await api.put(`/documents/${documentId}`, updates);
    console.log('Document updated successfully');
    return response.data;
  } catch (error) {
    console.error('Failed to update document:', error.response?.data || error.message);
    throw error;
  }
}

// Example usage
updateDocument('doc-123', {
  title: 'Updated Document Title',
  metadata: {
    category: 'research',
    tags: ['ai', 'machine-learning'],
    priority: 'high'
  }
});
```

### Delete Document

```javascript
async function deleteDocument(documentId) {
  try {
    const response = await api.delete(`/documents/${documentId}`);
    console.log(`Document deleted: ${response.data.deletedChunks} chunks removed`);
    return response.data;
  } catch (error) {
    console.error('Failed to delete document:', error.response?.data || error.message);
    throw error;
  }
}
```

### Get Document Statistics

```javascript
async function getDocumentStats(documentId) {
  try {
    const response = await api.get(`/documents/${documentId}/stats`);
    const stats = response.data.stats;
    
    console.log(`Document Statistics:
      Total Chunks: ${stats.totalChunks}
      Completed: ${stats.completedChunks}
      Failed: ${stats.failedChunks}
      Avg Chunk Size: ${stats.avgChunkSize}
      Processing Time: ${stats.processingTime}ms`);
    
    return response.data;
  } catch (error) {
    console.error('Failed to get document stats:', error.response?.data || error.message);
    throw error;
  }
}
```

## Session Management

### Get Processing Queue

```javascript
async function getProcessingQueue() {
  try {
    const response = await api.get('/processing/queue');
    const queue = response.data.queue;
    
    console.log(`Processing Queue:
      Active: ${queue.active.length}
      Waiting: ${queue.waiting.length}
      Completed: ${queue.completed.length}
      Failed: ${queue.failed.length}`);
    
    return response.data;
  } catch (error) {
    console.error('Failed to get processing queue:', error.response?.data || error.message);
    throw error;
  }
}
```

### Cleanup Stuck Sessions

```javascript
async function cleanupStuckSessions() {
  try {
    const response = await api.post('/processing/cleanup');
    console.log(`Cleanup completed: ${response.data.cleanedSessions} sessions cleaned`);
    return response.data;
  } catch (error) {
    console.error('Failed to cleanup sessions:', error.response?.data || error.message);
    throw error;
  }
}
```

## Error Handling and Retry Logic

```javascript
class AutoLlamaClient {
  constructor(baseURL, apiKey = null, options = {}) {
    this.api = axios.create({
      baseURL,
      timeout: options.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
      }
    });

    this.retryConfig = {
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      retryDelayMultiplier: options.retryDelayMultiplier || 2
    };

    this.setupInterceptors();
  }

  setupInterceptors() {
    this.api.interceptors.response.use(
      response => response,
      async error => {
        const config = error.config;
        
        // Don't retry if max retries reached
        if (!config || config._retryCount >= this.retryConfig.maxRetries) {
          return Promise.reject(error);
        }

        // Only retry on network errors or 5xx responses
        const shouldRetry = !error.response || 
          (error.response.status >= 500 && error.response.status <= 599);

        if (!shouldRetry) {
          return Promise.reject(error);
        }

        config._retryCount = config._retryCount || 0;
        config._retryCount++;

        const delay = this.retryConfig.retryDelay * 
          Math.pow(this.retryConfig.retryDelayMultiplier, config._retryCount - 1);

        console.log(`Retrying request (attempt ${config._retryCount}) after ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.api(config);
      }
    );
  }

  async search(query, options = {}) {
    const response = await this.api.get('/search', {
      params: {
        q: query,
        limit: options.limit || 20,
        offset: options.offset || 0,
        includeChunks: options.includeChunks || false,
        threshold: options.threshold || 0.7
      }
    });
    return response.data;
  }

  async processURL(url, options = {}) {
    const response = await this.api.post('/process-url', {
      url,
      chunkSize: options.chunkSize || 1000,
      overlap: options.overlap || 100,
      enableContextualEmbeddings: options.enableContextualEmbeddings !== false
    });
    return response.data;
  }

  // Add other methods as needed...
}

// Usage
const client = new AutoLlamaClient('http://localhost:8080/api', 'your-api-key', {
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 60000
});

// Example with error handling
try {
  const results = await client.search('artificial intelligence');
  console.log('Search results:', results);
} catch (error) {
  if (error.response?.status === 429) {
    console.log('Rate limited - please try again later');
  } else if (error.response?.status >= 500) {
    console.log('Server error - please try again');
  } else {
    console.log('Request error:', error.response?.data?.error?.message);
  }
}
```

## Real-World Usage Examples

### Complete Document Processing Workflow

```javascript
async function completeDocumentWorkflow(url) {
  try {
    // 1. Check system readiness
    const isReady = await checkSystemReadiness();
    if (!isReady) {
      throw new Error('System not ready for processing');
    }

    // 2. Process URL with streaming
    console.log('Starting URL processing...');
    const result = await processURLWithStreaming(url, {
      chunkSize: 1200,
      enableContextualEmbeddings: true
    });

    console.log('Processing completed:', result);

    // 3. Search for content
    const searchResults = await search('key concepts from the document', {
      limit: 5,
      includeChunks: true
    });

    console.log('Search results:', searchResults.results.length);

    // 4. Get document details
    if (result.sessionId) {
      const documentDetails = await getDocument(result.results?.documentId);
      console.log('Document details:', documentDetails.document.title);
    }

    return {
      processing: result,
      searchResults,
      documentDetails
    };
  } catch (error) {
    console.error('Workflow failed:', error.message);
    throw error;
  }
}

// Run the workflow
completeDocumentWorkflow('https://example.com/research-paper')
  .then(results => console.log('Workflow completed successfully'))
  .catch(error => console.error('Workflow failed:', error.message));
```