const pool = require('../db/pool');

async function findAccountById(id) {
  const result = await pool.query(
    'SELECT id, user_id as "userId", iban, balance, currency FROM accounts WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

module.exports = { findAccountById };
