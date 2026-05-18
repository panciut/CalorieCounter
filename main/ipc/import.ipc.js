const { ipcMain, dialog, app } = require('electron');
const { getDb, getDbPath, closeDb } = require('../db');
const fs = require('fs');
const path = require('path');

// Domains supported by the selective import dialog. Order matters for inserts
// (foods before log; supplements before plans; etc.).
const IMPORT_DOMAINS = [
  'foods',
  'food_packages',
  'recipes',
  'recipe_ingredients',
  'actual_recipes',
  'actual_recipe_ingredients',
  'meal_templates',
  'template_items',
  'log',
  'weight_log',
  'water_log',
  'exercises',
  'daily_notes',
  'daily_energy',
  'body_measurements',
  'supplements',
  'supplement_plans',
  'supplement_plan_items',
  'supplement_log',
  'goal_plans',
  'pantries',
  'pantry',
];

/** Whitelisted columns per table. Anything else in `row` is dropped silently. */
const TABLE_COLS = {
  foods: ['id','name','calories','protein','carbs','fat','fiber','piece_grams','favorite','is_liquid','barcode','opened_days','discard_threshold_pct','price_per_100g','is_bulk','sugar','saturated_fat','sodium_mg','category','group_id','display_name','is_placeholder'],
  food_packages: ['id','food_id','grams','price'],
  recipes: ['id','name','description'],
  recipe_ingredients: ['id','recipe_id','food_id','grams'],
  actual_recipes: ['id','name','description','yield_g','notes','prep_time_min','cook_time_min','tools','procedure','created_at'],
  actual_recipe_ingredients: ['id','recipe_id','food_id','grams'],
  meal_templates: ['id','name'],
  template_items: ['id','template_id','food_id','grams','meal'],
  log: ['id','date','food_id','grams','meal','status'],
  weight_log: ['id','date','weight','fat_pct','muscle_mass','water_pct','bone_mass','scale_id'],
  water_log: ['id','date','ml','source','log_id'],
  exercises: ['id','date','type','duration_min','calories_burned','notes','source','schedule_id'],
  daily_notes: ['date','note'],
  daily_energy: ['date','resting_kcal','active_kcal','extra_kcal','steps','distance_km'],
  body_measurements: ['id','date','waist','chest','arms','thighs','hips','neck'],
  supplements: ['id','name','qty','unit','notes','created_at','description','deleted_at'],
  supplement_plans: ['id','effective_from','created_at'],
  supplement_plan_items: ['id','plan_id','supplement_id','qty','unit','notes','time_of_day'],
  supplement_log: ['id','supplement_id','date','count'],
  goal_plans: ['id','effective_from','label','notes','goal_type','cal_min','cal_rec','cal_max','protein_min','protein_rec','protein_max','carbs_min','carbs_rec','carbs_max','fat_min','fat_rec','fat_max','fiber_min','fiber_rec','fiber_max','weight_goal','water_goal','tol_1','tol_2','tol_3','created_at'],
  pantries: ['id','name','is_default'],
  pantry: ['id','food_id','quantity_g','expiry_date','updated_at','package_id','opened_at','opened_days','starting_grams','pantry_id'],
};

/** Insert one row into a domain table. mode='merge' uses INSERT OR IGNORE so
 *  conflicting primary/unique keys are skipped; mode='replace' (set on the
 *  whole table earlier) uses plain INSERT after a prior DELETE. */
function insertRow(db, table, row, mode) {
  const cols = TABLE_COLS[table];
  if (!cols || !row || typeof row !== 'object') return false;
  const present = cols.filter(c => row[c] !== undefined);
  if (present.length === 0) return false;
  const values = present.map(c => row[c]);
  const placeholders = present.map(() => '?').join(',');
  const verb = mode === 'replace' ? 'INSERT' : 'INSERT OR IGNORE';
  try {
    const r = db.prepare(`${verb} INTO ${table} (${present.join(',')}) VALUES (${placeholders})`).run(...values);
    return r.changes > 0;
  } catch (e) {
    console.error(`import row failed [${table}]:`, e.message);
    return false;
  }
}

