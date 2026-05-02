import { useState, useEffect, useCallback } from "react";
import { useSettings } from "../hooks/useSettings";
import { useT } from "../i18n/useT";
import { api } from "../api";
import { linearRegression } from "../lib/macroCalc";
import { today, fmtDate, formatShortDate, MS_PER_DAY } from "../lib/dateUtil";
import { copyToClipboard } from "../lib/exportText";
import { useToast } from "../components/Toast";
import LineChartCard from "../components/LineChartCard";
import RangePicker from "../components/ui/RangePicker";
import Tabs from "../components/ui/Tabs";
import ModalFooter from "../components/ui/ModalFooter";
import PageHeader from "../components/ui/PageHeader";
import Modal from "../components/Modal";
import type { WeightEntry, Scale } from "../types";

// Golden-ratio hue shift picks visually distinct colors for any scale id.
function colorForScaleId(id: number | null | undefined): string {
  if (id == null) return 'var(--accent2)';
  const hue = (id * 137) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

type Tab = 'weight' | 'body';

export default function WeightPage() {
  const { settings } = useSettings();
  const { t } = useT();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('weight');
  const [range, setRange] = useState<30 | 90 | 180 | 365 | 'all'>(180);

  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [date, setDate]       = useState(today());
  const [weight, setWeight]   = useState('');
  // Body comp fields
  const [fatPct, setFatPct]           = useState('');
  const [muscleMass, setMuscleMass]   = useState('');
  const [waterPct, setWaterPct]       = useState('');
  const [boneMass, setBoneMass]       = useState('');
  // Scales
  const [scales, setScales]           = useState<Scale[]>([]);
  const [scaleId, setScaleId]         = useState<number | null>(null);
  // Edit modal
  const [editing, setEditing]         = useState<WeightEntry | null>(null);
  const [editDate, setEditDate]         = useState('');
  const [editWeight, setEditWeight]     = useState('');
  const [editFatPct, setEditFatPct]     = useState('');
  const [editMuscle, setEditMuscle]     = useState('');
  const [editWater, setEditWater]       = useState('');
  const [editBone, setEditBone]         = useState('');
  const [editScaleId, setEditScaleId]   = useState<number | null>(null);

  const loadEntries = useCallback(async () => {
    const data = await api.weight.getAll();
    setEntries([...(data ?? [])].sort((a, b) => b.date.localeCompare(a.date)));
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  useEffect(() => {
    api.scales.getAll().then(list => {
      setScales(list);
      const stored = Number(localStorage.getItem('weightScaleId') || '');
      const existing = list.find(s => s.id === stored);
      const def = list.find(s => s.is_default) ?? list[0];
      setScaleId((existing ?? def)?.id ?? null);
    });
  }, []);

  function pickScale(id: number) {
    setScaleId(id);
    localStorage.setItem('weightScaleId', String(id));
  }

  async function handleAdd() {
    const w = parseFloat(weight);
    if (!w || w <= 0 || !date) return;
    await api.weight.add({
      weight: w,
      date,
      fat_pct:     fatPct     ? parseFloat(fatPct)     : null,
      muscle_mass: muscleMass ? parseFloat(muscleMass) : null,
      water_pct:   waterPct   ? parseFloat(waterPct)   : null,
      bone_mass:   boneMass   ? parseFloat(boneMass)   : null,
      scale_id:    scaleId,
    });
    setWeight(''); setFatPct(''); setMuscleMass(''); setWaterPct(''); setBoneMass('');
    setDate(today());
    await loadEntries();
  }

  async function handleDelete(id: number) {
    await api.weight.delete(id);
    await loadEntries();
  }

  function openEdit(entry: WeightEntry) {
    setEditing(entry);
    setEditDate(entry.date);
    setEditWeight(String(entry.weight));
    setEditFatPct(entry.fat_pct != null ? String(entry.fat_pct) : '');
    setEditMuscle(entry.muscle_mass != null ? String(entry.muscle_mass) : '');
    setEditWater(entry.water_pct != null ? String(entry.water_pct) : '');
    setEditBone(entry.bone_mass != null ? String(entry.bone_mass) : '');
    setEditScaleId(entry.scale_id);
  }

  async function handleSaveEdit() {
    if (!editing) return;
    const w = parseFloat(editWeight);
    if (!w || w <= 0 || !editDate) return;
    const res = await api.weight.update({
      id: editing.id,
      weight: w,
      date: editDate,
      fat_pct:     editFatPct ? parseFloat(editFatPct) : null,
      muscle_mass: editMuscle ? parseFloat(editMuscle) : null,
      water_pct:   editWater  ? parseFloat(editWater)  : null,
      bone_mass:   editBone   ? parseFloat(editBone)   : null,
      scale_id:    editScaleId,
    });
    if (!res.ok) {
      if (res.reason === 'duplicate_date') showToast(t('weight.duplicateDate'), 'error');
      return;
    }
    setEditing(null);
    await loadEntries();
  }

  const currentWeight = entries.length > 0 ? entries[0].weight : null;
  const goalWeight    = settings.weight_goal || null;

  const cutoffMs = range === 'all' ? 0 : Date.now() - range * MS_PER_DAY;
  const inRange = (d: string) => new Date(d).getTime() >= cutoffMs;

  function getPrediction(): string {
    const sorted = [...entries]
      .filter(e => inRange(e.date))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 2) return t("weight.needData");
    // Regress on real timestamps so unevenly-spaced logs (e.g. a daily cluster vs a weekly point) get correct slope.
    const xs = sorted.map(e => new Date(e.date).getTime());
    const ys = sorted.map(e => e.weight);
    const { slope, intercept } = linearRegression(xs, ys);
    if (!goalWeight) return "—";
    const nowMs = Date.now();
    const currentVal = slope * nowMs + intercept;
    const diff = currentVal - goalWeight;
    if (Math.abs(diff) < 0.1) return t("weight.reached");
    if (slope === 0) return "—";
    const goingDown = goalWeight < currentVal;
    if (goingDown && slope > 0) return t("weight.wrongWay");
    if (!goingDown && slope < 0) return t("weight.wrongWay");
    const msNeeded = Math.abs(diff / slope);
    const targetDate = new Date(nowMs + msNeeded);
    const yy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    return fmtDate(`${yy}-${mm}-${dd}`);
  }

  const prediction = getPrediction();

  const chartData = [...entries]
    .filter(e => inRange(e.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ label: formatShortDate(e.date), date: e.date, value: e.weight, color: colorForScaleId(e.scale_id) }));

  async function handleCopyHistory() {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const hasBody = sorted.some(e => e.fat_pct != null || e.muscle_mass != null || e.water_pct != null || e.bone_mass != null);
    const header = hasBody
      ? 'Date\tWeight (kg)\tScale\tFat %\tMuscle (kg)\tWater %\tBone (kg)'
      : 'Date\tWeight (kg)\tScale';
    const lines = sorted.map(e => {
      const base = `${e.date}\t${e.weight}\t${e.scale_name ?? ''}`;
      if (!hasBody) return base;
      return `${base}\t${e.fat_pct ?? ''}\t${e.muscle_mass ?? ''}\t${e.water_pct ?? ''}\t${e.bone_mass ?? ''}`;
    });
    const text = [header, ...lines].join('\n');
    const ok = await copyToClipboard(text);
    showToast(ok ? t('export.copied') : t('export.copyFailed'), ok ? 'success' : 'error');
  }

  // Body comp data (only entries with fat_pct)
  const bodyEntries = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(e => e.fat_pct != null || e.muscle_mass != null);

  const fatData    = bodyEntries.filter(e => e.fat_pct     != null && inRange(e.date)).map(e => ({ label: formatShortDate(e.date), date: e.date, value: e.fat_pct! }));
  const muscleData = bodyEntries.filter(e => e.muscle_mass != null && inRange(e.date)).map(e => ({ label: formatShortDate(e.date), date: e.date, value: e.muscle_mass! }));
  const waterData  = bodyEntries.filter(e => e.water_pct   != null && inRange(e.date)).map(e => ({ label: formatShortDate(e.date), date: e.date, value: e.water_pct! }));

  const latestBodyComp = entries.find(e => e.fat_pct != null || e.muscle_mass != null);

  const inputCls = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader eyebrow={t('eyebrow.weight')} title={t('page.weight')} />

      <Tabs<Tab>
        items={[{ id: 'weight', label: 'Weight' }, { id: 'body', label: 'Composition' }]}
        active={tab}
        onChange={setTab}
        className="-mt-2"
      />

      {/* ── WEIGHT TAB ─────────────────────────────────────────────────────── */}
      {tab === 'weight' && (
        <>
          {/* Log form */}
          <div className="bg-card rounded-xl p-4 border border-border space-y-3">
            <h2 className="text-base font-semibold text-text">{t("weight.logWeight")}</h2>
            <div className="flex gap-3 items-end flex-wrap">
              <input type="date" className={`${inputCls} flex-1 min-w-[140px]`} value={date} onChange={e => setDate(e.target.value)} />
              <input
                type="text" inputMode="decimal"
                className={`${inputCls} w-32`}
                placeholder={t("weight.kgPlaceholder")}
                value={weight}
                onChange={e => setWeight(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
              />
              {scales.length > 0 && (
                <select
                  className={`${inputCls} w-auto`}
                  value={scaleId ?? ''}
                  onChange={e => pickScale(Number(e.target.value))}
                  title={t("weight.scale")}
                >
                  {scales.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
              <button onClick={handleAdd} className="rounded-xl bg-accent text-white px-5 py-2 text-sm font-semibold hover:opacity-90 cursor-pointer">
                {t("common.add")}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t("weight.current"),       value: currentWeight != null ? `${currentWeight} kg` : "—" },
              { label: t("weight.goal"),           value: goalWeight != null ? `${goalWeight} kg` : "—" },
              { label: t("weight.predictedDate"),  value: prediction },
            ].map(stat => (
              <div key={stat.label} className="bg-card rounded-xl p-4 border border-border flex flex-col gap-1">
                <span className="text-xs text-text-sec">{stat.label}</span>
                <span className="text-sm font-semibold text-text truncate">{stat.value}</span>
              </div>
            ))}
          </div>

          {chartData.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-end">
                <RangePicker
                  value={range}
                  options={[30, 90, 180, 365, 'all'] as const}
                  onChange={setRange}
                  formatLabel={r => r === 'all' ? (t('meas.rangeAll') ?? 'All') : `${r}d`}
                />
              </div>
              <LineChartCard data={chartData} goalValue={settings.weight_goal || undefined} showTrend={true} unit=" kg" height={250} />
              {scales.length > 1 && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-sec">
                  {scales.map(s => (
                    <span key={s.id} className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorForScaleId(s.id) }} />
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleCopyHistory}
              disabled={entries.length === 0}
              className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text disabled:opacity-40 cursor-pointer transition-colors"
            >
              📋 {t('weight.copyHistory')}
            </button>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {entries.length === 0 ? (
              <p className="text-sm text-text-sec text-center py-8">{t("weight.noEntries")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-sec text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">{t("weight.dateCol")}</th>
                    <th className="text-right px-4 py-3">{t("weight.weightCol")}</th>
                    <th className="text-right px-4 py-3">{t("weight.scale")}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => (
                    <tr key={entry.id} className="border-b border-border/50 last:border-0 hover:bg-bg/50 transition-colors">
                      <td className="px-4 py-3 text-text">{fmtDate(entry.date)}</td>
                      <td className="px-4 py-3 text-right font-medium text-text tabular-nums">{entry.weight} kg</td>
                      <td className="px-4 py-3 text-right text-text-sec">{entry.scale_name ?? '—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => openEdit(entry)} title={t('common.edit')} className="text-text-sec hover:text-accent transition-colors px-1 cursor-pointer">✎</button>
                        <button onClick={() => handleDelete(entry.id)} title={t('common.delete')} className="text-text-sec hover:text-red transition-colors px-1 cursor-pointer">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── EDIT MODAL ─────────────────────────────────────────────────────── */}
      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={t('weight.editEntry')}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-text-sec">{t('weight.dateCol')}</label>
              <input type="date" className={inputCls} value={editDate} onChange={e => setEditDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-sec">{t('weight.weightCol')}</label>
              <input type="text" inputMode="decimal" className={inputCls} value={editWeight} onChange={e => setEditWeight(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-sec">Body fat (%)</label>
              <input type="text" inputMode="decimal" className={inputCls} value={editFatPct} onChange={e => setEditFatPct(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-sec">Muscle mass (kg)</label>
              <input type="text" inputMode="decimal" className={inputCls} value={editMuscle} onChange={e => setEditMuscle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-sec">Body water (%)</label>
              <input type="text" inputMode="decimal" className={inputCls} value={editWater} onChange={e => setEditWater(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-sec">Bone mass (kg)</label>
              <input type="text" inputMode="decimal" className={inputCls} value={editBone} onChange={e => setEditBone(e.target.value)} />
            </div>
            {scales.length > 0 && (
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-text-sec">{t('weight.scale')}</label>
                <select className={inputCls} value={editScaleId ?? ''} onChange={e => setEditScaleId(e.target.value ? Number(e.target.value) : null)}>
                  {scales.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <ModalFooter
            onCancel={() => setEditing(null)}
            onConfirm={handleSaveEdit}
            cancelLabel={t('common.cancel')}
            confirmLabel={t('common.save')}
            confirmDisabled={!editWeight || !editDate}
            className="pt-2"
          />
        </div>
      </Modal>

      {/* ── BODY COMPOSITION TAB ───────────────────────────────────────────── */}
      {tab === 'body' && (
        <>
          {/* Log form */}
          <div className="bg-card rounded-xl p-4 border border-border space-y-3">
            <h2 className="text-base font-semibold text-text">Log body composition</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Date</label>
                <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Weight (kg, required)</label>
                <input type="text" inputMode="decimal" className={inputCls} placeholder="kg" value={weight} onChange={e => setWeight(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Body fat (%)</label>
                <input type="text" inputMode="decimal" className={inputCls} placeholder="e.g. 18.5" value={fatPct} onChange={e => setFatPct(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Muscle mass (kg)</label>
                <input type="text" inputMode="decimal" className={inputCls} placeholder="kg" value={muscleMass} onChange={e => setMuscleMass(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Body water (%)</label>
                <input type="text" inputMode="decimal" className={inputCls} placeholder="e.g. 55" value={waterPct} onChange={e => setWaterPct(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Bone mass (kg)</label>
                <input type="text" inputMode="decimal" className={inputCls} placeholder="kg" value={boneMass} onChange={e => setBoneMass(e.target.value)} />
              </div>
              {scales.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs text-text-sec">{t("weight.scale")}</label>
                  <select
                    className={inputCls}
                    value={scaleId ?? ''}
                    onChange={e => pickScale(Number(e.target.value))}
                  >
                    {scales.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <button onClick={handleAdd} disabled={!weight} className="w-full rounded-xl bg-accent text-white py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer">
              {t("common.add")}
            </button>
          </div>

          {/* Latest stats */}
          {latestBodyComp && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Body fat',    value: latestBodyComp.fat_pct     != null ? `${latestBodyComp.fat_pct}%`     : '—' },
                { label: 'Muscle mass', value: latestBodyComp.muscle_mass != null ? `${latestBodyComp.muscle_mass} kg` : '—' },
                { label: 'Body water',  value: latestBodyComp.water_pct   != null ? `${latestBodyComp.water_pct}%`   : '—' },
                { label: 'Bone mass',   value: latestBodyComp.bone_mass   != null ? `${latestBodyComp.bone_mass} kg` : '—' },
              ].map(s => (
                <div key={s.label} className="bg-card border border-border rounded-xl p-4">
                  <div className="text-xs text-text-sec mb-1">{s.label}</div>
                  <div className="text-lg font-bold text-text">{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Charts */}
          {fatData.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs font-semibold text-text-sec uppercase tracking-wider mb-3">Body fat %</p>
              <LineChartCard data={fatData} unit="%" height={200} showTrend={fatData.length >= 3} />
            </div>
          )}
          {muscleData.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs font-semibold text-text-sec uppercase tracking-wider mb-3">Muscle mass</p>
              <LineChartCard data={muscleData} unit=" kg" height={200} showTrend={muscleData.length >= 3} />
            </div>
          )}
          {waterData.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs font-semibold text-text-sec uppercase tracking-wider mb-3">Body water %</p>
              <LineChartCard data={waterData} unit="%" height={200} showTrend={waterData.length >= 3} />
            </div>
          )}

          {bodyEntries.length === 0 && (
            <p className="text-sm text-text-sec text-center py-8">No body composition data yet. Log a measurement above.</p>
          )}
        </>
      )}
    </div>
  );
}
