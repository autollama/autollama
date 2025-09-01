/**
 * AutoLlama Setup State Management
 * Handles saving and loading setup progress for resume capability
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('../../utils/brand');

class SetupState {
  constructor(projectName, options = {}) {
    this.projectName = projectName || 'autollama-project';
    this.setupId = crypto.randomUUID();
    this.startTime = Date.now();
    this.options = options;
    
    // Setup stages and progress
    this.stages = {
      welcome: { completed: false, data: {} },
      preflight: { completed: false, data: {} },
      configure: { completed: false, data: {} },
      install: { completed: false, data: {} }
    };
    
    this.currentStage = 'welcome';
    this.config = {};
    this.systemCheck = null;
    this.errors = [];
    this.warnings = [];
  }

  // Load existing state from file
  static async load(projectName, workingDir = process.cwd()) {
    const stateFile = path.join(workingDir, `.autollama-setup-${projectName}.json`);
    
    try {
      if (await fs.pathExists(stateFile)) {
        const data = await fs.readJson(stateFile);
        const state = new SetupState(projectName);
        
        // Restore state data
        Object.assign(state, data);
        
        logger.info(`Resuming setup for "${projectName}" (${state.setupId.slice(0, 8)}...)`);
        return state;
      }
    } catch (error) {
      logger.warning(`Could not load previous state: ${error.message}`);
    }
    
    return new SetupState(projectName);
  }

  // Save current state to file
  async save(workingDir = process.cwd()) {
    const stateFile = path.join(workingDir, `.autollama-setup-${this.projectName}.json`);
    
    try {
      const stateData = {
        setupId: this.setupId,
        projectName: this.projectName,
        startTime: this.startTime,
        lastSaved: Date.now(),
        currentStage: this.currentStage,
        stages: this.stages,
        config: this.config,
        systemCheck: this.systemCheck,
        errors: this.errors,
        warnings: this.warnings,
        options: this.options
      };
      
      await fs.writeJson(stateFile, stateData, { spaces: 2 });
      return stateFile;
    } catch (error) {
      logger.warning(`Could not save state: ${error.message}`);
      return null;
    }
  }

  // Remove state file after successful completion
  async cleanup(workingDir = process.cwd()) {
    const stateFile = path.join(workingDir, `.autollama-setup-${this.projectName}.json`);
    
    try {
      if (await fs.pathExists(stateFile)) {
        await fs.remove(stateFile);
      }
    } catch (error) {
      // Silently ignore cleanup errors
    }
  }

  // Mark a stage as completed
  async completeStage(stageName, data = {}) {
    if (!this.stages[stageName]) {
      throw new Error(`Invalid stage: ${stageName}`);
    }
    
    this.stages[stageName] = {
      completed: true,
      completedAt: Date.now(),
      data: { ...this.stages[stageName].data, ...data }
    };
    
    // Move to next stage
    const stageOrder = ['welcome', 'preflight', 'configure', 'install'];
    const currentIndex = stageOrder.indexOf(stageName);
    if (currentIndex < stageOrder.length - 1) {
      this.currentStage = stageOrder[currentIndex + 1];
    }
    
    await this.save();
  }

  // Update stage data without completing it
  async updateStage(stageName, data = {}) {
    if (!this.stages[stageName]) {
      throw new Error(`Invalid stage: ${stageName}`);
    }
    
    this.stages[stageName].data = {
      ...this.stages[stageName].data,
      ...data
    };
    
    await this.save();
  }

  // Update configuration
  async updateConfig(config = {}) {
    this.config = { ...this.config, ...config };
    await this.save();
  }

  // Add error
  async addError(error, stage = null) {
    this.errors.push({
      message: error.message || error,
      stack: error.stack,
      stage: stage || this.currentStage,
      timestamp: Date.now()
    });
    
    await this.save();
  }

  // Add warning
  async addWarning(message, stage = null) {
    this.warnings.push({
      message,
      stage: stage || this.currentStage,
      timestamp: Date.now()
    });
    
    await this.save();
  }

  // Set system check results
  async setSystemCheck(results) {
    this.systemCheck = {
      ...results,
      timestamp: Date.now()
    };
    
    await this.save();
  }

  // Get setup progress
  getProgress() {
    const completedStages = Object.values(this.stages).filter(s => s.completed).length;
    const totalStages = Object.keys(this.stages).length;
    const percentage = Math.round((completedStages / totalStages) * 100);
    
    return {
      completed: completedStages,
      total: totalStages,
      percentage,
      currentStage: this.currentStage,
      isComplete: completedStages === totalStages
    };
  }

  // Check if setup can be resumed
  canResume() {
    const progress = this.getProgress();
    return progress.completed > 0 && !progress.isComplete;
  }

  // Get next stage to execute
  getNextStage() {
    const stageOrder = ['welcome', 'preflight', 'configure', 'install'];
    
    for (const stage of stageOrder) {
      if (!this.stages[stage].completed) {
        return stage;
      }
    }
    
    return null; // All stages completed
  }

  // Get elapsed time
  getElapsedTime() {
    return Date.now() - this.startTime;
  }

  // Get human readable elapsed time
  getElapsedTimeString() {
    const elapsed = this.getElapsedTime();
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  // Validate state integrity
  validateState() {
    const issues = [];
    
    if (!this.projectName) {
      issues.push('Missing project name');
    }
    
    if (!this.setupId) {
      issues.push('Missing setup ID');
    }
    
    if (!this.startTime) {
      issues.push('Missing start time');
    }
    
    // Check stage integrity
    const requiredStages = ['welcome', 'preflight', 'configure', 'install'];
    for (const stage of requiredStages) {
      if (!this.stages[stage]) {
        issues.push(`Missing stage: ${stage}`);
      }
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  // Create a summary for display
  getSummary() {
    const progress = this.getProgress();
    const validation = this.validateState();
    
    return {
      projectName: this.projectName,
      setupId: this.setupId.slice(0, 8),
      progress,
      currentStage: this.currentStage,
      elapsed: this.getElapsedTimeString(),
      errors: this.errors.length,
      warnings: this.warnings.length,
      canResume: this.canResume(),
      isValid: validation.valid,
      config: this.config
    };
  }

  // Export state for debugging
  toJSON() {
    return {
      setupId: this.setupId,
      projectName: this.projectName,
      startTime: this.startTime,
      currentStage: this.currentStage,
      stages: this.stages,
      config: this.config,
      systemCheck: this.systemCheck,
      errors: this.errors,
      warnings: this.warnings,
      progress: this.getProgress(),
      summary: this.getSummary()
    };
  }
}

module.exports = { SetupState };