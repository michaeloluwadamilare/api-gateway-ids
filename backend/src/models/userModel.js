const pool = require('../db/pool');

async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT id, email, password, display_name as "displayName" FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await pool.query(
    'SELECT id, email, password, display_name as "displayName" FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

module.exports = { findUserByEmail, findUserById };
