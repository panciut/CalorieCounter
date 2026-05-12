import { useState, useEffect } from 'react';
import { useT } from '../i18n/useT';
import { useSettings } from '../hooks/useSettings';
import { api } from '../api';
import { today } from '../lib/dateUtil';
import type { Habit, HabitWeekStat, LogEntry, SleepEntry, MoodEntry } from '../types';

const SPRING = 'cubic-bezier(0.16,1,0.3,1)';

interface Props { onDone: () => void; }

export default function EveningCheckin({ onDone }: Props) {
  const { t } = useT();
  const { settings } = useSettings();
  const todayStr = today();

  const [caloriesLogged, setCaloriesLogged] = useState<number | null>(null);
  const [sleep, setSleep] = useState<SleepEntry | null | undefined>(undefined);
  const [habitsDone, setHabitsDone] = useState<number | null>(null);
  const [habitsTotal, setHabitsTotal] = useState<number | null>(null);
  const [closingMood, setClosingMood] = useState(3);
  const [existingMood, setExistingMood] = useState<MoodEntry | null>(null);

  const calTarget = settings.cal_rec ?? Math.round(((settings.cal_min ?? 1800) + (settings.cal_max ?? 2200)) / 2);
  const sleepTarget = settings.insights_sleep_target_min ?? 480;

  useEffect(() => {
    // Calories
    api.log.getDay(todayStr).then((entries: LogEntry[]) => {
      const total = entries
        .filter(e => e.status === 'logged')
        .reduce((s, e) => s + e.calories, 0);
      setCaloriesLogged(Math.round(total));
    }).catch(() => setCaloriesLogged(null));

    // Sleep
    api.sleep.get(todayStr).then(s => setSleep(s)).catch(() => setSleep(null));

    // Habits
    Promise.all([api.habits.list(), api.habits.getWeekStats(todayStr)]).then(([list, stats]) => {
      const active = list.filter((h: Habit) => !h.archived);
      const done = stats.filter((s: HabitWeekStat) =>
        s.checks?.some(c => c.date === todayStr && c.done)
      ).length;
      setHabitsTotal(active.length);
      setHabitsDone(done);
    }).catch(() => {});

    // Existing mood for merge
    api.mood.get(todayStr).then(m => {
      setExistingMood(m);
      if (m?.mood) setClosingMood(m.mood);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDone() {
    try {
      await api.mood.upsert({
        date: todayStr,
        mood: closingMood,
        energy: existingMood?.energy ?? closingMood,
        stress: existingMood?.stress ?? 3,
        note: existingMood?.note ?? '',
      });
    } catch (_) {}
    onDone();
  }

  const btnPrimary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '14px 32px', borderRadius: 99,
    background: 'var(--fb-amber)', color: '#000',
    border: 0, fontSize: 15, fontWeight: 700,
    cursor: 'pointer', letterSpacing: 0.2, width: '100%',
    boxShadow: '0 4px 20px color-mix(in srgb, var(--fb-amber) 35%, transparent)',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 0', borderBottom: '1px solid var(--fb-border)',
  };

  const calDelta = caloriesLogged != null ? caloriesLogged - calTarget : null;
  const sleepMin = sleep?.duration_min ?? null;
  const sleepDelta = sleepMin != null ? sleepMin - sleepTarget : null;

  function fmtMin(m: number) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${h}h ${min}m`;
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--fb-bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'absolute', top: '-15%', left: '50%',
        transform: 'translateX(-50%)',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, color-mix(in srgb, var(--fb-accent) 6%, transparent) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Skip */}
      <button
        onClick={onDone}
        style={{
          position: 'absolute', top: 20, right: 20,
          background: 'none', border: 0,
          color: 'var(--fb-text-3)', fontSize: 13, cursor: 'pointer',
          padding: '6px 10px',
        }}
      >
        {t('checkin.skip')}
      </button>

      <div style={{
        position: 'relative', width: '100%', maxWidth: 480,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '60px 24px 40px', overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 24, animation: `slideIn 280ms ${SPRING}` }}>

          <h2 style={{
            fontFamily: 'var(--font-serif)', fontStyle: 'italic',
            fontSize: 30, fontWeight: 400, color: 'var(--fb-text)',
            letterSpacing: -0.5, margin: '0 0 4px', textAlign: 'center',
          }}>
            {t('checkin.evening.title')}
          </h2>

          {/* Recap rows */}
          <div style={{ background: 'var(--fb-card)', border: '1px solid var(--fb-border)', borderRadius: 16, padding: '4px 20px' }}>

            {/* Calories */}
            <div style={rowStyle}>
              <span style={{ fontSize: 14, color: 'var(--fb-text-2)' }}>{t('checkin.evening.calories')}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: calDelta != null && Math.abs(calDelta) > 100 ? 'var(--fb-warn, #ff9800)' : 'var(--fb-success, #4caf50)' }}>
                {caloriesLogged != null ? `${caloriesLogged} / ${calTarget} kcal` : '—'}
                {calDelta != null && ` (${calDelta > 0 ? '+' : ''}${calDelta})`}
              </span>
            </div>

            {/* Sleep */}
            <div style={rowStyle}>
              <span style={{ fontSize: 14, color: 'var(--fb-text-2)' }}>{t('checkin.evening.sleep')}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: sleepDelta != null && sleepDelta < -30 ? 'var(--fb-warn, #ff9800)' : 'var(--fb-success, #4caf50)' }}>
                {sleep === undefined ? '…' : sleepMin != null ? `${fmtMin(sleepMin)} / ${fmtMin(sleepTarget)}` : t('checkin.evening.sleepNotLogged')}
              </span>
            </div>

            {/* Habits */}
            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <span style={{ fontSize: 14, color: 'var(--fb-text-2)' }}>{t('checkin.evening.habits')}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fb-text)' }}>
                {habitsDone != null && habitsTotal != null ? `${habitsDone} / ${habitsTotal}` : '—'}
              </span>
            </div>
          </div>

          {/* Closing mood */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fb-text-2)' }}>
              {t('checkin.evening.closingMood')}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--fb-text-3)', minWidth: 8 }}>😔</span>
              <input
                type="range" min={1} max={5} step={1} value={closingMood}
                onChange={e => setClosingMood(parseInt(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--fb-amber)' }}
              />
              <span style={{ fontSize: 12, color: 'var(--fb-text-3)', minWidth: 8 }}>😄</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fb-amber)', minWidth: 20, textAlign: 'right' }}>
                {closingMood}
              </span>
            </div>
          </div>

          <button onClick={handleDone} style={btnPrimary}>
            {t('checkin.done')}
          </button>

        </div>
      </div>
    </div>
  );
}
