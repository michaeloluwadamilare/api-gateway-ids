const { getScore, blocklistIdentity } = require('./compositeState');
const { logSecurityEvent } = require('../security/securityLogger');
const {
  mode,
  tierForScore,
  blocklistTtlSeconds,
  t2DelayMs,
  t3ForwardRatio,
  t3DelayMs,
} = require('../scoring');

const t3Counters = new Map();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function admitRatio(identity) {
  const count = (t3Counters.get(identity) || 0) + 1;
  t3Counters.set(identity, count);
  const every = Math.max(1, Math.round(1 / t3ForwardRatio));
  return count % every === 0;
}


async function tierPolicyEngine(req, res, next) {
  if (mode !== 'adaptive') return next();

  try {
    const score = await getScore(req.identity);
    const tier = tierForScore(score);
    req.tier = tier.id;
    req.finalScore = score;
    res.setHeader('X-IDS-Tier', tier.id);
    res.setHeader('X-IDS-Score', String(score));

    if (tier.id === 'T1') {
      return next();
    }

    if (tier.id === 'T2') {
      logSecurityEvent({
        requestId: req.id,
        identity: req.identity,
        ruleId: 'TIER',
        category: 'tier_elevated',
        action: 'forwarded_degraded',
        tier: tier.id,
        score,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
      await delay(t2DelayMs);
      return next();
    }

    if (tier.id === 'T3') {
      const admit = admitRatio(req.identity);

      logSecurityEvent({
        requestId: req.id,
        identity: req.identity,
        ruleId: 'TIER',
        category: 'tier_high',
        action: admit ? 'forwarded_throttled' : 'challenged',
        tier: tier.id,
        score,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      await delay(t3DelayMs);

      if (!admit) {
        return res.status(429).json({
          error: 'challenge required',
          ruleId: 'TIER',
          tier: tier.id,
          reason: 'elevated_risk_score',
          retryAfterMs: t3DelayMs,
        });
      }
      return next();
    }

   
    await blocklistIdentity(req.identity, blocklistTtlSeconds);

    logSecurityEvent({
      requestId: req.id,
      identity: req.identity,
      ruleId: 'TIER',
      category: 'tier_critical',
      action: 'blocked',
      tier: tier.id,
      score,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });

    return res
      .status(403)
      .json({ error: 'blocked by IDS', ruleId: 'TIER', tier: tier.id, reason: 'critical_risk_score' });
  } catch (err) {
    return next(err);
  }
}

module.exports = tierPolicyEngine;
