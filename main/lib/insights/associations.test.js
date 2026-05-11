const { mulberry32 } = require('./stats');
const { findAssociations } = require('./associations');

function makeFacts(n, linkFn) {
  const out = []; let d = new Date('2025-01-01T00:00:00Z');
  for (let i = 0; i < n; i++) {
    out.push(Object.assign({ date: d.toISOString().slice(0, 10), dow: d.getUTCDay(), isWeekend: d.getUTCDay() === 0 || d.getUTCDay() === 6,
      foodReliability: { level: 'precise', manualOverride: false } }, linkFn(i)));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}
const SETTINGS = { useNutrition: true, includeApproxDays: false, minPairN: 21, fdrQ: 0.10 };

describe('findAssociations', () => {
  it('finds an injected sleep→mood association with the right sign', () => {
    const rng = mulberry32(99);
    const facts = makeFacts(60, i => {
      const sleepMin = 360 + Math.round(rng() * 180);
      const noise = (rng() - 0.5);
      const mood = Math.max(1, Math.min(5, Math.round(1 + (sleepMin - 360) / 180 * 4 + noise)));
      return { sleepMin, mood, energy: 3, stress: 3, sleepQuality: 3 };
    });
    const res = findAssociations(facts, SETTINGS);
    const sm = res.find(r => r.x === 'sleepMin' && r.y === 'mood');
    expect(sm).toBeTruthy();
    expect(sm.stat).toBeGreaterThan(0);
    expect(sm.qValue).toBeLessThanOrEqual(0.10);
  });

  it('produces NOTHING on pure noise (false-positive guard)', () => {
    const rng = mulberry32(7);
    const facts = makeFacts(60, () => ({
      sleepMin: 360 + Math.round(rng() * 180), mood: 1 + Math.floor(rng() * 5),
      energy: 1 + Math.floor(rng() * 5), stress: 1 + Math.floor(rng() * 5),
      sleepQuality: 1 + Math.floor(rng() * 5), steps: Math.round(rng() * 12000),
      focusMin: Math.round(rng() * 120), waterMl: Math.round(rng() * 3000),
      habitPct: rng(), taskCompletionPct: rng(), kcalIn: 1500 + Math.round(rng() * 1500),
      kcalOut: 2000 + Math.round(rng() * 400), weightTrend: 80, workoutDone: rng() > 0.5 ? 1 : 0, workoutMin: 30,
    }));
    const res = findAssociations(facts, SETTINGS);
    expect(res.length).toBe(0);
  });

  it('skips nutrition pairs when useNutrition is false', () => {
    const rng = mulberry32(42);
    const facts = makeFacts(60, i => ({
      kcalBalance: -300 + i * 5, weightTrend: 80 - i * 0.05,
      sleepMin: 420 + Math.round(rng() * 60), mood: 1 + Math.floor(rng() * 5),
      energy: 3, stress: 3, sleepQuality: 3,
    }));
    const res = findAssociations(facts, { ...SETTINGS, useNutrition: false });
    expect(res.find(r => r.x === 'kcalBalance')).toBeUndefined();
    expect(res.find(r => r.nutrition === true)).toBeUndefined();
  });
});
