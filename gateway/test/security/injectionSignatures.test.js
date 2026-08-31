const { matchInjectionSignature } = require('../../src/security/injectionSignatures');

describe('matchInjectionSignature (R1)', () => {
  test.each([
    ['sql-union-select', "1 UNION SELECT username, password FROM users"],
    ['sql-tautology', "' OR '1'='1"],
    ['sql-comment-terminator', "admin'--"],
    ['sql-stacked-query', '1; DROP TABLE users'],
    ['sql-drop-table', 'DROP TABLE accounts'],
    ['sql-exec', 'EXEC (xp_cmdshell)'],
    ['nosql-operator', '{"password": {"$ne": null}}'],
  ])('flags %s', (expectedId, payload) => {
    expect(matchInjectionSignature(payload)).toBe(expectedId);
  });

  test.each([
    'Tesco Superstore',
    'alice@example.com',
    'a normal transaction description',
    '',
  ])('does not flag legitimate text: %j', (text) => {
    expect(matchInjectionSignature(text)).toBeNull();
  });

  test('matches the first signature that hits, deterministically', () => {
    // contains both a tautology and a comment terminator
    expect(matchInjectionSignature("' OR '1'='1' --")).toBe('sql-tautology');
  });
});
