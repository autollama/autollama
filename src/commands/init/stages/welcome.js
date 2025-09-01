/**
 * Welcome Stage - Project Setup and Validation
 */

const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const { sectionHeader, logger, colors } = require('../../../utils/brand');
const { validateProjectName, validateDirectory } = require('../../../utils/validation');

async function welcomeStage(state, options = {}) {
  sectionHeader('Welcome');
  
  // Get project name
  const projectName = await getProjectName(state, options);
  state.projectName = projectName;
  
  // Set up project directory
  const projectPath = await setupProjectDirectory(state, options);
  
  // Store welcome stage data
  await state.completeStage('welcome', {
    projectName,
    projectPath,
    timestamp: Date.now()
  });
  
  logger.success(`Project "${projectName}" initialized`);
  logger.dim(`Directory: ${projectPath}`);
}

async function getProjectName(state, options) {
  // Use provided name if valid
  if (state.projectName && state.projectName !== 'autollama-project') {
    const validation = validateProjectName(state.projectName);
    if (validation.valid) {
      logger.info(`Using project name: ${colors.bold(state.projectName)}`);
      return state.projectName;
    } else {
      logger.warning(`Invalid project name: ${validation.error}`);
    }
  }
  
  // Interactive prompt for project name
  while (true) {
    const { projectName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        default: 'my-autollama-project',
        validate: (input) => {
          const validation = validateProjectName(input);
          return validation.valid || validation.error;
        }
      }
    ]);
    
    // Check if directory already exists
    const projectPath = path.resolve(projectName);
    const dirValidation = await validateDirectory(projectPath);
    
    if (dirValidation.valid && dirValidation.exists && !dirValidation.isEmpty) {
      logger.warning(`Directory "${projectName}" already exists and is not empty`);
      
      const { continueWithExisting } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continueWithExisting',
          message: 'Continue with existing directory?',
          default: false
        }
      ]);
      
      if (!continueWithExisting) {
        continue; // Ask for project name again
      }
    }
    
    return projectName;
  }
}

async function setupProjectDirectory(state, options) {
  const projectPath = path.resolve(state.projectName);
  
  try {
    // Create project directory if it doesn't exist
    await fs.ensureDir(projectPath);
    
    // Change to project directory
    process.chdir(projectPath);
    
    // Store project path in state
    await state.updateConfig({ 
      projectPath,
      workingDir: projectPath 
    });
    
    return projectPath;
    
  } catch (error) {
    throw new Error(`Failed to create project directory: ${error.message}`);
  }
}

// Check if we're in an existing AutoLlama project
async function checkExistingProject(projectPath) {
  const indicators = [
    'package.json',
    'docker-compose.yml',
    '.env',
    'api/',
    'config/'
  ];
  
  const existing = [];
  
  for (const indicator of indicators) {
    const fullPath = path.join(projectPath, indicator);
    if (await fs.pathExists(fullPath)) {
      existing.push(indicator);
    }
  }
  
  return {
    isExisting: existing.length > 2, // If more than 2 indicators exist
    files: existing
  };
}

// Display welcome message
function displayWelcome() {
  console.log(colors.muted('Creating your intelligent RAG framework...'));
  console.log();
  console.log(colors.primary('AutoLlama features:'));
  console.log(colors.muted('  • Context-aware document processing'));
  console.log(colors.muted('  • Multiple deployment modes'));
  console.log(colors.muted('  • Built-in vector search'));
  console.log(colors.muted('  • Real-time processing visualization'));
  console.log();
}

module.exports = { welcomeStage };