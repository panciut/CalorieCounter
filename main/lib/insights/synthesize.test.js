'use strict';
const { synthesizeTrendInsights } = require('./synthesize');

const trendMood = {
  kind: 'trend', metric: 'mood', direction: 'up',
  slopePerDay: 0.05, n: 25, confidence: 'high',
};
const trendWeight = {
  kind: 'trend', metric: 'weight', direction: 'up',
  slopePerDay: 0.057, n: 21, confidence: 'high',
};
const assocSleepMood = {
  kind: 'association', x: 'sleepMin', y: 'mood', lag: 0,
  stat: 0.58, n: 28,
  contrast: { cutoffLabel: '7h+', highMean: 7.2, lowMean: 5.4, predictor: 'sleepMin', outcome: 'mood' },
  weekendControlled: { survived: true },
  points: [{ x: 420, y: 4 }],
};
const assocKcalWeight = {
  kind: 'association', x: 'kcalBalance', y: 'weightTrend', lag: 0,
  stat: 0.71, n: 30,
  contrast: { cutoffLabel: 'sopra la mediana', highMean: 0.15, lowMean: -0.05, predictor: 'kcalBalance', outcome: 'weightTrend' },
  weekendControlled: { survived: true },
  points: [{ x: 200, y: 0.1 }],
};
// mood downstream: mood predicts focus
const assocMoodFocus = {
  kind: 'association', x: 'mood', y: 'focusMin', lag: 0,
  stat: 0.44, n: 25,
  contrast: { cutoffLabel: 'sopra la mediana', highMean: 80, lowMean: 40, predictor: 'mood', outcome: 'focusMin' },
  weekendControlled: { survived: true },
  points: [],
};

describe('synthesizeTrendInsights', () => {
  it('produces an explained_trend when associations match the trend metric', () => {
    const { explained, consumedTrendIds } = synthesizeTrendInsights([trendMood], [assocSleepMood, assocMoodFocus]);
    expect(explained.length).toBe(1);
    expect(explained[0].kind).toBe('explained_trend');
    expect(explained[0].metric).toBe('mood');
    expect(consumedTrendIds.has('trend:mood')).toBe(true);
  });

  it('maps weight trend to weightTrend assoc outcome', () => {
    const { explained } = synthesizeTrendInsights([trendWeight], [assocKcalWeight]);
    expect(explained.length).toBe(1);
    expect(explained[0].metric).toBe('weight');
    expect(explained[0].causalFactors.length).toBe(1);
    expect(explained[0].causalFactors[0].predictor).toBe('kcalBalance');
  });

  it('populates causalFactors from associations where y = metric', () => {
    const { explained } = synthesizeTrendInsights([trendMood], [assocSleepMood]);
    const et = explained[0];
    expect(et.causalFactors.length).toBe(1);
    expect(et.causalFactors[0].predictor).toBe('sleepMin');
    expect(et.causalFactors[0].lag).toBe(0);
    expect(Array.isArray(et.causalFactors[0].points)).toBe(true);
  });

  it('populates downstreamEffects from associations where x = metric', () => {
    const { explained } = synthesizeTrendInsights([trendMood], [assocSleepMood, assocMoodFocus]);
    const et = explained[0];
    expect(et.downstreamEffects.length).toBe(1);
    expect(et.downstreamEffects[0].outcome).toBe('focusMin');
  });

  it('does NOT produce explained_trend when no matching associations', () => {
    const { explained, consumedTrendIds } = synthesizeTrendInsights([trendMood], [assocKcalWeight]);
    expect(explained.length).toBe(0);
    expect(consumedTrendIds.has('trend:mood')).toBe(false);
  });

  it('returns correct slopePerWeek', () => {
    const { explained } = synthesizeTrendInsights([trendMood], [assocSleepMood]);
    expect(explained[0].slopePerWeek).toBeCloseTo(0.05 * 7, 5);
  });
});
