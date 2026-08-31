const mockRedisClient = {
  incr: jest.fn(),
  incrBy: jest.fn().mockResolvedValue(50),
  expire: jest.fn(),
};
jest.mock('../../src/redisClient', () => ({ redisClient: mockRedisClient }));

const mockLogSecurityEvent = jest.fn();
jest.mock('../../src/security/securityLogger', () => ({ logSecurityEvent: mockLogSecurityEvent }));

const injectionDetection = require('../../src/middleware/injectionDetection');

function makeReqRes({ path = '/api/transactions/search', query = {}, body = {} } = {}) {
  const req = {
    id: 'test-request-id',
    identity: '203.0.113.4:1',
    method: 'GET',
    ip: '203.0.113.4',
    originalUrl: path,
    query,
    body,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRedisClient.incrBy.mockResolvedValue(50);
});

describe('injectionDetection middleware (R1) - allow path', () => {
  test('lets a legitimate query through untouched', async () => {
    const { req, res, next } = makeReqRes({ path: '/api/transactions/search?q=Tesco', query: { q: 'Tesco' } });

    await injectionDetection(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(mockLogSecurityEvent).not.toHaveBeenCalled();
  });

  test('lets a legitimate JSON body through untouched', async () => {
    const { req, res, next } = makeReqRes({
      path: '/api/accounts/1/transactions',
      body: { amount: -9.99, description: 'Coffee' },
    });

    await injectionDetection(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('injectionDetection middleware (R1) - block path', () => {
  test('blocks a tautology payload in the query string with 403', async () => {
    const { req, res, next } = makeReqRes({
      path: "/api/transactions/search?q=' OR '1'='1",
      query: { q: "' OR '1'='1" },
    });

    await injectionDetection(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'blocked by IDS', ruleId: 'R1', signature: 'sql-tautology' })
    );
  });

  test('decodes percent-encoded payloads before matching (regression: encoded payloads must not bypass R1)', async () => {
    const { req, res, next } = makeReqRes({
      path: '/api/transactions/search?q=%27%20OR%20%271%27=%271',
      query: { q: "' OR '1'='1" },
    });

    await injectionDetection(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('blocks a stacked-query payload in the JSON body', async () => {
    const { req, res, next } = makeReqRes({
      path: '/api/accounts/1/transactions',
      body: { amount: 10, description: 'x; DROP TABLE users--' },
    });

    await injectionDetection(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ signature: 'sql-stacked-query' }));
  });

  test('records the R1 weight against the requesting identity in Redis', async () => {
    const { req, res, next } = makeReqRes({
      path: "/api/transactions/search?q=' OR '1'='1",
      query: { q: "' OR '1'='1" },
    });

    await injectionDetection(req, res, next);

    expect(mockRedisClient.incrBy).toHaveBeenCalledWith('idscore:203.0.113.4:1', 50);
  });

  test('logs a structured security event with rule id, identity, and outcome', async () => {
    const { req, res, next } = makeReqRes({
      path: "/api/transactions/search?q=' OR '1'='1",
      query: { q: "' OR '1'='1" },
    });

    await injectionDetection(req, res, next);

    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: 'R1',
        identity: '203.0.113.4:1',
        action: 'blocked',
        signature: 'sql-tautology',
        score: 50,
      })
    );
  });
});
