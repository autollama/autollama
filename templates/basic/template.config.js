/**
 * Basic AutoLlama Template
 * 🦙 Simple RAG setup for quick prototyping
 */

module.exports = {
  name: 'Basic RAG App',
  description: '🏠 Perfect for learning and small projects',
  deploymentMode: 'local',
  features: [
    'SQLite database (no setup required)',
    'Embedded vector search',
    'Basic document processing',
    'Simple web interface',
    'OpenAI integration'
  ],
  
  configuration: {
    database: {
      type: 'sqlite',
      path: './data/autollama.db'
    },
    vector: {
      type: 'embedded',
      provider: 'qdrant-embedded'
    },
    ai: {
      provider: 'openai',
      model: 'gpt-4o-mini'
    },
    processing: {
      chunking: 'simple',
      contextualEmbeddings: false, // Faster startup
      batchSize: 3
    },
    ui: {
      theme: 'friendly',
      features: ['upload', 'search', 'chat']
    }
  },
  
  dependencies: {
    runtime: [
      'sqlite3',
      'express',
      'react'
    ],
    optional: []
  },
  
  scripts: {
    'dev': 'autollama dev --mode local',
    'start': 'autollama dev',
    'migrate': 'autollama migrate --up',
    'test': 'autollama test --unit'
  },
  
  files: {
    '.env.template': `# Basic AutoLlama Configuration
DEPLOYMENT_MODE=local
DATABASE_TYPE=sqlite
DATABASE_PATH=./data/autollama.db
OPENAI_API_KEY=your_api_key_here
LLAMA_PERSONALITY=friendly
ENABLE_CONTEXTUAL_EMBEDDINGS=false
`,
    
    'README.md': `# {{projectName}}

🦙 A basic AutoLlama RAG application

## Quick Start

1. Add your OpenAI API key to \`.env\`:
   \`\`\`
   OPENAI_API_KEY=your_key_here
   \`\`\`

2. Start development server:
   \`\`\`bash
   npm run dev
   \`\`\`

3. Open http://localhost:8080

## Features

- 📄 Document upload and processing
- 🔍 Semantic search
- 💬 AI-powered chat
- 📊 Simple analytics

## Next Steps

- Upload some documents to get started
- Try asking questions about your content
- Explore the search functionality
- Check out the API docs at /api/docs

Happy building! 🚀
`,
    
    'autollama.config.js': JSON.stringify({
      deployment: 'local',
      personality: 'friendly',
      database: {
        type: 'sqlite',
        path: './data/autollama.db'
      },
      features: {
        contextualEmbeddings: false,
        advancedAnalytics: false,
        multiModal: false
      }
    }, null, 2)
  }
};