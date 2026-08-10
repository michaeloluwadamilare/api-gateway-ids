const { verifyToken } = require('../security/jwt');
const { logSecurityEvent } = require('../security/securityLogger');
const { publicPaths, publicPathPrefixes } = require('../config');

function isPublicPath(req) {
  return (
    publicPaths.some((path) => req.path === path) ||
    publicPathPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))
  );
}

function reject(req, res, status, category, reason) {
  logSecurityEvent({
    requestId: req.id,
    ruleId: 'R2',
    category,
    action: 'blocked',
    reason,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  });
  res.status(status).json({ error: 'unauthorized', reason: category });
}

function jwtEnforcement(req, res, next) {
  if (isPublicPath(req)) return next();

  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return reject(req, res, 401, 'missing_token', 'no Bearer token provided');
  }

  const result = verifyToken(token);
  if (!result.ok) {
    const status = result.category === 'expired_token' ? 401 : 403;
    return reject(req, res, status, result.category, result.reason);
  }

  req.auth = { sub: result.decoded.sub, email: result.decoded.email };
  next();
}

module.exports = jwtEnforcement;
