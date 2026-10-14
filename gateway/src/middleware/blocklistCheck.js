const { isBlocklisted } = require('./compositeState');
const { logSecurityEvent } = require('../security/securityLogger');
const { mode } = require('../scoring');

async function blocklistCheck(req, res, next) {
  if (mode !== 'adaptive') return next();

  try {
    const blocked = await isBlocklisted(req.identity);
    if (!blocked) return next();

    req.tier = 'T4';
    req.triggeredRules?.push({ ruleId: 'TIER', action: 'blocked_precheck' });

    logSecurityEvent({
      requestId: req.id,
      identity: req.identity,
      ruleId: 'TIER',
      category: 'blocklisted',
      action: 'blocked',
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });

    return res.status(403).json({ error: 'blocked by IDS', reason: 'identity_blocklisted' });
  } catch (err) {
    return next(err);
  }
}

module.exports = blocklistCheck;
