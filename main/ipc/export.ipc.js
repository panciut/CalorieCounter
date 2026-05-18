const { ipcMain, dialog, app } = require('electron');
const { getDb, getDbPath } = require('../db');
const fs = require('fs');

function q(s) { return `"${String(s ?? '').replace(/"/g, '""')}"`; }

function registerExportIpc() {
  // ── Export data as JSON or CSV ────────────────────────────────────────────
  ipcMain.handle('export:data', async (_, { format }) => {
    const db = getDb();

    const foods      = db.prepare('SELECT * FROM foods WHERE is_placeholder = 0').all();
    const log        = db.prepare(`
      SELECT l.id, l.date, COALESCE(f.display_name, f.name) AS food_name, l.grams, l.meal, l.status,
        ROUND(f.calories * l.grams / 100, 2) AS calories,
        ROUND(f.protein  * l.grams / 100, 2) AS protein,
        ROUND(f.carbs    * l.grams / 100, 2) AS carbs,
        ROUND(f.fat      * l.grams / 100, 2) AS fat,
        ROUND(f.fiber    * l.grams / 100, 2) AS fiber,
        ROUND(f.sugar         * l.grams / 100, 2) AS sugar,
        ROUND(f.saturated_fat * l.grams / 100, 2) AS saturated_fat,
        ROUND(f.sodium_mg     * l.grams / 100, 2) AS sodium_mg
      FROM log l JOIN foods f ON l.food_id = f.id
      ORDER BY l.date DESC, l.id
    `).all();
    const weightLog  = db.prepare('SELECT * FROM weight_log ORDER BY date DESC').all();
    const waterLog   = db.prepare('SELECT * FROM water_log ORDER BY date DESC').all();
    const exercises  = db.prepare('SELECT * FROM exercises ORDER BY date DESC').all();
    const notes      = db.prepare('SELECT * FROM daily_notes ORDER BY date DESC').all();
    const supplements     = db.prepare('SELECT * FROM supplements').all();
    const supplementPlans = db.prepare('SELECT * FROM supplement_plans ORDER BY effective_from').all();
    const supplementPlanItems = db.prepare('SELECT * FROM supplement_plan_items').all();

    const ext = format === 'json' ? 'json' : 'csv';
    const result = await dialog.showSaveDialog({
      defaultPath: `calorie-counter-export-${new Date().toISOString().slice(0,10)}.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };

    if (format === 'json') {
      const pantries = db.prepare('SELECT * FROM pantries ORDER BY is_default DESC, name').all();
      const data = { foods, log, weight_log: weightLog, water_log: waterLog, exercises, daily_notes: notes, supplements, supplement_plans: supplementPlans, supplement_plan_items: supplementPlanItems, pantries };
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } else {
      let csv = '';

      csv += '## Foods\n';
      csv += 'id,name,category,calories,protein,carbs,fat,fiber,sugar,saturated_fat,sodium_mg,piece_grams,is_liquid,is_bulk,barcode,opened_days,discard_threshold_pct,price_per_100g,favorite\n';
      for (const f of foods)
        csv += `${f.id},${q(f.name)},${q(f.category ?? '')},${f.calories},${f.protein},${f.carbs},${f.fat},${f.fiber},${f.sugar ?? ''},${f.saturated_fat ?? ''},${f.sodium_mg ?? ''},${f.piece_grams ?? ''},${f.is_liquid ?? 0},${f.is_bulk ?? 0},${q(f.barcode ?? '')},${f.opened_days ?? ''},${f.discard_threshold_pct ?? ''},${f.price_per_100g ?? ''},${f.favorite ?? 0}\n`;

      csv += '\n## Food Log\n';
      csv += 'id,date,food_name,grams,meal,status,calories,protein,carbs,fat,fiber,sugar,saturated_fat,sodium_mg\n';
      for (const l of log)
        csv += `${l.id},${l.date},${q(l.food_name)},${l.grams},${l.meal},${l.status ?? 'logged'},${l.calories},${l.protein},${l.carbs},${l.fat},${l.fiber},${l.sugar ?? ''},${l.saturated_fat ?? ''},${l.sodium_mg ?? ''}\n`;

      csv += '\n## Weight & Body Composition\n';
      csv += 'id,date,weight,fat_pct,muscle_mass,water_pct,bone_mass\n';
      for (const w of weightLog)
        csv += `${w.id},${w.date},${w.weight},${w.fat_pct ?? ''},${w.muscle_mass ?? ''},${w.water_pct ?? ''},${w.bone_mass ?? ''}\n`;

      csv += '\n## Exercises\n';
      csv += 'id,date,type,duration_min,calories_burned,notes,source\n';
      for (const e of exercises)
        csv += `${e.id},${e.date},${q(e.type)},${e.duration_min},${e.calories_burned},${q(e.notes ?? '')},${e.source}\n`;

      csv += '\n## Water Log\n';
      csv += 'id,date,ml,source\n';
      for (const w of waterLog)
        csv += `${w.id},${w.date},${w.ml},${q(w.source ?? '')}\n`;

      csv += '\n## Daily Notes\n';
      csv += 'date,note\n';
      for (const n of notes)
        csv += `${n.date},${q(n.note)}\n`;

      csv += '\n## Supplements\n';
      csv += 'id,name,qty\n';
      for (const s of supplements)
        csv += `${s.id},${q(s.name)},${s.qty}\n`;

      fs.writeFileSync(result.filePath, csv, 'utf-8');
    }

    return { ok: true, path: result.filePath };
  });

  // ── Export food database as JSON ──────────────────────────────────────────
  ipcMain.handle('export:foods', async () => {
    const db = getDb();
    const foods = db.prepare('SELECT name, category, calories, protein, carbs, fat, fiber, sugar, saturated_fat, sodium_mg, piece_grams, is_liquid, is_bulk, opened_days, discard_threshold_pct, price_per_100g, barcode, favorite FROM foods WHERE is_placeholder = 0 ORDER BY name').all();

    const result = await dialog.showSaveDialog({
      defaultPath: `foods-${new Date().toISOString().slice(0,10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };

    fs.writeFileSync(result.filePath, JSON.stringify(foods, null, 2), 'utf-8');
    return { ok: true, path: result.filePath, count: foods.length };
  });

  // ── Export pantry as JSON ─────────────────────────────────────────────────
  ipcMain.handle('export:pantry', async () => {
    const db = getDb();
    const pantry = db.prepare(`
      SELECT p.id, f.name AS food_name, p.quantity_g, p.expiry_date,
             p.package_id, fp.grams AS package_grams,
             p.opened_at, p.opened_days, p.starting_grams, p.updated_at
      FROM pantry p
      JOIN foods f ON f.id = p.food_id
      LEFT JOIN food_packages fp ON fp.id = p.package_id
      ORDER BY f.name, p.expiry_date
    `).all();

    const result = await dialog.showSaveDialog({
      defaultPath: `pantry-${new Date().toISOString().slice(0,10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };

    fs.writeFileSync(result.filePath, JSON.stringify(pantry, null, 2), 'utf-8');
    return { ok: true, path: result.filePath, count: pantry.length };
  });

  // ── AI-friendly bundle export (Markdown daily journal / single JSON / meals-only MD)
  // Optional date range. Output is a single file (.md or .json).
  ipcMain.handle('export:bundle', async (_, { format, start, end }) => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const startDate = (start || '0000-01-01').slice(0, 10);
    const endDate   = (end   || today).slice(0, 10);

    const ext = format === 'json' ? 'json' : 'md';
    const result = await dialog.showSaveDialog({
      defaultPath: `caloriecounter-${startDate}_${endDate}.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };

    if (format === 'json') {
      const data = collectFullJson(db, startDate, endDate);
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
      return { ok: true, path: result.filePath };
    }

    // Markdown bundle (or meals-only Markdown)
    const md = buildJournalMarkdown(db, startDate, endDate, format === 'meals_md');
    fs.writeFileSync(result.filePath, md, 'utf-8');
    return { ok: true, path: result.filePath };
  });

  // ── Export full database backup (.db file) ────────────────────────────────
  ipcMain.handle('export:backup', async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: `calorie-counter-backup-${new Date().toISOString().slice(0,10)}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };

    const db = getDb();
    // Checkpoint WAL so the backup is complete
    db.pragma('wal_checkpoint(FULL)');
    fs.copyFileSync(getDbPath(), result.filePath);
    return { ok: true, path: result.filePath };
  });
}

// ── Bundle helpers ───────────────────────────────────────────────────────────

const MEAL_ORDER = ['Breakfast', 'MorningSnack', 'Lunch', 'AfternoonSnack', 'Dinner', 'EveningSnack', 'NightSnack'];

function r(n, d = 1) {
  const f = Math.pow(10, d);
  return Math.round(((n || 0) * f)) / f;
}

function goalForDate(db, date) {
  return db.prepare(`SELECT * FROM goal_plans WHERE effective_from <= ? ORDER BY effective_from DESC LIMIT 1`).get(date) || null;
}

function buildJournalMarkdown(db, startDate, endDate, mealsOnly) {
  const days = db.prepare(`
    SELECT DISTINCT date FROM (
      SELECT date FROM log WHERE date BETWEEN ? AND ?
      UNION SELECT date FROM weight_log WHERE date BETWEEN ? AND ?
      UNION SELECT date FROM water_log WHERE date BETWEEN ? AND ?
      UNION SELECT date FROM exercises WHERE date BETWEEN ? AND ?
    ) ORDER BY date
  `).all(startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate).map(r => r.date);

  const lines = [];
  lines.push(`# CalorieCounter — daily journal`);
  lines.push(`Range: **${startDate} → ${endDate}** · ${days.length} days · Generated ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  if (!mealsOnly) {
    // Goal periods overview
    const plans = db.prepare(`SELECT * FROM goal_plans WHERE effective_from <= ? ORDER BY effective_from`).all(endDate);
    const intersecting = plans.filter((p, i) => {
      const next = plans[i + 1];
      return p.effective_from <= endDate && (!next || next.effective_from > startDate);
    });
    if (intersecting.length > 0) {
      lines.push('## Goal periods');
      for (let i = 0; i < intersecting.length; i++) {
        const p = intersecting[i];
        const nextStart = intersecting[i + 1]?.effective_from ?? 'current';
        const lbl = p.label ? ` — ${p.label}` : '';
        lines.push(`- ${p.effective_from} → ${nextStart}${lbl} (${p.goal_type}): ${p.cal_rec ?? '—'} kcal · P${p.protein_rec ?? '—'} C${p.carbs_rec ?? '—'} F${p.fat_rec ?? '—'} Fib${p.fiber_rec ?? '—'}`);
        if (p.notes) lines.push(`  - notes: ${p.notes.replace(/\n/g, ' ')}`);
      }
      lines.push('');
    }
  }

  for (const d of days) {
    const dayName = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
    lines.push(`## ${d} — ${dayName}`);

    const entries = db.prepare(`
      SELECT l.id, l.meal, l.status, COALESCE(f.display_name, f.name) AS name, l.grams, f.category,
        ROUND(f.calories * l.grams / 100, 2) AS kcal,
        ROUND(f.protein  * l.grams / 100, 2) AS protein,
        ROUND(f.carbs    * l.grams / 100, 2) AS carbs,
        ROUND(f.fat      * l.grams / 100, 2) AS fat,
        ROUND(f.fiber    * l.grams / 100, 2) AS fiber,
        ROUND(f.sugar         * l.grams / 100, 2) AS sugar,
        ROUND(f.saturated_fat * l.grams / 100, 2) AS sat_fat,
        ROUND(f.sodium_mg     * l.grams / 100, 2) AS sodium_mg
      FROM log l JOIN foods f ON f.id = l.food_id
      WHERE l.date = ? AND l.status = 'logged'
      ORDER BY l.id
    `).all(d);

    const totals = entries.reduce((s, e) => ({
      kcal:    s.kcal    + (e.kcal    || 0),
      protein: s.protein + (e.protein || 0),
      carbs:   s.carbs   + (e.carbs   || 0),
      fat:     s.fat     + (e.fat     || 0),
      fiber:   s.fiber   + (e.fiber   || 0),
      sugar:   s.sugar   + (e.sugar   || 0),
      sat_fat: s.sat_fat + (e.sat_fat || 0),
      sodium:  s.sodium  + (e.sodium_mg || 0),
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sat_fat: 0, sodium: 0 });

    const goal = goalForDate(db, d);
    const tg = goal && goal.cal_rec ? ` · target ${goal.cal_rec} kcal` : '';
    const extras = (totals.sugar || totals.sat_fat || totals.sodium)
      ? ` · sugar ${r(totals.sugar)}g · sat-fat ${r(totals.sat_fat)}g · sodium ${Math.round(totals.sodium)}mg`
      : '';
    lines.push(`**Totals**: ${r(totals.kcal, 0)} kcal · ${r(totals.protein)}P / ${r(totals.carbs)}C / ${r(totals.fat)}F / ${r(totals.fiber)} fib${extras}${tg}`);

    if (!mealsOnly) {
      const wt = db.prepare('SELECT weight, fat_pct FROM weight_log WHERE date = ?').get(d);
      if (wt) lines.push(`**Weight**: ${wt.weight} kg${wt.fat_pct != null ? ` · ${wt.fat_pct}% fat` : ''}`);

      const exs = db.prepare(`SELECT type, duration_min, calories_burned FROM exercises WHERE date = ?`).all(d);
      if (exs.length > 0) {
        const total = exs.reduce((s, e) => s + (e.calories_burned || 0), 0);
        lines.push(`**Exercise**: ${exs.map(e => `${e.type} ${e.duration_min}min`).join(', ')} (${r(total, 0)} kcal)`);
      }

      const water = db.prepare('SELECT SUM(ml) AS total FROM water_log WHERE date = ?').get(d);
      if (water && water.total) lines.push(`**Water**: ${(water.total / 1000).toFixed(1)} L`);
    }

    // Meal sections
    const byMeal = new Map();
    for (const e of entries) {
      if (!byMeal.has(e.meal)) byMeal.set(e.meal, []);
      byMeal.get(e.meal).push(e);
    }
    for (const m of MEAL_ORDER) {
      const items = byMeal.get(m);
      if (!items || items.length === 0) continue;
      const subtotal = items.reduce((s, i) => s + (i.kcal || 0), 0);
      lines.push(`### ${m} (${r(subtotal, 0)} kcal)`);
      for (const it of items) {
        lines.push(`- ${it.name} ${r(it.grams, 1)}g — ${r(it.kcal, 0)} kcal · ${r(it.protein)}P / ${r(it.carbs)}C / ${r(it.fat)}F${it.category && it.category !== 'other' ? ` · _${it.category}_` : ''}`);
      }
    }

    if (!mealsOnly) {
      const note = db.prepare('SELECT note FROM daily_notes WHERE date = ?').get(d);
      if (note && note.note && note.note.trim()) {
        lines.push('### Notes');
        lines.push(note.note.trim());
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

function collectFullJson(db, startDate, endDate) {
  const inRange = `BETWEEN '${startDate}' AND '${endDate}'`;
  return {
    schemaVersion: 1,
    range: { start: startDate, end: endDate },
    generatedAt: new Date().toISOString(),
    foods: db.prepare(`SELECT * FROM foods WHERE is_placeholder = 0 ORDER BY name`).all(),
    food_packages: db.prepare(`SELECT * FROM food_packages`).all(),
    log: db.prepare(`SELECT * FROM log WHERE date ${inRange} ORDER BY date, id`).all(),
    weight_log:    db.prepare(`SELECT * FROM weight_log    WHERE date ${inRange} ORDER BY date`).all(),
    water_log:     db.prepare(`SELECT * FROM water_log     WHERE date ${inRange} ORDER BY date, id`).all(),
    exercises:     db.prepare(`SELECT * FROM exercises     WHERE date ${inRange} ORDER BY date, id`).all(),
    daily_notes:   db.prepare(`SELECT * FROM daily_notes   WHERE date ${inRange} ORDER BY date`).all(),
    daily_energy:  db.prepare(`SELECT * FROM daily_energy  WHERE date ${inRange} ORDER BY date`).all(),
    body_measurements: db.prepare(`SELECT * FROM body_measurements WHERE date ${inRange} ORDER BY date`).all(),
    supplement_log: db.prepare(`SELECT * FROM supplement_log WHERE date ${inRange} ORDER BY date, id`).all(),
    supplements: db.prepare(`SELECT * FROM supplements`).all(),
    supplement_plans: db.prepare(`SELECT * FROM supplement_plans ORDER BY effective_from`).all(),
    supplement_plan_items: db.prepare(`SELECT * FROM supplement_plan_items`).all(),
    goal_plans: db.prepare(`SELECT * FROM goal_plans ORDER BY effective_from`).all(),
    pantries: db.prepare(`SELECT * FROM pantries`).all(),
    pantry: db.prepare(`SELECT * FROM pantry`).all(),
    recipes: db.prepare(`SELECT * FROM recipes`).all(),
    recipe_ingredients: db.prepare(`SELECT * FROM recipe_ingredients`).all(),
    actual_recipes: db.prepare(`SELECT * FROM actual_recipes`).all(),
    actual_recipe_ingredients: db.prepare(`SELECT * FROM actual_recipe_ingredients`).all(),
    meal_templates: db.prepare(`SELECT * FROM meal_templates`).all(),
    template_items: db.prepare(`SELECT * FROM template_items`).all(),
  };
}

module.exports = registerExportIpc;
