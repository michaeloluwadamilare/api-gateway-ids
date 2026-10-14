const { redisClient } = require('../redisClient');
const { recordRuleTrigger } = require('./compositeState');
const { logSecurityEvent } = require('../security/securityLogger');
const { ruleWeights, r3, mode, disabledRules } = require('../scoring');

async function rateAbuseDetection(req, res, next) {
  if (disabledRules.has('R3')) return next(); // ablation study (RQ4)

  try {
    const windowKey = `idrate:${req.identity}`;
    const count = await redisClient.incr(windowKey);
    if (count === 1) {
      await redisClient.expire(windowKey, r3.windowSeconds);
    }

    if (count <= r3.threshold) return next();

    const score = await recordRuleTrigger(req.identity, 'R3', ruleWeights.R3);
    req.triggeredRules?.push({ ruleId: 'R3', weight: ruleWeights.R3, windowCount: count });

    logSecurityEvent({
      requestId: req.id,
      identity: req.identity,
      ruleId: 'R3',
      category: 'rate_abuse',
      action: mode === 'static' ? 'blocked' : 'scored',
      windowCount: count,
      score,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });

    if (mode === 'static') {
      return res
        .status(429)
        .json({ error: 'blocked by IDS', ruleId: 'R3', reason: 'rate_threshold_exceeded' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = rateAbuseDetection;
