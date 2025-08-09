/**
 * API Documentation Routes
 * Serves OpenAPI specification and interactive documentation
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');
const router = express.Router();

// Load OpenAPI specification
let openApiSpec;
try {
  const specPath = path.join(__dirname, '../../docs/openapi.yaml');
  const specContent = fs.readFileSync(specPath, 'utf8');
  openApiSpec = yaml.load(specContent);
} catch (error) {
  console.error('Failed to load OpenAPI specification:', error.message);
  openApiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'AutoLlama API',
      version: '2.2.0',
      description: 'API documentation failed to load'
    },
    paths: {}
  };
}

// Swagger UI options
const swaggerOptions = {
  explorer: true,
  swaggerOptions: {
    deepLinking: true,
    displayOperationId: true,
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
    docExpansion: 'list',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
    requestInterceptor: (req) => {
      // Add default headers for try-it-out functionality
      if (!req.headers['Content-Type'] && req.method !== 'GET') {
        req.headers['Content-Type'] = 'application/json';
      }
      return req;
    },
    responseInterceptor: (res) => {
      // Log responses for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log('API Response:', {
          status: res.status,
          url: res.url,
          headers: res.headers
        });
      }
      return res;
    }
  },
  customCss: `
    /* Clean, minimal styling */
    .swagger-ui .topbar { display: none; }
    
    /* Minimal header styling */
    .swagger-ui .wrapper::before {
      content: "AutoLlama v2.2 - Intelligent Context API";
      display: block;
      background: linear-gradient(90deg, #2563eb, #7c3aed);
      color: white;
      padding: 8px 20px;
      margin: -20px -20px 20px -20px;
      text-align: center;
      font-weight: 600;
      border-radius: 0;
      font-size: 1.1em;
    }
    
    .swagger-ui .info .title {
      color: #2563eb;
      font-size: 2rem;
      margin-bottom: 1rem;
    }
    
    .swagger-ui .info .description {
      font-size: 1.1rem;
      line-height: 1.6;
    }
    
    /* Authorization section styling */
    .swagger-ui .auth-wrapper {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 15px;
      background: #f8fafc;
    }
    
    .swagger-ui .opblock.opblock-post {
      border-color: #10b981;
    }
    
    .swagger-ui .opblock.opblock-get {
      border-color: #2563eb;
    }
    
    .swagger-ui .opblock.opblock-delete {
      border-color: #dc2626;
    }
    
    .swagger-ui .opblock.opblock-put {
      border-color: #f59e0b;
    }
    
    .swagger-ui .btn.execute {
      background-color: #10b981;
      color: white;
      font-weight: bold;
    }
    
    .swagger-ui .btn.execute:hover {
      background-color: #059669;
    }
    
    .swagger-ui .btn.authorize {
      background-color: #f59e0b;
      color: white;
    }
    
    .swagger-ui .btn.authorize {
      opacity: 0.7;
    }
  `,
  customSiteTitle: 'AutoLlama v2.2 - Intelligent Context API',
  customfavIcon: '/docs/favicon.ico'
};


// API Documentation with Swagger UI
router.use('/api-docs', swaggerUi.serve);
router.get('/api-docs', swaggerUi.setup(openApiSpec, swaggerOptions));

// OpenAPI specification endpoints (both /api and /docs paths for flexibility)
router.get('/api/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openApiSpec);
});

router.get('/api/openapi.yaml', (req, res) => {
  try {
    const specPath = path.join(__dirname, '../../docs/openapi.yaml');
    const specContent = fs.readFileSync(specPath, 'utf8');
    res.setHeader('Content-Type', 'application/x-yaml');
    res.send(specContent);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load OpenAPI specification',
      message: error.message
    });
  }
});

// Legacy paths for backward compatibility
router.get('/docs/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openApiSpec);
});

router.get('/docs/openapi.yaml', (req, res) => {
  try {
    const specPath = path.join(__dirname, '../../docs/openapi.yaml');
    const specContent = fs.readFileSync(specPath, 'utf8');
    res.setHeader('Content-Type', 'application/x-yaml');
    res.send(specContent);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load OpenAPI specification',
      message: error.message
    });
  }
});

// API Reference redirect
router.get('/docs/reference', (req, res) => {
  res.redirect('/api/docs');
});

// Test route to verify docs routes are working
router.get('/test-route', (req, res) => {
  console.log('🧪 Test route hit!');
  res.json({ message: 'Docs routes are working!' });
});

// Documentation health check
router.get('/api/docs/health', (req, res) => {
  res.json({
    success: true,
    documentation: {
      status: 'available',
      version: openApiSpec.info.version,
      endpoints: Object.keys(openApiSpec.paths || {}).length,
      schemas: Object.keys(openApiSpec.components?.schemas || {}).length
    },
    links: {
      interactive: '/docs',
      openapi_json: '/api/openapi.json',
      openapi_yaml: '/api/openapi.yaml'
    }
  });
});

// Legacy health check path
router.get('/docs/health', (req, res) => {
  res.json({
    success: true,
    documentation: {
      status: 'available',
      version: openApiSpec.info.version,
      endpoints: Object.keys(openApiSpec.paths || {}).length,
      schemas: Object.keys(openApiSpec.components?.schemas || {}).length
    },
    links: {
      interactive: '/docs',
      openapi_json: '/api/openapi.json',
      openapi_yaml: '/api/openapi.yaml'
    }
  });
});

// API Explorer endpoint
router.get('/explorer', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AutoLlama API Explorer</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2563eb;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #64748b;
            font-size: 18px;
            margin-bottom: 30px;
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        .feature {
            padding: 20px;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            background: #f8fafc;
        }
        .feature h3 {
            color: #1e293b;
            margin-top: 0;
        }
        .links {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            margin-top: 30px;
        }
        .btn {
            display: inline-block;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            transition: all 0.2s;
        }
        .btn-primary {
            background: #2563eb;
            color: white;
        }
        .btn-primary:hover {
            background: #1d4ed8;
        }
        .btn-secondary {
            background: #e2e8f0;
            color: #475569;
        }
        .btn-secondary:hover {
            background: #cbd5e1;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>AutoLlama API Explorer</h1>
        <p class="subtitle">Intelligent Context Llama v2.2 - Enhanced RAG Platform with Advanced Document Understanding</p>
        
        <div class="features">
            <div class="feature">
                <h3>🧠 Intelligent Context</h3>
                <p>35-60% better retrieval through document intelligence and semantic boundaries</p>
            </div>
            <div class="feature">
                <h3>✂️ Smart Segmentation</h3>
                <p>Semantic, structural, and hierarchical chunking with document type detection</p>
            </div>
            <div class="feature">
                <h3>⚡ Real-time Processing</h3>
                <p>Server-Sent Events with enhanced metadata tracking and performance monitoring</p>
            </div>
            <div class="feature">
                <h3>🔍 Advanced Search</h3>
                <p>Vector similarity + BM25 with contextual embeddings and document structure</p>
            </div>
        </div>

        <div class="links">
            <a href="/api/docs" class="btn btn-primary">📖 Interactive API Docs</a>
            <a href="/api/docs/openapi.json" class="btn btn-secondary">📋 OpenAPI JSON</a>
            <a href="/api/docs/openapi.yaml" class="btn btn-secondary">📄 OpenAPI YAML</a>
            <a href="/api/docs/examples" class="btn btn-secondary">🔧 Code Examples</a>
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b;">
            <p><strong>Quick Start:</strong></p>
            <pre style="background: #f1f5f9; padding: 15px; border-radius: 4px; overflow-x: auto;"><code># Process a URL
curl -X POST http://localhost:8080/api/process-url \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com/article", "chunkSize": 1000}'

# Search content
curl "http://localhost:8080/api/search?q=artificial+intelligence&limit=10"

# Check system health
curl http://localhost:8080/api/health</code></pre>
        </div>
    </div>
</body>
</html>
  `);
});

module.exports = router;