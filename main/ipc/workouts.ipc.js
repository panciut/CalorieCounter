const { ipcMain } = require('electron');
const { getDb } = require('../db');
const { pushUndo } = require('./undo.ipc');
const { updateSectionStreak } = require('./streak-utils');
const { addPointsInternal } = require('./gamification.ipc');
const { syncWorkoutSessionToExerciseLog, deleteWorkoutSessionExerciseLog } = require('./workout-log-sync');

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Recompute daily_energy.active_kcal as the SUM of calories_burned over all
 * workout_sessions on that date. This is additive across multiple sessions
 * (morning run + evening lift contribute both) and self-healing on
 * delete/update — we always re-derive from the source of truth.
 *
 * Manual edits to active_kcal from the Balance widget will be overwritten the
 * next time a workout session is ended/updated on that day. Free-form activity
 * outside workouts belongs in extra_kcal.
 */
function updateDailyEnergyWorkout(db, date /* unused arg kept for call-site compat */, _calories_burned) {
  // Source of truth: the `exercises` mirror table. It already aggregates
  //   - quick logs (exercises:add, source='manual')
  //   - workout sessions (synced via syncWorkoutSessionToExerciseLog)
  //   - auto-sessions created from schedule ticks (same sync path)
  // Summing from `exercises` therefore covers every entry point without
  // double-counting workout_sessions that were already mirrored.
  const row = db.prepare(`
    SELECT COALESCE(SUM(calories_burned), 0) AS total
    FROM exercises
    WHERE date = ?
  `).get(date);
  const total = row?.total ?? 0;

  db.prepare(`
    INSERT INTO daily_energy (date, resting_kcal, active_kcal, extra_kcal, steps)
    VALUES (?, 0, ?, 0, 0)
    ON CONFLICT(date) DO UPDATE SET
      active_kcal = excluded.active_kcal
  `).run(date, total);
}

/**
 * Estimate kcal burned for a workout session using MET formula.
 * kcal = MET × weight_kg × (duration_min / 60)
 *
 * MET is averaged over the distinct exercise_types logged in the session's sets.
 * Weight is read from the latest weight_log entry (fallback 70 kg, same as goals_tdee).
 * Returns null if duration is missing or non-positive.
 */
function estimateSessionKcal(db, sessionId, durationMin) {
  if (!durationMin || durationMin <= 0) return null;

  const weightRow = db.prepare('SELECT weight FROM weight_log ORDER BY date DESC LIMIT 1').get();
  const weightKg = weightRow ? weightRow.weight : 70;

  const metRows = db.prepare(`
    SELECT DISTINCT et.met_value
    FROM workout_exercise_sets s
    LEFT JOIN exercise_types et ON et.id = s.exercise_id
    WHERE s.session_id = ? AND et.met_value IS NOT NULL
  `).all(sessionId);

  const metAvg = metRows.length
    ? metRows.reduce((a, r) => a + r.met_value, 0) / metRows.length
    : 5.0;

  return Math.round(metAvg * weightKg * (durationMin / 60));
}

function getSessionWithSets(db, id) {
  const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(id);
  if (!session) return null;
  const sets = db.prepare('SELECT * FROM workout_exercise_sets WHERE session_id = ? ORDER BY set_idx ASC').all(id);
  return { ...session, sets };
}

// ── ISO week helpers ──────────────────────────────────────────────────────────

function getISOWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function offsetDate(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function adjacentWeek(weekStr, n) {
  const [yearStr, wStr] = weekStr.split('-W');
  const year = parseInt(yearStr);
  const week = parseInt(wStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7 + n * 7);
  return getISOWeek(targetMonday.toISOString().slice(0, 10));
}

// ── computeWorkoutStats ───────────────────────────────────────────────────────

function computeWorkoutStats(db, { from, to, today: todayStr }) {
  // 1. days array
  const days = db.prepare(`
    SELECT date,
      COALESCE(SUM(duration_min), 0)    AS duration_min,
      COALESCE(SUM(calories_burned), 0) AS calories_burned,
      COUNT(*)                           AS sessions
    FROM workout_sessions
    WHERE date >= ? AND date <= ?
    GROUP BY date
    ORDER BY date ASC
  `).all(from, to);

  // 2. streak (weekly)
  const weekSet = new Set(days.map(d => getISOWeek(d.date)));
  const todayWeek = getISOWeek(todayStr);

  let current_streak = 0;
  let w = todayWeek;
  while (weekSet.has(w)) { current_streak++; w = adjacentWeek(w, -1); }

  const sortedWeeks = [...weekSet].sort();
  let best_streak = 0, run = 0;
  for (let i = 0; i < sortedWeeks.length; i++) {
    if (i === 0 || adjacentWeek(sortedWeeks[i - 1], 1) === sortedWeeks[i]) {
      run++;
    } else {
      run = 1;
    }
    best_streak = Math.max(best_streak, run);
  }

  // 3. rolling 7-day windows
  const d7start = offsetDate(todayStr, -6);   // last 7 days: [today-6 .. today]
  const d14start = offsetDate(todayStr, -13); // days 8-14:   [today-13 .. today-7]
  const d14end = offsetDate(todayStr, -7);

  let week_sessions = 0, last_week_sessions = 0;
  let week_min = 0, last_week_min = 0;
  let total_min_30d = 0, sessions_30d = 0;

  for (const row of days) {
    total_min_30d += row.duration_min;
    sessions_30d += row.sessions;
    if (row.date >= d7start && row.date <= todayStr) {
      week_sessions += row.sessions;
      week_min += row.duration_min;
    }
    if (row.date >= d14start && row.date <= d14end) {
      last_week_sessions += row.sessions;
      last_week_min += row.duration_min;
    }
  }

  // 4. by_exercise
  const by_exercise = db.prepare(`
    SELECT e.id AS exercise_id, e.name,
           COUNT(DISTINCT s.id) AS sessions,
           COUNT(wes.id) AS total_sets,
           COALESCE(SUM(CASE WHEN wes.reps IS NOT NULL AND wes.weight_kg IS NOT NULL THEN wes.reps * wes.weight_kg ELSE 0 END), 0) AS total_volume_kg,
           COALESCE(MAX(wes.weight_kg), 0) AS best_weight_kg,
           COALESCE(MAX(CASE WHEN wes.reps IS NOT NULL AND wes.weight_kg IS NOT NULL THEN wes.weight_kg * (1 + wes.reps / 30.0) ELSE NULL END), 0) AS best_est_1rm_kg
    FROM workout_sessions s
    JOIN workout_exercise_sets wes ON wes.session_id = s.id
    JOIN exercise_types e ON e.id = wes.exercise_id
    WHERE s.date >= ? AND s.date <= ?
    GROUP BY e.id, e.name
    ORDER BY total_volume_kg DESC
    LIMIT 8
  `).all(from, to);

  return {
    days,
    current_streak,
    best_streak,
    week_sessions,
    last_week_sessions,
    week_min,
    last_week_min,
    total_min_30d,
    sessions_30d,
    by_exercise,
  };
}

function registerWorkoutsIpc() {
  // ── workouts:startSession ─────────────────────────────────────────────────
  ipcMain.handle('workouts:startSession', (_, { date, plan_id, note } = {}) => {
    const db = getDb();
    const d = date || today();
    const result = db.prepare(`
      INSERT INTO workout_sessions (date, plan_id, started_at, ended_at, note)
      VALUES (?, ?, datetime('now'), NULL, ?)
    `).run(d, plan_id ?? null, note ?? null);
    const row = db.prepare('SELECT id, started_at FROM workout_sessions WHERE id = ?').get(result.lastInsertRowid);
    return { id: row.id, started_at: row.started_at };
  });

  // ── workouts:endSession ───────────────────────────────────────────────────
  ipcMain.handle('workouts:endSession', (_, { id, duration_min, calories_burned, perceived_effort, note } = {}) => {
    const db = getDb();
    const before = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(id);
    if (!before) return { ok: false };
    const syncedExercise = db.prepare('SELECT * FROM exercises WHERE workout_session_id = ?').get(id);
    const syncedSets = syncedExercise
      ? db.prepare('SELECT * FROM exercise_sets WHERE exercise_id = ? ORDER BY set_number ASC, id ASC').all(syncedExercise.id)
      : [];

    pushUndo('workouts:endSession', {
      id,
      old_ended_at:       before.ended_at,
      old_duration_min:   before.duration_min,
      old_calories_burned:before.calories_burned,
      old_perceived_effort:before.perceived_effort,
      old_note:           before.note,
      date:               before.date,
      old_exercise_row:   syncedExercise || null,
      old_exercise_sets:  syncedSets,
    });

    // Auto-estimate kcal from MET × weight × duration when caller didn't provide it.
    let finalCalories = calories_burned;
    if (finalCalories == null) {
      finalCalories = estimateSessionKcal(db, id, duration_min);
    }

    db.prepare(`
      UPDATE workout_sessions
      SET ended_at = datetime('now'),
          duration_min     = ?,
          calories_burned  = ?,
          perceived_effort = ?,
          note             = ?
      WHERE id = ?
    `).run(
      duration_min     ?? null,
      finalCalories    ?? null,
      perceived_effort ?? null,
      note             ?? before.note,
      id
    );

    syncWorkoutSessionToExerciseLog(db, id);

    // Push kcal into daily_energy.active_kcal (auto-estimated or manual).
    if (finalCalories != null) {
      updateDailyEnergyWorkout(db, before.date, finalCalories);
    }

    const minDur = duration_min ?? 0;
    if (minDur >= 20) {
      try {
        const { streak, isNew, milestone, milestonePoints } = updateSectionStreak(db, 'workout', before.date);
        if (isNew) {
          addPointsInternal(db, 'section_streak', 'streak_daily_workout', 5, { section: 'workout', streak });
          if (milestone) {
            addPointsInternal(db, 'section_streak', `streak_${milestone}_workout`, milestonePoints, { section: 'workout', streak });
          }
        }
      } catch (_) {}
    }

    return getSessionWithSets(db, id);
  });

  // ── workouts:addSet ───────────────────────────────────────────────────────
  ipcMain.handle('workouts:addSet', (_, { session_id, exercise_id, set_idx, reps, weight_kg, distance_km, duration_sec, rest_sec } = {}) => {
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO workout_exercise_sets
        (session_id, exercise_id, set_idx, reps, weight_kg, distance_km, duration_sec, rest_sec)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session_id,
      exercise_id  ?? null,
      set_idx      ?? 0,
      reps         ?? null,
      weight_kg    ?? null,
      distance_km  ?? null,
      duration_sec ?? null,
      rest_sec     ?? null
    );
    return { id: result.lastInsertRowid };
  });

  // ── workouts:removeSet ────────────────────────────────────────────────────
  ipcMain.handle('workouts:removeSet', (_, { id } = {}) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM workout_exercise_sets WHERE id = ?').get(id);
    if (row) pushUndo('workouts:removeSet', { row });
    db.prepare('DELETE FROM workout_exercise_sets WHERE id = ?').run(id);
    return { ok: true };
  });

  // ── workouts:getSession ───────────────────────────────────────────────────
  ipcMain.handle('workouts:getSession', (_, { id } = {}) => {
    const db = getDb();
    return getSessionWithSets(db, id);
  });

  // ── workouts:getDaySessions ───────────────────────────────────────────────
  ipcMain.handle('workouts:getDaySessions', (_, { date } = {}) => {
    const db = getDb();
    const d = date || today();
    const sessions = db.prepare('SELECT * FROM workout_sessions WHERE date = ? ORDER BY started_at ASC').all(d);
    return sessions.map(s => {
      const sets = db.prepare('SELECT * FROM workout_exercise_sets WHERE session_id = ? ORDER BY set_idx ASC').all(s.id);
      return { ...s, sets };
    });
  });

  // ── workouts:getActiveSession ─────────────────────────────────────────────
  ipcMain.handle('workouts:getActiveSession', () => {
    const db = getDb();
    const session = db.prepare('SELECT * FROM workout_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get();
    if (!session) return null;
    const sets = db.prepare('SELECT * FROM workout_exercise_sets WHERE session_id = ? ORDER BY set_idx ASC').all(session.id);
    return { ...session, sets };
  });

  // ── workouts:getWeekStats ─────────────────────────────────────────────────
  ipcMain.handle('workouts:getWeekStats', (_, { from, to } = {}) => {
    const db = getDb();
    return db.prepare(`
      SELECT
        date,
        COALESCE(SUM(duration_min), 0)    AS duration_min,
        COALESCE(SUM(calories_burned), 0) AS calories_burned,
        COUNT(*)                           AS sessions
      FROM workout_sessions
      WHERE date >= ? AND date <= ?
      GROUP BY date
      ORDER BY date ASC
    `).all(from, to);
  });

  // ── workouts:getStats ─────────────────────────────────────────────────────
  ipcMain.handle('workouts:getStats', (_, a) =>
    computeWorkoutStats(getDb(), {
      from: a.from,
      to: a.to,
      today: a.today || new Date().toISOString().slice(0, 10),
    })
  );

  // ── workouts:saveAsTemplate ───────────────────────────────────────────────
  ipcMain.handle('workouts:saveAsTemplate', (_, { session_id, name } = {}) => {
    const db = getDb();
    const sets = db.prepare(
      'SELECT * FROM workout_exercise_sets WHERE session_id = ? ORDER BY set_idx ASC'
    ).all(session_id);
    if (!sets.length) return { ok: false, error: 'no_sets' };

    // Deduplicate exercises by exercise_id, preserving first-occurrence order
    const seen = new Set();
    const exercises = [];
    for (const s of sets) {
      if (s.exercise_id && !seen.has(s.exercise_id)) {
        seen.add(s.exercise_id);
        const repsForEx = sets.filter(x => x.exercise_id === s.exercise_id).map(x => x.reps).filter(Boolean);
        const weightsForEx = sets.filter(x => x.exercise_id === s.exercise_id).map(x => x.weight_kg).filter(Boolean);
        exercises.push({
          exercise_type_id: s.exercise_id,
          sort_order: exercises.length,
          target_sets: sets.filter(x => x.exercise_id === s.exercise_id).length,
          target_reps: repsForEx.length ? Math.round(repsForEx.reduce((a, b) => a + b, 0) / repsForEx.length) : null,
          target_weight_kg: weightsForEx.length ? Math.max(...weightsForEx) : null,
        });
      }
    }

    return db.transaction(() => {
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO workout_plans (name, description) VALUES (?, ?)'
      ).run(name || 'Template', null);
      const ins = db.prepare(
        'INSERT INTO workout_plan_exercises (plan_id, exercise_type_id, sort_order, target_sets, target_reps, target_duration_min, target_weight_kg, rest_sec, is_optional, superset_group, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const ex of exercises) {
        ins.run(lastInsertRowid, ex.exercise_type_id, ex.sort_order, ex.target_sets, ex.target_reps, null, ex.target_weight_kg, null, 0, null, null);
      }
      return { ok: true, id: lastInsertRowid };
    })();
  });

  // ── workouts:deleteSession ────────────────────────────────────────────────
  ipcMain.handle('workouts:getMuscleActivity', (_, { from, to } = {}) => {
    const db = getDb();
    const map = new Map(); // muscle -> { sets, lastDate, score }

    const windowDays = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;

    function addContrib(mg, date, count) {
      const daysAgo = Math.round((new Date(to) - new Date(date)) / 86400000);
      // Linear recency weight: today=1, last day of window~0 (heuristic)
      const w = Math.max(0, (windowDays - daysAgo) / windowDays);
      for (const token of mg.split(',').map(s => s.trim()).filter(Boolean)) {
        const prev = map.get(token) ?? { sets: 0, lastDate: null, score: 0 };
        map.set(token, {
          sets: prev.sets + count,
          lastDate: !prev.lastDate || date > prev.lastDate ? date : prev.lastDate,
          score: prev.score + count * w,
        });
      }
    }

    // Sessions model
    for (const row of db.prepare(`
      SELECT et.muscle_groups AS mg, ws.date AS d
      FROM workout_exercise_sets s
      JOIN workout_sessions ws ON ws.id = s.session_id
      JOIN exercise_types et ON et.id = s.exercise_id
      WHERE ws.date >= ? AND ws.date <= ? AND et.muscle_groups <> ''
    `).all(from, to)) {
      addContrib(row.mg, row.d, 1);
    }

    // Legacy model (exclude rows already counted via sessions)
    for (const row of db.prepare(`
      SELECT et.muscle_groups AS mg, e.date AS d,
             MAX(1, (SELECT COUNT(*) FROM exercise_sets es WHERE es.exercise_id = e.id)) AS nsets
      FROM exercises e
      JOIN exercise_types et ON et.name = e.type
      WHERE e.date >= ? AND e.date <= ? AND et.muscle_groups <> ''
        AND (e.workout_session_id IS NULL)
    `).all(from, to)) {
      addContrib(row.mg, row.d, row.nsets);
    }

    return Array.from(map, ([muscle, v]) => ({ muscle, ...v }))
      .sort((a, b) => b.score - a.score);
  });

  ipcMain.handle('workouts:deleteSession', (_, { id } = {}) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(id);
    if (!row) return { ok: false };
    const sets = db.prepare('SELECT * FROM workout_exercise_sets WHERE session_id = ?').all(id);
    const exerciseRow = db.prepare('SELECT * FROM exercises WHERE workout_session_id = ?').get(id);
    const exerciseSets = exerciseRow
      ? db.prepare('SELECT * FROM exercise_sets WHERE exercise_id = ? ORDER BY set_number ASC, id ASC').all(exerciseRow.id)
      : [];
    pushUndo('workouts:deleteSession', { row, sets, exerciseRow: exerciseRow || null, exerciseSets });
    deleteWorkoutSessionExerciseLog(db, id);
    db.prepare('DELETE FROM workout_sessions WHERE id = ?').run(id);
    updateDailyEnergyWorkout(db, row.date);
    return { ok: true };
  });
}

module.exports = registerWorkoutsIpc;
module.exports.computeWorkoutStats = computeWorkoutStats;
