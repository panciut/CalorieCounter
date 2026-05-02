const { ipcMain } = require('electron');
const { getDb } = require('../db');

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
    for (const { key, value } of getDb().prepare('SELECT key, value FROM settings').all()) {
      if (key in defaults) defaults[key] = stringKeys.has(key) ? value : parseFloat(value);
    }
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
