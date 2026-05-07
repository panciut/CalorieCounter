import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import { useT } from '../../i18n/useT';
import { useNavigate } from '../../hooks/useNavigate';
import { cardOuter, eyebrow } from '../../lib/fbUI';
import { today as todayStr } from '../../lib/dateUtil';
import type { Habit, HabitWeekStat } from '../../types';

export default function HabitsCard() {
  const { t } = useT();
  const { navigate } = useNavigate();
  const today = todayStr();

  const [habits, setHabits]       = useState<Habit[]>([]);
  const [checkedToday, setCheckedToday] = useState<Set<number>>(new Set());
  const [loaded, setLoaded]       = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [list, stats] = await Promise.all([
        api.habits.list() as Promise<Habit[]>,
        api.habits.getWeekStats(today) as Promise<HabitWeekStat[]>,
      ]);
      setHabits(list.slice(0, 4));
      const checked = new Set<number>();
      stats.forEach(s => {
        const todayCheck = s.checks.find(c => c.date === today);
        if (todayCheck?.done) checked.add(s.habit_id);
      });
      setCheckedToday(checked);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleToggle(habit: Habit) {
    const isChecked = checkedToday.has(habit.id);
    // Optimistic
    setCheckedToday(prev => {
      const next = new Set(prev);
      if (isChecked) next.delete(habit.id); else next.add(habit.id);
      return next;
    });
    try {
      if (isChecked) {
        await api.habits.uncheck(habit.id, today);
      } else {
        await api.habits.check(habit.id, today);
      }
    } catch {
      // Revert
      setCheckedToday(prev => {
        const next = new Set(prev);
        if (isChecked) next.add(habit.id); else next.delete(habit.id);
        return next;
      });
    }
  }

  const completedCount = checkedToday.size;

  return (
    <div style={cardOuter}>
      {/* Header */}
      <div style={eyebrow}>{t('habits.eyebrow')}</div>

      {/* Habit list */}
      {!loaded ? (
        <div style={{ fontSize: 13, color: 'var(--fb-text-3)', fontStyle: 'italic' }}>…</div>
      ) : habits.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--fb-text-3)', fontStyle: 'italic' }}>
          {t('habits.empty')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {habits.map(habit => {
            const isChecked = checkedToday.has(habit.id);
            return (
              <div
                key={habit.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                {/* Toggle circle */}
                <button
                  type="button"
                  onClick={() => handleToggle(habit)}
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    border: `2px solid ${isChecked ? habit.color : 'var(--fb-border)'}`,
                    background: isChecked ? habit.color : 'transparent',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: 'white',
                    transition: 'all .25s cubic-bezier(0.16,1,0.3,1)',
                    flexShrink: 0,
                  }}
                >
                  {isChecked ? '✓' : ''}
                </button>

                {/* Icon + name */}
                <span style={{ fontSize: 14, flexShrink: 0 }}>{habit.icon}</span>
                <span style={{
                  fontSize: 12.5, fontWeight: 500,
                  color: isChecked ? 'var(--fb-text-3)' : 'var(--fb-text)',
                  textDecoration: isChecked ? 'line-through' : 'none',
                  flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  transition: 'color .25s ease',
                }}>
                  {habit.name}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>
          {loaded
            ? t('habits.completedToday').replace('{n}', String(completedCount))
            : '…'}
        </span>
        <button
          type="button"
          onClick={() => navigate('habits')}
          style={{
            display: 'inline-flex', alignItems: 'center',
            background: 'transparent',
            border: '1px solid var(--fb-border)',
            color: 'var(--fb-text-2)',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 11.5, fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
          }}
        >
          {t('habits.seeAll')}
        </button>
      </div>
    </div>
  );
}
