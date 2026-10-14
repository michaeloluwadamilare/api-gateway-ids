const { matchInjectionSignature } = require('../security/injectionSignatures');
const { logSecurityEvent } = require('../security/securityLogger');
const { recordRuleTrigger } = require('./compositeState');
const { ruleWeights, mode, disabledRules } = require('../scoring');

function buildInspectionText(req) {
  let decodedUrl = req.originalUrl;
  try {
    decodedUrl = decodeURIComponent(req.originalUrl);
  } catch {
    // malformed escape sequence - fall back to the raw URL
  }
  return `${decodedUrl} ${JSON.stringify(req.query || {})} ${JSON.stringify(req.body || {})}`;
}

async function injectionDetection(req, res, next) {
  if (disabledRules.has('R1')) return next(); // ablation study (RQ4)

  const inspectionText = buildInspectionText(req);
  const matchedSignature = matchInjectionSignature(inspectionText);

  if (!matchedSignature) return next();

  try {
    const score = await recordRuleTrigger(req.identity, 'R1', ruleWeights.R1);
    req.triggeredRules?.push({ ruleId: 'R1', weight: ruleWeights.R1, signature: matchedSignature });

    logSecurityEvent({
      requestId: req.id,
      identity: req.identity,
      ruleId: 'R1',
      category: 'sql_nosql_injection',
      signature: matchedSignature,
      action: mode === 'static' ? 'blocked' : 'scored',
      score,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });

    if (mode === 'static') {
      return res.status(403).json({ error: 'blocked by IDS', ruleId: 'R1', signature: matchedSignature });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = injectionDetection;
