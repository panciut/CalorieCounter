'use strict';

// Maps trend metric name → association outcome key
// (needed because trends use 'weight' but associations use 'weightTrend')
const METRIC_TO_ASSOC_KEY = {
  weight: 'weightTrend',
};
function assocKey(metric) { return METRIC_TO_ASSOC_KEY[metric] ?? metric; }

function toFactor(assoc) {
  return {
    predictor: assoc.x,
    outcome: assoc.y,
    lag: assoc.lag ?? 0,
    stat: assoc.stat,
    n: assoc.n,
    cutoffLabel: assoc.contrast?.cutoffLabel ?? 'sopra la mediana',
    highMean: assoc.contrast?.highMean ?? 0,
    lowMean: assoc.contrast?.lowMean ?? 0,
    weekendControlled: !!assoc.weekendControlled?.survived,
    points: assoc.points ?? [],
  };
}

function synthesizeTrendInsights(trendRaws, assocRaws) {
  const explained = [];
  const consumedTrendIds = new Set();

  for (const t of trendRaws) {
    // sleepDebt is a special trend without direction/slopePerDay — skip synthesis
    if (t.metric === 'sleepDebt') continue;

    const outcomeKey = assocKey(t.metric);
    const causalFactors = assocRaws
      .filter(a => a.y === outcomeKey)
      .map(toFactor);

    const downstreamEffects = assocRaws
      .filter(a => a.x === outcomeKey)
      .map(toFactor);

    if (causalFactors.length === 0 && downstreamEffects.length === 0) continue;

    explained.push({
      kind: 'explained_trend',
      metric: t.metric,
      direction: t.direction,
      slopePerDay: t.slopePerDay,
      slopePerWeek: t.slopePerDay * 7,
      n: t.n,
      confidence: t.confidence ?? 'low',
      causalFactors,
      downstreamEffects,
    });

    consumedTrendIds.add(`trend:${t.metric}`);
  }

  return { explained, consumedTrendIds };
}

module.exports = { synthesizeTrendInsights };
