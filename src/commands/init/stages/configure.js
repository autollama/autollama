/**
 * Configure Stage - Interactive Configuration Setup
 */

const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const { sectionHeader, logger, colors } = require('../../../utils/brand');
const { validateApiKey, testApiKey } = require('../../../utils/system');
const { validatePort, validateConfig } = require('../../../utils/validation');

async function configureStage(state, options = {}) {
  sectionHeader('Configuration');
  
  // Collect configuration interactively
  const config = await collectConfiguration(state, options);
  
  // Validate complete configuration
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
  }
  
  // Update state with configuration
  await state.updateConfig(config);
  
  // Generate configuration files
  await generateConfigFiles(state, config);
  
  // Complete configure stage
  await state.completeStage('configure', {
    config,
    timestamp: Date.now(),
    validated: true
  });
  
  logger.success('Configuration completed and validated');
}

async function collectConfiguration(state, options) {
  const config = { ...state.config };
  
  // OpenAI API Key
  config.openaiApiKey = await getOpenAIApiKey(state, options);
  
  // Deployment mode
  config.deployment = await getDeploymentMode(state, options);
  
  // Database choice
  config.database = await getDatabaseChoice(state, options);
  
  // Port configuration
  config.port = await getPortConfiguration(state, options);
  
  // Additional features
  config.features = await getFeatureSelection(state, options);
  
  return config;
}

async function getOpenAIApiKey(state, options) {
  // Check if already configured
  if (state.config.openaiApiKey) {
    const { useExisting } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useExisting',
        message: 'Use existing API key?',
        default: true
      }
    ]);
    
    if (useExisting) {
      return state.config.openaiApiKey;
    }
  }
  
  // Interactive API key input
  while (true) {
    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'OpenAI API Key:',
        validate: (input) => {
          const validation = validateApiKey(input);
          return validation.valid || validation.error;
        },
        mask: '*'
      }
    ]);
    
    // Test API key if possible
    const { testKey } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'testKey',
        message: 'Test API key connectivity?',
        default: true
      }
    ]);
    
    if (testKey) {
      logger.step('Testing API key...');
      const testResult = await testApiKey(apiKey);
      
      if (testResult.valid) {
        logger.success('API key validated successfully');
        return apiKey;
      } else {
        logger.error(`API key test failed: ${testResult.error}`);
        
        const { retryKey } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'retryKey',
            message: 'Enter a different API key?',
            default: true
          }
        ]);
        
        if (!retryKey) {
          logger.warning('Continuing without API key validation');
          return apiKey;
        }
        
        continue; // Ask for API key again
      }
    } else {
      return apiKey;
    }
  }
}

async function getDeploymentMode(state, options) {
  const systemCheck = state.systemCheck;
  const availableModes = [];
  
  // Always available
  availableModes.push({
    name: 'Local Development (SQLite + embedded services)',
    value: 'local',
    description: 'Perfect for development and testing'
  });
  
  // Available if Docker is working
  if (systemCheck?.docker?.valid && systemCheck?.docker?.running) {
    availableModes.push({
      name: 'Docker (Full containerized deployment)',
      value: 'docker',
      description: 'Production-ready with PostgreSQL'
    });
    
    availableModes.push({
      name: 'Hybrid (Mix of local and containerized)',
      value: 'hybrid', 
      description: 'Database in Docker, app locally'
    });
  }
  
  const { deployment } = await inquirer.prompt([
    {
      type: 'list',
      name: 'deployment',
      message: 'Choose deployment mode:',
      choices: availableModes,
      default: 'local'
    }
  ]);
  
  return deployment;
}

async function getDatabaseChoice(state, options) {
  const deployment = state.config.deployment;
  
  if (deployment === 'local') {
    // Local mode defaults to SQLite
    return 'sqlite';
  }
  
  const { database } = await inquirer.prompt([
    {
      type: 'list',
      name: 'database',
      message: 'Choose database:',
      choices: [
        {
          name: 'SQLite (Simple, file-based)',
          value: 'sqlite',
          description: 'Great for development and small deployments'
        },
        {
          name: 'PostgreSQL (Production-ready)',
          value: 'postgresql',
          description: 'Recommended for production use'
        }
      ],
      default: deployment === 'docker' ? 'postgresql' : 'sqlite'
    }
  ]);
  
  return database;
}

async function getPortConfiguration(state, options) {
  const { port } = await inquirer.prompt([
    {
      type: 'input',
      name: 'port',
      message: 'Application port:',
      default: '8080',
      validate: (input) => {
        const validation = validatePort(input);
        if (validation.warning) {
          console.log(colors.warning(`  ⚠ ${validation.warning}`));
        }
        return validation.valid || validation.error;
      }
    }
  ]);
  
  return parseInt(port);
}

