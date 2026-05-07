const { ipcMain } = require('electron');
const { getDb } = require('../db');

const LEVELS = [
  { min: 0,    level: 1, name: 'Principiante' },
  { min: 100,  level: 2, name: 'Esploratore' },
  { min: 300,  level: 3, name: 'Abitudinario' },
  { min: 600,  level: 4, name: 'Campione' },
  { min: 1000, level: 5, name: 'LifeMaster' },
];

function computeLevel(totalPoints) {
  let current = LEVELS[0];
  for (const l of LEVELS) { if (totalPoints >= l.min) current = l; }
  return current;
}

function checkAndUnlockAchievements(db, module, context) {
  const now = new Date().toISOString();
  const unlocked = [];

  const unlock = (key) => {
    const result = db.prepare(
      'UPDATE achievements SET unlocked_at = ? WHERE key = ? AND unlocked_at IS NULL'
    ).run(now, key);
    if (result.changes > 0) {
      unlocked.push(db.prepare('SELECT * FROM achievements WHERE key = ?').get(key));
    }
  };

  if (module === 'sleep') {
    const count = db.prepare('SELECT COUNT(*) as n FROM sleep_log').get().n;
    if (count >= 1) unlock('first_sleep');
    const qualityNights = db.prepare('SELECT COUNT(*) as n FROM sleep_log WHERE quality >= 4').get().n;
    if (qualityNights >= 5) unlock('sleep_quality');
    const last7 = db.prepare('SELECT duration_min FROM sleep_log ORDER BY date DESC LIMIT 7').all();
    if (last7.length === 7 && last7.every(r => r.duration_min && r.duration_min >= 420)) unlock('sleep_7_streak');
  }

  if (module === 'tasks') {
    const doneTasks = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE done = 1').get().n;
    if (doneTasks >= 1) unlock('first_task');
    if (doneTasks >= 50) unlock('task_master');
    if (context && context.date) {
      const row = db.prepare('SELECT COUNT(*) as total, SUM(done) as done FROM tasks WHERE date = ?').get(context.date);
      if (row.total > 0 && row.done === row.total) unlock('perfect_day');
    }
  }

  if (module === 'habits') {
    const habitCount = db.prepare('SELECT COUNT(*) as n FROM habits WHERE archived = 0').get().n;
    if (habitCount >= 1) unlock('first_habit');
    const habits = db.prepare('SELECT id FROM habits WHERE archived = 0').all();
    for (const h of habits) {
      const last7 = db.prepare(`SELECT date FROM habit_logs WHERE habit_id = ? ORDER BY date DESC LIMIT 7`).all(h.id);
      if (last7.length === 7) unlock('habit_7_streak');
      const last30 = db.prepare(`SELECT date FROM habit_logs WHERE habit_id = ? ORDER BY date DESC LIMIT 30`).all(h.id);
      if (last30.length === 30) unlock('habit_30_streak');
    }
  }

  if (module === 'focus') {
    const sessionCount = db.prepare('SELECT COUNT(*) as n FROM focus_sessions WHERE completed = 1').get().n;
    if (sessionCount >= 1) unlock('first_focus');
    if (context && context.date) {
      const row = db.prepare('SELECT COALESCE(SUM(duration_min), 0) as total_min FROM focus_sessions WHERE date = ? AND completed = 1').get(context.date);
      if (row.total_min >= 120) unlock('focus_2h');
    }
  }

  if (module === 'workouts') {
    const count = db.prepare('SELECT COUNT(*) as n FROM workout_sessions WHERE ended_at IS NOT NULL').get().n;
    if (count >= 1) unlock('first_workout');
    if (count >= 10) unlock('workout_10');
  }

  if (module === 'journal') {
    const count = db.prepare('SELECT COUNT(*) as n FROM mood_log').get().n;
    if (count >= 1) unlock('first_journal');
  }

  if (module === 'onboarding') {
    unlock('welcome');
  }

  if (module === 'section_streak') {
    const { section, streak } = context || {};
    if (section && streak) {
      if (streak >= 3)  unlock(`streak_3_${section}`);
      if (streak >= 7)  unlock(`streak_7_${section}`);
      if (streak >= 30) unlock(`streak_30_${section}`);
    }
  }

  return unlocked;
}

