const { jsonPost, sleep } = require('../lib/httpClient');
const { R4_ATTACKER_IP } = require('../lib/config');

const BREACH_PASSWORDS_ARRAY = [
  '123456', 'password', '12345678', 'qwerty', '123456789', '12345',
  '1234', '111111', '1234567', 'dragon', 'baseball', 'iloveyou',
  'trustno1', 'sunshine', 'master', 'welcome',
];

function syntheticEmail(i) {
  return `breached.user${i}@example-leak.test`;
}

function buildPairs(count) {
  const pairs = [];
  for (let i = 0; i < count; i++) {
    pairs.push({ email: syntheticEmail(i), password: BREACH_PASSWORDS_ARRAY[i % BREACH_PASSWORDS_ARRAY.length] });
  }
  return pairs;
}

async function runCredentialStuffing(baseUrl, { count = 15, requestsPerSecond = 1 } = {}) {
  const pairs = buildPairs(count);
  const intervalMs = 1000 / requestsPerSecond;
  const observations = [];

  for (const { email, password } of pairs) {
    observations.push(await jsonPost(`${baseUrl}/api/auth/login`, { email, password }, { forwardedFor: R4_ATTACKER_IP }));
    await sleep(intervalMs);
  }

  return { category: 'credential_stuffing', ruleRef: 'R4', owaspRef: 'API2:2023', observations };
}

module.exports = { runCredentialStuffing };
