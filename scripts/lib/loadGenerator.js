const { timedRequest } = require('./httpClient');

async function loadTest(url, tokens, { concurrency = 10, durationMs = 10000 } = {}) {
  const pool = Array.isArray(tokens) ? tokens : tokens ? [tokens] : [];
  const deadline = Date.now() + durationMs;
  const observations = [];

  function randomToken() {
    if (pool.length === 0) return undefined;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async function worker() {
    while (Date.now() < deadline) {
      const token = randomToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      observations.push(await timedRequest(url, { headers }));
    }
  }

  const startedAt = Date.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedS = (Date.now() - startedAt) / 1000;

  const blockedByGatewayCount = observations.filter((o) => o.statusCode === 403 || o.statusCode === 429).length;

  return {
    concurrency,
    durationMs,
    requestCount: observations.length,
    throughputRps: observations.length / elapsedS,
    errorCount: observations.filter((o) => o.statusCode === null || o.statusCode >= 500).length,
    blockedByGatewayCount,
    observations,
  };
}

module.exports = { loadTest };
