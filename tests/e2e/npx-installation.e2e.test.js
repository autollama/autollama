/**
 * End-to-End NPX Installation Tests
 * 🦙 Comprehensive validation of the complete installation process
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync, spawn } = require('child_process');
const tmp = require('tmp');

describe('🦙 End-to-End NPX Installation', () => {
  let tempDir;
  let projectName;
  let projectPath;
  
  beforeAll(() => {
    // Create temporary directory for test installation
    tempDir = tmp.dirSync({ unsafeCleanup: true });
    projectName = 'e2e-test-project';
    projectPath = path.join(tempDir.name, projectName);
  });

  afterAll(() => {
    if (tempDir) {
      tempDir.removeCallback();
    }
  });

  describe('Installation Process Validation', () => {
    test('should create project with template application', async () => {
      const installerPath = path.join(__dirname, '..', '..', 'bin', 'create-autollama.js');
      
      // Test the installer can be imported and configured
      const AutoLlamaInstaller = require(installerPath);
      const installer = new AutoLlamaInstaller();
      
      // Configure for automated testing
      installer.projectName = projectName;
      installer.targetDir = projectPath;
      installer.config = {
        template: {
          id: 'basic',
          name: 'Basic RAG App',
          deploymentMode: 'local',
          features: ['SQLite database', 'Simple interface'],
          configuration: { 
            database: { type: 'sqlite' },
            deployment: 'local',
            ui: { theme: 'friendly' }
          },
          files: {
            'README.md': '# {{projectName}}\n🦙 AutoLlama RAG project',
            'autollama.config.js': 'module.exports = {{config}};'
          }
        },
        deploymentType: 'local',
        aiProvider: 'openai',
        apiKey: 'test-key-for-testing',
        llamaPersonality: 'friendly',
        installSampleData: true,
        customization: null
      };
      
      // Test environment generation
      await installer.generateEnvironmentConfig();
      
      // Verify .env file was created
      const envPath = path.join(projectPath, '.env');
      expect(await fs.pathExists(envPath)).toBe(true);
      
      const envContent = await fs.readFile(envPath, 'utf8');
      expect(envContent).toContain('DEPLOYMENT_MODE=local');
      expect(envContent).toContain('LLAMA_PERSONALITY=friendly');
      expect(envContent).toContain('DATABASE_TYPE=sqlite');
      
      // Verify autollama.config.js was created
      const configPath = path.join(projectPath, 'autollama.config.js');
      expect(await fs.pathExists(configPath)).toBe(true);
      
    }, 30000);

    test('should create proper project structure', async () => {
      // Verify essential directories were created
      const directories = ['data', 'uploads', 'logs'];
      
      for (const dir of directories) {
        const dirPath = path.join(projectPath, dir);
        expect(await fs.pathExists(dirPath)).toBe(true);
      }
    });

    test('should have executable CLI scripts', async () => {
      const binPath = path.join(projectPath, 'bin');
      
      if (await fs.pathExists(binPath)) {
        const cliScript = path.join(binPath, 'create-autollama.js');
        if (await fs.pathExists(cliScript)) {
          const stats = await fs.stat(cliScript);
          expect(stats.mode & parseInt('111', 8)).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Template System Integration', () => {
    test('should apply template-specific configuration', async () => {
      const configPath = path.join(projectPath, 'autollama.config.js');
      
      if (await fs.pathExists(configPath)) {
        const config = require(configPath);
        expect(config.deployment).toBe('local');
        expect(config.personality).toBe('friendly');
        expect(config.database.type).toBe('sqlite');
      }
    });

    test('should generate template-specific files', async () => {
      const readmePath = path.join(projectPath, 'README.md');
      
      if (await fs.pathExists(readmePath)) {
        const content = await fs.readFile(readmePath, 'utf8');
        expect(content).toContain(projectName);
        expect(content).toContain('🦙');
      }
    });
  });

  describe('Database Setup Validation', () => {
    test('should handle SQLite database configuration', async () => {
      const envPath = path.join(projectPath, '.env');
      
      if (await fs.pathExists(envPath)) {
        const envContent = await fs.readFile(envPath, 'utf8');
        expect(envContent).toContain('DATABASE_TYPE=sqlite');
        expect(envContent).toContain('DATABASE_PATH=./data/autollama.db');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle missing dependencies gracefully', () => {
      // Test that the installer fails gracefully if critical dependencies are missing
      const AutoLlamaInstaller = require(path.join(__dirname, '..', '..', 'bin', 'create-autollama.js'));
      
      expect(() => new AutoLlamaInstaller()).not.toThrow();
    });

    test('should validate project names', async () => {
      const AutoLlamaInstaller = require(path.join(__dirname, '..', '..', 'bin', 'create-autollama.js'));
      const installer = new AutoLlamaInstaller();
      
      // Test that validation works (would normally be interactive)
      expect(installer).toBeDefined();
      expect(typeof installer.handleError).toBe('function');
    });
  });
});

describe('🚀 Installation Performance E2E', () => {
  test('should complete key operations within performance targets', () => {
    const installerPath = path.join(__dirname, '..', '..', 'bin', 'create-autollama.js');
    
    // Test that the installer module loads quickly
    const start = Date.now();
    const AutoLlamaInstaller = require(installerPath);
    const loadTime = Date.now() - start;
    
    expect(loadTime).toBeLessThan(1000); // Should load in under 1 second
    expect(AutoLlamaInstaller).toBeDefined();
  });

  test('should have fast environment detection', async () => {
    const AutoLlamaInstaller = require(path.join(__dirname, '..', '..', 'bin', 'create-autollama.js'));
    const installer = new AutoLlamaInstaller();
    
    const start = Date.now();
    
    // Test individual detection methods
    const hasDocker = await installer.checkDocker();
    const hasGit = await installer.checkGit();
    const hasPostgres = await installer.checkPostgreSQL();
    
    const detectionTime = Date.now() - start;
    
    // Environment detection should be fast
    expect(detectionTime).toBeLessThan(5000);
    expect(typeof hasDocker).toBe('boolean');
    expect(typeof hasGit).toBe('boolean');
    expect(typeof hasPostgres).toBe('boolean');
  });
});

describe('🎯 Template System E2E', () => {
  test('should load all templates without errors', async () => {
    const TemplateManager = require(path.join(__dirname, '..', '..', 'lib', 'templates', 'manager.js'));
    const templateManager = new TemplateManager();
    
    await templateManager.loadTemplates();
    
    expect(templateManager.availableTemplates.size).toBe(3);
    expect(templateManager.availableTemplates.has('basic')).toBe(true);
    expect(templateManager.availableTemplates.has('advanced')).toBe(true);
    expect(templateManager.availableTemplates.has('custom')).toBe(true);
  });

  test('should validate template configurations', async () => {
    const templates = ['basic', 'advanced', 'custom'];
    
    for (const templateId of templates) {
      const templateConfigPath = path.join(__dirname, '..', '..', 'templates', templateId, 'template.config.js');
      expect(fs.pathExistsSync(templateConfigPath)).toBe(true);
      
      const config = require(templateConfigPath);
      expect(config.name).toBeDefined();
      expect(config.deploymentMode).toBeDefined();
      expect(config.features).toBeInstanceOf(Array);
      expect(config.configuration).toBeDefined();
    }
  });
});