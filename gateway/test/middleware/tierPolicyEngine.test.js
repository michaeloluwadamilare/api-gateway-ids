const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
};
const mockLogSecurityEvent = jest.fn();

function tierForScore(score) {
  if (score <= 30) return { id: 'T1', min: 0, max: 30 };
  if (score <= 60) return { id: 'T2', min: 31, max: 60 };
  if (score <= 85) return { id: 'T3', min: 61, max: 85 };
  return { id: 'T4', min: 86, max: Infinity };
}

function loadTierPolicyEngine(mode, overrides = {}) {
  jest.resetModules();
  jest.doMock('../../src/redisClient', () => ({ redisClient: mockRedisClient }));
  jest.doMock('../../src/security/securityLogger', () => ({ logSecurityEvent: mockLogSecurityEvent }));
  jest.doMock('../../src/scoring', () => ({
    mode,
    tierForScore,
    blocklistTtlSeconds: 600,
    t2DelayMs: 0,
    t3ForwardRatio: 0.5, // every 2nd T3 request admitted, easier to assert on
    t3DelayMs: 0,
    ...overrides,
  }));
  return require('../../src/middleware/tierPolicyEngine');
}

function makeReqRes({ identity = '203.0.113.4:1' } = {}) {
  const req = {
    id: 'test-request-id',
    identity,
    method: 'GET',
    ip: '203.0.113.4',
    originalUrl: '/api/accounts/1',
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };
  const next = jest.fn();
  return { req, res, next };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('static mode (Condition B) is a no-op - no tier engine in that condition', async () => {
  const tierPolicyEngine = loadTierPolicyEngine('static');
  const { req, res, next } = makeReqRes();

  await tierPolicyEngine(req, res, next);

  expect(mockRedisClient.get).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledWith();
});

test('T1 (0-30): forwards normally', async () => {
  const tierPolicyEngine = loadTierPolicyEngine('adaptive');
  mockRedisClient.get.mockResolvedValue('20');
  const { req, res, next } = makeReqRes();

  await tierPolicyEngine(req, res, next);

  expect(req.tier).toBe('T1');
  expect(next).toHaveBeenCalledWith();
  expect(res.status).not.toHaveBeenCalled();
});

test('T2 (31-60): forwards, marked degraded', async () => {
  const tierPolicyEngine = loadTierPolicyEngine('adaptive');
  mockRedisClient.get.mockResolvedValue('45');
  const { req, res, next } = makeReqRes();

  await tierPolicyEngine(req, res, next);

  expect(req.tier).toBe('T2');
  expect(next).toHaveBeenCalledWith();
  expect(mockLogSecurityEvent).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'forwarded_degraded' })
  );
});

test('T3 (61-85): throttles - admits roughly the configured forward ratio, challenges the rest', async () => {
  const tierPolicyEngine = loadTierPolicyEngine('adaptive');
  mockRedisClient.get.mockResolvedValue('70');

  const first = makeReqRes();
  await tierPolicyEngine(first.req, first.res, first.next);
  const second = makeReqRes();
  await tierPolicyEngine(second.req, second.res, second.next);

  // ratio 0.5 -> every 2nd request admitted: 1st challenged, 2nd forwarded
  expect(first.res.status).toHaveBeenCalledWith(429);
  expect(first.next).not.toHaveBeenCalled();
  expect(second.next).toHaveBeenCalledWith();
  expect(second.res.status).not.toHaveBeenCalled();
});

test('T4 (86+): blocks, blocklists the identity, and sets req.tier for the audit logger', async () => {
  const tierPolicyEngine = loadTierPolicyEngine('adaptive');
  mockRedisClient.get.mockResolvedValue('90');
  const { req, res, next } = makeReqRes();

  await tierPolicyEngine(req, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(403);
  expect(req.tier).toBe('T4');
  expect(mockRedisClient.set).toHaveBeenCalledWith('idblock:203.0.113.4:1', '1', { EX: 600 });
});

test('sets X-IDS-Tier and X-IDS-Score response headers', async () => {
  const tierPolicyEngine = loadTierPolicyEngine('adaptive');
  mockRedisClient.get.mockResolvedValue('20');
  const { req, res, next } = makeReqRes();

  await tierPolicyEngine(req, res, next);

  expect(res.setHeader).toHaveBeenCalledWith('X-IDS-Tier', 'T1');
  expect(res.setHeader).toHaveBeenCalledWith('X-IDS-Score', '20');
});
