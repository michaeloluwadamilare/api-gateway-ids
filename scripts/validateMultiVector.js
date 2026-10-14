const fs = require('fs');
const path = require('path');

const { GATEWAY_URL, SEEDED_USERS } = require('./lib/config');
const { setGatewayConfig, flushState } = require('./lib/gatewayControl');
const { login } = require('./lib/auth');
const { runEnumerationPhase, runInjectionPhase, runMultiVector } = require('./attacks/multiVector');

const RESULTS_DIR = path.join(__dirname, '..', 'results');

function summarize(observations) {
  const last = observations[observations.length - 1];
  return {
    totalRequests: observations.length,
    finalScore: last.score,
    finalTier: last.tier,
    finalStatusCode: last.statusCode,
    perRequest: observations.map((o, i) => ({ i: i + 1, statusCode: o.statusCode, tier: o.tier, score: o.score })),
  };
}

async function runArm(name, user, fn) {
  console.log(`\n=== ${name} ===`);
  await flushState();
  const observations = await fn();
  const summary = summarize(observations);
  console.log(summary);
  return { name, summary, observations };
}

async function main() {
  const user = SEEDED_USERS[0];
  await setGatewayConfig({ gatewayMode: 'adaptive', runLabel: 'multivector-validation' });

  const { token } = await login(GATEWAY_URL, user.email, user.password, user.ip);

  const results = {};

  results.r5Only = await runArm('R5 alone (3 ascending enumeration requests)', user, () =>
    runEnumerationPhase(GATEWAY_URL, token, 1, user.ip)
  );
  results.r1Only = await runArm('R1 alone (1 injection probe)', user, () =>
    runInjectionPhase(GATEWAY_URL, token, user.ip)
  );
  results.combined = await runArm(
    'R5 + R1 combined, same identity, same session (the actual multi-vector scenario)',
    user,
    async () => (await runMultiVector(GATEWAY_URL, token, 1, { forwardedFor: user.ip })).observations
  );
  results.escalated = await runArm(
    'R5 + R1 + R1-again (a second, different injection payload - pushing past T4)',
    user,
    async () =>
      (await runMultiVector(GATEWAY_URL, token, 1, { forwardedFor: user.ip, escalate: true })).observations
  );

  console.log('\n=== Summary ===');
  console.log(`R5 alone:          score=${results.r5Only.summary.finalScore} tier=${results.r5Only.summary.finalTier}`);
  console.log(`R1 alone:          score=${results.r1Only.summary.finalScore} tier=${results.r1Only.summary.finalTier}`);
  console.log(`R5+R1 combined:    score=${results.combined.summary.finalScore} tier=${results.combined.summary.finalTier}`);
  console.log(`R5+R1+R1 escalated: score=${results.escalated.summary.finalScore} tier=${results.escalated.summary.finalTier}`);

  const neitherAloneReachedT3Plus =
    !['T3', 'T4'].includes(results.r5Only.summary.finalTier) && !['T3', 'T4'].includes(results.r1Only.summary.finalTier);
  const combinedReachedT3Plus = ['T3', 'T4'].includes(results.combined.summary.finalTier);

  if (neitherAloneReachedT3Plus && combinedReachedT3Plus) {
    console.log('\nPASS: neither R5 nor R1 alone reached T3/T4, but the same identity doing both did - composite scoring demonstrated.');
  } else {
    console.log('\nFAIL (or inconclusive): expected neither isolated vector to reach T3/T4 while the combined scenario does. Check gateway/src/scoring.js weight/tier values against this script\'s assumptions.');
  }

  await setGatewayConfig({ gatewayMode: 'adaptive', runLabel: '' });
  await flushState();

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `multivector-validation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nMulti-vector validation report written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
