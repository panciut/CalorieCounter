const { ipcMain } = require('electron');
const { getDb } = require('../db');

const GOAL_NUMERIC_FIELDS = [
  'cal_min', 'cal_rec', 'cal_max',
  'protein_min', 'protein_rec', 'protein_max',
  'carbs_min', 'carbs_rec', 'carbs_max',
  'fat_min', 'fat_rec', 'fat_max',
  'fiber_min', 'fiber_rec', 'fiber_max',
  'weight_goal', 'water_goal',
  'tol_1', 'tol_2', 'tol_3',
];

const today = () => new Date().toISOString().slice(0, 10);

function getGoalsForDate(db, date) {
  return db.prepare(`
    SELECT * FROM goal_plans
    WHERE effective_from <= ?
    ORDER BY effective_from DESC
    LIMIT 1
  `).get(date) || null;
}

function registerGoalsTdeeIpc() {
  // Adaptive TDEE: avg calories + weight change correction
  ipcMain.handle('goals:calculateTDEE', () => {
    const db = getDb();

    const logData = db.prepare(`
      SELECT l.date, SUM(f.calories / 100.0 * l.grams) as calories
      FROM log l JOIN foods f ON f.id = l.food_id
      WHERE l.status = 'logged' AND l.date >= date('now', '-30 days')
      GROUP BY l.date ORDER BY l.date
    `).all();

    const weightData = db.prepare(`
      SELECT date, weight FROM weight_log
      WHERE date >= date('now', '-30 days')
      ORDER BY date
    `).all();

    if (logData.length < 5) {
      return { tdee: null, confidence: 'low', data_points: logData.length };
    }

    const avgCal = logData.reduce((s, d) => s + d.calories, 0) / logData.length;

    let tdee = avgCal;
    if (weightData.length >= 2) {
      const weightChange = weightData[weightData.length - 1].weight - weightData[0].weight;
      const daySpan = logData.length;
      // 7700 kcal ≈ 1 kg of fat; distribute daily correction
      tdee = avgCal - (weightChange * 7700 / daySpan);
    }

    return {
      tdee: Math.round(tdee),
      confidence: logData.length >= 14 ? 'high' : 'medium',
      data_points: logData.length,
    };
  });

  // ── Time-versioned goals ────────────────────────────────────────────────────

  ipcMain.handle('goals:getForDate', (_, { date }) => {
    return getGoalsForDate(getDb(), date || today());
  });

  ipcMain.handle('goals:getForDateRange', (_, { start, end }) => {
    const db = getDb();
    // All plans whose effective_from <= end, ordered ascending. We then walk
    // each day in [start, end] and assign the latest applicable plan.
    const plans = db.prepare(`
      SELECT * FROM goal_plans
      WHERE effective_from <= ?
      ORDER BY effective_from ASC
    `).all(end);
    if (plans.length === 0) return {};

    const out = {};
    let pi = 0;
    let active = plans[0]; // plans[0] could be after `start`; we'll pick the latest <= each date below
    // Pre-pick the active plan at `start`
    while (pi + 1 < plans.length && plans[pi + 1].effective_from <= start) pi++;
    active = plans[pi];

    const startMs = Date.parse(start + 'T00:00:00Z');
    const endMs   = Date.parse(end   + 'T00:00:00Z');
    for (let t = startMs; t <= endMs; t += 86400000) {
      const d = new Date(t).toISOString().slice(0, 10);
      while (pi + 1 < plans.length && plans[pi + 1].effective_from <= d) {
        pi++;
        active = plans[pi];
      }
      out[d] = active;
    }
    return out;
  });

  ipcMain.handle('goals:listPlans', () => {
    return getDb().prepare('SELECT * FROM goal_plans ORDER BY effective_from ASC').all();
  });

  ipcMain.handle('goals:savePlan', (_, plan) => {
    const db = getDb();
    const effective_from = (plan.effective_from || today()).slice(0, 10);
    const label = plan.label ?? '';
    const notes = plan.notes ?? '';
    const goal_type = plan.goal_type || 'custom';
    const vals = GOAL_NUMERIC_FIELDS.map(k => {
      const v = plan[k];
      return v === undefined || v === null || v === '' ? null : Number(v);
    });
    const existing = db.prepare('SELECT id FROM goal_plans WHERE effective_from = ?').get(effective_from);
    if (existing) {
      db.prepare(`
        UPDATE goal_plans SET
          label = ?, notes = ?, goal_type = ?,
          cal_min = ?, cal_rec = ?, cal_max = ?,
          protein_min = ?, protein_rec = ?, protein_max = ?,
          carbs_min = ?, carbs_rec = ?, carbs_max = ?,
          fat_min = ?, fat_rec = ?, fat_max = ?,
          fiber_min = ?, fiber_rec = ?, fiber_max = ?,
          weight_goal = ?, water_goal = ?,
          tol_1 = ?, tol_2 = ?, tol_3 = ?
        WHERE id = ?
      `).run(label, notes, goal_type, ...vals, existing.id);
      return { ok: true, id: existing.id, updated: true };
    }
    const result = db.prepare(`
      INSERT INTO goal_plans (
        effective_from, label, notes, goal_type,
        cal_min, cal_rec, cal_max,
        protein_min, protein_rec, protein_max,
        carbs_min, carbs_rec, carbs_max,
        fat_min, fat_rec, fat_max,
        fiber_min, fiber_rec, fiber_max,
        weight_goal, water_goal,
        tol_1, tol_2, tol_3
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(effective_from, label, notes, goal_type, ...vals);
    return { ok: true, id: result.lastInsertRowid, updated: false };
  });

  ipcMain.handle('goals:deletePlan', (_, { id }) => {
    const db = getDb();
    const row = db.prepare('SELECT effective_from FROM goal_plans WHERE id = ?').get(id);
    if (!row) return { ok: false, reason: 'not_found' };
    if (row.effective_from <= today()) return { ok: false, reason: 'past_immutable' };
    // Guard against deleting the only plan
    const count = db.prepare('SELECT COUNT(*) AS n FROM goal_plans').get().n;
    if (count <= 1) return { ok: false, reason: 'last_plan' };
    db.prepare('DELETE FROM goal_plans WHERE id = ?').run(id);
    return { ok: true };
  });

  // Suggest calorie/macro targets based on goal type + TDEE
  ipcMain.handle('goals:suggest', (_, { goal_type, tdee }) => {
    const db = getDb();
    const weightRow = db.prepare('SELECT weight FROM weight_log ORDER BY date DESC LIMIT 1').get();
    const weightKg = weightRow ? weightRow.weight : 70;

    let cal_rec = tdee;
    let rate_per_week_kg = 0;

    if (goal_type === 'lose') {
      cal_rec = Math.max(1200, Math.round(tdee - 500));
      rate_per_week_kg = -0.5;
    } else if (goal_type === 'gain') {
      cal_rec = Math.round(tdee + 400);
      rate_per_week_kg = 0.4;
    }

    const protein_rec = Math.round(weightKg * 2.0);

    return {
      cal_rec,
      cal_min: Math.round(cal_rec * 0.9),
      cal_max: Math.round(cal_rec * 1.1),
      protein_rec,
      rate_per_week_kg,
    };
  });
}

module.exports = registerGoalsTdeeIpc;
