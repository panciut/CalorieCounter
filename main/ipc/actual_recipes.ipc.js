const { ipcMain } = require('electron');
const crypto = require('crypto');
const { getDb } = require('../db');

const today = () => new Date().toISOString().slice(0, 10);

function registerActualRecipesIpc() {
  ipcMain.handle('actualRecipes:getAll', () =>
    getDb().prepare(`
      SELECT r.id, r.name, r.description, r.yield_g, r.notes, r.prep_time_min, r.cook_time_min, r.created_at,
        ROUND(SUM(f.calories * ri.grams / 100), 2) AS total_calories,
        ROUND(SUM(f.protein  * ri.grams / 100), 2) AS total_protein,
        ROUND(SUM(f.carbs    * ri.grams / 100), 2) AS total_carbs,
        ROUND(SUM(f.fat      * ri.grams / 100), 2) AS total_fat,
        ROUND(SUM(f.fiber    * ri.grams / 100), 2) AS total_fiber,
        ROUND(SUM(f.sugar         * ri.grams / 100), 2) AS total_sugar,
        ROUND(SUM(f.saturated_fat * ri.grams / 100), 2) AS total_saturated_fat,
        ROUND(SUM(f.sodium_mg     * ri.grams / 100), 2) AS total_sodium_mg,
        COUNT(ri.id) AS ingredient_count
      FROM actual_recipes r
      LEFT JOIN actual_recipe_ingredients ri ON ri.recipe_id = r.id
      LEFT JOIN foods f ON f.id = ri.food_id
      GROUP BY r.id
      ORDER BY r.name
    `).all()
  );

  ipcMain.handle('actualRecipes:get', (_, { id }) => {
    const db = getDb();
    const recipe = db.prepare('SELECT * FROM actual_recipes WHERE id = ?').get(id);
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
      FROM actual_recipe_ingredients ri
      JOIN foods f ON f.id = ri.food_id
      WHERE ri.recipe_id = ?
    `).all(id);
    return { ...recipe, ingredients };
  });

  ipcMain.handle('actualRecipes:create', (_, { name, description, yield_g, notes, prep_time_min, cook_time_min, tools, procedure, ingredients }) => {
    const db = getDb();
    return db.transaction(() => {
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO actual_recipes (name, description, yield_g, notes, prep_time_min, cook_time_min, tools, procedure) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(name, description || null, yield_g || 0, notes || null, prep_time_min || 0, cook_time_min || 0, tools || null, procedure || null);
      const insertIng = db.prepare(
        'INSERT INTO actual_recipe_ingredients (recipe_id, food_id, grams) VALUES (?, ?, ?)'
      );
      for (const { food_id, grams } of (ingredients || [])) {
        insertIng.run(lastInsertRowid, food_id, grams);
      }
      return { id: lastInsertRowid };
    })();
  });

  ipcMain.handle('actualRecipes:update', (_, { id, name, description, yield_g, notes, prep_time_min, cook_time_min, tools, procedure }) => {
    getDb().prepare(
      'UPDATE actual_recipes SET name=?, description=?, yield_g=?, notes=?, prep_time_min=?, cook_time_min=?, tools=?, procedure=? WHERE id=?'
    ).run(name, description || null, yield_g || 0, notes || null, prep_time_min || 0, cook_time_min || 0, tools || null, procedure || null, id);
    return { ok: true };
  });

  ipcMain.handle('actualRecipes:updateIngredients', (_, { id, ingredients }) => {
    const db = getDb();
    db.transaction(() => {
      db.prepare('DELETE FROM actual_recipe_ingredients WHERE recipe_id = ?').run(id);
      const insert = db.prepare(
        'INSERT INTO actual_recipe_ingredients (recipe_id, food_id, grams) VALUES (?, ?, ?)'
      );
      for (const { food_id, grams } of ingredients) insert.run(id, food_id, grams);
    })();
    return { ok: true };
  });

  ipcMain.handle('actualRecipes:delete', (_, { id }) => {
    getDb().prepare('DELETE FROM actual_recipes WHERE id = ?').run(id);
    return { ok: true };
  });

  // Log by grams eaten — scales all ingredient macros proportionally to yield.
  // Tags each inserted row with a shared recipe_log_id + recipe_name so the
  // entries table can group them visually as a single cohesive log.
  ipcMain.handle('actualRecipes:log', (_, { recipe_id, grams_eaten, meal, date }) => {
    const db = getDb();
    const d = date || today();
    const recipe = db.prepare('SELECT name, yield_g FROM actual_recipes WHERE id = ?').get(recipe_id);
    if (!recipe || !recipe.yield_g) return { ok: false, error: 'No yield set' };

    const ratio = grams_eaten / recipe.yield_g;
    const ingredients = db.prepare(
      'SELECT food_id, grams FROM actual_recipe_ingredients WHERE recipe_id = ?'
    ).all(recipe_id);

    const recipeLogId = crypto.randomUUID();
    return db.transaction(() => {
      const insert = db.prepare(
        'INSERT INTO log (date, food_id, grams, meal, recipe_log_id, recipe_name) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (const { food_id, grams } of ingredients) {
        insert.run(d, food_id, grams * ratio, meal || 'AfternoonSnack', recipeLogId, recipe.name);
      }
      return { ok: true, count: ingredients.length, recipe_log_id: recipeLogId };
    })();
  });
}

module.exports = registerActualRecipesIpc;
