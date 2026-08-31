const { redisClient } = require('../redisClient');
const { recordRuleTrigger, OBSERVATION_WINDOW_SECONDS } = require('./compositeState');
const { logSecurityEvent } = require('../security/securityLogger');

const RESOURCE_PATH_PATTERN = /^\/api\/(users|accounts)\/(\d+)(?:\/|$)/;
const R5_WEIGHT = 35;
const RECENT_IDS_TO_CHECK = 3;

function isSequentialRun(ids) {
  if (ids.length < RECENT_IDS_TO_CHECK) return false;
  for (let i = 1; i < ids.length; i++) {
    if (ids[i] - ids[i - 1] !== 1) return false;
  }
  return true;
}

// Detect-only: a real user paging through their own resources can produce
// the same ascending-ID shape, so this scores and logs but doesn't block
// until it's calibrated against real traffic.
async function enumerationDetection(req, res, next) {
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

    if (isSequentialRun(recentIds)) {
      const score = await recordRuleTrigger(req.identity, 'R5', R5_WEIGHT);

      logSecurityEvent({
        requestId: req.id,
        identity: req.identity,
        ruleId: 'R5',
        category: 'bola_id_enumeration',
        action: 'detected',
        resourceType,
        recentIds,
        score,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { enumerationDetection, isSequentialRun };
