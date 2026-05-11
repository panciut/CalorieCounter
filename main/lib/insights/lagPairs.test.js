const { PAIRS, pairedSeries } = require('./lagPairs');

describe('PAIRS', () => {
  it('is a non-empty whitelist with the expected shape', () => {
    expect(PAIRS.length).toBeGreaterThanOrEqual(10);
    for (const p of PAIRS) {
      expect(typeof p.x).toBe('string');
      expect(typeof p.y).toBe('string');
      expect(Array.isArray(p.lags)).toBe(true);
      expect(typeof p.nutrition).toBe('boolean');
    }
  });
});

describe('pairedSeries', () => {
  const facts = [
    { date: '2025-01-01', a: 1, b: 10 },
    { date: '2025-01-02', a: 2, b: 20 },
    { date: '2025-01-04', a: 4, b: 40 },
    { date: '2025-01-05', a: 5, b: 50 },
  ];
  it('lag 0 — drops rows with a null on either column', () => {
    const f2 = [...facts, { date: '2025-01-06', a: null, b: 60 }];
    const { x, y, n } = pairedSeries(f2, 'a', 'b', 0);
    expect(n).toBe(4);
    expect(x).toEqual([1,2,4,5]); expect(y).toEqual([10,20,40,50]);
  });
  it('lag 1 — pairs x[d-1] with y[d], skipping the date gap', () => {
    const { x, y, n } = pairedSeries(facts, 'a', 'b', 1);
    expect(n).toBe(2);
    expect(x).toEqual([1, 4]);
    expect(y).toEqual([20, 50]);
  });
});
