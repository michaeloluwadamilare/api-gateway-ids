const crypto = require('crypto');

// Ephemeral keypair, never the real deployment keys. Sets
// JWT_PUBLIC_KEY_B64 before config.js loads, so jwt.js verifies against this pair.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});

process.env.JWT_PUBLIC_KEY_B64 = Buffer.from(publicKey).toString('base64');

module.exports = { publicKey, privateKey };
