const jwt = require('jsonwebtoken');

function loadPrivateKey() {
  const b64 = process.env.JWT_PRIVATE_KEY_B64;
  if (!b64) {
    throw new Error('JWT_PRIVATE_KEY_B64 is not set');
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}

const privateKey = loadPrivateKey();

function signToken(user) {
  return jwt.sign({ email: user.email }, privateKey, {
    algorithm: 'RS256',
    subject: String(user.id),
    expiresIn: '15m',
  });
}

module.exports = { signToken };
