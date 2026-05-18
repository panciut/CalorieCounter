const { ipcMain } = require('electron');
const crypto = require('crypto');
const { getDb } = require('../db');

const today = () => new Date().toISOString().slice(0, 10);

function registerRecipesIpc() {
  ipcMain.handle('recipes:getAll', () =>
    getDb().prepare(`
      SELECT r.id, r.name, r.description,
        ROUND(SUM(f.calories * ri.grams / 100), 2) AS total_calories,
        ROUND(SUM(f.protein  * ri.grams / 100), 2) AS total_protein,
        ROUND(SUM(f.carbs    * ri.grams / 100), 2) AS total_carbs,
        ROUND(SUM(f.fat      * ri.grams / 100), 2) AS total_fat,
        ROUND(SUM(f.fiber    * ri.grams / 100), 2) AS total_fiber,
        ROUND(SUM(f.sugar         * ri.grams / 100), 2) AS total_sugar,
        ROUND(SUM(f.saturated_fat * ri.grams / 100), 2) AS total_saturated_fat,
        ROUND(SUM(f.sodium_mg     * ri.grams / 100), 2) AS total_sodium_mg,
        COUNT(ri.id) AS ingredient_count
      FROM recipes r
      JOIN recipe_ingredients ri ON ri.recipe_id = r.id
      JOIN foods f ON f.id = ri.food_id
      GROUP BY r.id
      ORDER BY r.name
    `).all()
  );

  ipcMain.handle('recipes:get', (_, { id }) => {
    const db = getDb();
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
    const ingredients = db.prepare(`
      SELECT ri.id, ri.grams, f.id AS food_id, f.name,
        ROUND(f.calories * ri.grams / 100, 2) AS calories,
        ROUND(f.protein  * ri.grams / 100, 2) AS protein,
        ROUND(f.carbs    * ri.grams / 100, 2) AS carbs,
        ROUND(f.fat      * ri.grams / 100, 2) AS fat,
        ROUND(f.fiber    * ri.grams / 100, 2) AS fiber,
        ROUND(f.sugar         * ri.grams / 100, 2) AS sugar,
        ROUND(f.saturated_fat * ri.grams / 100, 2) AS saturated_fat,
        ROUND(f.sodium_mg     * ri.grams / 100, 2) AS sodium_mg
      FROM recipe_ingredients ri
      JOIN foods f ON f.id = ri.food_id
      WHERE ri.recipe_id = ?
    `).all(id);
    return { ...recipe, ingredients };
  });

  ipcMain.handle('recipes:create', (_, { name, description, ingredients }) => {
    const db = getDb();
    return db.transaction(() => {
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO recipes (name, description) VALUES (?, ?)'
      ).run(name, description || null);
      const insertIng = db.prepare(
        'INSERT INTO recipe_ingredients (recipe_id, food_id, grams) VALUES (?, ?, ?)'
      );
      for (const { food_id, grams } of ingredients) {
        insertIng.run(lastInsertRowid, food_id, grams);
      }
      return { id: lastInsertRowid };
    })();
  });

  ipcMain.handle('recipes:delete', (_, { id }) => {
    getDb().prepare('DELETE FROM recipes WHERE id = ?').run(id);
    return { ok: true };
  });

  ipcMain.handle('recipes:log', (_, { recipe_id, meal, date, scale }) => {
    const db = getDb();
    const d = date || today();
    const s = scale || 1;
    const recipe = db.prepare('SELECT name FROM recipes WHERE id = ?').get(recipe_id);
    const ingredients = db.prepare(
      'SELECT food_id, grams FROM recipe_ingredients WHERE recipe_id = ?'
    ).all(recipe_id);
    const recipeLogId = crypto.randomUUID();
    return db.transaction(() => {
      const insert = db.prepare(
        'INSERT INTO log (date, food_id, grams, meal, recipe_log_id, recipe_name) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const { food_id, grams } of ingredients) {
        insert.run(d, food_id, grams * s, meal || 'AfternoonSnack', recipeLogId, recipe?.name || null);
      }
      return { count: ingredients.length, recipe_log_id: recipeLogId };
    })();
  });

  ipcMain.handle('recipes:updateIngredients', (_, { id, ingredients }) => {
    const db = getDb();
    db.transaction(() => {
      db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(id);
      const insert = db.prepare(
        'INSERT INTO recipe_ingredients (recipe_id, food_id, grams) VALUES (?, ?, ?)'
      );
      for (const { food_id, grams } of ingredients) insert.run(id, food_id, grams);
    })();
    return { ok: true };
  });
}

module.exports = registerRecipesIpc;
