const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const K6_SCRIPT = path.join(__dirname, '..', 'perf', 'loadtest.k6.js');

function isK6Available() {
  try {
    execFileSync('k6', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runK6({ targetUrl, tokensFile, vus, durationSeconds }) {
  return new Promise((resolve, reject) => {
    const summaryPath = path.join(os.tmpdir(), `k6-summary-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const args = [
      'run',
      '--summary-export', summaryPath,
      '--summary-trend-stats', 'avg,min,med,max,p(50),p(95),p(99)',
      '--env', `TARGET_URL=${targetUrl}`,
      '--env', `TOKENS_FILE=${tokensFile}`,
      '--env', `VUS=${vus}`,
      '--env', `DURATION=${durationSeconds}s`,
      '--quiet',
      K6_SCRIPT,
    ];

    execFile('k6', args, { maxBuffer: 1024 * 1024 * 64 }, (err) => {
      // k6 exits non-zero when a threshold fails but in this case it isdeliberate
      // no-op (rate<1.0), so a nonzero exit here means something else
      // actually went wrong; still try to read the summary either way
      // since k6 writes it before exiting.
      try {
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        fs.unlink(summaryPath, () => {});
        resolve(summary);
      } catch (parseErr) {
        reject(err || parseErr);
      }
    });
  });
}


function normalizeK6Summary(summary, concurrency) {
  const m = summary.metrics || {};
  const duration = m.http_req_duration || {};
  const reqs = m.http_reqs || {};
  const failed = m.http_req_failed || {};
  const blockedMetric = m.gateway_blocked_responses;
  const blockedByGatewayCount = typeof blockedMetric?.count === 'number' ? blockedMetric.count : 0;

  return {
    concurrency,
    requestCount: reqs.count || 0,
    throughputRps: reqs.rate || 0,
    errorCount: Math.round((failed.value || 0) * (reqs.count || 0)), // network-level failures only
    blockedByGatewayCount, // 403/429 - separate from errorCount; see loadtest.k6.js
    p50LatencyMs: duration['p(50)'] ?? null,
    p95LatencyMs: duration['p(95)'] ?? null,
    p99LatencyMs: duration['p(99)'] ?? null,
    meanLatencyMs: duration.avg ?? null,
  };
}

module.exports = { isK6Available, runK6, normalizeK6Summary };
