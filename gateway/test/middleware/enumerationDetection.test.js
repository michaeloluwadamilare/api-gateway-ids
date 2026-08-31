const { isSequentialRun } = require('../../src/middleware/enumerationDetection');

describe('isSequentialRun (R5 detect-only heuristic)', () => {
  test('flags three consecutive ascending IDs', () => {
    expect(isSequentialRun([4, 5, 6])).toBe(true);
  });

  test('does not flag fewer than three IDs', () => {
    expect(isSequentialRun([4, 5])).toBe(false);
    expect(isSequentialRun([4])).toBe(false);
    expect(isSequentialRun([])).toBe(false);
  });

  test('does not flag a gap in the sequence', () => {
    expect(isSequentialRun([4, 5, 7])).toBe(false);
  });

  test('does not flag a non-monotonic or descending run', () => {
    expect(isSequentialRun([6, 5, 4])).toBe(false);
    expect(isSequentialRun([4, 6, 5])).toBe(false);
  });

  test('does not flag repeated fetches of the same ID', () => {
    expect(isSequentialRun([4, 4, 4])).toBe(false);
  });
});
