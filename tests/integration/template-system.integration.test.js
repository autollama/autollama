/**
 * Template System Integration Tests
 * 🦙 Test template loading, selection, and application
 */

const fs = require('fs-extra');
const path = require('path');
const tmp = require('tmp');

describe('🎨 Template System Integration', () => {
  let tempDir;
  let templateManager;
  
  beforeAll(async () => {
    tempDir = tmp.dirSync({ unsafeCleanup: true });
    
    const TemplateManager = require(path.join(__dirname, '..', '..', 'lib', 'templates', 'manager.js'));
    templateManager = new TemplateManager();
    await templateManager.loadTemplates();
  });

  afterAll(() => {
    if (tempDir) {
      tempDir.removeCallback();
    }
  });

  describe('Template Loading and Discovery', () => {
    test('should discover all available templates', () => {
      expect(templateManager.availableTemplates.size).toBe(3);
      
      const templateIds = Array.from(templateManager.availableTemplates.keys());
      expect(templateIds).toContain('basic');
      expect(templateIds).toContain('advanced');
      expect(templateIds).toContain('custom');
    });

    test('should load template configurations correctly', () => {
      for (const [id, template] of templateManager.availableTemplates) {
        expect(template.id).toBe(id);
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.deploymentMode).toBeDefined();
        expect(template.features).toBeInstanceOf(Array);
        expect(template.configuration).toBeDefined();
        expect(template.path).toBeDefined();
      }
    });

    test('should validate template file structures', async () => {
      for (const template of templateManager.availableTemplates.values()) {
        const templatePath = template.path;
        expect(await fs.pathExists(templatePath)).toBe(true);
        
        const configPath = path.join(templatePath, 'template.config.js');
        expect(await fs.pathExists(configPath)).toBe(true);
      }
    });
  });

  describe('Template Application', () => {
    test('should apply basic template correctly', async () => {
      const template = templateManager.availableTemplates.get('basic');
      const targetDir = path.join(tempDir.name, 'basic-test');
      const projectName = 'basic-test';
      
      await templateManager.applyTemplate(template, targetDir, projectName);
      
      // Verify core AutoLlama files were copied
      expect(await fs.pathExists(path.join(targetDir, 'package.json'))).toBe(true);
      expect(await fs.pathExists(path.join(targetDir, 'bin'))).toBe(true);
      expect(await fs.pathExists(path.join(targetDir, 'lib'))).toBe(true);
      
      // Verify template-specific configuration
      const configPath = path.join(targetDir, 'autollama.config.js');
      expect(await fs.pathExists(configPath)).toBe(true);
      
      const config = require(configPath);
      expect(config.database.type).toBe('sqlite');
    }, 30000);

    test('should apply advanced template with production features', async () => {
      const template = templateManager.availableTemplates.get('advanced');
      const targetDir = path.join(tempDir.name, 'advanced-test');
      const projectName = 'advanced-test';
      
      await templateManager.applyTemplate(template, targetDir, projectName);
      
      // Verify advanced configuration
      const configPath = path.join(targetDir, 'autollama.config.js');
      expect(await fs.pathExists(configPath)).toBe(true);
      
      const config = require(configPath);
      expect(config.database.type).toBe('postgresql');
      expect(config.features.performanceMonitoring).toBe(true);
    }, 30000);

    test('should handle template file generation', async () => {
      const template = templateManager.availableTemplates.get('basic');
      const targetDir = path.join(tempDir.name, 'file-gen-test');
      const projectName = 'file-gen-test';
      
      await templateManager.generateTemplateFiles(
        template, 
        targetDir, 
        projectName, 
        { config: template.configuration, answers: {} }
      );
      
      // Check that template variables were replaced
      const readmePath = path.join(targetDir, 'README.md');
      if (await fs.pathExists(readmePath)) {
        const content = await fs.readFile(readmePath, 'utf8');
        expect(content).toContain(projectName);
        expect(content).not.toContain('{{projectName}}');
      }
    });
  });

  describe('Template Configuration Processing', () => {
    test('should process template variables correctly', () => {
      const content = 'Project: {{projectName}}, Database: {{config.database.type}}';
      const context = {
        projectName: 'test-project',
        config: { database: { type: 'sqlite' } },
        answers: {}
      };
      
      const processed = templateManager.processTemplateContent(content, context);
      expect(processed).toBe('Project: test-project, Database: sqlite');
    });

    test('should update package.json with template scripts', async () => {
      const template = templateManager.availableTemplates.get('advanced');
      const targetDir = path.join(tempDir.name, 'package-test');
      const projectName = 'package-test';
      
      // Create initial package.json
      await fs.ensureDir(targetDir);
      await fs.writeJson(path.join(targetDir, 'package.json'), {
        name: projectName,
        version: '1.0.0',
        scripts: {},
        dependencies: {}
      });
      
      await templateManager.updatePackageJson(
        targetDir, 
        template, 
        template.configuration, 
        {}
      );
      
      const packageJson = await fs.readJson(path.join(targetDir, 'package.json'));
      
      if (template.scripts) {
        for (const [scriptName, scriptCommand] of Object.entries(template.scripts)) {
          expect(packageJson.scripts[scriptName]).toBe(scriptCommand);
        }
      }
    });
  });

  describe('Template Validation', () => {
    test('should have valid JavaScript in all template files', async () => {
      for (const template of templateManager.availableTemplates.values()) {
        const configPath = path.join(template.path, 'template.config.js');
        
        // Should be able to require without syntax errors
        expect(() => require(configPath)).not.toThrow();
        
        const config = require(configPath);
        
        // Validate required properties
        expect(typeof config.name).toBe('string');
        expect(typeof config.description).toBe('string');
        expect(typeof config.deploymentMode).toBe('string');
        expect(Array.isArray(config.features)).toBe(true);
        expect(typeof config.configuration).toBe('object');
      }
    });

    test('should have consistent template structure', async () => {
      const expectedProperties = ['name', 'description', 'deploymentMode', 'features', 'configuration'];
      
      for (const template of templateManager.availableTemplates.values()) {
        for (const prop of expectedProperties) {
          expect(template).toHaveProperty(prop);
        }
      }
    });
  });

  describe('Template Performance', () => {
    test('should load templates quickly', async () => {
      const TemplateManager = require(path.join(__dirname, '..', '..', 'lib', 'templates', 'manager.js'));
      const newManager = new TemplateManager();
      
      const start = Date.now();
      await newManager.loadTemplates();
      const loadTime = Date.now() - start;
      
      expect(loadTime).toBeLessThan(2000); // Should load in under 2 seconds
      expect(newManager.availableTemplates.size).toBe(3);
    });

    test('should apply templates efficiently', async () => {
      const template = templateManager.availableTemplates.get('basic');
      const targetDir = path.join(tempDir.name, 'perf-test');
      const projectName = 'perf-test';
      
      const start = Date.now();
      await templateManager.applyTemplate(template, targetDir, projectName);
      const applyTime = Date.now() - start;
      
      // Template application should be reasonably fast
      expect(applyTime).toBeLessThan(15000); // 15 seconds for file operations
      expect(await fs.pathExists(targetDir)).toBe(true);
    }, 30000);
  });
});

