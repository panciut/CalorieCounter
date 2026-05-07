const { ipcMain } = require('electron');
const { getDb } = require('../db');

// Goal fields are time-versioned via goal_plans. settings:get overlays today's
// active plan onto the returned object so legacy useSettings() consumers see
// the right values without changes.
const GOAL_FIELDS = [
  'cal_min', 'cal_rec', 'cal_max',
  'protein_min', 'protein_rec', 'protein_max',
  'carbs_min', 'carbs_rec', 'carbs_max',
  'fat_min', 'fat_rec', 'fat_max',
  'fiber_min', 'fiber_rec', 'fiber_max',
  'weight_goal', 'water_goal',
  'tol_1', 'tol_2', 'tol_3',
];

function registerSettingsIpc() {
  ipcMain.handle('settings:get', () => {
    const defaults = {
      cal_min: 1800, cal_max: 2200, cal_rec: 2000,
      protein_min: 120, protein_max: 180, protein_rec: 150,
      carbs_min: 200,  carbs_max: 300,  carbs_rec: 250,
      fat_min: 55,     fat_max: 85,     fat_rec: 70,
      fiber_min: 20,   fiber_max: 35,   fiber_rec: 30,
      weight_goal: 0, water_goal: 2000,
      language: 'en', theme: 'dark',
      tol_1: 5, tol_2: 10, tol_3: 20,
      pantry_enabled: 1, pantry_warn_days: 3, pantry_urgent_days: 1,
      shopping_prompt_enabled: 1, shopping_prompt_threshold: 1,
      currency_symbol: '€',
      notif_pantry_expiry: 1, notif_low_pantry: 1,
      notif_missing_log: 1, notif_missing_energy: 1,
      notif_weight: 1, notif_weight_warn_days: 3, notif_weight_urgent_days: 7,
      track_extra_nutrition: 0, extra_nutrition_unit: 'sodium', off_country: 'world',
      off_local_enabled: 0, off_local_last_synced: '', off_disable_online: 0,
    };
    const stringKeys = new Set(['language', 'theme', 'extra_nutrition_unit', 'off_country', 'off_local_last_synced', 'currency_symbol']);
    const db = getDb();
    for (const { key, value } of db.prepare('SELECT key, value FROM settings').all()) {
      if (key in defaults) defaults[key] = stringKeys.has(key) ? value : parseFloat(value);
    }
    // Overlay today's goal_plan on top of any settings values for goal fields
    try {
      const today = new Date().toISOString().slice(0, 10);
      const plan = db.prepare(`
        SELECT * FROM goal_plans WHERE effective_from <= ?
        ORDER BY effective_from DESC LIMIT 1
      `).get(today);
      if (plan) {
        for (const f of GOAL_FIELDS) {
          if (plan[f] !== null && plan[f] !== undefined) defaults[f] = plan[f];
        }
      }
    } catch { /* goal_plans not yet created on very first run; defaults stand */ }
    return defaults;
  });

  ipcMain.handle('settings:save', (_, settings) => {
    const stmt = getDb().prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    );
    for (const [key, val] of Object.entries(settings)) stmt.run(key, String(val));
    return { ok: true };
  });
}

module.exports = registerSettingsIpc;
