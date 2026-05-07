import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useT } from '../i18n/useT';
import { useAchievementToast } from '../hooks/useAchievementToast';
import { today } from '../lib/dateUtil';
import { cardOuter, eyebrow, serifItalic, pillPrimary, pillGhost } from '../lib/fbUI';
import { fbBtnPrimary, fbBtnGhost } from '../lib/fbStyles';
import type { Habit, HabitWeekStat } from '../types';

// ── Preset icons ──────────────────────────────────────────────────────────────
const PRESET_ICONS = ['✅', '💪', '🏃', '📖', '💧', '🧘', '🥗', '😴', '🎯', '🎨', '🎵', '🧹', '🌿', '🛁', '🧴'];
const PRESET_COLORS = [
  'var(--fb-accent)',
  '#3b82f6',
  '#10b981',
  '#ef4444',
  '#f59e0b',
  '#8b5cf6',
];

// ── Helper: date labels ───────────────────────────────────────────────────────
function shortDay(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })
    .toUpperCase().slice(0, 2);
}

// ── Inline form for create / edit ─────────────────────────────────────────────
interface HabitFormProps {
  initial?: Partial<Habit>;
  onSave: (data: { name: string; icon: string; color: string; target_per_week: number }) => void;
  onCancel: () => void;
  t: (k: string) => string;
}

