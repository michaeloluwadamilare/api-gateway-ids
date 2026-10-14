const { jsonPost, sleep } = require('../lib/httpClient');
const { syntheticIp } = require('../lib/config');

const BREACH_STYLE_PASSWORDS = [
  '123456', 'password', '12345678', 'qwerty', '123456789', '12345',
  '1234', '111111', '1234567', 'dragon', 'baseball', 'iloveyou',
];

function syntheticEmail(i) {
  return `breached.dist${i}@example-leak.test`;
}
async function runConcentratedCredentialStuffing(baseUrl, { count = 8, delayMs = 2000 } = {}) {
  const ip = syntheticIp('distributed-stuffing-concentrated');
  const observations = [];
  for (let i = 0; i < count; i++) {
    observations.push(
      await jsonPost(
        `${baseUrl}/api/auth/login`,
        { email: syntheticEmail(i), password: BREACH_STYLE_PASSWORDS[i % BREACH_STYLE_PASSWORDS.length] },
        { forwardedFor: ip }
      )
    );
    await sleep(delayMs);
  }
  return { category: 'distributed_credential_stuffing_concentrated', ruleRef: 'R4', observations };
}

// Same slow pacing, same total mechanism, but spread across many source
// IPs with each individually staying under R4's consecutive-failure
// threshold (default 5) - attemptsPerIp=4 is deliberately below that.
async function runDistributedCredentialStuffing(baseUrl, { ipCount = 8, attemptsPerIp = 4, delayMs = 2000 } = {}) {
  const observations = [];
  for (let i = 0; i < ipCount; i++) {
    const ip = syntheticIp(`distributed-stuffing-${i}`);
    for (let j = 0; j < attemptsPerIp; j++) {
      const idx = i * attemptsPerIp + j;
      observations.push(
        await jsonPost(
          `${baseUrl}/api/auth/login`,
          { email: syntheticEmail(100 + idx), password: BREACH_STYLE_PASSWORDS[idx % BREACH_STYLE_PASSWORDS.length] },
          { forwardedFor: ip }
        )
      );
      await sleep(delayMs);
    }
  }
  return { category: 'distributed_credential_stuffing_distributed', ruleRef: 'R4', observations };
}

module.exports = { runConcentratedCredentialStuffing, runDistributedCredentialStuffing };
