const { privateKey } = require('../helpers/testKeys'); // sets JWT_PUBLIC_KEY_B64 before config.js loads
const jwt = require('jsonwebtoken');

const mockRedisClient = {
  incrBy: jest.fn().mockResolvedValue(50),
  expire: jest.fn(),
};
jest.mock('../../src/redisClient', () => ({ redisClient: mockRedisClient }));

const mockLogSecurityEvent = jest.fn();
jest.mock('../../src/security/securityLogger', () => ({ logSecurityEvent: mockLogSecurityEvent }));

const jwtEnforcement = require('../../src/middleware/jwtEnforcement');

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeReqRes({ path = '/api/accounts/1', authHeader } = {}) {
  const req = {
    id: 'test-request-id',
    method: 'GET',
    path,
    originalUrl: path,
    ip: '203.0.113.4',
    headers: authHeader ? { authorization: authHeader } : {},
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

describe('jwtEnforcement - public paths', () => {
  test.each([
    '/health',
    '/api/auth/login',
    '/api/auth/register',
    '/openapi.json',
    '/docs',
    '/docs/swagger-ui.css',
  ])('lets %s through with no Authorization header', (path) => {
    const { req, res, next } = makeReqRes({ path });

    jwtEnforcement(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('jwtEnforcement - protected paths', () => {
  test('blocks with 401 when no Authorization header is present', () => {
    const { req, res, next } = makeReqRes();

    jwtEnforcement(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized', reason: 'missing_token' });
  });

  test('blocks with 401 for a non-Bearer scheme', () => {
    const { req, res, next } = makeReqRes({ authHeader: 'Basic dXNlcjpwYXNz' });

    jwtEnforcement(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('attaches req.auth and calls next() for a valid token', () => {
    const token = jwt.sign({ email: 'alice@example.com' }, privateKey, {
      algorithm: 'RS256',
      subject: '1',
      expiresIn: '15m',
    });
    const { req, res, next } = makeReqRes({ authHeader: `Bearer ${token}` });

    jwtEnforcement(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.auth).toEqual({ sub: '1', email: 'alice@example.com' });
  });

  test('blocks with 401 for an expired token', () => {
    const token = jwt.sign({ email: 'alice@example.com' }, privateKey, {
      algorithm: 'RS256',
      subject: '1',
      expiresIn: '-10s',
    });
    const { req, res, next } = makeReqRes({ authHeader: `Bearer ${token}` });

    jwtEnforcement(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized', reason: 'expired_token' });
  });

  test('blocks with 403 for a tampered signature', () => {
    const token = jwt.sign({ email: 'alice@example.com' }, privateKey, {
      algorithm: 'RS256',
      subject: '1',
      expiresIn: '15m',
    });
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'AA' ? 'BB' : 'AA');
    const { req, res, next } = makeReqRes({ authHeader: `Bearer ${tampered}` });

    jwtEnforcement(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('logs a security event on every rejection, after recording the R2 score', async () => {
    const { req, res, next } = makeReqRes();

    jwtEnforcement(req, res, next);
    await flush();

    expect(mockRedisClient.incrBy).toHaveBeenCalledWith('idscore:203.0.113.4:anon', 50);
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: 'R2', category: 'missing_token', action: 'blocked', score: 50 })
    );
  });

  test('still responds even if score recording fails (fire-and-forget, response not delayed by Redis)', async () => {
    mockRedisClient.incrBy.mockRejectedValueOnce(new Error('redis down'));
    const { req, res, next } = makeReqRes();

    jwtEnforcement(req, res, next);

    // response already sent synchronously, before the rejected promise settles
    expect(res.status).toHaveBeenCalledWith(401);

    await flush();
    expect(mockLogSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ score: null }));
  });
});
