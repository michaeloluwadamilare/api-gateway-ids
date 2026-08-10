const { matchInjectionSignature } = require('../security/injectionSignatures');
const { logSecurityEvent } = require('../security/securityLogger');
const { recordRuleTrigger } = require('./compositeState');

const R1_WEIGHT = 50; // Table 2, Dissertation Proposal

function buildInspectionText(req) {
  // req.originalUrl is still percent-encoded (raw as received) - decode it
  // so signatures match the actual characters an attacker sent, not their
  // %XX escapes. req.query is already decoded by Express's query parser,
  // included too as a safety net for anything decodeURIComponent chokes on.
  let decodedUrl = req.originalUrl;
  try {
    decodedUrl = decodeURIComponent(req.originalUrl);
  } catch {
    // malformed escape sequence - fall back to the raw URL
  }
  return `${decodedUrl} ${JSON.stringify(req.query || {})} ${JSON.stringify(req.body || {})}`;
}

// R1: SQL/NoSQL injection (Table 2). Inspects the URL, query string, and
// JSON body - the request is fully formed by the time this runs (after
// jwtEnforcement + compositeState), so req.identity is already set.
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
