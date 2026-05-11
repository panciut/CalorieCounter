const { ipcMain } = require('electron');
const { getDb } = require('../db');
const { pushUndo } = require('./undo.ipc');

function offsetDate(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function computeMoodStats(db, { from, to, today }) {
  const rows = db.prepare(
    'SELECT date, mood, energy, stress FROM mood_log WHERE date >= ? AND date <= ? ORDER BY date ASC'
  ).all(from, to);

  const dateSet = new Set(rows.map(r => r.date));

  // logged_streak: walk backwards from today
  let loggedStreak = 0;
  let cur = dateSet.has(today) ? today : (dateSet.has(offsetDate(today, -1)) ? offsetDate(today, -1) : null);
  if (cur) {
    while (dateSet.has(cur)) {
      loggedStreak++;
      cur = offsetDate(cur, -1);
    }
  }

  // best_logged_streak: longest run of consecutive days in the sorted date list
  let bestStreak = 0;
  let runLen = 0;
  let prevDate = null;
  for (const date of [...dateSet].sort()) {
    if (prevDate === null || offsetDate(prevDate, 1) === date) {
      runLen++;
    } else {
      runLen = 1;
    }
    if (runLen > bestStreak) bestStreak = runLen;
    prevDate = date;
  }

  const daysLogged = rows.length;

  const moodVals   = rows.filter(r => r.mood   != null).map(r => r.mood);
  const energyVals = rows.filter(r => r.energy != null).map(r => r.energy);
  const stressVals = rows.filter(r => r.stress != null).map(r => r.stress);

  const avgMood   = avg(moodVals);
  const avgEnergy = avg(energyVals);
  const avgStress = avg(stressVals);

  // week_avg_mood: last 7 days [today-6 .. today]
  const weekStart     = offsetDate(today, -6);
  const lastWeekStart = offsetDate(today, -13);
  const lastWeekEnd   = offsetDate(today, -7);

  const weekMoods     = rows.filter(r => r.date >= weekStart && r.date <= today && r.mood != null).map(r => r.mood);
  const lastWeekMoods = rows.filter(r => r.date >= lastWeekStart && r.date <= lastWeekEnd && r.mood != null).map(r => r.mood);

  const weekAvgMood     = avg(weekMoods);
  const lastWeekAvgMood = avg(lastWeekMoods);

  const moodRows = rows.filter(r => r.mood != null);
  let bestDay  = null;
  let worstDay = null;
  if (moodRows.length) {
    const best  = moodRows.reduce((a, b) => b.mood > a.mood ? b : a);
    const worst = moodRows.reduce((a, b) => b.mood < a.mood ? b : a);
    bestDay  = { date: best.date,  mood: best.mood  };
    worstDay = { date: worst.date, mood: worst.mood };
  }

  return {
    days:                rows.map(r => ({ date: r.date, mood: r.mood, energy: r.energy, stress: r.stress })),
    logged_streak:       loggedStreak,
    best_logged_streak:  bestStreak,
    days_logged_30d:     daysLogged,
    avg_mood:            avgMood,
    avg_energy:          avgEnergy,
    avg_stress:          avgStress,
    week_avg_mood:       weekAvgMood,
    last_week_avg_mood:  lastWeekAvgMood,
    best_day:            bestDay,
    worst_day:           worstDay,
  };
}

function registerMoodIpc() {
  ipcMain.handle('mood:get', (_, { date }) => {
    const row = getDb().prepare('SELECT * FROM mood_log WHERE date = ?').get(date);
    return row || null;
  });

  ipcMain.handle('mood:upsert', (_, { date, mood, energy, stress, note }) => {
    const db = getDb();

    // Save old row for undo
    const old = db.prepare('SELECT * FROM mood_log WHERE date = ?').get(date);

    db.prepare(`
      INSERT OR REPLACE INTO mood_log (date, mood, energy, stress, note, created_at)
      VALUES (?, ?, ?, ?, ?, COALESCE(
        (SELECT created_at FROM mood_log WHERE date = ?),
        datetime('now')
      ))
    `).run(date, mood ?? null, energy ?? null, stress ?? null, note ?? null, date);

    pushUndo('mood:upsert', { date, old: old || null });

    return db.prepare('SELECT * FROM mood_log WHERE date = ?').get(date);
  });

  ipcMain.handle('mood:range', (_, { from, to }) => {
    return getDb().prepare(
      'SELECT * FROM mood_log WHERE date >= ? AND date <= ? ORDER BY date ASC'
    ).all(from, to);
  });

  ipcMain.handle('mood:delete', (_, { date }) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM mood_log WHERE date = ?').get(date);
    if (row) pushUndo('mood:delete', { row });
    db.prepare('DELETE FROM mood_log WHERE date = ?').run(date);
    return { ok: true };
  });

  ipcMain.handle('mood:getStats', (_, a) =>
    computeMoodStats(getDb(), { from: a.from, to: a.to, today: a.today || new Date().toISOString().slice(0, 10) })
  );
}

module.exports = registerMoodIpc;
module.exports.computeMoodStats = computeMoodStats;
