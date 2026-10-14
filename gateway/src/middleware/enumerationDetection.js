const { redisClient } = require('../redisClient');
const { recordRuleTrigger, OBSERVATION_WINDOW_SECONDS } = require('./compositeState');
const { logSecurityEvent } = require('../security/securityLogger');
const { ruleWeights, mode, disabledRules } = require('../scoring');

const RESOURCE_PATH_PATTERN = /^\/api\/(users|accounts)\/(\d+)(?:\/|$)/;
const RECENT_IDS_TO_CHECK = 3;

function isSequentialRun(ids) {
  if (ids.length < RECENT_IDS_TO_CHECK) return false;
  for (let i = 1; i < ids.length; i++) {
    if (ids[i] - ids[i - 1] !== 1) return false;
  }
  return true;
}

async function enumerationDetection(req, res, next) {
  if (disabledRules.has('R5')) return next(); // ablation study (RQ4)

  const match = RESOURCE_PATH_PATTERN.exec(req.path);
  if (!match) return next();

  const [, resourceType, idStr] = match;
  const id = Number(idStr);

  try {
    const seqKey = `idseq:${req.identity}:${resourceType}`;
    await redisClient.rPush(seqKey, String(id));
    await redisClient.lTrim(seqKey, -RECENT_IDS_TO_CHECK, -1);
    await redisClient.expire(seqKey, OBSERVATION_WINDOW_SECONDS);

    const recent = await redisClient.lRange(seqKey, 0, -1);
    const recentIds = recent.map(Number);

    if (!isSequentialRun(recentIds)) return next();

    const score = await recordRuleTrigger(req.identity, 'R5', ruleWeights.R5);
    req.triggeredRules?.push({ ruleId: 'R5', weight: ruleWeights.R5, resourceType, recentIds });

    logSecurityEvent({
      requestId: req.id,
      identity: req.identity,
      ruleId: 'R5',
      category: 'bola_id_enumeration',
      action: mode === 'static' ? 'blocked' : 'scored',
      resourceType,
      recentIds,
      score,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });

    if (mode === 'static') {
      return res
        .status(403)
        .json({ error: 'blocked by IDS', ruleId: 'R5', reason: 'sequential_id_enumeration' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { enumerationDetection, isSequentialRun };
