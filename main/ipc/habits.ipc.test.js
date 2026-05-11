const Database = require('better-sqlite3');
const { computeHabitStats } = require('./habits.ipc');

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE habits (id INTEGER PRIMARY KEY, name TEXT, icon TEXT, color TEXT, target_per_week INTEGER DEFAULT 7, archived INTEGER DEFAULT 0, created_at TEXT);
    CREATE TABLE habit_logs (id INTEGER PRIMARY KEY, habit_id INTEGER, date TEXT, value INTEGER DEFAULT 1, UNIQUE(habit_id, date));
  `);
  return db;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

describe('computeHabitStats', () => {
  it('empty DB → all zeros', () => {
    const db = makeDb();
    db.prepare('INSERT INTO habits (name, target_per_week) VALUES (?, ?)').run('H1', 7);
    const habitId = db.prepare('SELECT id FROM habits').get().id;
    const stats = computeHabitStats(db, { habitId, today: '2025-03-15' });
    expect(stats.current_streak).toBe(0);
    expect(stats.longest_streak).toBe(0);
    expect(stats.checks_30d).toEqual([]);
    expect(stats.completion_rate_30d).toBe(0);
    expect(stats.on_track).toBe(false);
  });

  it('3 consecutive days ending today → current_streak=3, longest_streak=3', () => {
    const db = makeDb();
    db.prepare('INSERT INTO habits (name, target_per_week) VALUES (?, ?)').run('H2', 7);
    const habitId = db.prepare('SELECT id FROM habits').get().id;
    const today = '2025-03-15';
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, addDays(today, -2));
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, addDays(today, -1));
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, today);
    const stats = computeHabitStats(db, { habitId, today });
    expect(stats.current_streak).toBe(3);
    expect(stats.longest_streak).toBe(3);
  });

  it('gap in history → longest_streak counts best run (5), current_streak is shorter', () => {
    const db = makeDb();
    db.prepare('INSERT INTO habits (name, target_per_week) VALUES (?, ?)').run('H3', 7);
    const habitId = db.prepare('SELECT id FROM habits').get().id;
    const today = '2025-03-15';
    // 5-day run ending 10 days ago
    for (let i = 14; i >= 10; i--) {
      db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, addDays(today, -i));
    }
    // 2-day run ending yesterday (so current_streak = 2)
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, addDays(today, -1));
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, addDays(today, -2));
    const stats = computeHabitStats(db, { habitId, today });
    expect(stats.longest_streak).toBe(5);
    expect(stats.current_streak).toBe(2);
  });

  it('on_track===true when checks_this_week >= target_per_week', () => {
    const db = makeDb();
    db.prepare('INSERT INTO habits (name, target_per_week) VALUES (?, ?)').run('H4', 3);
    const habitId = db.prepare('SELECT id FROM habits').get().id;
    const today = '2025-03-15';
    // 3 checks this week (today, yesterday, 2 days ago)
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, today);
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, addDays(today, -1));
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, addDays(today, -2));
    const stats = computeHabitStats(db, { habitId, today });
    expect(stats.checks_this_week).toBe(3);
    expect(stats.on_track).toBe(true);
  });

  it('on_track===false when checks_this_week < target_per_week', () => {
    const db = makeDb();
    db.prepare('INSERT INTO habits (name, target_per_week) VALUES (?, ?)').run('H5', 5);
    const habitId = db.prepare('SELECT id FROM habits').get().id;
    const today = '2025-03-15';
    // only 2 checks this week
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, today);
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, addDays(today, -1));
    const stats = computeHabitStats(db, { habitId, today });
    expect(stats.checks_this_week).toBe(2);
    expect(stats.on_track).toBe(false);
  });

  it('today not checked, yesterday checked → current_streak=1', () => {
    const db = makeDb();
    db.prepare('INSERT INTO habits (name, target_per_week) VALUES (?, ?)').run('H_fallback', 7);
    const habitId = db.prepare('SELECT id FROM habits').get().id;
    const today = '2025-03-15';
    // Only yesterday is checked, not today
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, addDays(today, -1));
    const stats = computeHabitStats(db, { habitId, today });
    expect(stats.current_streak).toBe(1);
  });

  it('checks_prev_week counts correctly', () => {
    const db = makeDb();
    db.prepare('INSERT INTO habits (name, target_per_week) VALUES (?, ?)').run('H6', 7);
    const habitId = db.prepare('SELECT id FROM habits').get().id;
    const today = '2025-03-15';
    // prev week = days 7..13 ago → 4 checks
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, addDays(today, -7));
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, addDays(today, -9));
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, addDays(today, -11));
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, addDays(today, -13));
    // this week = 1 check
    db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habitId, today);
    const stats = computeHabitStats(db, { habitId, today });
    expect(stats.checks_prev_week).toBe(4);
    expect(stats.checks_this_week).toBe(1);
  });
});
