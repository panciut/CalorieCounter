const { ipcMain } = require('electron');
const { getDb } = require('../db');
const { pushUndo } = require('./undo.ipc');

function localDateStr(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

const today = () => localDateStr(new Date());

function getLast7Days(fromDate) {
  const days = [];
  // Parse as local midnight by appending T00:00:00 (no Z)
  const base = new Date((fromDate || today()) + 'T00:00:00');
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    days.push(localDateStr(d)); // local date, not UTC
  }
  return days;
}

function registerHabitsIpc() {
  // ── List active habits ──────────────────────────────────────────────────────
  ipcMain.handle('habits:list', () => {
    return getDb()
      .prepare('SELECT * FROM habits WHERE archived = 0 ORDER BY created_at ASC')
      .all();
  });

  // ── Create ──────────────────────────────────────────────────────────────────
  ipcMain.handle('habits:create', (_, { name, icon, color, target_per_week }) => {
    const result = getDb()
      .prepare(
        'INSERT INTO habits (name, icon, color, target_per_week, archived) VALUES (?, ?, ?, ?, 0)'
      )
      .run(
        name,
        icon  || '✅',
        color || 'var(--fb-accent)',
        target_per_week ?? 7
      );
    return { id: result.lastInsertRowid };
  });

  // ── Update ──────────────────────────────────────────────────────────────────
  ipcMain.handle('habits:update', (_, { id, name, icon, color, target_per_week }) => {
    const db  = getDb();
    const row = db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
    if (!row) return { ok: false };
    db.prepare(
      'UPDATE habits SET name = ?, icon = ?, color = ?, target_per_week = ? WHERE id = ?'
    ).run(
      name            !== undefined ? name            : row.name,
      icon            !== undefined ? icon            : row.icon,
      color           !== undefined ? color           : row.color,
      target_per_week !== undefined ? target_per_week : row.target_per_week,
      id
    );
    return { ok: true };
  });

  // ── Archive ─────────────────────────────────────────────────────────────────
  ipcMain.handle('habits:archive', (_, { id }) => {
    getDb().prepare('UPDATE habits SET archived = 1 WHERE id = ?').run(id);
    return { ok: true };
  });

  // ── Delete (+ cascade via FK in habit_logs) ─────────────────────────────────
  ipcMain.handle('habits:delete', (_, { id }) => {
    const db  = getDb();
    const row = db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
    if (row) {
      const logs = db.prepare('SELECT * FROM habit_logs WHERE habit_id = ?').all(id);
      pushUndo('habits:delete', { row, logs });
    }
    db.prepare('DELETE FROM habit_logs WHERE habit_id = ?').run(id);
    db.prepare('DELETE FROM habits WHERE id = ?').run(id);
    return { ok: true };
  });

  // ── Check (mark today done) ─────────────────────────────────────────────────
  ipcMain.handle('habits:check', (_, { habit_id, date }) => {
    const d = date || today();
    pushUndo('habits:check', { habit_id, date: d });
    getDb()
      .prepare('INSERT OR IGNORE INTO habit_logs (habit_id, date, value) VALUES (?, ?, 1)')
      .run(habit_id, d);
    return { checked: true };
  });

  // ── Uncheck ─────────────────────────────────────────────────────────────────
  ipcMain.handle('habits:uncheck', (_, { habit_id, date }) => {
    const d = date || today();
    pushUndo('habits:uncheck', { habit_id, date: d });
    getDb()
      .prepare('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?')
      .run(habit_id, d);
    return { unchecked: true };
  });

  // ── Week stats: for each habit, last 7 days completion ──────────────────────
  ipcMain.handle('habits:getWeekStats', (_, { date }) => {
    const db   = getDb();
    const days = getLast7Days(date);
    const from = days[0];
    const to   = days[days.length - 1];

    const habits = db
      .prepare('SELECT id FROM habits WHERE archived = 0')
      .all();

    const logs = db
      .prepare(
        'SELECT habit_id, date FROM habit_logs WHERE date >= ? AND date <= ?'
      )
      .all(from, to);

    const logSet = new Set(logs.map(l => `${l.habit_id}:${l.date}`));

    return habits.map(h => ({
      habit_id: h.id,
      checks: days.map(d => ({
        date: d,
        done: logSet.has(`${h.id}:${d}`),
      })),
    }));
  });

  // ── Current streak: consecutive days going back from today ──────────────────
  ipcMain.handle('habits:getCurrentStreak', (_, { habit_id }) => ({
    streak: computeCurrentStreak(getDb(), habit_id, today()),
  }));

  // ── Month data: dates checked in a given month ──────────────────────────────
  ipcMain.handle('habits:getMonthData', (_, { habit_id, year, month }) => {
    // month is 1-based
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const rows = getDb()
      .prepare(
        'SELECT date FROM habit_logs WHERE habit_id = ? AND date >= ? AND date <= ? ORDER BY date ASC'
      )
      .all(habit_id, from, to);

    return { dates: rows.map(r => r.date) };
  });

  // ── Habit stats: streak, completion rate, weekly tracking ──────────────────
  ipcMain.handle('habits:getStats', (_, a) =>
    computeHabitStats(getDb(), { habitId: a.habit_id, today: a.today || today() })
  );
}

