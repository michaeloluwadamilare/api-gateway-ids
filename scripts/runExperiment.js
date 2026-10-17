const fs = require('fs');
const path = require('path');

const { GATEWAY_URL, BACKEND_URL, CONDITIONS, LEGITIMATE_POOL_USERS, ATTACKER_USER } = require('./lib/config');
const { setGatewayConfig, flushState } = require('./lib/gatewayControl');
const { login } = require('./lib/auth');
const { runLegitimateBatch } = require('./traffic/legitimateTraffic');
const { runSqlInjection } = require('./attacks/sqlInjection');
const { runRateFlood } = require('./attacks/rateFlood');
const { runJwtManipulation } = require('./attacks/jwtManipulation');
const { runCredentialStuffing } = require('./attacks/credentialStuffing');
const { runBolaEnumeration } = require('./attacks/bolaEnumeration');
const {
  computeConfusionMatrix,
  computeRequestLevelConfusionMatrix,
  timeToDetect,
  latencyPercentile,
  mean,
  stddev,
} = require('./lib/metrics');
const { captureRunMetadata } = require('./lib/runMetadata');

const RESULTS_DIR = path.join(__dirname, '..', 'results');

const ATTACKS = {
  R1: async (baseUrl) => {
    const { token } = await login(baseUrl, ATTACKER_USER.email, ATTACKER_USER.password, ATTACKER_USER.ip);
    return runSqlInjection(baseUrl, token, { forwardedFor: ATTACKER_USER.ip });
  },
  R2: async (baseUrl) => runJwtManipulation(baseUrl),

  R3: async (baseUrl) => {
    const { token } = await login(baseUrl, ATTACKER_USER.email, ATTACKER_USER.password, ATTACKER_USER.ip);
    return runRateFlood(baseUrl, token, ATTACKER_USER.id, { forwardedFor: ATTACKER_USER.ip });
  },
  R4: async (baseUrl) => runCredentialStuffing(baseUrl),
  R5: async (baseUrl) => {
    const { token } = await login(baseUrl, ATTACKER_USER.email, ATTACKER_USER.password, ATTACKER_USER.ip);
    return runBolaEnumeration(baseUrl, token, { forwardedFor: ATTACKER_USER.ip });
  },
};

function baseUrlForCondition(letter) {
  return CONDITIONS[letter].baseUrl;
}

async function runOneRepetition(letter, ruleId, repIndex) {
  const baseUrl = baseUrlForCondition(letter);

  if (CONDITIONS[letter].gatewayMode) {
    await flushState();
  }

  const [attackResult, legitResults] = await Promise.all([
    ATTACKS[ruleId](baseUrl),
    runLegitimateBatch(baseUrl, LEGITIMATE_POOL_USERS, {
      usersCount: LEGITIMATE_POOL_USERS.length,
      requestsPerUser: 15,
      requestsPerSecond: 4,
    }),
  ]);

  const runs = [
    { label: `${ruleId}-attack-rep${repIndex}`, groundTruthPositive: true, observations: attackResult.observations },
    ...legitResults.map((r, i) => ({
      label: `${ruleId}-legit${i}-rep${repIndex}`,
      groundTruthPositive: false,
      observations: r.observations,
    })),
  ];

  const allObservations = runs.flatMap((r) => r.observations);
  return {
    repetition: repIndex,
    runs,
    ttd: timeToDetect(runs[0]),
    p95LatencyMs: latencyPercentile(allObservations, 95),
    meanLatencyMs: mean(allObservations.map((o) => o.latencyMs)),
  };
}

async function runCondition(letter, ruleId, repetitions, { disabledRules = '', runLabel } = {}) {
  console.log(`\n--- Condition ${letter} (${CONDITIONS[letter].label}) / ${ruleId} - ${repetitions} repetitions ---`);

  const label = runLabel || `exp-${letter}-${ruleId}`;
  let runMetadata;
  if (CONDITIONS[letter].gatewayMode) {
    // disabledRules must be passed through here, not set by a separate
    // setGatewayConfig() call before runCondition() runs - this function
    // always calls setGatewayConfig itself (every condition/category needs
    // its own runLabel), so a prior call's config gets silently clobbered
    // back to disabledRules='' otherwise. This was runAblation.js's actual
    // bug: it set DISABLED_RULES correctly, then runCondition immediately
    // overwrote it back to empty on its very next setGatewayConfig call.
    await setGatewayConfig({ gatewayMode: CONDITIONS[letter].gatewayMode, disabledRules, runLabel: label });
    runMetadata = captureRunMetadata({ runLabel: label });
  } else {
    runMetadata = { capturedAt: new Date().toISOString(), note: 'Condition A bypasses the gateway entirely - no gateway config applies.' };
  }

  const repetitionResults = [];
  for (let i = 0; i < repetitions; i++) {
    const result = await runOneRepetition(letter, ruleId, i);
    repetitionResults.push(result);
    console.log(`  rep ${i}: ttd=${JSON.stringify(result.ttd)} p95=${result.p95LatencyMs?.toFixed(1)}ms`);
  }

  const allRuns = repetitionResults.flatMap((r) => r.runs);
  const confusion = computeConfusionMatrix(allRuns);
  const requestLevelConfusion = computeRequestLevelConfusionMatrix(allRuns);
  const p95Values = repetitionResults.map((r) => r.p95LatencyMs);
  const meanValues = repetitionResults.map((r) => r.meanLatencyMs);

  return {
    condition: letter,
    conditionLabel: CONDITIONS[letter].label,
    ruleId,
    repetitions,
    confusion,
    requestLevelConfusion,
    runMetadata,
    latency: {
      p95MeanMs: mean(p95Values),
      p95StddevMs: stddev(p95Values),
      meanMs: mean(meanValues),
      meanStddevMs: stddev(meanValues),
    },
    timeToDetect: repetitionResults.map((r) => r.ttd),
    repetitionResults,
  };
}

async function main() {
  const [, , conditionArg, categoryArg, repetitionsArg] = process.argv;
  if (!conditionArg || !categoryArg) {
    console.error('Usage: node scripts/runExperiment.js <A|B|C> <R1|R2|R3|R4|R5|all> [repetitions]');
    process.exit(1);
  }

  const conditions = conditionArg === 'all' ? ['A', 'B', 'C'] : [conditionArg.toUpperCase()];
  const categories = categoryArg === 'all' ? ['R1', 'R2', 'R3', 'R4', 'R5'] : [categoryArg.toUpperCase()];
  const repetitions = Number(repetitionsArg || 5);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { generatedAt: new Date().toISOString(), gatewayUrl: GATEWAY_URL, backendUrl: BACKEND_URL, results: [] };

  for (const letter of conditions) {
    for (const ruleId of categories) {
      const result = await runCondition(letter, ruleId, repetitions);
      report.results.push(result);

      const runLevel = `run-level recall=${result.confusion.recall} precision=${result.confusion.precision} f1=${result.confusion.f1} FPR=${result.confusion.falsePositiveRate}`;
      const reqLevel = `request-level recall=${result.requestLevelConfusion.recall} precision=${result.requestLevelConfusion.precision} FPR=${result.requestLevelConfusion.falsePositiveRate}`;
      console.log(`Condition ${letter} / ${ruleId}: ${runLevel} | ${reqLevel}`);
    }
  }

  const outPath = path.join(RESULTS_DIR, `experiment-${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nFull results written to ${outPath}`);
}

module.exports = { runCondition, ATTACKS };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
