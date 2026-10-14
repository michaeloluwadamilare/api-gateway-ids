const { isSequentialRun } = require('../../src/middleware/enumerationDetection');

describe('isSequentialRun (R5 sequential-ID heuristic)', () => {
  test('flags three consecutive ascending IDs', () => {
    expect(isSequentialRun([4, 5, 6])).toBe(true);
  });

  test('does not flag fewer than three IDs', () => {
    expect(isSequentialRun([4, 5])).toBe(false);
    expect(isSequentialRun([4])).toBe(false);
    expect(isSequentialRun([])).toBe(false);
  });

  test('does not flag a gap in the sequence', () => {
    expect(isSequentialRun([4, 5, 7])).toBe(false);
  });

  test('does not flag a non-monotonic or descending run', () => {
    expect(isSequentialRun([6, 5, 4])).toBe(false);
    expect(isSequentialRun([4, 6, 5])).toBe(false);
  });

  test('does not flag repeated fetches of the same ID', () => {
    expect(isSequentialRun([4, 4, 4])).toBe(false);
  });
});

describe('enumerationDetection middleware (R5)', () => {
  const mockRedisClient = {
    rPush: jest.fn(),
    lTrim: jest.fn(),
    expire: jest.fn(),
    lRange: jest.fn(),
    incrBy: jest.fn(),
  };
  const mockLogSecurityEvent = jest.fn();

  function loadEnumerationDetection(mode) {
    jest.resetModules();
    jest.doMock('../../src/redisClient', () => ({ redisClient: mockRedisClient }));
    jest.doMock('../../src/security/securityLogger', () => ({ logSecurityEvent: mockLogSecurityEvent }));
    jest.doMock('../../src/scoring', () => ({ ruleWeights: { R5: 35 }, mode, disabledRules: new Set() }));
    return require('../../src/middleware/enumerationDetection').enumerationDetection;
  }

  function makeReqRes({ path = '/api/users/6', ids = ['4', '5', '6'] } = {}) {
    mockRedisClient.lRange.mockResolvedValue(ids);
    const req = {
      id: 'test-request-id',
      identity: '203.0.113.4:1',
      method: 'GET',
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
    mockRedisClient.incrBy.mockResolvedValue(35);
  });

  test('non-resource paths pass through without touching Redis', async () => {
    const enumerationDetection = loadEnumerationDetection('adaptive');
    const { req, res, next } = makeReqRes({ path: '/api/transactions/search' });

    await enumerationDetection(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(mockRedisClient.rPush).not.toHaveBeenCalled();
  });

  test('a non-sequential recent history is not flagged', async () => {
    const enumerationDetection = loadEnumerationDetection('adaptive');
    const { req, res, next } = makeReqRes({ ids: ['4', '9', '6'] });

    await enumerationDetection(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(mockRedisClient.incrBy).not.toHaveBeenCalled();
  });

  test('static mode (Condition B) blocks immediately once three consecutive IDs are seen', async () => {
    const enumerationDetection = loadEnumerationDetection('static');
    const { req, res, next } = makeReqRes();

    await enumerationDetection(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockRedisClient.incrBy).toHaveBeenCalledWith('idscore:203.0.113.4:1', 35);
  });

  test('adaptive mode (Condition C) scores but forwards the request', async () => {
    const enumerationDetection = loadEnumerationDetection('adaptive');
    const { req, res, next } = makeReqRes();

    await enumerationDetection(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
    expect(mockRedisClient.incrBy).toHaveBeenCalledWith('idscore:203.0.113.4:1', 35);
    expect(req.triggeredRules).toEqual([expect.objectContaining({ ruleId: 'R5', weight: 35 })]);
  });
});
