import { useState, useEffect } from "react";
import { useSettings } from "../hooks/useSettings";
import { useT } from "../i18n/useT";
import { useToast } from "../components/Toast";
import { calcMacroRanges } from "../lib/macroCalc";
import { api } from "../api";
import type { Settings, GoalType, TDEEResult, GoalSuggestion } from "../types";
import PageHeader from "../components/ui/PageHeader";

type MacroField = "protein" | "carbs" | "fat" | "fiber";

const MACROS: MacroField[] = ["fat", "carbs", "fiber", "protein"];

// Defined outside GoalsPage so its identity is stable across re-renders.
function MacroRow({ macro, form, inputCls, setField, t }: {
  macro: MacroField;
  form: Partial<Settings>;
  inputCls: string;
  setField: (k: keyof Settings, v: number) => void;
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
            value={(form[key] as number) ?? ""}
            onChange={(e) => setField(key, parseFloat(e.target.value))}
          />
        );
      })}
    </div>
  );
}

export default function GoalsPage() {
  const { settings, updateSettings } = useSettings();
  const { t } = useT();
  const { showToast } = useToast();

  const [form, setForm] = useState<Partial<Settings>>({});
  const [calcWeight, setCalcWeight] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof calcMacroRanges> | null>(null);

  // TDEE / goal intelligence state
  const [goalType, setGoalType]         = useState<GoalType>('maintain');
  const [tdeeResult, setTdeeResult]     = useState<TDEEResult | null>(null);
  const [suggestion, setSuggestion]     = useState<GoalSuggestion | null>(null);
  const [tdeeLoading, setTdeeLoading]   = useState(false);

  useEffect(() => {
    setForm({ ...settings });
    api.weight.getAll().then((entries) => {
      if (entries && entries.length > 0) {
        const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
        setCalcWeight(String(sorted[0].weight));
      }
    });
  }, [settings]);

  function setField(key: keyof Settings, value: number | string) {
    setForm((f) => ({ ...f, [key]: value }));
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

  async function handleSave() {
    await updateSettings(form);
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
    const sug = await api.goals.suggest({ goal_type: goalType, tdee: tdeeResult.tdee });
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
    }));
    setSuggestion(null);
    setTdeeResult(null);
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  const goalTypeLabels: Record<GoalType, string> = {
    lose: 'Lose weight',
    maintain: 'Maintain',
    gain: 'Gain weight',
  };

  const confidenceColor = { low: 'text-red', medium: 'text-yellow', high: 'text-green' };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader eyebrow={t("eyebrow.goals")} title={t("page.goals")} />

      {/* ── TDEE / Goal Intelligence ─────────────────────────────────────── */}
      <div className="bg-card rounded-xl p-4 space-y-3 border border-border">
        <div>
          <h2 className="text-lg font-semibold text-text">Goal Intelligence</h2>
          <p className="text-sm text-text-sec mt-0.5">Estimate your TDEE from logged data and get smart calorie targets.</p>
        </div>

        {/* Goal type */}
        <div className="space-y-1.5">
          <label className="text-xs text-text-sec">My goal</label>
          <div className="flex gap-2">
            {(['lose', 'maintain', 'gain'] as GoalType[]).map(g => (
              <button
                key={g}
                onClick={() => { setGoalType(g); setSuggestion(null); }}
                className={[
                  'flex-1 text-sm py-1.5 rounded-lg border cursor-pointer transition-colors',
                  goalType === g ? 'border-accent bg-accent/10 text-accent font-medium' : 'border-border text-text-sec hover:text-text',
                ].join(' ')}
              >
                {goalTypeLabels[g]}
              </button>
            ))}
          </div>
        </div>

        {/* Estimate TDEE */}
        <button
          onClick={handleEstimateTDEE}
          disabled={tdeeLoading}
          className="w-full rounded-xl bg-card border border-border text-text-sec py-2 text-sm hover:border-accent hover:text-accent cursor-pointer disabled:opacity-40 transition-colors"
        >
          {tdeeLoading ? 'Calculating…' : 'Estimate TDEE from my history'}
        </button>

        {tdeeResult && (
          <div className="rounded-xl border border-border p-4 space-y-3">
            {tdeeResult.tdee ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-text-sec">Estimated TDEE</div>
                    <div className="text-2xl font-bold text-text tabular-nums">{tdeeResult.tdee} kcal</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-text-sec">Confidence</div>
                    <div className={`text-sm font-medium capitalize ${confidenceColor[tdeeResult.confidence]}`}>
                      {tdeeResult.confidence}
                    </div>
                    <div className="text-xs text-text-sec">{tdeeResult.data_points} days of data</div>
                  </div>
                </div>
                <button
                  onClick={handleSuggest}
                  className="w-full rounded-xl bg-accent text-white py-2 text-sm font-semibold hover:opacity-90 cursor-pointer"
                >
                  Suggest targets for "{goalTypeLabels[goalType]}"
                </button>
              </>
            ) : (
              <p className="text-sm text-text-sec text-center py-2">
                Not enough data yet ({tdeeResult.data_points} days logged). Log at least 5 days of food to estimate TDEE.
              </p>
            )}
          </div>
        )}

        {suggestion && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
            <div className="text-sm font-semibold text-text">Suggested targets</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between"><span className="text-text-sec">Calories rec.</span><span className="font-medium text-text tabular-nums">{suggestion.cal_rec} kcal</span></div>
              <div className="flex justify-between"><span className="text-text-sec">Range</span><span className="text-text tabular-nums">{suggestion.cal_min}–{suggestion.cal_max}</span></div>
              <div className="flex justify-between"><span className="text-text-sec">Protein rec.</span><span className="font-medium text-text tabular-nums">{suggestion.protein_rec}g</span></div>
              {suggestion.rate_per_week_kg !== 0 && (
                <div className="flex justify-between"><span className="text-text-sec">Rate</span><span className={`tabular-nums font-medium ${suggestion.rate_per_week_kg < 0 ? 'text-green' : 'text-accent'}`}>{suggestion.rate_per_week_kg > 0 ? '+' : ''}{suggestion.rate_per_week_kg} kg/wk</span></div>
              )}
            </div>
            <button
              onClick={applyTdeeSuggestion}
              className="w-full rounded-xl bg-accent text-white py-2 text-sm font-semibold hover:opacity-90 cursor-pointer"
            >
              Apply to my goals
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
              value={form.cal_rec ?? ""}
              onChange={(e) => setField("cal_rec", parseFloat(e.target.value))}
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
        {/* Calories */}
        <div className="space-y-2">
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
                  value={form[key] as number ?? ""}
                  onChange={(e) => setField(key, parseFloat(e.target.value))}
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
            <MacroRow key={macro} macro={macro} form={form} inputCls={inputCls} setField={setField} t={t} />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="space-y-1">
            <label className="text-xs text-text-sec">{t("settings.goalWeight")}</label>
            <input
              type="text" inputMode="decimal"
              className={inputCls}
              value={form.weight_goal ?? ""}
              onChange={(e) => setField("weight_goal", parseFloat(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-sec">{t("settings.waterGoal")}</label>
            <input
              type="text" inputMode="decimal"
              className={inputCls}
              value={form.water_goal ?? ""}
              onChange={(e) => setField("water_goal", parseFloat(e.target.value))}
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
                    value={form[key] as number ?? ""}
                    onChange={(e) => setField(key, parseFloat(e.target.value))}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        className="w-full rounded-xl bg-accent text-white py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
      >
        {t("common.save")}
      </button>
    </div>
  );
}
