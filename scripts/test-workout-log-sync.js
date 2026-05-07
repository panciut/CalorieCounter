const assert = require('assert');
const Database = require('better-sqlite3');

const {
  syncWorkoutSessionToExerciseLog,
  getExerciseLogEntriesWithWorkoutSessions,
} = require('../main/ipc/workout-log-sync');

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE workout_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );

    CREATE TABLE workout_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      plan_id INTEGER,
      started_at TEXT,
      ended_at TEXT,
      duration_min INTEGER,
      calories_burned INTEGER,
      perceived_effort INTEGER,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE workout_exercise_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      exercise_id INTEGER,
      set_idx INTEGER DEFAULT 0,
      reps INTEGER,
      weight_kg REAL,
      distance_km REAL,
      duration_sec INTEGER,
      rest_sec INTEGER
    );

    CREATE TABLE exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      duration_min REAL NOT NULL DEFAULT 0,
      calories_burned REAL NOT NULL DEFAULT 0,
      notes TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      workout_session_id INTEGER
    );

    CREATE UNIQUE INDEX idx_exercises_workout_session_id
      ON exercises(workout_session_id)
      WHERE workout_session_id IS NOT NULL;

    CREATE TABLE exercise_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL,
      set_number INTEGER NOT NULL,
      reps INTEGER,
      weight_kg REAL
    );
  `);
  return db;
}

function testSyncCreatesAndUpdatesExerciseLogRow() {
  const db = createDb();
  const planId = db.prepare('INSERT INTO workout_plans (name) VALUES (?)').run('Upper A').lastInsertRowid;
  const sessionId = db.prepare(`
    INSERT INTO workout_sessions (date, plan_id, started_at, ended_at, duration_min, calories_burned, perceived_effort, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('2026-05-07', planId, '2026-05-07T10:00:00Z', '2026-05-07T11:00:00Z', 55, 430, 8, 'felt strong').lastInsertRowid;

  db.prepare(`
    INSERT INTO workout_exercise_sets (session_id, exercise_id, set_idx, reps, weight_kg)
    VALUES
    (?, 11, 10, 8, 60),
    (?, 11, 20, 6, 65)
  `).run(sessionId, sessionId);

  syncWorkoutSessionToExerciseLog(db, sessionId);

  const exercise = db.prepare('SELECT * FROM exercises WHERE workout_session_id = ?').get(sessionId);
  assert.ok(exercise, 'expected synced exercise row');
  assert.equal(exercise.type, 'Upper A');
  assert.equal(exercise.duration_min, 55);
  assert.equal(exercise.calories_burned, 430);
  assert.equal(exercise.notes, 'felt strong');
  assert.equal(exercise.source, 'workout_session');

  const sets = db.prepare('SELECT set_number, reps, weight_kg FROM exercise_sets WHERE exercise_id = ? ORDER BY set_number').all(exercise.id);
  assert.deepEqual(sets, [
    { set_number: 1, reps: 8, weight_kg: 60 },
    { set_number: 2, reps: 6, weight_kg: 65 },
  ]);

  db.prepare('UPDATE workout_sessions SET duration_min = ?, calories_burned = ?, note = ? WHERE id = ?').run(60, 470, 'updated', sessionId);
  db.prepare('DELETE FROM workout_exercise_sets WHERE session_id = ?').run(sessionId);
  db.prepare('INSERT INTO workout_exercise_sets (session_id, exercise_id, set_idx, reps, weight_kg) VALUES (?, 11, 30, 12, 40)').run(sessionId);

  syncWorkoutSessionToExerciseLog(db, sessionId);

  const updatedExercise = db.prepare('SELECT * FROM exercises WHERE workout_session_id = ?').get(sessionId);
  assert.equal(updatedExercise.id, exercise.id, 'should update existing row instead of inserting a duplicate');
  assert.equal(updatedExercise.duration_min, 60);
  assert.equal(updatedExercise.calories_burned, 470);
  assert.equal(updatedExercise.notes, 'updated');

  const updatedSets = db.prepare('SELECT set_number, reps, weight_kg FROM exercise_sets WHERE exercise_id = ? ORDER BY set_number').all(exercise.id);
  assert.deepEqual(updatedSets, [
    { set_number: 1, reps: 12, weight_kg: 40 },
  ]);
}

function testLegacyFallbackOnlyReturnsUnsyncedSessions() {
  const db = createDb();
  const syncedId = db.prepare(`
    INSERT INTO workout_sessions (date, ended_at, duration_min, calories_burned, note)
    VALUES (?, ?, ?, ?, ?)
  `).run('2026-05-07', '2026-05-07T11:00:00Z', 45, 300, 'synced').lastInsertRowid;
  const legacyId = db.prepare(`
    INSERT INTO workout_sessions (date, ended_at, duration_min, calories_burned, note)
    VALUES (?, ?, ?, ?, ?)
  `).run('2026-05-07', '2026-05-07T12:00:00Z', 30, 180, 'legacy').lastInsertRowid;

  db.prepare(`
    INSERT INTO exercises (date, type, duration_min, calories_burned, notes, source, workout_session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('2026-05-07', 'Workout Session', 45, 300, 'synced', 'workout_session', syncedId);

  const rows = getExerciseLogEntriesWithWorkoutSessions(
    db,
    db.prepare('SELECT * FROM exercises WHERE date = ? ORDER BY id').all('2026-05-07'),
    '2026-05-07',
    '2026-05-07',
  );

  assert.equal(rows.length, 2);
  assert.equal(rows.filter(r => r.workout_session_id === syncedId).length, 1, 'synced session should not be duplicated');

  const legacy = rows.find(r => r.id === -legacyId);
  assert.ok(legacy, 'expected fallback row for legacy unsynced session');
  assert.equal(legacy.source, 'workout_session');
  assert.equal(legacy.notes, 'legacy');
}

function main() {
  testSyncCreatesAndUpdatesExerciseLogRow();
  testLegacyFallbackOnlyReturnsUnsyncedSessions();
  console.log('workout log sync tests passed');
}

main();
