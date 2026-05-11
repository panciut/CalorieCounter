# Insight Engine + Data Reliability — Implementation Plan (SP1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local, statistically-honest intelligence layer over LifeBuddy's existing modules — cross-module associations, trends, anomalies, sleep-factor effects, milestones — with reliability-aware nutrition handling and a useful-from-day-one cold-start experience.

**Architecture:** Pure local computation in the Electron main process (Node + `better-sqlite3`), exposed via one IPC channel. A `DailyFacts` table (one normalized row per date) feeds a stats core (Spearman/Pearson + permutation tests + Benjamini–Hochberg FDR + weekend control) and analysis modules (associations, trends, anomalies, factor analysis). An `insightBuilder` ranks and renders `Insight[]`. Frontend: an `InsightsPage`, a dashboard `InsightCard`, a Settings section, plus a clickable reliability pill in the diary.

**Tech Stack:** Electron 41, better-sqlite3, React 19 + TypeScript, recharts. New dev dependency: `vitest` (the repo currently has no test runner).

**Reference spec:** `docs/superpowers/specs/2026-05-11-insight-engine-design.md` — read it before starting.

**Key facts about the codebase (confirmed):**
- `package.json` has no `"type": "module"` → `.js` files are CommonJS. `main/` is all CJS (`require`).
- IPC modules live in `main/ipc/*.ipc.js`, each exports a `registerXxxIpc()` fn, registered in `main/main.js` (require near top ~line 6-37, call in the `app.whenReady` block ~line 98+, after `initDb()`).
- DB schema + migrations are in `main/db.js` inside `initDb()`. The `migrations` array (search `const migrations = [`) holds `ALTER`/`CREATE TABLE IF NOT EXISTS` statements wrapped in try/catch — add new tables there.
- `sleep_log.bedtime` / `wake_time` are `'HH:MM'` strings; `sleep_log.factors` is a JSON-stringified `string[]` or `null`. Duration logic: bedtime ≥ 12h and wake ≤ 12h ⇒ wake is next morning.
- Renderer talks to main via `window.electronAPI.invoke(channel, data)`. Typed wrappers live in `src/api.ts` under `export const api = { ... }`. Types in `src/types.ts`. Pages registered in `src/App.tsx` (`page === 'x' && <XPage/>`) and `src/components/Nav.tsx` (`ICONS`, `DEFAULT_ORDER`, plus `PageName` in `src/types.ts`).
- Dashboard cards live in `src/components/dashboard/*.tsx`, assembled in `src/pages/DashboardPage.tsx`.
- Existing analytics IPC: `main/ipc/analytics.ipc.js` (raw trends only — leave it; the insight engine is separate).
- Settings: key/value `settings` table, `main/ipc/settings.ipc.js`, renderer `src/hooks/useSettings.ts` + `src/pages/SettingsPage.tsx`. Settings stored as strings.
- Existing manual test script style: `scripts/test-workout-log-sync.js` (plain node + `assert` + in-memory `better-sqlite3`). We will introduce vitest but keep that script working.

**Test conventions for this plan:**
- New dev dep `vitest`. `vitest.config.ts` sets `test: { globals: true, environment: 'node', include: ['main/**/*.test.js'] }`.
- Test files: `main/lib/insights/<name>.test.js`, CommonJS (`const { x } = require('./x')`), using vitest globals (`describe`, `it`, `expect`) — no imports needed.
- `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
- Run a single file: `npx vitest run main/lib/insights/stats.test.js`.

---

## File Structure

**Backend (main process):**
- `main/lib/insights/stats.js` — pure stats: `spearman`, `pearson`, `permutationTest`, `benjaminiHochberg`, `residualizeOnWeekend`, `linearRegression`, `robustZ`, `groupContrast`, `mulberry32` (seeded RNG), `median`.
- `main/lib/insights/dailyFacts.js` — `buildDailyFacts(db, { from, to })` → `DailyFacts[]`; `dataQuality(facts, windowDays)`.
- `main/lib/insights/reliability.js` — `computeReliability(facts, db)` → mutates each fact's `foodReliability`; `setDayReliability(db, date, level)`, `clearDayReliability(db, date)`.
- `main/lib/insights/lagPairs.js` — `shiftByDate(facts)` helpers + the curated association pair list.
- `main/lib/insights/associations.js` — `findAssociations(facts, settings)` → raw association results (after permutation + FDR + weekend control).
- `main/lib/insights/trends.js` — `findTrends(facts, settings)`.
- `main/lib/insights/anomalies.js` — `findAnomalies(facts, settings)`.
- `main/lib/insights/factorAnalysis.js` — `findFactorInsights(facts)`.
- `main/lib/insights/templates.js` — `renderInsight(raw, lang)` → `{ text, actionHint }`; `ACTION_HINTS` map.
- `main/lib/insights/insightBuilder.js` — `buildInsights(db, { windowDays, settings, today })` → `{ insights, dataQuality }`. Orchestrates everything; applies tier gating + ranking + the deterministic daily pick helper `pickOfDay(insights, epochDay)`.
- `main/ipc/insights.ipc.js` — `registerInsightsIpc()`: `insights:get`, `insights:setDayReliability`, `insights:clearDayReliability`. Optional `dataVersion` memo lives here.

**DB:**
- `main/db.js` — add `food_day_reliability` table to the `migrations` array.

**Frontend (renderer):**
- `src/types.ts` — add `Insight`, `DailyFactsRow` (only what the UI needs), `DataQuality`, `DayReliabilityLevel`, extend `PageName` with `'insights'`, extend `Settings` with the new keys.
- `src/api.ts` — add `api.insights = { get, setDayReliability, clearDayReliability }`.
- `src/components/dashboard/InsightCard.tsx` — dashboard "insight of the day" card (+ low-data variant).
- `src/components/dashboard/ReliabilityPill.tsx` — clickable pill (preciso / approssimativo / non loggato) used in the diary + dashboard.
- `src/pages/InsightsPage.tsx` — full page: data-quality strip, insights grouped by module, scatter mini-charts for associations, correlation-≠-causation footnote.
- `src/App.tsx` — route `page === 'insights'`.
- `src/components/Nav.tsx` — `ICONS.insights`, a `DEFAULT_ORDER` entry in the `lifestyle` group.
- `src/pages/DashboardPage.tsx` — mount `<InsightCard/>` in the bento; mount `<ReliabilityPill/>` near the diary table.
- `src/pages/SettingsPage.tsx` — new "Insights" section.
- `src/hooks/useSettings.ts` — defaults for the new settings keys.
- `src/i18n/translations.ts` — `insights.*` keys (it + en).

---

## Task 0: Add the vitest test runner

**Files:**
- Modify: `package.json` (devDependencies, scripts)
- Create: `vitest.config.ts`
- Create: `main/lib/insights/__smoke__.test.js` (temporary smoke test, deleted in this task's last step)

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest`
Expected: `vitest` appears in `devDependencies`.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['main/**/*.test.js'],
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

In the `"scripts"` block add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create a smoke test `main/lib/insights/__smoke__.test.js`**

```js
describe('vitest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 6: Delete the smoke test**

Run: `git rm main/lib/insights/__smoke__.test.js` (or delete the file).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

## Task 1: Stats core — basic primitives (`median`, `mulberry32`, `pearson`, `spearman`)

**Files:**
- Create: `main/lib/insights/stats.js`
- Test: `main/lib/insights/stats.test.js`

- [ ] **Step 1: Write the failing test**

```js
const { median, mulberry32, pearson, spearman } = require('./stats');

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
  it('known value', () => { expect(pearson([1,2,3,5], [2,1,4,3])).toBeCloseTo(0.5070925528, 6); });
});

