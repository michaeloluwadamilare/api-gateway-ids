const pool = require('../db/pool');

async function findTransactionsByAccountId(accountId) {
  const result = await pool.query(
    'SELECT id, account_id as "accountId", amount, description, created_at as "createdAt" FROM transactions WHERE account_id = $1 ORDER BY created_at DESC',
    [accountId]
  );
  return result.rows;
}

async function addTransaction({ accountId, amount, description }) {
  const result = await pool.query(
    'INSERT INTO transactions (account_id, amount, description, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING id, account_id as "accountId", amount, description, created_at as "createdAt"',
    [accountId, amount, description || '']
  );
  return result.rows[0];
}

// Free-text query param, deliberately unsanitised beyond basic type checks -
// this is the injection target (R1) from Table 4 of the proposal.
async function searchTransactions(query) {
  if (!query) {
    const result = await pool.query(
      'SELECT id, account_id as "accountId", amount, description, created_at as "createdAt" FROM transactions ORDER BY created_at DESC'
    );
    return result.rows;
  }

  const result = await pool.query(
    'SELECT id, account_id as "accountId", amount, description, created_at as "createdAt" FROM transactions WHERE description ILIKE $1 ORDER BY created_at DESC',
    [`%${query}%`]
  );
  return result.rows;
}

module.exports = { findTransactionsByAccountId, addTransaction, searchTransactions };
