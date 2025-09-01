/**
 * AutoLlama Professional Branding Utilities
 * Clean, modern theming for CLI interface
 */

const chalk = require('chalk');

// Color palette for professional branding
const colors = {
  primary: chalk.hex('#6366f1'), // Indigo
  secondary: chalk.hex('#8b5cf6'), // Purple  
  success: chalk.hex('#10b981'), // Emerald
  warning: chalk.hex('#f59e0b'), // Amber
  error: chalk.hex('#ef4444'), // Red
  info: chalk.hex('#3b82f6'), // Blue
  muted: chalk.hex('#6b7280'), // Gray
  bold: chalk.bold,
  dim: chalk.dim
};

// Professional header without ASCII art
function header(version) {
  console.log();
  console.log(colors.primary('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(colors.bold(`  AutoLlama Setup Wizard v${version}`));
  console.log(colors.primary('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log();
}

// Section headers for clean organization
function sectionHeader(title) {
  console.log();
  console.log(colors.bold(colors.primary(`▶ ${title}`)));
  console.log(colors.muted('─'.repeat(40)));
}

// Subsection headers
function subHeader(title) {
  console.log();
  console.log(colors.secondary(`  ${title}`));
}

// Status messages with consistent icons
const logger = {
  info: (msg) => console.log(colors.info('ℹ') + '  ' + msg),
  success: (msg) => console.log(colors.success('✓') + '  ' + msg),
  warning: (msg) => console.log(colors.warning('⚠') + '  ' + msg),
  error: (msg) => console.log(colors.error('✗') + '  ' + msg),
  step: (msg) => console.log(colors.secondary('→') + '  ' + msg),
  dim: (msg) => console.log(colors.dim('  ' + msg))
};

// Progress indicators
function showProgress(message, current, total) {
  const percentage = Math.round((current / total) * 100);
  const barLength = 20;
  const filled = Math.round((current / total) * barLength);
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
  
  console.log(`${colors.secondary('▶')} ${message} [${colors.primary(bar)}] ${colors.bold(percentage + '%')}`);
}

// Success celebration
function celebration(title, subtitle) {
  console.log();
  console.log(colors.primary('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(colors.success('🎉 ') + colors.bold(title));
  if (subtitle) {
    console.log(colors.muted(`   ${subtitle}`));
  }
  console.log(colors.primary('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log();
}

// Error display with suggestions
function errorBlock(title, message, suggestions = []) {
  console.log();
  console.log(colors.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(colors.error('❌ ') + colors.bold(title));
  console.log(colors.muted(`   ${message}`));
  
  if (suggestions.length > 0) {
    console.log();
    console.log(colors.info('💡 Suggestions:'));
    suggestions.forEach(suggestion => {
      console.log(colors.muted(`   • ${suggestion}`));
    });
  }
  
  console.log(colors.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log();
}

// Clean table helper for system info
function createTable(headers, rows) {
  const Table = require('cli-table3');
  
  const table = new Table({
    head: headers.map(h => colors.bold(h)),
    style: { 
      border: ['grey'], 
      head: [] 
    },
    colWidths: headers.map(() => 20)
  });
  
  rows.forEach(row => {
    const formattedRow = row.map((cell, index) => {
      if (index === 1) { // Status column
        if (cell.includes('✓')) return colors.success(cell);
        if (cell.includes('✗')) return colors.error(cell);
        if (cell.includes('⚠')) return colors.warning(cell);
      }
      return cell;
    });
    table.push(formattedRow);
  });
  
  return table.toString();
}

// Loading spinner wrapper
function withSpinner(message, asyncFn) {
  const ora = require('ora');
  const spinner = ora({
    text: message,
    color: 'magenta'
  });
  
  return async (...args) => {
    spinner.start();
    try {
      const result = await asyncFn(...args);
      spinner.succeed();
      return result;
    } catch (error) {
      spinner.fail(colors.error(`Failed: ${error.message}`));
      throw error;
    }
  };
}

// Prompt styling
function prompt(question) {
  return colors.secondary('? ') + colors.bold(question);
}

// Next steps display
function nextSteps(steps) {
  console.log(colors.bold('Next steps:'));
  steps.forEach((step, index) => {
    console.log(colors.muted(`  ${index + 1}. ${step}`));
  });
  console.log();
}

module.exports = {
  colors,
  header,
  sectionHeader,
  subHeader,
  logger,
  showProgress,
  celebration,
  errorBlock,
  createTable,
  withSpinner,
  prompt,
  nextSteps
};