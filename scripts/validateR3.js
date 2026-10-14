const fs = require('fs');
const path = require('path');

const { GATEWAY_URL, SEEDED_USERS } = require('./lib/config');
const { setGatewayConfig, flushState } = require('./lib/gatewayControl');
const { login } = require('./lib/auth');
const { runRateFlood } = require('./attacks/rateFlood');

const RESULTS_DIR = path.join(__dirname, '..', 'results');

function summarize(observations) {
  const firstBlockedIdx = observations.findIndex((o) => o.statusCode === 403 || o.statusCode === 429);
  const firstBlocked = firstBlockedIdx === -1 ? null : observations[firstBlockedIdx];
  return {
    totalRequests: observations.length,
    firstBlockedAtRequest: firstBlockedIdx === -1 ? null : firstBlockedIdx + 1,
    firstBlockedRuleId: firstBlocked?.body?.ruleId ?? null,
    firstBlockedReason: firstBlocked?.body?.reason ?? null,
    blockedCount: observations.filter((o) => o.statusCode === 403 || o.statusCode === 429).length,
    maxScore: Math.max(0, ...observations.map((o) => o.score).filter((s) => typeof s === 'number')),
    tiersSeen: [...new Set(observations.map((o) => o.tier).filter(Boolean))],
  };
}

async function runStaticCheck(user) {
  console.log('\n=== Static mode (Condition B): expect an immediate 429 with ruleId R3 ===');
  await setGatewayConfig({ gatewayMode: 'static', runLabel: 'r3-validation-static' });
  await flushState();

  const { token } = await login(GATEWAY_URL, user.email, user.password, user.ip);
  const { observations } = await runRateFlood(GATEWAY_URL, token, user.id, {
    forwardedFor: user.ip, // count/requestsPerSecond: rateFlood.js's own defaults
  });
  const summary = summarize(observations);
  console.log(summary);

  if (summary.firstBlockedRuleId !== 'R3') {
    console.error(`FAIL: expected firstBlockedRuleId "R3", got "${summary.firstBlockedRuleId}"`);
  } else {
    console.log('PASS: R3 fired (and only R3 could have - this endpoint is not login-gated).');
  }

  return { mode: 'static', summary, observations };
}

async function runAdaptiveCheck(user) {
  console.log('\n=== Adaptive mode (Condition C): expect score to climb and tier to escalate ===');
  await setGatewayConfig({ gatewayMode: 'adaptive', runLabel: 'r3-validation-adaptive' });
  await flushState();

  const { token } = await login(GATEWAY_URL, user.email, user.password, user.ip);
  const { observations } = await runRateFlood(GATEWAY_URL, token, user.id, {
    forwardedFor: user.ip, // count/requestsPerSecond: rateFlood.js's own defaults
  });
  const summary = summarize(observations);
  console.log(summary);

  if (summary.maxScore <= 0 || summary.tiersSeen.length <= 1) {
    console.error('FAIL: expected score to climb and tier to escalate beyond T1.');
  } else {
    console.log('PASS: score climbed and tier escalated under sustained rate abuse.');
  }

  return { mode: 'adaptive', summary, observations };
}

async function main() {
  const user = SEEDED_USERS[0];
  const results = {
    generatedAt: new Date().toISOString(),
    purpose: 'Supplementary R3 validation - see header comment for why this is separate from the formal experiment harness.',
    runs: [],
  };

  results.runs.push(await runStaticCheck(user));
  results.runs.push(await runAdaptiveCheck(user));

  await setGatewayConfig({ gatewayMode: 'adaptive', runLabel: '' }); // restore default
  await flushState();

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `r3-validation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nR3 validation report written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
