const mockRedisClient = {
  incr: jest.fn(),
  expire: jest.fn(),
  incrBy: jest.fn(),
};
const mockLogSecurityEvent = jest.fn();

function loadRateAbuseDetection(mode) {
  jest.resetModules();
  jest.doMock('../../src/redisClient', () => ({ redisClient: mockRedisClient }));
  jest.doMock('../../src/security/securityLogger', () => ({ logSecurityEvent: mockLogSecurityEvent }));
  jest.doMock('../../src/scoring', () => ({
    ruleWeights: { R3: 30 },
    r3: { windowSeconds: 10, threshold: 20 },
    mode,
    disabledRules: new Set(),
  }));
  return require('../../src/middleware/rateAbuseDetection');
}

function makeReqRes({ path = '/api/accounts/1' } = {}) {
  const req = {
    id: 'test-request-id',
    identity: '203.0.113.4:1',
    method: 'GET',
    ip: '203.0.113.4',
    originalUrl: path,
    triggeredRules: [],
  };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRedisClient.incrBy.mockResolvedValue(30);
});

test('does not trigger while under the window threshold', async () => {
  const rateAbuseDetection = loadRateAbuseDetection('adaptive');
  mockRedisClient.incr.mockResolvedValue(5);
  const { req, res, next } = makeReqRes();

  await rateAbuseDetection(req, res, next);

  expect(next).toHaveBeenCalledWith();
  expect(mockRedisClient.incrBy).not.toHaveBeenCalled();
});

test('sets the window TTL only on the first request', async () => {
  const rateAbuseDetection = loadRateAbuseDetection('adaptive');
  mockRedisClient.incr.mockResolvedValue(1);
  const { req, res, next } = makeReqRes();

  await rateAbuseDetection(req, res, next);

  expect(mockRedisClient.expire).toHaveBeenCalledWith('idrate:203.0.113.4:1', 10);
});

test('static mode (Condition B) blocks with 429 once the threshold is crossed', async () => {
  const rateAbuseDetection = loadRateAbuseDetection('static');
  mockRedisClient.incr.mockResolvedValue(21);
  const { req, res, next } = makeReqRes();

  await rateAbuseDetection(req, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(429);
  expect(mockRedisClient.incrBy).toHaveBeenCalledWith('idscore:203.0.113.4:1', 30);
});

test('adaptive mode (Condition C) scores but forwards the request', async () => {
  const rateAbuseDetection = loadRateAbuseDetection('adaptive');
  mockRedisClient.incr.mockResolvedValue(21);
  const { req, res, next } = makeReqRes();

  await rateAbuseDetection(req, res, next);

  expect(res.status).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledWith();
  expect(req.triggeredRules).toEqual([expect.objectContaining({ ruleId: 'R3', weight: 30 })]);
});

test('keeps triggering (and accumulating score) on every request once over threshold', async () => {
  const rateAbuseDetection = loadRateAbuseDetection('adaptive');
  mockRedisClient.incr.mockResolvedValueOnce(21).mockResolvedValueOnce(22);

  await rateAbuseDetection(makeReqRes().req, makeReqRes().res, jest.fn());
  await rateAbuseDetection(makeReqRes().req, makeReqRes().res, jest.fn());

  expect(mockRedisClient.incrBy).toHaveBeenCalledTimes(2);
});
