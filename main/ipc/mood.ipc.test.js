const Database = require('better-sqlite3');
const { computeMoodStats } = require('./mood.ipc');

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE mood_log (id INTEGER PRIMARY KEY, date TEXT UNIQUE, mood INTEGER, energy INTEGER, stress INTEGER, note TEXT, created_at TEXT)`);
  return db;
}

function offsetDate(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const TODAY = '2025-03-15';
const FROM  = offsetDate(TODAY, -29);

describe('computeMoodStats', () => {
  it('empty DB → days=[], all zeros/nulls, streaks=0', () => {
    const db = makeDb();
    const stats = computeMoodStats(db, { from: FROM, to: TODAY, today: TODAY });
    expect(stats.days).toEqual([]);
    expect(stats.logged_streak).toBe(0);
    expect(stats.best_logged_streak).toBe(0);
    expect(stats.days_logged_30d).toBe(0);
    expect(stats.avg_mood).toBeNull();
    expect(stats.avg_energy).toBeNull();
    expect(stats.avg_stress).toBeNull();
    expect(stats.week_avg_mood).toBeNull();
    expect(stats.last_week_avg_mood).toBeNull();
    expect(stats.best_day).toBeNull();
    expect(stats.worst_day).toBeNull();
  });

  it('3 consecutive days ending today → logged_streak===3', () => {
    const db = makeDb();
    const ins = db.prepare('INSERT INTO mood_log (date, mood, energy, stress) VALUES (?, ?, ?, ?)');
    ins.run(offsetDate(TODAY, -2), 5, 6, 3);
    ins.run(offsetDate(TODAY, -1), 6, 7, 2);
    ins.run(TODAY,                 7, 8, 1);
    const stats = computeMoodStats(db, { from: FROM, to: TODAY, today: TODAY });
    expect(stats.logged_streak).toBe(3);
  });

  it('gap in logs (today + 3 days ago, gap in between) → streak counts only recent run', () => {
    const db = makeDb();
    const ins = db.prepare('INSERT INTO mood_log (date, mood, energy, stress) VALUES (?, ?, ?, ?)');
    ins.run(offsetDate(TODAY, -3), 4, 5, 4);
    // day -2 and -1 are missing
    ins.run(TODAY,                 6, 7, 2);
    const stats = computeMoodStats(db, { from: FROM, to: TODAY, today: TODAY });
    expect(stats.logged_streak).toBe(1);
  });

  it('avg_mood computed only over days with non-null mood', () => {
    const db = makeDb();
    const ins = db.prepare('INSERT INTO mood_log (date, mood, energy, stress) VALUES (?, ?, ?, ?)');
    ins.run(offsetDate(TODAY, -2), 4,    null, null);
    ins.run(offsetDate(TODAY, -1), 6,    null, null);
    ins.run(TODAY,                 null, null, null);  // null mood — must be excluded
    const stats = computeMoodStats(db, { from: FROM, to: TODAY, today: TODAY });
    expect(stats.avg_mood).toBeCloseTo(5, 5);   // (4+6)/2
    expect(stats.avg_energy).toBeNull();
    expect(stats.avg_stress).toBeNull();
  });

  it('best_day has highest mood, worst_day has lowest mood', () => {
    const db = makeDb();
    const ins = db.prepare('INSERT INTO mood_log (date, mood, energy, stress) VALUES (?, ?, ?, ?)');
    ins.run(offsetDate(TODAY, -3), 3, 5, 5);
    ins.run(offsetDate(TODAY, -2), 8, 6, 2);
    ins.run(offsetDate(TODAY, -1), 5, 7, 3);
    const stats = computeMoodStats(db, { from: FROM, to: TODAY, today: TODAY });
    expect(stats.best_day).toEqual({ date: offsetDate(TODAY, -2), mood: 8 });
    expect(stats.worst_day).toEqual({ date: offsetDate(TODAY, -3), mood: 3 });
  });

  it('week_avg_mood covers last 7 days, last_week_avg_mood covers days 8-14', () => {
    const db = makeDb();
    const ins = db.prepare('INSERT INTO mood_log (date, mood, energy, stress) VALUES (?, ?, ?, ?)');
    // last 7 days: TODAY and 6 days before it
    ins.run(TODAY,                 6, 5, 3);
    ins.run(offsetDate(TODAY, -3), 4, 5, 4);
    ins.run(offsetDate(TODAY, -6), 8, 6, 2);
    // prev 7 days: days -7 to -13
    ins.run(offsetDate(TODAY, -7),  2, 4, 5);
    ins.run(offsetDate(TODAY, -10), 4, 5, 4);
    const stats = computeMoodStats(db, { from: offsetDate(TODAY, -29), to: TODAY, today: TODAY });
    // week avg = (6+4+8)/3
    expect(stats.week_avg_mood).toBeCloseTo((6 + 4 + 8) / 3, 5);
    // last week avg = (2+4)/2
    expect(stats.last_week_avg_mood).toBeCloseTo((2 + 4) / 2, 5);
  });

  it('best_logged_streak finds longest consecutive run in window', () => {
    const db = makeDb();
    const ins = db.prepare('INSERT INTO mood_log (date, mood, energy, stress) VALUES (?, ?, ?, ?)');
    // 5-day run ending 10 days ago
    for (let i = 14; i >= 10; i--) {
      ins.run(offsetDate(TODAY, -i), 5, 5, 5);
    }
    // 2-day run ending today
    ins.run(offsetDate(TODAY, -1), 6, 6, 2);
    ins.run(TODAY,                 7, 7, 1);
    const stats = computeMoodStats(db, { from: FROM, to: TODAY, today: TODAY });
    expect(stats.best_logged_streak).toBe(5);
    expect(stats.logged_streak).toBe(2);
  });

  it('logged_streak falls back to yesterday when today has no row', () => {
    const db = makeDb();
    const ins = db.prepare('INSERT INTO mood_log (date, mood, energy, stress) VALUES (?, ?, ?, ?)');
    ins.run(offsetDate(TODAY, -2), 5, 5, 3);
    ins.run(offsetDate(TODAY, -1), 6, 6, 2);
    // today has no row
    const stats = computeMoodStats(db, { from: FROM, to: TODAY, today: TODAY });
    expect(stats.logged_streak).toBe(2);
  });
});
