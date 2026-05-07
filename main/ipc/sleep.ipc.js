const { ipcMain } = require('electron');
const { getDb } = require('../db');
const { pushUndo } = require('./undo.ipc');
const { updateSectionStreak } = require('./streak-utils');
const { addPointsInternal } = require('./gamification.ipc');

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Calculate sleep duration in minutes.
 * Bedtime may be the previous night (e.g. 23:00 → 07:00 = 8h).
 * If bedtime hour > 12 and wake hour <= 12, add 24*60 to the diff.
 */
function calcDurationMin(bedtime, wake_time) {
  if (!bedtime || !wake_time) return null;
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wake_time.split(':').map(Number);
  let bedMins  = bh * 60 + bm;
  let wakeMins = wh * 60 + wm;
  if (bh >= 12 && wh <= 12) {
    wakeMins += 24 * 60;
  }
  const diff = wakeMins - bedMins;
  return diff > 0 ? diff : null;
}

function registerSleepIpc() {
  ipcMain.handle('sleep:get', (_, { date }) => {
    const d = date || today();
    const row = getDb().prepare('SELECT * FROM sleep_log WHERE date = ?').get(d);
    return row || null;
  });

  ipcMain.handle('sleep:upsert', (_, { date, bedtime, wake_time, quality, factors, note }) => {
    const d = date || today();
    const duration_min = calcDurationMin(bedtime, wake_time);
    const db = getDb();

    // Save old row for undo
    const old = db.prepare('SELECT * FROM sleep_log WHERE date = ?').get(d);

    db.prepare(`
      INSERT OR REPLACE INTO sleep_log (date, bedtime, wake_time, duration_min, quality, factors, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(
        (SELECT created_at FROM sleep_log WHERE date = ?),
        datetime('now')
      ))
    `).run(d, bedtime || null, wake_time || null, duration_min, quality || null,
           factors != null ? JSON.stringify(factors) : null, note || null, d);

    pushUndo('sleep:upsert', { date: d, old: old || null });

    try {
      const { streak, isNew, milestone, milestonePoints } = updateSectionStreak(db, 'sleep', d);
      if (isNew) {
        addPointsInternal(db, 'section_streak', 'streak_daily_sleep', 5, { section: 'sleep', streak });
        if (milestone) {
          addPointsInternal(db, 'section_streak', `streak_${milestone}_sleep`, milestonePoints, { section: 'sleep', streak });
        }
      }
    } catch (_) {}

    return { ok: true };
  });

  ipcMain.handle('sleep:range', (_, { from, to }) => {
    return getDb().prepare(
      'SELECT * FROM sleep_log WHERE date >= ? AND date <= ? ORDER BY date ASC'
    ).all(from, to);
  });

  ipcMain.handle('sleep:delete', (_, { date }) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM sleep_log WHERE date = ?').get(date);
    if (row) pushUndo('sleep:delete', { row });
    db.prepare('DELETE FROM sleep_log WHERE date = ?').run(date);
    return { ok: true };
  });
}

module.exports = registerSleepIpc;
