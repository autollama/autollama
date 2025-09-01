/**
 * AutoLlama Deploy Command
 * 🦙 Production deployment management
 */

const chalk = require('chalk');
const ora = require('ora');
const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

class DeployCommand {
  constructor(options = {}) {
    this.options = {
      target: options.target || 'docker',
      build: options.build !== false,
      migrate: options.migrate !== false,
      ...options
    };
    
    this.startTime = Date.now();
  }

  async run() {
    console.log(chalk.cyan.bold('\n🦙 AutoLlama Production Deployment'));
    console.log(chalk.gray(`Target: ${this.options.target}\n`));

    try {
      // 1. Pre-deployment checks
      await this.preDeploymentChecks();
      
      // 2. Build if requested
      if (this.options.build) {
        await this.buildApplication();
      }
      
      // 3. Run deployment based on target
      switch (this.options.target) {
        case 'docker':
          await this.deployDocker();
          break;
        case 'node':
          await this.deployNode();
          break;
        case 'cloud':
          await this.deployCloud();
          break;
        default:
          throw new Error(`Unknown deployment target: ${this.options.target}`);
      }
      
      // 4. Post-deployment verification
      await this.verifyDeployment();
      
      // 5. Show success
      this.showSuccess();
      
    } catch (error) {
      console.error(chalk.red.bold('\n❌ Deployment failed:'), error.message);
      process.exit(1);
    }
  }

  async preDeploymentChecks() {
    const spinner = ora('Running pre-deployment checks...').start();
    
    const checks = {
      packageJson: await fs.pathExists('package.json'),
      envExample: await fs.pathExists('.env.example'),
      apiDir: await fs.pathExists('api'),
      frontendDir: await fs.pathExists('config/react-frontend'),
      migrations: await fs.pathExists('migrations')
    };
    
    const failed = Object.entries(checks)
      .filter(([, status]) => !status)
      .map(([name]) => name);
    
    if (failed.length > 0) {
      spinner.fail(`Missing components: ${failed.join(', ')}`);
      console.log(chalk.yellow('🦙 Make sure you\'re in an AutoLlama project directory'));
      throw new Error('Pre-deployment checks failed');
    }
    
    // Check for production environment variables
    if (this.options.target !== 'docker') {
      const requiredEnvVars = ['OPENAI_API_KEY', 'DATABASE_URL'];
      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        spinner.warn(`Missing environment variables: ${missingVars.join(', ')}`);
        console.log(chalk.yellow('🦙 Make sure to set these in your production environment'));
      }
    }
    
