const { ipcMain } = require('electron');
const { getDb } = require('../db');
const { pushUndo } = require('./undo.ipc');
const { updateSectionStreak } = require('./streak-utils');
const { addPointsInternal } = require('./gamification.ipc');

const today = () => new Date().toISOString().slice(0, 10);

function registerFocusIpc() {
  // ── Start a session ─────────────────────────────────────────────────────────
  ipcMain.handle('focus:startSession', (_, { type = 'pomodoro', project = null, note = null } = {}) => {
    const db = getDb();
    const d = today();
    const result = db.prepare(`
      INSERT INTO focus_sessions (date, started_at, ended_at, duration_min, type, project, note, completed)
      VALUES (?, datetime('now'), NULL, 0, ?, ?, ?, 0)
    `).run(d, type, project, note);
    const row = db.prepare('SELECT id, started_at FROM focus_sessions WHERE id = ?').get(result.lastInsertRowid);
    return row;
  });

  // ── Stop a session ──────────────────────────────────────────────────────────
  ipcMain.handle('focus:stopSession', (_, { id, duration_min }) => {
    const db = getDb();
    db.prepare(`
      UPDATE focus_sessions
      SET ended_at = datetime('now'), duration_min = ?, completed = 1
      WHERE id = ?
    `).run(duration_min, id);
    const session = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id);

    if (duration_min >= 10) {
      try {
        const d = session?.date || today();
        const { streak, isNew, milestone, milestonePoints } = updateSectionStreak(db, 'focus', d);
        if (isNew) {
          addPointsInternal(db, 'section_streak', 'streak_daily_focus', 5, { section: 'focus', streak });
          if (milestone) {
            addPointsInternal(db, 'section_streak', `streak_${milestone}_focus`, milestonePoints, { section: 'focus', streak });
          }
        }
      } catch (_) {}
    }

    return session;
  });

  // ── Log manual session ──────────────────────────────────────────────────────
  ipcMain.handle('focus:logManual', (_, { date, duration_min, project = null, note = null }) => {
    const db = getDb();
    const d = date || today();
    const result = db.prepare(`
      INSERT INTO focus_sessions (date, started_at, ended_at, duration_min, type, project, note, completed)
      VALUES (?, ?, datetime(?), ?, 'manual', ?, ?, 1)
    `).run(d, d + 'T00:00:00', d + 'T00:00:00', duration_min, project, note);
    const id = result.lastInsertRowid;
    pushUndo('focus:logManual', { id });

    if (duration_min >= 10) {
      try {
        const { streak, isNew, milestone, milestonePoints } = updateSectionStreak(db, 'focus', d);
        if (isNew) {
          addPointsInternal(db, 'section_streak', 'streak_daily_focus', 5, { section: 'focus', streak });
          if (milestone) {
            addPointsInternal(db, 'section_streak', `streak_${milestone}_focus`, milestonePoints, { section: 'focus', streak });
          }
        }
      } catch (_) {}
    }

    return { id };
  });

  // ── Delete session ──────────────────────────────────────────────────────────
  ipcMain.handle('focus:deleteSession', (_, { id }) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id);
    if (row) pushUndo('focus:deleteSession', { row });
    db.prepare('DELETE FROM focus_sessions WHERE id = ?').run(id);
    return { ok: true };
  });

  // ── Day stats ───────────────────────────────────────────────────────────────
  ipcMain.handle('focus:getDayStats', (_, { date }) => {
    const db = getDb();
    const d = date || today();
    const sessions = db.prepare('SELECT * FROM focus_sessions WHERE date = ? ORDER BY started_at ASC').all(d);
    const completed = sessions.filter(s => s.completed === 1);
    const total_min = completed.reduce((acc, s) => acc + (s.duration_min || 0), 0);
    return {
      sessions,
      total_min,
      total_sessions: sessions.length,
      completed_sessions: completed.length,
    };
  });

  // ── Week stats ──────────────────────────────────────────────────────────────
  ipcMain.handle('focus:getWeekStats', (_, { from, to }) => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        date,
        SUM(CASE WHEN completed = 1 THEN duration_min ELSE 0 END) AS total_min,
        COUNT(*) AS sessions
      FROM focus_sessions
      WHERE date >= ? AND date <= ?
      GROUP BY date
      ORDER BY date ASC
    `).all(from, to);
    return rows;
  });

  // ── Get active session ──────────────────────────────────────────────────────
  ipcMain.handle('focus:getActiveSession', () => {
    const db = getDb();
    return db.prepare("SELECT * FROM focus_sessions WHERE completed = 0 AND ended_at IS NULL LIMIT 1").get() || null;
  });
}

module.exports = registerFocusIpc;
