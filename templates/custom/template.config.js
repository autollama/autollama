/**
 * Custom AutoLlama Template
 * 🦙 Flexible template for specific use cases and integrations
 */

module.exports = {
  name: 'Custom RAG Solution',
  description: '🎨 Customizable template for specific requirements',
  deploymentMode: 'configurable',
  features: [
    'Configurable database (SQLite/PostgreSQL)',
    'Multiple AI provider support',
    'Custom processing pipelines',
    'Extensible plugin system',
    'API-first architecture',
    'Custom UI components',
    'Integration-ready'
  ],
  
  configuration: {
    // Will be configured during installation wizard
    database: {
      type: 'configurable' // User chooses during setup
    },
    vector: {
      type: 'configurable' // User chooses during setup
    },
    ai: {
      provider: 'configurable', // OpenAI, Anthropic, or local
      models: 'configurable'
    },
    processing: {
      pipeline: 'configurable',
      plugins: []
    },
    integrations: {
      enabled: [],
      custom: []
    }
  },
  
  wizardQuestions: [
    {
      type: 'list',
      name: 'primaryUseCase',
      message: '🎯 What\'s your primary use case?',
      choices: [
        { name: '📚 Document Knowledge Base', value: 'knowledge_base' },
        { name: '🤖 Customer Support Bot', value: 'support_bot' },
        { name: '🔍 Research Assistant', value: 'research' },
        { name: '📊 Data Analysis Tool', value: 'analytics' },
        { name: '🔧 Custom Integration', value: 'custom' }
      ]
    },
    {
      type: 'checkbox',
      name: 'documentTypes',
      message: '📄 What document types will you process?',
      choices: [
        { name: 'PDF documents', value: 'pdf' },
        { name: 'Web pages', value: 'html' },
        { name: 'Word documents', value: 'docx' },
        { name: 'Text files', value: 'txt' },
        { name: 'CSV/Excel', value: 'csv' },
        { name: 'EPUB books', value: 'epub' },
        { name: 'Images (OCR)', value: 'images' }
      ]
    },
    {
      type: 'list',
      name: 'scale',
      message: '📈 Expected scale?',
      choices: [
        { name: '🏠 Personal (< 1GB documents)', value: 'personal' },
        { name: '🏢 Small Team (< 10GB documents)', value: 'team' },
        { name: '🏭 Enterprise (> 10GB documents)', value: 'enterprise' }
      ]
    },
    {
      type: 'checkbox',
      name: 'integrations',
      message: '🔌 What integrations do you need?',
      choices: [
        { name: 'OpenWebUI Chat Interface', value: 'openwebui' },
        { name: 'Slack Bot', value: 'slack' },
        { name: 'Discord Bot', value: 'discord' },
        { name: 'REST API Only', value: 'api_only' },
        { name: 'Webhook Notifications', value: 'webhooks' },
        { name: 'Analytics Dashboard', value: 'analytics' }
      ]
    }
  ],
  
  // Generate configuration based on wizard answers
  generateConfig: (answers) => {
    const config = {
      deployment: answers.scale === 'personal' ? 'local' : 'hybrid',
      personality: 'friendly',
      useCase: answers.primaryUseCase
    };
    
    // Database selection based on scale
    if (answers.scale === 'personal') {
      config.database = {
        type: 'sqlite',
        path: './data/autollama.db'
      };
    } else {
      config.database = {
        type: 'postgresql',
        url: 'postgresql://autollama:autollama@localhost:5432/autollama'
      };
    }
    
    // Features based on use case
    config.features = {
      contextualEmbeddings: answers.scale !== 'personal',
      advancedAnalytics: answers.integrations.includes('analytics'),
      openWebUIIntegration: answers.integrations.includes('openwebui'),
      webhooks: answers.integrations.includes('webhooks'),
      multiModal: answers.documentTypes.includes('images'),
      backgroundProcessing: answers.scale === 'enterprise'
    };
    
    // Processing configuration
    config.processing = {
      chunkingMethod: answers.scale === 'enterprise' ? 'intelligent' : 'simple',
      batchSize: answers.scale === 'personal' ? 3 : 
                 answers.scale === 'team' ? 5 : 10,
      supportedTypes: answers.documentTypes
    };
    
    return config;
  },
  
  // Custom files based on configuration
  generateFiles: (config, answers) => {
    const files = {};
    
    // Environment file
    files['.env.template'] = `# Custom AutoLlama Configuration
# Generated for: ${answers.primaryUseCase}

DEPLOYMENT_MODE=${config.deployment}
${config.database.type === 'sqlite' ? 
  `DATABASE_TYPE=sqlite\nDATABASE_PATH=${config.database.path}` :
  `DATABASE_URL=${config.database.url}`}

OPENAI_API_KEY=your_openai_api_key_here
AI_PROVIDER=openai

${config.features.contextualEmbeddings ? 'ENABLE_CONTEXTUAL_EMBEDDINGS=true' : 'ENABLE_CONTEXTUAL_EMBEDDINGS=false'}
CONTEXT_GENERATION_BATCH_SIZE=${config.processing.batchSize}

${config.features.openWebUIIntegration ? '# OpenWebUI Integration\nENABLE_OPENWEBUI_PIPELINE=true' : ''}
${config.features.webhooks ? '# Webhook Configuration\nWEBHOOK_URL=your_webhook_url_here' : ''}
${config.features.multiModal ? '# Multi-Modal Support\nENABLE_OCR=true\nENABLE_IMAGE_PROCESSING=true' : ''}

LLAMA_PERSONALITY=friendly
`;
    
    // Custom README based on use case
    const useCaseReadmes = {
      knowledge_base: `# {{projectName}} - Knowledge Base

🦙 AI-powered knowledge base built with AutoLlama

## Overview
Transform your documents into an intelligent, searchable knowledge base that understands context and relationships.

## Key Features
- 📚 Document ingestion and processing
- 🔍 Intelligent semantic search  
- 💬 Natural language querying
- 📊 Knowledge analytics
- 🔗 Cross-document relationships

## Quick Start
1. Upload your documents via the web interface
2. Wait for processing to complete
3. Start asking questions about your content
4. Explore relationships and insights

Perfect for: Documentation, research papers, manuals, wikis
`,
      
      support_bot: `# {{projectName}} - Support Bot

🦙 AI customer support bot powered by AutoLlama

## Overview
Create an intelligent support bot that can answer questions based on your documentation, FAQs, and knowledge base.

## Key Features
- 🤖 Automated customer support
- 📋 FAQ integration
- 🎯 Context-aware responses
- 📞 Multi-channel support
- 📈 Performance analytics

## Integration Options
- Slack bot integration
- Discord bot integration  
- Web chat widget
- API for custom integrations

Perfect for: Customer support, internal help desk, community Q&A
`,
      
      research: `# {{projectName}} - Research Assistant

🦙 AI research assistant built with AutoLlama

## Overview
Accelerate your research with an AI assistant that can understand, summarize, and connect information across multiple documents and sources.

## Key Features  
- 📖 Literature review assistance
- 🔍 Cross-reference finding
- 📝 Automatic summarization
- 🎯 Research question answering
- 📊 Citation tracking

## Workflow
1. Upload research papers, articles, and documents
2. Ask research questions in natural language
3. Get contextual answers with source citations
4. Explore related concepts and connections

Perfect for: Academic research, market research, competitive analysis
`
    };
    
    files['README.md'] = useCaseReadmes[answers.primaryUseCase] || useCaseReadmes.knowledge_base;
    
    // Package.json scripts based on scale
    const scripts = {
      'dev': `autollama dev --mode ${config.deployment}`,
      'start': 'autollama dev',
      'migrate': 'autollama migrate --up',
      'test': 'autollama test'
    };
    
    if (answers.scale === 'enterprise') {
      scripts['deploy'] = 'autollama deploy --target docker --build';
      scripts['status'] = 'autollama status --watch';
      scripts['logs'] = 'autollama logs --follow';
    }
    
    files['package.scripts.json'] = JSON.stringify(scripts, null, 2);
    
    return files;
  }
};