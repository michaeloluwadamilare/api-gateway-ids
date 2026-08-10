const express = require('express');

const requestId = require('./middleware/requestId');
const { consoleLogger, fileLogger } = require('./logger');
const healthRoutes = require('./routes/health');
const jwtEnforcement = require('./middleware/jwtEnforcement');
const { compositeState } = require('./middleware/compositeState');
const injectionDetection = require('./middleware/injectionDetection');
const proxy = require('./proxy');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(consoleLogger);
  app.use(fileLogger);
  app.use(express.json());

  app.use(healthRoutes);
  app.use(jwtEnforcement);
  app.use(compositeState);
  app.use(injectionDetection);
  app.use(proxy);

  return app;
}

module.exports = createApp;
