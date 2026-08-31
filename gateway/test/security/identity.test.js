const { getCompositeIdentity } = require('../../src/security/identity');

describe('getCompositeIdentity', () => {
  test('combines IP and JWT subject when authenticated', () => {
    const req = { ip: '203.0.113.4', auth: { sub: '1', email: 'alice@example.com' } };
    expect(getCompositeIdentity(req)).toBe('203.0.113.4:1');
  });

  test('falls back to "anon" for unauthenticated requests', () => {
    const req = { ip: '203.0.113.4' };
    expect(getCompositeIdentity(req)).toBe('203.0.113.4:anon');
  });

  test('two different subjects behind the same IP get different identities', () => {
    const shared = '203.0.113.4';
    const alice = getCompositeIdentity({ ip: shared, auth: { sub: '1' } });
    const bob = getCompositeIdentity({ ip: shared, auth: { sub: '2' } });

    expect(alice).not.toBe(bob);
  });

  test('the same subject from two different IPs gets different identities', () => {
    const home = getCompositeIdentity({ ip: '203.0.113.4', auth: { sub: '1' } });
    const mobile = getCompositeIdentity({ ip: '198.51.100.9', auth: { sub: '1' } });

    expect(home).not.toBe(mobile);
  });
});
