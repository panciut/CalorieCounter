const { findAnomalies } = require('./anomalies');

function days(n, fn) {
  const out = []; let d = new Date('2025-01-01T00:00:00Z');
  for (let i = 0; i < n; i++) { out.push(Object.assign({ date: d.toISOString().slice(0, 10), foodReliability: { level: 'precise', manualOverride: false } }, fn(i))); d = new Date(d.getTime() + 86400000); }
  return out;
}

describe('findAnomalies', () => {
  it('flags a kcalIn spike on the last day', () => {
    const facts = days(20, i => ({ kcalIn: 2000 + (i === 19 ? 1800 : Math.round(Math.sin(i) * 30)), mood: 3 }));
    const today = facts[facts.length - 1].date;
    const res = findAnomalies(facts, { useNutrition: true, includeApproxDays: false }, today);
    expect(res.find(r => r.metric === 'kcalIn')).toBeTruthy();
  });
  it('returns nothing when everything is within baseline', () => {
    const facts = days(20, i => ({ kcalIn: 2000 + Math.round(Math.sin(i) * 25), mood: 3 }));
    const today = facts[facts.length - 1].date;
    expect(findAnomalies(facts, { useNutrition: true }, today)).toEqual([]);
  });
  it('does not surface anomalies older than 2 days', () => {
    const facts = days(20, i => ({ mood: i === 5 ? 1 : 4 }));
    const today = facts[facts.length - 1].date;
    expect(findAnomalies(facts, {}, today).find(r => r.date === facts[5].date)).toBeUndefined();
  });
  it('skips nutrition metrics when useNutrition is false', () => {
    const facts = days(20, i => ({ kcalIn: 2000 + (i === 19 ? 2000 : 0), mood: 3 }));
    const today = facts[facts.length - 1].date;
    expect(findAnomalies(facts, { useNutrition: false }, today).find(r => r.metric === 'kcalIn')).toBeUndefined();
  });
});
