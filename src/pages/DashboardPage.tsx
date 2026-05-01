import { useState, useEffect, useCallback, useRef } from 'react';
import { evalExpr, resolveExpr } from '../lib/evalExpr';
import { useSettings } from '../hooks/useSettings';
import { useT } from '../i18n/useT';
import { useToast } from '../components/Toast';
import { useNavigate } from '../hooks/useNavigate';
import { api } from '../api';
import FoodSearch from '../components/FoodSearch';
import type { SearchItem } from '../components/FoodSearch';
import MealPills from '../components/MealPills';
import DayMacrosCard from '../components/DayMacrosCard';
import EntryTable from '../components/EntryTable';
import Modal from '../components/Modal';
import { today, fmtDateWithWeekday, addDays } from '../lib/dateUtil';
import { buildDayMarkdown, copyToClipboard } from '../lib/exportText';
import ExerciseSection from '../components/ExerciseSection';
import CollapsibleSection from '../components/dashboard/CollapsibleSection';
import {
  SUPPLEMENT_TIME_ORDER,
  type LogEntry, type Food, type Recipe, type RecipeIngredient, type Meal,
  type WaterEntry, type SupplementDay, type FrequentFood, type DailyEnergy,
} from '../types';
import { useDeductionEvents } from '../hooks/useDeductionEvents';
import { usePantry } from '../hooks/usePantry';
import DeductionEventModal from '../components/DeductionEventModal';
import QuickFoodDialog from '../components/dashboard/QuickFoodDialog';
import SwapDaysModal from '../components/dashboard/SwapDaysModal';
import MacroChips from '../components/ui/MacroChips';
import { scaleNutrients } from '../lib/macroCalc';
import { formatPacked } from '../lib/pantryUtils';

// ── Recipe editor (inline on dashboard) ──────────────────────────────────────

interface RecipeEditState {
  id: number;
  name: string;
  ingredients: (RecipeIngredient & { editGrams: number })[];
}

// ── DashboardPage ─────────────────────────────────────────────────────────────

interface DashboardPageProps {
  initialDate?: string;
  fromWeek?: string;
}

