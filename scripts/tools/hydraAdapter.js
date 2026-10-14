const http = require('http');
const { URLSearchParams } = require('url');

const PORT = Number(process.env.HYDRA_ADAPTER_PORT || 8090);
const TARGET_URL = process.env.TARGET_URL || 'http://localhost:8080';

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404);
    return res.end();
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });

  req.on('end', async () => {
    const params = new URLSearchParams(body);
    const email = params.get('email');
    const password = params.get('password');

    try {
      const upstream = await fetch(`${TARGET_URL}${req.url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(text);
    } catch (err) {
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'adapter upstream failure', detail: err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[hydra-adapter] listening on :${PORT}, forwarding to ${TARGET_URL}`);
});
