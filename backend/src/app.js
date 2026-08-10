const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const openapiSpec = require('./openapi');

function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use('/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(openapiSpec));

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.get('/openapi.json', (req, res) => res.json(openapiSpec));
  app.use(healthRoutes);
  app.use('/api', authRoutes);
  app.use('/api', userRoutes);
  app.use('/api', accountRoutes);
  app.use('/api', transactionRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: `no route for ${req.method} ${req.originalUrl}` });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = createApp;
