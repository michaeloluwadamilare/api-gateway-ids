require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT),
  backendUrl: process.env.BACKEND_URL,
  env: process.env.NODE_ENV || 'development',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtPublicKeyB64: process.env.JWT_PUBLIC_KEY_B64,
  publicPaths: ['/health', '/api/auth/login', '/api/auth/register', '/openapi.json'],
  // Swagger UI serves assets/redirects under /docs/* (not just /docs itself).
  publicPathPrefixes: ['/docs'],
};
