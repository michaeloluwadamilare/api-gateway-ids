const fs = require('fs');
const os = require('os');
const path = require('path');

const { GATEWAY_URL, BACKEND_URL } = require('./lib/config');
const { setGatewayConfig, flushState } = require('./lib/gatewayControl');
const { loadTest } = require('./lib/loadGenerator');
const { sampleOverWindow } = require('./lib/dockerStats');
const { isK6Available, runK6, normalizeK6Summary } = require('./lib/k6Runner');
const { latencyPercentile, mean, stddev, median, percentile } = require('./lib/metrics');
const { captureRunMetadata } = require('./lib/runMetadata');
const { mintPerfTokens } = require('./perf/mintTokens');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const TOKEN_POOL_SIZE = Number(process.env.PERF_TOKEN_POOL_SIZE || 500);

const PERFORMANCE_ARMS = [
  { id: 'A', label: 'unprotected (direct backend)', baseUrl: BACKEND_URL, gatewayConfig: null, containerName: 'api-ids-backend' },
  {
    id: 'gateway-bare',
    label: 'gateway, all 5 rules disabled (proxy + composite-state overhead only, no crypto)',
    baseUrl: GATEWAY_URL,
    gatewayConfig: { gatewayMode: 'static', disabledRules: 'R1,R2,R3,R4,R5', runLabel: 'perf-gateway-bare' },
    containerName: 'api-ids-gateway',
  },
  {
    id: 'gateway-jwt',
    label: 'gateway, only R2 enabled (adds real RS256 verification)',
    baseUrl: GATEWAY_URL,
    gatewayConfig: { gatewayMode: 'static', disabledRules: 'R1,R3,R4,R5', runLabel: 'perf-gateway-jwt' },
    containerName: 'api-ids-gateway',
  },
  {
    id: 'B',
    label: 'static mode, all rules enabled (adds static rule evaluation)',
    baseUrl: GATEWAY_URL,
    gatewayConfig: { gatewayMode: 'static', disabledRules: '', runLabel: 'perf-B' },
    containerName: 'api-ids-gateway',
  },
  {
    id: 'C',
    label: 'adaptive mode, all rules enabled (adds scoring/tier-engine)',
    baseUrl: GATEWAY_URL,
    gatewayConfig: { gatewayMode: 'adaptive', disabledRules: '', runLabel: 'perf-C' },
    containerName: 'api-ids-gateway',
  },
];


function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function runOnce({ useK6, baseUrl, concurrency, durationMs, tokensFile, tokenStrings, containerName }) {
  if (useK6) {
    const [summary, stats] = await Promise.all([
      runK6({ targetUrl: baseUrl, tokensFile, vus: concurrency, durationSeconds: Math.round(durationMs / 1000) }),
      containerName ? sampleOverWindow(containerName, durationMs) : Promise.resolve(null),
    ]);
    return { ...normalizeK6Summary(summary, concurrency), engine: 'k6', cpu: stats };
  }
  const [loadResult, stats] = await Promise.all([
    loadTest(`${baseUrl}/api/accounts/1`, tokenStrings, { concurrency, durationMs }),
    containerName ? sampleOverWindow(containerName, durationMs) : Promise.resolve(null),
  ]);
  return {
    concurrency,
    requestCount: loadResult.requestCount,
    throughputRps: loadResult.throughputRps,
    errorCount: loadResult.errorCount,
    blockedByGatewayCount: loadResult.blockedByGatewayCount,
    p50LatencyMs: latencyPercentile(loadResult.observations, 50),
    p95LatencyMs: latencyPercentile(loadResult.observations, 95),
    p99LatencyMs: latencyPercentile(loadResult.observations, 99),
    meanLatencyMs: mean(loadResult.observations.map((o) => o.latencyMs)),
    engine: 'node-fallback',
    cpu: stats,
  };
}


async function runArmAtConcurrency(ctx, concurrency) {
  const { useK6, baseUrl, durationMs, warmupMs, repeatCount, tokensFile, tokenStrings, containerName } = ctx;

  if (warmupMs > 0) {
    await runOnce({ useK6, baseUrl, concurrency, durationMs: warmupMs, tokensFile, tokenStrings, containerName: null });
  }

  const reps = [];
  for (let i = 0; i < repeatCount; i++) {
    reps.push(await runOnce({ useK6, baseUrl, concurrency, durationMs, tokensFile, tokenStrings, containerName }));
  }

  const throughputValues = reps.map((r) => r.throughputRps);
  const p50Values = reps.map((r) => r.p50LatencyMs);
  const p95Values = reps.map((r) => r.p95LatencyMs);
  const cpuValues = reps.map((r) => r.cpu?.meanCpuPercent).filter((v) => typeof v === 'number');
  const totalBlocked = reps.reduce((sum, r) => sum + (r.blockedByGatewayCount ?? 0), 0);

  return {
    concurrency,
    repeatCount,
    throughputRpsMedian: median(throughputValues),
    throughputRpsIqr: [percentile(throughputValues, 25), percentile(throughputValues, 75)],
    throughputRpsMean: mean(throughputValues),
    throughputRpsStddev: stddev(throughputValues),
    p50LatencyMsMedian: median(p50Values),
    p95LatencyMsMedian: median(p95Values),
    p95LatencyMsIqr: [percentile(p95Values, 25), percentile(p95Values, 75)],
    p95LatencyMsMean: mean(p95Values),
    p95LatencyMsStddev: stddev(p95Values),
    meanCpuPercentMedian: cpuValues.length ? median(cpuValues) : null,
    totalBlockedByGatewayCount: totalBlocked,
    repetitions: reps,
  };
}

