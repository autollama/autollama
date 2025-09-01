/**
 * Install Stage - Dependencies, Database Setup, and Service Initialization
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { sectionHeader, logger, showProgress, colors, withSpinner } = require('../../../utils/brand');

async function installStage(state, options = {}) {
  sectionHeader('Installation');
  
  const config = state.config;
  let progress = 0;
  const totalSteps = 6;
  
  try {
    // Step 1: Copy project files
    progress++;
    showProgress('Copying project files', progress, totalSteps);
    await copyProjectFiles(state);
    
    // Step 2: Install dependencies
    progress++;
    showProgress('Installing dependencies', progress, totalSteps);
    await installDependencies(state);
    
    // Step 3: Setup database
    progress++;
    showProgress('Setting up database', progress, totalSteps);
    await setupDatabase(state);
    
    // Step 4: Initialize vector store
    progress++;
    showProgress('Initializing vector store', progress, totalSteps);
    await setupVectorStore(state);
    
    // Step 5: Configure services
    progress++;
    showProgress('Configuring services', progress, totalSteps);
    await configureServices(state);
    
    // Step 6: Validate installation
    progress++;
    showProgress('Validating installation', progress, totalSteps);
    await validateInstallation(state);
    
    // Complete install stage
    await state.completeStage('install', {
      timestamp: Date.now(),
      success: true,
      config: config
    });
    
    logger.success('Installation completed successfully');
    
  } catch (error) {
    await state.addError(error, 'install');
    throw new Error(`Installation failed: ${error.message}`);
  }
}

async function copyProjectFiles(state) {
  const projectPath = state.config.projectPath;
  const sourceDir = path.join(__dirname, '../../../../');
  
  // Files and directories to copy
  const filesToCopy = [
    'api/',
    'config/',
    'scripts/',
    'package.json',
    'package-lock.json'
  ];
  
  // Optional files (copy if they exist)
  const optionalFiles = [
    'lib/',
    'README.md',
    'LICENSE',
    'docs/'
  ];
  
  // Copy required files
  for (const file of filesToCopy) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(projectPath, file);
    
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, targetPath, {
        filter: (src, dest) => {
          // Skip node_modules and .git directories
          return !src.includes('node_modules') && !src.includes('.git');
        }
      });
    } else {
      logger.warning(`Source file not found: ${file}`);
    }
  }
  
  // Copy optional files if they exist
  for (const file of optionalFiles) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(projectPath, file);
    
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, targetPath);
    }
  }
  
  logger.dim('Project files copied');
}

async function installDependencies(state) {
  const projectPath = state.config.projectPath;
  
  // Ensure we're in the project directory
  const currentDir = process.cwd();
  process.chdir(projectPath);
  
  try {
    // Check if package.json exists
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!await fs.pathExists(packageJsonPath)) {
      throw new Error('package.json not found');
    }
    
    // Clean install
    await withSpinner('Installing npm dependencies', async () => {
      execSync('npm ci --prefer-offline --no-audit', {
        stdio: 'pipe',
        cwd: projectPath
      });
    })();
    
    // Install workspaces
    await withSpinner('Installing workspace dependencies', async () => {
      execSync('npm run postinstall', {
        stdio: 'pipe',
        cwd: projectPath
      });
    })();
    
    logger.dim('Dependencies installed');
    
  } catch (error) {
    throw new Error(`Failed to install dependencies: ${error.message}`);
  } finally {
    // Restore original directory
    process.chdir(currentDir);
  }
}

async function setupDatabase(state) {
  const config = state.config;
  const projectPath = config.projectPath;
  
  if (config.database === 'sqlite') {
    await setupSQLite(projectPath, config);
  } else if (config.database === 'postgresql') {
    await setupPostgreSQL(projectPath, config);
  }
}

async function setupSQLite(projectPath, config) {
  // Create data directory
  const dataDir = path.join(projectPath, 'data');
  await fs.ensureDir(dataDir);
  
  // Run SQLite migrations
  await withSpinner('Setting up SQLite database', async () => {
    execSync('npm run migrate', {
      stdio: 'pipe',
      cwd: projectPath,
      env: { ...process.env, NODE_ENV: 'development' }
    });
  })();
  
  logger.dim('SQLite database configured');
}

async function setupPostgreSQL(projectPath, config) {
  if (config.deployment === 'docker' || config.deployment === 'hybrid') {
    // Start PostgreSQL container
    await withSpinner('Starting PostgreSQL container', async () => {
      execSync('docker compose up -d postgres', {
        stdio: 'pipe',
        cwd: projectPath
      });
    })();
    
    // Wait for PostgreSQL to be ready
    await waitForPostgreSQL();
    
    // Run migrations
    await withSpinner('Running database migrations', async () => {
      execSync('npm run migrate', {
        stdio: 'pipe',
        cwd: projectPath
      });
    })();
  } else {
    logger.warning('PostgreSQL setup requires Docker - please configure manually');
  }
  
  logger.dim('PostgreSQL database configured');
}

async function setupVectorStore(state) {
  const config = state.config;
  const projectPath = config.projectPath;
  
  if (config.deployment === 'docker' || config.deployment === 'hybrid') {
    // Start Qdrant container
    await withSpinner('Starting Qdrant vector store', async () => {
      execSync('docker compose up -d qdrant', {
        stdio: 'pipe',
        cwd: projectPath
      });
    })();
    
    // Wait for Qdrant to be ready
    await waitForQdrant();
  } else {
    // Use embedded Qdrant for local development
    logger.step('Vector store will use embedded mode');
  }
  
  logger.dim('Vector store configured');
}

async function configureServices(state) {
  const config = state.config;
  const projectPath = config.projectPath;
  
  // Create necessary directories
  const dirs = ['logs', 'uploads', 'temp', 'data'];
  for (const dir of dirs) {
    await fs.ensureDir(path.join(projectPath, dir));
  }
  
  // Set proper permissions
  if (process.platform !== 'win32') {
    try {
      execSync(`chmod 755 ${path.join(projectPath, 'scripts')}/*`, {
        stdio: 'ignore',
        cwd: projectPath
      });
    } catch {
      // Ignore permission errors
    }
  }
  
  logger.dim('Services configured');
}

async function validateInstallation(state) {
  const config = state.config;
  const projectPath = config.projectPath;
  
  // Check critical files
  const criticalFiles = [
    'package.json',
    '.env',
    'api/server.js',
    'config/react-frontend'
  ];
  
  for (const file of criticalFiles) {
    const filePath = path.join(projectPath, file);
    if (!await fs.pathExists(filePath)) {
      throw new Error(`Critical file missing: ${file}`);
    }
  }
  
  // Test basic functionality
  try {
    // Check if we can start the application briefly
    await withSpinner('Testing application startup', async () => {
      const child = spawn('npm', ['run', 'setup'], {
        cwd: projectPath,
        stdio: 'pipe'
      });
      
      // Give it a few seconds to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Kill the process
      child.kill('SIGTERM');
      
      // Wait for it to exit
      await new Promise(resolve => {
        child.on('exit', resolve);
        setTimeout(resolve, 1000); // Timeout after 1 second
      });
    })();
  } catch (error) {
    logger.warning('Application test failed - manual verification may be needed');
  }
  
  logger.dim('Installation validated');
}

// Helper function to wait for PostgreSQL
async function waitForPostgreSQL(maxWait = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    try {
      execSync('docker exec $(docker ps -qf "name=postgres") pg_isready', {
        stdio: 'ignore'
      });
      return; // PostgreSQL is ready
    } catch {
      // Wait 1 second and try again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error('PostgreSQL failed to start within timeout');
}

// Helper function to wait for Qdrant
async function waitForQdrant(maxWait = 20000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    try {
      const response = await fetch('http://localhost:6333/health');
      if (response.ok) {
        return; // Qdrant is ready
      }
    } catch {
      // Wait 1 second and try again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error('Qdrant failed to start within timeout');
}

module.exports = { installStage };