const { verifyToken, decodeUnverified } = require('../security/jwt');
const { logSecurityEvent } = require('../security/securityLogger');
const { publicPaths, publicPathPrefixes } = require('../config');
const { getCompositeIdentity } = require('../security/identity');
const { recordRuleTrigger } = require('./compositeState');
const { ruleWeights, disabledRules } = require('../scoring');

function isPublicPath(req) {
  return (
    publicPaths.some((path) => req.path === path) ||
    publicPathPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))
  );
}


function reject(req, res, status, category, reason) {
  const identity = getCompositeIdentity(req);

  recordRuleTrigger(identity, 'R2', ruleWeights.R2)
    .then((score) => {
      logSecurityEvent({
        requestId: req.id,
        identity,
        ruleId: 'R2',
        category,
        action: 'blocked',
        reason,
        score,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    })
    .catch((err) => {
      console.error('[gateway] R2 score recording failed:', err.message);
      logSecurityEvent({
        requestId: req.id,
        identity,
        ruleId: 'R2',
        category,
        action: 'blocked',
        reason,
        score: null,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    });

  res.status(status).json({ error: 'unauthorized', reason: category });
}

function jwtEnforcement(req, res, next) {
  if (isPublicPath(req)) return next();

  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');


  if (disabledRules.has('R2')) {
    if (scheme === 'Bearer' && token) {
      const decoded = decodeUnverified(token);
      if (decoded) req.auth = { sub: decoded.sub, email: decoded.email };
    }
    return next();
  }

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
