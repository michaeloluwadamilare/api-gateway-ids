const { jsonPost, sleep } = require('../lib/httpClient');

const COMMON_PASSWORDS = [
  'password', '123456', 'qwerty', 'letmein', 'admin123', 'welcome1',
  'Password1', 'monkey123', 'football', 'iloveyou', 'sunshine1', 'dragon123',
];

function buildGuessList(count) {
  const list = [];
  for (let i = 0; i < count; i++) list.push(`${COMMON_PASSWORDS[i % COMMON_PASSWORDS.length]}${i}`);
  return list;
}

async function runBruteForce(baseUrl, targetEmail, { count = 40, requestsPerSecond = 10, forwardedFor } = {}) {
  const guesses = buildGuessList(count);
  const intervalMs = 1000 / requestsPerSecond;
  const observations = [];

  for (const password of guesses) {
    observations.push(await jsonPost(`${baseUrl}/api/auth/login`, { email: targetEmail, password }, { forwardedFor }));
    await sleep(intervalMs);
  }

  // Login-only, low-rate traffic against /api/auth/login; this is
  // credentialStuffingGate/recordLoginOutcome (R4) territory, not R3's
  // generic rate counter (R4's gate runs before R3 in the middleware
  // pipeline for this exact path, and 40 requests never crosses R3's
  // threshold anyway). See scripts/attacks/rateFlood.js for the actual R3

  return { category: 'brute_force', ruleRef: 'R4', owaspRef: 'API2:2023', observations };
}

module.exports = { runBruteForce };
