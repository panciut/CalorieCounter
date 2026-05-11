const { ipcMain } = require('electron');
const { getDb } = require('../db');
const { pushUndo } = require('./undo.ipc');

const today = () => new Date().toISOString().slice(0, 10);

function prevDate(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function registerTasksIpc() {
  ipcMain.handle('tasks:get', (_, { date }) => {
    const d = date || today();
    return getDb()
      .prepare('SELECT * FROM tasks WHERE date = ? ORDER BY order_idx ASC')
      .all(d);
  });

  ipcMain.handle('tasks:add', (_, { date, title, priority, estimate_min, project }) => {
    const db = getDb();
    const d = date || today();
    const maxRow = db
      .prepare('SELECT COALESCE(MAX(order_idx), -1) AS mx FROM tasks WHERE date = ?')
      .get(d);
    const order_idx = maxRow.mx + 1;
    const result = db
      .prepare(
        'INSERT INTO tasks (date, title, done, priority, estimate_min, project, order_idx) VALUES (?, ?, 0, ?, ?, ?, ?)'
      )
      .run(d, title, priority ?? 0, estimate_min ?? null, project ?? null, order_idx);
    return { id: result.lastInsertRowid };
  });

  ipcMain.handle('tasks:toggle', (_, { id }) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!row) return { ok: false };
    const newDone = row.done === 0 ? 1 : 0;
    const nowIso = new Date().toISOString();
    pushUndo('tasks:toggle', { id, old_done: row.done, old_done_at: row.done_at });
    db.prepare('UPDATE tasks SET done = ?, done_at = ? WHERE id = ?').run(
      newDone,
      newDone === 1 ? nowIso : null,
      id
    );
    return { ok: true, done: newDone };
  });

  ipcMain.handle('tasks:update', (_, { id, title, priority, estimate_min, project }) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!row) return { ok: false };
    pushUndo('tasks:update', {
      id,
      old_title: row.title,
      old_priority: row.priority,
      old_estimate_min: row.estimate_min,
      old_project: row.project,
    });
    db.prepare(
      'UPDATE tasks SET title = ?, priority = ?, estimate_min = ?, project = ? WHERE id = ?'
    ).run(
      title !== undefined ? title : row.title,
      priority !== undefined ? priority : row.priority,
      estimate_min !== undefined ? estimate_min : row.estimate_min,
      project !== undefined ? project : row.project,
      id
    );
    return { ok: true };
  });

  ipcMain.handle('tasks:reorder', (_, { ids }) => {
    const db = getDb();
    const stmt = db.prepare('UPDATE tasks SET order_idx = ? WHERE id = ?');
    const update = db.transaction((list) => {
      list.forEach((taskId, idx) => stmt.run(idx, taskId));
    });
    update(ids);
    return { ok: true };
  });

  ipcMain.handle('tasks:delete', (_, { id }) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (row) pushUndo('tasks:delete', { row });
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return { ok: true };
  });

  ipcMain.handle('tasks:rolloverFromYesterday', (_, { date }) => {
    const db = getDb();
    const d = date || today();
    const yesterday = prevDate(d);
    const undoneTasks = db
      .prepare("SELECT * FROM tasks WHERE date = ? AND done = 0")
      .all(yesterday);
    if (undoneTasks.length === 0) return { count: 0 };
    const maxRow = db
      .prepare('SELECT COALESCE(MAX(order_idx), -1) AS mx FROM tasks WHERE date = ?')
      .get(d);
    let order_idx = maxRow.mx + 1;
    const insert = db.prepare(
      'INSERT INTO tasks (date, title, done, priority, estimate_min, project, order_idx) VALUES (?, ?, 0, ?, ?, ?, ?)'
    );
    const insertAll = db.transaction((tasks) => {
      tasks.forEach((t) => {
        insert.run(d, t.title, t.priority, t.estimate_min, t.project, order_idx++);
      });
    });
    insertAll(undoneTasks);
    return { count: undoneTasks.length };
  });

  ipcMain.handle('tasks:completionRate', (_, { date }) => {
    const db = getDb();
    const d = date || today();
    const row = db
      .prepare(
        'SELECT COUNT(*) AS total, SUM(done) AS done FROM tasks WHERE date = ?'
      )
      .get(d);
    const total = row.total ?? 0;
    const done = row.done ?? 0;
    return { total, done, rate: total > 0 ? done / total : 0 };
  });

  ipcMain.handle('tasks:getStats', (_, a) =>
    computeTaskStats(getDb(), {
      from: a.from,
      to: a.to,
      today: a.today || new Date().toISOString().slice(0, 10),
    })
  );
}

