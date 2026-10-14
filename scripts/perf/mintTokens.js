const fs = require('fs');
const path = require('path');
const crypto = require('crypto');


function loadDemoPrivateKey() {
  const composePath = path.join(__dirname, '..', '..', 'docker-compose.yml');
  const contents = fs.readFileSync(composePath, 'utf8');
  const match = contents.match(/JWT_PRIVATE_KEY_B64=([A-Za-z0-9+/=]+)/);
  if (!match) {
    throw new Error(
      'Could not find JWT_PRIVATE_KEY_B64 in docker-compose.yml - has keypair been removed? ' +
        'mintPerfTokens needs a private key to sign with'
    );
  }
  return Buffer.from(match[1], 'base64').toString('utf8');
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function mintPerfTokens(count) {
  const privateKey = loadDemoPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const tokens = [];

  for (let i = 0; i < count; i++) {
    const sub = `perf-user-${i}`;
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({ sub, email: `${sub}@example.test`, iat: now, exp: now + 3600 }));
    const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
    tokens.push({ sub, token: `${header}.${payload}.${signature}` });
  }

  return tokens;
}

module.exports = { mintPerfTokens };
