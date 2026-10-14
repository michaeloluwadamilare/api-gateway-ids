
// Run: node src/audit/verifyChain.js
const pool = require('../db/pool');
const { computeRowHash, GENESIS_HASH } = require('./auditLogger');

async function verifyChain() {
  const { rows } = await pool.query(
    `SELECT id, request_id, identity, mode, method, path, status_code, tier, score,
            rules_triggered, latency_ms, run_label, prev_hash, row_hash
     FROM audit_log
     ORDER BY id ASC`
  );

  let expectedPrevHash = null;
  let checked = 0;
  let skippedLegacy = 0;

  for (const row of rows) {
    if (row.row_hash === null) {
      skippedLegacy++;
      continue;
    }

    if (expectedPrevHash === null) {
      expectedPrevHash = row.prev_hash || GENESIS_HASH;
    }

    if (row.prev_hash !== expectedPrevHash) {
      return {
        ok: false,
        brokenAtId: row.id,
        reason: `row ${row.id}'s prev_hash doesn't match the chain - expected ${expectedPrevHash}, found ${row.prev_hash}. A row between these two was likely deleted or reordered.`,
        checked,
      };
    }

    const recomputed = computeRowHash(row.prev_hash, {
      requestId: row.request_id,
      identity: row.identity,
      mode: row.mode,
      method: row.method,
      path: row.path,
      statusCode: row.status_code,
      tier: row.tier,
      score: row.score,
      rulesTriggered: JSON.parse(row.rules_triggered),
      latencyMs: row.latency_ms,
      runLabel: row.run_label,
    });

    if (recomputed !== row.row_hash) {
      return {
        ok: false,
        brokenAtId: row.id,
        reason: `row ${row.id}'s stored hash doesn't match its own fields - this row's data was modified after it was written.`,
        checked,
      };
    }

    expectedPrevHash = row.row_hash;
    checked += 1;
  }

  return { ok: true, checked, skippedLegacy, totalRows: rows.length };
}

async function main() {
  const result = await verifyChain();
  if (result.ok) {
    const legacyNote = result.skippedLegacy
      ? `, ${result.skippedLegacy} pre-migration row(s) skipped (outside chain coverage)`
      : '';
    console.log(`Chain intact: ${result.checked} row(s) verified${legacyNote}.`);
  } else {
    console.error(`TAMPER DETECTED: ${result.reason}`);
    console.error(`(${result.checked} row(s) verified before the break)`);
  }
  await pool.end();
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { verifyChain };