export default function DashboardPage({ initialDate, fromWeek }: DashboardPageProps = {}) {
  const { settings } = useSettings();
  const { t } = useT();
  const { showToast } = useToast();
  const { navigate } = useNavigate();

  const [dateStr, setDateStr]       = useState(initialDate || today());
  const [planMode, setPlanMode]     = useState((initialDate || today()) > today());

  // Auto-default to plan mode when navigating to a future day
  useEffect(() => {
    setPlanMode(dateStr > today());
  }, [dateStr]);

  const [entries, setEntries]       = useState<LogEntry[]>([]);
  const [foods, setFoods]           = useState<Food[]>([]);
  const [recipes, setRecipes]       = useState<Recipe[]>([]);
  const [frequent, setFrequent]     = useState<FrequentFood[]>([]);
  const [waterTotal, setWaterTotal] = useState(0);
  const [waterEntries, setWaterEntries] = useState<WaterEntry[]>([]);
  const [supplements, setSupplements] = useState<SupplementDay[]>([]);
  const [note, setNote]             = useState('');

  // Apple Watch energy
  const [restingKcal, setRestingKcal] = useState('');
  const [activeKcal, setActiveKcal]   = useState('');
  const [extraKcal, setExtraKcal]     = useState('');
  const [steps, setSteps]             = useState('');
  const [distanceKm, setDistanceKm]   = useState('');
  const [restingFromYest, setRestingFromYest] = useState(false);
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // Pantry deduction event queue (opened-pack lifecycle prompts)
  const { current: deductionEvent, next: nextDeduction, push: pushDeduction } = useDeductionEvents();

  // Pantry location for deduction (shared across pages via context)
  const { activeId: contextPantryId, setActiveId: setContextPantryId, pantries } = usePantry();
  const logPantryId = contextPantryId ?? undefined;

  // Form state
  const [selectedFood, setSelectedFood]     = useState<Food|null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeEditState|null>(null);
  const [selectedAvailableG, setSelectedAvailableG] = useState<number>(0);
  const [selectedPlannedG, setSelectedPlannedG]     = useState<number>(0);
  const [searchKey, setSearchKey]           = useState(0);
  const [amount, setAmount]                 = useState('');
  const [usePieces, setUsePieces]           = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<number | null>(null);
  const [meal, setMeal]                     = useState<Meal>('AfternoonSnack');

  // UI state
  const [quickFoodOpen, setQuickFoodOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [waterCustomMl, setWaterCustomMl] = useState('');
  const [waterCustomOpen, setWaterCustomOpen] = useState(false);
  const [waterExpanded, setWaterExpanded] = useState(false);

  const load = useCallback(async () => {
    const [ent, fds, wd, rcs, nd, freq] = await Promise.all([
      api.log.getDay(dateStr),
      api.foods.getAll(),
      api.water.getDay(dateStr),
      api.recipes.getAll(),
      api.notes.get(dateStr),
      api.foods.getFrequent(10),
    ]);
    setEntries(ent);
    setFoods(fds);
    setWaterTotal(wd.total_ml);
    setWaterEntries(wd.entries);
    setRecipes(rcs);
    setNote(nd.note || '');
    setFrequent(freq);
  }, [dateStr]);

  // Load pantries once on mount; restore today's selection from localStorage or default
  // Pantry list comes from PantryContext, so no separate fetch needed here.

  useEffect(() => {
    load();
    api.supplements.getDay(dateStr).then(setSupplements);
    // Load Apple Watch energy for this date
    api.dailyEnergy.get(dateStr).then((rec: DailyEnergy) => {
      const km = rec.distance_km ?? 0;
      if (rec.resting_kcal > 0 || rec.active_kcal > 0 || rec.extra_kcal > 0 || (rec.steps ?? 0) > 0 || km > 0) {
        setRestingKcal(rec.resting_kcal > 0 ? String(rec.resting_kcal) : '');
        setActiveKcal(rec.active_kcal > 0 ? String(rec.active_kcal) : '');
        setExtraKcal(rec.extra_kcal > 0 ? String(rec.extra_kcal) : '');
        setSteps((rec.steps ?? 0) > 0 ? String(rec.steps) : '');
        setDistanceKm(km > 0 ? String(km) : '');
        setRestingFromYest(false);
      } else {
        // No record for today — carry forward resting from yesterday
        api.dailyEnergy.getPrevResting(dateStr).then(({ resting_kcal }) => {
          if (resting_kcal > 0) {
            setRestingKcal(String(resting_kcal));
            setRestingFromYest(true);
          } else {
            setRestingKcal('');
            setRestingFromYest(false);
          }
        });
        setActiveKcal('');
        setExtraKcal('');
        setSteps('');
        setDistanceKm('');
      }
    });
  }, [load, dateStr]);

  // ── Totals ──────────────────────────────────────────────────────────────────

  const plannedEntries = entries.filter(e => e.status === 'planned');
  const plannedKcalSum = Math.round(plannedEntries.reduce((s, e) => s + e.calories, 0));

  // ── Food search items ───────────────────────────────────────────────────────

  const freqMap = new Map(frequent.map(f=>[f.id,f.use_count]));
  const searchItems: SearchItem[] = [
    ...foods.map(f=>({ ...f, _freq: freqMap.get(f.id)||0, isRecipe: false as const })),
    ...recipes.map(r=>({ ...r, isRecipe: true as const, _freq: 0 })),
  ];

  // ── Select handlers ─────────────────────────────────────────────────────────

  async function handleSelect(item: SearchItem) {
    if (item.isRecipe) {
      const full = await api.recipes.get((item as Recipe).id);
      setSelectedRecipe({ id: full.id, name: full.name, ingredients: (full.ingredients||[]).map(ing=>({...ing, editGrams: ing.grams})) });
      setSelectedFood(null);
      setAmount('');
    } else {
      const food = item as Food;
      const isBulk = food.is_bulk === 1;
      const hasPieces = !!food.piece_grams;
      const hasPackages = (food.packages?.length ?? 0) > 0;
      const defaultPieces = !isBulk && (hasPieces || hasPackages);
      setSelectedFood(food);
      setSelectedRecipe(null);
      setUsePieces(defaultPieces);
      setSelectedPackId(defaultPieces && !hasPieces && hasPackages ? food.packages![0].id : null);
      setAmount(defaultPieces ? '1' : '');
    }
  }

  function handleClear() { setSelectedFood(null); setSelectedRecipe(null); setAmount(''); setSelectedPackId(null); setSearchKey(k => k + 1); setSelectedAvailableG(0); setSelectedPlannedG(0); }

  // Pantry availability + planned-future totals for the currently selected food.
  // Refetched whenever the food changes, the active pantry changes, or after a
  // log entry (so the numbers reflect what just happened).
  useEffect(() => {
    if (!selectedFood) { setSelectedAvailableG(0); setSelectedPlannedG(0); return; }
    let cancelled = false;
    (async () => {
      const [stock, planned] = await Promise.all([
        api.pantry.checkStock(selectedFood.id, 0, logPantryId),
        api.log.getPlannedMap(),
      ]);
      if (cancelled) return;
      setSelectedAvailableG(stock?.have_g ?? 0);
      setSelectedPlannedG(planned?.[selectedFood.id] ?? 0);
    })();
    return () => { cancelled = true; };
  }, [selectedFood, logPantryId, entries]);

  const selectedPack = selectedFood?.packages?.find(p => p.id === selectedPackId) ?? null;
  const pieceSize: number | null = selectedFood?.piece_grams ?? selectedPack?.grams ?? null;
  const effectiveGrams = selectedFood
    ? (usePieces && pieceSize != null ? Math.round((evalExpr(amount) ?? 0) * pieceSize * 100)/100 : (evalExpr(amount) ?? 0))
    : 0;

  const logStatus = planMode ? 'planned' : 'logged';

  async function handleLogFood(status: 'logged' | 'planned') {
    if (!selectedFood || !effectiveGrams) return;
    const result = await api.log.add({ food_id: selectedFood.id, grams: effectiveGrams, meal, date: dateStr, status, pantry_id: logPantryId });
    if (result.shortage > 0 && result.shortage_food) {
      showToast(`Pantry short by ${Math.round(result.shortage)}g of ${result.shortage_food}`, 'warning');
    } else if (status === 'planned') {
      const stock = await api.pantry.checkStock(selectedFood.id, effectiveGrams, logPantryId);
      if (stock.shortage > 0) showToast(`Pantry short by ${Math.round(stock.shortage)}g of ${selectedFood.name}`, 'warning');
    }
    if (result.events?.length) pushDeduction(result.events);
    setSelectedFood(null); setAmount(''); setSelectedPackId(null); setSearchKey(k => k + 1); load();
  }

  async function handleLogRecipe(status: 'logged' | 'planned') {
    if (!selectedRecipe) return;
    const shortages: string[] = [];
    const allEvents: import('../types').DeductionEvent[] = [];
    for (const ing of selectedRecipe.ingredients) {
      if (ing.editGrams > 0) {
        const result = await api.log.add({ food_id: ing.food_id, grams: ing.editGrams, meal, date: dateStr, status, pantry_id: logPantryId });
        if (result.shortage > 0 && result.shortage_food) {
          shortages.push(`${Math.round(result.shortage)}g of ${result.shortage_food}`);
        } else if (status === 'planned' && result.shortage === 0) {
          const stock = await api.pantry.checkStock(ing.food_id, ing.editGrams, logPantryId);
          if (stock.shortage > 0) shortages.push(`${Math.round(stock.shortage)}g of ${ing.name}`);
        }
        if (result.events?.length) allEvents.push(...result.events);
      }
    }
    if (shortages.length > 0) showToast(`Pantry short on: ${shortages.join(', ')}`, 'warning');
    if (allEvents.length) pushDeduction(allEvents);
    setSelectedRecipe(null); setSearchKey(k => k + 1); load();
  }

  async function handleConfirmPlanned(id: number) {
    const result = await api.log.confirmPlanned({ id, pantry_id: logPantryId });
    if (result.shortage > 0 && result.shortage_food) {
      showToast(`Pantry short by ${Math.round(result.shortage)}g of ${result.shortage_food}`, 'warning');
    }
    if (result.events?.length) pushDeduction(result.events);
    load();
  }

  async function handleConfirmAll() {
    const result = await api.log.confirmAllPlanned({ date: dateStr, pantry_id: logPantryId });
    if (result.shortages?.length > 0) {
      const list = result.shortages.map(s => `${s.shortage}g of ${s.food_name}`).join(', ');
      showToast(`Pantry short on: ${list}`, 'warning');
    }
    if (result.events?.length) pushDeduction(result.events);
    load();
  }

  async function handleSwapLunchDinner() {
    await api.log.swapLunchDinner(dateStr);
    load();
  }

  // ── Water ───────────────────────────────────────────────────────────────────

  async function addWater(ml: number) {
    await api.water.add({ date: dateStr, ml, source: 'manual' });
    const wd = await api.water.getDay(dateStr);
    setWaterTotal(wd.total_ml); setWaterEntries(wd.entries);
  }

  async function deleteWater(id: number) {
    await api.water.delete(id);
    const wd = await api.water.getDay(dateStr);
    setWaterTotal(wd.total_ml); setWaterEntries(wd.entries);
  }

  async function handleWaterCustom() {
    const ml = parseFloat(waterCustomMl);
    if (!ml) return;
    await addWater(ml);
    setWaterCustomMl(''); setWaterCustomOpen(false);
  }

  const waterGoal = settings.water_goal || 2000;
  const waterPct  = Math.min(100, Math.round(waterTotal / waterGoal * 100));

  // ── Supplements ─────────────────────────────────────────────────────────────

  async function handleTakeSuppl(id: number) {
    await api.supplements.take({ supplement_id: id, date: dateStr });
    setSupplements(await api.supplements.getDay(dateStr));
  }

  // ── Notes ───────────────────────────────────────────────────────────────────

  function handleNoteChange(val: string) {
    setNote(val);
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
    noteSaveTimer.current = setTimeout(()=>{ api.notes.save({ date: dateStr, note: val }); }, 1000);
  }

  // ── Apple Watch energy ───────────────────────────────────────────────────────

  function handleEnergySave() {
    const resting   = parseFloat(restingKcal) || 0;
    const active    = parseFloat(activeKcal)  || 0;
    const extra     = parseFloat(extraKcal)   || 0;
    const stepCount = parseInt(steps, 10)     || 0;
    const km        = parseFloat(distanceKm)  || 0;
    api.dailyEnergy.set({ date: dateStr, resting_kcal: resting, active_kcal: active, extra_kcal: extra, steps: stepCount, distance_km: km });
    setRestingFromYest(false);
  }

  async function handleCopyDay() {
    const md = buildDayMarkdown({
      date: dateStr,
      entries,
      settings,
      waterMl: waterTotal,
      waterGoalMl: settings.water_goal,
      restingKcal: energyResting || undefined,
      activeKcal:  energyActive  || undefined,
      extraKcal:   energyExtra   || undefined,
      note,
    });
    const ok = await copyToClipboard(md);
    showToast(ok ? t('export.copied') : t('export.copyFailed'), ok ? 'success' : 'error');
  }

  function selectPantry(id: number) {
    setContextPantryId(id);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const inputCls = "bg-card border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
  const numInputCls = "w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-sm text-text outline-none focus:border-accent text-center tabular-nums";

  const loggedEntries  = entries.filter(e => e.status === 'logged');
  const caloriesIn     = Math.round(loggedEntries.reduce((s, e) => s + e.calories, 0));
  const energyResting  = parseFloat(restingKcal) || 0;
  const energyActive   = parseFloat(activeKcal)  || 0;
  const energyExtra    = parseFloat(extraKcal)   || 0;
  const stepCount      = parseInt(steps, 10)     || 0;
  const energyOut      = energyResting + energyActive + energyExtra;
  const netKcal        = caloriesIn - energyOut;
  const hasEnergyData  = energyOut > 0 || caloriesIn > 0 || stepCount > 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      {fromWeek && (
        <button className="text-accent text-sm hover:opacity-80 cursor-pointer self-start" onClick={() => navigate('week', { weekStart: fromWeek })}>
          {t('day.back')}
        </button>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDateStr(addDays(dateStr, -1))}
            className="text-text-sec hover:text-accent border border-border hover:border-accent/50 rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer transition-colors"
            title="Previous day"
          >‹</button>
          <h1 className="text-xl font-bold text-text text-center w-[230px] tabular-nums">{fmtDateWithWeekday(dateStr)}</h1>
          <button
            onClick={() => setDateStr(addDays(dateStr, 1))}
            className="text-text-sec hover:text-accent border border-border hover:border-accent/50 rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer transition-colors"
            title="Next day"
          >›</button>
          <input
            type="date"
            value={dateStr}
            onChange={e => setDateStr(e.target.value)}
            className="text-xs bg-card border border-border rounded-lg px-2 py-1 text-text-sec focus:outline-none focus:border-accent cursor-pointer ml-1"
          />
          {dateStr !== today() && (
            <button
              onClick={() => setDateStr(today())}
              className="text-xs text-accent border border-accent/40 rounded-lg px-2 py-1 hover:bg-accent/10 cursor-pointer transition-colors ml-1"
            >
              {t('week.today')}
            </button>
          )}
          {pantries.length > 1 && (
            <div className="flex gap-1 ml-3">
              {pantries.map(p => (
                <button
                  key={p.id}
                  onClick={() => selectPantry(p.id)}
                  className={[
                    'text-xs px-3 py-1 rounded-lg border cursor-pointer transition-colors',
                    logPantryId === p.id
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-text-sec hover:border-accent/50',
                  ].join(' ')}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Plan mode toggle */}
          <button
            onClick={() => setPlanMode(v => !v)}
            className={[
              'text-sm border rounded-lg px-3 py-1.5 cursor-pointer transition-colors',
              planMode
                ? 'bg-accent/15 border-accent text-accent font-medium'
                : 'border-border text-text-sec hover:border-accent/50 hover:text-text',
            ].join(' ')}
          >
            {planMode ? '📋 Planning' : '📋 Plan'}
          </button>
          <button onClick={handleCopyDay} title={t('export.copyDay')} className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text cursor-pointer transition-colors">
            📋 {t('export.copyDay')}
          </button>
          <button onClick={()=>setSwapOpen(true)} title={t('dash.swapDays')} className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text cursor-pointer transition-colors inline-flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3 4 7l4 4"/>
              <path d="M4 7h16"/>
              <path d="m16 21 4-4-4-4"/>
              <path d="M20 17H4"/>
            </svg>
            {t('dash.swapDays')}
          </button>
          <button onClick={()=>setQuickFoodOpen(true)} className="text-sm text-accent border border-accent/40 rounded-lg px-3 py-1.5 hover:bg-accent/10 cursor-pointer transition-colors">
            {t('dash.quickAdd')}
          </button>
        </div>
      </div>

      {/* Confirm all planned banner */}
      {plannedEntries.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-accent/8 border border-accent/25 rounded-xl px-4 py-2.5">
          <div className="text-sm text-text">
            <span className="font-medium text-accent">{plannedEntries.length}</span> planned {plannedEntries.length === 1 ? 'entry' : 'entries'} ·{' '}
            <span className="text-text-sec">{plannedKcalSum} kcal planned</span>
          </div>
          <button
            onClick={handleConfirmAll}
            className="text-sm font-medium text-accent border border-accent/40 rounded-lg px-3 py-1 hover:bg-accent/10 cursor-pointer transition-colors"
          >
            Confirm All
          </button>
        </div>
      )}

      {/* Macros summary card */}
      <DayMacrosCard entries={entries} />

      {/* Energy (Apple Watch) + Supplements */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Energy card */}
        <CollapsibleSection
          storageKey="dashboard.energy.collapsed"
          title={t('energy.title')}
          subtitle={t('energy.appleWatch')}
          summary={hasEnergyData ? `${netKcal > 0 ? '+' : ''}${netKcal} kcal ${t('energy.net')}${stepCount > 0 ? ` · ${stepCount.toLocaleString()} ${t('energy.steps').toLowerCase()}` : ''}` : '—'}
        >
        <div className="flex flex-col gap-3">
          {/* Net display */}
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold tabular-nums ${
              !hasEnergyData ? 'text-text-sec' :
              netKcal < 0 ? 'text-green' : 'text-accent'
            }`}>
              {hasEnergyData ? `${netKcal > 0 ? '+' : ''}${netKcal}` : '—'}
            </span>
            {hasEnergyData && <span className="text-xs text-text-sec">kcal {t('energy.net')}</span>}
          </div>

          {/* Food in / Energy out summary */}
          {hasEnergyData && (
            <div className="flex gap-4 text-xs text-text-sec flex-wrap">
              <span>{t('energy.foodIn')}: <span className="text-text tabular-nums">{caloriesIn}</span></span>
              <span>{t('energy.out')}: <span className="text-text tabular-nums">
                {(() => {
                  const parts = [
                    energyResting > 0 ? String(energyResting) : null,
                    energyActive  > 0 ? String(energyActive)  : null,
                    energyExtra   > 0 ? String(energyExtra)   : null,
                  ].filter(Boolean) as string[];
                  if (parts.length === 0) return '0';
                  if (parts.length === 1) return parts[0];
                  return `${energyOut} (${parts.join(' + ')})`;
                })()}
              </span></span>
              {stepCount > 0 && (
                <span>{t('energy.steps')}: <span className="text-text tabular-nums">{stepCount.toLocaleString()}</span></span>
              )}
            </div>
          )}

          {/* Inputs — kcal row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-sec text-center">{t('energy.resting')}</label>
              <input
                type="text"
                inputMode="decimal"
                value={restingKcal}
                onChange={e => { setRestingKcal(e.target.value); setRestingFromYest(false); }}
                onBlur={handleEnergySave}
                placeholder="0"
                className={numInputCls}
              />
              {restingFromYest && <span className="text-xs text-text-sec/60 text-center">{t('energy.fromYest')}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-sec text-center">{t('energy.active')}</label>
              <input
                type="text"
                inputMode="decimal"
                value={activeKcal}
                onChange={e => setActiveKcal(e.target.value)}
                onBlur={handleEnergySave}
                placeholder="0"
                className={numInputCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-sec text-center" title={t('energy.extraHint')}>{t('energy.extra')}</label>
              <input
                type="text"
                inputMode="decimal"
                value={extraKcal}
                onChange={e => setExtraKcal(e.target.value)}
                onBlur={handleEnergySave}
                placeholder="0"
                className={numInputCls}
              />
            </div>
          </div>
          {/* Inputs — activity row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-sec text-center">{t('energy.steps')}</label>
              <input
                type="text"
                inputMode="numeric"
                value={steps}
                onChange={e => setSteps(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={handleEnergySave}
                placeholder="0"
                className={numInputCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-sec text-center">{t('energy.km')}</label>
              <input
                type="text"
                inputMode="decimal"
                value={distanceKm}
                onChange={e => setDistanceKm(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
                onBlur={handleEnergySave}
                placeholder="0"
                className={numInputCls}
              />
            </div>
          </div>
        </div>
        </CollapsibleSection>

        {/* Supplements */}
        {supplements.length > 0 && (() => {
          const totalTaken = supplements.reduce((s, x) => s + (x.taken >= x.qty ? 1 : 0), 0);
          return (
          <CollapsibleSection
            storageKey="dashboard.supplements.collapsed"
            title={t('suppl.dashTitle')}
            summary={`${totalTaken}/${supplements.length} taken`}
          >
            <div className="flex flex-col gap-3">
              {SUPPLEMENT_TIME_ORDER.map(slot => {
                const group = supplements.filter(s => (s.time_of_day ?? 'breakfast') === slot);
                if (group.length === 0) return null;
                return (
                  <div key={slot} className="flex flex-col gap-1">
                    <div className="text-[10px] uppercase tracking-wider text-text-sec/50">
                      {t(`suppl.time.${slot}`)}
                    </div>
                    {group.map(s => {
                      const done = s.taken >= s.qty;
                      return (
                        <div key={s.id} className="flex items-center justify-between gap-2">
                          <span className={`text-sm ${done ? 'text-text-sec line-through' : 'text-text'}`}>{s.name}</span>
                          <button
                            disabled={done}
                            onClick={()=>handleTakeSuppl(s.id)}
                            className={`text-xs px-2 py-0.5 rounded cursor-pointer transition-colors ${done?'text-text-sec':'text-accent border border-accent/40 hover:bg-accent/10'}`}
                          >
                            {s.taken}/{s.qty}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
          );
        })()}
      </div>

      {/* Water */}
      <CollapsibleSection
        storageKey="dashboard.water.collapsed"
        title={t('dash.water')}
        summary={`${Math.round(waterTotal)} / ${waterGoal} ml (${waterPct}%)`}
      >
        <div className="flex items-center justify-end mb-2">
          <span className="text-xs text-text-sec tabular-nums">{Math.round(waterTotal)} / {waterGoal} ml</span>
        </div>
        <div className="w-full h-2 rounded-full mb-3" style={{ background: 'var(--border)' }}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-400" style={{ width: `${waterPct}%` }} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={()=>addWater(100)}  className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-sec hover:border-accent hover:text-accent cursor-pointer transition-colors">+100ml</button>
          <button onClick={()=>addWater(200)}  className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-sec hover:border-accent hover:text-accent cursor-pointer transition-colors">+200ml</button>
          <button onClick={()=>addWater(250)}  className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-sec hover:border-accent hover:text-accent cursor-pointer transition-colors">+250ml</button>
          <button onClick={()=>addWater(500)}  className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-sec hover:border-accent hover:text-accent cursor-pointer transition-colors">+500ml</button>
          <button onClick={()=>addWater(1000)} className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-sec hover:border-accent hover:text-accent cursor-pointer transition-colors">+1000ml</button>
          <button onClick={()=>setWaterCustomOpen(true)} className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-sec hover:border-accent hover:text-accent cursor-pointer transition-colors">{t('dash.custom')}</button>
          {waterEntries.length > 0 && (
            <button onClick={()=>setWaterExpanded(e=>!e)} className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-sec cursor-pointer ml-auto">
              {waterExpanded ? '▲' : '▼'}
            </button>
          )}
        </div>
        {waterExpanded && waterEntries.length > 0 && (
          <div className="flex flex-col gap-1 mt-2">
            {waterEntries.map(e=>(
              <div key={e.id} className="flex items-center gap-2 text-xs text-text-sec">
                <span className="tabular-nums">{Math.round(e.ml)}ml</span>
                <span className="text-text-sec/60">{e.source === 'manual' ? t('water.manual') : `↩ ${e.source}`}</span>
                <button onClick={()=>deleteWater(e.id)} className="ml-auto text-text-sec hover:text-red cursor-pointer">✕</button>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Exercise */}
      <ExerciseSection date={dateStr} onCaloriesChange={() => {}} />

      {/* Log food section */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text">{t('dash.logFood')}</h3>
        <FoodSearch key={searchKey} items={searchItems} onSelect={handleSelect} onClear={handleClear} placeholder={t('dash.searchPlaceholder')} pantryId={logPantryId} />

        {/* Food log form */}
        {selectedFood && (
          <div className="flex flex-col gap-3">
            {/* Food preview */}
            <div className="flex flex-col gap-1.5 text-xs bg-bg rounded-lg px-3 py-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-text font-medium">{selectedFood.name}</span>
                <span className="text-text-sec">{t('common.per100g')}:</span>
                <MacroChips
                  calories={selectedFood.calories}
                  protein={selectedFood.protein}
                  carbs={selectedFood.carbs}
                  fat={selectedFood.fat}
                  fiber={selectedFood.fiber}
                />
              </div>
              {effectiveGrams > 0 && (() => {
                const scaled = scaleNutrients(selectedFood, effectiveGrams);
                return (
                  <div className="flex items-center gap-3 flex-wrap border-t border-border pt-1.5">
                    <span className="text-text font-medium">{Math.round(effectiveGrams * 10) / 10}g =</span>
                    <MacroChips
                      calories={scaled.calories}
                      protein={scaled.protein}
                      carbs={scaled.carbs}
                      fat={scaled.fat}
                      fiber={scaled.fiber}
                    />
                  </div>
                );
              })()}
              {(selectedAvailableG > 0 || selectedPlannedG > 0) && (() => {
                const remainingAfterPlan = selectedAvailableG - selectedPlannedG;
                const remainingAfterLog = remainingAfterPlan - effectiveGrams;
                return (
                  <div className="flex items-center gap-2 flex-wrap border-t border-border pt-1.5 tabular-nums">
                    {selectedAvailableG > 0 && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-green/15 text-green" title={`${Math.round(selectedAvailableG)}g available in pantry`}>
                        📦 {formatPacked(selectedAvailableG, selectedFood)}
                      </span>
                    )}
                    {selectedPlannedG > 0 && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent/15 text-accent" title={`${Math.round(selectedPlannedG)}g planned today + future`}>
                        📋 {formatPacked(selectedPlannedG, selectedFood)}
                      </span>
                    )}
                    {selectedAvailableG > 0 && selectedPlannedG > 0 && (
                      <span className={`text-[11px] px-1.5 py-0.5 rounded ${remainingAfterPlan < 0 ? 'bg-red/15 text-red' : 'bg-text-sec/10 text-text-sec'}`}
                            title={remainingAfterPlan < 0 ? `Plan exceeds pantry by ${Math.round(-remainingAfterPlan)}g` : `${Math.round(remainingAfterPlan)}g left after the plan`}>
                        {remainingAfterPlan < 0
                          ? `⚠ −${formatPacked(-remainingAfterPlan, selectedFood)}`
                          : `→ ${formatPacked(remainingAfterPlan, selectedFood)}`}
                      </span>
                    )}
                    {effectiveGrams > 0 && selectedAvailableG > 0 && (
                      <span className={`text-[11px] px-1.5 py-0.5 rounded ${remainingAfterLog < 0 ? 'bg-red/15 text-red' : 'bg-text-sec/10 text-text-sec'}`}
                            title={remainingAfterLog < 0 ? `Logging ${Math.round(effectiveGrams)}g would short pantry by ${Math.round(-remainingAfterLog)}g` : `${Math.round(remainingAfterLog)}g left after this log`}>
                        {remainingAfterLog < 0
                          ? `↘ −${formatPacked(-remainingAfterLog, selectedFood)}`
                          : `↘ ${formatPacked(remainingAfterLog, selectedFood)}`}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text" inputMode="decimal"
                value={amount}
                onChange={e=>setAmount(e.target.value)}
                onBlur={() => setAmount(v => resolveExpr(v))}
                placeholder={
                  usePieces
                    ? (selectedFood.piece_grams
                        ? `${t('common.pieces')} (${selectedFood.piece_grams}g)`
                        : `${t('dash.packsPlaceholder')}${pieceSize != null ? ` (${pieceSize}g)` : ''}`)
                    : t('common.grams')
                }
                className={`w-32 ${inputCls}`}
              />
              {(selectedFood.piece_grams || (selectedFood.packages?.length ?? 0) > 0) && (
                <button type="button" onClick={()=>{ setUsePieces(v=>!v); setAmount(''); }} className="text-xs text-accent underline cursor-pointer">
                  {usePieces
                    ? t('dash.switchToGrams')
                    : (selectedFood.piece_grams ? t('dash.switchToPieces') : t('dash.switchToPacks'))}
                </button>
              )}
            </div>
            {usePieces && !selectedFood.piece_grams && (selectedFood.packages?.length ?? 0) > 1 && (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-text-sec">{t('dash.packPicker')}:</span>
                {selectedFood.packages!.map(pkg => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelectedPackId(pkg.id)}
                    className={`px-2 py-1 rounded border cursor-pointer ${
                      selectedPackId === pkg.id
                        ? 'border-accent text-accent bg-accent/10'
                        : 'border-border text-text-sec hover:text-text'
                    }`}
                  >
                    {Math.round(pkg.grams)}g
                  </button>
                ))}
              </div>
            )}
            <MealPills selected={meal} onChange={setMeal} />
            <div className="flex gap-2 flex-wrap items-center">
              {(planMode ? ['planned', 'logged'] : ['logged', 'planned'] as const).map((status, i) => (
                <button
                  key={status}
                  onClick={() => handleLogFood(status as 'logged' | 'planned')}
                  disabled={!effectiveGrams}
                  className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-40 transition-colors ${
                    i === 0
                      ? 'bg-accent text-white hover:opacity-90'
                      : 'border border-border text-text-sec hover:text-text'
                  }`}
                >
                  {status === 'logged' ? t('common.add') : t('dash.addToPlan')}
                </button>
              ))}
              <button onClick={handleClear} className="border border-border text-text-sec px-4 py-2 rounded-lg text-sm cursor-pointer hover:text-text">{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {/* Recipe editor */}
        {selectedRecipe && (() => {
          const recipeTotals = selectedRecipe.ingredients.reduce((acc, ing) => {
            const r = ing.editGrams / ing.grams;
            return {
              cal:     acc.cal     + ing.calories * r,
              protein: acc.protein + ing.protein  * r,
              carbs:   acc.carbs   + ing.carbs    * r,
              fat:     acc.fat     + ing.fat      * r,
              fiber:   acc.fiber   + (ing.fiber || 0) * r,
            };
          }, { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
          const rt = { cal: Math.round(recipeTotals.cal), protein: Math.round(recipeTotals.protein*10)/10, carbs: Math.round(recipeTotals.carbs*10)/10, fat: Math.round(recipeTotals.fat*10)/10, fiber: Math.round(recipeTotals.fiber*10)/10 };

          return (
          <div className="flex flex-col gap-3">
            <div>
              <h4 className="text-sm font-semibold text-text">{selectedRecipe.name}</h4>
              <p className="text-xs text-text-sec tabular-nums mt-0.5">
                {rt.cal} kcal · F {rt.fat}g · C {rt.carbs}g{rt.fiber > 0 ? ` · Fi ${rt.fiber}g` : ''} · P {rt.protein}g
              </p>
            </div>
            <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
              {selectedRecipe.ingredients.map((ing, i) => {
                const ratio = ing.editGrams / ing.grams;
                const ingCal = Math.round(ing.calories * ratio);
                const ingP   = Math.round(ing.protein  * ratio * 10) / 10;
                const ingC   = Math.round(ing.carbs    * ratio * 10) / 10;
                const ingF   = Math.round(ing.fat      * ratio * 10) / 10;
                return (
                  <div key={ing.id} className="flex items-center gap-2 bg-bg rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text truncate">{ing.name}</div>
                      <div className="text-[11px] text-text-sec tabular-nums">{ingCal} kcal · F {ingF} · C {ingC} · P {ingP}</div>
                    </div>
                    <input
                      type="text" inputMode="decimal"
                      value={ing.editGrams}
                      min={0}
                      step={0.1}
                      onChange={e=>{
                        const val = parseFloat(e.target.value)||0;
                        setSelectedRecipe(r=>r ? { ...r, ingredients: r.ingredients.map((x,j)=>j===i?{...x,editGrams:val}:x) } : r);
                      }}
                      className={`w-20 ${inputCls}`}
                    />
                    <span className="text-xs text-text-sec">g</span>
                  </div>
                );
              })}
            </div>
            <MealPills selected={meal} onChange={setMeal} />
            <div className="flex gap-2 flex-wrap">
              {(planMode ? ['planned', 'logged'] : ['logged', 'planned'] as const).map((status, i) => (
                <button
                  key={status}
                  onClick={() => handleLogRecipe(status as 'logged' | 'planned')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                    i === 0
                      ? 'bg-accent text-white hover:opacity-90'
                      : 'border border-border text-text-sec hover:text-text'
                  }`}
                >
                  {status === 'logged' ? t('dash.logRecipe') : t('dash.addToPlan')}
                </button>
              ))}
              <button onClick={handleClear} className="border border-border text-text-sec px-4 py-2 rounded-lg text-sm cursor-pointer hover:text-text">{t('common.cancel')}</button>
            </div>
          </div>
          );
        })()}
      </div>

      {/* Entries table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-text-sec uppercase tracking-wider">{t('dash.todayEntries')}</h3>
          {plannedEntries.some(e => e.meal === 'Lunch' || e.meal === 'Dinner') && (
            <button
              onClick={handleSwapLunchDinner}
              title={t('dash.swapLunchDinner')}
              className="text-xs text-text-sec border border-border rounded-lg px-2 py-1 hover:border-accent/50 hover:text-text cursor-pointer transition-colors inline-flex items-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21 16-4 4-4-4"/>
                <path d="M17 20V4"/>
                <path d="m3 8 4-4 4 4"/>
                <path d="M7 4v16"/>
              </svg>
              {t('dash.swapLunchDinner')}
            </button>
          )}
        </div>
        {entries.length === 0
          ? <p className="text-text-sec text-sm">{t('dash.nothingLogged')}</p>
          : <EntryTable entries={entries} foods={foods} onRefresh={load} onConfirm={handleConfirmPlanned} />}
      </div>

      {/* Notes */}
      <div>
        <h3 className="text-xs font-semibold text-text-sec uppercase tracking-wider mb-2">{t('dash.notes')}</h3>
        <textarea
          value={note}
          onChange={e=>handleNoteChange(e.target.value)}
          placeholder={t('dash.notesPlaceholder')}
          rows={3}
          className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none placeholder:text-text-sec"
        />
      </div>

      {/* Dialogs */}
      <QuickFoodDialog
        isOpen={quickFoodOpen}
        onClose={()=>setQuickFoodOpen(false)}
        date={dateStr}
        meal={meal}
        onLogged={load}
      />

      <SwapDaysModal
        isOpen={swapOpen}
        initialDate={dateStr}
        onClose={()=>setSwapOpen(false)}
        onSwapped={(n) => {
          showToast(t('swap.toastSwapped').replace('{n}', String(n)), 'success');
          load();
        }}
      />

      <Modal isOpen={waterCustomOpen} onClose={()=>setWaterCustomOpen(false)} title={t('water.addWater')}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-sec">{t('water.amountMl')}</label>
            <input
              type="text" inputMode="decimal"
              value={waterCustomMl}
              onChange={e=>setWaterCustomMl(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleWaterCustom()}
              autoFocus
              className={`w-full ${inputCls}`}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={()=>setWaterCustomOpen(false)} className="px-4 py-2 text-sm text-text-sec border border-border rounded-lg cursor-pointer">{t('common.cancel')}</button>
            <button onClick={handleWaterCustom} disabled={!waterCustomMl} className="px-4 py-2 text-sm bg-accent text-white rounded-lg cursor-pointer hover:opacity-90 disabled:opacity-40 font-medium">{t('common.add')}</button>
          </div>
        </div>
      </Modal>

      <DeductionEventModal
        event={deductionEvent}
        onDone={nextDeduction}
        pushMore={pushDeduction}
        onPantryChanged={load}
      />
    </div>
  );
}
