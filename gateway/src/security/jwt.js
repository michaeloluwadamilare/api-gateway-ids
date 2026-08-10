const jwt = require('jsonwebtoken');
const { jwtPublicKeyB64 } = require('../config');

function loadPublicKey() {
  if (!jwtPublicKeyB64) {
    throw new Error('JWT_PUBLIC_KEY_B64 is not set');
  }
  return Buffer.from(jwtPublicKeyB64, 'base64').toString('utf8');
}

const publicKey = loadPublicKey();

// Categorises jsonwebtoken's verify() failures so security events say what
// actually happened (expired vs an outright forged/tampered token) instead
// of a generic "unauthorized". Restricting `algorithms` to RS256 is itself
// the RFC 8725 fix for `none`-alg and RS256/HS256 confusion attacks - both
// surface here as 'invalid signature' or 'disallowed algorithm'.
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    return { ok: true, decoded };
  } catch (err) {
    let category = 'invalid_token';
    if (err.name === 'TokenExpiredError') category = 'expired_token';
    else if (err.message === 'invalid algorithm') category = 'disallowed_algorithm';
    else if (err.name === 'JsonWebTokenError') category = 'invalid_signature';

    return { ok: false, category, reason: err.message };
  }
}

module.exports = { verifyToken };
