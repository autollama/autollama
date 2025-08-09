# 🦙 AutoLlama Real-Time Pipeline Monitor

A React Flow-powered visualization system that shows document chunks flowing through the RAG processing pipeline in real-time, similar to how mempool.space visualizes Bitcoin transactions.

## ✨ Features

### 🎯 Real-Time Visualization
- **Live chunk tracking** through 6 pipeline stages
- **Animated chunk movement** with smooth transitions  
- **WebSocket updates** for real-time status changes
- **Mobile-responsive design** with touch-friendly controls

### 📊 Pipeline Stages
1. **Queue** - Files waiting to be processed
2. **Context Generation** - GPT-4o mini AI analysis  
3. **Context Prepending** - PostgreSQL metadata storage
4. **Embeddings** - Qdrant vector generation
5. **BM25 Index** - Ultrafast text search indexing (500x speedup)
6. **OpenWebUI** - Final RAG pipeline availability

### 🔧 Interactive Features
- **File selector** with search/filter for ALL files
- **Click-to-inspect** chunk details with full content preview
- **Model selector** (GPT-4o mini, GPT-4o, Claude 3.5 Sonnet)
- **Real-time statistics** and cost tracking
- **System health monitoring** for all services

## 🚀 Quick Start

### 1. Build the Pipeline UI
```bash
# Make build script executable and run
chmod +x build-pipeline.sh
./build-pipeline.sh
```

### 2. Start All Services
```bash
# Start the full stack with new BM25 service
docker compose up -d

# Check all services are running
docker compose ps
```

### 3. Access the Pipeline Monitor
- **Main Interface**: http://localhost:8080
- **WebSocket**: ws://localhost:3003
- **BM25 API**: http://localhost:3002

## 🏗️ Architecture

### Service Stack
```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   React UI  │    │ Nginx Proxy  │    │  Express    │
│  Port 8080  │◄──►│  + WebSocket │◄──►│  API :3001  │
└─────────────┘    └──────────────┘    └─────────────┘
                           │                     │
                           ▼                     ▼
                   ┌──────────────┐    ┌─────────────────┐
                   │   BM25S      │    │    WebSocket    │
                   │  Port :3002  │    │   Server :3003  │
                   └──────────────┘    └─────────────────┘
```

### Real-Time Data Flow
- **SSE** - Server-Sent Events for processing updates
- **WebSocket** - Real-time chunk position tracking
- **React Flow** - Interactive pipeline visualization
- **Mobile-First** - Responsive design for all devices

## 📱 Mobile Optimization

### Touch-Friendly Features
- **Swipe navigation** between pipeline stages
- **Collapsible sidebar** with smooth animations
- **Bottom sheet modals** for chunk details
- **Optimized touch targets** (44px minimum)
- **Gesture controls** for zoom/pan

### Responsive Breakpoints
- **Mobile**: Vertical stack layout
- **Tablet**: Compact horizontal flow
- **Desktop**: Full pipeline visualization

## 🔧 Development

### Frontend Development
```bash
cd config/pipeline

# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Type checking
npm run type-check
```

### Backend Integration
- Enhanced SSE events with pipeline data
- WebSocket server for real-time updates
- BM25S Python microservice integration
- PostgreSQL + Qdrant dual storage

## 🧪 Testing

### Manual Testing Commands
```bash
# Test URL processing with pipeline visualization
curl -X POST http://localhost:8080/api/process-url-stream \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://en.wikipedia.org/wiki/Llama"}' -N

# Test BM25 service health
curl http://localhost:3002/health

# Test WebSocket connection
curl -H "Connection: Upgrade" -H "Upgrade: websocket" \\
  http://localhost:3003/

# Monitor pipeline in browser
open http://localhost:8080
```

### Performance Testing
- **Virtual scrolling** for 1000+ files
- **Throttled updates** (10/sec max)
- **Chunk animation limits** (50 concurrent)
- **Memory optimization** for mobile devices

## 🎨 UI Components

### Core Components
- `PipelineVisualization` - Main React Flow container
- `FileSelector` - File management with search/filter
- `PipelineNode` - Individual stage visualization
- `AnimatedEdge` - Chunk movement animations
- `ChunkDetail` - Modal for detailed inspection

### Mobile Components
- `MobileHeader` - Touch-optimized navigation
- `TouchGestures` - Swipe and pinch controls
- `BottomSheet` - Mobile-friendly modals

## 🔄 Migration Strategy

### Backward Compatibility
- Original HTML interface backed up as `index.html.backup`
- Feature flag support for gradual rollout
- SSE endpoints maintained for legacy clients
- Graceful fallback for unsupported browsers

### Rollback Process
```bash
# Restore original interface if needed
cp config/index.html.backup config/index.html
docker compose restart autollama
```

## 📊 Enhanced Features

### BM25S Integration
- **500x faster** than traditional BM25 libraries
- **Pure Python** with scipy sparse matrices
- **Real-time indexing** as documents are processed
- **FastAPI** service with full REST API

### Contextual Embeddings v2.0
- **35% better retrieval accuracy**
- **Document-aware chunking** with context summaries
- **Enhanced vector storage** in Qdrant
- **Cost optimization** with prompt caching

### Real-Time Analytics
- **Processing throughput** monitoring
- **Cost tracking** by model and usage
- **System health** indicators
- **Performance metrics** dashboard

## 🚦 Status Indicators

### Visual Status System
- 🟡 **Yellow** = Processing
- 🟢 **Green** = Completed  
- 🔵 **Blue** = Queued
- 🔴 **Red** = Error

### Connection States
- **Live** - Real-time WebSocket connection
- **Offline** - Disconnected (auto-reconnect)
- **Syncing** - Catching up with missed updates

## 💡 Tips & Best Practices

### For Optimal Performance
1. **Use Chrome/Safari** for best WebSocket support
2. **Enable hardware acceleration** for smooth animations
3. **Close unused tabs** to free memory for large files
4. **Use WiFi** for better real-time sync

### For Mobile Usage
1. **Portrait mode** works best for file browsing
2. **Landscape mode** optimal for pipeline view
3. **Pinch to zoom** for detailed inspection
4. **Swipe gestures** for quick navigation

## 🎯 Future Enhancements

### Planned Features
- **Batch operations** for multiple files
- **Custom pipeline stages** configuration
- **Advanced filtering** by metadata
- **Export capabilities** for processing reports
- **Collaborative features** for team workflows

### Performance Optimizations
- **Service workers** for offline capability
- **IndexedDB** for client-side caching
- **WebAssembly** for complex calculations
- **Progressive loading** for large datasets

---

**AutoLlama Pipeline Monitor** - Making RAG processing transparent, beautiful, and interactive! 🦙✨