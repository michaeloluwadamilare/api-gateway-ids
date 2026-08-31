const { redisClient } = require('../redisClient');
const { getCompositeIdentity } = require('../security/identity');

const OBSERVATION_WINDOW_SECONDS = 600;

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

module.exports = { compositeState, recordRuleTrigger, OBSERVATION_WINDOW_SECONDS };
