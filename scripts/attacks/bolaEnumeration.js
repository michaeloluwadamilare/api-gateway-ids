const { authedGet, sleep } = require('../lib/httpClient');


async function runBolaEnumeration(baseUrl, token, { count = 20, startId = 1, resource = 'users', requestsPerSecond = 8, forwardedFor } = {}) {
  const intervalMs = 1000 / requestsPerSecond;
  const observations = [];

  for (let id = startId; id < startId + count; id++) {
    observations.push(await authedGet(`${baseUrl}/api/${resource}/${id}`, token, forwardedFor));
    await sleep(intervalMs);
  }

  return { category: 'bola_id_enumeration', ruleRef: 'R5', owaspRef: 'API1:2023', observations };
}

module.exports = { runBolaEnumeration };
