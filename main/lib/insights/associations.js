'use strict';
const { spearman, pearson, permutationTest, benjaminiHochberg, residualizeOnWeekend, median, groupContrast } = require('./stats');
const { PAIRS, isOrdinal } = require('./lagPairs');

function prevDate(date) { return new Date(new Date(date + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10); }
function shiftDate(date, lag) { let d = date; for (let i = 0; i < lag; i++) d = prevDate(d); return d; }
function asNum(v) { return v == null ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : Number(v)); }
function hashSeed(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function pairedRows(facts, xKey, yKey, lag) {
  const byDate = {}; for (const f of facts) byDate[f.date] = f;
  const x = [], y = [], wk = [];
  for (const f of facts) {
    const yv = asNum(f[yKey]); if (yv == null || Number.isNaN(yv)) continue;
    const src = lag === 0 ? f : byDate[shiftDate(f.date, lag)];
    if (!src) continue;
    const xv = asNum(src[xKey]); if (xv == null || Number.isNaN(xv)) continue;
    x.push(xv); y.push(yv); wk.push(!!f.isWeekend);
  }
  return { x, y, wk, n: x.length };
}

const FIXED_CUTOFFS = { sleepMin: { value: 420, label: '7h+' } };

function findAssociations(facts, settings) {
  const minPairN = settings.minPairN ?? 21;
  const q = settings.fdrQ ?? 0.10;
  const reliableLevels = new Set(['precise', ...(settings.includeApproxDays ? ['approx'] : [])]);
  const reliableFacts = facts.filter(f => f.foodReliability && reliableLevels.has(f.foodReliability.level));

  const candidates = [];
  for (const p of PAIRS) {
    if (p.nutrition && !settings.useNutrition) continue;
    const source = p.nutrition ? reliableFacts : facts;
    for (const lag of p.lags) {
      const { x, y, wk, n } = pairedRows(source, p.x, p.y, lag);
      if (n < Math.max(21, minPairN)) continue;
      const corrName = (isOrdinal(p.x) || isOrdinal(p.y)) ? 'spearman' : 'pearson';
      const corrFn = corrName === 'spearman' ? spearman : pearson;
      const seed = hashSeed(`${p.x}|${p.y}|${lag}`);
      const { stat, pValue } = permutationTest(x, y, corrFn, 2000, seed);
      const xr = residualizeOnWeekend(x, wk), yr = residualizeOnWeekend(y, wk);
      const ctrl = permutationTest(xr, yr, corrFn, 2000, seed ^ 0x9e3779b9);
      candidates.push({ p, lag, x, y, n, corrName, stat, pValue, ctrlStat: ctrl.stat, ctrlP: ctrl.pValue,
        reliabilityBasis: p.nutrition ? n : undefined });
    }
  }
  if (candidates.length === 0) return [];
  const { survived, qValues } = benjaminiHochberg(candidates.map(c => c.pValue), q);
  const ctrlSurvived = benjaminiHochberg(candidates.map(c => c.ctrlP), q).survived;

  const out = [];
  candidates.forEach((c, i) => {
    if (!survived[i]) return;
    const cutoff = FIXED_CUTOFFS[c.p.x] &&
      c.x.some(v => v >= FIXED_CUTOFFS[c.p.x].value) &&
      c.x.some(v => v < FIXED_CUTOFFS[c.p.x].value)
      ? FIXED_CUTOFFS[c.p.x] : { value: median(c.x), label: 'sopra la mediana' };
    const mask = c.x.map(v => v >= cutoff.value);
    const contrast = Object.assign(groupContrast(c.y, mask), { cutoff: cutoff.value, cutoffLabel: cutoff.label, predictor: c.p.x, outcome: c.p.y });
    out.push({
      kind: 'association', x: c.p.x, y: c.p.y, lag: c.lag, corr: c.corrName,
      stat: c.stat, pValue: c.pValue, qValue: qValues[i], n: c.n,
      nutrition: c.p.nutrition, reliabilityBasis: c.reliabilityBasis,
      weekendControlled: { stat: c.ctrlStat, pValue: c.ctrlP, survived: !!ctrlSurvived[i] },
      contrast,
      points: c.x.map((v, i) => ({ x: v, y: c.y[i] })),
    });
  });
  // keep strongest lag per (x,y)
  const best = {};
  for (const r of out) { const k = `${r.x}~${r.y}`; if (!best[k] || Math.abs(r.stat) > Math.abs(best[k].stat)) best[k] = r; }
  return Object.values(best);
}

module.exports = { findAssociations };
