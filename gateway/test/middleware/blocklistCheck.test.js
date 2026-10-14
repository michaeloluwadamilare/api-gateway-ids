const mockRedisClient = { get: jest.fn() };
const mockLogSecurityEvent = jest.fn();

function loadBlocklistCheck(mode) {
  jest.resetModules();
  jest.doMock('../../src/redisClient', () => ({ redisClient: mockRedisClient }));
  jest.doMock('../../src/security/securityLogger', () => ({ logSecurityEvent: mockLogSecurityEvent }));
  jest.doMock('../../src/scoring', () => ({ mode }));
  return require('../../src/middleware/blocklistCheck');
}

function makeReqRes() {
  const req = {
    id: 'test-request-id',
    identity: '203.0.113.4:1',
    method: 'GET',
    ip: '203.0.113.4',
    originalUrl: '/api/accounts/1',
    triggeredRules: [],
  };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('static mode (Condition B) is a no-op - no blocklist concept in that condition', async () => {
  const blocklistCheck = loadBlocklistCheck('static');
  const { req, res, next } = makeReqRes();

  await blocklistCheck(req, res, next);

  expect(mockRedisClient.get).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledWith();
});

test('adaptive mode forwards a non-blocklisted identity', async () => {
  const blocklistCheck = loadBlocklistCheck('adaptive');
  mockRedisClient.get.mockResolvedValue(null);
  const { req, res, next } = makeReqRes();

  await blocklistCheck(req, res, next);

  expect(next).toHaveBeenCalledWith();
  expect(res.status).not.toHaveBeenCalled();
});

test('adaptive mode short-circuits a blocklisted identity with 403, before any rule runs', async () => {
  const blocklistCheck = loadBlocklistCheck('adaptive');
  mockRedisClient.get.mockResolvedValue('1');
  const { req, res, next } = makeReqRes();

  await blocklistCheck(req, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(403);
  expect(req.tier).toBe('T4');
});
