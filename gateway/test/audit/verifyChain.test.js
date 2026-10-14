const mockPool = { query: jest.fn() };
jest.mock('../../src/db/pool', () => mockPool);

const { computeRowHash, GENESIS_HASH } = require('../../src/audit/auditLogger');
const { verifyChain } = require('../../src/audit/verifyChain');

function dbRow(id, prevHash, overrides = {}) {
  const fields = {
    requestId: `req-${id}`,
    identity: '203.0.113.4:1',
    mode: 'adaptive',
    method: 'GET',
    path: '/api/accounts/1',
    statusCode: 200,
    tier: 'T1',
    score: 0,
    rulesTriggered: [],
    latencyMs: 10,
    runLabel: null,
    ...overrides,
  };
  const rowHash = computeRowHash(prevHash, fields);
  return {
    id,
    request_id: fields.requestId,
    identity: fields.identity,
    mode: fields.mode,
    method: fields.method,
    path: fields.path,
    status_code: fields.statusCode,
    tier: fields.tier,
    score: fields.score,
    rules_triggered: JSON.stringify(fields.rulesTriggered),
    latency_ms: fields.latencyMs,
    run_label: fields.runLabel,
    prev_hash: prevHash,
    row_hash: rowHash,
    _hash: rowHash, // convenience for building the next row in a test
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('an empty table verifies as intact with zero rows checked', async () => {
  mockPool.query.mockResolvedValue({ rows: [] });

  const result = await verifyChain();

  expect(result).toEqual({ ok: true, checked: 0, skippedLegacy: 0, totalRows: 0 });
});

test('a correctly chained sequence verifies as intact', async () => {
  const row1 = dbRow(1, GENESIS_HASH);
  const row2 = dbRow(2, row1._hash);
  const row3 = dbRow(3, row2._hash);
  mockPool.query.mockResolvedValue({ rows: [row1, row2, row3] });

  const result = await verifyChain();

  expect(result.ok).toBe(true);
  expect(result.checked).toBe(3);
});

test('detects a row whose fields were modified after being written', async () => {
  const row1 = dbRow(1, GENESIS_HASH);
  const row2 = dbRow(2, row1._hash);
  // tamper: change status_code without recomputing row_hash - exactly what
  // a direct SQL UPDATE against the live table would produce
  const tamperedRow2 = { ...row2, status_code: 999 };
  mockPool.query.mockResolvedValue({ rows: [row1, tamperedRow2] });

  const result = await verifyChain();

  expect(result.ok).toBe(false);
  expect(result.brokenAtId).toBe(2);
  expect(result.reason).toMatch(/modified after/);
  expect(result.checked).toBe(1); // row1 verified before the break
});

test('detects a deleted row via a prev_hash gap', async () => {
  const row1 = dbRow(1, GENESIS_HASH);
  const row2 = dbRow(2, row1._hash);
  const row3 = dbRow(3, row2._hash);
  // simulate row2 having been deleted: row3 now immediately follows row1
  mockPool.query.mockResolvedValue({ rows: [row1, row3] });

  const result = await verifyChain();

  expect(result.ok).toBe(false);
  expect(result.brokenAtId).toBe(3);
  expect(result.reason).toMatch(/deleted or reordered/);
  expect(result.checked).toBe(1);
});

test('pre-migration rows (null row_hash) are skipped, not treated as breaks', async () => {
  const legacyRow = { id: 1, row_hash: null, prev_hash: null };
  const row2 = dbRow(2, GENESIS_HASH); // chain starts fresh at the first hashed row
  const row3 = dbRow(3, row2._hash);
  mockPool.query.mockResolvedValue({ rows: [legacyRow, row2, row3] });

  const result = await verifyChain();

  expect(result.ok).toBe(true);
  expect(result.skippedLegacy).toBe(1);
  expect(result.checked).toBe(2);
});

test('a tampered row after legacy rows is still detected', async () => {
  const legacyRow = { id: 1, row_hash: null, prev_hash: null };
  const row2 = dbRow(2, GENESIS_HASH);
  const tamperedRow3 = { ...dbRow(3, row2._hash), score: 9999 };
  mockPool.query.mockResolvedValue({ rows: [legacyRow, row2, tamperedRow3] });

  const result = await verifyChain();

  expect(result.ok).toBe(false);
  expect(result.brokenAtId).toBe(3);
});