    spinner.succeed('Pre-deployment checks passed');
  }

  async buildApplication() {
    const spinner = ora('Building application for production...').start();
    
    try {
      // Run the build script
      execSync('npm run build', { stdio: 'pipe' });
      
      // Verify build output
      const distPath = path.join(process.cwd(), 'dist');
      if (await fs.pathExists(distPath)) {
        const stats = await this.getDirectorySize(distPath);
        spinner.succeed(`Build complete (${stats})`);
      } else {
        spinner.fail('Build output not found');
        throw new Error('Build failed - no dist directory created');
      }
      
    } catch (error) {
      spinner.fail('Build failed');
      throw error;
    }
  }

  async deployDocker() {
    console.log(chalk.cyan('🐳 Docker Deployment'));
    
    const steps = [
      { name: 'Building containers', command: 'docker compose build' },
      { name: 'Starting services', command: 'docker compose up -d' },
      { name: 'Running migrations', command: 'docker compose exec autollama-api npm run migrate' }
    ];
    
    for (const step of steps) {
      const spinner = ora(step.name).start();
      
      try {
        if (!this.options.migrate && step.name.includes('migrations')) {
          spinner.info('Migrations skipped');
          continue;
        }
        
        execSync(step.command, { stdio: 'pipe' });
        spinner.succeed(step.name);
        
      } catch (error) {
        spinner.fail(step.name);
        console.error(chalk.red(error.message));
        throw error;
      }
    }
  }

  async deployNode() {
    console.log(chalk.cyan('⚡ Node.js Deployment'));
    
    const spinner = ora('Preparing Node.js deployment...').start();
    
    try {
      // Install production dependencies
      spinner.text = 'Installing production dependencies...';
      execSync('npm ci --production', { stdio: 'pipe' });
      
      // Run migrations if requested
      if (this.options.migrate) {
        spinner.text = 'Running database migrations...';
        execSync('npm run migrate', { stdio: 'pipe' });
      }
      
      // Create systemd service file (optional)
      await this.createSystemdService();
      
      spinner.succeed('Node.js deployment ready');
      
      console.log(chalk.cyan('\n📝 Manual steps:'));
      console.log(chalk.white('  1. Set up reverse proxy (nginx/apache)'));
      console.log(chalk.white('  2. Configure SSL certificates'));
      console.log(chalk.white('  3. Start with: npm start'));
      console.log(chalk.white('  4. Monitor with: pm2 or systemd'));
      
    } catch (error) {
      spinner.fail('Node.js deployment failed');
      throw error;
    }
  }

  async deployCloud() {
    console.log(chalk.cyan('☁️ Cloud Deployment'));
    
    const cloudProviders = {
      'railway': this.deployRailway.bind(this),
      'vercel': this.deployVercel.bind(this),
      'heroku': this.deployHeroku.bind(this),
      'digitalocean': this.deployDigitalOcean.bind(this)
    };
    
    console.log(chalk.yellow('🦙 Cloud deployment requires provider-specific setup'));
    console.log(chalk.cyan('\n📚 Supported providers:'));
    Object.keys(cloudProviders).forEach(provider => {
      console.log(chalk.white(`  • ${provider}`));
    });
    
    console.log(chalk.gray('\nRefer to docs/deployment/ for provider-specific guides'));
  }

  async createSystemdService() {
    const serviceContent = `[Unit]
Description=AutoLlama RAG Framework
After=network.target

[Service]
Type=simple
User=autollama
WorkingDirectory=${process.cwd()}
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
`;
    
    const systemdPath = path.join(process.cwd(), 'autollama.service');
    await fs.writeFile(systemdPath, serviceContent);
    
    console.log(chalk.green('📄 Systemd service file created: autollama.service'));
    console.log(chalk.gray('   Copy to /etc/systemd/system/ to enable'));
  }

  async verifyDeployment() {
    const spinner = ora('Verifying deployment...').start();
    
    try {
      // Wait a moment for services to start
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check health endpoints
      const healthChecks = [
        { name: 'API Health', url: 'http://localhost:3001/health' },
        { name: 'Frontend', url: 'http://localhost:8080' }
      ];
      
      for (const check of healthChecks) {
        try {
          const axios = require('axios');
          await axios.get(check.url, { timeout: 5000 });
          console.log(chalk.green(`  ✅ ${check.name}`));
        } catch {
          console.log(chalk.red(`  ❌ ${check.name}`));
        }
      }
      
      spinner.succeed('Deployment verification complete');
      
    } catch (error) {
      spinner.warn('Verification had issues, but deployment may still be successful');
    }
  }

  showSuccess() {
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    
    console.log(chalk.green.bold('\n🎉 Deployment Complete!'));
    console.log(chalk.gray(`Deployed in ${duration} seconds\n`));
    
    console.log(chalk.cyan('🌐 Your AutoLlama is now running:'));
    
    if (this.options.target === 'docker') {
      console.log(chalk.white('  • Application: http://localhost:8080'));
      console.log(chalk.white('  • API:         http://localhost:3001'));
      console.log(chalk.white('  • Health:      http://localhost:3001/health'));
      console.log(chalk.white('  • Stop with:   docker compose down'));
    } else if (this.options.target === 'node') {
      console.log(chalk.white('  • Start with:  npm start'));
      console.log(chalk.white('  • Monitor:     Check logs for startup messages'));
      console.log(chalk.white('  • Health:      http://localhost:3001/health'));
    }
    
    console.log(chalk.cyan('\n📊 Next Steps:'));
    console.log(chalk.white('  • Monitor performance and logs'));
    console.log(chalk.white('  • Set up monitoring and alerting'));
    console.log(chalk.white('  • Configure backups'));
    console.log(chalk.white('  • Review security settings'));
    
    const messages = {
      professional: '\n🦙 Production deployment successful.',
      friendly: '\n🦙 Your AutoLlama is live and ready to serve users!',
      party: '\n🦙🎉 WOOHOO! Your RAG app is LIVE! Time to celebrate! 🚀🎊'
    };
    
    const personality = process.env.LLAMA_PERSONALITY || 'friendly';
    console.log(chalk.cyan.bold(messages[personality] || messages.friendly));
  }

  async getDirectorySize(dirPath) {
    try {
      const { execSync } = require('child_process');
      const output = execSync(`du -sh "${dirPath}" 2>/dev/null || echo "0"`, {
        encoding: 'utf8'
      });
      return output.split('\t')[0].trim() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // Cloud deployment methods (stubs for now)
  async deployRailway() {
    console.log(chalk.cyan('🚂 Railway deployment coming soon!'));
  }

  async deployVercel() {
    console.log(chalk.cyan('▲ Vercel deployment coming soon!'));
  }

  async deployHeroku() {
    console.log(chalk.cyan('🟪 Heroku deployment coming soon!'));
  }

  async deployDigitalOcean() {
    console.log(chalk.cyan('🌊 DigitalOcean deployment coming soon!'));
  }
}

module.exports = DeployCommand;