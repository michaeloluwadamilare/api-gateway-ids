const { execFileSync } = require('child_process');
const path = require('path');


const SCORING_ENV_VARS = [
  'GATEWAY_MODE', 'DISABLED_RULES', 'EXPERIMENT_RUN_LABEL',
  'R1_WEIGHT', 'R2_WEIGHT', 'R3_WEIGHT', 'R4_BASE_WEIGHT', 'R5_WEIGHT',
  'R3_WINDOW_SECONDS', 'R3_THRESHOLD',
  'R4_WINDOW_SECONDS', 'R4_THRESHOLD', 'R4_EXPONENTIAL_FACTOR',
  'TIER1_MAX', 'TIER2_MAX', 'TIER3_MAX',
  'BLOCKLIST_TTL_SECONDS', 'T2_DELAY_MS', 'T3_FORWARD_RATIO', 'T3_DELAY_MS',
];

function gitShortHash() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: path.join(__dirname, '..', '..'),
    }).toString().trim();
  } catch {
    return null;
  }
}

function readLiveGatewayEnv(containerName = 'api-ids-gateway') {
  try {
    const raw = execFileSync('docker', ['inspect', containerName, '--format', '{{json .Config.Env}}']).toString();
    const envList = JSON.parse(raw); // ["KEY=VALUE", ...]
    const env = {};
    for (const entry of envList) {
      const idx = entry.indexOf('=');
      if (idx === -1) continue;
      env[entry.slice(0, idx)] = entry.slice(idx + 1);
    }
    return env;
  } catch (err) {
    return { _error: `could not read live gateway env: ${err.message}` };
  }
}


function captureRunMetadata(extra = {}) {
  const liveEnv = readLiveGatewayEnv();
  const scoringEnv = {};
  for (const key of SCORING_ENV_VARS) {
    scoringEnv[key] = liveEnv[key] ?? null;
  }

  return {
    capturedAt: new Date().toISOString(),
    gitCommit: gitShortHash(),
    liveGatewayConfig: scoringEnv,
    ...extra,
  };
}

module.exports = { captureRunMetadata };
