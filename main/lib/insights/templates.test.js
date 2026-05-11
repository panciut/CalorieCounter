const { renderInsight, ACTION_HINTS } = require('./templates');

const LABELS_IT = true;

describe('renderInsight', () => {
  it('renders an association as a contrast, non-causal, with n', () => {
    const raw = { kind: 'association', x: 'sleepMin', y: 'mood', lag: 0, corr: 'spearman', stat: 0.5,
      n: 30, nutrition: false, weekendControlled: { survived: true },
      contrast: { highMean: 3.8, lowMean: 2.9, highN: 15, lowN: 15, cutoff: 420, cutoffLabel: '7h+', predictor: 'sleepMin', outcome: 'mood' } };
    const { text } = renderInsight(raw, 'it');
    expect(text).toMatch(/3[.,]8/);
    expect(text).toMatch(/2[.,]9/);
    expect(text).toMatch(/30/);             // sample size
    expect(text).not.toMatch(/causa|→/);    // no causal language/arrows
  });
  it('appends a weekend caveat when not survived', () => {
    const raw = { kind: 'association', x: 'sleepMin', y: 'mood', lag: 0, corr: 'spearman', stat: 0.4, n: 25, nutrition: false,
      weekendControlled: { survived: false }, contrast: { highMean: 4, lowMean: 3, highN: 10, lowN: 15, cutoff: 420, cutoffLabel: '7h+', predictor: 'sleepMin', outcome: 'mood' } };
    const { text } = renderInsight(raw, 'it');
    expect(text.toLowerCase()).toContain('weekend');
  });
  it('states the reliability basis for nutrition associations', () => {
    const raw = { kind: 'association', x: 'kcalBalance', y: 'weightTrend', lag: 0, corr: 'pearson', stat: 0.6, n: 24,
      nutrition: true, reliabilityBasis: 24, weekendControlled: { survived: true },
      contrast: { highMean: 80.1, lowMean: 79.6, highN: 12, lowN: 12, cutoff: 0, cutoffLabel: 'sopra la mediana', predictor: 'kcalBalance', outcome: 'weightTrend' } };
    const { text } = renderInsight(raw, 'it');
    expect(text).toMatch(/24 giorni affidabili/);
  });
  it('renders a trend', () => {
    const { text } = renderInsight({ kind: 'trend', metric: 'mood', direction: 'up', slopePerDay: 0.08, n: 21, confidence: 'medium' }, 'it');
    expect(text.toLowerCase()).toContain('umore');
  });
  it('renders an anomaly', () => {
    const { text } = renderInsight({ kind: 'anomaly', date: '2025-01-20', metric: 'kcalIn', value: 3800, baselineMedian: 2100, z: 3.1, direction: 'high' }, 'it');
    expect(text).toMatch(/3\.?800|3800/);
  });
  it('renders a factor insight', () => {
    const { text } = renderInsight({ kind: 'factor', tag: 'caffe tardi', metric: 'sleepQuality', withMean: 2.4, withoutMean: 3.8, withN: 8, withoutN: 20 }, 'it');
    expect(text).toContain('caffe tardi');
  });
  it('attaches an action hint when one exists for the subject', () => {
    const raw = { kind: 'association', x: 'lastMealHour', y: 'sleepQuality', lag: 0, corr: 'spearman', stat: -0.4, n: 22, nutrition: true, reliabilityBasis: 22,
      weekendControlled: { survived: true }, contrast: { highMean: 2.8, lowMean: 3.7, highN: 11, lowN: 11, cutoff: 21, cutoffLabel: 'sopra la mediana', predictor: 'lastMealHour', outcome: 'sleepQuality' } };
    const { actionHint } = renderInsight(raw, 'it');
    expect(actionHint).toBeTruthy();
    expect(ACTION_HINTS['lastMealHour~sleepQuality']).toBeTruthy();
  });
  it('renders a nutrition association in English without double unit', () => {
    const raw = { kind: 'association', x: 'kcalBalance', y: 'weightTrend', lag: 0, corr: 'pearson', stat: 0.6, n: 24,
      nutrition: true, reliabilityBasis: 24, weekendControlled: { survived: true },
      contrast: { highMean: 80.1, lowMean: 79.6, highN: 12, lowN: 12, cutoff: 0, cutoffLabel: 'above median', predictor: 'kcalBalance', outcome: 'weightTrend' } };
    const { text } = renderInsight(raw, 'en');
    expect(text).not.toMatch(/affidabili/);  // Italian word must not appear
    expect(text).toMatch(/24/);
  });
  it('renders a declining trend without + prefix', () => {
    const { text } = renderInsight({ kind: 'trend', metric: 'stress', direction: 'down', slopePerDay: 0.05, n: 21, confidence: 'high' }, 'it');
    expect(text).not.toMatch(/\+/);
  });
});
