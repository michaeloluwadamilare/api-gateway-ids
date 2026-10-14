const { redisClient } = require('../redisClient');
const { recordRuleTrigger } = require('../middleware/compositeState');
const { logSecurityEvent } = require('./securityLogger');
const { ruleWeights, r4, mode, disabledRules } = require('../scoring');

const LOGIN_PATH = '/api/auth/login';

function isLoginPath(path) {
  return path === LOGIN_PATH;
}

async function getFailureCount(identity) {
  const raw = await redisClient.get(`idfail:${identity}`);
  return raw ? Number(raw) : 0;
}

async function recordLoginOutcome(req, statusCode) {
  if (disabledRules.has('R4')) return; // ablation study (RQ4)
  if (!isLoginPath(req.path) || !req.identity) return;

  const failKey = `idfail:${req.identity}`;

  if (statusCode === 401) {
    const failCount = await redisClient.incr(failKey);
    if (failCount === 1) {
      await redisClient.expire(failKey, r4.windowSeconds);
    }

    if (failCount > r4.threshold) {
      const exponent = failCount - r4.threshold;
      const weight = Math.round(ruleWeights.R4 * r4.exponentialFactor ** (exponent - 1));
      const score = await recordRuleTrigger(req.identity, 'R4', weight);

      logSecurityEvent({
        requestId: req.id,
        identity: req.identity,
        ruleId: 'R4',
        category: 'credential_stuffing',
        action: 'scored',
        consecutiveFailures: failCount,
        weight,
        score,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    }
  } else if (statusCode === 200) {
    await redisClient.del(failKey);
  }
}


async function credentialStuffingGate(req, res, next) {
  if (disabledRules.has('R4')) return next(); // ablation study (RQ4)
  if (!isLoginPath(req.path)) return next();

  try {
    if (mode === 'static') {
      const failCount = await getFailureCount(req.identity);
      if (failCount > r4.threshold) {
        req.triggeredRules?.push({
          ruleId: 'R4',
          action: 'blocked_precheck',
          consecutiveFailures: failCount,
        });

        logSecurityEvent({
          requestId: req.id,
          identity: req.identity,
          ruleId: 'R4',
          category: 'credential_stuffing',
          action: 'blocked',
          consecutiveFailures: failCount,
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
        });

        return res.status(429).json({
          error: 'blocked by IDS',
          ruleId: 'R4',
          reason: 'credential_stuffing_threshold_exceeded',
        });
      }
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { credentialStuffingGate, recordLoginOutcome, isLoginPath, getFailureCount };
