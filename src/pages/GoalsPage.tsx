import { useState, useEffect, useCallback, useRef } from "react";
import { useSettings } from "../hooks/useSettings";
import { useT } from "../i18n/useT";
import { useToast } from "../components/Toast";
import { calcMacroRanges } from "../lib/macroCalc";
import { invalidateGoalsCache } from "../hooks/useGoalsForDate";
import { api } from "../api";
import type { Settings, GoalType, TDEEResult, GoalSuggestion, GoalPlan, GoalPlanInput } from "../types";
import PageHeader from "../components/ui/PageHeader";
import ConfirmDialog from "../components/ConfirmDialog";

type MacroField = "protein" | "carbs" | "fat" | "fiber";
const MACROS: MacroField[] = ["fat", "carbs", "fiber", "protein"];

type FormState = Partial<Settings> & {
  label?: string;
  notes?: string;
  goal_type?: GoalType;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const GOAL_FIELDS = [
  'cal_min', 'cal_rec', 'cal_max',
  'protein_min', 'protein_rec', 'protein_max',
  'carbs_min', 'carbs_rec', 'carbs_max',
  'fat_min', 'fat_rec', 'fat_max',
  'fiber_min', 'fiber_rec', 'fiber_max',
  'weight_goal', 'water_goal',
  'tol_1', 'tol_2', 'tol_3',
] as const;

function planToForm(plan: GoalPlan): FormState {
  const f: FormState = { label: plan.label, notes: plan.notes, goal_type: plan.goal_type };
  for (const k of GOAL_FIELDS) {
    const v = plan[k];
    if (v !== null && v !== undefined) (f as Record<string, unknown>)[k] = v;
  }
  return f;
}

function settingsToForm(s: Settings): FormState {
  const f: FormState = { label: '', notes: '', goal_type: 'custom' };
  for (const k of GOAL_FIELDS) (f as Record<string, unknown>)[k] = s[k];
  return f;
}

// Empty input → NaN (allowed during editing); on blur we restore the previous value.
function showNum(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isNaN(v)) return '';
  return String(v);
}

function MacroRow({ macro, form, inputCls, setField, restoreOnBlur, t }: {
  macro: MacroField;
  form: FormState;
  inputCls: string;
  setField: (k: keyof Settings, v: number) => void;
  restoreOnBlur: (k: keyof Settings) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 items-center">
      <span className="text-sm font-medium text-text capitalize">{t(`settings.${macro}`)}</span>
      {(["min", "rec", "max"] as const).map((suffix) => {
        const key = `${macro}_${suffix}` as keyof Settings;
        const label = suffix === 'min' ? 'Minimum' : suffix === 'max' ? 'Maximum' : 'Recommended';
        return (
          <input
            key={suffix}
            type="text" inputMode="decimal"
            className={inputCls}
            placeholder={label}
            value={showNum(form[key])}
            onChange={(e) => setField(key, parseFloat(e.target.value))}
            onBlur={() => restoreOnBlur(key)}
          />
        );
      })}
    </div>
  );
}

