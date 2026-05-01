const { ipcMain } = require('electron');
const { getDb } = require('../db');

function registerDailyEnergyIpc() {
  ipcMain.handle('dailyEnergy:get', (_, { date }) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM daily_energy WHERE date = ?').get(date);
    return row || { date, resting_kcal: 0, active_kcal: 0, extra_kcal: 0, steps: 0, distance_km: 0 };
  });

  // Returns the most recent resting_kcal before the given date (for carry-forward)
  ipcMain.handle('dailyEnergy:getPrevResting', (_, { date }) => {
    const db = getDb();
    const row = db.prepare(
      'SELECT resting_kcal FROM daily_energy WHERE date < ? AND resting_kcal > 0 ORDER BY date DESC LIMIT 1'
    ).get(date);
    return { resting_kcal: row ? row.resting_kcal : 0 };
  });

  ipcMain.handle('dailyEnergy:getRange', (_, { startDate, endDate }) => {
    const db = getDb();
    return db.prepare(
      'SELECT * FROM daily_energy WHERE date >= ? AND date <= ? ORDER BY date'
    ).all(startDate, endDate);
  });

  ipcMain.handle('dailyEnergy:set', (_, { date, resting_kcal, active_kcal, extra_kcal, steps, distance_km }) => {
    const db = getDb();
    db.prepare(`
      INSERT INTO daily_energy (date, resting_kcal, active_kcal, extra_kcal, steps, distance_km)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        resting_kcal = excluded.resting_kcal,
        active_kcal  = excluded.active_kcal,
        extra_kcal   = excluded.extra_kcal,
        steps        = excluded.steps,
        distance_km  = excluded.distance_km
    `).run(date, resting_kcal || 0, active_kcal || 0, extra_kcal || 0, steps || 0, distance_km || 0);
    return { ok: true };
  });
}

module.exports = registerDailyEnergyIpc;
