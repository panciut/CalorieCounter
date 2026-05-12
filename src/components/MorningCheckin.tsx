import { useState, useEffect } from 'react';
import { useT } from '../i18n/useT';
import { api } from '../api';
import { today } from '../lib/dateUtil';
import type { Habit, HabitWeekStat, Task } from '../types';

const SPRING = 'cubic-bezier(0.16,1,0.3,1)';
const TOTAL_STEPS = 4;

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          width: i === current ? 22 : 8,
          height: 8,
          borderRadius: 99,
          background: i === current ? 'var(--fb-amber)' : 'var(--fb-border-strong)',
          transition: `all .45s ${SPRING}`,
          display: 'inline-block',
        }} />
      ))}
    </div>
  );
}

function SliderRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--fb-text-2)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fb-amber)', minWidth: 20, textAlign: 'right' }}>{value}</span>
      </div>
      <input
        type="range" min={1} max={5} step={1} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--fb-amber)' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--fb-text-3)' }}>
        <span>1</span><span>5</span>
      </div>
    </div>
  );
}

interface Props { onDone: () => void; }

export default function MorningCheckin({ onDone }: Props) {
  const { t } = useT();
  const todayStr = today();
  const [step, setStep] = useState(0);

  // Step 0 — weight
  const [weight, setWeight] = useState('');

  // Step 1 — mood
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [stress, setStress] = useState(3);
  const [moodTouched, setMoodTouched] = useState(false);
  const [existingMood, setExistingMood] = useState<{ energy: number | null; stress: number | null } | null>(null);

  // Step 2 — habits
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checkedHabits, setCheckedHabits] = useState<Set<number>>(new Set());

  // Step 3 — tasks
  const [urgentTasks, setUrgentTasks] = useState<Task[]>([]);

  useEffect(() => {
    // Prefill last weight
    api.weight.getAll().then(entries => {
      const latest = entries[0];
      if (latest) setWeight(String(latest.weight));
    }).catch(() => {});

    // Prefill mood
    api.mood.get(todayStr).then(m => {
      if (m) {
        setMood(m.mood ?? 3);
        setEnergy(m.energy ?? 3);
        setStress(m.stress ?? 3);
        setExistingMood({ energy: m.energy, stress: m.stress });
      }
    }).catch(() => {});

    // Load habits
    Promise.all([api.habits.list(), api.habits.getWeekStats(todayStr)]).then(([list, stats]) => {
      const activeHabits = list.filter((h: Habit) => !h.archived);
      const doneToday = new Set(
        stats.filter((s: HabitWeekStat) => s.checks?.some(c => c.date === todayStr && c.done)).map((s: HabitWeekStat) => s.habit_id)
      );
      setHabits(activeHabits);
      setCheckedHabits(doneToday);
    }).catch(() => {});

    // Load urgent tasks
    api.tasks.get(todayStr).then((tasks: Task[]) => {
      setUrgentTasks(tasks.filter(t => t.priority === 2 && t.done === 0));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleNext() {
    if (step === 0) {
      // Save weight if filled
      const w = parseFloat(weight);
      if (!isNaN(w) && w > 0) {
        try { await api.weight.add({ weight: w, date: todayStr }); } catch (_) {}
      }
    } else if (step === 1 && moodTouched) {
      try {
        await api.mood.upsert({
          date: todayStr, mood,
          energy: existingMood?.energy ?? energy,
          stress: existingMood?.stress ?? stress,
          note: '',
        });
      } catch (_) {}
    }
    if (step < TOTAL_STEPS - 1) setStep(s => s + 1);
    else onDone();
  }

  async function toggleHabit(id: number) {
    const next = new Set(checkedHabits);
    if (next.has(id)) {
      next.delete(id);
      try { await api.habits.uncheck(id, todayStr); } catch (_) {}
    } else {
      next.add(id);
      try { await api.habits.check(id, todayStr); } catch (_) {}
    }
    setCheckedHabits(next);
  }

  async function toggleTask(id: number) {
    try {
      await api.tasks.toggle(id);
      setUrgentTasks(prev => prev.map(t => t.id === id ? { ...t, done: t.done === 0 ? 1 : 0 } : t));
    } catch (_) {}
  }

  const btnPrimary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '14px 32px', borderRadius: 99,
    background: 'var(--fb-amber)', color: '#000',
    border: 0, fontSize: 15, fontWeight: 700,
    cursor: 'pointer', letterSpacing: 0.2, flex: 1,
    boxShadow: '0 4px 20px color-mix(in srgb, var(--fb-amber) 35%, transparent)',
  };

  const btnGhost: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '13px 24px', borderRadius: 99,
    background: 'transparent', color: 'var(--fb-text-2)',
    border: '1.5px solid var(--fb-border-strong)',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  };

  const stepContainerStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '40px 24px', flex: 1,
    animation: `slideIn 280ms ${SPRING}`,
    overflowY: 'auto',
  };

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
        background: 'radial-gradient(circle, color-mix(in srgb, var(--fb-amber) 8%, transparent) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Skip button */}
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
        flex: 1, display: 'flex', flexDirection: 'column',
      }}>
        <div key={step} style={stepContainerStyle}>
          <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Title */}
            <div style={{ textAlign: 'center' }}>
              <h2 style={{
                fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                fontSize: 30, fontWeight: 400, color: 'var(--fb-text)',
                letterSpacing: -0.5, lineHeight: 1.15, margin: '0 0 6px',
              }}>
                {step === 0 && t('checkin.morning.title')}
                {step === 1 && t('checkin.morning.moodStep')}
                {step === 2 && t('checkin.morning.habitsStep')}
                {step === 3 && t('checkin.morning.tasksStep')}
              </h2>
              {step === 0 && (
                <p style={{ fontSize: 13, color: 'var(--fb-text-3)', margin: 0 }}>
                  {t('checkin.morning.weightHint')}
                </p>
              )}
            </div>

            {/* Step content */}
            {step === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.1, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>
                  {t('checkin.morning.weightStep')}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
                    placeholder="70.0"
                    min={30} max={300} step={0.1}
                    style={{
                      flex: 1, background: 'var(--fb-bg)', border: '1.5px solid var(--fb-border)',
                      color: 'var(--fb-text)', borderRadius: 12, padding: '11px 14px',
                      fontSize: 15, outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--fb-text-3)', fontWeight: 500 }}>kg</span>
                </div>
              </div>
            )}

            {step === 1 && (
              <div style={{
                background: 'var(--fb-card)', border: '1px solid var(--fb-border)',
                borderRadius: 16, padding: '18px 20px',
                display: 'flex', flexDirection: 'column', gap: 18,
              }}>
                <SliderRow label={t('journal.mood')} value={mood} onChange={v => { setMood(v); setMoodTouched(true); }} />
                <SliderRow label={t('journal.energy')} value={energy} onChange={v => { setEnergy(v); setMoodTouched(true); }} />
                <SliderRow label={t('journal.stress')} value={stress} onChange={v => { setStress(v); setMoodTouched(true); }} />
              </div>
            )}

            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {habits.length === 0 ? (
                  <span style={{ fontSize: 13, color: 'var(--fb-text-3)', textAlign: 'center' }}>—</span>
                ) : habits.map(h => (
                  <button
                    key={h.id}
                    onClick={() => toggleHabit(h.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', borderRadius: 12,
                      background: checkedHabits.has(h.id)
                        ? 'color-mix(in srgb, var(--fb-amber) 12%, var(--fb-card))'
                        : 'var(--fb-card)',
                      border: `1.5px solid ${checkedHabits.has(h.id) ? 'var(--fb-amber)' : 'var(--fb-border)'}`,
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{h.icon ?? '🔥'}</span>
                    <span style={{ fontSize: 14, color: 'var(--fb-text)', flex: 1 }}>{h.name}</span>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%',
                      border: `2px solid ${checkedHabits.has(h.id) ? 'var(--fb-amber)' : 'var(--fb-border-strong)'}`,
                      background: checkedHabits.has(h.id) ? 'var(--fb-amber)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: '#000', fontWeight: 700,
                    }}>
                      {checkedHabits.has(h.id) && '✓'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {step === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {urgentTasks.length === 0 ? (
                  <p style={{ fontSize: 14, color: 'var(--fb-text-2)', textAlign: 'center', margin: 0 }}>
                    {t('checkin.morning.noUrgent')}
                  </p>
                ) : urgentTasks.map(task => (
                  <button
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', borderRadius: 12,
                      background: task.done === 1
                        ? 'color-mix(in srgb, var(--fb-success, #4caf50) 10%, var(--fb-card))'
                        : 'var(--fb-card)',
                      border: `1.5px solid ${task.done === 1 ? 'var(--fb-success, #4caf50)' : 'var(--fb-border)'}`,
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${task.done === 1 ? 'var(--fb-success, #4caf50)' : 'var(--fb-border-strong)'}`,
                      background: task.done === 1 ? 'var(--fb-success, #4caf50)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: '#fff', fontWeight: 700,
                    }}>
                      {task.done === 1 && '✓'}
                    </span>
                    <span style={{ fontSize: 14, color: 'var(--fb-text)', flex: 1, textDecoration: task.done === 1 ? 'line-through' : 'none' }}>
                      {task.title}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Footer buttons */}
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)} style={btnGhost}>
                  {t('checkin.back')}
                </button>
              )}
              <button onClick={handleNext} style={btnPrimary}>
                {step === TOTAL_STEPS - 1 ? t('checkin.done') : t('checkin.next')}
              </button>
            </div>

          </div>
        </div>

        {/* Step dots */}
        <div style={{ padding: '20px 24px 32px', flexShrink: 0 }}>
          <StepDots current={step} total={TOTAL_STEPS} />
        </div>
      </div>
    </div>
  );
}
