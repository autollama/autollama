/**
 * AutoLlama Template Manager
 * 🦙 Handle template selection, customization, and generation
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');

class TemplateManager {
  constructor(config = {}) {
    this.config = config;
    this.templatesPath = path.join(__dirname, '..', '..', 'templates');
    this.availableTemplates = new Map();
  }

  /**
   * Load all available templates
   */
  async loadTemplates() {
    const templateDirs = await fs.readdir(this.templatesPath);
    
    for (const templateDir of templateDirs) {
      const templatePath = path.join(this.templatesPath, templateDir);
      const configPath = path.join(templatePath, 'template.config.js');
      
      if (await fs.pathExists(configPath)) {
        try {
          const templateConfig = require(configPath);
          templateConfig.path = templatePath;
          templateConfig.id = templateDir;
          this.availableTemplates.set(templateDir, templateConfig);
        } catch (error) {
          console.warn(chalk.yellow(`⚠️  Failed to load template ${templateDir}: ${error.message}`));
        }
      }
    }
    
    console.log(chalk.gray(`🦙 Loaded ${this.availableTemplates.size} templates`));
  }

  /**
   * Show template selection wizard
   */
  async selectTemplate() {
    await this.loadTemplates();
    
    if (this.availableTemplates.size === 0) {
      throw new Error('No templates available');
    }

    console.log(chalk.cyan('\n🎨 Choose your AutoLlama template:'));
    
    const choices = Array.from(this.availableTemplates.values()).map(template => ({
      name: `${template.name} - ${template.description}`,
      value: template.id,
      short: template.name
    }));
    
    const { selectedTemplate } = await inquirer.prompt([{
      type: 'list',
      name: 'selectedTemplate',
      message: 'Which template fits your needs?',
      choices
    }]);
    
    const template = this.availableTemplates.get(selectedTemplate);
    
    // Show template features
    console.log(chalk.green(`\n✨ ${template.name} selected!`));
    console.log(chalk.cyan('\n🎯 Features included:'));
    template.features.forEach(feature => {
      console.log(chalk.white(`  • ${feature}`));
    });
    
    return template;
  }

  /**
   * Run template wizard if template supports it
   */
  async runTemplateWizard(template) {
    if (!template.wizardQuestions || template.wizardQuestions.length === 0) {
      return null;
    }

    console.log(chalk.cyan(`\n🔧 Customizing ${template.name}...`));
    console.log(chalk.gray('Let\'s tailor this template to your specific needs.\n'));
    
    const answers = await inquirer.prompt(template.wizardQuestions);
    
    // Generate custom configuration
    let customConfig = template.configuration;
    
    if (typeof template.generateConfig === 'function') {
      customConfig = template.generateConfig(answers);
    }
    
    return { answers, config: customConfig };
  }

  /**
   * Apply template to target directory
   */
  async applyTemplate(template, targetDir, projectName, customization = null) {
    console.log(chalk.cyan(`\n🦙 Applying ${template.name} template...`));
    
    // Ensure target directory exists
    await fs.ensureDir(targetDir);
    
    // Copy base AutoLlama files (excluding templates)
    const sourceDir = path.join(__dirname, '..', '..');
    await fs.copy(sourceDir, targetDir, {
      filter: (src) => {
        const relativePath = path.relative(sourceDir, src);
        return !relativePath.startsWith('templates/') && 
               !relativePath.startsWith('node_modules/') &&
               !relativePath.startsWith('.git/') &&
               !relativePath.includes('bin/create-autollama.js');
      }
    });
    
    // Apply template-specific files
    await this.generateTemplateFiles(template, targetDir, projectName, customization);
    
    // Copy template assets if they exist
    const templateAssetsPath = path.join(template.path, 'assets');
    if (await fs.pathExists(templateAssetsPath)) {
      const targetAssetsPath = path.join(targetDir, 'assets', 'template');
      await fs.copy(templateAssetsPath, targetAssetsPath);
    }
    
    console.log(chalk.green('✅ Template applied successfully'));
  }

  /**
   * Generate template-specific files
   */
  async generateTemplateFiles(template, targetDir, projectName, customization) {
    const config = customization?.config || template.configuration;
    const answers = customization?.answers || {};
    
    // Generate files based on template
    let files = template.files || {};
    
    // Generate custom files if template supports it
    if (typeof template.generateFiles === 'function') {
      const customFiles = template.generateFiles(config, answers);
      files = { ...files, ...customFiles };
    }
    
    // Process each file
    for (const [filePath, content] of Object.entries(files)) {
      const targetPath = path.join(targetDir, filePath);
      await fs.ensureDir(path.dirname(targetPath));
      
      // Replace template variables
      const processedContent = this.processTemplateContent(content, {
        projectName,
        config,
        answers,
        template
      });
      
      await fs.writeFile(targetPath, processedContent);
    }
    
    // Generate package.json modifications
    await this.updatePackageJson(targetDir, template, config, answers);
    
    // Generate autollama.config.js
    await this.generateConfig(targetDir, config, template);
  }

  /**
   * Process template content with variable substitution
   */
  processTemplateContent(content, context) {
    let processed = content;
    
    // Replace {{projectName}}
    processed = processed.replace(/\{\{projectName\}\}/g, context.projectName);
    
    // Replace {{config.xxx}} patterns
    processed = processed.replace(/\{\{config\.(\w+)\}\}/g, (match, key) => {
      return context.config[key] || match;
    });
    
    // Replace {{answers.xxx}} patterns
    processed = processed.replace(/\{\{answers\.(\w+)\}\}/g, (match, key) => {
      return context.answers[key] || match;
    });
    
    return processed;
  }

  /**
   * Update package.json with template-specific scripts and dependencies
   */
  async updatePackageJson(targetDir, template, config, answers) {
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = await fs.readJson(packageJsonPath);
    
    // Update scripts
    if (template.scripts) {
      packageJson.scripts = {
        ...packageJson.scripts,
        ...template.scripts
      };
    }
    
    // Add template-specific dependencies
    if (template.dependencies) {
      const deps = template.dependencies;
      
      if (deps.runtime) {
        for (const dep of deps.runtime) {
          if (!packageJson.dependencies[dep]) {
            // Get latest version (simplified)
            packageJson.dependencies[dep] = '^1.0.0';
          }
        }
      }
      
      if (deps.monitoring && config.features?.performanceMonitoring) {
        for (const dep of deps.monitoring) {
          if (!packageJson.dependencies[dep]) {
            packageJson.dependencies[dep] = '^1.0.0';
          }
        }
      }
    }
    
    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
  }

  /**
   * Generate autollama.config.js file
   */
  async generateConfig(targetDir, config, template) {
    const configContent = `/**
 * AutoLlama Configuration
 * 🦙 Generated from ${template.name} template
 * Customize this file to adjust your RAG setup
 */

module.exports = ${JSON.stringify(config, null, 2)};
`;
    
    await fs.writeFile(
      path.join(targetDir, 'autollama.config.js'),
      configContent
    );
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId) {
    await this.loadTemplates();
    return this.availableTemplates.get(templateId);
  }

  /**
   * List all available templates
   */
  async listTemplates() {
    await this.loadTemplates();
    
    console.log(chalk.cyan('\n🎨 Available Templates:\n'));
    
    for (const template of this.availableTemplates.values()) {
      console.log(chalk.white.bold(`${template.name}`));
      console.log(chalk.gray(`  ${template.description}`));
      console.log(chalk.cyan('  Features:'));
      template.features.slice(0, 3).forEach(feature => {
        console.log(chalk.gray(`    • ${feature}`));
      });
      if (template.features.length > 3) {
        console.log(chalk.gray(`    • ...and ${template.features.length - 3} more`));
      }
      console.log();
    }
  }
}

module.exports = TemplateManager;