function registerImportIpc() {
  // ── File picker ────────────────────────────────────────────────────────────
  ipcMain.handle('import:selectFile', async (_, { extensions } = {}) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Data file', extensions: extensions ?? ['csv', 'json', 'db'] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // ── Import foods (CSV or JSON) ─────────────────────────────────────────────
  ipcMain.handle('import:foods', (_, { filePath }) => {
    const db  = getDb();
    const ext = path.extname(filePath).toLowerCase();
    const raw = fs.readFileSync(filePath, 'utf-8');
    let foods = [];

    if (ext === '.json') {
      const parsed = JSON.parse(raw);
      foods = Array.isArray(parsed) ? parsed : (parsed.foods ?? []);
    } else {
      const lines = raw.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
      if (lines.length < 2) return { imported: 0, skipped: 0 };
      const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].match(/(".*?"|[^,]+)/g)?.map(c => c.trim().replace(/^"|"$/g, '')) ?? [];
        const obj = {};
        header.forEach((h, idx) => { obj[h] = cols[idx] ?? ''; });
        foods.push(obj);
      }
    }

    let imported = 0, skipped = 0;
    const insert = db.prepare(
      `INSERT OR IGNORE INTO foods (name, category, calories, protein, carbs, fat, fiber, sugar, saturated_fat, sodium_mg, piece_grams, is_liquid, is_bulk, barcode, opened_days, discard_threshold_pct, price_per_100g)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const num = v => (v != null && v !== '' ? +v : null);
    db.transaction(() => {
      for (const f of foods) {
        if (!f.name || !f.calories) { skipped++; continue; }
        const r = insert.run(
          f.name, f.category || 'other',
          +f.calories || 0, +f.protein || 0, +f.carbs || 0, +f.fat || 0, +f.fiber || 0,
          num(f.sugar), num(f.saturated_fat), num(f.sodium_mg),
          num(f.piece_grams),
          +f.is_liquid || 0,
          +f.is_bulk || 0,
          f.barcode || null,
          num(f.opened_days),
          num(f.discard_threshold_pct),
          num(f.price_per_100g),
        );
        r.changes > 0 ? imported++ : skipped++;
      }
    })();
    return { imported, skipped };
  });

  // ── Import foods from raw JSON text (paste) ───────────────────────────────
  ipcMain.handle('import:foodsFromText', (_, { text }) => {
    const db = getDb();
    let foods = [];
    try {
      const parsed = JSON.parse(text);
      foods = Array.isArray(parsed) ? parsed : (parsed.foods ?? []);
    } catch (e) {
      return { ok: false, error: 'Invalid JSON: ' + e.message };
    }

    let imported = 0, skipped = 0;
    const insert = db.prepare(
      `INSERT OR IGNORE INTO foods (name, category, calories, protein, carbs, fat, fiber, sugar, saturated_fat, sodium_mg, piece_grams, is_liquid, is_bulk, barcode, opened_days, discard_threshold_pct, price_per_100g)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const num = v => (v != null && v !== '' ? +v : null);
    db.transaction(() => {
      for (const f of foods) {
        if (!f.name || !f.calories) { skipped++; continue; }
        const r = insert.run(
          f.name, f.category || 'other',
          +f.calories || 0, +f.protein || 0, +f.carbs || 0, +f.fat || 0, +f.fiber || 0,
          num(f.sugar), num(f.saturated_fat), num(f.sodium_mg),
          num(f.piece_grams),
          +f.is_liquid || 0,
          +f.is_bulk || 0,
          f.barcode || null,
          num(f.opened_days),
          num(f.discard_threshold_pct),
          num(f.price_per_100g),
        );
        r.changes > 0 ? imported++ : skipped++;
      }
    })();
    return { ok: true, imported, skipped };
  });

  // ── Import full JSON export (foods + log + weight + exercises + water) ─────
  ipcMain.handle('import:fullJson', (_, { filePath }) => {
    const db  = getDb();
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    let stats = { foods: 0, log: 0, weight: 0, exercises: 0, water: 0 };

    db.transaction(() => {
      // Foods
      const insFood = db.prepare(
        `INSERT OR IGNORE INTO foods (name, category, calories, protein, carbs, fat, fiber, sugar, saturated_fat, sodium_mg, piece_grams, is_liquid, is_bulk, barcode, opened_days, discard_threshold_pct, price_per_100g)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const f of data.foods ?? []) {
        const r = insFood.run(
          f.name, f.category || 'other',
          f.calories, f.protein, f.carbs, f.fat, f.fiber,
          f.sugar ?? null, f.saturated_fat ?? null, f.sodium_mg ?? null,
          f.piece_grams ?? null,
          f.is_liquid ?? 0, f.is_bulk ?? 0,
          f.barcode ?? null,
          f.opened_days ?? null,
          f.discard_threshold_pct ?? null,
          f.price_per_100g ?? null,
        );
        if (r.changes) stats.foods++;
      }

      // Log — match by food name to get food_id
      const insLog = db.prepare(
        `INSERT OR IGNORE INTO log (food_id, date, grams, meal, status)
         VALUES ((SELECT id FROM foods WHERE name = ?), ?, ?, ?, ?)`
      );
      for (const l of data.log ?? []) {
        const r = insLog.run(l.food_name, l.date, l.grams, l.meal, l.status ?? 'logged');
        if (r.changes) stats.log++;
      }

      // Weight / body comp
      const insWeight = db.prepare(
        `INSERT OR IGNORE INTO weight_log (date, weight, fat_pct, muscle_mass, water_pct, bone_mass)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const w of data.weight_log ?? []) {
        const r = insWeight.run(w.date, w.weight, w.fat_pct ?? null, w.muscle_mass ?? null,
          w.water_pct ?? null, w.bone_mass ?? null);
        if (r.changes) stats.weight++;
      }

      // Exercises
      const insEx = db.prepare(
        `INSERT OR IGNORE INTO exercises (date, type, duration_min, calories_burned, notes, source)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const e of data.exercises ?? []) {
        const r = insEx.run(e.date, e.type, e.duration_min, e.calories_burned,
          e.notes ?? null, e.source ?? 'manual');
        if (r.changes) stats.exercises++;
      }

      // Water
      const insWater = db.prepare(
        `INSERT OR IGNORE INTO water_log (date, ml, source) VALUES (?, ?, ?)`
      );
      for (const w of data.water_log ?? []) {
        const r = insWater.run(w.date, w.ml, w.source ?? 'manual');
        if (r.changes) stats.water++;
      }
    })();

    return { ok: true, stats };
  });

  // ── Selective import: preview + execute ───────────────────────────────────
  // Used by the new ImportDialog UI. Reads a Markdown-bundle JSON or a single
  // JSON export and shows what would be applied per-domain before commit.
  ipcMain.handle('import:plan', (_, { filePath }) => {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      const counts = {};
      for (const k of IMPORT_DOMAINS) {
        const arr = data[k];
        counts[k] = Array.isArray(arr) ? arr.length : 0;
      }
      return { ok: true, schemaVersion: data.schemaVersion ?? null, range: data.range ?? null, counts };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('import:execute', (_, { filePath, plan }) => {
    const db = getDb();
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const stats = {};

    db.transaction(() => {
      for (const domain of IMPORT_DOMAINS) {
        const cfg = plan[domain];
        if (!cfg || !cfg.include) continue;
        const arr = Array.isArray(data[domain]) ? data[domain] : [];
        if (cfg.mode === 'replace') {
          db.prepare(`DELETE FROM ${domain}`).run();
        }
        let n = 0;
        for (const row of arr) {
          if (insertRow(db, domain, row, cfg.mode)) n++;
        }
        stats[domain] = n;
      }
    })();
    return { ok: true, stats };
  });

  // ── Export DB backup (handled in export.ipc.js, but picker lives here) ─────

  // ── Restore full database backup (.db file) ───────────────────────────────
  ipcMain.handle('import:backup', async (_, { filePath }) => {
    // Basic sanity check: SQLite files start with "SQLite format 3"
    const header = Buffer.alloc(16);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    if (!header.toString('utf8').startsWith('SQLite format 3')) {
      return { ok: false, error: 'Not a valid SQLite database file.' };
    }

    const currentPath = getDbPath();
    closeDb();
    fs.copyFileSync(filePath, currentPath);

    // Relaunch the app so everything reinitialises cleanly
    app.relaunch();
    app.exit(0);
    return { ok: true }; // never reached, but satisfies the IPC contract
  });
}

module.exports = registerImportIpc;
