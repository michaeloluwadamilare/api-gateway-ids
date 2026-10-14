const jwt = require('jsonwebtoken');
const { jwtPublicKeyB64 } = require('../config');

function loadPublicKey() {
  if (!jwtPublicKeyB64) {
    throw new Error('JWT_PUBLIC_KEY_B64 is not set');
  }
  return Buffer.from(jwtPublicKeyB64, 'base64').toString('utf8');
}

const publicKey = loadPublicKey();


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

function decodeUnverified(token) {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
}

module.exports = { verifyToken, decodeUnverified };
