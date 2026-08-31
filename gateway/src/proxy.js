const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const { backendUrl } = require('./config');

module.exports = createProxyMiddleware({
  target: backendUrl,
  changeOrigin: true,
  logLevel: 'warn',
  onProxyReq(proxyReq, req) {
    if (req.id) proxyReq.setHeader('X-Request-Id', req.id);
    // express.json() upstream already consumed the body stream - re-serialise it.
    fixRequestBody(proxyReq, req);
  },
  onError(err, req, res) {
    console.error(`[gateway] proxy error for ${req.method} ${req.originalUrl}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'backend unreachable' });
    }
  },
});