describe('🔧 Auto-Setup Integration', () => {
  test('should detect first-run conditions', async () => {
    const { AutoSetup } = require(path.join(__dirname, '..', '..', 'lib', 'startup', 'auto-setup.js'));
    const testDir = path.join(tempDir.name, 'auto-setup-test');
    await fs.ensureDir(testDir);
    
    const autoSetup = new AutoSetup({
      projectRoot: testDir,
      verbose: false
    });
    
    const state = await autoSetup.checkFirstRun();
    
    expect(state).toBeDefined();
    expect(typeof state.isFirstRun).toBe('boolean');
    expect(typeof state.needsMigration).toBe('boolean');
    expect(typeof state.needsConfiguration).toBe('boolean');
  });

  test('should generate proper configuration files', async () => {
    const { AutoSetup } = require(path.join(__dirname, '..', '..', 'lib', 'startup', 'auto-setup.js'));
    const testDir = path.join(tempDir.name, 'config-test');
    await fs.ensureDir(testDir);
    
    const autoSetup = new AutoSetup({
      projectRoot: testDir,
      skipPrompts: true
    });
    
    await autoSetup.generateConfiguration();
    
    const envPath = path.join(testDir, '.env');
    expect(await fs.pathExists(envPath)).toBe(true);
    
    const envContent = await fs.readFile(envPath, 'utf8');
    expect(envContent).toContain('DEPLOYMENT_MODE=');
    expect(envContent).toContain('DATABASE_TYPE=');
  });
});