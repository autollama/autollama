#!/usr/bin/env node

/**
 * AutoLlama Build Script
 * 🦙 Build and prepare for production deployment
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');

class AutoLlamaBuild {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.buildDir = path.join(this.projectRoot, 'dist');
    this.startTime = Date.now();
  }

  async build() {
    console.log(chalk.cyan.bold('\n🦙 AutoLlama Production Build'));
    console.log(chalk.gray('Building optimized version...\n'));

    try {
      // 1. Clean build directory
      await this.cleanBuildDir();
      
      // 2. Build frontend
      await this.buildFrontend();
      
      // 3. Prepare API
      await this.prepareAPI();
      
      // 4. Copy configurations
      await this.copyConfigurations();
      
      // 5. Generate production files
      await this.generateProductionFiles();
      
      // 6. Create deployment package
      await this.createDeploymentPackage();
      
      // 7. Run tests
      await this.runTests();
      
      // Success!
      this.showSuccess();
      
    } catch (error) {
      console.error(chalk.red.bold('\n❌ Build failed:'), error.message);
      process.exit(1);
    }
  }

  async cleanBuildDir() {
    const spinner = ora('Cleaning build directory...').start();
    
    await fs.remove(this.buildDir);
    await fs.ensureDir(this.buildDir);
    
    spinner.succeed('Build directory prepared');
  }

  async buildFrontend() {
    const spinner = ora('Building React frontend...').start();
    
    const frontendDir = path.join(this.projectRoot, 'config', 'react-frontend');
    
    try {
      // Install dependencies if needed
      const nodeModules = path.join(frontendDir, 'node_modules');
      if (!await fs.pathExists(nodeModules)) {
        spinner.text = 'Installing frontend dependencies...';
        execSync('npm install', { cwd: frontendDir, stdio: 'pipe' });
      }
      
      // Build production bundle
      spinner.text = 'Creating optimized production build...';
      execSync('npm run build', { cwd: frontendDir, stdio: 'pipe' });
      
      // Copy build output
      const buildOutput = path.join(frontendDir, 'dist');
      const targetDir = path.join(this.buildDir, 'frontend');
      await fs.copy(buildOutput, targetDir);
      
      // Get build size
      const stats = await this.getDirectorySize(targetDir);
      spinner.succeed(`Frontend built (${stats})`);
      
    } catch (error) {
      spinner.fail('Frontend build failed');
      throw error;
    }
  }

  async prepareAPI() {
    const spinner = ora('Preparing API server...').start();
    
    const apiDir = path.join(this.projectRoot, 'api');
    const targetDir = path.join(this.buildDir, 'api');
    
    // Copy API files
    await fs.copy(apiDir, targetDir, {
      filter: (src) => {
        // Exclude development files
        return !src.includes('node_modules') &&
               !src.includes('.test.') &&
               !src.includes('tests/');
      }
    });
    
    // Create optimized package.json
    const packageJson = await fs.readJson(path.join(apiDir, 'package.json'));
    
    // Remove dev dependencies for production
    delete packageJson.devDependencies;
    packageJson.scripts = {
      start: 'node server.js',
      migrate: 'node run-migrations.js'
    };
    
    await fs.writeJson(
      path.join(targetDir, 'package.json'),
      packageJson,
      { spaces: 2 }
    );
    
    spinner.succeed('API server prepared');
  }

  async copyConfigurations() {
    const spinner = ora('Copying configurations...').start();
    
    // Files to copy to dist
    const files = [
      'docker-compose.yaml',
      'docker-compose.prod.yaml',
      '.dockerignore',
      'README.md',
      'LICENSE',
      'CHANGELOG.md'
    ];
    
    for (const file of files) {
      const src = path.join(this.projectRoot, file);
      if (await fs.pathExists(src)) {
        await fs.copy(src, path.join(this.buildDir, file));
      }
    }
    
    // Create production .env template
    const envTemplate = `# AutoLlama Production Configuration
# Copy to .env and update values

# REQUIRED: AI Provider
OPENAI_API_KEY=your_api_key_here
AI_PROVIDER=openai

# Database
DATABASE_URL=postgresql://autollama:autollama@postgres:5432/autollama

# Vector Database
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=your_qdrant_key_here

# Application
NODE_ENV=production
PORT=3001

# Security
SESSION_SECRET=generate_random_secret_here
CORS_ORIGIN=https://your-domain.com

# RAG Configuration
ENABLE_CONTEXTUAL_EMBEDDINGS=true
CONTEXT_GENERATION_BATCH_SIZE=10
`;
    
    await fs.writeFile(path.join(this.buildDir, '.env.example'), envTemplate);
    
    spinner.succeed('Configurations copied');
  }

  async generateProductionFiles() {
    const spinner = ora('Generating production files...').start();
    
    // Create production package.json
    const packageJson = {
      name: 'autollama',
      version: '3.0.0',
      description: 'Production deployment of AutoLlama',
      scripts: {
        start: 'node api/server.js',
        'start:docker': 'docker compose up -d',
        'stop:docker': 'docker compose down',
        migrate: 'node api/run-migrations.js',
        health: 'curl -f http://localhost:3001/health'
      },
      engines: {
        node: '>=16.0.0'
      }
    };
    
    await fs.writeJson(
      path.join(this.buildDir, 'package.json'),
      packageJson,
      { spaces: 2 }
    );
    
    // Create start script
    const startScript = `#!/bin/bash
# AutoLlama Production Startup Script

echo "🦙 Starting AutoLlama in production mode..."

# Check for .env file
if [ ! -f .env ]; then
  echo "❌ Error: .env file not found"
  echo "Copy .env.example to .env and configure it"
  exit 1
fi

# Run migrations
echo "Running database migrations..."
npm run migrate

# Start services
if command -v docker &> /dev/null; then
  echo "Starting with Docker..."
  docker compose up -d
else
  echo "Starting Node.js server..."
  npm start
fi

echo "✅ AutoLlama is running!"
echo "   • API: http://localhost:3001"
echo "   • App: http://localhost:8080"
`;
    
    await fs.writeFile(path.join(this.buildDir, 'start.sh'), startScript);
    await fs.chmod(path.join(this.buildDir, 'start.sh'), '755');
    
    spinner.succeed('Production files generated');
  }

  async createDeploymentPackage() {
    const spinner = ora('Creating deployment package...').start();
    
    // Create deployment instructions
    const deploymentGuide = `# AutoLlama Deployment Guide

## Quick Start

1. Copy this entire dist/ directory to your server
2. Copy .env.example to .env and configure it
3. Run ./start.sh or docker compose up -d

## Deployment Options

### Option 1: Docker (Recommended)
\`\`\`bash
docker compose up -d
\`\`\`

### Option 2: Node.js + External Services
\`\`\`bash
npm install --production
npm run migrate
npm start
\`\`\`

### Option 3: Kubernetes
See kubernetes/ directory for Helm charts

## Environment Variables

Required:
- OPENAI_API_KEY or ANTHROPIC_API_KEY
- DATABASE_URL
- QDRANT_URL

## Health Check
\`\`\`bash
curl http://localhost:3001/health
\`\`\`

## Support
https://github.com/autollama/autollama
`;
    
    await fs.writeFile(path.join(this.buildDir, 'DEPLOYMENT.md'), deploymentGuide);
    
    // Calculate build size
    const totalSize = await this.getDirectorySize(this.buildDir);
    
    spinner.succeed(`Deployment package created (${totalSize})`);
  }

  async runTests() {
    const spinner = ora('Running production tests...').start();
    
    try {
      // Run critical tests only
      spinner.text = 'Running smoke tests...';
      
      // Check that all required files exist
      const requiredFiles = [
        'api/server.js',
        'api/package.json',
        'frontend/index.html',
        'package.json',
        '.env.example'
      ];
      
      for (const file of requiredFiles) {
        const filePath = path.join(this.buildDir, file);
        if (!await fs.pathExists(filePath)) {
          throw new Error(`Missing required file: ${file}`);
        }
      }
      
      spinner.succeed('All tests passed');
      
    } catch (error) {
      spinner.fail('Tests failed');
      throw error;
    }
  }

  showSuccess() {
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    
    console.log(chalk.green.bold('\n✅ Build successful!'));
    console.log(chalk.gray(`Completed in ${duration} seconds`));
    
    console.log(chalk.cyan('\n📦 Build Output:'));
    console.log(chalk.white(`  Location: ${this.buildDir}`));
    
    console.log(chalk.cyan('\n🚀 Deployment:'));
    console.log(chalk.white('  1. Copy dist/ to your server'));
    console.log(chalk.white('  2. Configure .env file'));
    console.log(chalk.white('  3. Run ./start.sh'));
    
    console.log(chalk.cyan('\n📊 Build Summary:'));
    this.showBuildSummary();
    
    console.log(chalk.green.bold('\n🦙 Your production build is ready!'));
  }

  async showBuildSummary() {
    const dirs = ['api', 'frontend'];
    
    for (const dir of dirs) {
      const dirPath = path.join(this.buildDir, dir);
      if (await fs.pathExists(dirPath)) {
        const size = await this.getDirectorySize(dirPath);
        console.log(chalk.gray(`  • ${dir}: ${size}`));
      }
    }
  }

  async getDirectorySize(dirPath) {
    try {
      const output = execSync(`du -sh "${dirPath}" 2>/dev/null || echo "0"`, {
        encoding: 'utf8'
      });
      const size = output.split('\t')[0].trim();
      return size || 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

// Run build
if (require.main === module) {
  const build = new AutoLlamaBuild();
  build.build();
}

module.exports = AutoLlamaBuild;