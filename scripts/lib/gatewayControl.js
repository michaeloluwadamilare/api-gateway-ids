const { execFile } = require('child_process');
const path = require('path');
const { sleep } = require('./httpClient');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: REPO_ROOT, env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${cmd} ${args.join(' ')} failed: ${stderr || err.message}`));
      resolve(stdout);
    });
  });
}


async function setGatewayConfig({ gatewayMode = 'adaptive', disabledRules = '', runLabel = '' } = {}) {
  await run('docker', ['compose', 'up', '-d', 'gateway'], {
    GATEWAY_MODE: gatewayMode,
    DISABLED_RULES: disabledRules,
    EXPERIMENT_RUN_LABEL: runLabel,
    TRUST_PROXY: 'true',
  });
  await waitForHealthy();
}

async function waitForHealthy(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${process.env.GATEWAY_URL || 'http://localhost:8080'}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error('gateway did not become healthy in time');
}

async function flushState() {
  await run('docker', ['compose', 'exec', '-T', 'redis', 'redis-cli', 'FLUSHALL'], {});
}

module.exports = { setGatewayConfig, waitForHealthy, flushState };
