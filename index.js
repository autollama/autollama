/**
 * AutoLlama v3.0.1
 * Modern JavaScript-first RAG framework
 * 
 * This is the main entry point when AutoLlama is used as a library.
 * For CLI usage, use the bin/autollama.js executable.
 */

const path = require('path');
const fs = require('fs-extra');

// Export CLI for programmatic usage
const AutoLlamaCLI = require('./bin/autollama.js');

// Export command functions
const commands = {
  start: require('./src/commands/start'),
  stop: require('./src/commands/stop'),
  status: require('./src/commands/status')
};

// Export utilities
const utils = {
  brand: require('./src/utils/brand'),
  system: require('./src/utils/system'),
  validation: require('./src/utils/validation')
};

// Main AutoLlama class for programmatic usage
class AutoLlama {
  constructor(options = {}) {
    this.options = {
      port: options.port || 8080,
      mode: options.mode || 'local',
      verbose: options.verbose || false,
      ...options
    };
  }

  async start(customOptions = {}) {
    const startOptions = { ...this.options, ...customOptions };
    return await commands.start.runStart(startOptions);
  }

  async stop(customOptions = {}) {
    const stopOptions = { ...this.options, ...customOptions };
    return await commands.stop.runStop(stopOptions);
  }

  async status(customOptions = {}) {
    const statusOptions = { ...this.options, ...customOptions };
    return await commands.status.runStatus(statusOptions);
  }

  static get version() {
    const packageJson = require('./package.json');
    return packageJson.version;
  }

  static get commands() {
    return commands;
  }

  static get utils() {
    return utils;
  }

  static get CLI() {
    return AutoLlamaCLI;
  }
}

// Export everything
module.exports = AutoLlama;
module.exports.AutoLlama = AutoLlama;
module.exports.CLI = AutoLlamaCLI;
module.exports.commands = commands;
module.exports.utils = utils;

// For ES modules compatibility
module.exports.default = AutoLlama;