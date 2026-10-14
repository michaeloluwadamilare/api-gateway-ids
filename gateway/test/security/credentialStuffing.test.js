const mockRedisClient = {
  get: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  incrBy: jest.fn(),
};
const mockLogSecurityEvent = jest.fn();

function loadCredentialStuffing(mode) {
  jest.resetModules();
  jest.doMock('../../src/redisClient', () => ({ redisClient: mockRedisClient }));
  jest.doMock('../../src/security/securityLogger', () => ({ logSecurityEvent: mockLogSecurityEvent }));
  jest.doMock('../../src/scoring', () => ({
    ruleWeights: { R4: 40 },
    r4: { windowSeconds: 600, threshold: 5, exponentialFactor: 2 },
    mode,
    disabledRules: new Set(),
  }));
  return require('../../src/security/credentialStuffing');
}

function makeReqRes({ path = '/api/auth/login', identity = '203.0.113.4:anon' } = {}) {
  const req = {
    id: 'test-request-id',
    identity,
    method: 'POST',
    ip: '203.0.113.4',
    originalUrl: path,
    path,
    triggeredRules: [],
  };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRedisClient.incrBy.mockResolvedValue(40);
});

describe('recordLoginOutcome', () => {
  test('ignores non-login paths', async () => {
    const { recordLoginOutcome } = loadCredentialStuffing('adaptive');
    await recordLoginOutcome({ path: '/api/accounts/1', identity: '203.0.113.4:1' }, 401);

    expect(mockRedisClient.incr).not.toHaveBeenCalled();
  });

  test('increments the failure counter on a 401 and sets a TTL on the first failure', async () => {
    const { recordLoginOutcome } = loadCredentialStuffing('adaptive');
    mockRedisClient.incr.mockResolvedValue(1);

    await recordLoginOutcome({ path: '/api/auth/login', identity: '203.0.113.4:anon', id: 'r1' }, 401);

    expect(mockRedisClient.incr).toHaveBeenCalledWith('idfail:203.0.113.4:anon');
    expect(mockRedisClient.expire).toHaveBeenCalledWith('idfail:203.0.113.4:anon', 600);
  });

  test('does not score below the threshold', async () => {
    const { recordLoginOutcome } = loadCredentialStuffing('adaptive');
    mockRedisClient.incr.mockResolvedValue(5); // == threshold, not yet over

    await recordLoginOutcome({ path: '/api/auth/login', identity: '203.0.113.4:anon', id: 'r1' }, 401);

    expect(mockRedisClient.incrBy).not.toHaveBeenCalled();
  });

  test('scores with the base weight on the first failure past the threshold', async () => {
    const { recordLoginOutcome } = loadCredentialStuffing('adaptive');
    mockRedisClient.incr.mockResolvedValue(6); // threshold + 1

    await recordLoginOutcome({ path: '/api/auth/login', identity: '203.0.113.4:anon', id: 'r1' }, 401);

    expect(mockRedisClient.incrBy).toHaveBeenCalledWith('idscore:203.0.113.4:anon', 40);
  });

  test('escalates exponentially for further failures past the threshold', async () => {
    const { recordLoginOutcome } = loadCredentialStuffing('adaptive');
    mockRedisClient.incr.mockResolvedValue(8); // threshold + 3 -> 40 * 2^2 = 160

    await recordLoginOutcome({ path: '/api/auth/login', identity: '203.0.113.4:anon', id: 'r1' }, 401);

    expect(mockRedisClient.incrBy).toHaveBeenCalledWith('idscore:203.0.113.4:anon', 160);
  });

  test('resets the failure counter on a successful login', async () => {
    const { recordLoginOutcome } = loadCredentialStuffing('adaptive');

    await recordLoginOutcome({ path: '/api/auth/login', identity: '203.0.113.4:anon', id: 'r1' }, 200);

    expect(mockRedisClient.del).toHaveBeenCalledWith('idfail:203.0.113.4:anon');
  });
});

describe('credentialStuffingGate', () => {
  test('non-login paths pass through untouched', async () => {
    const { credentialStuffingGate } = loadCredentialStuffing('static');
    const { req, res, next } = makeReqRes({ path: '/api/accounts/1' });

    await credentialStuffingGate(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(mockRedisClient.get).not.toHaveBeenCalled();
  });

  test('adaptive mode never blocks at request time - defers to the tier engine', async () => {
    const { credentialStuffingGate } = loadCredentialStuffing('adaptive');
    mockRedisClient.get.mockResolvedValue('9');
    const { req, res, next } = makeReqRes();

    await credentialStuffingGate(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('static mode blocks with 429 once the failure count is over threshold', async () => {
    const { credentialStuffingGate } = loadCredentialStuffing('static');
    mockRedisClient.get.mockResolvedValue('6');
    const { req, res, next } = makeReqRes();

    await credentialStuffingGate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });

  test('static mode forwards when the failure count is at or below threshold', async () => {
    const { credentialStuffingGate } = loadCredentialStuffing('static');
    mockRedisClient.get.mockResolvedValue('5');
    const { req, res, next } = makeReqRes();

    await credentialStuffingGate(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});
