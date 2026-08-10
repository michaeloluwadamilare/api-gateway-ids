const { redisClient } = require('../redisClient');
const { getCompositeIdentity } = require('../security/identity');

const OBSERVATION_WINDOW_SECONDS = 600;

// Wires up the composite-identity state store the cumulative scoring model
// (R3/R4, tier engine) will read from later. For now it just proves the
// state exists and is addressable per identity (visible via redis-cli),
// per the supervisor's "prepare for behavioural risk scoring" ask.
async function compositeState(req, res, next) {
  try {
    req.identity = getCompositeIdentity(req);

    const requestCountKey = `idreq:${req.identity}`;
    const requestCount = await redisClient.incr(requestCountKey);
    if (requestCount === 1) {
      await redisClient.expire(requestCountKey, OBSERVATION_WINDOW_SECONDS);
    }

    next();
  } catch (err) {
    next(err);
  }
}

async function recordRuleTrigger(identity, ruleId, weight) {
  const scoreKey = `idscore:${identity}`;
  const score = await redisClient.incrBy(scoreKey, weight);
  await redisClient.expire(scoreKey, OBSERVATION_WINDOW_SECONDS);
  return score;
}

module.exports = { compositeState, recordRuleTrigger };
