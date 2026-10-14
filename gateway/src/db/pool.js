const { Pool } = require('pg');
const { db } = require('../config');

const pool = new Pool({
  host: db.host,
  port: db.port,
  database: db.name,
  user: db.user,
  password: db.password,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[gateway] Unexpected Postgres error:', err.message);
});

module.exports = pool;