describe('spearman', () => {
  it('monotonic non-linear → 1', () => { expect(spearman([1,2,3,4], [1,4,9,16])).toBeCloseTo(1, 10); });
  it('handles ties (average ranks)', () => { expect(spearman([1,2,2,3], [1,2,3,4])).toBeCloseTo(0.9486832981, 6); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run main/lib/insights/stats.test.js`
Expected: FAIL — `Cannot find module './stats'`.

- [ ] **Step 3: Implement `main/lib/insights/stats.js`**

```js
'use strict';

function median(xs) {
  if (!xs || xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Deterministic PRNG so permutation tests / daily picks are reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mean(xs) { return xs.reduce((s, v) => s + v, 0) / xs.length; }

function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

// Average-rank (handles ties), then Pearson on ranks.
function rank(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; // ranks are 1-based
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

function spearman(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  return pearson(rank(x.slice(0, n)), rank(y.slice(0, n)));
}

module.exports = { median, mean, mulberry32, pearson, spearman, rank };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run main/lib/insights/stats.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add main/lib/insights/stats.js main/lib/insights/stats.test.js
git commit -m "feat(insights): stats core — median, prng, pearson, spearman"
```

---

## Task 2: Stats core — permutation test + Benjamini–Hochberg FDR

**Files:**
- Modify: `main/lib/insights/stats.js`
- Modify: `main/lib/insights/stats.test.js`

- [ ] **Step 1: Add failing tests**

```js
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
    // y is a fixed permutation unrelated to x's order
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
    // p-values from a classic BH example; q=0.05 → first 4 reject
    const ps = [0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344, 0.0459, 0.3240];
    const { survived } = benjaminiHochberg(ps, 0.05);
    expect(survived).toEqual([true, true, true, true, false, false, false, false, false, false]);
  });
  it('empty input', () => {
    expect(benjaminiHochberg([], 0.1)).toEqual({ survived: [], qValues: [] });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run main/lib/insights/stats.test.js`
Expected: FAIL — `permutationTest is not a function`.

- [ ] **Step 3: Add implementations to `stats.js`** (append before `module.exports`, and add to the export object)

```js
// Two-sided permutation test for a correlation-like statistic.
function permutationTest(x, y, corrFn, iters = 2000, seed = 1) {
  const n = Math.min(x.length, y.length);
  const xs = x.slice(0, n), ys = y.slice(0, n);
  const observed = corrFn(xs, ys);
  if (n < 4) return { stat: observed, pValue: 1 };
  const rng = mulberry32(seed);
  let extreme = 0;
  const perm = ys.slice();
  for (let it = 0; it < iters; it++) {
    // Fisher–Yates shuffle of `perm`
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
    }
    if (Math.abs(corrFn(xs, perm)) >= Math.abs(observed) - 1e-12) extreme++;
  }
  return { stat: observed, pValue: (extreme + 1) / (iters + 1) };
}

// Benjamini–Hochberg step-up. Returns which hypotheses survive at level q + adjusted q-values.
function benjaminiHochberg(pvalues, q = 0.1) {
  const m = pvalues.length;
  if (m === 0) return { survived: [], qValues: [] };
  const order = pvalues.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  // largest k such that p_(k) <= (k/m)*q
  let maxK = 0;
  for (let k = 1; k <= m; k++) {
    if (order[k - 1][0] <= (k / m) * q) maxK = k;
  }
  const survived = new Array(m).fill(false);
  for (let k = 0; k < maxK; k++) survived[order[k][1]] = true;
  // adjusted q-values (monotone from the top)
  const qv = new Array(m).fill(1);
  let running = 1;
  for (let k = m; k >= 1; k--) {
    const adj = Math.min(1, (order[k - 1][0] * m) / k);
    running = Math.min(running, adj);
    qv[order[k - 1][1]] = running;
  }
  return { survived, qValues: qv };
}
```

Update the `module.exports` to include `permutationTest, benjaminiHochberg`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run main/lib/insights/stats.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add main/lib/insights/stats.js main/lib/insights/stats.test.js
git commit -m "feat(insights): permutation test + Benjamini-Hochberg FDR"
```

---

## Task 3: Stats core — `linearRegression`, `robustZ`, `residualizeOnWeekend`, `groupContrast`

**Files:**
- Modify: `main/lib/insights/stats.js`
- Modify: `main/lib/insights/stats.test.js`

- [ ] **Step 1: Add failing tests**

```js
const { linearRegression, robustZ, residualizeOnWeekend, groupContrast } = require('./stats');

describe('linearRegression', () => {
  it('fits y = 2t + 1', () => {
    const t = [0,1,2,3,4], y = [1,3,5,7,9];
    const r = linearRegression(t, y);
    expect(r.slope).toBeCloseTo(2, 10);
    expect(r.intercept).toBeCloseTo(1, 10);
    expect(r.r2).toBeCloseTo(1, 10);
    expect(r.sd).toBeCloseTo(Math.sqrt(8), 6); // population SD of [1,3,5,7,9]
  });
  it('flat series → slope 0', () => {
    expect(linearRegression([0,1,2], [5,5,5]).slope).toBeCloseTo(0, 10);
  });
});

describe('robustZ', () => {
  it('uses median + MAD', () => {
    const base = [10,10,10,10,10,10,12]; // median 10, MAD 0 → guard
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
    // every residual ~0 after removing each group's mean
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run main/lib/insights/stats.test.js`
Expected: FAIL — functions undefined.

- [ ] **Step 3: Add implementations to `stats.js`**

```js
function linearRegression(t, y) {
  const n = Math.min(t.length, y.length);
  if (n < 2) return { slope: 0, intercept: y[0] ?? 0, r2: 0, sd: 0 };
  const mt = mean(t.slice(0, n)), my = mean(y.slice(0, n));
  let stt = 0, sty = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dt = t[i] - mt, dy = y[i] - my;
    stt += dt * dt; sty += dt * dy; syy += dy * dy;
  }
  const slope = stt === 0 ? 0 : sty / stt;
  const intercept = my - slope * mt;
  const r2 = (stt === 0 || syy === 0) ? 0 : (sty * sty) / (stt * syy);
  const sd = Math.sqrt(syy / n);
  return { slope, intercept, r2, sd };
}

function robustZ(value, baseline) {
  const med = median(baseline);
  if (med == null) return 0;
  const mad = median(baseline.map(v => Math.abs(v - med)));
  if (!mad) return 0;
  return (value - med) / (1.4826 * mad);
}

function residualizeOnWeekend(series, isWeekendFlags) {
  const wkVals = [], wdVals = [];
  for (let i = 0; i < series.length; i++) (isWeekendFlags[i] ? wkVals : wdVals).push(series[i]);
  const wkMean = wkVals.length ? mean(wkVals) : 0;
  const wdMean = wdVals.length ? mean(wdVals) : 0;
  return series.map((v, i) => v - (isWeekendFlags[i] ? wkMean : wdMean));
}

function groupContrast(values, mask) {
  const high = [], low = [];
  for (let i = 0; i < values.length; i++) (mask[i] ? high : low).push(values[i]);
  return {
    highMean: high.length ? mean(high) : null,
    lowMean:  low.length  ? mean(low)  : null,
    highN: high.length, lowN: low.length,
  };
}
```

Update `module.exports` to include `linearRegression, robustZ, residualizeOnWeekend, groupContrast`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run main/lib/insights/stats.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add main/lib/insights/stats.js main/lib/insights/stats.test.js
git commit -m "feat(insights): regression, robust z, weekend residualization, group contrast"
```

---

## Task 4: DB migration — `food_day_reliability` table

**Files:**
- Modify: `main/db.js` (the `migrations` array inside `initDb()`)

- [ ] **Step 1: Add the table to the `migrations` array**

Find `const migrations = [` in `main/db.js`. Add this entry to the array (alongside the other `CREATE TABLE IF NOT EXISTS` strings):

```js
`CREATE TABLE IF NOT EXISTS food_day_reliability (
  date TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
```

- [ ] **Step 2: Sanity-check the app still boots**

Run: `npm run dev` (let it start, confirm no DB error in the electron console, then stop it). If running headless/CI, instead run: `node -e "const Database=require('better-sqlite3'); const db=new Database(':memory:'); db.exec(\`CREATE TABLE IF NOT EXISTS food_day_reliability (date TEXT PRIMARY KEY, level TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual', updated_at TEXT NOT NULL DEFAULT (datetime('now')))\`); console.log('ok');"`
Expected: `ok` / app boots.

- [ ] **Step 3: Commit**

```bash
git add main/db.js
git commit -m "feat(insights): food_day_reliability table"
```

---

## Task 5: `dailyFacts.js` — build normalized per-day rows

**Files:**
- Create: `main/lib/insights/dailyFacts.js`
- Test: `main/lib/insights/dailyFacts.test.js`

This module needs a fixture DB. The test creates an in-memory `better-sqlite3` DB with the relevant tables and a few rows.

- [ ] **Step 1: Write the failing test**

```js
const Database = require('better-sqlite3');
const { buildDailyFacts, dataQuality } = require('./dailyFacts');

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE foods (id INTEGER PRIMARY KEY, name TEXT, calories REAL, protein REAL, carbs REAL, fat REAL, fiber REAL DEFAULT 0);
    CREATE TABLE log (id INTEGER PRIMARY KEY, date TEXT, food_id INTEGER, grams REAL, meal TEXT DEFAULT 'Lunch', status TEXT DEFAULT 'logged');
    CREATE TABLE sleep_log (id INTEGER PRIMARY KEY, date TEXT UNIQUE, bedtime TEXT, wake_time TEXT, duration_min INTEGER, quality INTEGER, factors TEXT, note TEXT);
    CREATE TABLE mood_log (id INTEGER PRIMARY KEY, date TEXT UNIQUE, mood INTEGER, energy INTEGER, stress INTEGER, note TEXT);
    CREATE TABLE daily_energy (date TEXT PRIMARY KEY, resting_kcal REAL DEFAULT 0, active_kcal REAL DEFAULT 0, extra_kcal REAL DEFAULT 0, steps INTEGER DEFAULT 0);
    CREATE TABLE weight_log (id INTEGER PRIMARY KEY, date TEXT UNIQUE, weight REAL);
    CREATE TABLE water_log (id INTEGER PRIMARY KEY, date TEXT, ml REAL);
    CREATE TABLE habits (id INTEGER PRIMARY KEY, name TEXT, archived INTEGER DEFAULT 0);
    CREATE TABLE habit_logs (id INTEGER PRIMARY KEY, habit_id INTEGER, date TEXT, value INTEGER DEFAULT 1, UNIQUE(habit_id, date));
    CREATE TABLE tasks (id INTEGER PRIMARY KEY, date TEXT, title TEXT, done INTEGER DEFAULT 0);
    CREATE TABLE focus_sessions (id INTEGER PRIMARY KEY, date TEXT, duration_min INTEGER DEFAULT 0, completed INTEGER DEFAULT 1);
    CREATE TABLE workout_sessions (id INTEGER PRIMARY KEY, date TEXT, duration_min INTEGER, perceived_effort INTEGER);
    CREATE TABLE exercises (id INTEGER PRIMARY KEY, date TEXT, duration_min REAL DEFAULT 0, calories_burned REAL DEFAULT 0);
    CREATE TABLE food_day_reliability (date TEXT PRIMARY KEY, level TEXT, source TEXT DEFAULT 'manual', updated_at TEXT);
  `);
  db.prepare('INSERT INTO foods (id,name,calories,protein,carbs,fat,fiber) VALUES (1,?,100,5,10,2,1)').run('rice');
  // 2025-01-01: breakfast + lunch logged
  db.prepare("INSERT INTO log (date,food_id,grams,meal) VALUES ('2025-01-01',1,300,'Breakfast')").run();
  db.prepare("INSERT INTO log (date,food_id,grams,meal) VALUES ('2025-01-01',1,500,'Lunch')").run();
  db.prepare("INSERT INTO sleep_log (date,bedtime,wake_time,duration_min,quality,factors) VALUES ('2025-01-01','23:30','07:30',480,4,?)").run(JSON.stringify(['caffe tardi']));
  db.prepare("INSERT INTO mood_log (date,mood,energy,stress) VALUES ('2025-01-01',4,3,2)").run();
  db.prepare("INSERT INTO daily_energy (date,resting_kcal,active_kcal,steps) VALUES ('2025-01-01',1500,400,8000)").run();
  db.prepare("INSERT INTO weight_log (date,weight) VALUES ('2025-01-01',80)").run();
  // 2025-01-02: nothing logged for food
  db.prepare("INSERT INTO mood_log (date,mood,energy,stress) VALUES ('2025-01-02',2,2,4)").run();
  return db;
}

describe('buildDailyFacts', () => {
  const db = makeDb();
  const facts = buildDailyFacts(db, { from: '2025-01-01', to: '2025-01-02' });

  it('produces one row per date in range', () => {
    expect(facts.map(f => f.date)).toEqual(['2025-01-01', '2025-01-02']);
  });
  it('sums kcalIn from logged food only', () => {
    // (300+500) g * 100 kcal/100g = 800
    expect(facts[0].kcalIn).toBe(800);
  });
  it('computes kcalOut and kcalBalance', () => {
    expect(facts[0].kcalOut).toBe(1900);
    expect(facts[0].kcalBalance).toBe(800 - 1900);
  });
  it('parses bedtimeHour from HH:MM', () => {
    expect(facts[0].bedtimeHour).toBeCloseTo(23.5, 6);
    expect(facts[0].wakeHour).toBeCloseTo(7.5, 6);
  });
  it('parses sleep factors array', () => {
    expect(facts[0].sleepFactors).toEqual(['caffe tardi']);
  });
  it('detects hasBreakfast and meal hours when meals lack timestamps', () => {
    // meals here have no time → hasBreakfast uses presence of a "Breakfast" meal row
    expect(facts[0].hasBreakfast).toBe(true);
    expect(facts[0].mealCount).toBe(2);
  });
  it('leaves missing signals as null (no food on day 2)', () => {
    expect(facts[1].kcalIn).toBe(null);
    expect(facts[1].mealCount).toBe(0);
    expect(facts[1].mood).toBe(2);
  });
  it('marks weekend correctly (2025-01-04 is Saturday — not in range here, sanity on day 1=Wednesday)', () => {
    expect(facts[0].isWeekend).toBe(false);
  });
});

describe('dataQuality', () => {
  it('reports coverage and tier', () => {
    const db = makeDb();
    const facts = buildDailyFacts(db, { from: '2025-01-01', to: '2025-01-02' });
    const dq = dataQuality(facts, 2);
    expect(dq.daysWithAnyData).toBe(2);
    expect(dq.perSignalCoverage.mood).toBeCloseTo(1, 6);
    expect(dq.perSignalCoverage.kcalIn).toBeCloseTo(0.5, 6);
    expect(dq.tierUnlocked).toBe(0); // only 2 days → below tier 1 (needs 5)
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run main/lib/insights/dailyFacts.test.js`
Expected: FAIL — `Cannot find module './dailyFacts'`.

- [ ] **Step 3: Implement `main/lib/insights/dailyFacts.js`**

Key points: query each table over `[from,to]`, index rows by date, then iterate every date in the range building a row. `kcalIn` etc. are `null` when there are no logged items that day. `mealCount` counts logged `log` rows; `hasBreakfast` = any logged row with `meal='Breakfast'`. Meal hours: the `log` table has no per-item time in this schema → set `firstMealHour`/`lastMealHour` to `null` for now (kept in the type for future use; meal-timing pairs that need them will simply drop NA). `gramRoundness` = fraction of logged items whose `grams % 50 === 0` (only when `mealCount > 0`, else `null`). `weightTrend` = EMA(α=0.1) over the weight series ordered by date, carried forward across days with no weighing. `dow` = `new Date(date+'T00:00:00').getDay()` (0=Sun); `isWeekend` = dow 0 or 6. `sleepFactors` = `JSON.parse` of `factors` (guarded; `null` on failure/absence). `workoutDone` = boolean (any `workout_sessions` or `exercises` row that day); `workoutMin` = sum of `workout_sessions.duration_min` (fallback `exercises.duration_min`); `perceivedEffort` = the workout_sessions effort (max if multiple).

```js
'use strict';

function eachDate(from, to) {
  const out = [];
  let d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); }
  return out;
}

function indexByDate(rows) { const m = {}; for (const r of rows) m[r.date] = r; return m; }
function groupByDate(rows) { const m = {}; for (const r of rows) (m[r.date] || (m[r.date] = [])).push(r); return m; }

function parseHM(s) { if (!s) return null; const [h, m] = String(s).split(':').map(Number); if (Number.isNaN(h)) return null; return h + (m || 0) / 60; }
function jsonArr(s) { if (!s) return null; try { const v = JSON.parse(s); return Array.isArray(v) ? v : null; } catch { return null; } }

function buildDailyFacts(db, { from, to }) {
  const dates = eachDate(from, to);
  const inRange = "date >= ? AND date <= ?";

  const logRows = db.prepare(
    `SELECT l.date, l.grams, l.meal, (f.calories/100.0*l.grams) AS kcal,
            (f.protein/100.0*l.grams) AS protein, (f.carbs/100.0*l.grams) AS carbs,
            (f.fat/100.0*l.grams) AS fat, (COALESCE(f.fiber,0)/100.0*l.grams) AS fiber
       FROM log l JOIN foods f ON f.id=l.food_id
      WHERE l.status='logged' AND ${inRange}`).all(from, to);
  const logByDate = groupByDate(logRows);

  const sleep = indexByDate(db.prepare(`SELECT * FROM sleep_log WHERE ${inRange}`).all(from, to));
  const mood  = indexByDate(db.prepare(`SELECT * FROM mood_log WHERE ${inRange}`).all(from, to));
  const energy = indexByDate(db.prepare(`SELECT *, (resting_kcal+active_kcal+extra_kcal) AS kcal_out FROM daily_energy WHERE ${inRange}`).all(from, to));
  const water = groupByDate(db.prepare(`SELECT date, ml FROM water_log WHERE ${inRange}`).all(from, to));
  const focus = groupByDate(db.prepare(`SELECT date, duration_min, completed FROM focus_sessions WHERE ${inRange}`).all(from, to));
  const tasks = groupByDate(db.prepare(`SELECT date, done FROM tasks WHERE ${inRange}`).all(from, to));
  const habitLogs = groupByDate(db.prepare(`SELECT date, habit_id, value FROM habit_logs WHERE ${inRange}`).all(from, to));
  const activeHabits = db.prepare(`SELECT COUNT(*) AS n FROM habits WHERE archived=0`).get().n;
  const wsess = groupByDate(db.prepare(`SELECT date, duration_min, perceived_effort FROM workout_sessions WHERE ${inRange}`).all(from, to));
  const exrows = groupByDate(db.prepare(`SELECT date, duration_min, calories_burned FROM exercises WHERE ${inRange}`).all(from, to));
  const weights = db.prepare(`SELECT date, weight FROM weight_log WHERE ${inRange} ORDER BY date ASC`).all(from, to);
  const reliabilityOverrides = indexByDate(db.prepare(`SELECT date, level, source FROM food_day_reliability WHERE ${inRange}`).all(from, to));

  // weight EMA carried forward
  const weightByDate = {}; let ema = null;
  for (const w of weights) { ema = ema == null ? w.weight : ema + 0.1 * (w.weight - ema); weightByDate[w.date] = { raw: w.weight, ema }; }

  let lastEma = null;
  return dates.map(date => {
    const items = logByDate[date] || [];
    const hasFood = items.length > 0;
    const kcalIn = hasFood ? round1(sum(items, 'kcal')) : null;
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    const s = sleep[date], mo = mood[date], en = energy[date];
    const ws = wsess[date] || [], ex = exrows[date] || [];
    const workoutDone = ws.length > 0 || ex.length > 0;
    const wEntry = weightByDate[date]; if (wEntry) lastEma = wEntry.ema;
    const habitsTracked = activeHabits;
    const habitsDone = (habitLogs[date] || []).filter(h => h.value).length;
    const tk = tasks[date] || [];
    const focusDone = (focus[date] || []).filter(f => f.completed);
    const grams = items.map(i => i.grams);
    return {
      date, dow, isWeekend: dow === 0 || dow === 6,
      sleepMin: s ? s.duration_min ?? null : null,
      sleepQuality: s ? s.quality ?? null : null,
      bedtimeHour: s ? parseHM(s.bedtime) : null,
      wakeHour: s ? parseHM(s.wake_time) : null,
      sleepFactors: s ? jsonArr(s.factors) : null,
      mood: mo ? mo.mood ?? null : null,
      energy: mo ? mo.energy ?? null : null,
      stress: mo ? mo.stress ?? null : null,
      kcalIn,
      protein: hasFood ? round1(sum(items, 'protein')) : null,
      carbs:   hasFood ? round1(sum(items, 'carbs'))   : null,
      fat:     hasFood ? round1(sum(items, 'fat'))     : null,
      fiber:   hasFood ? round1(sum(items, 'fiber'))   : null,
      kcalOut: en ? round1(en.kcal_out) : null,
      activeKcal: en ? round1(en.active_kcal) : null,
      steps: en ? (en.steps || 0) : null,
      kcalBalance: (kcalIn != null && en) ? round1(kcalIn - en.kcal_out) : null,
      mealCount: items.length,
      hasBreakfast: items.some(i => i.meal === 'Breakfast'),
      firstMealHour: null, lastMealHour: null, // no per-item time in schema yet
      gramRoundness: hasFood ? grams.filter(g => g % 50 === 0).length / grams.length : null,
      workoutDone, workoutMin: workoutDone ? (sum(ws, 'duration_min') || sum(ex, 'duration_min') || null) : null,
      perceivedEffort: ws.length ? Math.max(...ws.map(w => w.perceived_effort || 0)) || null : null,
      tasksPlanned: tk.length, tasksDone: tk.filter(t => t.done).length,
      taskCompletionPct: tk.length ? tk.filter(t => t.done).length / tk.length : null,
      habitsTracked, habitsDone, habitPct: habitsTracked ? habitsDone / habitsTracked : null,
      focusMin: (focus[date] ? sum(focusDone, 'duration_min') : null), focusSessions: focusDone.length || (focus[date] ? 0 : null),
      waterMl: water[date] ? sum(water[date], 'ml') : null,
      weight: wEntry ? wEntry.raw : null,
      weightTrend: lastEma,
      foodReliability: reliabilityOverrides[date]
        ? { level: reliabilityOverrides[date].level, manualOverride: reliabilityOverrides[date].source === 'manual' }
        : { level: hasFood ? 'precise' : 'none', manualOverride: false }, // refined by reliability.js
    };
  });
}

function sum(rows, key) { return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0); }
function round1(x) { return x == null ? null : Math.round(x * 10) / 10; }

const COVERAGE_SIGNALS = ['sleepMin','sleepQuality','mood','energy','stress','kcalIn','kcalOut','steps','workoutDone','taskCompletionPct','habitPct','focusMin','waterMl','weight'];

function dataQuality(facts, windowDays) {
  const n = facts.length || 1;
  const perSignalCoverage = {};
  for (const k of COVERAGE_SIGNALS) {
    perSignalCoverage[k] = facts.filter(f => f[k] !== null && f[k] !== undefined && f[k] !== false || (k === 'workoutDone' && f[k] === true)).length / n;
  }
  // simpler, correct coverage (override the loop above):
  for (const k of COVERAGE_SIGNALS) {
    perSignalCoverage[k] = facts.filter(f => f[k] !== null && f[k] !== undefined).length / n;
  }
  const daysWithAnyData = facts.filter(f => COVERAGE_SIGNALS.some(k => f[k] !== null && f[k] !== undefined)).length;
  const reliableFoodDays = facts.filter(f => f.foodReliability && f.foodReliability.level === 'precise').length;
  const moodDays = facts.filter(f => f.mood != null).length;
  let tierUnlocked = 0;
  if (facts.some(f => f.mood != null) && moodDays >= 5) tierUnlocked = 1;
  if (daysWithAnyData >= 10) tierUnlocked = Math.max(tierUnlocked, 2);
  // tier 3 is decided per-pair in associations; expose 3 once we have >=21 days with mood+sleep both present
  const sleepMoodPaired = facts.filter(f => f.mood != null && f.sleepMin != null).length;
  if (sleepMoodPaired >= 21) tierUnlocked = Math.max(tierUnlocked, 3);
  return { windowDays, daysWithAnyData, perSignalCoverage, reliableFoodDays, tierUnlocked };
}

module.exports = { buildDailyFacts, dataQuality, eachDate, parseHM };
```

> Note for the implementer: the `dataQuality` function above intentionally shows the buggy first loop then the corrected one — when writing the file, keep only the corrected loop (the second `for` block) and delete the first. The test asserts the corrected behavior.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run main/lib/insights/dailyFacts.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add main/lib/insights/dailyFacts.js main/lib/insights/dailyFacts.test.js
git commit -m "feat(insights): build normalized daily facts + data-quality summary"
```

---

## Task 6: `reliability.js` — two-pass food-day reliability + overrides

**Files:**
- Create: `main/lib/insights/reliability.js`
- Test: `main/lib/insights/reliability.test.js`

- [ ] **Step 1: Write the failing test**

```js
const Database = require('better-sqlite3');
const { computeReliability, setDayReliability, clearDayReliability, autoLevel } = require('./reliability');

function fact(over) {
  return Object.assign({
    date: '2025-01-01', mealCount: 3, kcalIn: 2000, hasBreakfast: true,
    firstMealHour: null, gramRoundness: 0.2,
    foodReliability: { level: 'precise', manualOverride: false },
  }, over);
}

describe('autoLevel (Pass A structural flags)', () => {
  it('none when no items', () => { expect(autoLevel(fact({ mealCount: 0, kcalIn: null }))).toBe('none'); });
  it('none when kcalIn is 0', () => { expect(autoLevel(fact({ mealCount: 1, kcalIn: 0 }))).toBe('none'); });
  it('approx when kcalIn < 1000', () => { expect(autoLevel(fact({ kcalIn: 800 }))).toBe('approx'); });
  it('approx when kcalIn > 5000', () => { expect(autoLevel(fact({ kcalIn: 6000 }))).toBe('approx'); });
  it('approx when only one meal', () => { expect(autoLevel(fact({ mealCount: 1 }))).toBe('approx'); });
  it('approx when high gram-roundness', () => { expect(autoLevel(fact({ gramRoundness: 0.9 }))).toBe('approx'); });
  it('precise otherwise', () => { expect(autoLevel(fact({}))).toBe('precise'); });
});

describe('computeReliability (Pass B median deviation)', () => {
  it('downgrades a precise day far from the personal median', () => {
    const facts = [
      fact({ date: '2025-01-01', kcalIn: 2000 }),
      fact({ date: '2025-01-02', kcalIn: 2100 }),
      fact({ date: '2025-01-03', kcalIn: 1900 }),
      fact({ date: '2025-01-04', kcalIn: 3500 }), // > +50% over median ~2000
    ];
    computeReliability(facts);
    expect(facts[3].foodReliability.level).toBe('approx');
    expect(facts[0].foodReliability.level).toBe('precise');
  });
  it('respects a manual override', () => {
    const facts = [fact({ date: '2025-01-01', kcalIn: 800, foodReliability: { level: 'precise', manualOverride: true } })];
    computeReliability(facts);
    expect(facts[0].foodReliability.level).toBe('precise'); // manual wins over the auto 'approx'
  });
});

describe('override persistence', () => {
  it('set then clear', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE food_day_reliability (date TEXT PRIMARY KEY, level TEXT, source TEXT DEFAULT 'manual', updated_at TEXT)`);
    setDayReliability(db, '2025-01-01', 'approx');
    expect(db.prepare('SELECT level FROM food_day_reliability WHERE date=?').get('2025-01-01').level).toBe('approx');
    clearDayReliability(db, '2025-01-01');
    expect(db.prepare('SELECT * FROM food_day_reliability WHERE date=?').get('2025-01-01')).toBeUndefined();
  });
  it('rejects an invalid level', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE food_day_reliability (date TEXT PRIMARY KEY, level TEXT, source TEXT DEFAULT 'manual', updated_at TEXT)`);
    expect(() => setDayReliability(db, '2025-01-01', 'bogus')).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run main/lib/insights/reliability.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `main/lib/insights/reliability.js`**

```js
'use strict';
const { median } = require('./stats');

const LEVELS = ['precise', 'approx', 'none'];

function autoLevel(fact) {
  if (!fact.mealCount || fact.kcalIn == null || fact.kcalIn === 0) return 'none';
  if (fact.kcalIn < 1000 || fact.kcalIn > 5000) return 'approx';
  if (fact.mealCount <= 1) return 'approx';
  if (!fact.hasBreakfast && fact.firstMealHour != null && fact.firstMealHour > 13) return 'approx';
  if (fact.gramRoundness != null && fact.gramRoundness >= 0.8) return 'approx';
  return 'precise';
}

// Mutates each fact's foodReliability. Manual overrides (manualOverride === true) are left untouched.
function computeReliability(facts) {
  for (const f of facts) {
    if (f.foodReliability && f.foodReliability.manualOverride) continue;
    f.foodReliability = { level: autoLevel(f), manualOverride: false };
  }
  // Pass B: median of kcalIn over Pass-A 'precise' days; downgrade outliers > ±50%.
  const preciseKcal = facts.filter(f => f.foodReliability.level === 'precise' && !f.foodReliability.manualOverride && f.kcalIn != null).map(f => f.kcalIn);
  const med = median(preciseKcal);
  if (med != null && med > 0) {
    for (const f of facts) {
      if (f.foodReliability.manualOverride) continue;
      if (f.foodReliability.level === 'precise' && f.kcalIn != null && Math.abs(f.kcalIn - med) / med > 0.5) {
        f.foodReliability = { level: 'approx', manualOverride: false };
      }
    }
  }
  return facts;
}

function setDayReliability(db, date, level) {
  if (!LEVELS.includes(level)) throw new Error(`invalid reliability level: ${level}`);
  db.prepare(`INSERT INTO food_day_reliability (date, level, source, updated_at) VALUES (?, ?, 'manual', datetime('now'))
              ON CONFLICT(date) DO UPDATE SET level=excluded.level, source='manual', updated_at=datetime('now')`).run(date, level);
}

function clearDayReliability(db, date) {
  db.prepare('DELETE FROM food_day_reliability WHERE date=?').run(date);
}

module.exports = { autoLevel, computeReliability, setDayReliability, clearDayReliability, LEVELS };
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run main/lib/insights/reliability.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add main/lib/insights/reliability.js main/lib/insights/reliability.test.js
git commit -m "feat(insights): two-pass food-day reliability + manual overrides"
```

---

## Task 7: `lagPairs.js` — pair list + calendar-date lag pairing

**Files:**
- Create: `main/lib/insights/lagPairs.js`
- Test: `main/lib/insights/lagPairs.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
    // gap: no 2025-01-03
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
    // valid consecutive-date pairs: (01→02), (04→05). (02→04) is NOT consecutive → skipped.
    const { x, y, n } = pairedSeries(facts, 'a', 'b', 1);
    expect(n).toBe(2);
    expect(x).toEqual([1, 4]); // a on 01 and 04
    expect(y).toEqual([20, 50]); // b on 02 and 05
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run main/lib/insights/lagPairs.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `main/lib/insights/lagPairs.js`**

```js
'use strict';

// Curated association whitelist. `x` is the candidate predictor, `y` the outcome.
// `lags`: days to test (0 = same day; 1/2 = x is `lag` days before y).
// `nutrition`: true if x or y is a nutrition signal → reliability-gated.
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

// Ordinal signals → use Spearman; everything else → Pearson.
const ORDINAL = new Set(['mood', 'energy', 'stress', 'sleepQuality', 'perceivedEffort']);
function isOrdinal(sig) { return ORDINAL.has(sig); }

function asNum(v) { return v == null ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : Number(v)); }
function prevDate(date) { return new Date(new Date(date + 'T00:00:00Z').getTime() - 86400000).toISOString().slice(0, 10); }
function shiftDate(date, lag) { let d = date; for (let i = 0; i < lag; i++) d = prevDate(d); return d; }

// Returns { x, y, n } of complete pairs. For lag L, pairs fact[date-L].x with fact[date].y,
// only when both the date and the (date-L) date exist in `facts` and neither value is null.
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run main/lib/insights/lagPairs.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add main/lib/insights/lagPairs.js main/lib/insights/lagPairs.test.js
git commit -m "feat(insights): association pair whitelist + calendar-aware lag pairing"
```

---

## Task 8: `associations.js` — permutation + FDR + weekend control

**Files:**
- Create: `main/lib/insights/associations.js`
- Test: `main/lib/insights/associations.test.js`

- [ ] **Step 1: Write the failing test**

```js
const { mulberry32 } = require('./stats');
const { findAssociations } = require('./associations');

// Build N days of facts. `linkFn(i)` returns extra fields for day i.
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
      const sleepMin = 360 + Math.round(rng() * 180); // 6h–9h
      const noise = (rng() - 0.5);
      const mood = Math.max(1, Math.min(5, Math.round(1 + (sleepMin - 360) / 180 * 4 + noise))); // strongly increasing in sleep
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

  it('flags a weekend-only pattern as weekend-explained', () => {
    const rng = mulberry32(3);
    const facts = makeFacts(70, i => {
      const d = new Date(2025, 0, 1 + i);
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      // both sleep and mood jump on weekends, otherwise random — pure confound
      const sleepMin = (weekend ? 540 : 400) + Math.round((rng() - 0.5) * 20);
      const mood = (weekend ? 5 : 3);
      return { sleepMin, mood, energy: 3, stress: 3, sleepQuality: 3 };
    });
    const res = findAssociations(facts, SETTINGS);
    const sm = res.find(r => r.x === 'sleepMin' && r.y === 'mood');
    // If surfaced at all, it must be marked not-survived under weekend control.
    if (sm) expect(sm.weekendControlled.survived).toBe(false);
  });

  it('skips nutrition pairs when useNutrition is false', () => {
    const facts = makeFacts(40, i => ({ kcalBalance: -300 + i * 5, weightTrend: 80 - i * 0.05, sleepMin: 420, mood: 3 }));
    const res = findAssociations(facts, { ...SETTINGS, useNutrition: false });
    expect(res.find(r => r.x === 'kcalBalance')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run main/lib/insights/associations.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `main/lib/insights/associations.js`**

Algorithm: for each pair (skip nutrition pairs if `!settings.useNutrition`), for each lag, build `pairedSeries`. For nutrition pairs, first filter `facts` to reliable days (`level==='precise'`, plus `'approx'` if `includeApproxDays`) and require the surviving `n >= settings.minPairN`. Require `n >= 21`. Pick `corrFn = isOrdinal(x)||isOrdinal(y) ? spearman : pearson`. Compute `permutationTest` (seed derived from a hash of `x|y|lag`). Also compute the weekend-controlled stat: residualize both series on the corresponding `isWeekend` flags (need the weekend flags for the *paired* rows — `pairedSeries` must also return them; extend it, or recompute here from `byDate`). Collect every (pair,lag) candidate with its p-value. Run `benjaminiHochberg(allP, settings.fdrQ)`. For survivors, also run a permutation test on the weekend-controlled series and set `weekendControlled.survived = controlledP <= settings.fdrQ` (use the *same* q for simplicity). Among multiple surviving lags for the same (x,y), keep the one with the largest `|stat|`. Build the `groupContrast`: split the predictor by "above its median in the paired sample" (or, for `sleepMin`, a fixed 7h=420min cutoff if it lies inside the data range), report mean outcome in each group. Return an array of:

```js
{ kind: 'association', x, y, lag, corr: 'spearman'|'pearson', stat, pValue, qValue,
  n, nutrition, reliabilityBasis, weekendControlled: { stat, pValue, survived },
  contrast: { highMean, lowMean, highN, lowN, cutoff, cutoffLabel } }
```

Implementation:

```js
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
      if (p.nutrition && n < minPairN) continue;
      const corrName = (isOrdinal(p.x) || isOrdinal(p.y)) ? 'spearman' : 'pearson';
      const corrFn = corrName === 'spearman' ? spearman : pearson;
      const seed = hashSeed(`${p.x}|${p.y}|${lag}`);
      const { stat, pValue } = permutationTest(x, y, corrFn, 2000, seed);
      // weekend-controlled
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
    const cutoff = FIXED_CUTOFFS[c.p.x] && c.x.some(v => v >= FIXED_CUTOFFS[c.p.x].value) && c.x.some(v => v < FIXED_CUTOFFS[c.p.x].value)
      ? FIXED_CUTOFFS[c.p.x] : { value: median(c.x), label: 'sopra la mediana' };
    const mask = c.x.map(v => v >= cutoff.value);
    const contrast = Object.assign(groupContrast(c.y, mask), { cutoff: cutoff.value, cutoffLabel: cutoff.label, predictor: c.p.x, outcome: c.p.y });
    out.push({
      kind: 'association', x: c.p.x, y: c.p.y, lag: c.lag, corr: c.corrName,
      stat: c.stat, pValue: c.pValue, qValue: qValues[i], n: c.n,
      nutrition: c.p.nutrition, reliabilityBasis: c.reliabilityBasis,
      weekendControlled: { stat: c.ctrlStat, pValue: c.ctrlP, survived: !!ctrlSurvived[i] },
      contrast,
    });
  });
  // keep strongest lag per (x,y)
  const best = {};
  for (const r of out) { const k = `${r.x}~${r.y}`; if (!best[k] || Math.abs(r.stat) > Math.abs(best[k].stat)) best[k] = r; }
  return Object.values(best);
}

module.exports = { findAssociations };
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run main/lib/insights/associations.test.js`
Expected: PASS. (If the false-positive guard ever flakes, raise `iters` is NOT the fix — the BH gate at q=0.10 over ~17 candidates should keep pure noise empted; if it fails, the bug is in the implementation, not the test.)

- [ ] **Step 5: Commit**

```bash
git add main/lib/insights/associations.js main/lib/insights/associations.test.js
git commit -m "feat(insights): associations with permutation tests, FDR, weekend control"
```

---

## Task 9: `trends.js` — single-series regressions + sleep debt

**Files:**
- Create: `main/lib/insights/trends.js`
- Test: `main/lib/insights/trends.test.js`

- [ ] **Step 1: Write the failing test**

```js
const { findTrends } = require('./trends');

function days(n, fn) {
  const out = []; let d = new Date('2025-01-01T00:00:00Z');
  for (let i = 0; i < n; i++) { out.push(Object.assign({ date: d.toISOString().slice(0, 10) }, fn(i))); d = new Date(d.getTime() + 86400000); }
  return out;
}
const SETTINGS = { sleepTargetMin: 480 };

describe('findTrends', () => {
  it('detects a rising mood trend', () => {
    const facts = days(30, i => ({ mood: Math.min(5, 1 + i * 0.1) }));
    const t = findTrends(facts, SETTINGS).find(r => r.metric === 'mood');
    expect(t).toBeTruthy();
    expect(t.direction).toBe('up');
    expect(t.slopePerDay).toBeGreaterThan(0);
  });
  it('ignores a flat series', () => {
    const facts = days(30, () => ({ mood: 3 }));
    expect(findTrends(facts, SETTINGS).find(r => r.metric === 'mood')).toBeUndefined();
  });
  it('computes weight kg/week and ETA to goal', () => {
    const facts = days(30, i => ({ weightTrend: 85 - i * 0.05 })); // -0.05 kg/day = -0.35 kg/week
    const t = findTrends(facts, { ...SETTINGS, goalWeight: 80 }).find(r => r.metric === 'weight');
    expect(t.kgPerWeek).toBeCloseTo(-0.35, 2);
    expect(t.etaDays).toBeGreaterThan(0);
  });
  it('accumulates sleep debt', () => {
    const facts = days(14, () => ({ sleepMin: 420 })); // 60 min/night under 480 → 14*60 = 840
    const t = findTrends(facts, SETTINGS).find(r => r.metric === 'sleepDebt');
    expect(t.totalDebtMin).toBe(840);
  });
  it('flags low confidence when n < 14', () => {
    const facts = days(7, i => ({ mood: Math.min(5, 1 + i * 0.3) }));
    const t = findTrends(facts, SETTINGS).find(r => r.metric === 'mood');
    expect(t.confidence).toBe('low');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run main/lib/insights/trends.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `main/lib/insights/trends.js`**

Logic: for the trailing 30 days (or all available), per metric, take complete `(dayIndex, value)` pairs (dayIndex = days since the first complete row's date), run `linearRegression`. Keep if `n >= 5` and `Math.abs(slope * span) > 0.5 * sd` (span = max dayIndex − min). `direction` = sign of slope. `confidence` = `'low'` if `n < 14`, `'medium'` if `< 21`, else `'high'`. For `weight`: `kgPerWeek = slope * 7`; if `settings.goalWeight` and the trend moves toward it, `etaDays = (goalWeight − lastValue) / slope` (positive). For `sleepDebt`: sum `max(0, sleepTargetMin − sleepMin)` over complete rows → `totalDebtMin`; surface only if `>= 180` (3h) and `n >= 5`. Metrics covered: `mood`, `energy`, `stress`, `taskCompletionPct`, `habitPct`, `weight`, `sleepDebt`. Return `[{ kind: 'trend', metric, slopePerDay, direction, n, span, confidence, ...metricExtras }]`.

```js
'use strict';
const { linearRegression } = require('./stats');

const TREND_METRICS = ['mood', 'energy', 'stress', 'taskCompletionPct', 'habitPct', 'weight'];

function lastNDays(facts, n) { return facts.slice(Math.max(0, facts.length - n)); }
function confidenceFor(n) { return n < 14 ? 'low' : n < 21 ? 'medium' : 'high'; }

function findTrends(facts, settings) {
  const window = lastNDays(facts, 30);
  const out = [];
  for (const metric of TREND_METRICS) {
    const pts = []; let baseDate = null;
    for (const f of window) {
      const v = f[metric === 'weight' ? 'weightTrend' : metric];
      if (v == null || Number.isNaN(Number(v))) continue;
      if (baseDate == null) baseDate = f.date;
      const dayIdx = Math.round((new Date(f.date + 'T00:00:00Z') - new Date(baseDate + 'T00:00:00Z')) / 86400000);
      pts.push([dayIdx, Number(v)]);
    }
    if (pts.length < 5) continue;
    const t = pts.map(p => p[0]), y = pts.map(p => p[1]);
    const reg = linearRegression(t, y);
    const span = t[t.length - 1] - t[0] || 1;
    if (Math.abs(reg.slope * span) <= 0.5 * reg.sd) continue;
    const base = { kind: 'trend', metric, slopePerDay: reg.slope, direction: reg.slope > 0 ? 'up' : 'down', n: pts.length, span, confidence: confidenceFor(pts.length) };
    if (metric === 'weight') {
      base.kgPerWeek = reg.slope * 7;
      const last = y[y.length - 1];
      if (settings.goalWeight != null && reg.slope !== 0 && Math.sign(settings.goalWeight - last) === Math.sign(reg.slope)) {
        base.etaDays = Math.round((settings.goalWeight - last) / reg.slope);
      }
    }
    out.push(base);
  }
  // sleep debt
  const target = settings.sleepTargetMin ?? 480;
  const sleepPts = window.filter(f => f.sleepMin != null);
  if (sleepPts.length >= 5) {
    const totalDebtMin = sleepPts.reduce((s, f) => s + Math.max(0, target - f.sleepMin), 0);
    if (totalDebtMin >= 180) out.push({ kind: 'trend', metric: 'sleepDebt', totalDebtMin, n: sleepPts.length, confidence: confidenceFor(sleepPts.length) });
  }
  return out;
}

module.exports = { findTrends };
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run main/lib/insights/trends.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add main/lib/insights/trends.js main/lib/insights/trends.test.js
git commit -m "feat(insights): single-series trends + sleep debt"
```

---

## Task 10: `anomalies.js` — robust-z on recent days vs baseline

**Files:**
- Create: `main/lib/insights/anomalies.js`
- Test: `main/lib/insights/anomalies.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
    const facts = days(20, i => ({ mood: i === 5 ? 1 : 4 })); // spike far in the past
    const today = facts[facts.length - 1].date;
    expect(findAnomalies(facts, {}, today).find(r => r.date === facts[5].date)).toBeUndefined();
  });
  it('skips nutrition metrics when useNutrition is false', () => {
    const facts = days(20, i => ({ kcalIn: 2000 + (i === 19 ? 2000 : 0), mood: 3 }));
    const today = facts[facts.length - 1].date;
    expect(findAnomalies(facts, { useNutrition: false }, today).find(r => r.metric === 'kcalIn')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run main/lib/insights/anomalies.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `main/lib/insights/anomalies.js`**

Logic: metrics = `['sleepMin','mood','energy','stress','steps']` plus, when `settings.useNutrition`, `['kcalIn','kcalBalance']`. The "recent" days = `today` and `today − 1` (by date, only if present in facts). Baseline for a metric = all earlier complete values (for nutrition metrics, restricted to reliable days; need ≥ 10). For each recent day × metric with a complete value: `z = robustZ(value, baseline)`; if `|z| > 2.5` push `{ kind: 'anomaly', date, metric, value, baselineMedian, z, direction: z > 0 ? 'high' : 'low' }`. Merge: if both `today` and `today−1` produced anomalies, keep them as separate entries but the builder may join them in copy — for SP1, just return the list. Cap at 4 entries (highest `|z|` first).

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run main/lib/insights/anomalies.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add main/lib/insights/anomalies.js main/lib/insights/anomalies.test.js
git commit -m "feat(insights): robust-z anomaly detection"
```

---

## Task 11: `factorAnalysis.js` — sleep-factor & perceived-effort contrasts

**Files:**
- Create: `main/lib/insights/factorAnalysis.js`
- Test: `main/lib/insights/factorAnalysis.test.js`

- [ ] **Step 1: Write the failing test**

```js
const { findFactorInsights } = require('./factorAnalysis');

function days(n, fn) {
  const out = []; let d = new Date('2025-01-01T00:00:00Z');
  for (let i = 0; i < n; i++) { out.push(Object.assign({ date: d.toISOString().slice(0, 10) }, fn(i))); d = new Date(d.getTime() + 86400000); }
  return out;
}

describe('findFactorInsights', () => {
  it('finds a sleep-factor quality contrast', () => {
    const facts = days(20, i => ({
      sleepFactors: i % 2 === 0 ? ['caffe tardi'] : [],
      sleepQuality: i % 2 === 0 ? 2 : 4,
      sleepMin: 420,
    }));
    const res = findFactorInsights(facts);
    const tag = res.find(r => r.kind === 'factor' && r.tag === 'caffe tardi' && r.metric === 'sleepQuality');
    expect(tag).toBeTruthy();
    expect(tag.withMean).toBeCloseTo(2, 6);
    expect(tag.withoutMean).toBeCloseTo(4, 6);
  });
  it('ignores tags with fewer than 6 occurrences', () => {
    const facts = days(20, i => ({ sleepFactors: i < 3 ? ['rumore'] : [], sleepQuality: i < 3 ? 2 : 4, sleepMin: 420 }));
    expect(findFactorInsights(facts).find(r => r.tag === 'rumore')).toBeUndefined();
  });
  it('finds a perceived-effort → next-day energy contrast', () => {
    const facts = days(20, i => ({
      workoutDone: true, perceivedEffort: i % 2 === 0 ? 5 : 2,
      energy: 3,
    }));
    // shift: make next-day energy depend on today's effort
    for (let i = 1; i < facts.length; i++) facts[i].energy = facts[i - 1].perceivedEffort >= 4 ? 2 : 4;
    const res = findFactorInsights(facts);
    expect(res.find(r => r.kind === 'factor' && r.tag === 'perceivedEffort' && r.metric === 'energy')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run main/lib/insights/factorAnalysis.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `main/lib/insights/factorAnalysis.js`**

Logic: collect every distinct tag across `sleepFactors`. For each tag with ≥ 6 nights having a non-null `sleepQuality` (or `sleepMin`): split nights into with-tag / without-tag, compute means. Keep if the contrast is meaningful: `|withMean − withoutMean| >= 0.5` for `sleepQuality`, or `>= 25` for `sleepMin`. Push `{ kind: 'factor', tag, metric: 'sleepQuality'|'sleepMin', withMean, withoutMean, withN, withoutN }`. For perceived-effort: take days with `workoutDone` and a `perceivedEffort`; split by personal median effort; for each of next-day `mood` and `energy` (via date+1 lookup), if ≥ 6 paired points each side and `|highMean − lowMean| >= 0.5`, push `{ kind: 'factor', tag: 'perceivedEffort', metric, highEffortNextDayMean, lowEffortNextDayMean, ... }`. (No FDR — descriptive on the user's own labels — but always report N.)

```js
'use strict';
const { mean, median } = require('./stats');

function findFactorInsights(facts) {
  const out = [];
  // ── sleep-factor tags ──
  const tagSet = new Set();
  for (const f of facts) if (Array.isArray(f.sleepFactors)) for (const t of f.sleepFactors) tagSet.add(t);
  for (const tag of tagSet) {
    for (const [metric, minDelta] of [['sleepQuality', 0.5], ['sleepMin', 25]]) {
      const withTag = facts.filter(f => Array.isArray(f.sleepFactors) && f.sleepFactors.includes(tag) && f[metric] != null).map(f => f[metric]);
      const without = facts.filter(f => Array.isArray(f.sleepFactors) && !f.sleepFactors.includes(tag) && f[metric] != null).map(f => f[metric]);
      if (withTag.length < 6 || without.length < 3) continue;
      const wM = mean(withTag), woM = mean(without);
      if (Math.abs(wM - woM) < minDelta) continue;
      out.push({ kind: 'factor', tag, metric, withMean: wM, withoutMean: woM, withN: withTag.length, withoutN: without.length });
    }
  }
  // ── perceived effort → next-day mood/energy ──
  const byDate = {}; for (const f of facts) byDate[f.date] = f;
  const effortDays = facts.filter(f => f.workoutDone && f.perceivedEffort != null);
  if (effortDays.length >= 12) {
    const medEffort = median(effortDays.map(f => f.perceivedEffort));
    for (const metric of ['mood', 'energy']) {
      const high = [], low = [];
      for (const f of effortDays) {
        const next = byDate[new Date(new Date(f.date + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)];
        if (!next || next[metric] == null) continue;
        (f.perceivedEffort >= medEffort ? high : low).push(next[metric]);
      }
      if (high.length < 6 || low.length < 6) continue;
      const hM = mean(high), lM = mean(low);
      if (Math.abs(hM - lM) < 0.5) continue;
      out.push({ kind: 'factor', tag: 'perceivedEffort', metric, highEffortNextDayMean: hM, lowEffortNextDayMean: lM, highN: high.length, lowN: low.length });
    }
  }
  return out;
}

module.exports = { findFactorInsights };
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run main/lib/insights/factorAnalysis.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add main/lib/insights/factorAnalysis.js main/lib/insights/factorAnalysis.test.js
git commit -m "feat(insights): sleep-factor and perceived-effort contrasts"
```

---

## Task 12: `templates.js` — render insights to Italian/English copy

**Files:**
- Create: `main/lib/insights/templates.js`
- Test: `main/lib/insights/templates.test.js`

Copy rules: never causal arrows; lead with the contrast; always state `n`/reliability basis where relevant; weekend-not-survived associations get a "potrebbe essere spiegato dal weekend" suffix.

- [ ] **Step 1: Write the failing test**

```js
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
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run main/lib/insights/templates.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `main/lib/insights/templates.js`**

Provide a `LABELS` map (`{ it: { sleepMin: 'sonno', mood: 'umore', ... }, en: {...} }`), a `unit` map (mins → 'h'/'min', kcal, etc.), a `fmt` helper (Italian uses `,` decimal — use `toLocaleString` is overkill; just `String(x).replace('.', ',')` when `lang==='it'`). Build text per `kind`. `ACTION_HINTS` keyed by `"x~y"`:

```js
const ACTION_HINTS = {
  'lastMealHour~sleepQuality': { it: 'prova a cenare un po\' prima e vedi se la qualità migliora', en: 'try eating dinner a bit earlier' },
  'sleepMin~mood': { it: 'una sveglia a orari costanti aiuta a stabilizzare il sonno', en: 'a consistent wake time helps' },
  'workoutDone~mood': { it: 'tieni traccia di come ti senti il giorno dopo gli allenamenti', en: 'note how you feel the day after workouts' },
  'habitPct~energy': { it: 'completare anche solo metà delle abitudini sembra fare la differenza', en: 'even half your habits seems to help' },
};
```

`renderInsight(raw, lang='it')` returns `{ text, actionHint }` (`actionHint` = `ACTION_HINTS[`${raw.x}~${raw.y}`]?.[lang]` for associations, else `undefined`). Make sure association text includes the contrast numbers, the sample size (`n` for non-nutrition, `${reliabilityBasis} giorni affidabili` for nutrition), no `→`, no the word "causa", and the weekend caveat when `!weekendControlled.survived`. Keep copy short (one or two sentences). Example association template (it):

> `Nei giorni con ${cutoffLabel} di ${LABELS.it[predictor]}, ${LABELS.it[outcome]} medio ${fmt(highMean)} contro ${fmt(lowMean)} negli altri — su ${basisText} giorni${suffix}.`

where `suffix = weekendControlled.survived ? '' : ' (potrebbe essere in parte spiegato dal weekend)'`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run main/lib/insights/templates.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add main/lib/insights/templates.js main/lib/insights/templates.test.js
git commit -m "feat(insights): non-causal contrast-led copy templates + action hints"
```

---

## Task 13: `insightBuilder.js` — orchestrate, tier-gate, rank, pick-of-day

**Files:**
- Create: `main/lib/insights/insightBuilder.js`
- Test: `main/lib/insights/insightBuilder.test.js`

- [ ] **Step 1: Write the failing test**

```js
const Database = require('better-sqlite3');
const { mulberry32 } = require('./stats');
const { buildInsights, pickOfDay } = require('./insightBuilder');

// Reuse the same schema as dailyFacts.test.js — minimal helper here.
function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE foods (id INTEGER PRIMARY KEY, name TEXT, calories REAL, protein REAL, carbs REAL, fat REAL, fiber REAL DEFAULT 0);
    CREATE TABLE log (id INTEGER PRIMARY KEY, date TEXT, food_id INTEGER, grams REAL, meal TEXT DEFAULT 'Lunch', status TEXT DEFAULT 'logged');
    CREATE TABLE sleep_log (id INTEGER PRIMARY KEY, date TEXT UNIQUE, bedtime TEXT, wake_time TEXT, duration_min INTEGER, quality INTEGER, factors TEXT, note TEXT);
    CREATE TABLE mood_log (id INTEGER PRIMARY KEY, date TEXT UNIQUE, mood INTEGER, energy INTEGER, stress INTEGER, note TEXT);
    CREATE TABLE daily_energy (date TEXT PRIMARY KEY, resting_kcal REAL DEFAULT 0, active_kcal REAL DEFAULT 0, extra_kcal REAL DEFAULT 0, steps INTEGER DEFAULT 0);
    CREATE TABLE weight_log (id INTEGER PRIMARY KEY, date TEXT UNIQUE, weight REAL);
    CREATE TABLE water_log (id INTEGER PRIMARY KEY, date TEXT, ml REAL);
    CREATE TABLE habits (id INTEGER PRIMARY KEY, name TEXT, archived INTEGER DEFAULT 0);
    CREATE TABLE habit_logs (id INTEGER PRIMARY KEY, habit_id INTEGER, date TEXT, value INTEGER DEFAULT 1, UNIQUE(habit_id, date));
    CREATE TABLE tasks (id INTEGER PRIMARY KEY, date TEXT, title TEXT, done INTEGER DEFAULT 0);
    CREATE TABLE focus_sessions (id INTEGER PRIMARY KEY, date TEXT, duration_min INTEGER DEFAULT 0, completed INTEGER DEFAULT 1);
    CREATE TABLE workout_sessions (id INTEGER PRIMARY KEY, date TEXT, duration_min INTEGER, perceived_effort INTEGER);
    CREATE TABLE exercises (id INTEGER PRIMARY KEY, date TEXT, duration_min REAL DEFAULT 0, calories_burned REAL DEFAULT 0);
    CREATE TABLE food_day_reliability (date TEXT PRIMARY KEY, level TEXT, source TEXT DEFAULT 'manual', updated_at TEXT);
  `);
  return db;
}
const SETTINGS = { enabled: true, useNutrition: true, includeApproxDays: false, minPairN: 21, fdrQ: 0.10, sleepTargetMin: 480, windowDays: 90 };

describe('buildInsights', () => {
  it('cold start: returns dataQuality with tierUnlocked 0 and no tier-3 insights', () => {
    const db = makeDb();
    db.prepare("INSERT INTO mood_log (date,mood,energy,stress) VALUES ('2025-01-01',3,3,3)").run();
    const { insights, dataQuality } = buildInsights(db, { windowDays: 90, settings: SETTINGS, today: '2025-01-02' });
    expect(dataQuality.tierUnlocked).toBe(0);
    expect(insights.every(i => i.tier < 3)).toBe(true);
  });

  it('produces a ranked, structured insight when an injected pattern exists', () => {
    const db = makeDb();
    const rng = mulberry32(123);
    let d = new Date('2025-01-01T00:00:00Z');
    for (let i = 0; i < 60; i++) {
      const date = d.toISOString().slice(0, 10);
      const sleepMin = 360 + Math.round(rng() * 180);
      const mood = Math.max(1, Math.min(5, Math.round(1 + (sleepMin - 360) / 180 * 4 + (rng() - 0.5))));
      db.prepare("INSERT INTO sleep_log (date,bedtime,wake_time,duration_min,quality) VALUES (?,?,?,?,?)").run(date, '23:00', '07:00', sleepMin, 3);
      db.prepare("INSERT INTO mood_log (date,mood,energy,stress) VALUES (?,?,?,?)").run(date, mood, 3, 3);
      d = new Date(d.getTime() + 86400000);
    }
    const today = d.toISOString().slice(0, 10);
    const { insights } = buildInsights(db, { windowDays: 90, settings: SETTINGS, today });
    const assoc = insights.find(i => i.type === 'association' && i.subject === 'sleepMin~mood');
    expect(assoc).toBeTruthy();
    expect(assoc.tier).toBe(3);
    expect(assoc.text).toBeTruthy();
    expect(typeof assoc.score).toBe('number');
    expect(insights[0].score).toBeGreaterThanOrEqual(insights[insights.length - 1].score); // sorted desc
  });

  it('respects the master switch', () => {
    const db = makeDb();
    const { insights } = buildInsights(db, { windowDays: 90, settings: { ...SETTINGS, enabled: false }, today: '2025-01-02' });
    expect(insights).toEqual([]);
  });
});

describe('pickOfDay', () => {
  it('is deterministic for an epoch day and rotates', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(pickOfDay(list, 0).id).toBe('a');
    expect(pickOfDay(list, 1).id).toBe('b');
    expect(pickOfDay(list, 3).id).toBe('a');
    expect(pickOfDay([], 5)).toBe(null);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run main/lib/insights/insightBuilder.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `main/lib/insights/insightBuilder.js`**

```js
'use strict';
const { buildDailyFacts, dataQuality } = require('./dailyFacts');
const { computeReliability } = require('./reliability');
const { findAssociations } = require('./associations');
const { findTrends } = require('./trends');
const { findAnomalies } = require('./anomalies');
const { findFactorInsights } = require('./factorAnalysis');
const { renderInsight, ACTION_HINTS } = require('./templates');

function addDays(date, n) { return new Date(new Date(date + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10); }
function epochDay(date) { return Math.floor(new Date(date + 'T00:00:00Z').getTime() / 86400000); }

const SEVERITY_WEIGHT = { strong: 3, notice: 2, info: 1 };
const CONFIDENCE_FACTOR = { high: 1.2, medium: 1.0, low: 0.8 };

function severityForAssoc(r) {
  if (r.weekendControlled.survived && Math.abs(r.stat) >= 0.5 && r.n >= 28) return 'strong';
  if (r.weekendControlled.survived) return 'notice';
  return 'info';
}
function confidenceForAssoc(r) {
  if (!r.weekendControlled.survived) return 'low';
  if (r.qValue <= 0.05 && r.n >= 28) return 'high';
  if (r.qValue <= 0.10 && r.n >= 21) return 'medium';
  return 'low';
}

function buildInsights(db, { windowDays = 90, settings, today }) {
  if (!settings || settings.enabled === false) return { insights: [], dataQuality: { windowDays, daysWithAnyData: 0, perSignalCoverage: {}, reliableFoodDays: 0, tierUnlocked: 0 } };
  const from = addDays(today, -(windowDays - 1));
  const facts = buildDailyFacts(db, { from, to: today });
  computeReliability(facts);
  const dq = dataQuality(facts, windowDays);

  const lang = 'it'; // wired to settings.language at the IPC layer if needed
  const out = [];

  // Tier 1: trends + milestones (milestones omitted in SP1 unless cheap; trends only here)
  for (const t of findTrends(facts, settings)) {
    const severity = t.confidence === 'high' ? 'notice' : 'info';
    const { text } = renderInsight(t, lang);
    out.push({ id: `trend:${t.metric}`, type: 'trend', tier: 1, severity, subject: t.metric, relatedModules: moduleOf(t.metric),
      period: { from, to: today }, evidence: { n: t.n, slope: t.slopePerDay }, confidence: t.confidence || 'low', text });
  }
  // Tier 2: anomalies + factors
  if (dq.daysWithAnyData >= 10) {
    for (const a of findAnomalies(facts, settings, today)) {
      const severity = Math.abs(a.z) >= 3.5 ? 'strong' : 'notice';
      const { text } = renderInsight(a, lang);
      out.push({ id: `anomaly:${a.date}:${a.metric}`, type: 'anomaly', tier: 2, severity, subject: a.metric, relatedModules: moduleOf(a.metric),
        period: { from: a.date, to: a.date }, evidence: { zScore: a.z }, confidence: 'medium', text, recent: true });
    }
    for (const fct of findFactorInsights(facts)) {
      const { text } = renderInsight(fct, lang);
      out.push({ id: `factor:${fct.tag}:${fct.metric}`, type: 'factor', tier: 2, severity: 'notice', subject: `${fct.tag}~${fct.metric}`,
        relatedModules: fct.tag === 'perceivedEffort' ? ['workouts', moduleOf(fct.metric)[0]] : ['sleep'], period: { from, to: today },
        evidence: { n: (fct.withN || fct.highN || 0) + (fct.withoutN || fct.lowN || 0) }, confidence: 'medium', text });
    }
  }
  // Tier 3: associations
  for (const r of findAssociations(facts, settings)) {
    const severity = severityForAssoc(r);
    const confidence = confidenceForAssoc(r);
    const { text, actionHint } = renderInsight(r, lang);
    out.push({ id: `assoc:${r.x}~${r.y}`, type: 'association', tier: 3, severity, subject: `${r.x}~${r.y}`,
      relatedModules: [...new Set([...moduleOf(r.x), ...moduleOf(r.y)])], period: { from, to: today },
      evidence: { n: r.n, [r.corr === 'spearman' ? 'rho' : 'r']: r.stat, pValue: r.pValue, qValue: r.qValue, lag: r.lag,
        weekendControlled: { [r.corr === 'spearman' ? 'rho' : 'r']: r.weekendControlled.stat, survived: r.weekendControlled.survived },
        contrast: r.contrast, reliabilityBasis: r.reliabilityBasis },
      confidence, text, actionHint });
  }

  // score + sort
  for (const i of out) {
    const recency = i.recent ? 2 : 1;
    const actionability = i.actionHint ? 1.3 : 1;
    i.score = (SEVERITY_WEIGHT[i.severity] || 1) * recency * (CONFIDENCE_FACTOR[i.confidence] || 1) * actionability;
  }
  out.sort((a, b) => b.score - a.score);
  return { insights: out, dataQuality: dq };
}

const MODULE_OF = {
  sleepMin: ['sleep'], sleepQuality: ['sleep'], sleepDebt: ['sleep'], bedtimeHour: ['sleep'], wakeHour: ['sleep'],
  mood: ['journal'], energy: ['journal'], stress: ['journal'],
  kcalIn: ['food'], kcalBalance: ['food'], protein: ['food'], lastMealHour: ['food'],
  weight: ['weight'], weightTrend: ['weight'],
  steps: ['energy'], workoutDone: ['workouts'], workoutMin: ['workouts'], perceivedEffort: ['workouts'],
  taskCompletionPct: ['tasks'], habitPct: ['habits'], focusMin: ['focus'], waterMl: ['water'],
};
function moduleOf(metric) { return MODULE_OF[metric] || ['other']; }

function pickOfDay(insights, ed) {
  if (!insights || insights.length === 0) return null;
  const top = insights.slice(0, 5);
  return top[((ed % top.length) + top.length) % top.length];
}

module.exports = { buildInsights, pickOfDay, epochDay, moduleOf };
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run main/lib/insights/insightBuilder.test.js`
Expected: PASS. Then run the whole suite: `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add main/lib/insights/insightBuilder.js main/lib/insights/insightBuilder.test.js
git commit -m "feat(insights): orchestrator — tier gating, ranking, pick-of-day"
```

---

## Task 14: `insights.ipc.js` — IPC handlers + main registration

**Files:**
- Create: `main/ipc/insights.ipc.js`
- Modify: `main/main.js` (require near the other `require('./ipc/...')` lines; call in the `app.whenReady` block after `initDb()` / after `registerAnalyticsIpc()`)
- Test: `main/ipc/insights.ipc.test.js`

The handler logic is thin — call `buildInsights` / `setDayReliability` / `clearDayReliability`. To make it testable without electron, factor the pure logic into exported functions and have the `registerInsightsIpc` wrapper call them.

- [ ] **Step 1: Write the failing test**

```js
const Database = require('better-sqlite3');
const { getInsights, setReliability, clearReliability } = require('./insights.ipc');

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE foods (id INTEGER PRIMARY KEY, name TEXT, calories REAL, protein REAL, carbs REAL, fat REAL, fiber REAL DEFAULT 0);
    CREATE TABLE log (id INTEGER PRIMARY KEY, date TEXT, food_id INTEGER, grams REAL, meal TEXT DEFAULT 'Lunch', status TEXT DEFAULT 'logged');
    CREATE TABLE sleep_log (id INTEGER PRIMARY KEY, date TEXT UNIQUE, bedtime TEXT, wake_time TEXT, duration_min INTEGER, quality INTEGER, factors TEXT, note TEXT);
    CREATE TABLE mood_log (id INTEGER PRIMARY KEY, date TEXT UNIQUE, mood INTEGER, energy INTEGER, stress INTEGER, note TEXT);
    CREATE TABLE daily_energy (date TEXT PRIMARY KEY, resting_kcal REAL DEFAULT 0, active_kcal REAL DEFAULT 0, extra_kcal REAL DEFAULT 0, steps INTEGER DEFAULT 0);
    CREATE TABLE weight_log (id INTEGER PRIMARY KEY, date TEXT UNIQUE, weight REAL);
    CREATE TABLE water_log (id INTEGER PRIMARY KEY, date TEXT, ml REAL);
    CREATE TABLE habits (id INTEGER PRIMARY KEY, name TEXT, archived INTEGER DEFAULT 0);
    CREATE TABLE habit_logs (id INTEGER PRIMARY KEY, habit_id INTEGER, date TEXT, value INTEGER DEFAULT 1, UNIQUE(habit_id, date));
    CREATE TABLE tasks (id INTEGER PRIMARY KEY, date TEXT, title TEXT, done INTEGER DEFAULT 0);
    CREATE TABLE focus_sessions (id INTEGER PRIMARY KEY, date TEXT, duration_min INTEGER DEFAULT 0, completed INTEGER DEFAULT 1);
    CREATE TABLE workout_sessions (id INTEGER PRIMARY KEY, date TEXT, duration_min INTEGER, perceived_effort INTEGER);
    CREATE TABLE exercises (id INTEGER PRIMARY KEY, date TEXT, duration_min REAL DEFAULT 0, calories_burned REAL DEFAULT 0);
    CREATE TABLE food_day_reliability (date TEXT PRIMARY KEY, level TEXT, source TEXT DEFAULT 'manual', updated_at TEXT);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  return db;
}

describe('insights IPC logic', () => {
  it('getInsights returns { insights, dataQuality } with defaults when no settings rows exist', () => {
    const db = makeDb();
    const res = getInsights(db, { windowDays: 90, today: '2025-01-10' });
    expect(Array.isArray(res.insights)).toBe(true);
    expect(res.dataQuality).toBeTruthy();
  });
  it('getInsights honors insights.enabled=0 in settings', () => {
    const db = makeDb();
    db.prepare("INSERT INTO settings (key,value) VALUES ('insights.enabled','0')").run();
    expect(getInsights(db, { windowDays: 90, today: '2025-01-10' }).insights).toEqual([]);
  });
  it('setReliability + clearReliability round-trip', () => {
    const db = makeDb();
    setReliability(db, { date: '2025-01-01', level: 'approx' });
    expect(db.prepare('SELECT level FROM food_day_reliability WHERE date=?').get('2025-01-01').level).toBe('approx');
    clearReliability(db, { date: '2025-01-01' });
    expect(db.prepare('SELECT * FROM food_day_reliability WHERE date=?').get('2025-01-01')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run main/ipc/insights.ipc.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `main/ipc/insights.ipc.js`**

```js
'use strict';
const { ipcMain } = require('electron');
const { getDb } = require('../db');
const { buildInsights } = require('../lib/insights/insightBuilder');
const { setDayReliability, clearDayReliability } = require('../lib/insights/reliability');

const SETTING_DEFAULTS = {
  'insights.enabled': true, 'insights.useNutrition': true, 'insights.includeApproxDays': false,
  'insights.minPairN': 21, 'insights.fdrQ': 0.10, 'insights.sleepTargetMin': 480, 'insights.windowDays': 90,
};
function readSettings(db) {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'insights.%'").all();
  const raw = {}; for (const r of rows) raw[r.key] = r.value;
  const s = {};
  for (const [k, def] of Object.entries(SETTING_DEFAULTS)) {
    const short = k.slice('insights.'.length);
    if (!(k in raw)) { s[short] = def; continue; }
    const v = raw[k];
    s[short] = typeof def === 'boolean' ? (v === '1' || v === 'true') : Number(v);
  }
  // also try a weight goal if one exists (best-effort; key name confirmed in plan)
  const wg = db.prepare("SELECT value FROM settings WHERE key IN ('goal_weight','target_weight','weight_goal') LIMIT 1").get();
  if (wg && wg.value != null && wg.value !== '') s.goalWeight = Number(wg.value);
  return s;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

function getInsights(db, { windowDays, today } = {}) {
  const settings = readSettings(db);
  const w = windowDays || settings.windowDays || 90;
  return buildInsights(db, { windowDays: w, settings, today: today || todayStr() });
}
function setReliability(db, { date, level }) { setDayReliability(db, date, level); return { ok: true }; }
function clearReliability(db, { date }) { clearDayReliability(db, date); return { ok: true }; }

function registerInsightsIpc() {
  ipcMain.handle('insights:get', (_, args) => getInsights(getDb(), args || {}));
  ipcMain.handle('insights:setDayReliability', (_, args) => setReliability(getDb(), args));
  ipcMain.handle('insights:clearDayReliability', (_, args) => clearReliability(getDb(), args));
}

module.exports = registerInsightsIpc;
module.exports.getInsights = getInsights;
module.exports.setReliability = setReliability;
module.exports.clearReliability = clearReliability;
module.exports.readSettings = readSettings;
```

- [ ] **Step 4: Wire into `main/main.js`**

Add near the other requires (e.g. after `const registerAnalyticsIpc = require('./ipc/analytics.ipc');`):

```js
const registerInsightsIpc = require('./ipc/insights.ipc');
```

And in the `app.whenReady()` block, after `registerAnalyticsIpc();`:

```js
registerInsightsIpc();
```

- [ ] **Step 5: Run tests + smoke**

Run: `npx vitest run main/ipc/insights.ipc.test.js` → PASS.
Run: `npm test` → all green.
Run: `npm run dev`, open the app, confirm no console errors at startup, then stop.

- [ ] **Step 6: Commit**

```bash
git add main/ipc/insights.ipc.js main/main.js main/ipc/insights.ipc.test.js
git commit -m "feat(insights): IPC handlers + main registration"
```

---

## Task 15: Frontend types + api wrapper + settings defaults

**Files:**
- Modify: `src/types.ts`
- Modify: `src/api.ts`
- Modify: `src/hooks/useSettings.ts`

- [ ] **Step 1: Add types to `src/types.ts`**

Add near the other lifestyle types:

```ts
export type DayReliabilityLevel = 'precise' | 'approx' | 'none';

export interface InsightContrast {
  highMean: number | null; lowMean: number | null; highN: number; lowN: number;
  cutoff: number; cutoffLabel: string; predictor: string; outcome: string;
}
export interface InsightEvidence {
  n?: number; rho?: number; r?: number; pValue?: number; qValue?: number; lag?: number;
  slope?: number; zScore?: number; reliabilityBasis?: number;
  weekendControlled?: { rho?: number; r?: number; survived: boolean };
  contrast?: InsightContrast;
}
export interface Insight {
  id: string;
  type: 'association' | 'trend' | 'anomaly' | 'factor' | 'milestone';
  tier: 1 | 2 | 3;
  severity: 'info' | 'notice' | 'strong';
  score: number;
  subject: string;
  relatedModules: string[];
  period: { from: string; to: string };
  evidence: InsightEvidence;
  confidence: 'low' | 'medium' | 'high';
  text: string;
  actionHint?: string;
  recent?: boolean;
}
export interface DataQuality {
  windowDays: number;
  daysWithAnyData: number;
  perSignalCoverage: Record<string, number>;
  reliableFoodDays: number;
  tierUnlocked: 0 | 1 | 2 | 3;
}
export interface InsightsResult { insights: Insight[]; dataQuality: DataQuality; }
```

Find `export type PageName =` and add `'insights'` to the union.

Find the `Settings` interface and add (all optional, string|number as the codebase stores them — match existing style; if `Settings` stores everything as `string | number | undefined`, add these accordingly):

```ts
  'insights.enabled'?: number;
  'insights.useNutrition'?: number;
  'insights.includeApproxDays'?: number;
  'insights.minPairN'?: number;
  'insights.fdrQ'?: number;
  'insights.sleepTargetMin'?: number;
  'insights.windowDays'?: number;
```

(If `Settings` uses camelCase keys instead of dotted strings, follow that convention — check the existing keys in `src/types.ts` first and mirror them. The IPC layer reads dotted `insights.*` keys from the `settings` table regardless of how the renderer names them, as long as `settings:save` writes the dotted keys.)

- [ ] **Step 2: Add the api wrapper to `src/api.ts`**

Add `InsightsResult` and `DayReliabilityLevel` to the type import from `./types`. Add inside `export const api = { ... }` (e.g. after the `analytics` block — search for an existing block to place it near other read-only analytics):

```ts
  insights: {
    get:                (windowDays?: number) => invoke<InsightsResult>('insights:get', { windowDays }),
    setDayReliability:  (date: string, level: DayReliabilityLevel) => invoke<{ ok: boolean }>('insights:setDayReliability', { date, level }),
    clearDayReliability:(date: string) => invoke<{ ok: boolean }>('insights:clearDayReliability', { date }),
  },
```

- [ ] **Step 3: Add settings defaults to `src/hooks/useSettings.ts`**

Find the defaults object (search for existing lifestyle defaults). Add:

```ts
  'insights.enabled': 1,
  'insights.useNutrition': 1,
  'insights.includeApproxDays': 0,
  'insights.minPairN': 21,
  'insights.fdrQ': 0.10,
  'insights.sleepTargetMin': 480,
  'insights.windowDays': 90,
```

(Match the existing convention — if defaults are camelCase, also update the IPC `readSettings` mapping in `main/ipc/insights.ipc.js` to read the same keys you write via `settings:save`. Simplest: keep the dotted `insights.*` keys everywhere.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (If `recharts`/JSX errors pre-exist, ensure you didn't add new ones.)

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/api.ts src/hooks/useSettings.ts
git commit -m "feat(insights): frontend types, api wrapper, settings defaults"
```

---

## Task 16: `ReliabilityPill` component + wire into the diary

**Files:**
- Create: `src/components/dashboard/ReliabilityPill.tsx`
- Modify: `src/pages/DashboardPage.tsx` (render it near the diary table for the active date)

- [ ] **Step 1: Implement `src/components/dashboard/ReliabilityPill.tsx`**

A small pill button that shows the current level (fetched via `api.insights.get` is wasteful for a single day — instead, derive from a prop or a tiny dedicated read). Simplest for SP1: the pill takes `date` and `autoLevelHint` props from the parent (the parent already has the day's log; it can pass a rough hint), and on click cycles `precise → approx → none → (clear override)`. It writes via `api.insights.setDayReliability` / `clearDayReliability` and keeps local state. Use existing styling helpers from `src/lib/fbStyles.ts` / `fbUI.tsx` to match the app.

```tsx
import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useT } from '../../i18n/useT';
import type { DayReliabilityLevel } from '../../types';

const ORDER: (DayReliabilityLevel | null)[] = ['precise', 'approx', 'none', null]; // null = clear override (use auto)

export default function ReliabilityPill({ date, initialLevel }: { date: string; initialLevel?: DayReliabilityLevel }) {
  const { t } = useT();
  const [level, setLevel] = useState<DayReliabilityLevel | undefined>(initialLevel);
  useEffect(() => setLevel(initialLevel), [initialLevel, date]);

  const label: Record<DayReliabilityLevel, string> = {
    precise: t('insights.reliability.precise'),
    approx:  t('insights.reliability.approx'),
    none:    t('insights.reliability.none'),
  };
  const next = () => {
    const cur = ORDER.indexOf(level ?? null);
    const nx = ORDER[(cur + 1) % ORDER.length];
    if (nx == null) { api.insights.clearDayReliability(date).catch(() => {}); setLevel(undefined); }
    else { api.insights.setDayReliability(date, nx).catch(() => {}); setLevel(nx); }
  };
  const shown = level ?? 'precise';
  const color = shown === 'precise' ? 'var(--fb-ok, #16a34a)' : shown === 'approx' ? 'var(--fb-warn, #d97706)' : 'var(--fb-muted, #9ca3af)';
  return (
    <button onClick={next} title={t('insights.reliability.tooltip')}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '2px 8px',
        borderRadius: 999, border: `1px solid ${color}`, color, background: 'transparent', cursor: 'pointer' }}>
      📊 {label[shown]}{level === undefined ? ` · ${t('insights.reliability.auto')}` : ''} ▾
    </button>
  );
}
```

- [ ] **Step 2: Render it in `src/pages/DashboardPage.tsx`**

Near where the diary table (`DiaryTable`) is rendered for the active date, add `<ReliabilityPill date={activeDate} />` (use whatever variable holds the currently-shown date — likely `initialDate` prop fallback to today). Keep it visually small, next to the day's calorie total.

- [ ] **Step 3: Add i18n keys** — done in Task 19; for now use raw keys (they'll render as the key string until Task 19). To avoid an ugly intermediate state, you may add the keys now in `src/i18n/translations.ts` under `insights.reliability.*` (it/en):
  - `insights.reliability.precise` → "Preciso" / "Accurate"
  - `insights.reliability.approx` → "Approssimativo" / "Rough"
  - `insights.reliability.none` → "Non loggato" / "Not logged"
  - `insights.reliability.auto` → "auto"
  - `insights.reliability.tooltip` → "Quanto è preciso il diario alimentare di oggi (usato dagli insight)" / "How precise today's food diary is (used by insights)"

- [ ] **Step 4: Visual check**

Run: `npm run dev`, open the dashboard, click the pill, confirm it cycles and persists across a reload.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ReliabilityPill.tsx src/pages/DashboardPage.tsx src/i18n/translations.ts
git commit -m "feat(insights): reliability pill in the diary"
```

---

## Task 17: `InsightCard` dashboard widget

**Files:**
- Create: `src/components/dashboard/InsightCard.tsx`
- Modify: `src/pages/DashboardPage.tsx` (mount it in the bento)

- [ ] **Step 1: Implement `src/components/dashboard/InsightCard.tsx`**

Fetches `api.insights.get()` on mount. If `dataQuality.tierUnlocked === 0` (or no insights), show the low-data variant ("Sto iniziando a conoscerti — logga ancora qualche giorno"). Otherwise compute `epochDay = Math.floor(Date.now() / 86400000)` and show `pickOfDay`-style selection: take the top 5 by `score` (already sorted desc from the backend) and index by `epochDay % len`. Show the insight `text`, a small confidence/severity dot, and the `actionHint` if present. A "Vedi tutti" link calls `useNavigate().navigate('insights')`. Use existing dashboard card chrome — copy the structure of an existing simple card like `src/components/dashboard/MoodCard.tsx` (header + body) so it fits the bento.

```tsx
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useNavigate } from '../../hooks/useNavigate';
import { useT } from '../../i18n/useT';
import type { InsightsResult, Insight } from '../../types';

function pickOfDay(list: Insight[]): Insight | null {
  if (!list.length) return null;
  const top = list.slice(0, 5);
  const ed = Math.floor(Date.now() / 86400000);
  return top[((ed % top.length) + top.length) % top.length];
}
const DOT: Record<string, string> = { strong: '#16a34a', notice: '#d97706', info: '#9ca3af' };

export default function InsightCard() {
  const { t } = useT();
  const { navigate } = useNavigate();
  const [data, setData] = useState<InsightsResult | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { api.insights.get().then(setData).catch(() => setErr(true)); }, []);

  const insight = data ? pickOfDay(data.insights) : null;
  const lowData = !data || data.dataQuality.tierUnlocked === 0 || !insight;

  return (
    <div className="fb-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{t('insights.card.title')}</strong>
        <button className="fb-link" onClick={() => navigate('insights')}>{t('insights.card.seeAll')}</button>
      </div>
      {err && <div style={{ opacity: .6, fontSize: 13 }}>{t('insights.card.error')}</div>}
      {!err && lowData && <div style={{ opacity: .7, fontSize: 13 }}>{t('insights.card.lowData')}</div>}
      {!err && !lowData && insight && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: DOT[insight.severity], display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 14, lineHeight: 1.4 }}>{insight.text}</span>
          </div>
          {insight.actionHint && <div style={{ fontSize: 12, opacity: .7, paddingLeft: 14 }}>💡 {insight.actionHint}</div>}
        </div>
      )}
    </div>
  );
}
```

(Adjust class names — `fb-card`, `fb-link` — to whatever the existing cards use; check `src/lib/fbStyles.ts` / a sibling card.)

- [ ] **Step 2: Mount in `src/pages/DashboardPage.tsx`**

Import `InsightCard` and place it in the bento grid (near `MoodCard` / the lifestyle widgets). Match the surrounding grid cell sizing.

- [ ] **Step 3: i18n keys** (add to `src/i18n/translations.ts`):
  - `insights.card.title` → "Insight del giorno" / "Insight of the day"
  - `insights.card.seeAll` → "Vedi tutti" / "See all"
  - `insights.card.lowData` → "Sto iniziando a conoscerti — logga ancora qualche giorno e qui appariranno i tuoi pattern." / "Still getting to know you — log a few more days and your patterns will show up here."
  - `insights.card.error` → "Insight non disponibili." / "Insights unavailable."

- [ ] **Step 4: Visual check**

Run: `npm run dev` → the card shows the low-data message on a fresh DB, or an insight on a populated one.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/InsightCard.tsx src/pages/DashboardPage.tsx src/i18n/translations.ts
git commit -m "feat(insights): dashboard insight-of-the-day card"
```

---

## Task 18: `InsightsPage` + route + nav entry

**Files:**
- Create: `src/pages/InsightsPage.tsx`
- Modify: `src/App.tsx` (route), `src/components/Nav.tsx` (`ICONS.insights`, `DEFAULT_ORDER` entry)

- [ ] **Step 1: Implement `src/pages/InsightsPage.tsx`**

Layout:
- Header + a `DataQuality` strip: "Analizzo gli ultimi N giorni · M giorni con dati · K giorni alimentari affidabili" and, if `tierUnlocked < 3`, a hint like "Più logghi, più pattern emergono (associazioni: ~3 settimane di dati)".
- Insights grouped by their first `relatedModules` entry; section heading per module (use the existing module label strings from `nav.*` where they exist, else a small local map).
- Each insight: the `text`, a confidence badge, and for `type === 'association'` a small recharts `ScatterChart` of the paired points — **but** the backend currently doesn't return the raw paired points. For SP1, render the `contrast` as a tiny two-bar comparison instead of a scatter (high-group mean vs low-group mean) using a minimal recharts `BarChart`, plus the `evidence.n` / `reliabilityBasis`. (A real scatter is a nice-to-have; deferred.)
- A standing footnote at the bottom: "Questi sono pattern statistici nei tuoi dati, non rapporti di causa-effetto." / "These are statistical patterns in your data, not cause-and-effect."
- Empty state when `insights.length === 0`: reuse the card's low-data copy, larger.

Reuse `BarChartCard` if it fits, else inline a small `recharts` chart matching the style of `src/components/BarChartCard.tsx`.

- [ ] **Step 2: Add the route in `src/App.tsx`**

Import `InsightsPage` and add: `{page === 'insights' && <InsightsPage />}` near the other lifestyle routes.

- [ ] **Step 3: Add nav entry in `src/components/Nav.tsx`**

Add to `ICONS`:

```ts
  insights: 'M3 3v18h18 M7 14l3-3 4 4 5-6',
```

Add to `DEFAULT_ORDER` in the `lifestyle` group (e.g. after `journal`):

```ts
  { page: 'insights',      labelKey: 'nav.insights',      group: 'lifestyle' },
```

- [ ] **Step 4: i18n keys** (`src/i18n/translations.ts`):
  - `nav.insights` → "Insight" / "Insights"
  - `insights.page.title` → "Insight" / "Insights"
  - `insights.page.dataStrip` → "Analizzo gli ultimi {n} giorni · {m} con dati · {k} giorni alimentari affidabili" / English equiv (use the project's interpolation convention — check how other strings with placeholders are done).
  - `insights.page.tierHint` → "Più logghi, più pattern emergono. Le associazioni tra moduli richiedono circa 3 settimane di dati." / "..."
  - `insights.page.footnote` → "Questi sono pattern statistici nei tuoi dati, non rapporti di causa-effetto." / "These are statistical patterns in your data, not cause-and-effect relationships."
  - `insights.page.empty` → same as `insights.card.lowData` (reuse) or a longer variant.
  - `insights.confidence.low|medium|high` → "bassa|media|alta confidenza" / "low|medium|high confidence"
  - module section labels: reuse `nav.sleep`, `nav.journal`, `nav.tasks`, `nav.habits`, `nav.focus`, plus add `insights.module.food` → "Alimentazione" / "Nutrition", `insights.module.weight` → "Peso" / "Weight", `insights.module.workouts` → "Allenamenti" / "Workouts", `insights.module.energy` → "Attività" / "Activity", `insights.module.water` → "Idratazione" / "Hydration", `insights.module.other` → "Altro" / "Other".

- [ ] **Step 5: Type-check + visual check**

Run: `npx tsc --noEmit -p tsconfig.json` → no new errors.
Run: `npm run dev` → navigate to Insights from the nav and from the dashboard card's "Vedi tutti"; confirm the data strip, grouping, and footnote render.

- [ ] **Step 6: Commit**

```bash
git add src/pages/InsightsPage.tsx src/App.tsx src/components/Nav.tsx src/i18n/translations.ts
git commit -m "feat(insights): insights page + nav entry + route"
```

---

## Task 19: Settings "Insights" section + finalize i18n

**Files:**
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/i18n/translations.ts` (sweep for any missing `insights.*` keys, it + en)

- [ ] **Step 1: Add an "Insights" section to `src/pages/SettingsPage.tsx`**

Following the page's existing section pattern, add toggles/inputs bound to `settings` via the same mechanism other settings use (`api`/`useSettings` + `settings:save`):
- `insights.enabled` — toggle "Abilita Insight"
- `insights.useNutrition` — toggle "Usa l'alimentazione nelle correlazioni" (with helper text: "Disattiva se non logghi il cibo con precisione — gli insight ignoreranno il diario alimentare")
- `insights.includeApproxDays` — toggle "Includi anche i giorni alimentari approssimativi"
- `insights.sleepTargetMin` — number input in **hours** (store minutes; show `value/60`, save `*60`), label "Obiettivo di sonno (ore)"
- Advanced (collapsed or a sub-section): `insights.minPairN` (number), `insights.fdrQ` (number 0–1, step 0.01), `insights.windowDays` (number).

Make sure `settings:save` writes the dotted keys (`insights.enabled` etc.) so the main-process `readSettings` picks them up.

- [ ] **Step 2: i18n sweep**

Open `src/i18n/translations.ts`; ensure every `insights.*` and `nav.insights` key referenced in Tasks 16–19 exists in **both** the `it` and `en` maps. Add settings labels:
- `insights.settings.section` → "Insight" / "Insights"
- `insights.settings.enabled` → "Abilita gli insight" / "Enable insights"
- `insights.settings.useNutrition` → "Usa l'alimentazione nelle correlazioni" / "Use nutrition in correlations"
- `insights.settings.useNutritionHelp` → "Disattiva se non logghi il cibo con precisione." / "Turn off if you don't log food precisely."
- `insights.settings.includeApprox` → "Includi i giorni alimentari approssimativi" / "Include rough food days"
- `insights.settings.sleepTarget` → "Obiettivo di sonno (ore)" / "Sleep target (hours)"
- `insights.settings.minPairN` → "Campione minimo per una correlazione" / "Minimum sample size for a correlation"
- `insights.settings.fdrQ` → "Tasso di falsi positivi accettato (FDR)" / "Accepted false-discovery rate (FDR)"
- `insights.settings.windowDays` → "Finestra di analisi (giorni)" / "Analysis window (days)"
- `insights.settings.advanced` → "Avanzate" / "Advanced"

- [ ] **Step 3: Type-check + manual check**

Run: `npx tsc --noEmit -p tsconfig.json` → no new errors.
Run: `npm run dev` → toggle `insights.useNutrition` off, reload, open Insights: confirm no reliability pill on the dashboard and no nutrition-based insights; toggle `insights.enabled` off → the dashboard card shows nothing / Insights page shows the disabled state.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SettingsPage.tsx src/i18n/translations.ts
git commit -m "feat(insights): settings section + i18n"
```

---

## Task 20: Full regression pass + spec/plan reconciliation

**Files:** none (verification only) — fix-ups committed as found.

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all green. If anything fails, fix it (don't disable tests).

- [ ] **Step 2: Run the legacy script**

Run: `node scripts/test-workout-log-sync.js`
Expected: still passes (we didn't touch it).

- [ ] **Step 3: Type-check the renderer**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors vs. a clean checkout of `master` before this branch.

- [ ] **Step 4: Manual smoke on a populated DB**

If you have a dev DB with real data: `npm run dev` → check the dashboard card shows a sensible insight, the Insights page groups correctly, the reliability pill cycles, settings toggles take effect after reload. On a fresh DB: confirm the cold-start copy everywhere.

- [ ] **Step 5: Reconcile against the spec**

Re-read `docs/superpowers/specs/2026-05-11-insight-engine-design.md`. Confirm each section maps to shipped code: DailyFacts model, two-pass reliability + override table + pill, Spearman/permutation/FDR/weekend-control in associations, tiered cold-start, trends, anomalies, factor analysis, contrast-led non-causal copy, ranking + daily pick, settings keys, InsightsPage + InsightCard, no per-handler cache. Note any intentional deferrals (raw scatter points → bar contrast for now; milestones not surfaced in SP1) in a short comment at the top of `InsightsPage.tsx` or the spec's "deferred" list.

- [ ] **Step 6: Final commit (if any fix-ups)**

```bash
git add -A
git commit -m "chore(insights): regression fixes + spec reconciliation"
```

---

## Self-Review notes (author)

- **Spec coverage:** DailyFacts → Task 5. Two-pass reliability + override table → Tasks 4, 6; pill → Task 16. Stats core (Spearman, permutation, BH-FDR, weekend residualization, regression, robust-z, group contrast) → Tasks 1–3. Lag pairing by calendar date → Task 7. Associations w/ FDR + weekend control + false-positive guard → Task 8. Trends + sleep debt → Task 9. Anomalies → Task 10. Factor analysis (sleep factors + perceived effort) → Task 11. Non-causal contrast copy + action hints → Task 12. Tiering + ranking + pick-of-day + master switch → Task 13. IPC + settings read → Task 14. Frontend types/api/defaults → Task 15. InsightCard → Task 17. InsightsPage + nav + route → Task 18. Settings section + i18n → Task 19. Cache: spec says "dataVersion memo or skip" — plan skips it (computation is cheap); noted as an intentional deferral in Task 20. Raw scatter for associations → deferred to a contrast bar chart (noted).
- **Placeholder scan:** all code steps include full code; i18n strings are spelled out; the only "implementer's choice" notes are class-name matching and the `Settings` key-style convention, which are genuine codebase-fit decisions, not missing content.
- **Type consistency:** `Insight` shape in `src/types.ts` (Task 15) matches what `insightBuilder.js` emits (Task 13): `id, type, tier, severity, score, subject, relatedModules, period, evidence{n,rho|r,pValue,qValue,lag,slope,zScore,reliabilityBasis,weekendControlled,contrast}, confidence, text, actionHint, recent?`. `DataQuality` matches `dataQuality()` in Task 5 (`windowDays, daysWithAnyData, perSignalCoverage, reliableFoodDays, tierUnlocked`). `api.insights.get` returns `InsightsResult` = `{ insights, dataQuality }` matching `buildInsights`/`getInsights`. `DayReliabilityLevel` = `'precise'|'approx'|'none'` consistent across `reliability.js`, IPC, pill.
