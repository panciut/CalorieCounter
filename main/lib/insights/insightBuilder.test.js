const Database = require('better-sqlite3');
const { mulberry32 } = require('./stats');
const { buildInsights, pickOfDay } = require('./insightBuilder');

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE foods (id INTEGER PRIMARY KEY, name TEXT, calories REAL, protein REAL, carbs REAL, fat REAL, fiber REAL DEFAULT 0);
    CREATE TABLE log (id INTEGER PRIMARY KEY, date TEXT, food_id INTEGER, grams REAL, meal TEXT DEFAULT 'Lunch', status TEXT DEFAULT 'logged');
    CREATE TABLE sleep_log (id INTEGER PRIMARY KEY, date TEXT UNIQUE, bedtime TEXT, wake_time TEXT, duration_min INTEGER, quality INTEGER, factors TEXT, note TEXT);
    CREATE TABLE mood_log (id INTEGER PRIMARY KEY, date TEXT UNIQUE, mood INTEGER, energy INTEGER, stress INTEGER, note TEXT);
    CREATE TABLE daily_energy (date TEXT PRIMARY KEY, resting_kcal REAL DEFAULT 0, active_kcal REAL DEFAULT 0, extra_kcal REAL DEFAULT 0, steps INTEGER DEFAULT 0);
    CREATE TABLE weight_log (id INTEGER PRIMARY KEY, date TEXT UNIQUE, weight REAL);
    CREATE TABLE water_log (id INTEGER PRIMARY KEY, date TEXT, ml REAL);
    CREATE TABLE habits (id INTEGER PRIMARY KEY, name TEXT, archived INTEGER DEFAULT 0);
    CREATE TABLE habit_logs (id INTEGER PRIMARY KEY, habit_id INTEGER, date TEXT, value INTEGER DEFAULT 1, UNIQUE(habit_id, date));
    CREATE TABLE tasks (id INTEGER PRIMARY KEY, date TEXT, title TEXT, done INTEGER DEFAULT 0);
    CREATE TABLE focus_sessions (id INTEGER PRIMARY KEY, date TEXT, duration_min INTEGER DEFAULT 0, completed INTEGER DEFAULT 1);
    CREATE TABLE workout_sessions (id INTEGER PRIMARY KEY, date TEXT, duration_min INTEGER, perceived_effort INTEGER);
    CREATE TABLE exercises (id INTEGER PRIMARY KEY, date TEXT, duration_min REAL DEFAULT 0, calories_burned REAL DEFAULT 0);
    CREATE TABLE food_day_reliability (date TEXT PRIMARY KEY, level TEXT, source TEXT DEFAULT 'manual', updated_at TEXT);
  `);
  return db;
}
const SETTINGS = { enabled: true, useNutrition: true, includeApproxDays: false, minPairN: 21, fdrQ: 0.10, sleepTargetMin: 480, windowDays: 90 };

describe('buildInsights', () => {
  it('cold start: returns dataQuality with tierUnlocked 0 and no tier-3 insights', () => {
    const db = makeDb();
    db.prepare("INSERT INTO mood_log (date,mood,energy,stress) VALUES ('2025-01-01',3,3,3)").run();
    const { insights, dataQuality } = buildInsights(db, { windowDays: 90, settings: SETTINGS, today: '2025-01-02' });
    expect(dataQuality.tierUnlocked).toBe(0);
    expect(insights.every(i => i.tier < 3)).toBe(true);
  });

  it('produces a ranked, structured insight when an injected pattern exists', () => {
    const db = makeDb();
    const rng = mulberry32(123);
    let d = new Date('2025-01-01T00:00:00Z');
    for (let i = 0; i < 60; i++) {
      const date = d.toISOString().slice(0, 10);
      const sleepMin = 360 + Math.round(rng() * 180);
      const mood = Math.max(1, Math.min(5, Math.round(1 + (sleepMin - 360) / 180 * 4 + (rng() - 0.5))));
      db.prepare("INSERT INTO sleep_log (date,bedtime,wake_time,duration_min,quality) VALUES (?,?,?,?,?)").run(date, '23:00', '07:00', sleepMin, 3);
      db.prepare("INSERT INTO mood_log (date,mood,energy,stress) VALUES (?,?,?,?)").run(date, mood, 3, 3);
      d = new Date(d.getTime() + 86400000);
    }
    const today = d.toISOString().slice(0, 10);
    const { insights } = buildInsights(db, { windowDays: 90, settings: SETTINGS, today });
    const assoc = insights.find(i => i.type === 'association' && i.subject === 'sleepMin~mood');
    expect(assoc).toBeTruthy();
    expect(assoc.tier).toBe(3);
    expect(assoc.text).toBeTruthy();
    expect(typeof assoc.score).toBe('number');
    expect(insights[0].score).toBeGreaterThanOrEqual(insights[insights.length - 1].score); // sorted desc
  });

  it('respects the master switch', () => {
    const db = makeDb();
    const { insights } = buildInsights(db, { windowDays: 90, settings: { ...SETTINGS, enabled: false }, today: '2025-01-02' });
    expect(insights).toEqual([]);
  });

  it('Tier-2 path runs without error with sufficient data', () => {
    const db = makeDb();
    for (let i = 0; i < 15; i++) {
      const date = `2025-01-${String(i + 1).padStart(2, '0')}`;
      db.prepare("INSERT INTO mood_log (date,mood,energy,stress) VALUES (?,?,?,?)").run(date, 3, 3, 3);
      db.prepare("INSERT INTO sleep_log (date,bedtime,wake_time,duration_min,quality) VALUES (?,?,?,?,?)").run(date, '23:00', '07:00', 450, 3);
    }
    const { insights, dataQuality } = buildInsights(db, { windowDays: 90, settings: SETTINGS, today: '2025-01-16' });
    expect(Array.isArray(insights)).toBe(true);
    expect(dataQuality.daysWithAnyData).toBeGreaterThanOrEqual(10);
  });
});

describe('pickOfDay', () => {
  it('is deterministic for an epoch day and rotates', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(pickOfDay(list, 0).id).toBe('a');
    expect(pickOfDay(list, 1).id).toBe('b');
    expect(pickOfDay(list, 3).id).toBe('a');
    expect(pickOfDay([], 5)).toBe(null);
  });
});

describe('buildInsights — new types', () => {
  it('produces milestone insight when habit streak is present', () => {
    const db = makeDb();
    db.prepare("INSERT INTO habits (name) VALUES ('test_habit')").run();
    for (let i = 0; i < 10; i++) {
      const date = `2025-01-${String(i + 1).padStart(2, '0')}`;
      db.prepare("INSERT INTO habit_logs (habit_id, date, value) VALUES (1, ?, 1)").run(date);
      db.prepare("INSERT INTO mood_log (date,mood,energy,stress) VALUES (?,?,?,?)").run(date, 3, 3, 3);
    }
    const today = '2025-01-11';
    const { insights } = buildInsights(db, { windowDays: 90, settings: SETTINGS, today });
    const milestone = insights.find(i => i.type === 'milestone' && i.subject === 'habit_streak_7');
    expect(milestone).toBeTruthy();
    expect(milestone.tier).toBe(0);
    expect(milestone.severity).toBe('strong');
  });

  it('produces explained_trend or trend for mood when sleep data exists', () => {
    const db = makeDb();
    const rng = mulberry32(123);
    let d = new Date('2025-01-01T00:00:00Z');
    for (let i = 0; i < 60; i++) {
      const date = d.toISOString().slice(0, 10);
      const sleepMin = 360 + Math.round(rng() * 180);
      const mood = Math.max(1, Math.min(5, Math.round(1 + i * 0.04 + (sleepMin - 360) / 180 * 2 + (rng() - 0.5))));
      db.prepare("INSERT INTO sleep_log (date,bedtime,wake_time,duration_min,quality) VALUES (?,?,?,?,?)").run(date, '23:00', '07:00', sleepMin, 3);
      db.prepare("INSERT INTO mood_log (date,mood,energy,stress) VALUES (?,?,?,?)").run(date, mood, 3, 3);
      d = new Date(d.getTime() + 86400000);
    }
    const today = d.toISOString().slice(0, 10);
    const { insights } = buildInsights(db, { windowDays: 90, settings: SETTINGS, today });
    const moodTrend = insights.find(i => (i.type === 'trend' || i.type === 'explained_trend') && i.subject === 'mood');
    expect(moodTrend).toBeTruthy();
    const assoc = insights.find(i => i.type === 'association');
    expect(assoc).toBeTruthy();
    expect(Array.isArray(assoc.evidence.points)).toBe(true);
  });
});