async function main() {
  const concurrencyLevels = (process.env.CONCURRENCY_LEVELS || '1,5,10,25')
    .split(',')
    .map((v) => Number(v.trim()));
  const durationMs = Number(process.env.LOAD_DURATION_MS || 30000);
  const warmupMs = Number(process.env.LOAD_WARMUP_MS || 5000);
  const repeatCount = Number(process.env.LOAD_REPEAT_COUNT || 3);

  const useK6 = isK6Available();
  console.log(useK6 ? 'k6 detected - using it as the load-generation engine (Table 4).' : 'k6 not found - falling back to the Node load generator. Install with `brew install k6` for the real thing.');
  console.log(`Each (arm, concurrency) point: ${warmupMs}ms warm-up (discarded) + ${repeatCount} x ${durationMs}ms repetitions. Arm order is randomized within each concurrency level.`);

  console.log(`Minting ${TOKEN_POOL_SIZE} synthetic identities so no single composite identity trips R3 during the sweep...`);
  const tokens = mintPerfTokens(TOKEN_POOL_SIZE);
  const tokensFile = path.join(os.tmpdir(), `perf-tokens-${Date.now()}.json`);
  fs.writeFileSync(tokensFile, JSON.stringify(tokens));
  const tokenStrings = tokens.map((t) => t.token);

  const report = {
    generatedAt: new Date().toISOString(),
    engine: useK6 ? 'k6' : 'node-fallback',
    concurrencyLevels,
    durationMs,
    warmupMs,
    repeatCount,
    tokenPoolSize: TOKEN_POOL_SIZE,
    cpuLimit: '2.0 cores per container (docker-compose.yml cpus:)',
    armOrderRandomizedPerConcurrencyLevel: true,
    arms: PERFORMANCE_ARMS.map((arm) => ({ id: arm.id, label: arm.label, points: [] })),
  };
  const armById = Object.fromEntries(report.arms.map((a) => [a.id, a]));

  try {
    for (const c of concurrencyLevels) {
      const order = shuffle(PERFORMANCE_ARMS);
      console.log(`\n=== Concurrency ${c} - arm order: ${order.map((a) => a.id).join(', ')} ===`);

      for (const arm of order) {
        let runMetadata;
        if (arm.gatewayConfig) {
          await setGatewayConfig(arm.gatewayConfig);
          await flushState(); // every point starts every identity at T1
          runMetadata = captureRunMetadata({ armId: arm.id, concurrency: c });
        } else {
          runMetadata = { capturedAt: new Date().toISOString(), note: 'no gateway in this arm - direct backend' };
        }

        const point = await runArmAtConcurrency(
          { useK6, baseUrl: arm.baseUrl, durationMs, warmupMs, repeatCount, tokensFile, tokenStrings, containerName: arm.containerName },
          c
        );
        point.runMetadata = runMetadata;

        console.log(
          `  ${arm.id} @ concurrency=${c}: throughput median=${point.throughputRpsMedian?.toFixed(1)}rps (IQR ${point.throughputRpsIqr.map((v) => v?.toFixed(1))}) p95 median=${point.p95LatencyMsMedian?.toFixed(1)}ms cpu median=${point.meanCpuPercentMedian?.toFixed(1)}% blocked=${point.totalBlockedByGatewayCount}`
        );
        if (point.totalBlockedByGatewayCount > 0) {
          console.warn(
            `    ! ${point.totalBlockedByGatewayCount} requests were blocked by the gateway at this concurrency - the token pool (${TOKEN_POOL_SIZE}) may be too small for this throughput. Raise PERF_TOKEN_POOL_SIZE and re-run before trusting this point's latency figures.`
          );
        }

        armById[arm.id].points.push(point);
      }
    }
  } finally {
    fs.unlink(tokensFile, () => {});
  }

  // points were pushed in concurrency-sweep order, not necessarily sorted
  // sort each arm's points by concurrency for a readable report
  for (const arm of report.arms) {
    arm.points.sort((a, b) => a.concurrency - b.concurrency);
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `performance-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nPerformance report written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
