require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT),
  backendUrl: process.env.BACKEND_URL,
  env: process.env.NODE_ENV || 'development',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtPublicKeyB64: process.env.JWT_PUBLIC_KEY_B64,
  trustProxy: process.env.TRUST_PROXY === 'true',
  publicPaths: ['/health', '/api/auth/login', '/api/auth/register', '/openapi.json'],
  // Swagger UI serves assets/redirects under /docs/* (not just /docs itself).
  publicPathPrefixes: ['/docs'],
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    name: process.env.DB_NAME || 'api_ids_db',
    // (shares the backend's Postgres database; writes to its own `audit_log` table)
    user: process.env.DB_USER || 'api_user',
    password: process.env.DB_PASSWORD || 'api_password',
  },
};
