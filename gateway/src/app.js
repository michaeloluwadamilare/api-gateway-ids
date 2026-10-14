const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { trustProxy } = require('./config');
const requestId = require('./middleware/requestId');
const auditLog = require('./middleware/auditLog');
const { consoleLogger, fileLogger } = require('./logger');
const healthRoutes = require('./routes/health');
const jwtEnforcement = require('./middleware/jwtEnforcement');
const { compositeState } = require('./middleware/compositeState');
const blocklistCheck = require('./middleware/blocklistCheck');
const { credentialStuffingGate } = require('./security/credentialStuffing');
const rateAbuseDetection = require('./middleware/rateAbuseDetection');
const injectionDetection = require('./middleware/injectionDetection');
const { enumerationDetection } = require('./middleware/enumerationDetection');
const tierPolicyEngine = require('./middleware/tierPolicyEngine');
const proxy = require('./proxy');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', true); // see config.js - default off, harness opts in
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(requestId);
  app.use(auditLog);
  app.use(consoleLogger);
  app.use(fileLogger);
  app.use(express.json({ limit: '100kb' })); // explicit, not the implicit default - an IDS gateway reasoning about abuse traffic shouldn't leave this accidental

  app.use(healthRoutes);
  app.use(jwtEnforcement); // R2 - unconditional pre-routing gate
  app.use(compositeState); // assigns req.identity, composite request counter
  app.use(blocklistCheck); // T4 short-circuit (adaptive mode only)
  app.use(credentialStuffingGate); // R4 request-time gate (static mode only)
  app.use(rateAbuseDetection); // R3
  app.use(injectionDetection); // R1
  app.use(enumerationDetection); // R5
  app.use(tierPolicyEngine); // Tier-Based Policy Engine (adaptive mode only)
  app.use(proxy);


  app.use((err, req, res, next) => {
    console.error(`[gateway] unhandled error for ${req.method} ${req.originalUrl}:`, err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({
      error: 'internal server error',
      ...(process.env.NODE_ENV !== 'production' ? { detail: err.message } : {}),
    });
  });

  return app;
}

module.exports = createApp;
