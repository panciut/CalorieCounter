const { ipcMain } = require('electron');
const { getDb } = require('../db');
const { pushUndo } = require('./undo.ipc');

const today = () => new Date().toISOString().slice(0, 10);

function getLast7Days(fromDate) {
  const days = [];
  const base = new Date((fromDate || today()) + 'T00:00:00');
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
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
    if (row) pushUndo('habits:delete', { row });
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
  ipcMain.handle('habits:getCurrentStreak', (_, { habit_id }) => {
    const rows = getDb()
      .prepare(
        'SELECT DISTINCT date FROM habit_logs WHERE habit_id = ? ORDER BY date DESC'
      )
      .all(habit_id)
      .map(r => r.date);

    if (!rows.length) return { streak: 0 };

    const todayStr  = today();
    const dateSet   = new Set(rows);
    let streak      = 0;
    let d           = new Date(todayStr + 'T00:00:00');

    // Allow streak to start from today or yesterday
    if (!dateSet.has(todayStr)) {
      d.setDate(d.getDate() - 1);
      if (!dateSet.has(d.toISOString().slice(0, 10))) {
        return { streak: 0 };
      }
    }

    while (dateSet.has(d.toISOString().slice(0, 10))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }

    return { streak };
  });

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
}

module.exports = registerHabitsIpc;
