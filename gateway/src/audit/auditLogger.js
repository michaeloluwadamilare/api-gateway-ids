const crypto = require('crypto');
const pool = require('../db/pool');

const GENESIS_HASH = '0'.repeat(64);


const CHAIN_LOCK_KEY = 872234;

function computeRowHash(prevHash, fields) {
  const canonical = JSON.stringify({
    prevHash,
    requestId: fields.requestId,
    identity: fields.identity,
    mode: fields.mode,
    method: fields.method,
    path: fields.path,
    statusCode: fields.statusCode,
    tier: fields.tier,
    score: fields.score,
    rulesTriggered: fields.rulesTriggered,
    latencyMs: fields.latencyMs,
    runLabel: fields.runLabel,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

async function writeAuditRow(event) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [CHAIN_LOCK_KEY]);

    const { rows } = await client.query('SELECT row_hash FROM audit_log ORDER BY id DESC LIMIT 1');
    const prevHash = rows[0]?.row_hash || GENESIS_HASH;

    const fields = {
      requestId: event.requestId,
      identity: event.identity,
      mode: event.mode,
      method: event.method,
      path: event.path,
      statusCode: event.statusCode,
      tier: event.tier,
      score: event.score,
      rulesTriggered: event.rulesTriggered || [],
      latencyMs: event.latencyMs,
      runLabel: event.runLabel || process.env.EXPERIMENT_RUN_LABEL || null,
    };
    const rowHash = computeRowHash(prevHash, fields);

    await client.query(
      `INSERT INTO audit_log
        (request_id, identity, mode, method, path, status_code, tier, score, rules_triggered, latency_ms, run_label, prev_hash, row_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        fields.requestId,
        fields.identity,
        fields.mode,
        fields.method,
        fields.path,
        fields.statusCode,
        fields.tier,
        fields.score,
        JSON.stringify(fields.rulesTriggered),
        fields.latencyMs,
        fields.runLabel,
        prevHash,
        rowHash,
      ]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[gateway] audit log write failed:', err.message);
  } finally {
    client.release();
  }
}

let queue = Promise.resolve();

function logAuditEvent(event) {
  queue = queue.then(() => writeAuditRow(event)).catch((err) => {
    console.error('[gateway] audit log write failed:', err.message);
  });
  return queue;
}

module.exports = { logAuditEvent, computeRowHash, GENESIS_HASH };
