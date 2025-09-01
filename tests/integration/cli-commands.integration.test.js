/**
 * CLI Commands Integration Tests
 * 🦙 Test all autollama CLI commands work properly
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

describe('🦙 CLI Commands Integration', () => {
  const cliPath = path.join(__dirname, '..', '..', 'bin', 'autollama.js');
  
  beforeAll(() => {
    // Ensure CLI script exists and is executable
    expect(fs.pathExistsSync(cliPath)).toBe(true);
  });

  describe('Help and Version Commands', () => {
    test('should show help information', () => {
      const output = execSync(`node ${cliPath} --help`, { encoding: 'utf8' });
      
      expect(output).toContain('AutoLlama - Modern JavaScript-first RAG framework');
      expect(output).toContain('Commands:');
      expect(output).toContain('dev');
      expect(output).toContain('migrate');
      expect(output).toContain('test');
      expect(output).toContain('deploy');
      expect(output).toContain('status');
    });

    test('should show version', () => {
      const output = execSync(`node ${cliPath} --version`, { encoding: 'utf8' });
      expect(output.trim()).toBe('3.0.0');
    });
  });

  describe('Command Availability', () => {
    const commands = ['dev', 'migrate', 'test', 'deploy', 'status', 'doctor', 'config'];
    
    test.each(commands)('should provide help for %s command', (command) => {
      const output = execSync(`node ${cliPath} ${command} --help`, { encoding: 'utf8' });
      expect(output).toContain(command);
      expect(output).toContain('Usage:');
    });
  });

  describe('Configuration Commands', () => {
    test('config command should show current configuration', () => {
      const output = execSync(`node ${cliPath} config --show`, { encoding: 'utf8' });
      // Should complete without error
      expect(typeof output).toBe('string');
    });
  });

  describe('Status Commands', () => {
    test('status command should check service status', () => {
      const output = execSync(`node ${cliPath} status`, { encoding: 'utf8' });
      // Should complete without error and show some status information
      expect(typeof output).toBe('string');
    });
  });

  describe('Doctor Commands', () => {
    test('doctor command should run diagnostics', () => {
      const output = execSync(`node ${cliPath} doctor`, { encoding: 'utf8' });
      // Should complete without error
      expect(typeof output).toBe('string');
    });
  });

  describe('Service Management', () => {
    test('service command should list available services', () => {
      const output = execSync(`node ${cliPath} service list`, { encoding: 'utf8' });
      expect(typeof output).toBe('string');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid commands gracefully', () => {
      try {
        execSync(`node ${cliPath} invalid-command`, { encoding: 'utf8', stdio: 'pipe' });
      } catch (error) {
        expect(error.status).toBe(1);
        expect(error.stderr.toString()).toContain('error');
      }
    });

    test('should handle missing arguments gracefully', () => {
      try {
        execSync(`node ${cliPath} service`, { encoding: 'utf8', stdio: 'pipe' });
      } catch (error) {
        // Should fail gracefully with helpful error message
        expect(error.status).toBe(1);
      }
    });
  });

  describe('Command Chaining', () => {
    test('should support multiple commands in sequence', () => {
      // Test that commands can be run in sequence without conflicts
      const commands = [
        `node ${cliPath} --version`,
        `node ${cliPath} status`,
        `node ${cliPath} config --show`
      ];
      
      for (const command of commands) {
        const output = execSync(command, { encoding: 'utf8' });
        expect(typeof output).toBe('string');
      }
    });
  });

  describe('Environment Detection', () => {
    test('should detect environment properly', () => {
      const output = execSync(`node ${cliPath} doctor`, { encoding: 'utf8' });
      // Doctor command should detect Node.js and other tools
      expect(output).toBeTruthy();
    });
  });

  describe('Verbose Mode', () => {
    test('should support verbose flag', () => {
      const output = execSync(`node ${cliPath} --verbose status`, { encoding: 'utf8' });
      expect(typeof output).toBe('string');
    });
  });
});

describe('🚀 CLI Performance', () => {
  const cliPath = path.join(__dirname, '..', '..', 'bin', 'autollama.js');

  test('help command should be fast', () => {
    const start = Date.now();
    execSync(`node ${cliPath} --help`, { encoding: 'utf8' });
    const duration = Date.now() - start;
    
    // Help should be nearly instantaneous
    expect(duration).toBeLessThan(2000);
  });

  test('version command should be very fast', () => {
    const start = Date.now();
    execSync(`node ${cliPath} --version`, { encoding: 'utf8' });
    const duration = Date.now() - start;
    
    // Version should be under 1 second
    expect(duration).toBeLessThan(1000);
  });
});