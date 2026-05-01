import { useState, useEffect } from 'react';
import { api } from '../api';
import ConfirmDialog from './ConfirmDialog';
import ExerciseSearch from './ExerciseSearch';
import Modal from './Modal';
import EmptyState from './ui/EmptyState';
import { useT } from '../i18n/useT';
import { useToast } from './Toast';
import type { Exercise, ExerciseType, WorkoutPlan } from '../types';

interface Props {
  date: string;
  onCaloriesChange: (kcal: number) => void;
}

interface SetRow { reps: string; weight_kg: string; }

const COLLAPSE_KEY = 'dashboard.exercise.collapsed';

export default function ExerciseSection({ date, onCaloriesChange }: Props) {
  const { t } = useT();
  const { showToast } = useToast();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* */ }
      return next;
    });
  }

  const [exercises, setExercises]   = useState<Exercise[]>([]);
  const [exTypes, setExTypes]       = useState<ExerciseType[]>([]);
  const [open, setOpen]             = useState(false);
  const [editId, setEditId]         = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Exercise | null>(null);

  // Plan picker
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [plans, setPlans]                   = useState<WorkoutPlan[]>([]);
  const [planSearch, setPlanSearch]         = useState('');
  const [loggingPlan, setLoggingPlan]       = useState(false);

  // Form state
  const [type, setType]       = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes]     = useState('');
  const [showSets, setShowSets] = useState(false);
  const [sets, setSets]       = useState<SetRow[]>([{ reps: '', weight_kg: '' }]);

  useEffect(() => {
    load();
    api.exercises.getTypes().then(setExTypes);
  }, [date]);

  async function load() {
    const rows = await api.exercises.getDay(date);
    setExercises(rows);
    onCaloriesChange(rows.reduce((s, e) => s + e.calories_burned, 0));
  }

  function resetForm() {
    setType(''); setDuration(''); setNotes('');
    setShowSets(false); setSets([{ reps: '', weight_kg: '' }]);
    setEditId(null);
  }

  async function handleSubmit() {
    if (!type || !duration) return;
    const validSets = showSets
      ? sets.filter(s => s.reps || s.weight_kg).map(s => ({
          reps: s.reps ? parseInt(s.reps) : undefined,
          weight_kg: s.weight_kg ? parseFloat(s.weight_kg) : undefined,
        }))
      : [];
    if (editId !== null) {
      await api.exercises.update({ id: editId, type, duration_min: parseFloat(duration), calories_burned: 0, notes });
    } else {
      await api.exercises.add({ date, type, duration_min: parseFloat(duration), calories_burned: 0, notes, sets: validSets });
    }
    resetForm();
    setOpen(false);
    load();
  }

  function startEdit(ex: Exercise) {
    setType(ex.type);
    setDuration(String(ex.duration_min));
    setNotes(ex.notes || '');
    setShowSets(!!(ex.sets?.length));
    setSets(ex.sets?.length ? ex.sets.map(s => ({ reps: s.reps ? String(s.reps) : '', weight_kg: s.weight_kg ? String(s.weight_kg) : '' })) : [{ reps: '', weight_kg: '' }]);
    setEditId(ex.id);
    setOpen(true);
  }

  async function doDelete() {
    if (!deleteTarget) return;
    await api.exercises.delete(deleteTarget.id);
    setDeleteTarget(null);
    load();
  }

  async function openPlanPicker() {
    const all = await api.workoutPlans.getAll();
    setPlans(all);
    setPlanSearch('');
    setPlanPickerOpen(true);
  }

  async function logFromPlan(plan: WorkoutPlan) {
    setPlanPickerOpen(false);
    setLoggingPlan(true);
    try {
      const full = await api.workoutPlans.get(plan.id);
      if (!full?.exercises?.length) { showToast('Plan has no exercises', 'error'); return; }
      for (const ex of full.exercises) {
        const setsArr = ex.target_sets && ex.target_reps
          ? Array.from({ length: ex.target_sets }, () => ({
              reps: ex.target_reps ?? undefined,
              weight_kg: ex.target_weight_kg ?? undefined,
            }))
          : [];
        await api.exercises.add({
          date,
          type: ex.exercise_name,
          duration_min: ex.target_duration_min ?? 0,
          calories_burned: 0,
          notes: ex.notes ?? undefined,
          sets: setsArr.length ? setsArr : undefined,
        });
      }
      showToast(t('common.saved'));
      load();
    } finally {
      setLoggingPlan(false);
    }
  }

  const filteredPlans = plans.filter(p => p.name.toLowerCase().includes(planSearch.toLowerCase()));

  const inputCls = 'rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent w-full';

  const totalKcal = exercises.reduce((s, e) => s + e.calories_burned, 0);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className={`flex items-center justify-between gap-2 ${collapsed ? '' : 'mb-3'}`}>
        <button
          onClick={toggleCollapsed}
          className="flex items-center gap-2 cursor-pointer group flex-1 min-w-0 text-left"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand exercise' : 'Collapse exercise'}
        >
          <span className={`text-text-sec text-xs transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}>▼</span>
          <h3 className="text-xs font-semibold text-text-sec uppercase tracking-wider group-hover:text-text transition-colors">Exercise</h3>
          {collapsed && exercises.length > 0 && (
            <span className="text-xs text-text-sec tabular-nums">
              · {exercises.length} {exercises.length === 1 ? 'entry' : 'entries'}
              {totalKcal > 0 ? ` · ${Math.round(totalKcal)} kcal` : ''}
            </span>
          )}
        </button>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <button
              onClick={openPlanPicker}
              disabled={loggingPlan}
              className="text-xs px-3 py-1 rounded-lg border border-border text-text-sec hover:border-accent hover:text-accent cursor-pointer transition-colors disabled:opacity-40"
            >
              {loggingPlan ? '…' : t('exercise.plans.logFromPlan')}
            </button>
            <button
              onClick={() => { resetForm(); setOpen(true); }}
              className="text-xs px-3 py-1 rounded-lg border border-border text-text-sec hover:border-accent hover:text-accent cursor-pointer transition-colors"
            >
              + Add
            </button>
          </div>
        )}
      </div>

      {!collapsed && exercises.length === 0 && !open && (
        <EmptyState message={t('exercise.empty') ?? 'No exercise logged today.'} className="py-2" />
      )}

      {!collapsed && exercises.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3">
          {exercises.map(ex => (
            <div key={ex.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-text">{ex.type}</span>
              <span className="text-text-sec tabular-nums text-xs">{ex.duration_min > 0 ? `${ex.duration_min}min` : ''}</span>
              {ex.sets && ex.sets.length > 0 && (
                <span className="text-xs text-text-sec">{ex.sets.length} sets</span>
              )}
              <button onClick={() => startEdit(ex)} className="text-text-sec hover:text-text px-1 cursor-pointer text-xs">
                <span style={{ display: 'inline-block', transform: 'scaleX(-1) rotate(15deg)' }}>✎</span>
              </button>
              <button onClick={() => setDeleteTarget(ex)} aria-label={t('common.delete')} className="text-text-sec hover:text-red px-1 cursor-pointer text-xs">✕</button>
            </div>
          ))}
        </div>
      )}

      {!collapsed && open && (
        <div className="border-t border-border pt-3 mt-2 space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-text-sec">Exercise</label>
            <ExerciseSearch
              items={exTypes}
              onSelect={ex => setType(ex.name)}
              value={type}
              onClear={() => setType('')}
              showAllWhenEmpty
              placeholder="Search exercise…"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-text-sec">Duration (min)</label>
              <input type="text" inputMode="decimal" className={inputCls} value={duration} onChange={e => setDuration(e.target.value)} placeholder="30" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-sec">Notes</label>
              <input type="text" className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional" />
            </div>
          </div>

          <div>
            <button
              onClick={() => setShowSets(v => !v)}
              className="text-xs text-text-sec hover:text-text cursor-pointer transition-colors"
            >
              {showSets ? '▲ Hide sets' : '▼ Add sets (strength training)'}
            </button>
          </div>

          {showSets && (
            <div className="space-y-2">
              {sets.map((s, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-xs text-text-sec w-8">#{i + 1}</span>
                  <input type="text" inputMode="decimal" className="w-20 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text focus:outline-none focus:border-accent" placeholder="Reps" value={s.reps} onChange={e => setSets(ss => ss.map((x, j) => j === i ? { ...x, reps: e.target.value } : x))} />
                  <input type="text" inputMode="decimal" className="w-20 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text focus:outline-none focus:border-accent" placeholder="kg" value={s.weight_kg} onChange={e => setSets(ss => ss.map((x, j) => j === i ? { ...x, weight_kg: e.target.value } : x))} />
                  {sets.length > 1 && <button onClick={() => setSets(ss => ss.filter((_, j) => j !== i))} aria-label={t('common.delete')} className="text-red text-xs cursor-pointer">✕</button>}
                </div>
              ))}
              <button onClick={() => setSets(ss => [...ss, { reps: '', weight_kg: '' }])} className="text-xs text-accent hover:opacity-75 cursor-pointer">+ Add set</button>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={!type || !duration} className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer">
              {editId !== null ? 'Save' : 'Log'}
            </button>
            <button onClick={() => { resetForm(); setOpen(false); }} className="px-4 py-2 rounded-xl text-sm text-text-sec border border-border hover:bg-card-hover cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete "${deleteTarget.type}"?`}
          confirmLabel={t("common.delete")}
          dangerous
          onConfirm={doDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Plan picker modal */}
      <Modal isOpen={planPickerOpen} onClose={() => setPlanPickerOpen(false)} title={t('exercise.plans.pickPlan')} width="max-w-md">
        <div className="flex flex-col gap-3 p-4">
          <input
            type="text"
            value={planSearch}
            onChange={e => setPlanSearch(e.target.value)}
            placeholder={t('exercise.plans.searchPlans')}
            className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {filteredPlans.length === 0 && (
              <p className="text-sm text-text-sec text-center py-4">{t('exercise.plans.noResults')}</p>
            )}
            {filteredPlans.map(plan => (
              <button
                key={plan.id}
                onClick={() => logFromPlan(plan)}
                className="text-left px-3 py-2.5 rounded-lg hover:bg-card-hover cursor-pointer transition-colors"
              >
                <div className="text-sm font-medium text-text">{plan.name}</div>
                {plan.description && <div className="text-xs text-text-sec truncate">{plan.description}</div>}
                <div className="text-xs text-text-sec">{t('exercise.plans.exercises_count').replace('{n}', String(plan.exercise_count))}</div>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
