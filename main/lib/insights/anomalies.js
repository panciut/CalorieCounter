'use strict';
const { robustZ, median } = require('./stats');

const BASE_METRICS = ['sleepMin', 'mood', 'energy', 'stress', 'steps'];
const NUTRITION_METRICS = ['kcalIn', 'kcalBalance'];

function findAnomalies(facts, settings, today) {
  const byDate = {}; for (const f of facts) byDate[f.date] = f;
  const yesterday = new Date(new Date(today + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
  const recent = [today, yesterday].filter(d => byDate[d]);
  const metrics = settings.useNutrition ? [...BASE_METRICS, ...NUTRITION_METRICS] : BASE_METRICS;
  const reliableLevels = new Set(['precise', ...(settings.includeApproxDays ? ['approx'] : [])]);
  const out = [];
  for (const m of metrics) {
    const nutrition = NUTRITION_METRICS.includes(m);
    const baseRows = facts.filter(f => !recent.includes(f.date) && f[m] != null && (!nutrition || (f.foodReliability && reliableLevels.has(f.foodReliability.level))));
    if (baseRows.length < 10) continue;
    const baseline = baseRows.map(f => f[m]);
    const med = median(baseline);
    for (const d of recent) {
      const f = byDate[d]; if (!f || f[m] == null) continue;
      if (nutrition && !(f.foodReliability && reliableLevels.has(f.foodReliability.level))) continue;
      const z = robustZ(f[m], baseline);
      if (Math.abs(z) > 2.5) out.push({ kind: 'anomaly', date: d, metric: m, value: f[m], baselineMedian: med, z, direction: z > 0 ? 'high' : 'low' });
    }
  }
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 4);
}

module.exports = { findAnomalies };
