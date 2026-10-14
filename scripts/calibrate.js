const fs = require('fs');
const path = require('path');

const { GATEWAY_URL, SEEDED_USERS } = require('./lib/config');
const { setGatewayConfig, flushState } = require('./lib/gatewayControl');
const { runLegitimateBatch } = require('./traffic/legitimateTraffic');
const { runSqlInjection } = require('./attacks/sqlInjection');
const { runRateFlood } = require('./attacks/rateFlood');
const { runJwtManipulation } = require('./attacks/jwtManipulation');
const { runCredentialStuffing } = require('./attacks/credentialStuffing');
const { runBolaEnumeration } = require('./attacks/bolaEnumeration');
const { login } = require('./lib/auth');
const { mean, latencyPercentile } = require('./lib/metrics');
const { captureRunMetadata } = require('./lib/runMetadata');

const RESULTS_DIR = path.join(__dirname, '..', 'results');

function scoreDistribution(observations) {
  const scores = observations.map((o) => o.score).filter((s) => typeof s === 'number');
  const tiers = {};
  for (const o of observations) {
    if (o.tier) tiers[o.tier] = (tiers[o.tier] || 0) + 1;
  }
  return {
    count: observations.length,
    maxScore: scores.length ? Math.max(...scores) : null,
    meanScore: mean(scores),
    tierCounts: tiers,
    blockedCount: observations.filter((o) => o.statusCode === 403 || o.statusCode === 429).length,
  };
}

function requestsToThreshold(observations, ruleId) {
  const idx = observations.findIndex((o) => o.tier && o.tier !== 'T1');
  return idx === -1 ? null : idx + 1;
}

async function runCalibrationRound({ legitimateRequestTotal, runsPerCategory }) {
  console.log(`\n=== Legitimate traffic: ${legitimateRequestTotal} requests across ${SEEDED_USERS.length} seeded users ===`);
  const perUser = Math.ceil(legitimateRequestTotal / SEEDED_USERS.length);
  const legitRuns = await runLegitimateBatch(GATEWAY_URL, SEEDED_USERS, {
    usersCount: SEEDED_USERS.length,
    requestsPerUser: perUser,
    requestsPerSecond: 5,
  });
  const legitObservations = legitRuns.flatMap((r) => r.observations);
  const legitStats = scoreDistribution(legitObservations);
  console.log('Legitimate traffic score/tier distribution:', legitStats);

  const attackRunners = [
    { id: 'R1', run: () => login(GATEWAY_URL, SEEDED_USERS[0].email, SEEDED_USERS[0].password, SEEDED_USERS[0].ip).then(({ token }) => runSqlInjection(GATEWAY_URL, token, { forwardedFor: SEEDED_USERS[0].ip })) },
    { id: 'R2', run: () => runJwtManipulation(GATEWAY_URL) },
    { id: 'R3', run: () => login(GATEWAY_URL, SEEDED_USERS[2].email, SEEDED_USERS[2].password, SEEDED_USERS[2].ip).then(({ token }) => runRateFlood(GATEWAY_URL, token, SEEDED_USERS[2].id, { forwardedFor: SEEDED_USERS[2].ip })) },
    { id: 'R4', run: () => runCredentialStuffing(GATEWAY_URL) },
    { id: 'R5', run: () => login(GATEWAY_URL, SEEDED_USERS[1].email, SEEDED_USERS[1].password, SEEDED_USERS[1].ip).then(({ token }) => runBolaEnumeration(GATEWAY_URL, token, { forwardedFor: SEEDED_USERS[1].ip })) },
  ];

  const attackStats = {};
  for (const { id, run } of attackRunners) {
    const runs = [];
    for (let i = 0; i < runsPerCategory; i++) {
      await flushState();
      const result = await run();
      runs.push(result);
    }
    const allObs = runs.flatMap((r) => r.observations);
    attackStats[id] = {
      category: runs[0]?.category,
      runs: runsPerCategory,
      ...scoreDistribution(allObs),
      medianRequestsToEscalation: requestsToThreshold(allObs, id),
      p95LatencyMs: latencyPercentile(allObs, 95),
    };
    console.log(`${id} (${runs[0]?.category}):`, attackStats[id]);
  }

  return { legitimate: legitStats, attacks: attackStats };
}

async function main() {
  const legitimateRequestTotal = Number(process.env.CALIBRATION_LEGIT_REQUESTS || 500);
  const runsPerCategory = Number(process.env.CALIBRATION_RUNS_PER_CATEGORY || 5);

  console.log(`Calibration run - GATEWAY_URL=${GATEWAY_URL}, legitimate=${legitimateRequestTotal}, runsPerCategory=${runsPerCategory}`);
  await setGatewayConfig({ gatewayMode: 'adaptive', runLabel: 'calibration' });
  await flushState();
  const runMetadata = captureRunMetadata({ runLabel: 'calibration', legitimateRequestTotal, runsPerCategory });

  const report = await runCalibrationRound({ legitimateRequestTotal, runsPerCategory });
  report.runMetadata = runMetadata;

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `calibration-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nCalibration report written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
