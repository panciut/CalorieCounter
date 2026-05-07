import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useT } from '../i18n/useT';
import { useAchievementToast } from '../hooks/useAchievementToast';
import type { WorkoutSession, WorkoutExerciseSet, ExerciseType } from '../types';
import { cardOuter, eyebrow, pillPrimary, pillGhost, tinyInput } from '../lib/fbUI';
import ExerciseSearch from './ExerciseSearch';

const today = () => new Date().toISOString().slice(0, 10);

function formatDuration(min: number | null): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt.includes('T') ? startedAt : startedAt + 'Z').getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const str = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;

  return (
    <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontSize: 38, fontWeight: 400, letterSpacing: -1.5, color: 'var(--fb-accent)', lineHeight: 1 }}>
      {str}
    </span>
  );
}

function EffortDots({ value }: { value: number | null }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: value != null && i < value
              ? 'var(--fb-accent)'
              : 'var(--fb-border-strong, var(--fb-border))',
            transition: 'background .2s ease',
          }}
        />
      ))}
      {value != null && (
        <span style={{ fontSize: 10, color: 'var(--fb-text-3)', marginLeft: 4 }}>{value}/10</span>
      )}
    </div>
  );
}

interface AddSetFormProps {
  sessionId: number;
  onAdded: () => void;
  exercises: ExerciseType[];
}

function AddSetForm({ sessionId, onAdded, exercises }: AddSetFormProps) {
  const { t } = useT();
  const [exerciseId, setExerciseId] = useState<number | null>(null);
  const [exerciseName, setExerciseName] = useState<string>('');
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    setSaving(true);
    try {
      const setIdx = Date.now(); // use timestamp as loose ordering index
      await api.workouts.addSet({
        session_id: sessionId,
        exercise_id: exerciseId,
        set_idx: setIdx,
        reps: reps ? parseInt(reps, 10) : null,
        weight_kg: weight ? parseFloat(weight) : null,
      });
      setReps('');
      setWeight('');
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 auto', minWidth: 200 }}>
        <ExerciseSearch
          items={exercises}
          value={exerciseName}
          onSelect={ex => {
            setExerciseId(ex.id);
            setExerciseName(ex.name);
          }}
          onClear={() => {
            setExerciseId(null);
            setExerciseName('');
          }}
          placeholder={t('workouts.selectExercise')}
          showAllWhenEmpty
        />
      </div>
      <input
        type="number"
        placeholder="Reps"
        value={reps}
        onChange={e => setReps(e.target.value)}
        style={{ ...tinyInput, width: 80 }}
      />
      <input
        type="number"
        placeholder="kg"
        value={weight}
        onChange={e => setWeight(e.target.value)}
        style={{ ...tinyInput, width: 80 }}
      />
      <button
        onClick={handleAdd}
        disabled={saving || (!reps && !weight)}
        style={pillPrimary}
      >
        Aggiungi
      </button>
    </div>
  );
}

interface EndSessionFormProps {
  session: WorkoutSession;
  onEnded: () => void;
  onCancel: () => void;
}

