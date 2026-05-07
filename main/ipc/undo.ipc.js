const { ipcMain } = require('electron');
const { getDb } = require('../db');

function pushUndo(action, data) {
  const db = getDb();
  db.prepare('INSERT INTO undo_stack (action, data) VALUES (?, ?)').run(action, JSON.stringify(data));
  db.prepare('DELETE FROM undo_stack WHERE id NOT IN (SELECT id FROM undo_stack ORDER BY id DESC LIMIT 20)').run();
}

function registerUndoIpc() {
  ipcMain.handle('undo:pop', () => {
    const db = getDb();
    const entry = db.prepare('SELECT * FROM undo_stack ORDER BY id DESC LIMIT 1').get();
    if (!entry) return null;

    db.prepare('DELETE FROM undo_stack WHERE id = ?').run(entry.id);
    const data = JSON.parse(entry.data);
    const action = entry.action;

    switch (action) {
      case 'log:add':
        db.prepare('DELETE FROM log WHERE id = ?').run(data.id);
        return { action, description: 'log entry' };

      case 'log:delete':
        db.prepare('INSERT INTO log (date, food_id, grams, meal) VALUES (?, ?, ?, ?)').run(data.date, data.food_id, data.grams, data.meal);
        return { action, description: 'log entry' };

      case 'water:add':
        db.prepare('DELETE FROM water_log WHERE id = ?').run(data.id);
        return { action, description: 'water entry' };

      case 'water:delete':
        db.prepare('INSERT INTO water_log (date, ml) VALUES (?, ?)').run(data.date, data.ml);
        return { action, description: 'water entry' };

      case 'weight:add':
        db.prepare('DELETE FROM weight_log WHERE id = ?').run(data.id);
        return { action, description: 'weight entry' };

      case 'weight:delete':
        db.prepare('INSERT INTO weight_log (date, weight) VALUES (?, ?)').run(data.date, data.weight);
        return { action, description: 'weight entry' };

      case 'weight:update':
        db.prepare(`
          UPDATE weight_log
          SET date = ?, weight = ?, fat_pct = ?, muscle_mass = ?, water_pct = ?, bone_mass = ?, scale_id = ?
          WHERE id = ?
        `).run(data.date, data.weight, data.fat_pct, data.muscle_mass, data.water_pct, data.bone_mass, data.scale_id, data.id);
        return { action, description: 'weight entry' };

      case 'sleep:upsert':
        if (data.old == null) {
          db.prepare('DELETE FROM sleep_log WHERE date = ?').run(data.date);
        } else {
          db.prepare(`
            INSERT OR REPLACE INTO sleep_log (date, bedtime, wake_time, duration_min, quality, factors, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(data.old.date, data.old.bedtime, data.old.wake_time, data.old.duration_min,
                 data.old.quality, data.old.factors, data.old.note, data.old.created_at);
        }
        return { action, description: 'sleep entry' };

      case 'sleep:delete':
        db.prepare(`
          INSERT OR REPLACE INTO sleep_log (date, bedtime, wake_time, duration_min, quality, factors, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(data.row.date, data.row.bedtime, data.row.wake_time, data.row.duration_min,
               data.row.quality, data.row.factors, data.row.note, data.row.created_at);
        return { action, description: 'sleep entry' };

      case 'tasks:toggle':
        db.prepare('UPDATE tasks SET done = ?, done_at = ? WHERE id = ?').run(
          data.old_done, data.old_done_at, data.id
        );
        return { action, description: 'task toggle' };

      case 'tasks:update':
        db.prepare(
          'UPDATE tasks SET title = ?, priority = ?, estimate_min = ?, project = ? WHERE id = ?'
        ).run(data.old_title, data.old_priority, data.old_estimate_min, data.old_project, data.id);
        return { action, description: 'task update' };

      case 'tasks:delete':
        db.prepare(
          'INSERT INTO tasks (id, date, title, done, priority, estimate_min, project, order_idx, created_at, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          data.row.id, data.row.date, data.row.title, data.row.done,
          data.row.priority, data.row.estimate_min, data.row.project,
          data.row.order_idx, data.row.created_at, data.row.done_at
        );
        return { action, description: 'task delete' };

      case 'habits:check':
        db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?').run(data.habit_id, data.date);
        return { action, description: 'habit check' };

      case 'habits:uncheck':
        db.prepare('INSERT OR IGNORE INTO habit_logs (habit_id, date, value) VALUES (?, ?, 1)').run(data.habit_id, data.date);
        return { action, description: 'habit uncheck' };

      case 'habits:delete':
        db.prepare(
          'INSERT INTO habits (id, name, icon, color, target_per_week, archived, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(
          data.row.id, data.row.name, data.row.icon, data.row.color,
          data.row.target_per_week, data.row.archived, data.row.created_at
        );
        if (data.logs && data.logs.length) {
          const insertLog = db.prepare('INSERT OR IGNORE INTO habit_logs (habit_id, date, value) VALUES (?, ?, ?)');
          for (const log of data.logs) {
            insertLog.run(log.habit_id, log.date, log.value);
          }
        }
        return { action, description: 'habit delete' };

      default:
        return null;
    }
  });
}

module.exports = { registerUndoIpc, pushUndo };
