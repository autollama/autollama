/**
 * AutoLlama Init Command - 4-Stage Setup Wizard
 * Professional, intelligent setup experience
 */

const path = require('path');
const { SetupState } = require('./state');
const { header, logger, celebration, errorBlock } = require('../../utils/brand');

// Import stage handlers
const { welcomeStage } = require('./stages/welcome');
const { preflightStage } = require('./stages/preflight');
const { configureStage } = require('./stages/configure');
const { installStage } = require('./stages/install');

class SetupWizard {
  constructor(state, options = {}) {
    this.state = state;
    this.options = options;
    this.interrupted = false;
    
    // Stage handlers mapping
    this.stageHandlers = {
      welcome: welcomeStage,
      preflight: preflightStage,
      configure: configureStage,
      install: installStage
    };
  }

  async run() {
    try {
      // Setup interrupt handling
      this.setupInterruptHandling();
      
      // Check if resuming previous setup
      if (this.state.canResume()) {
        await this.handleResume();
      }
      
      // Execute stages in order
      await this.executeStages();
      
      // Success celebration
      await this.handleSuccess();
      
    } catch (error) {
      await this.handleError(error);
    }
  }

  setupInterruptHandling() {
    process.on('SIGINT', async () => {
      if (this.interrupted) return; // Already handling
      this.interrupted = true;
      
      console.log('\n');
      logger.info('Setup interrupted. Saving progress...');
      
      try {
        await this.state.save();
        console.log('\n💾 Progress saved successfully');
        console.log('🔄 Run the command again to resume setup');
        console.log(`📁 State file: .autollama-setup-${this.state.projectName}.json\n`);
      } catch (error) {
        logger.error('Failed to save progress');
      }
      
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      this.interrupted = true;
      await this.state.save();
      process.exit(0);
    });
  }

  async handleResume() {
    const progress = this.state.getProgress();
    const summary = this.state.getSummary();
    
    logger.info(`Found previous setup (${summary.elapsed} elapsed, ${progress.percentage}% complete)`);
    
    // Show what was already completed
    const completedStages = Object.entries(this.state.stages)
      .filter(([, stage]) => stage.completed)
      .map(([name]) => name);
    
    if (completedStages.length > 0) {
      logger.success(`Already completed: ${completedStages.join(', ')}`);
    }
    
    logger.step(`Resuming from: ${this.state.currentStage}`);
  }

  async executeStages() {
    const stageOrder = ['welcome', 'preflight', 'configure', 'install'];
    
    for (const stageName of stageOrder) {
      if (this.interrupted) break;
      
      // Skip if already completed
      if (this.state.stages[stageName].completed) {
        continue;
      }
      
      // Update current stage
      this.state.currentStage = stageName;
      await this.state.save();
      
      // Execute stage
      const handler = this.stageHandlers[stageName];
      if (!handler) {
        throw new Error(`No handler found for stage: ${stageName}`);
      }
      
      try {
        await handler(this.state, this.options);
        // Stage handler should call state.completeStage() when done
      } catch (error) {
        await this.state.addError(error, stageName);
        throw error;
      }
    }
  }

  async handleSuccess() {
    const elapsed = this.state.getElapsedTimeString();
    const projectPath = path.resolve(this.state.config.projectPath || this.state.projectName);
    
    // Clean up state file
    await this.state.cleanup();
    
    // Show success message
    celebration(
      'AutoLlama Setup Complete! 🎉',
      `Project "${this.state.projectName}" ready in ${elapsed}`
    );
    
    // Show next steps
    const { nextSteps } = require('../../utils/brand');
    nextSteps([
      `cd ${path.relative(process.cwd(), projectPath)}`,
      'autollama start',
      'Open http://localhost:8080',
      'Add your documents and start chatting!'
    ]);
  }

  async handleError(error) {
    await this.state.addError(error);
    
    const suggestions = [
      'Check the error details above',
      'Run "autollama doctor" to diagnose issues',
      'Visit https://github.com/autollama/autollama/issues for help',
      'Resume setup later with the same command'
    ];
    
    if (error.code === 'ENOENT') {
      suggestions.unshift('Install missing system dependencies');
    }
    
    if (error.message.includes('permission')) {
      suggestions.unshift('Check file and directory permissions');
    }
    
    if (error.message.includes('network')) {
      suggestions.unshift('Check internet connection and proxy settings');
    }
    
    errorBlock(
      'Setup Failed',
      error.message,
      suggestions
    );
    
    logger.error(`Setup failed after ${this.state.getElapsedTimeString()}`);
    process.exit(1);
  }
}

// Main entry point
async function runInit(projectName, options = {}) {
  // Display professional header
  const packageJson = require('../../../package.json');
  header(packageJson.version);
  
  try {
    // Load or create setup state
    const state = await SetupState.load(projectName || 'autollama-project');
    
    // Create and run wizard
    const wizard = new SetupWizard(state, options);
    await wizard.run();
    
  } catch (error) {
    errorBlock(
      'Initialization Failed',
      error.message,
      [
        'Check system requirements',
        'Ensure you have proper permissions',
        'Try running with --verbose for more details'
      ]
    );
    process.exit(1);
  }
}

module.exports = { runInit, SetupWizard };