function HabitForm({ initial, onSave, onCancel, t }: HabitFormProps) {
  const [name, setName]   = useState(initial?.name || '');
  const [icon, setIcon]   = useState(initial?.icon || '✅');
  const [color, setColor] = useState(initial?.color || 'var(--fb-accent)');
  const [target, setTarget] = useState(initial?.target_per_week ?? 7);

  const inputCls = {
    width: '100%',
    background: 'var(--fb-card)',
    border: '1px solid var(--fb-border)',
    color: 'var(--fb-text)',
    borderRadius: 10,
    padding: '7px 10px',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Name */}
      <div>
        <label style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>
          {t('common.name')}
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('habits.namePlaceholder')}
          style={inputCls}
          autoFocus
        />
      </div>

      {/* Icon picker */}
      <div>
        <label style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>
          {t('habits.iconLabel')}
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESET_ICONS.map(ic => (
            <button
              key={ic}
              type="button"
              onClick={() => setIcon(ic)}
              style={{
                width: 36, height: 36, borderRadius: 8,
                fontSize: 18, border: `2px solid ${icon === ic ? 'var(--fb-accent)' : 'var(--fb-border)'}`,
                background: icon === ic ? 'color-mix(in srgb, var(--fb-accent) 14%, transparent)' : 'var(--fb-bg)',
                cursor: 'pointer',
                transition: 'all .2s cubic-bezier(0.16,1,0.3,1)',
              }}
            >{ic}</button>
          ))}
        </div>
      </div>

      {/* Color picker */}
      <div>
        <label style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>
          {t('habits.colorLabel')}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: c,
                border: `3px solid ${color === c ? 'var(--fb-text)' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'border-color .2s cubic-bezier(0.16,1,0.3,1)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Target per week */}
      <div>
        <label style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4, display: 'block', marginBottom: 5 }}>
          {t('habits.targetPerWeek')}: <span style={{ color: 'var(--fb-accent)' }}>{target}x</span>
        </label>
        <input
          type="range"
          min={1}
          max={7}
          value={target}
          onChange={e => setTarget(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--fb-accent)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--fb-text-3)', marginTop: 2 }}>
          <span>1x</span><span>7x</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button type="button" onClick={onCancel} style={fbBtnGhost}>{t('common.cancel')}</button>
        <button
          type="button"
          onClick={() => { if (name.trim()) onSave({ name: name.trim(), icon, color, target_per_week: target }); }}
          disabled={!name.trim()}
          style={{ ...fbBtnPrimary, opacity: name.trim() ? 1 : 0.5 }}
        >{t('common.save')}</button>
      </div>
    </div>
  );
}

// ── Week dots row ─────────────────────────────────────────────────────────────
function WeekDots({ checks, color }: { checks: { date: string; done: boolean }[]; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {checks.map(c => (
        <div
          key={c.date}
          title={`${c.date}: ${c.done ? '✓' : '–'}`}
          style={{
            width: 10, height: 10, borderRadius: '50%',
            background: c.done ? color : 'var(--fb-border)',
            transition: 'background .25s cubic-bezier(0.16,1,0.3,1)',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'today' | 'history';

export default function HabitsPage() {
  const { showToast } = useToast();
  const { t } = useT();
  const showAchievements = useAchievementToast();

  const todayStr = today();
  const [tab, setTab] = useState<Tab>('today');
  const [habits, setHabits] = useState<Habit[]>([]);
  const [weekStats, setWeekStats] = useState<HabitWeekStat[]>([]);
  const [streaks, setStreaks] = useState<Record<number, number>>({});
  const [checkedToday, setCheckedToday] = useState<Set<number>>(new Set());

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadHabits = useCallback(async () => {
    try {
      const list = await api.habits.list() as Habit[];
      setHabits(list);
      return list;
    } catch { return []; }
  }, []);

  const loadWeekStats = useCallback(async () => {
    try {
      const stats = await api.habits.getWeekStats(todayStr) as HabitWeekStat[];
      setWeekStats(stats);
      // Extract today's checks
      const todayChecked = new Set<number>();
      stats.forEach(s => {
        const todayCheck = s.checks.find(c => c.date === todayStr);
        if (todayCheck?.done) todayChecked.add(s.habit_id);
      });
      setCheckedToday(todayChecked);
    } catch {}
  }, [todayStr]);

  const loadStreaks = useCallback(async (list: Habit[]) => {
    try {
      const results = await Promise.all(
        list.map(h => api.habits.getCurrentStreak(h.id).then(r => ({ id: h.id, streak: r.streak })))
      );
      const map: Record<number, number> = {};
      results.forEach(r => { map[r.id] = r.streak; });
      setStreaks(map);
    } catch {}
  }, []);


  useEffect(() => {
    const init = async () => {
      const list = await loadHabits();
      await loadWeekStats();
      await loadStreaks(list);
    };
    init();
  }, [loadHabits, loadWeekStats, loadStreaks]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleToggleToday(habit: Habit) {
    const isChecked = checkedToday.has(habit.id);
    // Optimistic update
    setCheckedToday(prev => {
      const next = new Set(prev);
      if (isChecked) next.delete(habit.id); else next.add(habit.id);
      return next;
    });
    try {
      if (isChecked) {
        await api.habits.uncheck(habit.id, todayStr);
      } else {
        await api.habits.check(habit.id, todayStr);
        api.gamification.addPoints({ module: 'habits', reason: 'habit_checked', points: 5 })
          .then(r => { if (r.new_achievements?.length) showAchievements(r.new_achievements); })
          .catch(() => {});
      }
      await loadWeekStats();
      const list = await loadHabits();
      await loadStreaks(list);
    } catch {
      // Revert
      setCheckedToday(prev => {
        const next = new Set(prev);
        if (isChecked) next.add(habit.id); else next.delete(habit.id);
        return next;
      });
    }
  }

  async function handleCreate(data: { name: string; icon: string; color: string; target_per_week: number }) {
    try {
      await api.habits.create(data);
      setShowForm(false);
      const list = await loadHabits();
      await loadWeekStats();
      await loadStreaks(list);
      showToast(t('common.saved'), 'success');
    } catch {}
  }

  async function handleUpdate(data: { name: string; icon: string; color: string; target_per_week: number }) {
    if (!editingHabit) return;
    try {
      await api.habits.update({ id: editingHabit.id, ...data });
      setEditingHabit(null);
      const list = await loadHabits();
      await loadWeekStats();
      await loadStreaks(list);
      showToast(t('common.saved'), 'success');
    } catch {}
  }

  async function handleArchive(id: number) {
    try {
      await api.habits.archive(id);
      const list = await loadHabits();
      await loadWeekStats();
      await loadStreaks(list);
    } catch {}
  }

  async function handleDelete(id: number) {
    if (!window.confirm(t('habits.deleteConfirm'))) return;
    try {
      await api.habits.delete(id);
      const list = await loadHabits();
      await loadWeekStats();
      await loadStreaks(list);
    } catch {}
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const completedCount = checkedToday.size;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={eyebrow}>{t('habits.eyebrow')}</span>
        <span style={{ ...serifItalic, fontSize: 26, fontWeight: 400, color: 'var(--fb-text)', letterSpacing: -0.5, lineHeight: 1.1 }}>
          {t('habits.title')}
        </span>
      </header>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['today', 'history'] as Tab[]).map(tabId => {
          const active = tab === tabId;
          return (
            <button
              key={tabId}
              type="button"
              onClick={() => setTab(tabId)}
              style={{
                ...(active ? pillPrimary : pillGhost),
                padding: '6px 16px',
                fontSize: 12,
              }}
            >
              {t(`habits.${tabId}`)}
            </button>
          );
        })}
      </div>

      {/* ── Today tab ───────────────────────────────────────────────────────── */}
      {tab === 'today' && (
        <>
          {/* Completion summary */}
          {habits.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px',
              background: 'var(--fb-card)',
              border: '1px solid var(--fb-border)',
              borderRadius: 12,
            }}>
              <span style={{ fontSize: 13, color: 'var(--fb-text-2)' }}>
                {t('habits.completedToday').replace('{n}', String(completedCount))}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                {habits.map(h => (
                  <div
                    key={h.id}
                    style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: checkedToday.has(h.id) ? h.color : 'var(--fb-border)',
                      transition: 'background .3s cubic-bezier(0.16,1,0.3,1)',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Habit cards */}
          {habits.length === 0 && !showForm && (
            <div style={{
              textAlign: 'center', padding: '40px 16px',
              color: 'var(--fb-text-3)', fontSize: 14, fontStyle: 'italic',
              border: '1px dashed var(--fb-border)', borderRadius: 14,
            }}>
              {t('habits.empty')}
            </div>
          )}

          {habits.map(habit => {
            const stat = weekStats.find(s => s.habit_id === habit.id);
            const isChecked = checkedToday.has(habit.id);
            const streak = streaks[habit.id] ?? 0;
            const isEditing = editingHabit?.id === habit.id;
            const isHovered = hoveredId === habit.id;

            return (
              <div
                key={habit.id}
                style={{
                  ...cardOuter,
                  borderLeft: `3px solid ${habit.color}`,
                  gap: 12,
                  transition: 'box-shadow .2s cubic-bezier(0.16,1,0.3,1)',
                }}
                onMouseEnter={() => setHoveredId(habit.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {isEditing ? (
                  <HabitForm
                    initial={habit}
                    onSave={handleUpdate}
                    onCancel={() => setEditingHabit(null)}
                    t={t}
                  />
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Icon */}
                      <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{habit.icon}</span>

                      {/* Name + week dots */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fb-text)', marginBottom: 4 }}>
                          {habit.name}
                        </div>
                        {stat && <WeekDots checks={stat.checks} color={habit.color} />}
                      </div>

                      {/* Streak */}
                      {streak > 0 && (
                        <span style={{ fontSize: 12, color: 'var(--fb-text-2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                          🔥 {streak} {t('habits.streak')}
                        </span>
                      )}

                      {/* Check toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleToday(habit)}
                        title={isChecked ? 'Uncheck' : 'Check'}
                        style={{
                          width: 36, height: 36, borderRadius: '50%',
                          border: `2px solid ${isChecked ? habit.color : 'var(--fb-border)'}`,
                          background: isChecked ? habit.color : 'transparent',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16,
                          transition: 'all .25s cubic-bezier(0.16,1,0.3,1)',
                          flexShrink: 0,
                        }}
                      >
                        {isChecked ? '✓' : ''}
                      </button>
                    </div>

                    {/* Edit / Archive buttons on hover */}
                    {isHovered && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setEditingHabit(habit)}
                          style={{
                            padding: '3px 10px', borderRadius: 6,
                            border: '1px solid var(--fb-border)',
                            background: 'transparent',
                            color: 'var(--fb-text-2)',
                            fontSize: 11, fontWeight: 500, cursor: 'pointer',
                            fontFamily: 'var(--font-body)',
                          }}
                        >{t('common.edit')}</button>
                        <button
                          type="button"
                          onClick={() => handleArchive(habit.id)}
                          style={{
                            padding: '3px 10px', borderRadius: 6,
                            border: '1px solid var(--fb-border)',
                            background: 'transparent',
                            color: 'var(--fb-text-2)',
                            fontSize: 11, fontWeight: 500, cursor: 'pointer',
                            fontFamily: 'var(--font-body)',
                          }}
                        >{t('habits.archiveHabit')}</button>
                        <button
                          type="button"
                          onClick={() => handleDelete(habit.id)}
                          style={{
                            padding: '3px 10px', borderRadius: 6,
                            border: '1px solid var(--fb-red, #ef4444)',
                            background: 'transparent',
                            color: 'var(--fb-red, #ef4444)',
                            fontSize: 11, fontWeight: 500, cursor: 'pointer',
                            fontFamily: 'var(--font-body)',
                          }}
                        >{t('habits.deleteHabit')}</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {/* New habit form */}
          {showForm && (
            <div style={cardOuter}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fb-text)' }}>{t('habits.newHabit')}</span>
              <HabitForm
                onSave={handleCreate}
                onCancel={() => setShowForm(false)}
                t={t}
              />
            </div>
          )}

          {/* Add button */}
          {!showForm && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <button
                type="button"
                onClick={() => { setShowForm(true); setEditingHabit(null); }}
                style={{ ...fbBtnPrimary }}
              >
                + {t('habits.newHabit')}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── History tab ─────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <>
          {habits.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px 16px',
              color: 'var(--fb-text-3)', fontSize: 14, fontStyle: 'italic',
              border: '1px dashed var(--fb-border)', borderRadius: 14,
            }}>
              {t('habits.empty')}
            </div>
          ) : (
            habits.map(habit => {
              const stat = weekStats.find(s => s.habit_id === habit.id);
              const streak = streaks[habit.id] ?? 0;

              return (
                <div key={habit.id} style={{ ...cardOuter, borderLeft: `3px solid ${habit.color}` }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{habit.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fb-text)' }}>{habit.name}</span>
                    {streak > 0 && (
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fb-text-2)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        🔥 {streak} {t('habits.streak')}
                      </span>
                    )}
                  </div>

                  {/* 90-day heatmap */}
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--fb-text-3)', marginBottom: 6, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                      {t('habits.last90Days')}
                    </div>
                    <HeatMap90 habit_id={habit.id} color={habit.color} />
                  </div>

                  {/* Week dots */}
                  {stat && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--fb-text-3)', marginBottom: 6, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                        {t('habits.thisWeek')}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {stat.checks.map(c => (
                          <div key={c.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <div
                              title={c.date}
                              style={{
                                width: 20, height: 20, borderRadius: 5,
                                background: c.done ? habit.color : 'var(--fb-border)',
                                transition: 'background .25s ease',
                              }}
                            />
                            <span style={{ fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase' }}>
                              {shortDay(c.date)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}

// ── 90-day heatmap (fetches its own data) ─────────────────────────────────────
function HeatMap90({ habit_id, color }: { habit_id: number; color: string }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    // Load last 3 months
    const months: { year: number; month: number }[] = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    Promise.all(
      months.map(({ year, month }) =>
        api.habits.getMonthData(habit_id, year, month).then(r => r.dates)
      )
    ).then(allDates => {
      const set = new Set(allDates.flat());
      setChecked(set);
    }).catch(() => {});
  }, [habit_id]);

  const days: string[] = [];
  const todayStr = new Date().toISOString().slice(0, 10);
  for (let i = 89; i >= 0; i--) {
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
      {days.map(d => (
        <div
          key={d}
          title={d}
          style={{
            width: 10, height: 10, borderRadius: 2,
            background: checked.has(d) ? color : 'var(--fb-border)',
            flexShrink: 0,
            transition: 'background .2s ease',
          }}
        />
      ))}
    </div>
  );
}
