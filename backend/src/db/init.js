const bcrypt = require('bcryptjs');
const pool = require('./pool');

const SEED_PASSWORD_HASH = bcrypt.hashSync('Password123!', 10);

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        iban VARCHAR(34) NOT NULL,
        balance DECIMAL(19, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        amount DECIMAL(19, 2) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const result = await pool.query('SELECT COUNT(*) FROM users');
    const isFirstSeed = result.rows[0].count === '0';

    await pool.query(
      `
        INSERT INTO users (email, password, display_name) VALUES
        ('alice@example.com', $1, 'Alice Ng'),
        ('bob@example.com', $1, 'Bob Idris'),
        ('chloe@example.com', $1, 'Chloe Okafor')
        ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password
      `,
      [SEED_PASSWORD_HASH]
    );

    if (isFirstSeed) {
      await pool.query(`
        INSERT INTO accounts (user_id, iban, balance, currency) VALUES
        (1, 'GB29NWBK60161331926819', 2450.75, 'GBP'),
        (2, 'GB29NWBK60161331926820', 187.2, 'GBP'),
        (3, 'GB29NWBK60161331926821', 9999.99, 'GBP')
      `);

      await pool.query(`
        INSERT INTO transactions (account_id, amount, description, created_at) VALUES
        (1, -42.5, 'Tesco Superstore', '2026-07-01T09:12:00Z'),
        (1, -15.0, 'TfL Travel', '2026-07-02T08:03:00Z'),
        (2, 500.0, 'Salary', '2026-07-01T00:00:00Z'),
        (3, -1200.0, 'Rent', '2026-07-01T06:00:00Z')
      `);

      console.log('[database] Seeded initial data');
    }

    console.log('[database] Database initialized successfully');
  } catch (err) {
    console.error('[database] Failed to initialize database:', err);
    throw err;
  }
}

module.exports = initializeDatabase;
