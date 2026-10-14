const fs = require('fs');
const path = require('path');

const { GATEWAY_URL } = require('./lib/config');
const { setGatewayConfig, flushState } = require('./lib/gatewayControl');
const {
  runConcentratedCredentialStuffing,
  runDistributedCredentialStuffing,
} = require('./attacks/distributedCredentialStuffing');

const RESULTS_DIR = path.join(__dirname, '..', 'results');

function summarize(observations) {
  const blocked = observations.filter((o) => o.statusCode === 403 || o.statusCode === 429);
  return {
    totalRequests: observations.length,
    blockedCount: blocked.length,
    firstBlockedAtRequest: blocked.length ? observations.indexOf(blocked[0]) + 1 : null,
    firstBlockedRuleId: blocked[0]?.body?.ruleId ?? null,
  };
}

async function main() {
  const gatewayMode = 'static';
  const identityCount = 8;
  const attemptsPerIdentity = 4;
  console.log(`Gateway mode for this run: ${gatewayMode}`);
  await setGatewayConfig({ gatewayMode, runLabel: 'distributed-stuffing-validation' });

  console.log('\n=== Concentrated: 8 attempts, 1 source IP (baseline - confirms R4 still catches this shape) ===');
  await flushState();
  const concentrated = await runConcentratedCredentialStuffing(GATEWAY_URL);
  const concentratedSummary = summarize(concentrated.observations);
  console.log(concentratedSummary);

  console.log(`\n=== Distributed: ${identityCount * attemptsPerIdentity} attempts across ${identityCount} distinct composite identities, ${attemptsPerIdentity} each (same slow pacing, each identity under threshold) ===`);
  await flushState();
  const distributed = await runDistributedCredentialStuffing(GATEWAY_URL, { ipCount: identityCount, attemptsPerIp: attemptsPerIdentity });
  const distributedSummary = { ...summarize(distributed.observations), identityCount, attemptsPerIdentity };
  console.log(distributedSummary);

  console.log('\n=== Result ===');
  if (concentratedSummary.blockedCount > 0 && distributedSummary.blockedCount === 0) {
    console.log(
      'CONFIRMED LIMITATION: concentrated attempts are detected (R4 fires), but the same mechanism spread across 8 source IPs evades detection entirely - R4 has no cross-identity correlation, by design (composite identity is IP:subject only). State this honestly as a limitation, not a defect - no rule in this proposal claims to defend against distributed/botnet-sourced credential stuffing specifically.'
    );
  } else if (concentratedSummary.blockedCount > 0 && distributedSummary.blockedCount > 0) {
    console.log('UNEXPECTED: distributed attempts were also detected - check whether synthetic IPs collided or TRUST_PROXY/identity resolution behaved unexpectedly.');
  } else {
    console.log('UNEXPECTED: concentrated attempts were NOT detected - check R4_THRESHOLD and the attempt count/pacing against it before trusting the distributed result.');
  }

  await setGatewayConfig({ gatewayMode: 'adaptive', runLabel: '' });
  await flushState();

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `distributed-stuffing-validation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        gatewayMode,
        concentrated: { summary: concentratedSummary, observations: concentrated.observations },
        distributed: { summary: distributedSummary, observations: distributed.observations },
      },
      null,
      2
    )
  );
  console.log(`\nDistributed-stuffing validation report written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
