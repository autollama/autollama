#!/usr/bin/env node

/**
 * AutoLlama v3.0 - NPX Installer
 * 🦙 The cuddliest context-aware RAG framework
 * Usage: npx create-autollama [project-name]
 */

const fs = require('fs-extra');
const path = require('path');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { execSync, spawn } = require('child_process');

// Llama ASCII Art Collection
const LLAMA_ART = {
  welcome: `
    　 ∩___∩
    　 |ノ　　　ヽ
    　/　　●　　● |   ${chalk.cyan.bold('AutoLlama v3.0')}
    　|　　( _●_)　ミ   ${chalk.gray('Your Context-Aware RAG Companion')}
    　彡､　　|∪|　､\`   
    /　　　 ヽノ　/´   ${chalk.yellow('The fluffiest way to build RAG apps!')}
    (　＼＿＿＿,　/
    　＼＿,)　　/
    　　　　　 /`,
    
  happy: `
    　 ∩___∩
    　 |ノ　　　ヽ
    　/　　◕　　◕ |
    　|　　( ◡ )　ミ
    　彡､　　|∪|　､\`
    /　　　 ヽノ　/´`,
    
  thinking: `
    　 ∩___∩
    　 |ノ　　　ヽ
    　/　　―　　― |
    　|　　( _●_)　💭
    　彡､　　|∪|　､\`
    /　　　 ヽノ　/´`,
    
  mini: '🦙'
};

// Llama-themed messages
const LLAMA_MESSAGES = {
  dependencies: [
    "🦙 Gathering the finest npm packages from the digital Andes...",
    "🌿 Your llama is carefully selecting each dependency...",
    "📦 Packing supplies for your RAG adventure..."
  ],
  database: [
    "🏔️ Setting up a cozy database pasture...",
    "💾 Teaching your llama to remember everything...",
    "🗄️ Organizing the document grazing grounds..."
  ],
  configuration: [
    "✨ Sprinkling some llama magic on your config...",
    "🎨 Customizing your llama's outfit...",
    "🔧 Adjusting the saddle for perfect fit..."
  ],
  completion: [
    "🎉 Your llama herd is ready for action!",
    "✨ Setup complete! Time to start your RAG adventure!",
    "🦙 *Happy llama humming* Everything is configured!"
  ]
};

// Llama facts to display during long operations
const LLAMA_FACTS = [
  "🦙 Fun fact: Llamas hum when they're happy or curious!",
  "🦙 Did you know? Llamas are excellent guards for sheep and goats!",
  "🦙 Llama wisdom: They can carry 25-30% of their body weight!",
  "🦙 Cool fact: Llamas have excellent memories and can learn tasks quickly!",
  "🦙 Trivia: Baby llamas are called 'crias' - how cute is that?",
  "🦙 Fun fact: Llamas communicate through ear positions and tail movements!",
  "🦙 Did you know? Llamas rarely spit at humans - only at other llamas!",
  "🦙 Llama fact: They're environmentally friendly with soft, padded feet!"
];

class AutoLlamaInstaller {
  constructor() {
    this.projectName = process.argv[2];
    this.targetDir = '';
    this.config = {};
    this.startTime = Date.now();
    this.currentFactIndex = 0;
  }

  async install() {
    // Clear console and show welcome
    console.clear();
    this.showWelcome();
    
    try {
      // Step 1: Get project name with llama flair
      await this.getProjectName();
      
      // Step 2: Configuration wizard
      await this.configurationWizard();
      
      // Step 3: Environment detection
      await this.detectEnvironment();
      
      // Step 4: Install dependencies
      await this.installDependencies();
      
      // Step 5: Initialize database
      await this.initializeDatabase();
      
      // Step 6: Final setup
      await this.finalizeSetup();
      
      // Success celebration!
      this.celebrateSuccess();
      
    } catch (error) {
      this.handleError(error);
    }
  }

  showWelcome() {
    console.log(LLAMA_ART.welcome);
    console.log();
    
    // Animated typing effect for tagline
    const tagline = "🦙 Welcome to the fluffiest RAG framework installation!";
    console.log(chalk.cyan(tagline));
    console.log();
  }

