/**
 * AutoLlama v3.0 Modernization Tests
 * 🦙 Validate the JavaScript-first framework transformation
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

describe('🦙 AutoLlama v3.0 Modernization', () => {
  const projectRoot = path.join(__dirname, '..');

  describe('NPX Package Configuration', () => {
    test('should have proper bin configuration for npx', async () => {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      const packageJson = require(packageJsonPath);
      
      expect(packageJson.version).toBe('3.0.0');
      expect(packageJson.bin).toBeDefined();
      expect(packageJson.bin['create-autollama']).toBe('./bin/create-autollama.js');
      expect(packageJson.bin['autollama']).toBe('./bin/autollama.js');
    });

    test('should have executable CLI scripts', async () => {
      const createScript = path.join(projectRoot, 'bin/create-autollama.js');
      const cliScript = path.join(projectRoot, 'bin/autollama.js');
      
      expect(await fs.pathExists(createScript)).toBe(true);
      expect(await fs.pathExists(cliScript)).toBe(true);
      
      // Check executable permissions
      const createStats = await fs.stat(createScript);
      const cliStats = await fs.stat(cliScript);
      
      expect(createStats.mode & parseInt('111', 8)).toBeGreaterThan(0);
      expect(cliStats.mode & parseInt('111', 8)).toBeGreaterThan(0);
    });
  });

  describe('Template System Architecture', () => {
    test('should have template directories', async () => {
      const templatesDir = path.join(projectRoot, 'templates');
      expect(await fs.pathExists(templatesDir)).toBe(true);
      
      const templates = await fs.readdir(templatesDir);
      expect(templates).toContain('basic');
      expect(templates).toContain('advanced');
      expect(templates).toContain('custom');
    });

    test('should have template configurations', async () => {
      const templates = ['basic', 'advanced', 'custom'];
      
      for (const template of templates) {
        const configPath = path.join(projectRoot, 'templates', template, 'template.config.js');
        expect(await fs.pathExists(configPath)).toBe(true);
        
        const config = require(configPath);
        expect(config.name).toBeDefined();
        expect(config.deploymentMode).toBeDefined();
        expect(config.features).toBeInstanceOf(Array);
      }
    });
  });

  describe('Database Abstraction Layer', () => {
    test('should have database manager module', async () => {
      const dbManagerPath = path.join(projectRoot, 'lib/database/index.js');
      expect(await fs.pathExists(dbManagerPath)).toBe(true);
    });

    test('should have database adapters', async () => {
      const adaptersDir = path.join(projectRoot, 'lib/database/adapters');
      expect(await fs.pathExists(adaptersDir)).toBe(true);
      
      const sqliteAdapter = path.join(adaptersDir, 'sqlite.js');
      const postgresAdapter = path.join(adaptersDir, 'postgresql.js');
      
      expect(await fs.pathExists(sqliteAdapter)).toBe(true);
      expect(await fs.pathExists(postgresAdapter)).toBe(true);
    });
  });

  describe('Service Orchestration', () => {
    test('should have service manager', async () => {
      const managerPath = path.join(projectRoot, 'lib/services/manager.js');
      expect(await fs.pathExists(managerPath)).toBe(true);
    });

    test('should have orchestrator', async () => {
      const orchestratorPath = path.join(projectRoot, 'lib/services/orchestrator.js');
      expect(await fs.pathExists(orchestratorPath)).toBe(true);
    });

    test('should have embedded Qdrant service', async () => {
      const qdrantPath = path.join(projectRoot, 'lib/services/qdrant-embedded.js');
      expect(await fs.pathExists(qdrantPath)).toBe(true);
    });
  });

  describe('Migration System', () => {
    test('should have migration runner', async () => {
      const runnerPath = path.join(projectRoot, 'lib/migrations/migration-runner.js');
      expect(await fs.pathExists(runnerPath)).toBe(true);
    });

    test('should have initial migration files', async () => {
      const migrationsDir = path.join(projectRoot, 'migrations');
      expect(await fs.pathExists(migrationsDir)).toBe(true);
      
      const initialMigration = path.join(migrationsDir, '001_initial_schema.js');
      expect(await fs.pathExists(initialMigration)).toBe(true);
    });
  });

  describe('Auto-Setup System', () => {
    test('should have auto-setup module', async () => {
      const autoSetupPath = path.join(projectRoot, 'lib/startup/auto-setup.js');
      expect(await fs.pathExists(autoSetupPath)).toBe(true);
    });
  });

  describe('CLI Command System', () => {
    test('should have command modules', async () => {
      const commandsDir = path.join(projectRoot, 'lib/commands');
      expect(await fs.pathExists(commandsDir)).toBe(true);
      
      const commands = ['dev.js', 'migrate.js', 'test.js', 'deploy.js', 'status.js'];
      
      for (const command of commands) {
        const commandPath = path.join(commandsDir, command);
        expect(await fs.pathExists(commandPath)).toBe(true);
      }
    });
  });

  describe('Backward Compatibility', () => {
    test('should preserve Docker deployment', async () => {
      const dockerCompose = path.join(projectRoot, 'docker-compose.yaml');
      expect(await fs.pathExists(dockerCompose)).toBe(true);
      
      const packageJson = require(path.join(projectRoot, 'package.json'));
      expect(packageJson.scripts['docker:up']).toBeDefined();
      expect(packageJson.scripts['docker:start']).toBeDefined();
    });

    test('should maintain existing API structure', async () => {
      const apiDir = path.join(projectRoot, 'api');
      expect(await fs.pathExists(apiDir)).toBe(true);
      
      const routesDir = path.join(apiDir, 'src/routes');
      expect(await fs.pathExists(routesDir)).toBe(true);
    });
  });

  describe('Package Dependencies', () => {
    test('should have required CLI dependencies', () => {
      const packageJson = require(path.join(projectRoot, 'package.json'));
      
      const requiredDeps = [
        'chalk',
        'commander', 
        'inquirer',
        'ora',
        'fs-extra',
        'dotenv'
      ];
      
      for (const dep of requiredDeps) {
        expect(packageJson.dependencies[dep]).toBeDefined();
      }
    });

    test('should have database adapters', () => {
      const packageJson = require(path.join(projectRoot, 'package.json'));
      
      expect(packageJson.dependencies['pg']).toBeDefined();
      expect(packageJson.dependencies['sqlite3']).toBeDefined();
    });
  });

  describe('Installation Performance', () => {
    test('should have minimal dependency count for fast installation', () => {
      const packageJson = require(path.join(projectRoot, 'package.json'));
      
      const depCount = Object.keys(packageJson.dependencies).length;
      const devDepCount = Object.keys(packageJson.devDependencies).length;
      
      // Ensure reasonable dependency count for fast installation
      expect(depCount).toBeLessThan(15);
      expect(devDepCount).toBeLessThan(10);
    });

    test('should have workspaces configuration for monorepo', () => {
      const packageJson = require(path.join(projectRoot, 'package.json'));
      
      expect(packageJson.workspaces).toBeDefined();
      expect(packageJson.workspaces).toContain('api');
      expect(packageJson.workspaces).toContain('config/react-frontend');
    });
  });

  describe('Configuration Management', () => {
    test('should support multiple deployment modes', async () => {
      const basicTemplate = require(path.join(projectRoot, 'templates/basic/template.config.js'));
      const advancedTemplate = require(path.join(projectRoot, 'templates/advanced/template.config.js'));
      
      expect(basicTemplate.deploymentMode).toBe('local');
      expect(advancedTemplate.deploymentMode).toBe('hybrid');
    });
  });
});

describe('🚀 Installation Speed Benchmarks', () => {
  test('should complete basic setup components quickly', () => {
    const start = Date.now();
    
    // Test that all critical files exist (simulating installation check)
    const criticalFiles = [
      'package.json',
      'bin/create-autollama.js',
      'bin/autollama.js',
      'lib/database/index.js',
      'lib/services/orchestrator.js',
      'lib/startup/auto-setup.js',
      'templates/basic/template.config.js'
    ];
    
    for (const file of criticalFiles) {
      const filePath = path.join(__dirname, '..', file);
      expect(fs.pathExistsSync(filePath)).toBe(true);
    }
    
    const duration = Date.now() - start;
    
    // File checking should be nearly instantaneous
    expect(duration).toBeLessThan(100);
  });
});