const { ipcMain } = require('electron');
const crypto = require('crypto');
const { getDb } = require('../db');
const { pushUndo } = require('./undo.ipc');
const { isPantryEnabled, deductFoodFEFO } = require('../lib/pantryFefo');
const { logAction } = require('../lib/actionLog');

// Use local date to avoid UTC timezone bug
const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function registerLogIpc() {
  // Total grams currently planned (status='planned') from today onward, per food.
  // Used by FoodSearch to badge already-planned amounts so the user doesn't
  // double-allocate a food across days.
  ipcMain.handle('log:getPlannedMap', () => {
    const rows = getDb().prepare(
      `SELECT food_id, ROUND(SUM(grams), 1) AS total_g
         FROM log
        WHERE status = 'planned' AND date >= ?
        GROUP BY food_id
        HAVING total_g > 0`,
    ).all(today());
    const out = {};
    for (const r of rows) out[r.food_id] = r.total_g;
    return out;
  });

  ipcMain.handle('log:getDay', (_, { date }) => {
    const d = date || today();
    return getDb().prepare(`
      SELECT l.id, l.food_id, l.date, l.meal, l.status, COALESCE(f.display_name, f.name) AS name, l.grams,
        l.recipe_log_id, l.recipe_name,
        ROUND(f.calories * l.grams / 100, 2) AS calories,
        ROUND(f.protein  * l.grams / 100, 2) AS protein,
        ROUND(f.carbs    * l.grams / 100, 2) AS carbs,
        ROUND(f.fat      * l.grams / 100, 2) AS fat,
        ROUND(f.fiber    * l.grams / 100, 2) AS fiber,
        ROUND(f.sugar         * l.grams / 100, 2) AS sugar,
        ROUND(f.saturated_fat * l.grams / 100, 2) AS saturated_fat,
        ROUND(f.sodium_mg     * l.grams / 100, 2) AS sodium_mg
      FROM log l
      JOIN foods f ON l.food_id = f.id
      WHERE l.date = ?
      ORDER BY
        MIN(l.id) OVER (PARTITION BY l.meal), l.id
    `).all(d);
  });

  ipcMain.handle('log:getPlanned', (_, { date }) => {
    const d = date || today();
    return getDb().prepare(`
      SELECT l.id, l.food_id, l.date, l.meal, l.status, COALESCE(f.display_name, f.name) AS name, l.grams,
        l.recipe_log_id, l.recipe_name,
        ROUND(f.calories * l.grams / 100, 2) AS calories,
        ROUND(f.protein  * l.grams / 100, 2) AS protein,
        ROUND(f.carbs    * l.grams / 100, 2) AS carbs,
        ROUND(f.fat      * l.grams / 100, 2) AS fat,
        ROUND(f.fiber    * l.grams / 100, 2) AS fiber,
        ROUND(f.sugar         * l.grams / 100, 2) AS sugar,
        ROUND(f.saturated_fat * l.grams / 100, 2) AS saturated_fat,
        ROUND(f.sodium_mg     * l.grams / 100, 2) AS sodium_mg
      FROM log l
      JOIN foods f ON l.food_id = f.id
      WHERE l.date = ? AND l.status = 'planned'
      ORDER BY l.id
    `).all(d);
  });

  // Delete every log entry that shares a recipe_log_id (i.e. all ingredients
  // logged together as one recipe). Used by the "delete recipe group" action.
  ipcMain.handle('log:deleteRecipeGroup', (_, { recipe_log_id }) => {
    if (!recipe_log_id) return { ok: false, deleted: 0 };
    const db = getDb();
    const rows = db.prepare('SELECT id FROM log WHERE recipe_log_id = ?').all(recipe_log_id);
    db.transaction(() => {
      for (const r of rows) {
        db.prepare('DELETE FROM water_log WHERE log_id = ?').run(r.id);
      }
      db.prepare('DELETE FROM log WHERE recipe_log_id = ?').run(recipe_log_id);
    })();
    return { ok: true, deleted: rows.length };
  });

  ipcMain.handle('log:confirmPlanned', (_, { id, pantry_id }) => {
    const db = getDb();
    return db.transaction(() => {
      const row = db.prepare(`
        SELECT l.id, l.food_id, l.date, l.grams, f.name AS food_name, f.is_liquid
        FROM log l JOIN foods f ON l.food_id = f.id
        WHERE l.id = ? AND l.status = 'planned'
      `).get(id);
      if (!row) return { ok: false };
      db.prepare("UPDATE log SET status = 'logged' WHERE id = ?").run(id);
      if (row.is_liquid) {
        const existing = db.prepare('SELECT id FROM water_log WHERE log_id = ?').get(id);
        if (!existing) {
          db.prepare('INSERT INTO water_log (date, ml, source, log_id) VALUES (?, ?, ?, ?)')
            .run(row.date, row.grams, row.food_name, id);
        }
      }
      let shortage = 0;
      let events = [];
      if (isPantryEnabled(db)) {
        const r = deductFoodFEFO(db, row.food_id, row.grams, pantry_id);
        shortage = r.shortage;
        events = r.events;
      }
      return { ok: true, shortage, shortage_food: row.food_name, events };
    })();
  });

  ipcMain.handle('log:confirmAllPlanned', (_, { date, pantry_id }) => {
    const d = date || today();
    const db = getDb();
    return db.transaction(() => {
      const rows = db.prepare(`
        SELECT l.id, l.food_id, l.date, l.grams, f.name AS food_name, f.is_liquid
        FROM log l JOIN foods f ON l.food_id = f.id
        WHERE l.date = ? AND l.status = 'planned'
      `).all(d);
      db.prepare("UPDATE log SET status = 'logged' WHERE date = ? AND status = 'planned'").run(d);
      const insertWater = db.prepare('INSERT INTO water_log (date, ml, source, log_id) VALUES (?, ?, ?, ?)');
      const waterExists = db.prepare('SELECT id FROM water_log WHERE log_id = ?');
      const shortages = [];
      const allEvents = [];
      for (const r of rows) {
        if (r.is_liquid && !waterExists.get(r.id)) {
          insertWater.run(r.date, r.grams, r.food_name, r.id);
        }
        if (isPantryEnabled(db)) {
          const res = deductFoodFEFO(db, r.food_id, r.grams, pantry_id);
          if (res.shortage > 0) shortages.push({ food_name: r.food_name, shortage: Math.round(res.shortage * 10) / 10 });
          allEvents.push(...res.events);
        }
      }
      return { ok: true, shortages, events: allEvents };
    })();
  });

  ipcMain.handle('log:add', (_, { food_id, grams, meal, date, status, pantry_id }) => {
    const db = getDb();
    const d = date || today();
    const s = status || 'logged';
    // Pantry-aware variant pick: when logging a canonical (group_id IS NULL,
    // has variants) and any variant is currently in stock, log against that
    // variant instead. The most-recently-used variant wins ties. If nothing
    // is in stock, the canonical is logged as-is.
    {
      const food = db.prepare('SELECT id, group_id FROM foods WHERE id = ?').get(food_id);
      if (food && food.group_id == null) {
        const variantCount = db.prepare('SELECT COUNT(*) AS n FROM foods WHERE group_id = ?').get(food_id).n;
        if (variantCount > 0) {
          const params = pantry_id != null
            ? [food_id, pantry_id]
            : [food_id];
          const inStock = db.prepare(`
            SELECT v.id, v.name,
              (SELECT MAX(l.id) FROM log l WHERE l.food_id = v.id) AS last_log_id
            FROM foods v
            JOIN pantry p ON p.food_id = v.id ${pantry_id != null ? 'AND p.pantry_id = ?' : ''}
            WHERE v.group_id = ? AND p.quantity_g > 0
            GROUP BY v.id
            ORDER BY last_log_id DESC NULLS LAST, v.id ASC
            LIMIT 1
          `).get(...(pantry_id != null ? [pantry_id, food_id] : [food_id]));
          if (inStock && inStock.id) food_id = inStock.id;
          // Suppress unused-warn on the params we constructed
          void params;
        }
      }
    }
    let logId, shortage = 0, shortage_food = null, events = [];
    db.transaction(() => {
      const result = db.prepare(
        'INSERT INTO log (date, food_id, grams, meal, status) VALUES (?, ?, ?, ?, ?)'
      ).run(d, food_id, grams, meal || 'AfternoonSnack', s);
      logId = result.lastInsertRowid;
      if (s === 'logged') {
        pushUndo('log:add', { id: logId });
        const food = db.prepare('SELECT name, is_liquid FROM foods WHERE id = ?').get(food_id);
        if (food && food.is_liquid) {
          db.prepare('INSERT INTO water_log (date, ml, source, log_id) VALUES (?, ?, ?, ?)').run(d, grams, food.name, logId);
        }
        if (isPantryEnabled(db)) {
          const r = deductFoodFEFO(db, food_id, grams, pantry_id);
          shortage = r.shortage;
          shortage_food = food ? food.name : null;
          events = r.events;
        }
        logAction(db, 'log:add', { food_name: food?.name, grams, details: { date: d, meal: meal || 'AfternoonSnack' } });
      }
    })();
    return { id: logId, shortage, shortage_food, events };
  });

  ipcMain.handle('log:addQuick', (_, { food, grams, meal, date }) => {
    const db = getDb();
    const d = date || today();
    return db.transaction(() => {
      // Placeholder food rows use a unique internal name so the user's chosen name
      // stays free for a real food entry later. display_name carries the label.
      const internalName = `__qa_${crypto.randomUUID()}__`;
      const foodResult = db.prepare(
        'INSERT INTO foods (name, display_name, is_placeholder, calories, protein, carbs, fat, fiber, piece_grams, is_liquid) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)'
      ).run(internalName, food.name, food.calories, food.protein || 0, food.carbs || 0, food.fat || 0, food.fiber || 0, food.piece_grams || null, food.is_liquid ? 1 : 0);
      const logResult = db.prepare(
        "INSERT INTO log (date, food_id, grams, meal, status) VALUES (?, ?, ?, ?, 'logged')"
      ).run(d, foodResult.lastInsertRowid, grams, meal || 'AfternoonSnack');
      if (food.is_liquid) {
        db.prepare('INSERT INTO water_log (date, ml, source, log_id) VALUES (?, ?, ?, ?)').run(d, grams, food.name, logResult.lastInsertRowid);
      }
      return { id: logResult.lastInsertRowid, food_id: foodResult.lastInsertRowid, shortage: 0 };
    })();
  });

  ipcMain.handle('log:update', (_, { id, food_id, grams, meal }) => {
    getDb().prepare(
      'UPDATE log SET food_id = ?, grams = ?, meal = ? WHERE id = ?'
    ).run(food_id, grams, meal, id);
    return { ok: true };
  });

  ipcMain.handle('log:swapLunchDinner', (_, { date }) => {
    getDb().prepare(`
      UPDATE log
      SET meal = CASE meal WHEN 'Lunch' THEN 'Dinner' ELSE 'Lunch' END
      WHERE date = ? AND status = 'planned' AND meal IN ('Lunch','Dinner')
    `).run(date);
    return { ok: true };
  });

  ipcMain.handle('log:swapDays', (_, { dateA, dateB }) => {
    if (!dateA || !dateB || dateA === dateB) return { ok: false, swapped: 0 };
    const db = getDb();
    return db.transaction(() => {
      const info = db.prepare(`
        UPDATE log
        SET date = CASE date WHEN ? THEN ? ELSE ? END
        WHERE status = 'planned' AND date IN (?, ?)
      `).run(dateA, dateB, dateA, dateA, dateB);
      return { ok: true, swapped: info.changes };
    })();
  });

  ipcMain.handle('log:delete', (_, { id }) => {
    const db = getDb();
    const row = db.prepare('SELECT date, food_id, grams, meal, COALESCE(f.display_name, f.name) AS food_name FROM log l JOIN foods f ON f.id = l.food_id WHERE l.id = ?').get(id);
    if (row) {
      pushUndo('log:delete', { date: row.date, food_id: row.food_id, grams: row.grams, meal: row.meal });
      logAction(db, 'log:delete', { food_name: row.food_name, grams: row.grams, details: { date: row.date, meal: row.meal } });
    }
    db.prepare('DELETE FROM log WHERE id = ?').run(id);
    db.prepare('DELETE FROM water_log WHERE log_id = ?').run(id);
    return { ok: true };
  });

  // Weekly summaries only count logged (not planned) entries
  ipcMain.handle('log:getWeeklySummaries', () =>
    getDb().prepare(`
      SELECT
        strftime('%Y-%W', date) AS week,
        MIN(date) AS week_start,
        COUNT(DISTINCT date) AS days_logged,
        ROUND(AVG(day_calories), 2) AS avg_calories,
        ROUND(AVG(day_protein),   2) AS avg_protein,
        ROUND(AVG(day_carbs),     2) AS avg_carbs,
        ROUND(AVG(day_fat),       2) AS avg_fat,
        ROUND(AVG(day_fiber),     2) AS avg_fiber
      FROM (
        SELECT l.date,
          SUM(f.calories * l.grams / 100) AS day_calories,
          SUM(f.protein  * l.grams / 100) AS day_protein,
          SUM(f.carbs    * l.grams / 100) AS day_carbs,
          SUM(f.fat      * l.grams / 100) AS day_fat,
          SUM(f.fiber    * l.grams / 100) AS day_fiber
        FROM log l JOIN foods f ON l.food_id = f.id
        WHERE l.status = 'logged'
        GROUP BY l.date
      )
      GROUP BY week
      ORDER BY week DESC
    `).all()
  );

  ipcMain.handle('log:getWeekDetail', (_, { weekStart }) =>
    getDb().prepare(`
      SELECT
        l.date,
        ROUND(SUM(CASE WHEN l.status='logged'  THEN f.calories * l.grams / 100 ELSE 0 END), 2) AS calories,
        ROUND(SUM(CASE WHEN l.status='logged'  THEN f.protein  * l.grams / 100 ELSE 0 END), 2) AS protein,
        ROUND(SUM(CASE WHEN l.status='logged'  THEN f.carbs    * l.grams / 100 ELSE 0 END), 2) AS carbs,
        ROUND(SUM(CASE WHEN l.status='logged'  THEN f.fat      * l.grams / 100 ELSE 0 END), 2) AS fat,
        ROUND(SUM(CASE WHEN l.status='logged'  THEN f.fiber    * l.grams / 100 ELSE 0 END), 2) AS fiber,
        ROUND(SUM(CASE WHEN l.status='planned' THEN f.calories * l.grams / 100 ELSE 0 END), 2) AS planned_calories,
        ROUND(SUM(CASE WHEN l.status='planned' THEN f.protein  * l.grams / 100 ELSE 0 END), 2) AS planned_protein,
        ROUND(SUM(CASE WHEN l.status='planned' THEN f.carbs    * l.grams / 100 ELSE 0 END), 2) AS planned_carbs,
        ROUND(SUM(CASE WHEN l.status='planned' THEN f.fat      * l.grams / 100 ELSE 0 END), 2) AS planned_fat,
        ROUND(SUM(CASE WHEN l.status='planned' THEN f.fiber    * l.grams / 100 ELSE 0 END), 2) AS planned_fiber
      FROM log l
      JOIN foods f ON l.food_id = f.id
      WHERE l.date BETWEEN ? AND date(?, '+6 days')
        AND l.status IN ('logged','planned')
      GROUP BY l.date
      ORDER BY l.date ASC
    `).all(weekStart, weekStart)
  );
}

module.exports = registerLogIpc;