// ── Pure helper: offset a date string by n days ─────────────────────────────
function offsetDate(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── computeTaskStats ─────────────────────────────────────────────────────────
function computeTaskStats(db, { from, to, today: todayDate }) {
  // Query per-day aggregates
  const rows = db
    .prepare(
      'SELECT date, COUNT(*) AS total, SUM(done) AS done FROM tasks WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date ASC'
    )
    .all(from, to);

  // Build days array with rates
  const days = rows.map((r) => {
    const total = r.total ?? 0;
    const done = Number(r.done ?? 0);
    return { date: r.date, total, done, rate: total > 0 ? done / total : 0 };
  });

  // Build a map for quick lookup
  const dayMap = new Map(days.map((d) => [d.date, d]));

  // ── current_streak ──────────────────────────────────────────────────────────
  // Walk backwards from today (or yesterday if today isn't cleared)
  function isCleared(date) {
    const d = dayMap.get(date);
    return d !== undefined && d.total > 0 && d.done === d.total;
  }

  let current_streak = 0;
  let cursor = todayDate;

  // If today is not cleared, start from yesterday
  if (!isCleared(cursor)) {
    cursor = offsetDate(cursor, -1);
  }

  // Walk backwards while consecutive days are cleared
  while (isCleared(cursor)) {
    current_streak++;
    cursor = offsetDate(cursor, -1);
  }

  // ── best_streak ─────────────────────────────────────────────────────────────
  // Longest run of consecutive calendar days that are cleared within days array
  let best_streak = 0;
  let runLen = 0;

  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (d.total > 0 && d.done === d.total) {
      // Check if this day is consecutive with previous
      if (i === 0) {
        runLen = 1;
      } else {
        const prevDate = days[i - 1].date;
        const expected = offsetDate(prevDate, 1);
        if (d.date === expected && days[i - 1].total > 0 && days[i - 1].done === days[i - 1].total) {
          runLen++;
        } else {
          runLen = 1;
        }
      }
      if (runLen > best_streak) best_streak = runLen;
    } else {
      runLen = 0;
    }
  }

  // ── week / last_week sums ───────────────────────────────────────────────────
  const weekStart = offsetDate(todayDate, -6);
  const lastWeekStart = offsetDate(todayDate, -13);
  const lastWeekEnd = offsetDate(todayDate, -7);

  let week_total = 0, week_done = 0;
  let last_week_total = 0, last_week_done = 0;

  for (const d of days) {
    if (d.date >= weekStart && d.date <= todayDate) {
      week_total += d.total;
      week_done += d.done;
    }
    if (d.date >= lastWeekStart && d.date <= lastWeekEnd) {
      last_week_total += d.total;
      last_week_done += d.done;
    }
  }

  // ── avg_completion_rate ─────────────────────────────────────────────────────
  const daysWithData = days.filter((d) => d.total > 0);
  const avg_completion_rate =
    daysWithData.length > 0
      ? daysWithData.reduce((sum, d) => sum + d.rate, 0) / daysWithData.length
      : 0;

  return {
    days,
    current_streak,
    best_streak,
    week_total,
    week_done,
    last_week_total,
    last_week_done,
    avg_completion_rate,
  };
}

module.exports = registerTasksIpc;
module.exports.computeTaskStats = computeTaskStats;
