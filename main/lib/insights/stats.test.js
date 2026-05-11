const { median, mulberry32, pearson, spearman, rank } = require('./stats');

describe('median', () => {
  it('odd length', () => { expect(median([3, 1, 2])).toBe(2); });
  it('even length', () => { expect(median([1, 2, 3, 4])).toBe(2.5); });
  it('empty → null', () => { expect(median([])).toBe(null); });
});

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42); const b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });
});

describe('pearson', () => {
  it('perfect positive', () => { expect(pearson([1,2,3,4], [2,4,6,8])).toBeCloseTo(1, 10); });
  it('perfect negative', () => { expect(pearson([1,2,3,4], [4,3,2,1])).toBeCloseTo(-1, 10); });
  it('zero variance → 0', () => { expect(pearson([1,1,1], [1,2,3])).toBe(0); });
  it('known value', () => { expect(pearson([1,2,3,5], [2,1,4,3])).toBeCloseTo(0.5291502622, 6); });
});

describe('spearman', () => {
  it('monotonic non-linear → 1', () => { expect(spearman([1,2,3,4], [1,4,9,16])).toBeCloseTo(1, 10); });
  it('handles ties (average ranks)', () => { expect(spearman([1,2,2,3], [1,2,3,4])).toBeCloseTo(0.9486832981, 6); });
});

describe('rank', () => {
  it('assigns 1-based ranks', () => { expect(rank([3,1,2])).toEqual([3,1,2]); });
  it('average-ranks ties', () => { expect(rank([1,2,2,3])).toEqual([1, 2.5, 2.5, 4]); });
  it('all equal values', () => { expect(rank([1,1,1])).toEqual([2,2,2]); });
});

const { permutationTest, benjaminiHochberg } = require('./stats');

describe('permutationTest', () => {
  it('strong relationship → tiny p', () => {
    const x = Array.from({ length: 30 }, (_, i) => i);
    const y = x.map(v => v * 2 + 1);
    const { stat, pValue } = permutationTest(x, y, require('./stats').pearson, 2000, 123);
    expect(stat).toBeCloseTo(1, 6);
    expect(pValue).toBeLessThan(0.01);
  });
  it('shuffled-null relationship → large p', () => {
    const x = Array.from({ length: 30 }, (_, i) => i);
    const y = [12,3,27,8,19,1,25,14,6,30,2,17,9,22,5,28,11,4,20,13,7,29,16,10,24,15,18,21,23,26];
    const { pValue } = permutationTest(x, y, require('./stats').pearson, 2000, 123);
    expect(pValue).toBeGreaterThan(0.05);
  });
  it('is deterministic for a seed', () => {
    const x = [1,2,3,4,5,6,7,8], y = [2,1,4,3,6,5,8,7];
    const a = permutationTest(x, y, require('./stats').pearson, 500, 7);
    const b = permutationTest(x, y, require('./stats').pearson, 500, 7);
    expect(a.pValue).toBe(b.pValue);
  });
});

describe('benjaminiHochberg', () => {
  it('textbook example', () => {
    // BH at q=0.05, m=10: thresholds are k/10*0.05
    // k=8: p_(8)=0.0344 <= 0.040 ✓  k=9: p_(9)=0.0459 > 0.045 ✗ → maxK=8
    const ps = [0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344, 0.0459, 0.3240];
    const { survived } = benjaminiHochberg(ps, 0.05);
    expect(survived).toEqual([true, true, true, true, true, true, true, true, false, false]);
  });
  it('empty input', () => {
    expect(benjaminiHochberg([], 0.1)).toEqual({ survived: [], qValues: [] });
  });
});

const { linearRegression, robustZ, residualizeOnWeekend, groupContrast } = require('./stats');

describe('linearRegression', () => {
  it('fits y = 2t + 1', () => {
    const t = [0,1,2,3,4], y = [1,3,5,7,9];
    const r = linearRegression(t, y);
    expect(r.slope).toBeCloseTo(2, 10);
    expect(r.intercept).toBeCloseTo(1, 10);
    expect(r.r2).toBeCloseTo(1, 10);
    expect(r.sd).toBeCloseTo(Math.sqrt(8), 6);
  });
  it('flat series → slope 0', () => {
    expect(linearRegression([0,1,2], [5,5,5]).slope).toBeCloseTo(0, 10);
  });
});

describe('robustZ', () => {
  it('uses median + MAD', () => {
    const base = [10,10,10,10,10,10,12];
    expect(robustZ(10, base)).toBe(0);
  });
  it('detects a spike', () => {
    const base = [100,102,98,101,99,100,103,97];
    expect(robustZ(200, base)).toBeGreaterThan(3);
  });
});

describe('residualizeOnWeekend', () => {
  it('removes a pure weekend offset', () => {
    const v  = [1,1,1,5,5, 1,1,1,5,5];
    const wk = [false,false,false,true,true, false,false,false,true,true];
    const res = residualizeOnWeekend(v, wk);
    for (const r of res) expect(Math.abs(r)).toBeLessThan(1e-9);
  });
});

describe('groupContrast', () => {
  it('splits by mask', () => {
    const vals = [4,5,4,2,1,2];
    const mask = [true,true,true,false,false,false];
    const c = groupContrast(vals, mask);
    expect(c.highMean).toBeCloseTo(13/3, 6);
    expect(c.lowMean).toBeCloseTo(5/3, 6);
    expect(c.highN).toBe(3);
    expect(c.lowN).toBe(3);
  });
});
