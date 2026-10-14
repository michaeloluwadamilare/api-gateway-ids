const { logAuditEvent } = require('../audit/auditLogger');
const { mode } = require('../scoring');

function auditLog(req, res, next) {
  const startedAt = process.hrtime.bigint();
  req.triggeredRules = [];

  res.on('finish', () => {
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logAuditEvent({
      requestId: req.id,
      identity: req.identity || null,
      mode,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      tier: req.tier || null,
      score: req.finalScore ?? null,
      rulesTriggered: req.triggeredRules,
      latencyMs,
    });
  });

  next();
}

module.exports = auditLog;