/**
 * Add points directly on the DB (no IPC round-trip).
 * Other IPC modules use this after updating streaks.
 */
function addPointsInternal(db, module, reason, points, context = {}) {
  const today = new Date().toISOString().slice(0, 10);
  db.prepare('INSERT INTO user_points (date, points, reason, module) VALUES (?, ?, ?, ?)').run(today, points, reason, module);
  const row = db.prepare('SELECT total_points FROM user_level WHERE id = 1').get();
  const newTotal = (row?.total_points || 0) + points;
  const lv = computeLevel(newTotal);
  db.prepare('UPDATE user_level SET total_points = ?, level = ?, level_name = ?, last_activity_date = ? WHERE id = 1')
    .run(newTotal, lv.level, lv.name, today);
  const newAchievements = checkAndUnlockAchievements(db, module, context);
  return { total_points: newTotal, level: lv, new_achievements: newAchievements };
}

function registerGamificationIpc() {
  ipcMain.handle('gamification:addPoints', (_, { module, reason, points, context }) => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    db.prepare('INSERT INTO user_points (date, points, reason, module) VALUES (?, ?, ?, ?)').run(today, points, reason, module);

    const { total_points } = db.prepare('SELECT total_points FROM user_level WHERE id = 1').get();
    const newTotal = total_points + points;
    const lv = computeLevel(newTotal);
    db.prepare('UPDATE user_level SET total_points = ?, level = ?, level_name = ?, last_activity_date = ? WHERE id = 1')
      .run(newTotal, lv.level, lv.name, today);

    const newAchievements = checkAndUnlockAchievements(db, module, context || {});

    return { total_points: newTotal, level: lv, new_achievements: newAchievements };
  });

  ipcMain.handle('gamification:getStatus', () => {
    const db = getDb();
    const status = db.prepare('SELECT * FROM user_level WHERE id = 1').get();
    const recentAchievements = db.prepare('SELECT * FROM achievements WHERE unlocked_at IS NOT NULL ORDER BY unlocked_at DESC LIMIT 3').all();
    const todayPoints = db.prepare('SELECT COALESCE(SUM(points), 0) as pts FROM user_points WHERE date = ?').get(new Date().toISOString().slice(0, 10)).pts;

    const currentLevel = LEVELS.find(l => l.level === (status?.level || 1)) || LEVELS[0];
    const nextLevel = LEVELS.find(l => l.level === (status?.level || 1) + 1);

    return {
      ...status,
      today_points: todayPoints,
      next_level_min: nextLevel?.min ?? null,
      recent_achievements: recentAchievements,
    };
  });

  ipcMain.handle('gamification:getAchievements', () => {
    return getDb().prepare('SELECT * FROM achievements ORDER BY unlocked_at DESC NULLS LAST, id ASC').all();
  });

  ipcMain.handle('gamification:getWeekPoints', () => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT date, SUM(points) as total_points, GROUP_CONCAT(reason) as reasons
      FROM user_points
      WHERE date >= date('now', '-7 days')
      GROUP BY date ORDER BY date ASC
    `).all();
    return rows;
  });

  ipcMain.handle('section_streaks:getAll', () => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM section_streaks').all();
    const bySection = {};
    for (const r of rows) bySection[r.section] = r;
    const today = new Date().toISOString().slice(0, 10);
    return ['sleep', 'diet', 'focus', 'workout'].map(section => ({
      section,
      current_streak:       bySection[section]?.current_streak ?? 0,
      longest_streak:       bySection[section]?.longest_streak ?? 0,
      last_completed_date:  bySection[section]?.last_completed_date ?? null,
      completed_today:      bySection[section]?.last_completed_date === today,
    }));
  });
}

module.exports = { registerGamificationIpc: registerGamificationIpc, addPointsInternal };