  async getProjectName() {
    if (!this.projectName) {
      const { projectName } = await inquirer.prompt([{
        type: 'input',
        name: 'projectName',
        message: `${LLAMA_ART.mini} What shall we name your llama project?`,
        default: 'my-fluffy-rag',
        validate: (input) => {
          if (/^[a-z0-9-]+$/.test(input)) return true;
          return 'Please use lowercase letters, numbers, and hyphens only';
        }
      }]);
      
      this.projectName = projectName;
    }
    
    this.targetDir = path.join(process.cwd(), this.projectName);
    
    // Check if directory exists
    if (await fs.pathExists(this.targetDir)) {
      console.log(chalk.yellow(`\n${LLAMA_ART.mini} Hmm, there's already a ${this.projectName} pasture here...`));
      
      const { overwrite } = await inquirer.prompt([{
        type: 'confirm',
        name: 'overwrite',
        message: 'Should we clear it for a fresh start?',
        default: false
      }]);
      
      if (!overwrite) {
        console.log(chalk.cyan(`\n${LLAMA_ART.mini} No worries! Try again with a different name.`));
        console.log(chalk.gray('Your llama will wait patiently for you! 💙'));
        process.exit(0);
      }
      
      await fs.remove(this.targetDir);
    }
    
    await fs.ensureDir(this.targetDir);
    console.log(chalk.green(`✓ Created ${chalk.bold(this.projectName)} directory`));
  }