export default function GoalsPage() {
  const { settings, invalidate } = useSettings();
  const { t } = useT();
  const { showToast } = useToast();

  const [plans, setPlans] = useState<GoalPlan[]>([]);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [calcWeight, setCalcWeight] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof calcMacroRanges> | null>(null);

  const [tdeeGoalType, setTdeeGoalType] = useState<GoalType>('maintain');
  const [tdeeResult, setTdeeResult]     = useState<TDEEResult | null>(null);
  const [suggestion, setSuggestion]     = useState<GoalSuggestion | null>(null);
  const [tdeeLoading, setTdeeLoading]   = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<GoalPlan | null>(null);

  // Snapshot of the form values that were loaded (active plan or plan being edited).
  // Used to restore numeric goal fields when the user empties one and blurs/saves.
  const prevFormRef = useRef<FormState>({});

  const reloadPlans = useCallback(() => {
    api.goals.listPlans().then(setPlans);
  }, []);

  // Initial load: pull plans, prefill form from today's active plan (or settings as fallback)
  useEffect(() => {
    api.goals.listPlans().then(list => {
      setPlans(list);
      const active = [...list].reverse().find(p => p.effective_from <= todayStr());
      if (active) {
        // Reset to "new period" mode — keep label/notes empty so Marco
        // intentionally describes the new period instead of inheriting.
        const f = planToForm(active);
        const next = { ...f, label: '', notes: '' };
        setForm(next);
        prevFormRef.current = next;
      } else {
        const next = settingsToForm(settings);
        setForm(next);
        prevFormRef.current = next;
      }
    });
    api.weight.getAll().then((entries) => {
      if (entries && entries.length > 0) {
        const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
        setCalcWeight(String(sorted[0].weight));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activePlan = [...plans].reverse().find(p => p.effective_from <= todayStr()) || null;

  function setField(key: keyof Settings | 'label' | 'notes' | 'goal_type', value: number | string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // If a numeric goal field was emptied (NaN/undefined), put back the value the form
  // was loaded with. Called from input onBlur and once before save.
  function restoreOnBlur(key: keyof Settings) {
    setForm((f) => {
      const v = f[key];
      if (v === undefined || (typeof v === 'number' && Number.isNaN(v))) {
        return { ...f, [key]: prevFormRef.current[key] };
      }
      return f;
    });
  }

  function sanitizeBeforeSave(f: FormState): FormState {
    const out: FormState = { ...f };
    for (const k of GOAL_FIELDS) {
      const v = out[k];
      if (v === undefined || (typeof v === 'number' && Number.isNaN(v))) {
        (out as Record<string, unknown>)[k] = prevFormRef.current[k];
      }
    }
    return out;
  }

  function startEditPlan(plan: GoalPlan) {
    setEditingPlanId(plan.id);
    const f = planToForm(plan);
    setForm(f);
    prevFormRef.current = f;
    setPreview(null);
    setSuggestion(null);
    setTdeeResult(null);
  }

  function cancelEdit() {
    setEditingPlanId(null);
    if (activePlan) {
      const f = planToForm(activePlan);
      const next = { ...f, label: '', notes: '' };
      setForm(next);
      prevFormRef.current = next;
    } else {
      const next = settingsToForm(settings);
      setForm(next);
      prevFormRef.current = next;
    }
    setPreview(null);
  }

  function handleCalculate() {
    const w = parseFloat(calcWeight);
    if (!w || w <= 0) return;
    const calories = Number(form.cal_rec) || 2000;
    const ranges = calcMacroRanges(w, calories);
    setPreview(ranges);
    setForm((f) => ({
      ...f,
      protein_min: ranges.protein_min, protein_max: ranges.protein_max, protein_rec: ranges.protein_rec,
      fat_min: ranges.fat_min,         fat_max: ranges.fat_max,         fat_rec: ranges.fat_rec,
      carbs_min: ranges.carbs_min,     carbs_max: ranges.carbs_max,     carbs_rec: ranges.carbs_rec,
      fiber_min: ranges.fiber_min,     fiber_max: ranges.fiber_max,     fiber_rec: ranges.fiber_rec,
    }));
  }

  function buildPlanInput(effective_from: string): GoalPlanInput {
    const f = sanitizeBeforeSave(form);
    const out: GoalPlanInput = {
      effective_from,
      label: f.label ?? '',
      notes: f.notes ?? '',
      goal_type: (f.goal_type ?? 'custom') as GoalType,
    };
    for (const k of GOAL_FIELDS) {
      const v = f[k];
      if (v !== undefined && v !== null && !Number.isNaN(v)) {
        (out as Record<string, unknown>)[k] = Number(v);
      }
    }
    return out;
  }

  async function handleSaveNewPeriod(effective_from: string) {
    await api.goals.savePlan(buildPlanInput(effective_from));
    invalidateGoalsCache();
    invalidate();
    reloadPlans();
    showToast(t("common.saved"));
    setPreview(null);
  }

  async function handleSaveInPlace() {
    if (!editingPlanId) return;
    const plan = plans.find(p => p.id === editingPlanId);
    if (!plan) return;
    await api.goals.savePlan(buildPlanInput(plan.effective_from));
    invalidateGoalsCache();
    invalidate();
    reloadPlans();
    setEditingPlanId(null);
    showToast(t("common.saved"));
    setPreview(null);
  }

  async function handleEstimateTDEE() {
    setTdeeLoading(true);
    try {
      const res = await api.goals.calculateTDEE();
      setTdeeResult(res);
      setSuggestion(null);
    } finally {
      setTdeeLoading(false);
    }
  }

  async function handleSuggest() {
    if (!tdeeResult?.tdee) return;
    const sug = await api.goals.suggest({ goal_type: tdeeGoalType, tdee: tdeeResult.tdee });
    setSuggestion(sug);
  }

  function applyTdeeSuggestion() {
    if (!suggestion) return;
    setForm(f => ({
      ...f,
      cal_rec: suggestion.cal_rec,
      cal_min: suggestion.cal_min,
      cal_max: suggestion.cal_max,
      protein_rec: suggestion.protein_rec,
      goal_type: tdeeGoalType,
    }));
    setSuggestion(null);
    setTdeeResult(null);
  }

  async function handleDeletePlan(id: number) {
    const res = await api.goals.deletePlan(id);
    if (res.ok) {
      invalidateGoalsCache();
      invalidate();
      reloadPlans();
      showToast(t("common.saved"));
    } else {
      showToast(res.reason || 'error', 'error');
    }
    setConfirmDelete(null);
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  const goalTypeLabels: Record<GoalType, string> = {
    lose: t('goals.type.lose'),
    maintain: t('goals.type.maintain'),
    gain: t('goals.type.gain'),
    custom: t('goals.type.custom'),
  };

  const confidenceColor = { low: 'text-red', medium: 'text-yellow', high: 'text-green' };

  // Compute "until" date for each plan in history (next plan's start, exclusive)
  const planRanges = plans.map((p, i) => {
    const next = plans[i + 1];
    return { plan: p, until: next ? next.effective_from : null };
  });
  const editingPlan = editingPlanId != null ? plans.find(p => p.id === editingPlanId) || null : null;
  const editingIsFuture = editingPlan ? editingPlan.effective_from > todayStr() : false;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader eyebrow={t("eyebrow.goals")} title={t("page.goals")} />

      {/* ── TDEE / Goal Intelligence ─────────────────────────────────────── */}
      <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
        <div>
          <h2 className="text-lg font-semibold text-text">{t('goals.intelligenceTitle')}</h2>
          <p className="text-sm text-text-sec mt-0.5">{t('goals.intelligenceNote')}</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-text-sec">{t('goals.myGoal')}</label>
          <div className="flex gap-2">
            {(['lose', 'maintain', 'gain'] as GoalType[]).map(g => (
              <button
                key={g}
                onClick={() => { setTdeeGoalType(g); setSuggestion(null); }}
                className={[
                  'flex-1 text-sm py-1.5 rounded-lg border cursor-pointer transition-colors',
                  tdeeGoalType === g ? 'border-accent bg-accent/10 text-accent font-medium' : 'border-border text-text-sec hover:text-text',
                ].join(' ')}
              >
                {goalTypeLabels[g]}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleEstimateTDEE}
          disabled={tdeeLoading}
          className="w-full rounded-xl bg-card border border-border text-text-sec py-2 text-sm hover:border-accent hover:text-accent cursor-pointer disabled:opacity-40 transition-colors"
        >
          {tdeeLoading ? t('goals.calculating') : t('goals.estimateTdee')}
        </button>

        {tdeeResult && (
          <div className="rounded-xl border border-border p-4 space-y-3">
            {tdeeResult.tdee ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-text-sec">{t('goals.estimatedTdee')}</div>
                    <div className="text-2xl font-bold text-text tabular-nums">{tdeeResult.tdee} kcal</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-text-sec">{t('goals.confidence')}</div>
                    <div className={`text-sm font-medium capitalize ${confidenceColor[tdeeResult.confidence]}`}>
                      {tdeeResult.confidence}
                    </div>
                    <div className="text-xs text-text-sec">{tdeeResult.data_points} {t('goals.daysOfData')}</div>
                  </div>
                </div>
                <button
                  onClick={handleSuggest}
                  className="w-full rounded-xl bg-accent text-white py-2 text-sm font-semibold hover:opacity-90 cursor-pointer"
                >
                  {t('goals.suggestFor')} "{goalTypeLabels[tdeeGoalType]}"
                </button>
              </>
            ) : (
              <p className="text-sm text-text-sec text-center py-2">
                {t('goals.notEnoughData')} ({tdeeResult.data_points} {t('goals.daysLogged')}).
              </p>
            )}
          </div>
        )}

        {suggestion && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
            <div className="text-sm font-semibold text-text">{t('goals.suggestedTargets')}</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between"><span className="text-text-sec">{t('goals.calRec')}</span><span className="font-medium text-text tabular-nums">{suggestion.cal_rec} kcal</span></div>
              <div className="flex justify-between"><span className="text-text-sec">{t('goals.range')}</span><span className="text-text tabular-nums">{suggestion.cal_min}–{suggestion.cal_max}</span></div>
              <div className="flex justify-between"><span className="text-text-sec">{t('goals.proteinRec')}</span><span className="font-medium text-text tabular-nums">{suggestion.protein_rec}g</span></div>
              {suggestion.rate_per_week_kg !== 0 && (
                <div className="flex justify-between"><span className="text-text-sec">{t('goals.rate')}</span><span className={`tabular-nums font-medium ${suggestion.rate_per_week_kg < 0 ? 'text-green' : 'text-accent'}`}>{suggestion.rate_per_week_kg > 0 ? '+' : ''}{suggestion.rate_per_week_kg} kg/wk</span></div>
              )}
            </div>
            <button
              onClick={applyTdeeSuggestion}
              className="w-full rounded-xl bg-accent text-white py-2 text-sm font-semibold hover:opacity-90 cursor-pointer"
            >
              {t('goals.applySuggestion')}
            </button>
          </div>
        )}
      </div>

      {/* Macro Calculator */}
      <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
        <div>
          <h2 className="text-lg font-semibold text-text">{t("goals.calcTitle")}</h2>
          <p className="text-sm text-text-sec mt-0.5">{t("goals.calcNote")}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-text-sec">{t("goals.calcWeight")}</label>
            <input
              type="text" inputMode="decimal"
              className={inputCls}
              placeholder="kg"
              value={calcWeight}
              onChange={(e) => setCalcWeight(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-sec">{t("goals.calcCalories")}</label>
            <input
              type="text" inputMode="decimal"
              className={inputCls}
              value={showNum(form.cal_rec)}
              onChange={(e) => setField("cal_rec", parseFloat(e.target.value))}
              onBlur={() => restoreOnBlur('cal_rec')}
            />
          </div>
        </div>

        <button
          onClick={handleCalculate}
          className="w-full rounded-xl bg-accent text-white py-2 text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
        >
          {t("goals.calcBtn")}
        </button>

        {preview && (
          <div className="flex flex-wrap gap-2 pt-1">
            {MACROS.map((macro) => {
              const rec = preview[`${macro}_rec` as keyof typeof preview] as number;
              return (
                <span
                  key={macro}
                  className="rounded-full bg-accent/10 border border-accent/30 text-accent text-xs px-3 py-1 font-medium"
                >
                  {t(`settings.${macro}`)}: {t("goals.rec")} {rec}g
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Goals Form */}
      <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
        {editingPlanId != null && (
          <div className="rounded-lg bg-accent/10 border border-accent/30 px-3 py-2 text-sm text-accent flex items-center justify-between">
            <span>
              {editingIsFuture ? t('goals.editingFuture') : t('goals.editingCurrent')}
              {editingPlan && <> · <span className="tabular-nums">{editingPlan.effective_from}</span></>}
            </span>
            <button
              onClick={cancelEdit}
              className="text-xs text-text-sec hover:text-text underline cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </div>
        )}

        {/* Period metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-text-sec">{t('goals.planLabel')}</label>
            <input
              type="text"
              className={inputCls}
              placeholder={t('goals.planLabelPh')}
              value={form.label ?? ''}
              onChange={(e) => setField('label', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-sec">{t('goals.planType')}</label>
            <select
              className={inputCls}
              value={form.goal_type ?? 'custom'}
              onChange={(e) => setField('goal_type', e.target.value as GoalType)}
            >
              <option value="lose">{goalTypeLabels.lose}</option>
              <option value="maintain">{goalTypeLabels.maintain}</option>
              <option value="gain">{goalTypeLabels.gain}</option>
              <option value="custom">{goalTypeLabels.custom}</option>
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-text-sec">{t('goals.planNotes')}</label>
          <textarea
            className={inputCls + ' min-h-[60px]'}
            placeholder={t('goals.planNotesPh')}
            value={form.notes ?? ''}
            onChange={(e) => setField('notes', e.target.value)}
          />
        </div>

        {/* Calories */}
        <div className="space-y-2 pt-1">
          <h3 className="text-sm font-semibold text-text">{t("settings.dailyCal")}</h3>
          <div className="grid grid-cols-3 gap-2">
            {(["cal_min", "cal_rec", "cal_max"] as const).map((key) => {
              const suffix = key.split("_")[1];
              const label = suffix === 'min' ? 'Minimum' : suffix === 'max' ? 'Maximum' : 'Recommended';
              return (
                <input
                  key={key}
                  type="text" inputMode="decimal"
                  className={inputCls}
                  placeholder={label}
                  value={showNum(form[key])}
                  onChange={(e) => setField(key, parseFloat(e.target.value))}
                  onBlur={() => restoreOnBlur(key)}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs text-text-sec px-1">
            <span>Minimum</span><span>Recommended</span><span>Maximum</span>
          </div>
        </div>

        {/* Macros header */}
        <div className="grid grid-cols-4 gap-2 text-xs text-text-sec px-1">
          <span></span><span>Minimum</span><span>Recommended</span><span>Maximum</span>
        </div>

        <div className="space-y-3">
          {MACROS.map((macro) => (
            <MacroRow key={macro} macro={macro} form={form} inputCls={inputCls} setField={setField} restoreOnBlur={restoreOnBlur} t={t} />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="space-y-1">
            <label className="text-xs text-text-sec">{t("settings.goalWeight")}</label>
            <input
              type="text" inputMode="decimal"
              className={inputCls}
              value={showNum(form.weight_goal)}
              onChange={(e) => setField("weight_goal", parseFloat(e.target.value))}
              onBlur={() => restoreOnBlur('weight_goal')}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-sec">{t("settings.waterGoal")}</label>
            <input
              type="text" inputMode="decimal"
              className={inputCls}
              value={showNum(form.water_goal)}
              onChange={(e) => setField("water_goal", parseFloat(e.target.value))}
              onBlur={() => restoreOnBlur('water_goal')}
            />
          </div>
        </div>

        {/* Tolerances */}
        <div className="space-y-2 pt-1">
          <h3 className="text-sm font-semibold text-text">{t("settings.tolTitle")}</h3>
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 3] as const).map((n) => {
              const key = `tol_${n}` as keyof Settings;
              return (
                <div key={n} className="space-y-1">
                  <label className="text-xs text-text-sec">{t(`settings.tol${n}`)}</label>
                  <input
                    type="text" inputMode="decimal"
                    className={inputCls}
                    value={showNum(form[key])}
                    onChange={(e) => setField(key, parseFloat(e.target.value))}
                    onBlur={() => restoreOnBlur(key)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Save buttons */}
      {editingPlanId == null ? (
        <div className="space-y-2">
          <button
            onClick={() => handleSaveNewPeriod(todayStr())}
            className="w-full rounded-xl bg-accent text-white py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            {t('goals.saveNewPeriodToday')}
          </button>
          <p className="text-xs text-text-sec text-center">{t('goals.saveNewPeriodHint')}</p>
          <button
            onClick={() => {
              const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
              handleSaveNewPeriod(tomorrow.toISOString().slice(0, 10));
            }}
            className="w-full rounded-xl bg-card border border-border text-text-sec py-2 text-xs hover:border-accent hover:text-accent cursor-pointer transition-colors"
          >
            {t('goals.saveStartingTomorrow')}
          </button>
          {activePlan && (
            <button
              onClick={() => startEditPlan(activePlan)}
              className="w-full rounded-xl bg-card border border-border text-text-sec py-2 text-xs hover:border-accent hover:text-accent cursor-pointer transition-colors"
            >
              {t('goals.updateInPlace')}
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={handleSaveInPlace}
          className="w-full rounded-xl bg-accent text-white py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
        >
          {t('common.save')}
        </button>
      )}

      {/* Goal history */}
      <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
        <h2 className="text-lg font-semibold text-text">{t('goals.history')}</h2>
        {plans.length === 0 ? (
          <p className="text-sm text-text-sec">{t('goals.historyEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {[...planRanges].reverse().map(({ plan, until }) => {
              const isFuture = plan.effective_from > todayStr();
              const isActive = plan === activePlan;
              return (
                <li key={plan.id} className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-text tabular-nums">{plan.effective_from}</span>
                        <span className="text-text-sec text-xs">→</span>
                        <span className="text-text-sec text-xs tabular-nums">
                          {until ?? t('goals.current')}
                        </span>
                        {isActive && <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/30">{t('goals.active')}</span>}
                        {isFuture && <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-yellow/10 text-yellow border border-yellow/30">{t('goals.future')}</span>}
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-bg text-text-sec border border-border">{goalTypeLabels[plan.goal_type] ?? plan.goal_type}</span>
                      </div>
                      {plan.label && <div className="text-sm text-text mt-0.5">{plan.label}</div>}
                      <div className="text-xs text-text-sec mt-0.5 tabular-nums">
                        {plan.cal_rec ?? '—'} kcal
                        {plan.protein_rec != null && <> · P {plan.protein_rec}g</>}
                        {plan.carbs_rec != null && <> · C {plan.carbs_rec}g</>}
                        {plan.fat_rec != null && <> · F {plan.fat_rec}g</>}
                        {plan.fiber_rec != null && <> · Fib {plan.fiber_rec}g</>}
                      </div>
                      {plan.notes && <div className="text-xs text-text-sec mt-1 whitespace-pre-line">{plan.notes}</div>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {(isActive || isFuture) && (
                        <button
                          onClick={() => startEditPlan(plan)}
                          className="text-xs text-text-sec border border-border rounded-md px-2 py-1 hover:border-accent hover:text-accent cursor-pointer transition-colors"
                        >
                          {t('common.edit')}
                        </button>
                      )}
                      {isFuture && (
                        <button
                          onClick={() => setConfirmDelete(plan)}
                          className="text-xs text-red border border-red/30 rounded-md px-2 py-1 hover:bg-red/10 cursor-pointer transition-colors"
                        >
                          {t('common.cancel')}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message={t('goals.cancelFutureMsg')}
          confirmLabel={t('common.cancel')}
          cancelLabel={t('common.keep')}
          dangerous
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDeletePlan(confirmDelete.id)}
        />
      )}
    </div>
  );
}
