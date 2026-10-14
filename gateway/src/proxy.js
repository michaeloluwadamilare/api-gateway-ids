const http = require('http');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const { backendUrl } = require('./config');
const { recordLoginOutcome } = require('./security/credentialStuffing');

const backendAgent = new http.Agent({ keepAlive: true, maxSockets: 256 });

module.exports = createProxyMiddleware({
  target: backendUrl,
  changeOrigin: true,
  agent: backendAgent,
  logLevel: 'warn',
  onProxyReq(proxyReq, req) {
    if (req.id) proxyReq.setHeader('X-Request-Id', req.id);
    fixRequestBody(proxyReq, req);
  },
  onProxyRes(proxyRes, req) {
    recordLoginOutcome(req, proxyRes.statusCode).catch((err) => {
      console.error('[gateway] R4 login-outcome recording failed:', err.message);
    });
  },
  onError(err, req, res) {
    console.error(`[gateway] proxy error for ${req.method} ${req.originalUrl}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'backend unreachable' });
    }
  },
});
