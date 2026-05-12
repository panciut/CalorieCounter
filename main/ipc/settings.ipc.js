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
      onboarding_complete: 0,
    notif_meal_reminders: 0,
    notif_meal_breakfast: 1,
    notif_meal_lunch: 1,
    notif_meal_dinner: 1,
    notif_meal_snack: 0,
    notif_meal_breakfast_time: '08:00',
    notif_meal_lunch_time: '13:00',
    notif_meal_dinner_time: '20:00',
    notif_meal_snack_time: '16:00',
    dashboard_widget_order: '',
    checkin_morning_enabled: 1,
    checkin_evening_enabled: 0,
    checkin_last_morning_date: '',
    checkin_last_evening_date: '',
    tdee_auto_suggest: 1,
    tdee_last_seen_value: 0,
    };
    const stringKeys = new Set(['language', 'theme',
      'notif_meal_breakfast_time', 'notif_meal_lunch_time',
      'notif_meal_dinner_time', 'notif_meal_snack_time',
      'dashboard_widget_order',
      'checkin_last_morning_date', 'checkin_last_evening_date']);
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