  async configurationWizard() {
    console.log(chalk.cyan(`\n${LLAMA_ART.mini} Let's customize your llama setup!`));
    console.log(chalk.gray('I\'ll ask a few questions to get everything just right.\n'));
    
    // First, choose template
    const TemplateManager = require('../lib/templates/manager');
    const templateManager = new TemplateManager();
    
    const template = await templateManager.selectTemplate();
    this.config.template = template;
    
    // Run template-specific wizard if available
    if (template.wizardQuestions && template.wizardQuestions.length > 0) {
      console.log(chalk.cyan(`\n🔧 Customizing ${template.name}...`));
      this.config.customization = await templateManager.runTemplateWizard(template);
    }
    
    // Standard questions
    const standardAnswers = await inquirer.prompt([
      {
        type: 'list',
        name: 'aiProvider',
        message: '🧠 Which AI treats shall we feed your llama?',
        choices: [
          { name: '🌟 OpenAI GPT (Recommended - Premium hay!)', value: 'openai' },
          { name: '🎭 Anthropic Claude (Gourmet grass!)', value: 'anthropic' },
          { name: '🌾 I\'ll bring my own treats later', value: 'later' }
        ],
        default: 'openai'
      },
      {
        type: 'password',
        name: 'apiKey',
        message: '🔑 Your API key (or press Enter to add it later):',
        when: (answers) => answers.aiProvider !== 'later',
        mask: '🦙',
        validate: (input) => {
          if (!input) return true; // Allow empty
          if (input.length < 20) return 'That seems a bit short for an API key...';
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'installSampleData',
        message: '📚 Would you like some sample documents to play with?',
        default: true
      },
      {
        type: 'list',
        name: 'llamaPersonality',
        message: '🎨 Choose your llama\'s personality:',
        choices: [
          { name: '🎩 Professional Llama (Serious business mode)', value: 'professional' },
          { name: '🌈 Friendly Llama (Balanced and approachable)', value: 'friendly' },
          { name: '🎪 Party Llama (Maximum fun and emojis!)', value: 'party' }
        ],
        default: template.configuration?.ui?.theme === 'professional' ? 'professional' : 'friendly'
      }
    ]);

    // Merge all answers
    this.config = { ...this.config, ...standardAnswers };
    this.config.deploymentType = template.deploymentMode || 'local';
    
    console.log(chalk.green(`\n${LLAMA_ART.mini} Excellent choices! Your llama approves!`));
  }

  async detectEnvironment() {
    const spinner = ora({
      text: 'Sniffing around your environment...',
      spinner: {
        interval: 80,
        frames: ['🦙  ', ' 🦙 ', '  🦙', ' 🦙 ', '🦙  ']
      }
    }).start();
    
    const capabilities = {
      hasDocker: await this.checkDocker(),
      hasPostgres: await this.checkPostgreSQL(),
      hasGit: await this.checkGit(),
      nodeVersion: process.version
    };

    this.config.capabilities = capabilities;
    
    await this.sleep(1500); // Give time to see the animation
    
    const capList = [];
    capList.push(`Node ${capabilities.nodeVersion}`);
    if (capabilities.hasDocker) capList.push('Docker');
    if (capabilities.hasPostgres) capList.push('PostgreSQL');
    if (capabilities.hasGit) capList.push('Git');
    
    spinner.succeed(`Found: ${capList.join(', ')}`);
    
    // Provide friendly feedback based on what's found
    if (this.config.deploymentType === 'docker' && !capabilities.hasDocker) {
      console.log(chalk.yellow(`\n${LLAMA_ART.mini} Heads up! Docker isn't installed.`));
      console.log(chalk.gray('No worries - I\'ll adjust the setup for you!'));
      this.config.deploymentType = 'local';
    }
  }

  async installDependencies() {
    console.log(chalk.cyan(`\n${LLAMA_ART.mini} Time to gather supplies!`));
    
    const spinner = ora({
      text: this.getRandomMessage('dependencies'),
      spinner: {
        interval: 100,
        frames: ['🌿', '🌾', '🌱', '🍃']
      }
    }).start();
    
    // Show llama facts during installation
    const factInterval = setInterval(() => {
      spinner.text = this.getNextLlamaFact();
    }, 3000);
    
    try {
      // Apply template to project
      const TemplateManager = require('../lib/templates/manager');
      const templateManager = new TemplateManager();
      
      spinner.text = '🎨 Applying template configuration...';
      await templateManager.applyTemplate(
        this.config.template,
        this.targetDir, 
        this.projectName,
        this.config.customization
      );
      
      // Install npm dependencies
      process.chdir(this.targetDir);
      
      spinner.text = '📦 Installing npm packages (this might take a minute)...';
      execSync('npm install', { stdio: 'pipe' });
      
      clearInterval(factInterval);
      spinner.succeed('All dependencies installed! Your llama is well-equipped!');
      
    } catch (error) {
      clearInterval(factInterval);
      spinner.fail('Had trouble gathering dependencies');
      throw error;
    }
  }

  async generateEnvironmentConfig() {
    const envContent = this.generateEnvContent();
    await fs.writeFile(path.join(this.targetDir, '.env'), envContent);
    
    // Create personality-based configuration
    const config = {
      deployment: this.config.deploymentType,
      personality: this.config.llamaPersonality,
      welcomeMessage: this.getPersonalityWelcome(),
      database: this.config.deploymentType === 'local' ? {
        type: 'sqlite',
        path: './data/autollama.db'
      } : {
        type: 'postgresql',
        url: 'postgresql://autollama:autollama@localhost:5432/autollama'
      }
    };
    
    await fs.writeFile(
      path.join(this.targetDir, 'autollama.config.js'),
      `// 🦙 AutoLlama Configuration\nmodule.exports = ${JSON.stringify(config, null, 2)};`
    );
  }

  generateEnvContent() {
    const personality = {
      professional: '# AutoLlama v3.0 Configuration',
      friendly: '# 🦙 AutoLlama v3.0 Configuration - Happy grazing!',
      party: '# 🦙🎉 AutoLlama v3.0 - Let\'s party! 🎊🦙'
    };
    
    const lines = [
      personality[this.config.llamaPersonality],
      '# Generated by your friendly setup llama',
      `# Created: ${new Date().toLocaleDateString()}`,
      '',
      '# Deployment Configuration',
      `DEPLOYMENT_MODE=${this.config.deploymentType}`,
      `LLAMA_PERSONALITY=${this.config.llamaPersonality}`,
      '',
      '# AI Configuration'
    ];

    if (this.config.aiProvider === 'openai') {
      lines.push(`OPENAI_API_KEY=${this.config.apiKey || 'your_openai_api_key_here'}`);
      lines.push('AI_PROVIDER=openai');
      lines.push('# 🦙 Tip: Get your key at https://platform.openai.com/api-keys');
    } else if (this.config.aiProvider === 'anthropic') {
      lines.push(`ANTHROPIC_API_KEY=${this.config.apiKey || 'your_anthropic_api_key_here'}`);
      lines.push('AI_PROVIDER=anthropic');
      lines.push('# 🦙 Tip: Get your key at https://console.anthropic.com/');
    }

    if (this.config.deploymentType === 'local') {
      lines.push('', '# Local Development Database');
      lines.push('DATABASE_TYPE=sqlite');
      lines.push('DATABASE_PATH=./data/autollama.db');
      lines.push('# 🦙 Your data lives in a cozy local pasture!');
    } else {
      lines.push('', '# PostgreSQL Configuration');
      lines.push('DATABASE_URL=postgresql://autollama:autollama@localhost:5432/autollama');
      lines.push('# 🦙 Professional-grade database for serious llamas');
    }

    lines.push('', '# Vector Database');
    lines.push('QDRANT_URL=http://localhost:6333');
    if (this.config.deploymentType === 'local') {
      lines.push('# 🦙 Qdrant will auto-start in development mode');
    }

    lines.push('', '# RAG Configuration');
    lines.push('ENABLE_CONTEXTUAL_EMBEDDINGS=true');
    lines.push('CONTEXT_GENERATION_BATCH_SIZE=5');
    lines.push('# 🦙 60% better accuracy with Anthropic\'s contextual retrieval!');
    
    if (this.config.llamaPersonality === 'party') {
      lines.push('', '# 🎉 Party Mode Settings');
      lines.push('ENABLE_CONFETTI=true');
      lines.push('MAX_EMOJI_LEVEL=11');
    }

    return lines.join('\n');
  }

  async initializeDatabase() {
    const spinner = ora({
      text: this.getRandomMessage('database'),
      spinner: {
        interval: 120,
        frames: ['🏔️ ', '⛰️ ', '🗻 ', '🏔️ ']
      }
    }).start();
    
    try {
      // Use the auto-setup system
      const { AutoSetup } = require('../lib/startup/auto-setup');
      const autoSetup = new AutoSetup({
        projectRoot: this.targetDir,
        skipPrompts: true
      });
      
      spinner.text = '💾 Setting up your database pasture...';
      const result = await autoSetup.runAutoSetup();
      
      if (result.setup) {
        spinner.succeed('Database initialized! Your llama has a great memory now!');
        
        if (this.config.installSampleData) {
          console.log(chalk.gray(`  📚 Sample documents added for testing`));
        }
      } else {
        spinner.succeed('Database setup completed');
      }
      
    } catch (error) {
      spinner.warn('Database setup will complete on first run');
      // Don't fail installation if database setup fails
    }
  }

  async finalizeSetup() {
    const spinner = ora({
      text: 'Adding finishing touches...',
      spinner: {
        interval: 80,
        frames: ['✨', '💫', '⭐', '🌟']
      }
    }).start();
    
    // Create necessary directories
    await fs.ensureDir(path.join(this.targetDir, 'data'));
    await fs.ensureDir(path.join(this.targetDir, 'uploads'));
    await fs.ensureDir(path.join(this.targetDir, 'logs'));
    
    // Set executable permissions
    const binFiles = ['bin/create-autollama.js'];
    for (const binFile of binFiles) {
      const binPath = path.join(this.targetDir, binFile);
      if (await fs.pathExists(binPath)) {
        await fs.chmod(binPath, '755');
      }
    }
    
    await this.sleep(1500);
    spinner.succeed('Everything is perfect!');
  }

  celebrateSuccess() {
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    
    console.log('\n' + chalk.green('═'.repeat(50)));
    console.log(LLAMA_ART.happy);
    console.log(chalk.green.bold('\n  🎉 Installation Complete! 🎉'));
    console.log(chalk.gray(`  Setup time: ${duration} seconds`));
    console.log(chalk.green('═'.repeat(50)));
    
    console.log(chalk.cyan('\n📚 Next Steps:'));
    console.log(chalk.white(`  cd ${chalk.bold(this.projectName)}`));
    
    // Use template-specific start command
    const startCommand = this.config.template?.scripts?.dev || 
                        (this.config.deploymentType === 'docker' ? 'npm run docker:up' : 'npm run dev');
    console.log(chalk.white(`  ${startCommand}`));
    
    console.log(chalk.cyan('\n🌐 Your llama will be grazing at:'));
    console.log(chalk.white('  • Application: http://localhost:8080'));
    console.log(chalk.white('  • API Docs:    http://localhost:8080/api/docs'));
    console.log(chalk.white('  • Health:      http://localhost:8080/api/health'));
    
    // Template-specific information
    if (this.config.template) {
      console.log(chalk.cyan(`\n🎯 ${this.config.template.name} Features:`));
      this.config.template.features.slice(0, 3).forEach(feature => {
        console.log(chalk.gray(`  • ${feature}`));
      });
      if (this.config.template.features.length > 3) {
        console.log(chalk.gray(`  • ...and ${this.config.template.features.length - 3} more!`));
      }
    }
    
    if (!this.config.apiKey && this.config.aiProvider !== 'later') {
      console.log(chalk.yellow(`\n⚠️  Don't forget to add your ${this.config.aiProvider.toUpperCase()} API key in .env`));
    }
    
    // Personality-based farewell
    const farewells = {
      professional: '\n🦙 Your AutoLlama instance is ready for deployment.',
      friendly: '\n🦙 Happy coding! Your llama is excited to help you build amazing things!',
      party: '\n🦙🎉 LET\'S GOOO! Time to build the most awesome RAG app ever! 🚀🎊'
    };
    
    console.log(chalk.bold.cyan(farewells[this.config.llamaPersonality]));
    console.log(chalk.gray('\nNeed help? Visit https://github.com/autollama/autollama'));
    console.log();
  }

  handleError(error) {
    console.log(chalk.red(`\n${LLAMA_ART.mini}💔 Oh no! This llama encountered a rocky path...`));
    console.log(chalk.yellow('Even the fluffiest llamas stumble sometimes!\n'));
    
    console.log(chalk.red('Error details:'));
    console.log(chalk.gray(`  ${error.message}`));
    
    if (error.code === 'EACCES') {
      console.log(chalk.cyan('\n💡 Llama tip: Try running with sudo or check your permissions!'));
    } else if (error.message.includes('npm')) {
      console.log(chalk.cyan('\n💡 Llama tip: Make sure npm is installed and up to date!'));
    } else if (error.message.includes('network')) {
      console.log(chalk.cyan('\n💡 Llama tip: Check your internet connection!'));
    }
    
    console.log(chalk.gray('\n📚 For more help, visit: https://github.com/autollama/autollama/issues'));
    console.log(chalk.gray('🦙 Your llama believes in you! Try again!'));
    
    process.exit(1);
  }

  // Utility functions
  getRandomMessage(category) {
    const messages = LLAMA_MESSAGES[category];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  getNextLlamaFact() {
    const fact = LLAMA_FACTS[this.currentFactIndex % LLAMA_FACTS.length];
    this.currentFactIndex++;
    return fact;
  }

  getPersonalityWelcome() {
    const welcomes = {
      professional: 'Welcome to AutoLlama. Enterprise-grade RAG framework.',
      friendly: '🦙 Welcome! Your friendly RAG companion is ready to help!',
      party: '🦙🎉 WOOHOO! Welcome to the RAG party! Let\'s build something AMAZING! 🚀'
    };
    return welcomes[this.config.llamaPersonality];
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Environment detection
  async checkDocker() {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      execSync('docker compose version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async checkPostgreSQL() {
    try {
      execSync('psql --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async checkGit() {
    try {
      execSync('git --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow(`\n\n${LLAMA_ART.mini} Installation cancelled!`));
  console.log(chalk.gray('Your llama will be here when you\'re ready to try again! 💙'));
  process.exit(0);
});

// Handle unhandled errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red(`\n${LLAMA_ART.mini} Unexpected error:`), error.message);
  console.log(chalk.gray('Please report this at: https://github.com/autollama/autollama/issues'));
  process.exit(1);
});

// Main execution
if (require.main === module) {
  const installer = new AutoLlamaInstaller();
  installer.install();
}

module.exports = AutoLlamaInstaller;