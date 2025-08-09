# Developer Getting Started Guide

Welcome to AutoLlama v2.1 "Context Llama" development! This guide will get you up and running with the AutoLlama development environment in under 30 minutes.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Setup](#quick-setup)
3. [Development Environment](#development-environment)
4. [Project Structure](#project-structure)
5. [Running Tests](#running-tests)
6. [Common Development Tasks](#common-development-tasks)
7. [Debugging](#debugging)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software
- **Docker & Docker Compose** (v20.10+)
- **Node.js** (v18.17+) - for local API development
- **Git** - for version control
- **curl** - for API testing

### Optional but Recommended
- **VS Code** with Docker extension
- **Postman** - for API testing
- **pgAdmin** - for database management

### Required Services
- **OpenAI API Key** - for AI processing
- **Qdrant Cloud** - for vector storage
- **PostgreSQL** - included in Docker Compose

## Quick Setup

### 1. Clone and Configure

```bash
# Clone the repository
git clone <repository-url>
cd autollama

# Copy environment template
cp example.env .env

# Edit .env with your API keys
nano .env
```

### 2. Essential Environment Variables

```bash
# .env file - minimum required configuration
OPENAI_API_KEY=sk-proj-your-openai-key-here
DATABASE_URL=postgresql://autollama:password@localhost:5432/autollama
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key
ENABLE_CONTEXTUAL_EMBEDDINGS=true
NODE_ENV=development
```

### 3. Start Development Environment

```bash
# Start all services
docker compose up -d

# Verify services are running
docker compose ps

# Check API health
curl http://localhost:8080/api/health
```

### 4. Verify Setup

```bash
# Test API endpoint
curl -X POST http://localhost:8080/api/process-url \
  -H "Content-Type: application/json" \
  -d '{"url":"https://en.wikipedia.org/wiki/Llama"}'

# Check frontend
open http://localhost:8080
```

## Development Environment

### Service Overview

| Service | Port | Purpose | Development Access |
|---------|------|---------|-------------------|
| Frontend | 8080 | React UI | http://localhost:8080 |
| API | 3001 | Node.js API | Internal via proxy |
| BM25 | 3002 | Search service | Internal via proxy |
| SSE | 3003 | Real-time updates | Internal via proxy |
| PostgreSQL | 5432 | Database | localhost:5432 |

### Development Workflow

#### Frontend Development
```bash
# For React frontend changes
cd config/react-frontend

# Install dependencies (first time)
npm install

# Start development server with hot reload
npm run dev

# Build for production
npm run build
```

#### API Development
```bash
# For API changes, rebuild container
docker compose build autollama-api --no-cache
docker compose up -d autollama-api

# View API logs
docker compose logs -f autollama-api

# Enter API container for debugging
docker exec -it autollama-autollama-api-1 /bin/sh
```

#### Database Access
```bash
# Connect to PostgreSQL
docker exec -it autollama-autollama-api-1 psql $DATABASE_URL

# Or use external connection
psql "postgresql://autollama:password@localhost:5432/autollama"
```

## Project Structure

### Directory Layout
```
autollama/
├── api/                          # Node.js API server
│   ├── src/                      # Source code
│   │   ├── config/              # Configuration
│   │   ├── controllers/         # Route controllers
│   │   ├── middleware/          # Express middleware
│   │   ├── routes/              # API routes
│   │   ├── services/            # Business logic
│   │   ├── tests/               # Test suites
│   │   └── utils/               # Utilities
│   ├── docs/                    # API documentation
│   │   ├── guides/              # Developer guides
│   │   └── examples/            # Code examples
│   ├── package.json             # Dependencies
│   └── Dockerfile               # Container config
├── config/                      # Frontend & nginx
│   ├── react-frontend/          # React application
│   └── nginx.conf               # Proxy configuration
├── docker-compose.yaml          # Service orchestration
├── example.env                  # Environment template
└── README.md                    # User documentation
```

### Key Files for Development

| File | Purpose | When to Edit |
|------|---------|-------------|
| `api/server.js` | Main API server | Core API changes |
| `api/src/routes/` | API endpoints | Adding new endpoints |
| `api/src/services/` | Business logic | Feature implementation |
| `config/react-frontend/src/` | Frontend code | UI changes |
| `docker-compose.yaml` | Service config | Infrastructure changes |
| `config/react-frontend/nginx.conf` | Proxy config | Routing changes |

## Running Tests

### Test Suites Available

```bash
# Run all tests
cd api && npm test

# Run specific test suites
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:e2e          # End-to-end tests
npm run test:performance  # Performance tests

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Test Categories

#### Unit Tests
- **Location**: `api/src/tests/unit/`
- **Purpose**: Test individual functions and modules
- **Example**: Service functions, utilities, parsers

#### Integration Tests
- **Location**: `api/src/tests/integration/`
- **Purpose**: Test API endpoints and service interactions
- **Example**: API routes, database operations, external services

#### End-to-End Tests
- **Location**: `api/src/tests/e2e/`
- **Purpose**: Test complete user workflows
- **Example**: Document processing, search functionality

#### Performance Tests
- **Location**: `api/src/tests/performance/`
- **Purpose**: Test system performance and resource usage
- **Example**: Load testing, memory monitoring, response times

### Running Specific Tests

```bash
# Test a specific file
npm test -- src/tests/unit/services.test.js

# Test with pattern matching
npm test -- --testNamePattern="content processing"

# Debug mode
npm test -- --runInBand --detectOpenHandles
```

## Common Development Tasks

### Adding a New API Endpoint

1. **Create route handler**:
```javascript
// api/src/routes/my-feature.routes.js
const express = require('express');
const router = express.Router();

router.get('/my-endpoint', async (req, res) => {
  try {
    // Implementation here
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

2. **Register route**:
```javascript
// api/src/routes/index.js
const myFeatureRoutes = require('./my-feature.routes');
// Add to setupRoutes function
apiRouter.use('/api', myFeatureRoutes);
```

3. **Add tests**:
```javascript
// api/src/tests/integration/my-feature.test.js
describe('My Feature API', () => {
  test('GET /api/my-endpoint', async () => {
    const response = await request(app)
      .get('/api/my-endpoint')
      .expect(200);
    
    expect(response.body.success).toBe(true);
  });
});
```

### Adding a New Service

1. **Create service**:
```javascript
// api/src/services/my-service/my-feature.service.js
class MyFeatureService {
  constructor() {
    this.initialized = false;
  }

  async processData(input) {
    // Implementation
    return result;
  }
}

module.exports = { MyFeatureService };
```

2. **Register service**:
```javascript
// api/src/services/index.js
const { MyFeatureService } = require('./my-service/my-feature.service');

async function initializeServices() {
  const services = {
    // ... existing services
    myFeature: new MyFeatureService()
  };
  
  return services;
}
```

### Frontend Component Development

1. **Create component**:
```jsx
// config/react-frontend/src/components/MyFeature/MyComponent.jsx
import React, { useState } from 'react';

const MyComponent = () => {
  const [data, setData] = useState(null);

  return (
    <div className="my-component">
      {/* Component implementation */}
    </div>
  );
};

export default MyComponent;
```

2. **Add to app**:
```jsx
// config/react-frontend/src/App.jsx
import MyComponent from './components/MyFeature/MyComponent';

// Add to appropriate location in render
<MyComponent />
```

### Database Schema Changes

1. **Create migration**:
```sql
-- database/migrations/add_my_feature.sql
ALTER TABLE documents ADD COLUMN my_field TEXT;
CREATE INDEX idx_documents_my_field ON documents(my_field);
```

2. **Apply migration**:
```bash
docker exec -it autollama-autollama-api-1 psql $DATABASE_URL < database/migrations/add_my_feature.sql
```

## Debugging

### API Debugging

```bash
# View real-time logs
docker compose logs -f autollama-api

# Debug specific component
docker compose logs -f autollama-api | grep "ERROR"

# Interactive debugging
docker exec -it autollama-autollama-api-1 /bin/sh
node -e "console.log(process.env.OPENAI_API_KEY ? 'API key set' : 'API key missing')"
```

### Frontend Debugging

```bash
# Development mode with hot reload
cd config/react-frontend
npm run dev

# Production build debugging
npm run build
npm run preview
```

### Database Debugging

```bash
# Check database connection
docker exec -it autollama-autollama-api-1 psql $DATABASE_URL -c "SELECT version();"

# View recent documents
docker exec -it autollama-autollama-api-1 psql $DATABASE_URL -c "
SELECT document_id, title, created_at, status 
FROM processed_content 
ORDER BY created_at DESC 
LIMIT 5;"

# Check vector storage
curl -H "api-key: $QDRANT_API_KEY" "$QDRANT_URL/collections"
```

### Performance Debugging

```bash
# Monitor resource usage
docker stats

# API performance
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8080/api/health

# Memory analysis
docker exec -it autollama-autollama-api-1 node -e "
console.log('Memory usage:', process.memoryUsage());
console.log('Uptime:', process.uptime(), 'seconds');
"
```

## Troubleshooting

### Common Issues

#### API Not Starting
```bash
# Check logs for errors
docker compose logs autollama-api

# Common fixes
docker compose down
docker compose up -d --force-recreate

# Verify environment variables
docker exec autollama-autollama-api-1 printenv | grep -E "(OPENAI|DATABASE|QDRANT)"
```

#### Database Connection Issues
```bash
# Check PostgreSQL status
docker compose logs postgres

# Test connection
docker exec -it autollama-autollama-api-1 psql $DATABASE_URL -c "SELECT 1;"

# Reset database
docker compose down -v  # WARNING: Deletes all data
docker compose up -d
```

#### Frontend Not Loading
```bash
# Check nginx logs
docker compose logs autollama

# Verify proxy configuration
docker exec autollama-autollama-1 nginx -t

# Rebuild frontend
cd config/react-frontend
npm run build
docker compose restart autollama
```

#### Tests Failing
```bash
# Run tests with verbose output
npm test -- --verbose

# Check test environment
npm run test:unit -- --detectOpenHandles

# Reset test database
NODE_ENV=test npm run db:reset
npm test
```

### Performance Issues

#### Slow Processing
- Check OpenAI API rate limits
- Verify Qdrant connection speed
- Monitor memory usage during processing
- Consider disabling contextual embeddings for testing

#### High Memory Usage
- Monitor with `docker stats`
- Check for memory leaks in logs
- Restart API service: `docker compose restart autollama-api`

### Environment Issues

#### Missing API Keys
```bash
# Verify all required keys are set
docker exec autollama-autollama-api-1 node -e "
const required = ['OPENAI_API_KEY', 'DATABASE_URL', 'QDRANT_URL', 'QDRANT_API_KEY'];
required.forEach(key => {
  console.log(key + ':', process.env[key] ? 'SET' : 'MISSING');
});
"
```

#### Port Conflicts
```bash
# Check what's using ports
lsof -i :8080
lsof -i :3001

# Use different ports
# Edit docker-compose.yaml port mappings
```

## Next Steps

Once you have the development environment running:

1. **Explore the API**: Visit http://localhost:8080/api-docs for interactive documentation
2. **Read the Architecture Guide**: Understanding the system design
3. **Check Contributing Guidelines**: Code standards and workflow
4. **Run the test suite**: Ensure everything works correctly
5. **Start developing**: Pick an issue or feature to work on

## Getting Help

- **Documentation**: Check `/api/docs/guides/` for detailed guides
- **API Reference**: Interactive docs at http://localhost:8080/api-docs
- **Logs**: Use `docker compose logs -f` for real-time debugging
- **Community**: Check GitHub issues for known problems and solutions

Happy coding! 🦙✨