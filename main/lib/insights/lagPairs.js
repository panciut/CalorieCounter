'use strict';

const PAIRS = [
  { x: 'sleepMin', y: 'mood', lags: [0, 1, 2], nutrition: false },
  { x: 'sleepQuality', y: 'mood', lags: [0, 1], nutrition: false },
  { x: 'sleepMin', y: 'kcalIn', lags: [0], nutrition: true },
  { x: 'sleepMin', y: 'focusMin', lags: [0], nutrition: false },
  { x: 'stress', y: 'sleepQuality', lags: [0], nutrition: false },
  { x: 'workoutDone', y: 'mood', lags: [1], nutrition: false },
  { x: 'workoutMin', y: 'energy', lags: [1], nutrition: false },
  { x: 'habitPct', y: 'energy', lags: [0], nutrition: false },
  { x: 'habitPct', y: 'mood', lags: [0], nutrition: false },
  { x: 'kcalBalance', y: 'weightTrend', lags: [0], nutrition: true },
  { x: 'steps', y: 'mood', lags: [0], nutrition: false },
  { x: 'lastMealHour', y: 'sleepQuality', lags: [0], nutrition: true },
  { x: 'focusMin', y: 'mood', lags: [0], nutrition: false },
  { x: 'taskCompletionPct', y: 'mood', lags: [0], nutrition: false },
  { x: 'waterMl', y: 'energy', lags: [0], nutrition: false },
];

const ORDINAL = new Set(['mood', 'energy', 'stress', 'sleepQuality', 'perceivedEffort']);
function isOrdinal(sig) { return ORDINAL.has(sig); }

function asNum(v) { return v == null ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : Number(v)); }
function prevDate(date) { return new Date(new Date(date + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10); }
function shiftDate(date, lag) { let d = date; for (let i = 0; i < lag; i++) d = prevDate(d); return d; }

function pairedSeries(facts, xKey, yKey, lag) {
  const byDate = {}; for (const f of facts) byDate[f.date] = f;
  const x = [], y = [];
  for (const f of facts) {
    const yv = asNum(f[yKey]); if (yv == null || Number.isNaN(yv)) continue;
    const src = lag === 0 ? f : byDate[shiftDate(f.date, lag)];
    if (!src) continue;
    const xv = asNum(src[xKey]); if (xv == null || Number.isNaN(xv)) continue;
    x.push(xv); y.push(yv);
  }
  return { x, y, n: x.length };
}

module.exports = { PAIRS, isOrdinal, pairedSeries, prevDate, shiftDate };
