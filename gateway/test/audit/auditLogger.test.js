const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};
const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient),
};
jest.mock('../../src/db/pool', () => mockPool);

const { logAuditEvent, computeRowHash, GENESIS_HASH } = require('../../src/audit/auditLogger');

function baseFields(overrides = {}) {
  return {
    requestId: 'req-1',
    identity: '203.0.113.4:1',
    mode: 'adaptive',
    method: 'GET',
    path: '/api/accounts/1',
    statusCode: 200,
    tier: 'T1',
    score: 0,
    rulesTriggered: [],
    latencyMs: 12.3,
    runLabel: null,
    ...overrides,
  };
}

describe('computeRowHash (hash chain)', () => {
  test('is deterministic for identical prevHash and fields', () => {
    const a = computeRowHash(GENESIS_HASH, baseFields());
    const b = computeRowHash(GENESIS_HASH, baseFields());
    expect(a).toBe(b);
  });

  test('changes if prevHash changes (fields held constant)', () => {
    const a = computeRowHash(GENESIS_HASH, baseFields());
    const b = computeRowHash('a'.repeat(64), baseFields());
    expect(a).not.toBe(b);
  });

  test('changes if any single field changes', () => {
    const base = computeRowHash(GENESIS_HASH, baseFields());
    expect(computeRowHash(GENESIS_HASH, baseFields({ statusCode: 403 }))).not.toBe(base);
    expect(computeRowHash(GENESIS_HASH, baseFields({ score: 50 }))).not.toBe(base);
    expect(computeRowHash(GENESIS_HASH, baseFields({ tier: 'T2' }))).not.toBe(base);
  });

  test('is sensitive to rulesTriggered contents, not just presence', () => {
    const empty = computeRowHash(GENESIS_HASH, baseFields({ rulesTriggered: [] }));
    const withRule = computeRowHash(
      GENESIS_HASH,
      baseFields({ rulesTriggered: [{ ruleId: 'R1', weight: 50 }] })
    );
    expect(empty).not.toBe(withRule);
  });

  test('round-trips through JSON.stringify/parse identically (simulates a TEXT column read-back)', () => {
    const fields = baseFields({ rulesTriggered: [{ ruleId: 'R5', weight: 35, resourceType: 'users' }] });
    const original = computeRowHash(GENESIS_HASH, fields);

    // what verifyChain.js does: read the stored TEXT column back and re-parse it
    const roundTripped = { ...fields, rulesTriggered: JSON.parse(JSON.stringify(fields.rulesTriggered)) };
    const recomputed = computeRowHash(GENESIS_HASH, roundTripped);

    expect(recomputed).toBe(original);
  });

  test('produces a 64-character hex string (sha256)', () => {
    const hash = computeRowHash(GENESIS_HASH, baseFields());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('logAuditEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('acquires the chain advisory lock before reading the tip, inside a transaction', async () => {
    mockClient.query.mockImplementation((sql) => {
      if (sql.includes('SELECT row_hash'))
        return Promise.resolve({ rows: [{ row_hash: 'prev-hash-value' }] });
      return Promise.resolve({ rows: [] });
    });

    await logAuditEvent(baseFields());

    const calls = mockClient.query.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBe('BEGIN');
    expect(calls[1]).toContain('pg_advisory_xact_lock');
    expect(calls[2]).toContain('SELECT row_hash');
    expect(calls[3]).toContain('INSERT INTO audit_log');
    expect(calls[4]).toBe('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('chains from GENESIS_HASH when the table is empty', async () => {
    mockClient.query.mockImplementation((sql) => {
      if (sql.includes('SELECT row_hash')) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });

    await logAuditEvent(baseFields());

    const insertCall = mockClient.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO audit_log'));
    const params = insertCall[1];
    const prevHashParam = params[params.length - 2]; // prev_hash is the second-to-last bound param
    expect(prevHashParam).toBe(GENESIS_HASH);
  });

  test('rolls back and logs, but does not throw, if the write fails (fire-and-forget)', async () => {
    mockClient.query.mockImplementation((sql) => {
      if (sql === 'BEGIN') return Promise.resolve();
      if (sql.includes('pg_advisory_xact_lock')) return Promise.resolve();
      if (sql.includes('SELECT row_hash')) throw new Error('connection lost');
      return Promise.resolve();
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(logAuditEvent(baseFields())).resolves.toBeUndefined();

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
