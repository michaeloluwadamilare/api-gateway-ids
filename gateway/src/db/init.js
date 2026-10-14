const pool = require('./pool');

async function initializeAuditLog() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGSERIAL PRIMARY KEY,
      request_id TEXT,
      identity TEXT,
      mode TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      tier TEXT,
      score INTEGER,
      rules_triggered TEXT NOT NULL DEFAULT '[]',
      latency_ms DOUBLE PRECISION NOT NULL,
      run_label TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query('ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS prev_hash TEXT');
  await pool.query('ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS row_hash TEXT');

  await pool.query(
    'ALTER TABLE audit_log ALTER COLUMN rules_triggered TYPE TEXT USING rules_triggered::TEXT'
  );
  await pool.query('CREATE INDEX IF NOT EXISTS audit_log_identity_idx ON audit_log (identity)');
  await pool.query('CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS audit_log_run_label_idx ON audit_log (run_label)');
}

module.exports = { initializeAuditLog };
