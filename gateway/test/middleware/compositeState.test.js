const mockRedisClient = {
  incr: jest.fn(),
  incrBy: jest.fn(),
  expire: jest.fn(),
};

jest.mock('../../src/redisClient', () => ({ redisClient: mockRedisClient }));

const { compositeState, recordRuleTrigger } = require('../../src/middleware/compositeState');

function makeReqRes({ ip = '203.0.113.4', auth } = {}) {
  const req = { ip, auth };
  const res = {};
  const next = jest.fn();
  return { req, res, next };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('compositeState middleware', () => {
  test('sets req.identity from IP + JWT subject and increments the Redis request counter', async () => {
    const { req, res, next } = makeReqRes({ auth: { sub: '1' } });
    mockRedisClient.incr.mockResolvedValue(1);

    await compositeState(req, res, next);

    expect(req.identity).toBe('203.0.113.4:1');
    expect(mockRedisClient.incr).toHaveBeenCalledWith('idreq:203.0.113.4:1');
    expect(next).toHaveBeenCalledWith(); // no error
  });

  test('sets a TTL only on the first request for an identity (INCR returns 1)', async () => {
    const { req, res, next } = makeReqRes({ auth: { sub: '1' } });
    mockRedisClient.incr.mockResolvedValue(1);

    await compositeState(req, res, next);

    expect(mockRedisClient.expire).toHaveBeenCalledWith('idreq:203.0.113.4:1', 600);
  });

  test('does not reset the TTL on subsequent requests for the same identity', async () => {
    const { req, res, next } = makeReqRes({ auth: { sub: '1' } });
    mockRedisClient.incr.mockResolvedValue(4); // 4th request in the window

    await compositeState(req, res, next);

    expect(mockRedisClient.expire).not.toHaveBeenCalled();
  });

  test('passes Redis errors to next(err) instead of throwing', async () => {
    const { req, res, next } = makeReqRes({ auth: { sub: '1' } });
    const err = new Error('redis connection lost');
    mockRedisClient.incr.mockRejectedValue(err);

    await compositeState(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

describe('recordRuleTrigger (composite-identity scoring)', () => {
  test('increments the identity score by the rule weight and refreshes its TTL', async () => {
    mockRedisClient.incrBy.mockResolvedValue(50);

    const score = await recordRuleTrigger('203.0.113.4:1', 'R1', 50);

    expect(mockRedisClient.incrBy).toHaveBeenCalledWith('idscore:203.0.113.4:1', 50);
    expect(mockRedisClient.expire).toHaveBeenCalledWith('idscore:203.0.113.4:1', 600);
    expect(score).toBe(50);
  });

  test('accumulates across repeated triggers for the same identity', async () => {
    mockRedisClient.incrBy.mockResolvedValueOnce(50).mockResolvedValueOnce(100);

    const first = await recordRuleTrigger('203.0.113.4:1', 'R1', 50);
    const second = await recordRuleTrigger('203.0.113.4:1', 'R1', 50);

    expect(first).toBe(50);
    expect(second).toBe(100);
  });
});
