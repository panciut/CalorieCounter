const MILESTONE_POINTS = { 3: 15, 7: 25, 14: 50, 30: 100, 60: 200, 100: 500 };
const MILESTONES = Object.keys(MILESTONE_POINTS).map(Number);

function dateAddDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Mark a section as completed for a date.
 * Idempotent — safe to call multiple times for the same (section, date).
 * @returns {{ streak: number, isNew: boolean, milestone: number|null, milestonePoints: number }}
 */
function updateSectionStreak(db, section, date) {
  const row = db.prepare('SELECT * FROM section_streaks WHERE section = ?').get(section);

  if (row?.last_completed_date === date) {
    return { streak: row.current_streak, isNew: false, milestone: null, milestonePoints: 0 };
  }

  db.prepare('INSERT OR IGNORE INTO section_streak_log(section, date) VALUES(?,?)').run(section, date);

  const yesterday = dateAddDays(date, -1);
  const newStreak = row?.last_completed_date === yesterday
    ? (row.current_streak || 0) + 1
    : 1;

  const longest = Math.max(newStreak, row?.longest_streak || 0);

  db.prepare(`
    INSERT OR REPLACE INTO section_streaks(section, current_streak, longest_streak, last_completed_date, updated_at)
    VALUES(?,?,?,?,datetime('now'))
  `).run(section, newStreak, longest, date);

  const milestone = MILESTONES.find(m => newStreak === m) ?? null;
  const milestonePoints = milestone ? MILESTONE_POINTS[milestone] : 0;

  return { streak: newStreak, isNew: true, milestone, milestonePoints };
}

module.exports = { updateSectionStreak, dateAddDays };