// ── Pure helper: offset a date string by n days ─────────────────────────────
function offsetDate(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

// ── computeCurrentStreak ─────────────────────────────────────────────────────
function computeCurrentStreak(db, habitId, todayDate) {
  const rows = db
    .prepare('SELECT DISTINCT date FROM habit_logs WHERE habit_id = ? ORDER BY date DESC')
    .all(habitId)
    .map(r => r.date);

  if (!rows.length) return 0;

  const dateSet = new Set(rows);
  let streak = 0;
  let d = new Date(todayDate + 'T00:00:00');

  // Allow streak to start from today or yesterday
  if (!dateSet.has(localDateStr(d))) {
    d.setDate(d.getDate() - 1);
    if (!dateSet.has(localDateStr(d))) {
      return 0;
    }
  }

  while (dateSet.has(localDateStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }

  return streak;
}

// ── computeLongestStreak ─────────────────────────────────────────────────────
function computeLongestStreak(db, habitId) {
  const rows = db
    .prepare('SELECT DISTINCT date FROM habit_logs WHERE habit_id = ? ORDER BY date ASC')
    .all(habitId)
    .map(r => r.date);

  if (!rows.length) return 0;

  let longest = 1;
  let current = 1;

  for (let i = 1; i < rows.length; i++) {
    const prev = new Date(rows[i - 1] + 'T00:00:00');
    const curr = new Date(rows[i] + 'T00:00:00');
    const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }

  return longest;
}

// ── computeHabitStats ────────────────────────────────────────────────────────
function computeHabitStats(db, { habitId, today: todayDate }) {
  const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(habitId);
  if (!habit) return { current_streak: 0, longest_streak: 0, completion_rate_30d: 0, checks_30d: [], target_per_week: 7, checks_this_week: 0, checks_prev_week: 0, on_track: false };
  const target_per_week = habit.target_per_week != null ? habit.target_per_week : 7;

  // checks_30d: dates in last 30 days including today
  const from30 = offsetDate(todayDate, -29);
  const checks_30d = db
    .prepare(
      'SELECT date FROM habit_logs WHERE habit_id = ? AND date >= ? AND date <= ? ORDER BY date ASC'
    )
    .all(habitId, from30, todayDate)
    .map(r => r.date);

  const completion_rate_30d = checks_30d.length / 30;

  // checks_this_week: [today-6, today]
  const weekStart = offsetDate(todayDate, -6);
  const checks_this_week = db
    .prepare(
      'SELECT COUNT(*) as cnt FROM habit_logs WHERE habit_id = ? AND date >= ? AND date <= ?'
    )
    .get(habitId, weekStart, todayDate).cnt;

  // checks_prev_week: [today-13, today-7]
  const prevWeekStart = offsetDate(todayDate, -13);
  const prevWeekEnd   = offsetDate(todayDate, -7);
  const checks_prev_week = db
    .prepare(
      'SELECT COUNT(*) as cnt FROM habit_logs WHERE habit_id = ? AND date >= ? AND date <= ?'
    )
    .get(habitId, prevWeekStart, prevWeekEnd).cnt;

  const current_streak = computeCurrentStreak(db, habitId, todayDate);
  const longest_streak = computeLongestStreak(db, habitId);
  const on_track = checks_this_week >= target_per_week;

  return {
    current_streak,
    longest_streak,
    completion_rate_30d,
    checks_30d,
    target_per_week,
    checks_this_week,
    checks_prev_week,
    on_track,
  };
}

module.exports = registerHabitsIpc;
module.exports.computeCurrentStreak = computeCurrentStreak;
module.exports.computeLongestStreak = computeLongestStreak;
module.exports.computeHabitStats    = computeHabitStats;
