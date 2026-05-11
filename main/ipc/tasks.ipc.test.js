const Database = require('better-sqlite3');
const { computeTaskStats } = require('./tasks.ipc');

function makeDb() {
  const db = new Database(':memory:');
  db.exec(
    `CREATE TABLE tasks (
      id INTEGER PRIMARY KEY,
      date TEXT,
      title TEXT,
      done INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 0,
      estimate_min INTEGER,
      project TEXT,
      order_idx INTEGER DEFAULT 0,
      created_at TEXT,
      done_at TEXT
    )`
  );
  return db;
}

function insertTask(db, date, done) {
  db.prepare(
    'INSERT INTO tasks (date, title, done) VALUES (?, ?, ?)'
  ).run(date, 'task', done ? 1 : 0);
}

function offsetDate(base, n) {
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const TODAY = '2026-05-11';
const YESTERDAY = offsetDate(TODAY, -1);

describe('computeTaskStats', () => {
  test('1. empty DB returns days=[], all zeros, streaks=0', () => {
    const db = makeDb();
    const result = computeTaskStats(db, {
      from: offsetDate(TODAY, -13),
      to: TODAY,
      today: TODAY,
    });
    expect(result.days).toEqual([]);
    expect(result.current_streak).toBe(0);
    expect(result.best_streak).toBe(0);
    expect(result.week_total).toBe(0);
    expect(result.week_done).toBe(0);
    expect(result.last_week_total).toBe(0);
    expect(result.last_week_done).toBe(0);
    expect(result.avg_completion_rate).toBe(0);
  });

  test('2. today: 2 tasks both done → current_streak === 1', () => {
    const db = makeDb();
    insertTask(db, TODAY, true);
    insertTask(db, TODAY, true);
    const result = computeTaskStats(db, {
      from: offsetDate(TODAY, -13),
      to: TODAY,
      today: TODAY,
    });
    expect(result.current_streak).toBe(1);
  });

  test('3. today: 1/2 done (not cleared) → current_streak === 0', () => {
    const db = makeDb();
    insertTask(db, TODAY, true);
    insertTask(db, TODAY, false);
    const result = computeTaskStats(db, {
      from: offsetDate(TODAY, -13),
      to: TODAY,
      today: TODAY,
    });
    expect(result.current_streak).toBe(0);
  });

  test('4. yesterday fully cleared, today no tasks → current_streak === 1', () => {
    const db = makeDb();
    insertTask(db, YESTERDAY, true);
    insertTask(db, YESTERDAY, true);
    const result = computeTaskStats(db, {
      from: offsetDate(TODAY, -13),
      to: TODAY,
      today: TODAY,
    });
    expect(result.current_streak).toBe(1);
  });

  test('5. week_done and week_total sum correctly over last 7 days', () => {
    const db = makeDb();
    // 3 tasks today: 2 done, 1 not
    insertTask(db, TODAY, true);
    insertTask(db, TODAY, true);
    insertTask(db, TODAY, false);
    // 2 tasks 3 days ago: 1 done
    const d3 = offsetDate(TODAY, -3);
    insertTask(db, d3, true);
    insertTask(db, d3, false);
    // 1 task 8 days ago (outside last 7, inside last_week window)
    const d8 = offsetDate(TODAY, -8);
    insertTask(db, d8, true);

    const result = computeTaskStats(db, {
      from: offsetDate(TODAY, -13),
      to: TODAY,
      today: TODAY,
    });
    expect(result.week_total).toBe(5);   // 3 + 2
    expect(result.week_done).toBe(3);    // 2 + 1
    expect(result.last_week_total).toBe(1); // 1 task 8 days ago
    expect(result.last_week_done).toBe(1);
  });

  test('6. avg_completion_rate is mean of rates over days with total > 0', () => {
    const db = makeDb();
    // Day A: 2/2 done → rate 1.0
    insertTask(db, TODAY, true);
    insertTask(db, TODAY, true);
    // Day B (yesterday): 1/2 done → rate 0.5
    insertTask(db, YESTERDAY, true);
    insertTask(db, YESTERDAY, false);

    const result = computeTaskStats(db, {
      from: offsetDate(TODAY, -13),
      to: TODAY,
      today: TODAY,
    });
    // avg = (1.0 + 0.5) / 2 = 0.75
    expect(result.avg_completion_rate).toBeCloseTo(0.75);
  });
});
