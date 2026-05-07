const { ipcMain } = require('electron');
const { getDb } = require('../db');
const { getExerciseLogEntriesWithWorkoutSessions, deleteWorkoutSessionExerciseLog, syncWorkoutSessionToExerciseLog } = require('./workout-log-sync');

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

function withSets(db, exercises) {
  if (!exercises.length) return exercises;
  const ids = exercises.map(e => e.id);
  const sets = db.prepare(
    `SELECT * FROM exercise_sets WHERE exercise_id IN (${ids.map(()=>'?').join(',')}) ORDER BY exercise_id, set_number`
  ).all(...ids);
  const setMap = {};
  for (const s of sets) {
    if (!setMap[s.exercise_id]) setMap[s.exercise_id] = [];
    setMap[s.exercise_id].push(s);
  }
  return exercises.map(e => ({ ...e, sets: setMap[e.id] || [] }));
}

function registerExercisesIpc() {
  ipcMain.handle('exercises:getDay', (_, { date }) => {
    const db = getDb();
    const d = date || localDate();
    const rows = db.prepare('SELECT * FROM exercises WHERE date = ? ORDER BY id').all(d);
    return withSets(db, getExerciseLogEntriesWithWorkoutSessions(db, rows, d, d));
  });

  ipcMain.handle('exercises:getRange', (_, { startDate, endDate }) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM exercises WHERE date BETWEEN ? AND ? ORDER BY date, id').all(startDate, endDate);
    return withSets(db, getExerciseLogEntriesWithWorkoutSessions(db, rows, startDate, endDate));
  });

  ipcMain.handle('exercises:add', (_, { date, type, duration_min, calories_burned, notes, sets }) => {
    const db = getDb();
    const d = date || localDate();
    const result = db.transaction(() => {
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO exercises (date, type, duration_min, calories_burned, notes, source) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(d, type, duration_min || 0, calories_burned || 0, notes || null, 'manual');
      if (sets && sets.length) {
        const ins = db.prepare('INSERT INTO exercise_sets (exercise_id, set_number, reps, weight_kg) VALUES (?, ?, ?, ?)');
        sets.forEach((s, i) => ins.run(lastInsertRowid, i + 1, s.reps || null, s.weight_kg || null));
      }
      return { id: lastInsertRowid };
    })();
    
    // Update streak for workouts based on this exercise logging
    try {
      const minDur = duration_min || 0;
      if (minDur >= 10) { // arbitrary sensible threshold for a single exercise to count as workout
        const { streak, isNew, milestone, milestonePoints } = require('./streak-utils').updateSectionStreak(db, 'workout', d);
        if (isNew) {
          try {
            const { addPointsInternal } = require('./gamification.ipc.js');
            addPointsInternal(db, 'section_streak', 'streak_daily_workout', 5, { section: 'workout', streak });
            if (milestone) addPointsInternal(db, 'section_streak', `streak_${milestone}_workout`, milestonePoints, { section: 'workout', streak });
          } catch (_) {}
        }
      }
    } catch (_) {}

    return result;
  });

  ipcMain.handle('exercises:update', (_, { id, type, duration_min, calories_burned, notes }) => {
    const db = getDb();
    const row = id < 0
      ? db.prepare('SELECT * FROM exercises WHERE workout_session_id = ?').get(-id)
      : db.prepare('SELECT * FROM exercises WHERE id = ?').get(id);

    if (id < 0) {
      db.prepare(
        'UPDATE workout_sessions SET duration_min=?, calories_burned=?, note=? WHERE id=?'
      ).run(duration_min, calories_burned, notes || null, -id);
      syncWorkoutSessionToExerciseLog(db, -id);
    } else if (row?.workout_session_id != null) {
      db.prepare(
        'UPDATE workout_sessions SET duration_min=?, calories_burned=?, note=? WHERE id=?'
      ).run(duration_min, calories_burned, notes || null, row.workout_session_id);
      syncWorkoutSessionToExerciseLog(db, row.workout_session_id);
    } else {
      db.prepare(
        'UPDATE exercises SET type=?, duration_min=?, calories_burned=?, notes=? WHERE id=?'
      ).run(type, duration_min, calories_burned, notes || null, id);
    }
    return { ok: true };
  });

  ipcMain.handle('exercises:delete', (_, { id }) => {
    const db = getDb();
    if (id < 0) {
      deleteWorkoutSessionExerciseLog(db, -id);
      db.prepare('DELETE FROM workout_sessions WHERE id = ?').run(-id);
    } else {
      const row = db.prepare('SELECT workout_session_id FROM exercises WHERE id = ?').get(id);
      if (row?.workout_session_id != null) {
        deleteWorkoutSessionExerciseLog(db, row.workout_session_id);
        db.prepare('DELETE FROM workout_sessions WHERE id = ?').run(row.workout_session_id);
      } else {
        db.prepare('DELETE FROM exercises WHERE id = ?').run(id);
      }
    }
    return { ok: true };
  });

  ipcMain.handle('exercises:getTypes', () =>
    getDb().prepare('SELECT * FROM exercise_types ORDER BY category, name').all()
  );

  ipcMain.handle('exercises:addType', (_, { name, met_value, category, muscle_groups, equipment, instructions }) => {
    const { lastInsertRowid } = getDb().prepare(
      'INSERT INTO exercise_types (name, met_value, category, muscle_groups, equipment, instructions, is_custom) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).run(name, met_value || 5.0, category || 'other', muscle_groups || '', equipment || '', instructions || null);
    return { id: lastInsertRowid };
  });

  ipcMain.handle('exercises:updateType', (_, { id, name, met_value, category, muscle_groups, equipment, instructions }) => {
    getDb().prepare(
      'UPDATE exercise_types SET name=?, met_value=?, category=?, muscle_groups=?, equipment=?, instructions=? WHERE id=?'
    ).run(name, met_value || 5.0, category || 'other', muscle_groups || '', equipment || '', instructions || null, id);
    return { ok: true };
  });

  ipcMain.handle('exercises:deleteType', (_, { id }) => {
    const db = getDb();
    const type = db.prepare('SELECT name, is_custom FROM exercise_types WHERE id=?').get(id);
    if (!type) return { ok: false, reason: 'not_found' };
    const inUse = db.prepare('SELECT COUNT(*) as n FROM exercises WHERE type=?').get(type.name);
    if (inUse.n > 0) return { ok: false, reason: 'in_use' };
    db.prepare('DELETE FROM exercise_types WHERE id=?').run(id);
    return { ok: true };
  });

  // Equipment management
  ipcMain.handle('exercises:getEquipment', () =>
    getDb().prepare('SELECT * FROM equipment ORDER BY is_custom, name').all()
  );

  ipcMain.handle('exercises:addEquipment', (_, { name }) => {
    const { lastInsertRowid } = getDb().prepare(
      'INSERT INTO equipment (name, is_custom) VALUES (?, 1)'
    ).run(name);
    return { id: lastInsertRowid };
  });

  ipcMain.handle('exercises:deleteEquipment', (_, { id }) => {
    const db = getDb();
    const item = db.prepare('SELECT is_custom FROM equipment WHERE id=?').get(id);
    if (!item) return { ok: false, reason: 'not_found' };
    if (!item.is_custom) return { ok: false, reason: 'builtin' };
    db.prepare('DELETE FROM equipment WHERE id=?').run(id);
    return { ok: true };
  });

  // Estimate calories burned using MET formula: kcal = MET * weight_kg * (duration_min / 60)
  ipcMain.handle('exercises:estimate', (_, { type, duration_min, weight_kg }) => {
    const db = getDb();
    const et = db.prepare('SELECT met_value FROM exercise_types WHERE name = ?').get(type);
    const met = et ? et.met_value : 5.0;
    const calories = Math.round(met * weight_kg * (duration_min / 60));
    return { calories };
  });
}

module.exports = registerExercisesIpc;
