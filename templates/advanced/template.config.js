/**
 * Advanced AutoLlama Template
 * 🦙 Production-ready RAG with all enterprise features
 */

module.exports = {
  name: 'Advanced RAG Platform',
  description: '🚀 Full-featured enterprise RAG with analytics and monitoring',
  deploymentMode: 'hybrid',
  features: [
    'PostgreSQL database (production-ready)',
    'Contextual embeddings (60% better accuracy)',
    'Advanced document analysis',
    'Real-time processing visualization',
    'Performance monitoring',
    'Multi-modal support',
    'OpenWebUI integration',
    'Background job processing',
    'Comprehensive analytics'
  ],
  
  configuration: {
    database: {
      type: 'postgresql',
      url: 'postgresql://autollama:autollama@localhost:5432/autollama'
    },
    vector: {
      type: 'qdrant',
      url: 'http://localhost:6333',
      apiKey: 'optional'
    },
    ai: {
      provider: 'openai',
      models: {
        embedding: 'text-embedding-3-large',
        chat: 'gpt-4o',
        context: 'gpt-4o-mini'
      }
    },
    processing: {
      chunking: 'intelligent',
      contextualEmbeddings: true,
      batchSize: 10,
      backgroundProcessing: true,
      documentAnalysis: 'advanced'
    },
    features: {
      realTimeVisualization: true,
      performanceMonitoring: true,
      advancedAnalytics: true,
      openWebUIIntegration: true,
      multiModal: true
    },
    ui: {
      theme: 'professional',
      features: [
        'upload', 'search', 'chat', 'analytics', 
        'monitoring', 'visualization', 'admin'
      ]
    }
  },
  
  dependencies: {
    runtime: [
      'pg',
      'bullmq',
      'winston',
      'express',
      'react',
      'qdrant-js'
    ],
    monitoring: [
      'prom-client',
      '@opentelemetry/node',
      'newrelic'
    ]
  },
  
  scripts: {
    'dev': 'autollama dev --mode hybrid',
    'start': 'autollama deploy --target node',
    'migrate': 'autollama migrate --up',
    'test': 'autollama test',
    'test:watch': 'autollama test --watch',
    'test:coverage': 'autollama test --coverage',
    'deploy': 'autollama deploy --build',
    'deploy:docker': 'autollama deploy --target docker',
    'status': 'autollama status',
    'doctor': 'autollama doctor',
    'logs': 'autollama logs --follow'
  },
  
  files: {
    '.env.template': `# Advanced AutoLlama Configuration
# Production-ready setup with all features enabled

# Deployment Mode
DEPLOYMENT_MODE=hybrid

# AI Configuration
OPENAI_API_KEY=your_openai_api_key_here
AI_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-large
CHAT_MODEL=gpt-4o
CONTEXT_MODEL=gpt-4o-mini

# Database Configuration
DATABASE_URL=postgresql://autollama:autollama@localhost:5432/autollama

# Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your_qdrant_key_optional

# Processing Configuration
ENABLE_CONTEXTUAL_EMBEDDINGS=true
CONTEXT_GENERATION_BATCH_SIZE=10
CHUNKING_METHOD=intelligent
ENABLE_BACKGROUND_PROCESSING=true
ENABLE_DOCUMENT_ANALYSIS=true

# Performance & Monitoring
ENABLE_PERFORMANCE_MONITORING=true
ENABLE_ANALYTICS=true
LOG_LEVEL=info
METRICS_PORT=9090

# Features
ENABLE_OPENWEBUI_INTEGRATION=true
ENABLE_MULTI_MODAL=true
ENABLE_REAL_TIME_VISUALIZATION=true

# Security
SESSION_SECRET=generate_random_secret_here
CORS_ORIGIN=https://your-domain.com
RATE_LIMIT_ENABLED=true

# UI Configuration
LLAMA_PERSONALITY=professional
UI_THEME=advanced
`,
    
    'README.md': `# {{projectName}}

🦙 Advanced AutoLlama RAG Platform with Enterprise Features

## Features

✨ **Context-Aware Retrieval**: 60% better accuracy with Anthropic's contextual embeddings
📊 **Advanced Analytics**: Comprehensive document and usage analytics  
🔄 **Real-Time Processing**: Live visualization of document processing
🌐 **OpenWebUI Integration**: Native RAG pipeline for chat interfaces
📈 **Performance Monitoring**: Built-in metrics and health monitoring
🎯 **Multi-Modal Support**: Text, images, and structured data
🔧 **Background Processing**: Scalable job queue system

## Quick Start

### 1. Configure Environment
\`\`\`bash
cp .env.template .env
# Edit .env with your API keys and database URL
\`\`\`

### 2. Setup Database
\`\`\`bash
# Option A: Use Docker PostgreSQL
docker run -d --name postgres \\
  -e POSTGRES_USER=autollama \\
  -e POSTGRES_PASSWORD=autollama \\
  -e POSTGRES_DB=autollama \\
  -p 5432:5432 postgres:15

# Option B: Use existing PostgreSQL
# Just update DATABASE_URL in .env
\`\`\`

### 3. Start Development
\`\`\`bash
npm run dev
\`\`\`

### 4. Production Deployment
\`\`\`bash
npm run deploy
\`\`\`

## Architecture

- **API Server**: Express.js with comprehensive RAG endpoints
- **Frontend**: React with real-time updates and analytics
- **Database**: PostgreSQL with advanced indexing
- **Vector Store**: Qdrant for semantic search
- **Search**: BM25 + Vector hybrid retrieval
- **Processing**: Background jobs with Bull queues
- **Monitoring**: OpenTelemetry + Prometheus metrics

## API Endpoints

- \`GET /api/health\` - System health and status
- \`POST /api/process-file\` - Upload and process documents
- \`POST /api/search\` - Semantic + lexical search
- \`POST /api/chat\` - RAG-powered chat
- \`GET /api/analytics\` - Usage and performance metrics
- \`GET /api/docs\` - Interactive API documentation

## Monitoring

- **Health Dashboard**: http://localhost:8080/admin
- **Metrics**: http://localhost:9090/metrics
- **API Docs**: http://localhost:8080/api/docs
- **OpenWebUI**: Configure at port 9099

## Support

- 📚 [Documentation](https://autollama.dev)
- 🐛 [Issues](https://github.com/autollama/autollama/issues)
- 💬 [Discussions](https://github.com/autollama/autollama/discussions)

Happy building! 🚀🦙
`,
    
    'autollama.config.js': JSON.stringify({
      deployment: 'hybrid',
      personality: 'professional',
      database: {
        type: 'postgresql',
        url: 'postgresql://autollama:autollama@localhost:5432/autollama'
      },
      vector: {
        type: 'qdrant',
        url: 'http://localhost:6333'
      },
      features: {
        contextualEmbeddings: true,
        advancedAnalytics: true,
        performanceMonitoring: true,
        openWebUIIntegration: true,
        multiModal: true,
        backgroundProcessing: true,
        realTimeVisualization: true
      },
      processing: {
        chunkingMethod: 'intelligent',
        batchSize: 10,
        maxConcurrent: 5
      }
    }, null, 2)
  }
};