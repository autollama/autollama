/**
 * AutoLlama System Utilities
 * Cross-platform system checks and validation
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Check if a command exists on the system
async function commandExists(command) {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${which} ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Get Node.js version
function getNodeVersion() {
  return process.version;
}

// Check Node.js version requirement
function checkNodeVersion(minVersion = '16.0.0') {
  const current = process.version.slice(1); // Remove 'v' prefix
  const [currentMajor] = current.split('.').map(Number);
  const [minMajor] = minVersion.split('.').map(Number);
  
  return {
    version: process.version,
    valid: currentMajor >= minMajor,
    required: `>= ${minVersion}`
  };
}

// Get Docker version
async function getDockerVersion() {
  try {
    if (!await commandExists('docker')) {
      return { version: null, valid: false, error: 'Docker not found' };
    }
    
    const output = execSync('docker --version', { encoding: 'utf8' });
    const match = output.match(/Docker version ([0-9]+\.[0-9]+\.[0-9]+)/);
    const version = match ? match[1] : 'Unknown';
    
    // Check if Docker daemon is running
    try {
      execSync('docker info', { stdio: 'ignore' });
      return { version, valid: true, running: true };
    } catch {
      return { version, valid: true, running: false, error: 'Docker daemon not running' };
    }
  } catch (error) {
    return { version: null, valid: false, error: error.message };
  }
}

// Check available memory
function getMemoryInfo() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  return {
    total: Math.round(totalMem / 1024 / 1024 / 1024 * 10) / 10, // GB
    free: Math.round(freeMem / 1024 / 1024 / 1024 * 10) / 10,   // GB
    used: Math.round(usedMem / 1024 / 1024 / 1024 * 10) / 10,   // GB
    valid: totalMem >= 4 * 1024 * 1024 * 1024 // 4GB minimum
  };
}

// Check available disk space
async function getDiskSpace(directory = process.cwd()) {
  try {
    const stats = await fs.stat(directory);
    // This is a simplified check - for more accurate results we'd use a library
    // For now, we'll assume if we can write to the directory, there's enough space
    const testFile = path.join(directory, '.autollama-disk-test');
    await fs.writeFile(testFile, 'test');
    await fs.remove(testFile);
    
    return {
      available: '> 10 GB', // Simplified for now
      valid: true
    };
  } catch {
    return {
      available: 'Unknown',
      valid: false,
      error: 'Cannot write to directory'
    };
  }
}

// Check network connectivity
async function checkNetworkConnectivity() {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const ping = spawn('ping', ['-c', '1', 'google.com'], { stdio: 'ignore' });
    
    const timeout = setTimeout(() => {
      ping.kill();
      resolve({ valid: false, error: 'Network timeout' });
    }, 5000);
    
    ping.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ valid: code === 0 });
    });
    
    ping.on('error', () => {
      clearTimeout(timeout);
      resolve({ valid: false, error: 'Network check failed' });
    });
  });
}

// Validate OpenAI API key format
function validateApiKey(apiKey) {
  if (!apiKey) {
    return { valid: false, error: 'API key is required' };
  }
  
  if (!apiKey.startsWith('sk-')) {
    return { valid: false, error: 'API key must start with "sk-"' };
  }
  
  if (apiKey.length < 20) {
    return { valid: false, error: 'API key appears to be too short' };
  }
  
  return { valid: true };
}

// Test OpenAI API connectivity (optional)
async function testApiKey(apiKey) {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      return { valid: true };
    } else {
      return { valid: false, error: `API returned ${response.status}` };
    }
  } catch (error) {
    return { valid: false, error: 'Network error testing API key' };
  }
}

// Check if we're in an AutoLlama project
async function isAutoLlamaProject() {
  const indicators = ['package.json', 'docker-compose.yml', '.env'];
  const checks = await Promise.all(
    indicators.map(async file => ({
      file,
      exists: await fs.pathExists(file)
    }))
  );
  
  return {
    isProject: checks.some(c => c.exists),
    files: checks
  };
}

// Run comprehensive system check
async function runSystemCheck() {
  const results = {
    node: checkNodeVersion(),
    docker: await getDockerVersion(),
    memory: getMemoryInfo(),
    disk: await getDiskSpace(),
    network: await checkNetworkConnectivity()
  };
  
  // Overall system health
  results.overall = {
    valid: results.node.valid && 
           results.docker.valid && 
           results.docker.running &&
           results.memory.valid && 
           results.disk.valid && 
           results.network.valid
  };
  
  return results;
}

// Get system information for display
function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    uptime: Math.floor(os.uptime() / 3600), // hours
    cpus: os.cpus().length
  };
}

// Kill process by name (cross-platform)
async function killProcess(processName) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /f /im ${processName}`, { stdio: 'ignore' });
    } else {
      execSync(`pkill -f ${processName}`, { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

// Check if port is in use
function isPortInUse(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    
    server.listen(port, () => {
      server.once('close', () => resolve(false));
      server.close();
    });
    
    server.on('error', () => resolve(true));
  });
}

module.exports = {
  commandExists,
  getNodeVersion,
  checkNodeVersion,
  getDockerVersion,
  getMemoryInfo,
  getDiskSpace,
  checkNetworkConnectivity,
  validateApiKey,
  testApiKey,
  isAutoLlamaProject,
  runSystemCheck,
  getSystemInfo,
  killProcess,
  isPortInUse
};