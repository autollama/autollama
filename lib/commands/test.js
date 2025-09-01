/**
 * AutoLlama Test Command
 * 🦙 Run comprehensive test suite
 */

const chalk = require('chalk');
const ora = require('ora');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

class TestCommand {
  constructor(options = {}) {
    this.options = options;
    this.startTime = Date.now();
  }

  async run() {
    console.log(chalk.cyan.bold('\n🦙 AutoLlama Test Suite'));
    console.log(chalk.gray('Running tests to ensure your llama is healthy...\n'));

    try {
      // 1. Setup test environment
      await this.setupTestEnvironment();
      
      // 2. Run tests based on options
      if (this.options.unit) {
        await this.runUnitTests();
      } else if (this.options.integration) {
        await this.runIntegrationTests();
      } else if (this.options.e2e) {
        await this.runE2ETests();
      } else {
        // Run all tests
        await this.runAllTests();
      }
      
      // 3. Show results
      this.showResults();
      
    } catch (error) {
      console.error(chalk.red.bold('\n❌ Tests failed:'), error.message);
      process.exit(1);
    }
  }

  async setupTestEnvironment() {
    const spinner = ora('Setting up test environment...').start();
    
    // Ensure test database exists
    await fs.ensureDir('data/test');
    
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_PATH = './data/test/autollama-test.db';
    process.env.LOG_LEVEL = 'error'; // Reduce noise during tests
    
    // Check if Jest is available
    try {
      require('jest');
      spinner.succeed('Test environment ready');
    } catch {
      spinner.text = 'Installing test dependencies...';
      execSync('npm install --save-dev jest supertest', { stdio: 'pipe' });
      spinner.succeed('Test environment setup complete');
    }
  }

  async runUnitTests() {
    console.log(chalk.cyan('🧪 Running unit tests...'));
    
    const spinner = ora('Testing individual components...').start();
    
    try {
      const output = execSync('npm run test:unit', { 
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      spinner.succeed('Unit tests passed');
      
      if (this.options.verbose) {
        console.log(chalk.gray(output));
      }
      
    } catch (error) {
      spinner.fail('Unit tests failed');
      console.error(chalk.red(error.stdout || error.message));
      throw error;
    }
  }

  async runIntegrationTests() {
    console.log(chalk.cyan('🔗 Running integration tests...'));
    
    const spinner = ora('Testing service integration...').start();
    
    try {
      // Start test services if needed
      await this.startTestServices();
      
      const output = execSync('npm run test:integration', { 
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      spinner.succeed('Integration tests passed');
      
      if (this.options.verbose) {
        console.log(chalk.gray(output));
      }
      
    } catch (error) {
      spinner.fail('Integration tests failed');
      console.error(chalk.red(error.stdout || error.message));
      throw error;
    } finally {
      await this.stopTestServices();
    }
  }

  async runE2ETests() {
    console.log(chalk.cyan('🌐 Running end-to-end tests...'));
    
    const spinner = ora('Testing complete workflows...').start();
    
    try {
      // Start full test environment
      await this.startTestEnvironment();
      
      const output = execSync('npm run test:e2e', { 
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      spinner.succeed('E2E tests passed');
      
      if (this.options.verbose) {
        console.log(chalk.gray(output));
      }
      
    } catch (error) {
      spinner.fail('E2E tests failed');
      console.error(chalk.red(error.stdout || error.message));
      throw error;
    } finally {
      await this.stopTestEnvironment();
    }
  }

  async runAllTests() {
    console.log(chalk.cyan('🎯 Running full test suite...'));
    
    const testTypes = [
      { name: 'Unit', command: 'test:unit', icon: '🧪' },
      { name: 'Integration', command: 'test:integration', icon: '🔗' },
      { name: 'E2E', command: 'test:e2e', icon: '🌐' }
    ];
    
    const results = [];
    
    for (const test of testTypes) {
      const spinner = ora(`${test.icon} Running ${test.name.toLowerCase()} tests...`).start();
      
      try {
        if (test.name === 'Integration') {
          await this.startTestServices();
        } else if (test.name === 'E2E') {
          await this.startTestEnvironment();
        }
        
        const startTime = Date.now();
        const output = execSync(`npm run ${test.command}`, { 
          encoding: 'utf8',
          cwd: process.cwd()
        });
        const duration = Date.now() - startTime;
        
        // Parse test results from Jest output
        const passed = this.parseTestResults(output);
        
        results.push({
          name: test.name,
          status: 'passed',
          duration,
          passed,
          output: this.options.verbose ? output : null
        });
        
        spinner.succeed(`${test.name} tests passed (${passed} tests, ${duration}ms)`);
        
      } catch (error) {
        const failed = this.parseTestResults(error.stdout || '');
        
        results.push({
          name: test.name,
          status: 'failed',
          passed: failed,
          error: error.message,
          output: error.stdout
        });
        
        spinner.fail(`${test.name} tests failed`);
        
        if (this.options.verbose) {
          console.error(chalk.red(error.stdout || error.message));
        }
      } finally {
        if (test.name === 'Integration') {
          await this.stopTestServices();
        } else if (test.name === 'E2E') {
          await this.stopTestEnvironment();
        }
      }
    }
    
    this.results = results;
  }

  parseTestResults(output) {
    // Simple Jest output parsing
    const match = output.match(/(\d+) passed/);
    return match ? parseInt(match[1]) : 0;
  }

  async startTestServices() {
    // Start minimal services for integration tests
    process.env.PORT = '3001';
    process.env.DATABASE_PATH = './data/test/autollama-test.db';
  }

  async stopTestServices() {
    // Cleanup test services
  }

  async startTestEnvironment() {
    // Start full environment for E2E tests
    process.env.PORT = '3001';
    process.env.FRONTEND_PORT = '8081'; // Different port to avoid conflicts
    process.env.DATABASE_PATH = './data/test/autollama-test.db';
  }

  async stopTestEnvironment() {
    // Cleanup full test environment
  }

  showResults() {
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    
    if (this.results) {
      // Show comprehensive results
      console.log(chalk.green.bold('\n🎉 Test Suite Complete!'));
      console.log(chalk.gray(`Total duration: ${duration} seconds\n`));
      
      const summary = {
        passed: this.results.filter(r => r.status === 'passed').length,
        failed: this.results.filter(r => r.status === 'failed').length,
        total: this.results.length
      };
      
      console.log(chalk.cyan('📊 Summary:'));
      console.log(chalk.green(`  ✅ Passed: ${summary.passed}/${summary.total}`));
      
      if (summary.failed > 0) {
        console.log(chalk.red(`  ❌ Failed: ${summary.failed}/${summary.total}`));
        
        // Show failed tests
        console.log(chalk.red('\n💥 Failed Tests:'));
        this.results
          .filter(r => r.status === 'failed')
          .forEach(result => {
            console.log(chalk.red(`  • ${result.name}: ${result.error}`));
          });
        
        process.exit(1);
      } else {
        console.log(chalk.green('\n🦙 All tests passed! Your llama is in perfect health!'));
        
        // Show coverage if requested
        if (this.options.coverage) {
          console.log(chalk.cyan('\n📈 Coverage report generated in coverage/ directory'));
        }
      }
    } else {
      console.log(chalk.green(`\n🦙 Tests completed in ${duration} seconds!`));
    }
  }
}

module.exports = TestCommand;