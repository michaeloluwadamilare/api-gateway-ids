const { privateKey } = require('../helpers/testKeys'); // sets JWT_PUBLIC_KEY_B64 before config.js loads
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../../src/security/jwt');

function sign(payload, options = {}) {
  return jwt.sign(payload, privateKey, { algorithm: 'RS256', subject: '1', expiresIn: '15m', ...options });
}

describe('verifyToken', () => {
  test('accepts a validly signed RS256 token and returns its claims', () => {
    const token = sign({ email: 'alice@example.com' });
    const result = verifyToken(token);

    expect(result.ok).toBe(true);
    expect(result.decoded.sub).toBe('1');
    expect(result.decoded.email).toBe('alice@example.com');
  });

  test('rejects an expired token as expired_token', () => {
    const token = sign({ email: 'alice@example.com' }, { expiresIn: '-10s' });
    const result = verifyToken(token);

    expect(result.ok).toBe(false);
    expect(result.category).toBe('expired_token');
  });

  test('rejects a tampered signature as invalid_signature', () => {
    const token = sign({ email: 'alice@example.com' });
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'AA' ? 'BB' : 'AA');
    const result = verifyToken(tampered);

    expect(result.ok).toBe(false);
    expect(result.category).toBe('invalid_signature');
  });

  test('rejects a none-algorithm forged token as invalid_signature (RFC 8725)', () => {
    const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: '1', email: 'alice@example.com' })}.`;
    const result = verifyToken(forged);

    expect(result.ok).toBe(false);
    expect(['invalid_signature', 'disallowed_algorithm']).toContain(result.category);
  });

  test('rejects an RS256/HS256 confusion attempt (signed with the public key as an HMAC secret) as disallowed_algorithm', () => {
    const { publicKey } = require('../helpers/testKeys');
    const confused = jwt.sign({ sub: '1', email: 'alice@example.com' }, publicKey, { algorithm: 'HS256' });
    const result = verifyToken(confused);

    expect(result.ok).toBe(false);
    expect(result.category).toBe('disallowed_algorithm');
  });

  test('rejects garbage input without throwing', () => {
    const result = verifyToken('not.a.jwt');

    expect(result.ok).toBe(false);
    expect(typeof result.category).toBe('string');
  });
});
