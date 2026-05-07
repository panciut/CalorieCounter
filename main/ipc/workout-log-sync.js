function getWorkoutSessionLabel(db, session) {
  if (session.plan_id != null) {
    const plan = db.prepare('SELECT name FROM workout_plans WHERE id = ?').get(session.plan_id);
    if (plan?.name) return plan.name;
  }
  return 'Workout Session';
}

function syncWorkoutSessionToExerciseLog(db, sessionId) {
  const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(sessionId);
  if (!session || !session.ended_at) return null;

  const label = getWorkoutSessionLabel(db, session);
  const existing = db.prepare('SELECT id FROM exercises WHERE workout_session_id = ?').get(sessionId);

  let exerciseId;
  if (existing) {
    exerciseId = existing.id;
    db.prepare(`
      UPDATE exercises
      SET date = ?, type = ?, duration_min = ?, calories_burned = ?, notes = ?, source = 'workout_session'
      WHERE id = ?
    `).run(
      session.date,
      label,
      session.duration_min || 0,
      session.calories_burned || 0,
      session.note || null,
      exerciseId,
    );
    db.prepare('DELETE FROM exercise_sets WHERE exercise_id = ?').run(exerciseId);
  } else {
    const result = db.prepare(`
      INSERT INTO exercises (date, type, duration_min, calories_burned, notes, source, workout_session_id)
      VALUES (?, ?, ?, ?, ?, 'workout_session', ?)
    `).run(
      session.date,
      label,
      session.duration_min || 0,
      session.calories_burned || 0,
      session.note || null,
      sessionId,
    );
    exerciseId = result.lastInsertRowid;
  }

  const sessionSets = db.prepare(`
    SELECT * FROM workout_exercise_sets
    WHERE session_id = ?
    ORDER BY set_idx ASC, id ASC
  `).all(sessionId);

  if (sessionSets.length) {
    const insertSet = db.prepare(`
      INSERT INTO exercise_sets (exercise_id, set_number, reps, weight_kg)
      VALUES (?, ?, ?, ?)
    `);
    sessionSets.forEach((set, index) => {
      insertSet.run(exerciseId, index + 1, set.reps ?? null, set.weight_kg ?? null);
    });
  }

  return exerciseId;
}

function deleteWorkoutSessionExerciseLog(db, sessionId) {
  db.prepare('DELETE FROM exercises WHERE workout_session_id = ?').run(sessionId);
}

function getExerciseLogEntriesWithWorkoutSessions(db, baseRows, startDate, endDate) {
  const rows = [...baseRows];
  const syncedSessionIds = new Set(
    rows
      .map(row => row.workout_session_id)
      .filter(id => id != null),
  );

  const sessions = db.prepare(`
    SELECT * FROM workout_sessions
    WHERE date BETWEEN ? AND ?
      AND ended_at IS NOT NULL
    ORDER BY date ASC, id ASC
  `).all(startDate, endDate);

  for (const session of sessions) {
    if (syncedSessionIds.has(session.id)) continue;
    rows.push({
      id: -session.id,
      date: session.date,
      type: getWorkoutSessionLabel(db, session),
      duration_min: session.duration_min || 0,
      calories_burned: session.calories_burned || 0,
      notes: session.note,
      source: 'workout_session',
      workout_session_id: session.id,
      sets: [],
    });
  }

  return rows;
}

module.exports = {
  syncWorkoutSessionToExerciseLog,
  deleteWorkoutSessionExerciseLog,
  getExerciseLogEntriesWithWorkoutSessions,
};