function EndSessionForm({ session, onEnded, onCancel }: EndSessionFormProps) {
  const { t } = useT();
  const showAchievements = useAchievementToast();
  
  // Automatically calculate elapsed time as default duration
  const startMs = new Date(session.started_at?.includes('T') ? session.started_at : session.started_at + 'Z').getTime();
  const elapsedMin = Math.max(1, Math.round((Date.now() - (isNaN(startMs) ? Date.now() : startMs)) / 60000));
  
  const [durationMin, setDurationMin] = useState(String(elapsedMin));
  const [calories, setCalories] = useState('');
  const [effort, setEffort] = useState('');
  const [note, setNote] = useState(session.note ?? '');
  const [saving, setSaving] = useState(false);

  async function handleEnd() {
    setSaving(true);
    try {
      await api.workouts.endSession({
        id: session.id,
        duration_min:    durationMin ? parseInt(durationMin, 10) : null,
        calories_burned: calories ? parseInt(calories, 10) : null,
        perceived_effort: effort ? parseInt(effort, 10) : null,
        note: note || null,
      });
      api.gamification.addPoints({ module: 'workouts', reason: 'workout_completed', points: 15 })
        .then(r => { if (r.new_achievements?.length) showAchievements(r.new_achievements); })
        .catch(() => {});
      onEnded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={{ ...eyebrow, marginBottom: 4 }}>{t('workouts.duration')} (min)</div>
          <input
            type="number"
            placeholder="min"
            value={durationMin}
            onChange={e => setDurationMin(e.target.value)}
            style={tinyInput}
          />
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={{ ...eyebrow, marginBottom: 4 }}>{t('workouts.caloriesBurned')}</div>
          <input
            type="number"
            placeholder="kcal"
            value={calories}
            onChange={e => setCalories(e.target.value)}
            style={tinyInput}
          />
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={{ ...eyebrow, marginBottom: 4 }}>{t('workouts.effort')} (1-10)</div>
          <input
            type="number"
            min={1}
            max={10}
            placeholder="1-10"
            value={effort}
            onChange={e => setEffort(e.target.value)}
            style={tinyInput}
          />
        </div>
      </div>
      <input
        type="text"
        placeholder="Note (opz.)"
        value={note}
        onChange={e => setNote(e.target.value)}
        style={tinyInput}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleEnd} disabled={saving} style={pillPrimary}>
          {t('workouts.endSession')}
        </button>
        <button onClick={onCancel} style={pillGhost}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

interface ActiveSessionViewProps {
  session: WorkoutSession;
  onRefresh: () => void;
}

function ActiveSessionView({ session, onRefresh }: ActiveSessionViewProps) {
  const { t } = useT();
  const [showEndForm, setShowEndForm] = useState(false);
  const [showAddSet, setShowAddSet] = useState(false);
  const [exercises, setExercises] = useState<ExerciseType[]>([]);

  useEffect(() => {
    api.exercises.getTypes().then(types => {
      setExercises(types);
    }).catch(() => {});
  }, []);

  return (
    <div style={{ ...cardOuter, borderColor: 'var(--fb-accent)', boxShadow: '0 0 0 1px var(--fb-accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={eyebrow}>Sessione attiva</div>
        <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}>
          {session.started_at ? new Date(session.started_at.includes('T') ? session.started_at : session.started_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>

      <ElapsedTimer startedAt={session.started_at ?? ''} />

      {/* Sets list */}
      {session.sets && session.sets.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={eyebrow}>Set registrati</div>
          {session.sets.map((s, i) => {
            const exName = exercises.find(e => e.id === s.exercise_id)?.name || 'Esercizio';
            return (
              <div key={s.id} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--fb-text-2)', alignItems: 'center' }}>
                <span style={{ color: 'var(--fb-text-3)', minWidth: 18 }}>#{i + 1}</span>
                <span style={{ fontWeight: 'bold' }}>{exName}</span>
                {s.reps != null && <span>{s.reps} reps</span>}
                {s.weight_kg != null && <span>{s.weight_kg} kg</span>}
                {s.distance_km != null && <span>{s.distance_km} km</span>}
                {s.duration_sec != null && <span>{s.duration_sec}s</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Add set */}
      {showAddSet ? (
        <AddSetForm sessionId={session.id} onAdded={() => { setShowAddSet(false); onRefresh(); }} exercises={exercises} />
      ) : (
        <button onClick={() => setShowAddSet(true)} style={pillGhost}>+ {t('workouts.addSet')}</button>
      )}

      {/* End session */}
      {showEndForm ? (
        <EndSessionForm
          session={session}
          onEnded={() => { setShowEndForm(false); onRefresh(); }}
          onCancel={() => setShowEndForm(false)}
        />
      ) : (
        <button onClick={() => setShowEndForm(true)} style={{ ...pillPrimary, background: 'var(--fb-red, #e33)', alignSelf: 'flex-start' }}>
          {t('workouts.endSession')}
        </button>
      )}
    </div>
  );
}

interface SessionCardProps {
  session: WorkoutSession;
  onDelete: () => void;
}

function SessionCard({ session, onDelete }: SessionCardProps) {
  const { t } = useT();

  return (
    <div style={cardOuter}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 400, letterSpacing: -1, color: 'var(--fb-text)', lineHeight: 1 }}>
            {formatDuration(session.duration_min)}
          </span>
          {session.calories_burned != null && (
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--fb-text-2)' }}>
              {session.calories_burned} kcal
            </span>
          )}
        </div>
        <button
          onClick={onDelete}
          style={{ background: 'none', border: 'none', color: 'var(--fb-text-3)', cursor: 'pointer', fontSize: 13, padding: '2px 6px' }}
          title={t('common.delete')}
        >
          ✕
        </button>
      </div>

      <EffortDots value={session.perceived_effort} />

      {session.note && (
        <div style={{ fontSize: 12, color: 'var(--fb-text-2)', fontStyle: 'italic' }}>{session.note}</div>
      )}

      {session.sets && session.sets.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>
          {session.sets.length} set
        </div>
      )}
    </div>
  );
}

export default function WorkoutSessions() {
  const { t } = useT();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  async function load() {
    const [day, active] = await Promise.all([
      api.workouts.getDaySessions(today()),
      api.workouts.getActiveSession(),
    ]);
    setSessions(day as WorkoutSession[]);
    setActiveSession(active as WorkoutSession | null);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function startSession() {
    setStarting(true);
    try {
      await api.workouts.startSession({ date: today() });
      await load();
    } finally {
      setStarting(false);
    }
  }

  async function deleteSession(id: number) {
    await api.workouts.deleteSession(id);
    await load();
  }

  if (loading) {
    return <div style={{ color: 'var(--fb-text-3)', fontSize: 13, padding: 24 }}>…</div>;
  }

  const completedSessions = sessions.filter(s => s.ended_at != null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 24 }}>
      {/* Active session */}
      {activeSession && (
        <ActiveSessionView session={activeSession} onRefresh={load} />
      )}

      {/* Start button (only if no active session) */}
      {!activeSession && (
        <div>
          <button
            onClick={startSession}
            disabled={starting}
            style={pillPrimary}
          >
            {t('workouts.startSession')}
          </button>
        </div>
      )}

      {/* Completed sessions today */}
      {completedSessions.length === 0 && !activeSession && (
        <div style={{ ...cardOuter, alignItems: 'center', justifyContent: 'center', minHeight: 100 }}>
          <span style={{ fontSize: 13, color: 'var(--fb-text-3)' }}>{t('workouts.noSessionToday')}</span>
        </div>
      )}

      {completedSessions.map(s => (
        <SessionCard key={s.id} session={s} onDelete={() => deleteSession(s.id)} />
      ))}
    </div>
  );
}