async function getFeatureSelection(state, options) {
  const { features } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'features',
      message: 'Select additional features:',
      choices: [
        {
          name: 'Real-time processing visualization',
          value: 'realtime',
          checked: true
        },
        {
          name: 'Advanced document analysis',
          value: 'analysis',
          checked: true
        },
        {
          name: 'OpenWebUI integration',
          value: 'openwebui',
          checked: true
        },
        {
          name: 'Contextual embeddings (Anthropic method)',
          value: 'contextual',
          checked: true
        },
        {
          name: 'Multiple vector stores support',
          value: 'multivector',
          checked: false
        }
      ]
    }
  ]);
  
  return features;
}

async function generateConfigFiles(state, config) {
  const projectPath = state.config.projectPath;
  
  // Generate .env file
  await generateEnvFile(projectPath, config);
  
  // Generate docker-compose.yml if needed
  if (config.deployment === 'docker' || config.deployment === 'hybrid') {
    await generateDockerCompose(projectPath, config);
  }
  
  // Generate autollama.config.js
  await generateAppConfig(projectPath, config);
  
  logger.success('Configuration files generated');
}

async function generateEnvFile(projectPath, config) {
  const envPath = path.join(projectPath, '.env');
  
  const envContent = [
    '# AutoLlama Configuration',
    `# Generated on ${new Date().toISOString()}`,
    '',
    '# OpenAI Configuration',
    `OPENAI_API_KEY=${config.openaiApiKey}`,
    '',
    '# Application Configuration',
    `PORT=${config.port}`,
    `DEPLOYMENT_MODE=${config.deployment}`,
    `DATABASE_TYPE=${config.database}`,
    '',
    '# Feature Flags',
    `ENABLE_CONTEXTUAL_EMBEDDINGS=${config.features.includes('contextual')}`,
    `ENABLE_REALTIME_VISUALIZATION=${config.features.includes('realtime')}`,
    `ENABLE_ADVANCED_ANALYSIS=${config.features.includes('analysis')}`,
    `ENABLE_OPENWEBUI=${config.features.includes('openwebui')}`,
    '',
    '# Database Configuration',
    config.database === 'sqlite' ? 
      'DATABASE_URL=sqlite:./data/autollama.db' :
      'DATABASE_URL=postgresql://autollama:password@localhost:5432/autollama',
    '',
    '# Vector Store Configuration',
    'QDRANT_URL=http://localhost:6333',
    'QDRANT_API_KEY=',
    '',
    '# Session Configuration',
    'SESSION_CLEANUP_INTERVAL=300',
    'SESSION_CLEANUP_THRESHOLD=15',
    ''
  ];
  
  await fs.writeFile(envPath, envContent.join('\n'));
  logger.dim(`Generated: ${path.relative(process.cwd(), envPath)}`);
}

async function generateDockerCompose(projectPath, config) {
  // Copy the appropriate docker-compose.yml template
  const templatePath = path.join(__dirname, '../../../../docker-compose.yml');
  const targetPath = path.join(projectPath, 'docker-compose.yml');
  
  if (await fs.pathExists(templatePath)) {
    await fs.copy(templatePath, targetPath);
    logger.dim(`Generated: ${path.relative(process.cwd(), targetPath)}`);
  } else {
    logger.warning('Docker compose template not found - you may need to create it manually');
  }
}

async function generateAppConfig(projectPath, config) {
  const configPath = path.join(projectPath, 'autollama.config.js');
  
  const configContent = `// AutoLlama Configuration
// Generated on ${new Date().toISOString()}

module.exports = {
  projectName: '${state.projectName}',
  deployment: '${config.deployment}',
  database: '${config.database}',
  port: ${config.port},
  
  features: {
    contextual: ${config.features.includes('contextual')},
    realtime: ${config.features.includes('realtime')},
    analysis: ${config.features.includes('analysis')},
    openwebui: ${config.features.includes('openwebui')},
    multivector: ${config.features.includes('multivector')}
  },
  
  // Advanced configuration
  processing: {
    chunkSize: 2000,
    chunkOverlap: 200,
    maxConcurrency: 3
  },
  
  vectorStore: {
    provider: 'qdrant',
    collection: 'autollama-vectors',
    dimensions: 1536
  },
  
  llm: {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    temperature: 0.1
  }
};`;
  
  await fs.writeFile(configPath, configContent);
  logger.dim(`Generated: ${path.relative(process.cwd(), configPath)}`);
}

module.exports = { configureStage };