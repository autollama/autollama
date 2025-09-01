/**
 * Preflight Stage - System Requirements Check
 */

const { sectionHeader, logger, createTable, colors } = require('../../../utils/brand');
const { runSystemCheck, getSystemInfo } = require('../../../utils/system');

async function preflightStage(state, options = {}) {
  sectionHeader('System Requirements');
  
  // Run comprehensive system check
  logger.step('Checking system requirements...');
  const systemCheck = await runSystemCheck();
  
  // Store system check results
  await state.setSystemCheck(systemCheck);
  
  // Display results in a clean table
  displaySystemCheckResults(systemCheck);
  
  // Handle any critical failures
  const criticalIssues = await handleCriticalIssues(systemCheck, state);
  
  if (criticalIssues.length > 0) {
    throw new Error(`Critical system requirements not met: ${criticalIssues.join(', ')}`);
  }
  
  // Display system info
  await displaySystemInfo();
  
  // Complete preflight stage
  await state.completeStage('preflight', {
    systemCheck,
    timestamp: Date.now(),
    passed: systemCheck.overall.valid
  });
  
  if (systemCheck.overall.valid) {
    logger.success('All system requirements met');
  } else {
    logger.warning('Some requirements failed - setup will continue with warnings');
  }
}

function displaySystemCheckResults(systemCheck) {
  const requirements = [
    ['Requirement', 'Status', 'Version/Info'],
    ['Node.js', formatStatus(systemCheck.node), systemCheck.node.version || 'N/A'],
    ['Docker', formatStatus(systemCheck.docker), formatDockerInfo(systemCheck.docker)],
    ['Memory', formatStatus(systemCheck.memory), `${systemCheck.memory.total} GB total`],
    ['Disk Space', formatStatus(systemCheck.disk), systemCheck.disk.available || 'Unknown'],
    ['Network', formatStatus(systemCheck.network), systemCheck.network.valid ? 'Connected' : 'Limited']
  ];
  
  console.log(createTable(requirements[0], requirements.slice(1)));
}

function formatStatus(check) {
  if (check.valid && (!check.hasOwnProperty('running') || check.running)) {
    return '✓ Pass';
  } else if (check.valid && check.hasOwnProperty('running') && !check.running) {
    return '⚠ Available';
  } else {
    return '✗ Fail';
  }
}

function formatDockerInfo(dockerCheck) {
  if (!dockerCheck.valid) {
    return 'Not installed';
  }
  if (!dockerCheck.running) {
    return `${dockerCheck.version} (not running)`;
  }
  return dockerCheck.version;
}

async function handleCriticalIssues(systemCheck, state) {
  const criticalIssues = [];
  const warnings = [];
  
  // Node.js version check
  if (!systemCheck.node.valid) {
    criticalIssues.push('Node.js version too old');
    logger.error(`Node.js ${systemCheck.node.required} required, found ${systemCheck.node.version}`);
  }
  
  // Docker availability (not critical for local mode)
  if (!systemCheck.docker.valid) {
    warnings.push('Docker not available - will use local mode only');
    await state.addWarning('Docker not available', 'preflight');
    logger.warning('Docker not found - some deployment options will be unavailable');
  } else if (!systemCheck.docker.running) {
    warnings.push('Docker daemon not running');
    await state.addWarning('Docker daemon not running', 'preflight');
    logger.warning('Docker found but not running - start Docker to enable all features');
  }
  
  // Memory check (warning only)
  if (!systemCheck.memory.valid) {
    warnings.push('Low memory detected');
    await state.addWarning(`Low memory: ${systemCheck.memory.total}GB`, 'preflight');
    logger.warning(`Low memory detected: ${systemCheck.memory.total}GB (4GB+ recommended)`);
  }
  
  // Network check (warning only)
  if (!systemCheck.network.valid) {
    warnings.push('Network connectivity issues');
    await state.addWarning('Network connectivity limited', 'preflight');
    logger.warning('Limited network connectivity - some features may not work');
  }
  
  // Display summary
  if (warnings.length > 0) {
    console.log();
    logger.info(`${warnings.length} warning(s) detected:`);
    warnings.forEach(warning => {
      console.log(colors.muted(`  • ${warning}`));
    });
  }
  
  return criticalIssues;
}

async function displaySystemInfo() {
  const systemInfo = getSystemInfo();
  
  console.log();
  logger.info('System Information:');
  console.log(colors.muted(`  Platform: ${systemInfo.platform} (${systemInfo.arch})`));
  console.log(colors.muted(`  CPUs: ${systemInfo.cpus} cores`));
  console.log(colors.muted(`  Uptime: ${systemInfo.uptime} hours`));
}

// Provide specific recommendations based on system check
function getRecommendations(systemCheck) {
  const recommendations = [];
  
  if (!systemCheck.docker.valid) {
    recommendations.push({
      type: 'info',
      title: 'Docker Installation',
      description: 'Install Docker to enable containerized deployment',
      action: 'Visit https://docker.com/get-started'
    });
  }
  
  if (!systemCheck.docker.running && systemCheck.docker.valid) {
    recommendations.push({
      type: 'action',
      title: 'Start Docker',
      description: 'Start Docker daemon to enable all deployment options',
      action: 'Run: sudo systemctl start docker'
    });
  }
  
  if (!systemCheck.memory.valid) {
    recommendations.push({
      type: 'warning',
      title: 'Memory Optimization',
      description: 'Consider closing other applications to free memory',
      action: 'AutoLlama will use reduced memory settings'
    });
  }
  
  return recommendations;
}

module.exports = { preflightStage };