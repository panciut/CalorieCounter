const { ipcMain } = require('electron');
const { getDb } = require('../db');

// ── Helpers ──────────────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dowFromIso(iso) {
  return new Date(iso + 'T00:00:00').getDay(); // 0..6 Sun..Sat
}

// Linear regression slope (kg per day) from points [{date, value}], returns 0 if <2 points.
function slopePerDay(points) {
  const valid = points.filter(p => p.value != null);
  if (valid.length < 2) return 0;
  const t0 = new Date(valid[0].date + 'T00:00:00').getTime();
  const xs = valid.map(p => (new Date(p.date + 'T00:00:00').getTime() - t0) / 86400000);
  const ys = valid.map(p => p.value);
  const n = xs.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// ── Streak helpers (current/best by days with at least one logged food) ──────

function computeStreaks(db) {
  const rows = db.prepare(`
    SELECT DISTINCT date FROM log WHERE status = 'logged' ORDER BY date
  `).all().map(r => r.date);
  if (rows.length === 0) return { current: 0, best: 0 };
  let best = 1, run = 1;
  for (let i = 1; i < rows.length; i++) {
    if (addDays(rows[i - 1], 1) === rows[i]) { run++; if (run > best) best = run; }
    else run = 1;
  }
  // current streak = run ending today (or yesterday)
  const t = today();
  const last = rows[rows.length - 1];
  let current = 0;
  if (last === t || last === addDays(t, -1)) {
    current = 1;
    for (let i = rows.length - 2; i >= 0; i--) {
      if (addDays(rows[i], 1) === rows[i + 1]) current++;
      else break;
    }
  }
  return { current, best };
}

// ── Main handler ─────────────────────────────────────────────────────────────

function registerAnalyticsIpc() {
  // Legacy endpoints (still used by HistoryPage)
  ipcMain.handle('analytics:caloriesTrend', (_, { days = 30 }) => {
    const db = getDb();
    const foodIn = db.prepare(`
      SELECT l.date, SUM(f.calories / 100.0 * l.grams) as calories_in
      FROM log l JOIN foods f ON f.id = l.food_id
      WHERE l.status = 'logged' AND l.date >= date('now', '-' || ? || ' days')
      GROUP BY l.date
    `).all(days - 1);

    const energyOut = db.prepare(`
      SELECT date, resting_kcal, active_kcal, extra_kcal, steps,
             (resting_kcal + active_kcal + extra_kcal) as calories_out
      FROM daily_energy
      WHERE date >= date('now', '-' || ? || ' days')
    `).all(days - 1);

    const map = {};
    for (const row of foodIn) map[row.date] = { date: row.date, calories_in: row.calories_in, calories_out: 0, resting_kcal: 0, active_kcal: 0, extra_kcal: 0, steps: 0 };
    for (const row of energyOut) {
      if (!map[row.date]) map[row.date] = { date: row.date, calories_in: 0, calories_out: 0, resting_kcal: 0, active_kcal: 0, extra_kcal: 0, steps: 0 };
      map[row.date].calories_out = row.calories_out;
      map[row.date].resting_kcal = row.resting_kcal;
      map[row.date].active_kcal  = row.active_kcal;
      map[row.date].extra_kcal   = row.extra_kcal;
      map[row.date].steps        = row.steps;
    }

    return Object.values(map).map(r => ({
      date:         r.date,
      calories_in:  Math.round(r.calories_in),
      calories_out: Math.round(r.calories_out),
      resting_kcal: Math.round(r.resting_kcal),
      active_kcal:  Math.round(r.active_kcal),
      extra_kcal:   Math.round(r.extra_kcal),
      steps:        r.steps || 0,
      net:          Math.round(r.calories_in - r.calories_out),
    })).sort((a, b) => a.date.localeCompare(b.date));
  });

  ipcMain.handle('analytics:macroTrend', (_, { days = 30 }) => {
    const db = getDb();
    return db.prepare(`
      SELECT l.date,
             ROUND(SUM(f.protein / 100.0 * l.grams)) as protein,
             ROUND(SUM(f.carbs   / 100.0 * l.grams)) as carbs,
             ROUND(SUM(f.fat     / 100.0 * l.grams)) as fat,
             ROUND(SUM(f.fiber   / 100.0 * l.grams)) as fiber
      FROM log l JOIN foods f ON f.id = l.food_id
      WHERE l.status = 'logged' AND l.date >= date('now', '-' || ? || ' days')
      GROUP BY l.date
      ORDER BY l.date
    `).all(days - 1);
  });

  ipcMain.handle('analytics:exerciseTrend', (_, { days = 60 }) => {
    const db = getDb();
    return db.prepare(`
      SELECT date, COUNT(*) as count,
             SUM(duration_min) as total_min,
             SUM(calories_burned) as total_burned
      FROM exercises
      WHERE date >= date('now', '-' || ? || ' days')
      GROUP BY date
      ORDER BY date
    `).all(days - 1);
  });

  // ── Big bundled stats endpoint ─────────────────────────────────────────────
  // days = number, or null/0 = all-time.
  ipcMain.handle('analytics:stats', (_, args = {}) => {
    const db = getDb();
    const { days = 90 } = args;
    const todayStr = today();
    const isAll = !days || days === 0 || days === 'all';

    // Determine start date
    let startDate;
    if (isAll) {
      const earliest = db.prepare(`
        SELECT MIN(d) AS d FROM (
          SELECT MIN(date) AS d FROM log
          UNION ALL SELECT MIN(date) FROM exercises
          UNION ALL SELECT MIN(date) FROM weight_log
          UNION ALL SELECT MIN(date) FROM daily_energy
          UNION ALL SELECT MIN(date) FROM water_log
          UNION ALL SELECT MIN(date) FROM body_measurements
        )
      `).get();
      startDate = earliest && earliest.d ? earliest.d : todayStr;
    } else {
      startDate = addDays(todayStr, -(Number(days) - 1));
    }
    const dayCount = isAll
      ? Math.max(1, Math.round((new Date(todayStr + 'T00:00:00') - new Date(startDate + 'T00:00:00')) / 86400000) + 1)
      : Number(days);

    // ── Per-day food aggregate (range) ───────────────────────────────────────
    const foodByDay = db.prepare(`
      SELECT l.date,
             SUM(f.calories / 100.0 * l.grams) AS kcal,
             SUM(f.protein  / 100.0 * l.grams) AS protein,
             SUM(f.carbs    / 100.0 * l.grams) AS carbs,
             SUM(f.fat      / 100.0 * l.grams) AS fat,
             SUM(f.fiber    / 100.0 * l.grams) AS fiber,
             SUM(COALESCE(f.sugar,0)         / 100.0 * l.grams) AS sugar,
             SUM(COALESCE(f.saturated_fat,0) / 100.0 * l.grams) AS saturated_fat,
             SUM(COALESCE(f.sodium_mg,0)     / 100.0 * l.grams) AS sodium_mg
      FROM log l JOIN foods f ON f.id = l.food_id
      WHERE l.status = 'logged' AND l.date >= ? AND l.date <= ?
      GROUP BY l.date
      ORDER BY l.date
    `).all(startDate, todayStr);

    // ── Daily energy (range) ────────────────────────────────────────────────
    const energyByDay = db.prepare(`
      SELECT date, resting_kcal, active_kcal, extra_kcal, steps, distance_km
      FROM daily_energy
      WHERE date >= ? AND date <= ?
      ORDER BY date
    `).all(startDate, todayStr);

    // ── Settings (for compliance) ───────────────────────────────────────────
    const settingsRows = db.prepare(`SELECT key, value FROM settings`).all();
    const settings = {};
    for (const r of settingsRows) settings[r.key] = r.value;
    const numS = (k, def) => {
      const n = Number(settings[k]);
      return Number.isFinite(n) ? n : def;
    };
    const cal_min = numS('cal_min', 0);
    const cal_max = numS('cal_max', 0);
    const protein_min = numS('protein_min', 0);
    const protein_max = numS('protein_max', 0);
    const carbs_min   = numS('carbs_min', 0);
    const carbs_max   = numS('carbs_max', 0);
    const fat_min     = numS('fat_min', 0);
    const fat_max     = numS('fat_max', 0);
    const fiber_min   = numS('fiber_min', 0);
    const fiber_max   = numS('fiber_max', 0);

    function compliance(rows, key, lo, hi) {
      if (!rows.length || (lo === 0 && hi === 0)) return { hit: 0, total: 0, pct: 0 };
      let hit = 0;
      for (const r of rows) {
        const v = r[key] || 0;
        const okHi = hi > 0 ? v <= hi : true;
        const okLo = lo > 0 ? v >= lo : true;
        if (okHi && okLo) hit++;
      }
      return { hit, total: rows.length, pct: Math.round(hit * 100 / rows.length) };
    }

    // ── Summary stats ───────────────────────────────────────────────────────
    const days_with_food   = foodByDay.length;
    const days_with_energy = energyByDay.length;
    const sumF = (k) => foodByDay.reduce((s, r) => s + (r[k] || 0), 0);
    const total_kcal_in = sumF('kcal');
    const total_kcal_out = energyByDay.reduce((s, r) => s + (r.resting_kcal + r.active_kcal + r.extra_kcal), 0);

    const days_with_weight = db.prepare(`
      SELECT COUNT(*) AS c FROM weight_log WHERE date >= ? AND date <= ?
    `).get(startDate, todayStr).c;

    const streak = computeStreaks(db);

    // ── Macro split (avg % of total kcal) ───────────────────────────────────
    const tot_p = sumF('protein'), tot_c = sumF('carbs'), tot_f = sumF('fat');
    const totMacroKcal = tot_p * 4 + tot_c * 4 + tot_f * 9;
    const macroSplit = totMacroKcal > 0 ? {
      protein_pct: Math.round(tot_p * 4 * 100 / totMacroKcal),
      carbs_pct:   Math.round(tot_c * 4 * 100 / totMacroKcal),
      fat_pct:     Math.round(tot_f * 9 * 100 / totMacroKcal),
    } : { protein_pct: 0, carbs_pct: 0, fat_pct: 0 };

    // protein per kg body weight (using latest weight)
    const latestW = db.prepare(`SELECT weight FROM weight_log ORDER BY date DESC LIMIT 1`).get();
    const protein_g_per_kg_bw = (latestW && latestW.weight && days_with_food > 0)
      ? +(tot_p / days_with_food / latestW.weight).toFixed(2)
      : null;

    // ── Top foods (range) ───────────────────────────────────────────────────
    const topFoodsByFreq = db.prepare(`
      SELECT l.food_id,
             COALESCE(f.display_name, f.name) AS name,
             COUNT(*) AS count,
             SUM(l.grams) AS total_g,
             SUM(f.calories / 100.0 * l.grams) AS total_kcal
      FROM log l JOIN foods f ON f.id = l.food_id
      WHERE l.status = 'logged' AND l.date >= ? AND l.date <= ?
      GROUP BY l.food_id
      ORDER BY count DESC, total_kcal DESC
      LIMIT 12
    `).all(startDate, todayStr);

    const topFoodsByKcal = db.prepare(`
      SELECT l.food_id,
             COALESCE(f.display_name, f.name) AS name,
             COUNT(*) AS count,
             SUM(l.grams) AS total_g,
             SUM(f.calories / 100.0 * l.grams) AS total_kcal
      FROM log l JOIN foods f ON f.id = l.food_id
      WHERE l.status = 'logged' AND l.date >= ? AND l.date <= ?
      GROUP BY l.food_id
      ORDER BY total_kcal DESC
      LIMIT 12
    `).all(startDate, todayStr);

    // ── Meal distribution (avg kcal per meal, % of total) ───────────────────
    const mealRows = db.prepare(`
      SELECT l.meal,
             SUM(f.calories / 100.0 * l.grams) AS kcal,
             COUNT(*) AS items
      FROM log l JOIN foods f ON f.id = l.food_id
      WHERE l.status = 'logged' AND l.date >= ? AND l.date <= ?
      GROUP BY l.meal
    `).all(startDate, todayStr);
    const totalMealKcal = mealRows.reduce((s, r) => s + (r.kcal || 0), 0) || 1;
    const mealOrder = ['Breakfast', 'MorningSnack', 'Lunch', 'AfternoonSnack', 'Dinner', 'EveningSnack'];
    const mealDistribution = mealOrder.map(m => {
      const r = mealRows.find(x => x.meal === m);
      const k = r ? r.kcal : 0;
      return {
        meal: m,
        kcal: Math.round(k),
        avg_kcal: days_with_food > 0 ? Math.round(k / days_with_food) : 0,
        pct: Math.round(k * 100 / totalMealKcal),
        items: r ? r.items : 0,
      };
    });

    // ── Body composition (range) ────────────────────────────────────────────
    const weightPoints = db.prepare(`
      SELECT date, weight, fat_pct, muscle_mass
      FROM weight_log
      WHERE date >= ? AND date <= ?
      ORDER BY date
    `).all(startDate, todayStr);
    const bodyPoints = weightPoints.map(p => ({
      date: p.date,
      weight: p.weight,
      fat_pct: p.fat_pct,
      lean_kg: (p.weight && p.fat_pct != null) ? +(p.weight * (1 - p.fat_pct / 100)).toFixed(2) : null,
      muscle_mass: p.muscle_mass,
    }));
    const wFirst = bodyPoints[0];
    const wLast  = bodyPoints[bodyPoints.length - 1];
    const slopeKgPerDay = slopePerDay(bodyPoints.map(p => ({ date: p.date, value: p.weight })));
    const goalWeight = numS('weight_goal', 0);
    let goal_eta_days = null;
    if (goalWeight > 0 && wLast && Math.abs(slopeKgPerDay) > 0.001) {
      const remaining = goalWeight - wLast.weight;
      const days = remaining / slopeKgPerDay;
      if (days > 0 && Number.isFinite(days) && days < 365 * 5) goal_eta_days = Math.round(days);
    }
    const measFirst = db.prepare(`
      SELECT * FROM body_measurements WHERE date >= ? AND date <= ? ORDER BY date ASC LIMIT 1
    `).get(startDate, todayStr);
    const measLast = db.prepare(`
      SELECT * FROM body_measurements WHERE date >= ? AND date <= ? ORDER BY date DESC LIMIT 1
    `).get(startDate, todayStr);

    // ── Training (range) ────────────────────────────────────────────────────
    const exRows = db.prepare(`
      SELECT e.id, e.date, e.type, e.duration_min, e.calories_burned, e.notes,
             et.muscle_groups AS muscle_groups, et.category AS category
      FROM exercises e
      LEFT JOIN exercise_types et ON et.name = e.type
      WHERE e.date >= ? AND e.date <= ?
      ORDER BY e.date
    `).all(startDate, todayStr);
    const setRows = db.prepare(`
      SELECT s.exercise_id, s.reps, s.weight_kg, e.date, e.type, et.muscle_groups
      FROM exercise_sets s
      JOIN exercises e ON e.id = s.exercise_id
      LEFT JOIN exercise_types et ON et.name = e.type
      WHERE e.date >= ? AND e.date <= ?
    `).all(startDate, todayStr);

    const tCat = {};
    for (const e of exRows) {
      const c = e.category || 'other';
      if (!tCat[c]) tCat[c] = { category: c, sessions: 0, minutes: 0, burned: 0 };
      tCat[c].sessions++;
      tCat[c].minutes += e.duration_min || 0;
      tCat[c].burned  += e.calories_burned || 0;
    }
    const tMuscle = {};
    for (const s of setRows) {
      if (s.weight_kg == null || s.reps == null) continue;
      const groups = (s.muscle_groups || '').split(',').map(x => x.trim()).filter(Boolean);
      const vol = s.weight_kg * s.reps;
      for (const m of groups) {
        if (!tMuscle[m]) tMuscle[m] = { muscle: m, sets: 0, total_volume_kg: 0 };
        tMuscle[m].sets++;
        tMuscle[m].total_volume_kg += vol;
      }
    }
    const exerciseAgg = {};
    for (const e of exRows) {
      const k = e.type;
      if (!exerciseAgg[k]) exerciseAgg[k] = { name: k, sessions: 0, total_minutes: 0, total_burned: 0, total_volume_kg: 0 };
      exerciseAgg[k].sessions++;
      exerciseAgg[k].total_minutes += e.duration_min || 0;
      exerciseAgg[k].total_burned  += e.calories_burned || 0;
    }
    for (const s of setRows) {
      if (s.weight_kg == null || s.reps == null) continue;
      const k = s.type;
      if (!exerciseAgg[k]) exerciseAgg[k] = { name: k, sessions: 0, total_minutes: 0, total_burned: 0, total_volume_kg: 0 };
      exerciseAgg[k].total_volume_kg += s.weight_kg * s.reps;
    }
    const top_exercises = Object.values(exerciseAgg)
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10)
      .map(x => ({
        ...x,
        total_minutes: Math.round(x.total_minutes),
        total_burned:  Math.round(x.total_burned),
        total_volume_kg: Math.round(x.total_volume_kg),
      }));
    const longest_session = exRows.reduce((best, e) =>
      (!best || (e.duration_min || 0) > (best.duration_min || 0)) ? e : best, null);

    const schedRows = db.prepare(`
      SELECT status, COUNT(*) AS c FROM workout_schedule
      WHERE date >= ? AND date <= ? GROUP BY status
    `).all(startDate, todayStr);
    let schedDone = 0, schedTotal = 0;
    for (const r of schedRows) {
      if (r.status === 'rest') continue;
      schedTotal += r.c;
      if (r.status === 'done') schedDone += r.c;
    }
    const plan_done_pct = schedTotal > 0 ? Math.round(schedDone * 100 / schedTotal) : null;

    // ── Activity (range) ────────────────────────────────────────────────────
    const totSteps    = energyByDay.reduce((s, r) => s + (r.steps || 0), 0);
    const totDist     = energyByDay.reduce((s, r) => s + (r.distance_km || 0), 0);
    const totActive   = energyByDay.reduce((s, r) => s + (r.active_kcal || 0), 0);
    const totResting  = energyByDay.reduce((s, r) => s + (r.resting_kcal || 0), 0);
    const totExtra    = energyByDay.reduce((s, r) => s + (r.extra_kcal || 0), 0);
    const maxStepsRow = energyByDay.reduce((b, r) => (!b || (r.steps || 0) > (b.steps || 0) ? r : b), null);
    const activity = {
      avg_steps:        days_with_energy > 0 ? Math.round(totSteps / days_with_energy) : 0,
      total_steps:      totSteps,
      max_steps_day:    maxStepsRow ? { date: maxStepsRow.date, steps: maxStepsRow.steps } : null,
      avg_distance_km:  days_with_energy > 0 ? +(totDist / days_with_energy).toFixed(2) : 0,
      total_distance_km:+totDist.toFixed(2),
      avg_active_kcal:  days_with_energy > 0 ? Math.round(totActive / days_with_energy) : 0,
      total_active_kcal:Math.round(totActive),
      avg_resting_kcal: days_with_energy > 0 ? Math.round(totResting / days_with_energy) : 0,
      avg_extra_kcal:   days_with_energy > 0 ? Math.round(totExtra / days_with_energy) : 0,
      total_extra_kcal: Math.round(totExtra),
      points: energyByDay.map(r => ({
        date: r.date,
        steps: r.steps || 0,
        distance_km: +(r.distance_km || 0).toFixed(2),
        active_kcal: Math.round(r.active_kcal || 0),
        resting_kcal: Math.round(r.resting_kcal || 0),
        extra_kcal: Math.round(r.extra_kcal || 0),
      })),
    };

    // ── Heatmap (last 365 days, fixed regardless of range) ──────────────────
    const heatStart = addDays(todayStr, -364);
    const heatFood = db.prepare(`
      SELECT l.date, SUM(f.calories / 100.0 * l.grams) AS kcal
      FROM log l JOIN foods f ON f.id = l.food_id
      WHERE l.status = 'logged' AND l.date >= ?
      GROUP BY l.date
    `).all(heatStart);
    const heatFoodMap = new Map(heatFood.map(r => [r.date, r.kcal]));
    const heatEnergy = new Set(db.prepare(`SELECT date FROM daily_energy WHERE date >= ?`).all(heatStart).map(r => r.date));
    const heatWeight = new Set(db.prepare(`SELECT date FROM weight_log WHERE date >= ?`).all(heatStart).map(r => r.date));
    const heatExercise = new Set(db.prepare(`SELECT DISTINCT date FROM exercises WHERE date >= ?`).all(heatStart).map(r => r.date));
    const heatmap = [];
    for (let i = 0; i < 365; i++) {
      const d = addDays(heatStart, i);
      heatmap.push({
        date: d,
        kcal: Math.round(heatFoodMap.get(d) || 0),
        has_food: heatFoodMap.has(d) ? 1 : 0,
        has_energy: heatEnergy.has(d) ? 1 : 0,
        has_weight: heatWeight.has(d) ? 1 : 0,
        has_exercise: heatExercise.has(d) ? 1 : 0,
      });
    }

    // ── Day-of-week patterns (range) ────────────────────────────────────────
    const dowAgg = Array.from({ length: 7 }, (_, i) => ({ dow: i, kcal_sum: 0, kcal_n: 0, burned_sum: 0, burned_n: 0, steps_sum: 0, steps_n: 0, sessions: 0 }));
    for (const r of foodByDay) {
      const i = dowFromIso(r.date);
      dowAgg[i].kcal_sum += r.kcal || 0;
      dowAgg[i].kcal_n++;
    }
    for (const r of energyByDay) {
      const i = dowFromIso(r.date);
      dowAgg[i].steps_sum += r.steps || 0;
      dowAgg[i].steps_n++;
    }
    const exByDate = {};
    for (const e of exRows) {
      if (!exByDate[e.date]) exByDate[e.date] = { burned: 0, sessions: 0 };
      exByDate[e.date].burned += e.calories_burned || 0;
      exByDate[e.date].sessions++;
    }
    for (const [d, v] of Object.entries(exByDate)) {
      const i = dowFromIso(d);
      dowAgg[i].burned_sum += v.burned;
      dowAgg[i].burned_n++;
      dowAgg[i].sessions += v.sessions;
    }
    const dayOfWeek = dowAgg.map(d => ({
      dow: d.dow,
      avg_kcal:   d.kcal_n   > 0 ? Math.round(d.kcal_sum   / d.kcal_n)   : 0,
      avg_burned: d.burned_n > 0 ? Math.round(d.burned_sum / d.burned_n) : 0,
      avg_steps:  d.steps_n  > 0 ? Math.round(d.steps_sum  / d.steps_n)  : 0,
      sessions:   d.sessions,
    }));

    // ── Records (all-time) ──────────────────────────────────────────────────
    const totals_alltime = db.prepare(`
      SELECT
        (SELECT COUNT(DISTINCT date) FROM log WHERE status='logged') AS days_logged,
        (SELECT ROUND(SUM(f.calories / 100.0 * l.grams)) FROM log l JOIN foods f ON f.id = l.food_id WHERE l.status='logged') AS total_kcal,
        (SELECT COUNT(*) FROM exercises) AS total_workouts,
        (SELECT ROUND(SUM(distance_km), 1) FROM daily_energy) AS total_distance_km,
        (SELECT SUM(steps) FROM daily_energy) AS total_steps,
        (SELECT ROUND(SUM(ml)) FROM water_log) AS total_water_ml
    `).get();

    const biggestKcalDay = db.prepare(`
      SELECT l.date AS date, ROUND(SUM(f.calories / 100.0 * l.grams)) AS kcal
      FROM log l JOIN foods f ON f.id = l.food_id
      WHERE l.status='logged'
      GROUP BY l.date
      ORDER BY kcal DESC LIMIT 1
    `).get();
    const smallestKcalDay = db.prepare(`
      SELECT l.date AS date, ROUND(SUM(f.calories / 100.0 * l.grams)) AS kcal
      FROM log l JOIN foods f ON f.id = l.food_id
      WHERE l.status='logged'
      GROUP BY l.date
      HAVING kcal > 0
      ORDER BY kcal ASC LIMIT 1
    `).get();
    const mostStepsDay = db.prepare(`
      SELECT date, steps FROM daily_energy WHERE steps > 0 ORDER BY steps DESC LIMIT 1
    `).get();
    const mostBurnedDay = db.prepare(`
      SELECT date, ROUND(SUM(calories_burned)) AS kcal FROM exercises GROUP BY date ORDER BY kcal DESC LIMIT 1
    `).get();
    const longestSessionAll = db.prepare(`
      SELECT date, type, duration_min, ROUND(calories_burned) AS calories_burned
      FROM exercises ORDER BY duration_min DESC LIMIT 1
    `).get();
    const heaviestSet = db.prepare(`
      SELECT e.date, e.type, s.weight_kg, s.reps
      FROM exercise_sets s JOIN exercises e ON e.id = s.exercise_id
      WHERE s.weight_kg IS NOT NULL
      ORDER BY s.weight_kg DESC LIMIT 1
    `).get();
    const longestRun = db.prepare(`
      SELECT e.date, e.type, e.duration_min
      FROM exercises e LEFT JOIN exercise_types et ON et.name = e.type
      WHERE et.category = 'cardio'
      ORDER BY e.duration_min DESC LIMIT 1
    `).get();
    const mostWaterDay = db.prepare(`
      SELECT date, ROUND(SUM(ml)) AS ml FROM water_log GROUP BY date ORDER BY ml DESC LIMIT 1
    `).get();
    const biggestWeightDrop = (() => {
      const all = db.prepare(`SELECT date, weight FROM weight_log ORDER BY date`).all();
      if (all.length < 2) return null;
      let bestDrop = 0, from = null, to = null;
      // simple approach: find max - subsequent min
      let maxW = all[0].weight, maxDate = all[0].date;
      for (let i = 1; i < all.length; i++) {
        const drop = maxW - all[i].weight;
        if (drop > bestDrop) { bestDrop = drop; from = { date: maxDate, weight: maxW }; to = all[i]; }
        if (all[i].weight > maxW) { maxW = all[i].weight; maxDate = all[i].date; }
      }
      return bestDrop > 0 ? { drop_kg: +bestDrop.toFixed(2), from, to } : null;
    })();

    return {
      range: { days: dayCount, start_date: startDate, end_date: todayStr, is_all: !!isAll },
      summary: {
        days_with_food,
        days_with_energy,
        days_with_weight,
        total_kcal_logged:  Math.round(total_kcal_in),
        total_kcal_burned:  Math.round(total_kcal_out),
        avg_kcal_per_day:   days_with_food > 0 ? Math.round(total_kcal_in / days_with_food) : 0,
        avg_protein_per_day:days_with_food > 0 ? Math.round(tot_p / days_with_food) : 0,
        avg_carbs_per_day:  days_with_food > 0 ? Math.round(tot_c / days_with_food) : 0,
        avg_fat_per_day:    days_with_food > 0 ? Math.round(tot_f / days_with_food) : 0,
        avg_fiber_per_day:  days_with_food > 0 ? Math.round(sumF('fiber') / days_with_food) : 0,
        avg_kcal_out_per_day: days_with_energy > 0 ? Math.round(total_kcal_out / days_with_energy) : 0,
        avg_net_per_day: (days_with_food > 0 && days_with_energy > 0)
          ? Math.round((total_kcal_in / days_with_food) - (total_kcal_out / days_with_energy))
          : null,
        current_streak: streak.current,
        best_streak:    streak.best,
      },
      compliance: {
        calories: compliance(foodByDay, 'kcal',    cal_min,     cal_max),
        protein:  compliance(foodByDay, 'protein', protein_min, protein_max),
        carbs:    compliance(foodByDay, 'carbs',   carbs_min,   carbs_max),
        fat:      compliance(foodByDay, 'fat',     fat_min,     fat_max),
        fiber:    compliance(foodByDay, 'fiber',   fiber_min,   fiber_max),
      },
      macroSplit: {
        ...macroSplit,
        protein_g_per_kg_bw,
        body_weight_kg: latestW ? latestW.weight : null,
      },
      micros: foodByDay.map(r => ({
        date: r.date,
        sugar:         +(r.sugar || 0).toFixed(1),
        saturated_fat: +(r.saturated_fat || 0).toFixed(1),
        sodium_mg:     Math.round(r.sodium_mg || 0),
      })),
      caloriesByDay: foodByDay.map(r => ({
        date: r.date,
        kcal:    Math.round(r.kcal || 0),
        protein: Math.round(r.protein || 0),
        carbs:   Math.round(r.carbs || 0),
        fat:     Math.round(r.fat || 0),
        fiber:   Math.round(r.fiber || 0),
      })),
      topFoodsByFreq: topFoodsByFreq.map(r => ({
        food_id: r.food_id, name: r.name, count: r.count,
        total_g: Math.round(r.total_g), total_kcal: Math.round(r.total_kcal),
      })),
      topFoodsByKcal: topFoodsByKcal.map(r => ({
        food_id: r.food_id, name: r.name, count: r.count,
        total_g: Math.round(r.total_g), total_kcal: Math.round(r.total_kcal),
      })),
      mealDistribution,
      body: {
        weight_first: wFirst ? wFirst.weight : null,
        weight_last:  wLast  ? wLast.weight  : null,
        weight_delta: (wFirst && wLast) ? +(wLast.weight - wFirst.weight).toFixed(2) : null,
        fat_first:    wFirst ? wFirst.fat_pct : null,
        fat_last:     wLast  ? wLast.fat_pct  : null,
        fat_delta:    (wFirst && wLast && wFirst.fat_pct != null && wLast.fat_pct != null)
                       ? +(wLast.fat_pct - wFirst.fat_pct).toFixed(2) : null,
        lean_first:   wFirst ? wFirst.lean_kg : null,
        lean_last:    wLast  ? wLast.lean_kg  : null,
        lean_delta:   (wFirst && wLast && wFirst.lean_kg != null && wLast.lean_kg != null)
                       ? +(wLast.lean_kg - wFirst.lean_kg).toFixed(2) : null,
        weekly_rate_kg: +(slopeKgPerDay * 7).toFixed(3),
        goal_weight: goalWeight || null,
        goal_eta_days,
        points: bodyPoints,
        meas_first: measFirst || null,
        meas_last:  measLast  || null,
      },
      training: {
        sessions: exRows.length,
        total_minutes: Math.round(exRows.reduce((s, e) => s + (e.duration_min || 0), 0)),
        total_burned:  Math.round(exRows.reduce((s, e) => s + (e.calories_burned || 0), 0)),
        by_category: Object.values(tCat).map(x => ({
          category: x.category, sessions: x.sessions,
          minutes: Math.round(x.minutes), burned: Math.round(x.burned),
        })).sort((a, b) => b.sessions - a.sessions),
        by_muscle: Object.values(tMuscle).map(x => ({
          muscle: x.muscle, sets: x.sets, total_volume_kg: Math.round(x.total_volume_kg),
        })).sort((a, b) => b.total_volume_kg - a.total_volume_kg),
        top_exercises,
        longest_session: longest_session ? {
          date: longest_session.date, type: longest_session.type,
          duration_min: longest_session.duration_min,
          calories_burned: Math.round(longest_session.calories_burned || 0),
        } : null,
        plan_done_pct,
      },
      activity,
      heatmap,
      dayOfWeek,
      records: {
        biggest_kcal_day:    biggestKcalDay  || null,
        smallest_kcal_day:   smallestKcalDay || null,
        most_steps_day:      mostStepsDay    || null,
        most_burned_day:     mostBurnedDay   || null,
        longest_session:     longestSessionAll || null,
        heaviest_set:        heaviestSet     || null,
        longest_run:         longestRun      || null,
        most_water_day:      mostWaterDay    || null,
        biggest_weight_drop: biggestWeightDrop,
        best_streak:         streak.best,
        total_kcal_tracked:  totals_alltime.total_kcal      || 0,
        total_workouts:      totals_alltime.total_workouts  || 0,
        total_distance_km:   totals_alltime.total_distance_km || 0,
        total_steps:         totals_alltime.total_steps     || 0,
        total_water_ml:      totals_alltime.total_water_ml  || 0,
        days_logged_alltime: totals_alltime.days_logged     || 0,
      },
    };
  });
}

module.exports = registerAnalyticsIpc;
