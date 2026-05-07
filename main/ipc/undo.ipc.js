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

      case 'focus:logManual':
        db.prepare('DELETE FROM focus_sessions WHERE id = ?').run(data.id);
        return { action, description: 'focus manual log' };

      case 'focus:deleteSession':
        db.prepare(`
          INSERT INTO focus_sessions (id, date, started_at, ended_at, duration_min, type, project, note, completed, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          data.row.id, data.row.date, data.row.started_at, data.row.ended_at,
          data.row.duration_min, data.row.type, data.row.project, data.row.note,
          data.row.completed, data.row.created_at
        );
        return { action, description: 'focus session delete' };

      case 'mood:upsert':
        if (data.old == null) {
          db.prepare('DELETE FROM mood_log WHERE date = ?').run(data.date);
        } else {
          db.prepare(`
            INSERT OR REPLACE INTO mood_log (date, mood, energy, stress, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(data.old.date, data.old.mood, data.old.energy, data.old.stress,
                 data.old.note, data.old.created_at);
        }
        return { action, description: 'mood entry' };

      case 'mood:delete':
        db.prepare(`
          INSERT OR REPLACE INTO mood_log (date, mood, energy, stress, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(data.row.date, data.row.mood, data.row.energy, data.row.stress,
               data.row.note, data.row.created_at);
        return { action, description: 'mood entry' };

      case 'workouts:endSession':
        db.prepare(`
          UPDATE workout_sessions
          SET ended_at = ?, duration_min = ?, calories_burned = ?, perceived_effort = ?, note = ?
          WHERE id = ?
        `).run(
          data.old_ended_at, data.old_duration_min, data.old_calories_burned,
          data.old_perceived_effort, data.old_note, data.id
        );
        // After restoring the session row:
        const prevCalories = data.old_calories_burned ?? 0;
        try {
          db.prepare('UPDATE daily_energy SET active_kcal = ? WHERE date = ?')
            .run(prevCalories, data.date);
        } catch (_) {}
        if (data.old_exercise_row) {
          db.prepare(`
            INSERT OR REPLACE INTO exercises
              (id, date, type, duration_min, calories_burned, notes, source, workout_session_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            data.old_exercise_row.id,
            data.old_exercise_row.date,
            data.old_exercise_row.type,
            data.old_exercise_row.duration_min,
            data.old_exercise_row.calories_burned,
            data.old_exercise_row.notes,
            data.old_exercise_row.source,
            data.old_exercise_row.workout_session_id ?? null
          );
          db.prepare('DELETE FROM exercise_sets WHERE exercise_id = ?').run(data.old_exercise_row.id);
          if (data.old_exercise_sets?.length) {
            const insertSet = db.prepare(`
              INSERT INTO exercise_sets (id, exercise_id, set_number, reps, weight_kg)
              VALUES (?, ?, ?, ?, ?)
            `);
            for (const set of data.old_exercise_sets) {
              insertSet.run(set.id, set.exercise_id, set.set_number, set.reps, set.weight_kg);
            }
          }
        } else {
          db.prepare('DELETE FROM exercises WHERE workout_session_id = ?').run(data.id);
        }
        return { action, description: 'workout session end' };

      case 'workouts:deleteSession':
        db.prepare(`
          INSERT INTO workout_sessions
            (id, date, plan_id, started_at, ended_at, duration_min, calories_burned, perceived_effort, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          data.row.id, data.row.date, data.row.plan_id,
          data.row.started_at, data.row.ended_at,
          data.row.duration_min, data.row.calories_burned,
          data.row.perceived_effort, data.row.note, data.row.created_at
        );
        if (data.sets && data.sets.length) {
          const insertSet = db.prepare(`
            INSERT INTO workout_exercise_sets
              (id, session_id, exercise_id, set_idx, reps, weight_kg, distance_km, duration_sec, rest_sec)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const s of data.sets) {
            insertSet.run(
              s.id, s.session_id, s.exercise_id, s.set_idx,
              s.reps, s.weight_kg, s.distance_km, s.duration_sec, s.rest_sec
            );
          }
        }
        if (data.exerciseRow) {
          db.prepare(`
            INSERT INTO exercises
              (id, date, type, duration_min, calories_burned, notes, source, workout_session_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            data.exerciseRow.id,
            data.exerciseRow.date,
            data.exerciseRow.type,
            data.exerciseRow.duration_min,
            data.exerciseRow.calories_burned,
            data.exerciseRow.notes,
            data.exerciseRow.source,
            data.exerciseRow.workout_session_id ?? null
          );
          if (data.exerciseSets?.length) {
            const insertExerciseSet = db.prepare(`
              INSERT INTO exercise_sets
                (id, exercise_id, set_number, reps, weight_kg)
              VALUES (?, ?, ?, ?, ?)
            `);
            for (const set of data.exerciseSets) {
              insertExerciseSet.run(set.id, set.exercise_id, set.set_number, set.reps, set.weight_kg);
            }
          }
        }
        return { action, description: 'workout session delete' };

      case 'workouts:removeSet':
        db.prepare(`
          INSERT INTO workout_exercise_sets
            (id, session_id, exercise_id, set_idx, reps, weight_kg, distance_km, duration_sec, rest_sec)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          data.row.id, data.row.session_id, data.row.exercise_id, data.row.set_idx,
          data.row.reps, data.row.weight_kg, data.row.distance_km,
          data.row.duration_sec, data.row.rest_sec
        );
        return { action, description: 'workout set remove' };

      default:
        return null;
    }
  });
}

module.exports = { registerUndoIpc, pushUndo };
