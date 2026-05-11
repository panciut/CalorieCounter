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
function sum(rows, key) { return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0); }
function round1(x) { return x == null ? null : Math.round(x * 10) / 10; }

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
    const hasWorkout = ws.length > 0 || ex.length > 0;
    const workoutDone = hasWorkout ? true : null;
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
      firstMealHour: null, lastMealHour: null,
      gramRoundness: hasFood ? grams.filter(g => g % 50 === 0).length / grams.length : null,
      workoutDone, workoutMin: hasWorkout ? (sum(ws, 'duration_min') || sum(ex, 'duration_min') || null) : null,
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
        : { level: hasFood ? 'precise' : 'none', manualOverride: false },
    };
  });
}

const COVERAGE_SIGNALS = ['sleepMin','sleepQuality','mood','energy','stress','kcalIn','kcalOut','steps','workoutDone','taskCompletionPct','habitPct','focusMin','waterMl','weight'];

function dataQuality(facts, windowDays) {
  const n = facts.length || 1;
  const perSignalCoverage = {};
  for (const k of COVERAGE_SIGNALS) {
    perSignalCoverage[k] = facts.filter(f => f[k] !== null && f[k] !== undefined).length / n;
  }
  const daysWithAnyData = facts.filter(f => COVERAGE_SIGNALS.some(k => f[k] !== null && f[k] !== undefined)).length;
  const reliableFoodDays = facts.filter(f => f.foodReliability && f.foodReliability.level === 'precise').length;
  const moodDays = facts.filter(f => f.mood != null).length;
  let tierUnlocked = 0;
  if (moodDays >= 5) tierUnlocked = 1;
  if (daysWithAnyData >= 10) tierUnlocked = Math.max(tierUnlocked, 2);
  const sleepMoodPaired = facts.filter(f => f.mood != null && f.sleepMin != null).length;
  if (sleepMoodPaired >= 21) tierUnlocked = Math.max(tierUnlocked, 3);
  return { windowDays, daysWithAnyData, perSignalCoverage, reliableFoodDays, tierUnlocked };
}

module.exports = { buildDailyFacts, dataQuality, eachDate, parseHM };
