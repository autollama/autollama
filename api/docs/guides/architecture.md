# AutoLlama Architecture Deep Dive

## Table of Contents

1. [System Overview](#system-overview)
2. [Service Architecture](#service-architecture)
3. [Data Flow & Processing Pipeline](#data-flow--processing-pipeline)
4. [Database Schema & Storage](#database-schema--storage)
5. [API Design Patterns](#api-design-patterns)
6. [Security Model](#security-model)
7. [Performance & Scalability](#performance--scalability)
8. [Monitoring & Observability](#monitoring--observability)
9. [Error Handling & Recovery](#error-handling--recovery)
10. [Future Architecture Improvements](#future-architecture-improvements)

## System Overview

AutoLlama v2.1 is a distributed RAG (Retrieval-Augmented Generation) platform designed for intelligent content analysis and processing. The architecture follows microservices principles with Docker containerization and Tailscale networking.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AutoLlama v2.1                          │
├─────────────────────────────────────────────────────────────────┤
│  Frontend Layer (React + Nginx)                                │
│  ├── React SPA (Port 8080)                                     │
│  ├── Nginx Reverse Proxy                                       │
│  └── Settings Management UI                                     │
├─────────────────────────────────────────────────────────────────┤
│  API Layer (Node.js Express)                                   │
│  ├── Content Processing API (Port 3001)                        │
│  ├── BM25 Search Service (Port 3002) - Python                  │
│  ├── WebSocket/SSE Service (Port 3003)                         │
│  └── Health & Monitoring Endpoints                             │
├─────────────────────────────────────────────────────────────────┤
│  Data Layer                                                     │
│  ├── PostgreSQL (Structured metadata)                          │
│  ├── Qdrant Cloud (Vector embeddings)                          │
│  └── Redis Cache (Optional performance layer)                  │
├─────────────────────────────────────────────────────────────────┤
│  External Services                                              │
│  ├── OpenAI API (GPT-4o-mini, embeddings)                      │
│  ├── Claude API (Advanced reasoning)                           │
│  ├── Google Gemini API (Multi-modal)                           │
│  └── Tailscale VPN (Secure networking)                         │
└─────────────────────────────────────────────────────────────────┘
```

### Core Design Principles

1. **Separation of Concerns**: Each service has a single, well-defined responsibility
2. **Fault Tolerance**: Circuit breakers, retry logic, and graceful degradation
3. **Scalability**: Horizontal scaling support with containerization
4. **Security**: VPN networking, environment-based secrets, CORS protection
5. **Observability**: Comprehensive logging, health checks, and monitoring
6. **Developer Experience**: Hot reload, comprehensive documentation, debugging tools

## Service Architecture

### Current Service Topology

```
autollama/
├── Frontend Services
│   ├── autollama (React SPA on port 8080)
│   ├── autollama-legacy (Static HTML on port 8082)
│   └── autollama-proxy (Nginx proxy on port 8081)
├── Backend Services
│   ├── autollama-api (Node.js API on port 3001)
│   ├── autollama-bm25 (Python search on port 3002)
│   └── autollama-sse (WebSocket on port 3003)
├── Infrastructure Services
│   ├── autollama-on-hstgr (Tailscale VPN)
│   ├── postgres (PostgreSQL database)
│   └── redis (Optional caching layer)
└── External Dependencies
    ├── Qdrant Cloud (Vector storage)
    ├── OpenAI API (AI processing)
    └── Multi-provider AI APIs
```

### Service Responsibilities

#### 1. Frontend Services

**React Frontend (autollama:8080)**
- Modern React 18 application with Tailwind CSS
- Real-time processing updates via Server-Sent Events
- Comprehensive settings management with 4-tab modal
- Document viewing, search, and navigation
- Multi-provider AI configuration interface

**Nginx Proxy (autollama-proxy:8081)**
- Load balancing across API instances
- SSL termination and security headers
- Static file serving with compression
- WebSocket upgrade handling for real-time features

#### 2. Backend Services

**Main API Service (autollama-api:3001)**
```javascript
// Current monolithic structure (4,506 lines)
server.js
├── Content Processing Pipeline
├── File Upload & Parsing (PDF, EPUB, DOCX, CSV)
├── AI Analysis & Contextual Embeddings
├── Database & Vector Storage Operations
├── Session Management & Cleanup
├── Health Monitoring & Metrics
└── 38 API Endpoints

// Target modular structure (250 lines)
src/
├── server.js (Entry point only)
├── routes/ (API endpoints)
├── controllers/ (Request orchestration)
├── services/ (Business logic)
├── middleware/ (Cross-cutting concerns)
└── utils/ (Helpers & utilities)
```

**BM25 Search Service (autollama-bm25:3002)**
- Python-based lexical search using scikit-learn
- Fast keyword matching and ranking
- Complement to vector similarity search
- Index management and term frequency analysis

**WebSocket Service (autollama-sse:3003)**
- Real-time communication via Server-Sent Events
- Processing progress updates
- Error notifications and status changes
- Connection management and cleanup

#### 3. Data Services

**PostgreSQL Database**
```sql
-- Core tables
processed_content     -- Document metadata and analysis
chunks               -- Text chunks with contextual summaries
upload_sessions      -- Processing session tracking
embeddings_metadata  -- Vector storage references

-- Indexes for performance
idx_chunks_document_id
idx_processed_content_created_at
idx_upload_sessions_status
```

**Qdrant Vector Database**
- High-performance vector similarity search
- Support for contextual embeddings (v2.0 feature)
- Horizontal scaling with cloud hosting
- Advanced filtering and hybrid search capabilities

## Data Flow & Processing Pipeline

### Content Processing Workflow

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ User Input  │───▶│ Validation   │───▶│ Content     │
│ (URL/File)  │    │ & Queue      │    │ Fetching    │
└─────────────┘    └──────────────┘    └─────────────┘
                                             │
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ Vector      │◀───│ AI Analysis  │◀───│ Content     │
│ Storage     │    │ & Context    │    │ Chunking    │
└─────────────┘    └──────────────┘    └─────────────┘
       │                  │                   │
       ▼                  ▼                   ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ Search      │    │ PostgreSQL   │    │ Progress    │
│ Indexing    │    │ Metadata     │    │ Updates     │
└─────────────┘    └──────────────┘    └─────────────┘
```

### Processing Pipeline Details

#### 1. Content Ingestion
```javascript
// Input validation and session creation
const session = await createUploadSession({
  url: inputUrl,
  status: 'processing',
  metadata: { chunking: options }
});

// Content fetching with anti-bot protection
const content = await fetchContent(url, {
  userAgent: 'AutoLlama/2.1',
  timeout: 30000,
  retries: 3
});
```

#### 2. Content Processing
```javascript
// Text chunking with overlap
const chunks = chunkText(content, {
  size: 1200,        // User configurable 100-5000
  overlap: 200,      // User configurable 0+
  preserveContext: true
});

// AI analysis per chunk
for (const chunk of chunks) {
  const analysis = await analyzeChunk(chunk, {
    model: 'gpt-4o-mini',
    extractMetadata: true,
    generateContext: true
  });
  
  const contextualSummary = await generateContext(chunk, document);
  await storeChunkAnalysis(chunk, analysis, contextualSummary);
}
```

#### 3. Enhanced Embeddings (v2.0)
```javascript
// Contextual embedding generation
const enhancedText = `
Context: ${contextualSummary}
Content: ${chunk.text}
Document: ${document.title}
`;

const embedding = await generateEmbedding(enhancedText, {
  model: 'text-embedding-3-small',
  dimensions: 1536
});

await storeInQdrant(embedding, {
  chunk_id: chunk.id,
  uses_contextual_embedding: true,
  metadata: analysis
});
```

### Session Management & Cleanup

#### Advanced Cleanup Strategy
```javascript
class SessionCleanupService {
  constructor() {
    this.intervals = {
      standard: 2 * 60 * 1000,      // 2 minutes
      emergency: 30 * 1000,         // 30 seconds  
      timeout: 8 * 60 * 1000        // 8 minutes
    };
  }

  async cleanupStuckSessions() {
    // 1. Heartbeat monitoring (90-second detection)
    await this.detectStuckByHeartbeat();
    
    // 2. Orphaned chunk recovery
    await this.recoverOrphanedChunks();
    
    // 3. Memory cleanup
    await this.cleanupMemoryLeaks();
    
    // 4. Health checks and alerts
    await this.performHealthChecks();
  }
}
```

## Database Schema & Storage

### PostgreSQL Schema

#### Primary Tables

**processed_content**
```sql
CREATE TABLE processed_content (
    id SERIAL PRIMARY KEY,
    document_id UUID UNIQUE NOT NULL,
    title TEXT,
    url TEXT,
    content_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'processing',
    
    -- Metadata fields
    summary TEXT,
    technical_level VARCHAR(20),
    sentiment VARCHAR(20),
    emotions JSONB,
    people JSONB,
    organizations JSONB,
    locations JSONB,
    key_concepts JSONB,
    main_topics JSONB,
    category VARCHAR(50),
    tags JSONB,
    
    -- Processing metadata
    chunk_count INTEGER,
    embedding_model VARCHAR(50),
    processing_duration INTEGER,
    
    -- Contextual embeddings (v2.0)
    uses_contextual_embeddings BOOLEAN DEFAULT false,
    contextual_model VARCHAR(50),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**chunks**
```sql
CREATE TABLE chunks (
    id SERIAL PRIMARY KEY,
    document_id UUID REFERENCES processed_content(document_id),
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    
    -- Contextual embeddings (v2.0)
    contextual_summary TEXT,
    uses_contextual_embedding BOOLEAN DEFAULT false,
    
    -- Chunk metadata
    word_count INTEGER,
    character_count INTEGER,
    embedding_id VARCHAR(100), -- Qdrant point ID
    
    -- Processing tracking
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(document_id, chunk_index)
);
```

**upload_sessions**
```sql
CREATE TABLE upload_sessions (
    id SERIAL PRIMARY KEY,
    session_id UUID UNIQUE NOT NULL,
    document_id UUID,
    status VARCHAR(20) DEFAULT 'pending',
    
    -- Processing configuration
    chunk_size INTEGER DEFAULT 1200,
    chunk_overlap INTEGER DEFAULT 200,
    ai_model VARCHAR(50) DEFAULT 'gpt-4o-mini',
    
    -- Progress tracking
    total_chunks INTEGER DEFAULT 0,
    processed_chunks INTEGER DEFAULT 0,
    failed_chunks INTEGER DEFAULT 0,
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Timing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Heartbeat monitoring
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Performance Indexes

```sql
-- Query performance indexes
CREATE INDEX idx_processed_content_status ON processed_content(status);
CREATE INDEX idx_processed_content_created_at ON processed_content(created_at DESC);
CREATE INDEX idx_processed_content_category ON processed_content(category);
CREATE INDEX idx_processed_content_contextual ON processed_content(uses_contextual_embeddings);

CREATE INDEX idx_chunks_document_id ON chunks(document_id);
CREATE INDEX idx_chunks_embedding_id ON chunks(embedding_id);
CREATE INDEX idx_chunks_contextual ON chunks(uses_contextual_embedding);

CREATE INDEX idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX idx_upload_sessions_heartbeat ON upload_sessions(last_heartbeat);
CREATE INDEX idx_upload_sessions_created ON upload_sessions(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_content_status_date ON processed_content(status, created_at DESC);
CREATE INDEX idx_session_status_heartbeat ON upload_sessions(status, last_heartbeat);
```

### Qdrant Vector Storage

#### Collection Schema
```python
# Qdrant collection configuration
collection_config = {
    "vectors": {
        "size": 1536,  # text-embedding-3-small dimensions
        "distance": "Cosine"
    },
    "payload_schema": {
        "chunk_id": "integer",
        "document_id": "string", 
        "uses_contextual_embedding": "bool",
        "title": "text",
        "category": "keyword",
        "technical_level": "keyword",
        "sentiment": "keyword",
        "created_at": "datetime"
    }
}
```

#### Vector Operations
```javascript
// Store enhanced embedding
await qdrantClient.upsert('autollama-chunks', {
    id: chunk.id,
    vector: embedding,
    payload: {
        chunk_id: chunk.id,
        document_id: document.id,
        title: document.title,
        uses_contextual_embedding: true,
        category: analysis.category,
        technical_level: analysis.technical_level,
        sentiment: analysis.sentiment,
        created_at: new Date().toISOString()
    }
});

// Hybrid search with filters
const searchResults = await qdrantClient.search('autollama-chunks', {
    vector: queryEmbedding,
    limit: 20,
    filter: {
        must: [
            { key: "uses_contextual_embedding", match: { value: true } },
            { key: "technical_level", match: { value: "intermediate" } }
        ]
    },
    with_payload: true,
    score_threshold: 0.7
});
```

## API Design Patterns

### RESTful API Structure

```javascript
// Current API endpoints (38 total)
GET    /api/health                    // Health check
GET    /api/recent-records           // List documents
GET    /api/documents               // Paginated documents
GET    /api/record/:id              // Single document
GET    /api/chunks/:documentId      // Document chunks
GET    /api/search                  // Unified search

POST   /api/process-url             // Process URL
POST   /api/process-url-stream      // Process URL with SSE
POST   /api/process-file            // Upload file
POST   /api/process-file-stream     // Upload file with SSE
POST   /api/pre-upload-check        // Validate before upload

DELETE /api/record/:id              // Delete document
POST   /api/cleanup-sessions        // Manual cleanup
GET    /api/processing-queue        // Queue status

// Settings management (v2.1)
GET    /api/settings                // Get configuration
POST   /api/settings                // Update configuration
POST   /api/settings/test-connection // Test API keys

// Health and monitoring
GET    /api/health/detailed         // Comprehensive health
GET    /api/stats                   // System statistics
GET    /api/knowledge-base/stats    // Knowledge base metrics
```

### Request/Response Patterns

#### Standardized Response Format
```javascript
// Success response
{
    "success": true,
    "data": {
        "document_id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "Understanding LLMs",
        "processing_time": 45.7,
        "chunks_created": 12
    },
    "metadata": {
        "timestamp": "2025-08-03T10:30:00Z",
        "api_version": "2.2.0",
        "processing_model": "gpt-4o-mini"
    }
}

// Error response
{
    "success": false,
    "error": {
        "code": "PROCESSING_FAILED",
        "message": "Failed to analyze content chunk",
        "details": "OpenAI API rate limit exceeded",
        "suggestion": "Please try again in 60 seconds"
    },
    "metadata": {
        "timestamp": "2025-08-03T10:30:00Z",
        "session_id": "sess_123",
        "retry_after": 60
    }
}
```

#### Server-Sent Events Pattern
```javascript
// SSE event structure
data: {
    "event": "progress",
    "data": {
        "session_id": "sess_123",
        "stage": "chunking",
        "progress": 0.25,
        "message": "Processing chunk 3 of 12",
        "chunk_data": {
            "index": 3,
            "text_preview": "In the context of machine learning...",
            "word_count": 187
        }
    },
    "timestamp": "2025-08-03T10:30:15Z"
}

data: {
    "event": "error",
    "data": {
        "session_id": "sess_123",
        "error": "Rate limit exceeded",
        "retry_suggestion": "Automatic retry in 30 seconds",
        "can_retry": true
    }
}

data: {
    "event": "completed",
    "data": {
        "session_id": "sess_123",
        "document_id": "550e8400-e29b-41d4-a716-446655440000",
        "summary": {
            "total_chunks": 12,
            "processing_time": 67.4,
            "contextual_embeddings": true,
            "analysis_complete": true
        }
    }
}
```

### Input Validation & Schemas

```javascript
// URL processing validation
const urlProcessingSchema = {
    url: {
        type: 'string',
        format: 'uri',
        required: true,
        maxLength: 2048
    },
    chunk_size: {
        type: 'integer',
        minimum: 100,
        maximum: 5000,
        default: 1200
    },
    chunk_overlap: {
        type: 'integer',
        minimum: 0,
        maximum: 1000,
        default: 200
    },
    ai_model: {
        type: 'string',
        enum: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
        default: 'gpt-4o-mini'
    },
    enable_contextual_embeddings: {
        type: 'boolean',
        default: true
    }
};

// File upload validation
const fileUploadSchema = {
    file: {
        required: true,
        maxSize: '100MB',
        allowedTypes: [
            'application/pdf',
            'application/epub+zip',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/csv',
            'text/plain'
        ]
    },
    processing_options: urlProcessingSchema // Inherit from URL schema
};
```

## Security Model

### Network Security

```yaml
# Tailscale VPN Configuration
services:
  autollama-on-hstgr:
    image: tailscale/tailscale:latest
    environment:
      - TS_EXTRA_ARGS=--auth-key file:/run/secrets/tsauthkey
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_USERSPACE=false
    cap_add:
      - net_admin
    devices:
      - /dev/net/tun:/dev/net/tun
```

### API Security

```javascript
// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:8080',
            'https://autollama.io',
            process.env.FRONTEND_URL
        ];
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Rate limiting
const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});
```

### Environment Security

```bash
# Required environment variables
OPENAI_API_KEY=sk-proj-...           # Secured in .env
DATABASE_URL=postgresql://...        # Connection string
QDRANT_URL=https://...              # Vector DB endpoint
QDRANT_API_KEY=...                  # Vector DB authentication

# Security settings
NODE_TLS_REJECT_UNAUTHORIZED=0      # For academic sites only
SESSION_SECRET=...                  # Session encryption
JWT_SECRET=...                      # Token signing (future)

# Operational security
LOG_LEVEL=info                      # No sensitive data in logs
ENABLE_DEBUG=false                  # Disable debug in production
MAX_FILE_SIZE=104857600             # 100MB upload limit
```

### Data Protection

```javascript
// Sensitive data handling
class SecureDataHandler {
    static sanitizeForLogging(data) {
        const sanitized = { ...data };
        
        // Remove sensitive fields
        delete sanitized.api_key;
        delete sanitized.password;
        delete sanitized.secret;
        
        // Truncate long content
        if (sanitized.content && sanitized.content.length > 200) {
            sanitized.content = sanitized.content.substring(0, 200) + '...';
        }
        
        return sanitized;
    }
    
    static validateApiKey(key) {
        // Basic API key format validation
        return key && key.startsWith('sk-') && key.length > 40;
    }
}
```

## Performance & Scalability

### Current Performance Metrics

```
Processing Speed:
├── URL Processing: 2-3 seconds per chunk
├── File Upload: 30-45 seconds per PDF (10-page average)
├── AI Analysis: 1.5-2 seconds per chunk (GPT-4o-mini)
├── Embedding Generation: 0.5 seconds per chunk
└── Database Storage: 0.1 seconds per chunk

Memory Usage:
├── API Service: 512MB-2GB (depending on file size)
├── BM25 Service: 256MB-1GB (index size dependent)
├── Frontend: 256MB (Nginx + static files)
└── Total System: ~1.5-4GB active memory

Storage Requirements:
├── PostgreSQL: ~1KB per chunk metadata
├── Qdrant: ~6KB per vector embedding
├── File Storage: Original files cached temporarily
└── Logs: ~100MB per day (configurable retention)
```

### Scalability Strategies

#### 1. Horizontal Scaling
```yaml
# Docker Compose scaling
services:
  autollama-api:
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
        reservations:
          memory: 1G
          cpus: '0.5'
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
```

#### 2. Database Performance
```sql
-- Connection pooling configuration
const poolConfig = {
    max: 20,                    // Maximum connections
    min: 5,                     // Minimum connections
    idle: 10000,               // 10 seconds idle timeout
    acquire: 60000,            // 60 seconds acquire timeout
    evict: 1000,               // 1 second eviction interval
    handleDisconnects: true,
    timezone: 'UTC'
};

-- Query optimization strategies
EXPLAIN ANALYZE SELECT * FROM processed_content 
WHERE status = 'completed' 
AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC LIMIT 20;

-- Partition large tables by date
CREATE TABLE processed_content_2025_08 PARTITION OF processed_content
FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
```

#### 3. Caching Strategy
```javascript
// Redis caching implementation
class CacheService {
    constructor() {
        this.redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true
        });
    }
    
    // Cache frequently accessed documents
    async cacheDocument(id, data, ttl = 3600) {
        const key = `doc:${id}`;
        await this.redis.setex(key, ttl, JSON.stringify(data));
    }
    
    // Cache search results
    async cacheSearchResults(query, results, ttl = 1800) {
        const key = `search:${Buffer.from(query).toString('base64')}`;
        await this.redis.setex(key, ttl, JSON.stringify(results));
    }
}
```

#### 4. Load Balancing
```nginx
# Nginx upstream configuration
upstream autollama_api {
    least_conn;
    server autollama-api-1:3001 max_fails=3 fail_timeout=30s;
    server autollama-api-2:3001 max_fails=3 fail_timeout=30s;
    server autollama-api-3:3001 max_fails=3 fail_timeout=30s;
}

location /api/ {
    proxy_pass http://autollama_api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    
    # Health check and failover
    proxy_next_upstream error timeout invalid_header http_500 http_502 http_503;
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;
}
```

### Performance Optimization Techniques

#### 1. Contextual Embeddings Optimization
```javascript
// Batch processing for efficiency
class ContextualEmbeddingOptimizer {
    async processBatch(chunks, batchSize = 5) {
        const batches = this.createBatches(chunks, batchSize);
        const results = [];
        
        for (const batch of batches) {
            const batchPromises = batch.map(chunk => 
                this.generateContextualEmbedding(chunk)
            );
            
            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults);
            
            // Rate limiting delay
            await this.delay(1000);
        }
        
        return results;
    }
    
    // Prompt caching for cost reduction (90% savings)
    async generateWithCaching(content, document) {
        const cacheKey = `context:${document.id}:${this.hashContent(content)}`;
        
        let cached = await this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        
        const result = await this.openai.generateContext(content, document);
        await this.cache.set(cacheKey, result, 86400); // 24 hour cache
        
        return result;
    }
}
```

#### 2. Database Query Optimization
```javascript
// Optimized database queries
class OptimizedQueries {
    // Single query for document with chunks
    async getDocumentWithChunks(documentId) {
        return await this.db.query(`
            SELECT 
                pc.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', c.id,
                            'chunk_index', c.chunk_index,
                            'chunk_text', c.chunk_text,
                            'contextual_summary', c.contextual_summary,
                            'word_count', c.word_count
                        ) ORDER BY c.chunk_index
                    ) FILTER (WHERE c.id IS NOT NULL), 
                    '[]'::json
                ) as chunks
            FROM processed_content pc
            LEFT JOIN chunks c ON c.document_id = pc.document_id
            WHERE pc.document_id = $1
            GROUP BY pc.id
        `, [documentId]);
    }
    
    // Paginated queries with counting
    async getPaginatedDocuments(page = 1, limit = 20, filters = {}) {
        const offset = (page - 1) * limit;
        
        const countQuery = `
            SELECT COUNT(*) as total
            FROM processed_content 
            WHERE status = $1 
            ${filters.category ? 'AND category = $2' : ''}
        `;
        
        const dataQuery = `
            SELECT 
                document_id, title, url, category, 
                technical_level, sentiment, chunk_count,
                created_at, uses_contextual_embeddings
            FROM processed_content 
            WHERE status = $1 
            ${filters.category ? 'AND category = $2' : ''}
            ORDER BY created_at DESC 
            LIMIT $${filters.category ? '3' : '2'} 
            OFFSET $${filters.category ? '4' : '3'}
        `;
        
        const [countResult, dataResult] = await Promise.all([
            this.db.query(countQuery, filters.category ? ['completed', filters.category] : ['completed']),
            this.db.query(dataQuery, filters.category ? ['completed', filters.category, limit, offset] : ['completed', limit, offset])
        ]);
        
        return {
            data: dataResult.rows,
            pagination: {
                page,
                limit,
                total: parseInt(countResult.rows[0].total),
                pages: Math.ceil(countResult.rows[0].total / limit)
            }
        };
    }
}
```

## Monitoring & Observability

### Health Check System

```javascript
// Comprehensive health monitoring
class HealthMonitoringService {
    async comprehensiveHealthCheck() {
        const startTime = Date.now();
        const health = {
            timestamp: new Date().toISOString(),
            status: 'healthy',
            services: {},
            performance: {},
            alerts: []
        };
        
        // Parallel health checks
        const checks = await Promise.allSettled([
            this.checkDatabase(),
            this.checkQdrant(),
            this.checkBM25(),
            this.checkOpenAI(),
            this.checkRedis(),
            this.checkDiskSpace(),
            this.checkMemoryUsage()
        ]);
        
        // Process results
        const [db, qdrant, bm25, openai, redis, disk, memory] = checks;
        
        health.services = {
            database: this.processCheckResult(db),
            qdrant: this.processCheckResult(qdrant),
            bm25: this.processCheckResult(bm25),
            openai: this.processCheckResult(openai),
            redis: this.processCheckResult(redis)
        };
        
        health.performance = {
            disk_usage: disk.status === 'fulfilled' ? disk.value : null,
            memory_usage: memory.status === 'fulfilled' ? memory.value : null,
            total_response_time: Date.now() - startTime
        };
        
        // Generate alerts
        this.generateAlerts(health);
        
        return health;
    }
    
    async checkDatabase() {
        const start = Date.now();
        try {
            const result = await this.db.query('SELECT 1 as health');
            const responseTime = Date.now() - start;
            
            return {
                status: 'healthy',
                response_time: responseTime,
                details: 'Connected successfully'
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                response_time: Date.now() - start,
                error: error.message,
                details: 'Database connection failed'
            };
        }
    }
    
    generateAlerts(health) {
        // Response time alerts
        if (health.services.database?.response_time > 1000) {
            health.alerts.push({
                severity: 'warning',
                service: 'database',
                message: 'Database response time high',
                value: `${health.services.database.response_time}ms`,
                threshold: '1000ms'
            });
        }
        
        // Memory usage alerts
        if (health.performance.memory_usage?.percent > 85) {
            health.alerts.push({
                severity: 'critical',
                service: 'system',
                message: 'High memory usage',
                value: `${health.performance.memory_usage.percent}%`,
                threshold: '85%'
            });
        }
        
        // Set overall status
        const hasErrors = Object.values(health.services).some(s => s.status === 'unhealthy');
        const hasCriticalAlerts = health.alerts.some(a => a.severity === 'critical');
        
        if (hasErrors || hasCriticalAlerts) {
            health.status = 'unhealthy';
        } else if (health.alerts.length > 0) {
            health.status = 'degraded';
        }
    }
}
```

### Logging Strategy

```javascript
// Structured logging with Winston
const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return JSON.stringify({
                timestamp,
                level,
                message,
                service: 'autollama-api',
                version: process.env.npm_package_version,
                environment: process.env.NODE_ENV,
                ...meta
            });
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        new winston.transports.File({ 
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 10
        })
    ]
});

// Usage examples
logger.info('Document processing started', {
    document_id: documentId,
    url: url,
    chunk_count: chunks.length,
    user_settings: sanitizedSettings
});

logger.error('AI analysis failed', {
    document_id: documentId,
    chunk_index: chunkIndex,
    error: error.message,
    model: 'gpt-4o-mini',
    retry_count: retryCount
});

logger.warn('Rate limit approaching', {
    service: 'openai',
    current_usage: currentUsage,
    limit: rateLimit,
    reset_time: resetTime
});
```

### Metrics Collection

```javascript
// Custom metrics collection
class MetricsCollector {
    constructor() {
        this.metrics = {
            processing: {
                documents_processed: 0,
                chunks_created: 0,
                embeddings_generated: 0,
                processing_time_total: 0,
                failed_documents: 0
            },
            api: {
                requests_total: 0,
                requests_by_endpoint: new Map(),
                response_times: [],
                error_count: 0
            },
            system: {
                memory_usage: [],
                cpu_usage: [],
                active_sessions: 0,
                queue_size: 0
            }
        };
    }
    
    recordProcessingMetrics(documentId, stats) {
        this.metrics.processing.documents_processed++;
        this.metrics.processing.chunks_created += stats.chunk_count;
        this.metrics.processing.processing_time_total += stats.processing_time;
        
        if (stats.uses_contextual_embeddings) {
            this.metrics.processing.embeddings_generated += stats.chunk_count;
        }
        
        logger.info('Processing metrics updated', {
            document_id: documentId,
            total_documents: this.metrics.processing.documents_processed,
            avg_processing_time: this.getAverageProcessingTime()
        });
    }
    
    getAverageProcessingTime() {
        const total = this.metrics.processing.processing_time_total;
        const count = this.metrics.processing.documents_processed;
        return count > 0 ? Math.round(total / count) : 0;
    }
    
    // Export metrics for monitoring systems
    exportPrometheusMetrics() {
        return `
# HELP autollama_documents_processed_total Total number of documents processed
# TYPE autollama_documents_processed_total counter
autollama_documents_processed_total ${this.metrics.processing.documents_processed}

# HELP autollama_chunks_created_total Total number of chunks created
# TYPE autollama_chunks_created_total counter
autollama_chunks_created_total ${this.metrics.processing.chunks_created}

# HELP autollama_avg_processing_time_seconds Average document processing time
# TYPE autollama_avg_processing_time_seconds gauge
autollama_avg_processing_time_seconds ${this.getAverageProcessingTime() / 1000}

# HELP autollama_active_sessions Current number of active processing sessions
# TYPE autollama_active_sessions gauge
autollama_active_sessions ${this.metrics.system.active_sessions}
        `.trim();
    }
}
```

## Error Handling & Recovery

### Error Classification

```javascript
// Custom error classes for different error types
class AutoLlamaError extends Error {
    constructor(message, code, statusCode = 500, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ProcessingError extends AutoLlamaError {
    constructor(message, details = {}) {
        super(message, 'PROCESSING_ERROR', 422);
        this.details = details;
    }
}

class AIServiceError extends AutoLlamaError {
    constructor(message, provider, retryable = true) {
        super(message, 'AI_SERVICE_ERROR', 503);
        this.provider = provider;
        this.retryable = retryable;
    }
}

class ValidationError extends AutoLlamaError {
    constructor(message, field) {
        super(message, 'VALIDATION_ERROR', 400);
        this.field = field;
    }
}

class RateLimitError extends AutoLlamaError {
    constructor(message, retryAfter = 60) {
        super(message, 'RATE_LIMIT_ERROR', 429);
        this.retryAfter = retryAfter;
    }
}
```

### Circuit Breaker Pattern

```javascript
// Circuit breaker for external service calls
class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000; // 1 minute
        this.monitoringPeriod = options.monitoringPeriod || 60000; // 1 minute
        
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
    }
    
    async call(fn, ...args) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime < this.resetTimeout) {
                throw new Error('Circuit breaker is OPEN - service temporarily unavailable');
            }
            
            // Try to transition to HALF_OPEN
            this.state = 'HALF_OPEN';
            this.successCount = 0;
        }
        
        try {
            const result = await fn(...args);
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    onSuccess() {
        this.failureCount = 0;
        this.lastFailureTime = null;
        
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= 3) {
                this.state = 'CLOSED';
                this.successCount = 0;
            }
        }
    }
    
    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }
}

// Usage with OpenAI service
class ResilientOpenAIService {
    constructor() {
        this.circuitBreaker = new CircuitBreaker({
            failureThreshold: 3,
            resetTimeout: 30000
        });
    }
    
    async analyzeContent(content) {
        return await this.circuitBreaker.call(async () => {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content }],
                timeout: 30000
            });
            
            return response.choices[0].message.content;
        });
    }
}
```

### Retry Logic with Exponential Backoff

```javascript
// Exponential backoff retry mechanism
class RetryHandler {
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.baseDelay = options.baseDelay || 1000;
        this.maxDelay = options.maxDelay || 30000;
        this.backoffFactor = options.backoffFactor || 2;
    }
    
    async execute(fn, context = {}) {
        let lastError;
        
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const result = await fn();
                
                if (attempt > 0) {
                    logger.info('Retry successful', {
                        attempt,
                        context,
                        total_attempts: attempt + 1
                    });
                }
                
                return result;
            } catch (error) {
                lastError = error;
                
                // Don't retry for certain error types
                if (this.isNonRetryableError(error)) {
                    throw error;
                }
                
                if (attempt < this.maxRetries) {
                    const delay = Math.min(
                        this.baseDelay * Math.pow(this.backoffFactor, attempt),
                        this.maxDelay
                    );
                    
                    logger.warn('Operation failed, retrying', {
                        attempt: attempt + 1,
                        max_retries: this.maxRetries,
                        delay_ms: delay,
                        error: error.message,
                        context
                    });
                    
                    await this.delay(delay);
                } else {
                    logger.error('All retry attempts exhausted', {
                        total_attempts: this.maxRetries + 1,
                        final_error: error.message,
                        context
                    });
                }
            }
        }
        
        throw lastError;
    }
    
    isNonRetryableError(error) {
        // Don't retry validation errors, authentication errors, etc.
        return error.statusCode === 400 || 
               error.statusCode === 401 || 
               error.statusCode === 403 || 
               error.code === 'VALIDATION_ERROR';
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Usage example
const retryHandler = new RetryHandler({
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000
});

await retryHandler.execute(async () => {
    return await this.openaiService.analyzeChunk(chunk);
}, { 
    operation: 'chunk_analysis',
    chunk_id: chunk.id,
    document_id: documentId
});
```

### Error Recovery Strategies

```javascript
// Comprehensive error recovery system
class ErrorRecoveryService {
    constructor({ database, monitoring, sessionService }) {
        this.db = database;
        this.monitor = monitoring;
        this.sessions = sessionService;
    }
    
    async handleProcessingError(sessionId, error, context = {}) {
        const session = await this.sessions.getSession(sessionId);
        
        if (!session) {
            logger.error('Session not found for error recovery', { sessionId });
            return { recovered: false, action: 'session_not_found' };
        }
        
        // Increment retry count
        await this.sessions.incrementRetryCount(sessionId);
        
        // Determine recovery strategy based on error type
        const strategy = this.determineRecoveryStrategy(error, session);
        
        logger.info('Attempting error recovery', {
            session_id: sessionId,
            error_type: error.constructor.name,
            recovery_strategy: strategy,
            retry_count: session.retry_count + 1,
            context
        });
        
        switch (strategy) {
            case 'RETRY_IMMEDIATELY':
                return await this.retryImmediately(sessionId, context);
            
            case 'RETRY_WITH_DELAY':
                return await this.retryWithDelay(sessionId, context);
            
            case 'PARTIAL_RECOVERY':
                return await this.attemptPartialRecovery(sessionId, context);
            
            case 'FAIL_AND_CLEANUP':
                return await this.failAndCleanup(sessionId, error);
            
            default:
                return { recovered: false, action: 'unknown_strategy' };
        }
    }
    
    determineRecoveryStrategy(error, session) {
        // Rate limit errors - retry with delay
        if (error instanceof RateLimitError) {
            return 'RETRY_WITH_DELAY';
        }
        
        // Temporary service errors - retry immediately (first time)
        if (error instanceof AIServiceError && error.retryable && session.retry_count < 2) {
            return 'RETRY_IMMEDIATELY';
        }
        
        // Processing errors with partial success - try to recover what we can
        if (error instanceof ProcessingError && session.processed_chunks > 0) {
            return 'PARTIAL_RECOVERY';
        }
        
        // Too many retries or non-retryable errors
        return 'FAIL_AND_CLEANUP';
    }
    
    async attemptPartialRecovery(sessionId, context) {
        try {
            // Save what we've processed so far
            const session = await this.sessions.getSession(sessionId);
            const processedChunks = await this.getProcessedChunks(session.document_id);
            
            if (processedChunks.length > 0) {
                // Mark document as partially processed
                await this.db.query(`
                    UPDATE processed_content 
                    SET status = 'partial', 
                        chunk_count = $1,
                        error_message = $2,
                        updated_at = NOW()
                    WHERE document_id = $3
                `, [processedChunks.length, 'Partially processed due to error', session.document_id]);
                
                await this.sessions.updateStatus(sessionId, 'partial');
                
                logger.info('Partial recovery successful', {
                    session_id: sessionId,
                    document_id: session.document_id,
                    chunks_saved: processedChunks.length,
                    total_chunks: session.total_chunks
                });
                
                return { 
                    recovered: true, 
                    action: 'partial_recovery',
                    chunks_saved: processedChunks.length
                };
            }
            
            return { recovered: false, action: 'no_chunks_to_save' };
            
        } catch (recoveryError) {
            logger.error('Partial recovery failed', {
                session_id: sessionId,
                recovery_error: recoveryError.message
            });
            
            return await this.failAndCleanup(sessionId, recoveryError);
        }
    }
    
    async failAndCleanup(sessionId, error) {
        try {
            // Mark session as failed
            await this.sessions.updateStatus(sessionId, 'failed', error.message);
            
            // Clean up any orphaned data
            await this.cleanupFailedSession(sessionId);
            
            // Send notification to monitoring
            await this.monitor.recordFailure(sessionId, error);
            
            logger.info('Session failed and cleaned up', {
                session_id: sessionId,
                error: error.message
            });
            
            return { 
                recovered: false, 
                action: 'failed_and_cleaned',
                error: error.message
            };
            
        } catch (cleanupError) {
            logger.error('Cleanup failed after session failure', {
                session_id: sessionId,
                original_error: error.message,
                cleanup_error: cleanupError.message
            });
            
            return { 
                recovered: false, 
                action: 'cleanup_failed',
                errors: [error.message, cleanupError.message]
            };
        }
    }
}
```

## Future Architecture Improvements

### Planned Refactoring (Days 1-15)

Based on the refactoring plan, the current monolithic `server.js` (4,506 lines) will be transformed into a modular architecture:

#### Phase 1: Foundation (Days 1-5)
- **Configuration Management**: Extract environment and service configuration
- **Service Extraction**: Separate content processing, file handling, AI services
- **Storage Abstraction**: Dedicated database and vector storage services
- **Target**: Reduce to ~2,000 lines

#### Phase 2: API Layer (Days 6-10)  
- **Route Modularization**: Split 38 endpoints into domain-specific route files
- **Controller Pattern**: Implement MVC pattern with dedicated controllers
- **Advanced Session Management**: Enhanced cleanup and monitoring
- **Middleware Stack**: Centralized error handling, validation, logging
- **Target**: Reduce to ~700 lines

#### Phase 3: Production Features (Days 11-15)
- **Queue System**: Bull/BullMQ for background processing
- **Caching Layer**: Redis integration for performance
- **Health Monitoring**: Comprehensive monitoring and alerting
- **Testing Suite**: 90%+ test coverage with unit/integration/e2e tests
- **Target**: Final server.js ~250 lines

### Microservices Evolution

```yaml
# Future microservices architecture
services:
  # Core API Gateway
  api-gateway:
    image: kong:latest
    ports: ["8080:8080"]
    
  # Processing Services
  content-processor:
    build: ./services/content-processor
    environment:
      - QUEUE_URL=redis://queue:6379
      
  ai-analyzer:
    build: ./services/ai-analyzer
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      
  embedding-generator:
    build: ./services/embedding-generator
    environment:
      - QDRANT_URL=${QDRANT_URL}
      
  # Data Services
  metadata-service:
    build: ./services/metadata-service
    environment:
      - DATABASE_URL=${DATABASE_URL}
      
  search-service:
    build: ./services/search-service
    ports: ["3002:3002"]
    
  # Infrastructure
  queue:
    image: redis:alpine
    
  monitoring:
    image: prometheus:latest
    
  logging:
    image: elasticsearch:8.0.0
```

### Event-Driven Architecture

```javascript
// Future event-driven processing
class EventDrivenProcessor {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.setupEventHandlers();
    }
    
    setupEventHandlers() {
        this.eventBus.on('document.uploaded', this.handleDocumentUpload.bind(this));
        this.eventBus.on('content.chunked', this.handleContentChunked.bind(this));
        this.eventBus.on('chunk.analyzed', this.handleChunkAnalyzed.bind(this));
        this.eventBus.on('embedding.generated', this.handleEmbeddingGenerated.bind(this));
        this.eventBus.on('processing.completed', this.handleProcessingCompleted.bind(this));
        this.eventBus.on('processing.failed', this.handleProcessingFailed.bind(this));
    }
    
    async handleDocumentUpload(event) {
        const { documentId, url, options } = event.data;
        
        // Emit content extraction event
        this.eventBus.emit('content.extract', {
            documentId,
            url,
            options,
            timestamp: new Date().toISOString()
        });
    }
    
    async handleContentChunked(event) {
        const { documentId, chunks } = event.data;
        
        // Process chunks in parallel
        chunks.forEach(chunk => {
            this.eventBus.emit('chunk.analyze', {
                documentId,
                chunkId: chunk.id,
                chunkText: chunk.text,
                chunkIndex: chunk.index
            });
        });
    }
}
```

### Advanced Monitoring Integration

```javascript
// OpenTelemetry integration for distributed tracing
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

const sdk = new NodeSDK({
    resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'autollama-api',
        [SemanticResourceAttributes.SERVICE_VERSION]: '2.2.0',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV
    }),
    traceExporter: new JaegerExporter({
        endpoint: process.env.JAEGER_ENDPOINT
    }),
    metricExporter: new PrometheusExporter({
        port: 9090
    })
});

// Custom instrumentation
const tracer = opentelemetry.trace.getTracer('autollama');

async function processDocument(documentId) {
    const span = tracer.startSpan('document.process', {
        attributes: {
            'document.id': documentId,
            'operation': 'full_processing'
        }
    });
    
    try {
        // Processing logic with spans
        await span.recordEvent('processing.started');
        const result = await performProcessing(documentId);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
    } catch (error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
    } finally {
        span.end();
    }
}
```

### Machine Learning Pipeline Integration

```python
# Future ML pipeline for enhanced content analysis
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.decomposition import LatentDirichletAllocation
import numpy as np

class AdvancedContentAnalyzer:
    def __init__(self):
        self.tfidf = TfidfVectorizer(max_features=1000, stop_words='english')
        self.kmeans = KMeans(n_clusters=10, random_state=42)
        self.lda = LatentDirichletAllocation(n_components=10, random_state=42)
        
    def analyze_content_clusters(self, documents):
        """Identify content clusters and topics"""
        
        # TF-IDF vectorization
        tfidf_matrix = self.tfidf.fit_transform(documents)
        
        # Clustering
        clusters = self.kmeans.fit_predict(tfidf_matrix)
        
        # Topic modeling
        topics = self.lda.fit_transform(tfidf_matrix)
        
        return {
            'clusters': clusters.tolist(),
            'topics': topics.tolist(),
            'feature_names': self.tfidf.get_feature_names_out().tolist()
        }
    
    def generate_smart_summaries(self, content, context):
        """Generate context-aware summaries using advanced NLP"""
        
        # Future: Custom transformer models
        # Fine-tuned on domain-specific data
        # Better than GPT for specific use cases
        
        pass
```

This architecture documentation provides a comprehensive overview of the current AutoLlama system and the planned improvements. The modular design ensures scalability, maintainability, and extensibility for future enhancements.