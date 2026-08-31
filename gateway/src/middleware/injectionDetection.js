const { matchInjectionSignature } = require('../security/injectionSignatures');
const { logSecurityEvent } = require('../security/securityLogger');
const { recordRuleTrigger } = require('./compositeState');

const R1_WEIGHT = 50;

function buildInspectionText(req) {
  // req.originalUrl is still percent-encoded - decode it so signatures
  // match the actual characters sent, not their %XX escapes.
  let decodedUrl = req.originalUrl;
  try {
    decodedUrl = decodeURIComponent(req.originalUrl);
  } catch {
    // malformed escape sequence - fall back to the raw URL
  }
  return `${decodedUrl} ${JSON.stringify(req.query || {})} ${JSON.stringify(req.body || {})}`;
}

async function injectionDetection(req, res, next) {
  const inspectionText = buildInspectionText(req);
  const matchedSignature = matchInjectionSignature(inspectionText);

  if (!matchedSignature) return next();

  try {
    const score = await recordRuleTrigger(req.identity, 'R1', R1_WEIGHT);

    logSecurityEvent({
      requestId: req.id,
      identity: req.identity,
      ruleId: 'R1',
      category: 'sql_nosql_injection',
      signature: matchedSignature,
      action: 'blocked',
      score,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });

    return res.status(403).json({ error: 'blocked by IDS', ruleId: 'R1', signature: matchedSignature });
  } catch (err) {
    return next(err);
  }
}

module.exports = injectionDetection;
