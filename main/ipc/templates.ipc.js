const { ipcMain } = require('electron');
const { getDb } = require('../db');

const today = () => new Date().toISOString().slice(0, 10);

function registerTemplatesIpc() {
  ipcMain.handle('templates:getAll', () =>
    getDb().prepare(`
      SELECT mt.id, mt.name,
        COUNT(ti.id) AS item_count,
        ROUND(SUM(f.calories * ti.grams / 100), 2) AS total_calories
      FROM meal_templates mt
      LEFT JOIN template_items ti ON ti.template_id = mt.id
      LEFT JOIN foods f ON f.id = ti.food_id
      GROUP BY mt.id
      ORDER BY mt.name
    `).all()
  );

  ipcMain.handle('templates:get', (_, { id }) => {
    const db = getDb();
    const template = db.prepare('SELECT * FROM meal_templates WHERE id = ?').get(id);
    const items = db.prepare(`
      SELECT ti.id, ti.food_id, ti.grams, ti.meal,
        f.name,
        ROUND(f.calories * ti.grams / 100, 2) AS calories,
        ROUND(f.protein  * ti.grams / 100, 2) AS protein,
        ROUND(f.carbs    * ti.grams / 100, 2) AS carbs,
        ROUND(f.fat      * ti.grams / 100, 2) AS fat,
        ROUND(f.fiber    * ti.grams / 100, 2) AS fiber
      FROM template_items ti
      JOIN foods f ON f.id = ti.food_id
      WHERE ti.template_id = ?
    `).all(id);
    return { ...template, items };
  });

  ipcMain.handle('templates:create', (_, { name, items }) => {
    const db = getDb();
    return db.transaction(() => {
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO meal_templates (name) VALUES (?)'
      ).run(name);
      const insertItem = db.prepare(
        'INSERT INTO template_items (template_id, food_id, grams, meal) VALUES (?, ?, ?, ?)'
      );
      for (const { food_id, grams, meal } of items) {
        insertItem.run(lastInsertRowid, food_id, grams, meal || 'AfternoonSnack');
      }
      return { id: lastInsertRowid };
    })();
  });

  ipcMain.handle('templates:createFromDay', (_, { name, date }) => {
    const db = getDb();
    const d = date || today();
    return db.transaction(() => {
      const entries = db.prepare(
        'SELECT food_id, grams, meal FROM log WHERE date = ?'
      ).all(d);
      if (!entries.length) return { id: null, count: 0 };
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO meal_templates (name) VALUES (?)'
      ).run(name);
      const insertItem = db.prepare(
        'INSERT INTO template_items (template_id, food_id, grams, meal) VALUES (?, ?, ?, ?)'
      );
      for (const { food_id, grams, meal } of entries) {
        insertItem.run(lastInsertRowid, food_id, grams, meal);
      }
      return { id: lastInsertRowid, count: entries.length };
    })();
  });

  ipcMain.handle('templates:delete', (_, { id }) => {
    getDb().prepare('DELETE FROM meal_templates WHERE id = ?').run(id);
    return { ok: true };
  });

  ipcMain.handle('templates:apply', (_, { id, date }) => {
    const db = getDb();
    const d = date || today();
    return db.transaction(() => {
      const items = db.prepare(
        'SELECT food_id, grams, meal FROM template_items WHERE template_id = ?'
      ).all(id);
      const insert = db.prepare(
        'INSERT INTO log (date, food_id, grams, meal) VALUES (?, ?, ?, ?)'
      );
      for (const { food_id, grams, meal } of items) {
        insert.run(d, food_id, grams, meal);
      }
      return { count: items.length };
    })();
  });

  // Apply a single-meal template to (date, meal) as planned entries.
  // If target_meal is supplied, overrides the stored meal of the items.
  // If replace=true, existing entries in (date, target_meal) are deleted first.
  ipcMain.handle('templates:applyToCell', (_, { id, date, target_meal, replace }) => {
    const db = getDb();
    const d = date || today();
    return db.transaction(() => {
      const items = db.prepare(
        'SELECT food_id, grams, meal FROM template_items WHERE template_id = ?'
      ).all(id);
      const meal = target_meal || (items[0] && items[0].meal) || 'AfternoonSnack';
      if (replace) {
        db.prepare("DELETE FROM log WHERE date = ? AND meal = ? AND status = 'planned'").run(d, meal);
      }
      const insert = db.prepare(
        "INSERT INTO log (date, food_id, grams, meal, status) VALUES (?, ?, ?, ?, 'planned')"
      );
      for (const it of items) {
        insert.run(d, it.food_id, it.grams, meal);
      }
      return { count: items.length };
    })();
  });

  // Create a single-meal template from the entries currently in (date, meal).
  ipcMain.handle('templates:createFromCell', (_, { name, date, meal }) => {
    const db = getDb();
    const d = date || today();
    return db.transaction(() => {
      const entries = db.prepare(
        'SELECT food_id, grams FROM log WHERE date = ? AND meal = ?'
      ).all(d, meal);
      if (entries.length === 0) return { id: null, count: 0 };
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO meal_templates (name) VALUES (?)'
      ).run(name);
      const insertItem = db.prepare(
        'INSERT INTO template_items (template_id, food_id, grams, meal) VALUES (?, ?, ?, ?)'
      );
      for (const { food_id, grams } of entries) {
        insertItem.run(lastInsertRowid, food_id, grams, meal);
      }
      return { id: lastInsertRowid, count: entries.length };
    })();
  });
}

module.exports = registerTemplatesIpc;
