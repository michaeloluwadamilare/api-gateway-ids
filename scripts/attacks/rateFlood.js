const { authedGet, sleep } = require('../lib/httpClient');

async function runRateFlood(baseUrl, token, resourceId, { count = 120, requestsPerSecond = 25, forwardedFor } = {}) {
  const intervalMs = 1000 / requestsPerSecond;
  const observations = [];

  for (let i = 0; i < count; i++) {
    observations.push(await authedGet(`${baseUrl}/api/accounts/${resourceId}/transactions`, token, forwardedFor));
    await sleep(intervalMs);
  }

  return { category: 'rate_abuse', ruleRef: 'R3', owaspRef: 'API4:2023', observations };
}

module.exports = { runRateFlood };
