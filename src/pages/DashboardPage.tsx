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
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SwapDaysModal from '../components/SwapDaysModal';
import CopyDayModal from '../components/CopyDayModal';
import QuickFoodDialog from '../components/QuickFoodDialog';
import { fbBtnIcon, fbBtnGhost, fbBtnPrimary, fbCard } from '../lib/fbStyles';
import { today, addDays } from '../lib/dateUtil';
import { buildDayMarkdown, copyToClipboard } from '../lib/exportText';
import ExerciseSection from '../components/ExerciseSection';
import DailyIntakeCard from '../components/dashboard/DailyIntakeCard';
import EnergyBalanceCard from '../components/dashboard/EnergyBalanceCard';
import WaterCard from '../components/dashboard/WaterCard';
import DiaryTable from '../components/dashboard/DiaryTable';
import QuickLogStrip from '../components/dashboard/QuickLogStrip';
import SupplementsWidget from '../components/dashboard/SupplementsWidget';
import PantryWidget from '../components/dashboard/PantryWidget';
import WeightWidget from '../components/dashboard/WeightWidget';
import CollapsibleSection from '../components/dashboard/CollapsibleSection';
import GamificationCard from '../components/dashboard/GamificationCard';
import SectionStreaksCard from '../components/dashboard/SectionStreaksCard';
import SleepCard from '../components/dashboard/SleepCard';
import TasksCard from '../components/dashboard/TasksCard';
import HabitsCard from '../components/dashboard/HabitsCard';
import FocusCard from '../components/dashboard/FocusCard';
import MoodCard from '../components/dashboard/MoodCard';
import WorkoutCard from '../components/dashboard/WorkoutCard';
import ReliabilityPill from '../components/dashboard/ReliabilityPill';
import InsightCard from '../components/dashboard/InsightCard';
import MealSuggestionCard from '../components/dashboard/MealSuggestionCard';
import AdaptiveTdeeCard from '../components/dashboard/AdaptiveTdeeCard';
import DeductionEventModal from '../components/DeductionEventModal';
import {
  MEAL_ORDER,
  type LogEntry, type Food, type Recipe, type RecipeIngredient, type Meal,
  type WaterEntry, type SupplementDay, type FrequentFood, type WeightEntry,
  type DailyEnergy, type Exercise,
  type MealSuggestion, type MealSuggestionsResult, type TDEEResult,
} from '../types';
import { useDeductionEvents } from '../hooks/useDeductionEvents';

// ── Date helpers ──────────────────────────────────────────────────────────────

const IT_WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const IT_MONTHS   = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const EN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EN_MONTHS   = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fmtDate(iso: string, lang: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (lang === 'it') return `${IT_WEEKDAYS[dt.getDay()]}, ${d} ${IT_MONTHS[m - 1]}`;
  return `${EN_WEEKDAYS[dt.getDay()]}, ${EN_MONTHS[m - 1]} ${d}`;
}

// ── Meal label keys ───────────────────────────────────────────────────────────

const MEAL_KEYS: Record<string, string> = {
  Breakfast:      'meal.breakfast',
  MorningSnack:   'meal.morningSnack',
  Lunch:          'meal.lunch',
  AfternoonSnack: 'meal.afternoonSnack',
  Dinner:         'meal.dinner',
  EveningSnack:   'meal.eveningSnack',
};

// ── Recipe editor ─────────────────────────────────────────────────────────────

interface RecipeEditState {
  id: number;
  name: string;
  ingredients: (RecipeIngredient & { editGrams: number })[];
}

const card       = fbCard;
const btnIcon    = fbBtnIcon;
const btnGhost   = fbBtnGhost;
const btnPrimary = fbBtnPrimary;

// ── DragSection ───────────────────────────────────────────────────────────────

interface DragSectionProps {
  id: string;
  dragId: string | null;
  dragOverId: string | null;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}

function DragSection({ id, dragId, dragOverId, onDragStart, onDragOver, onDrop, onDragEnd, children }: DragSectionProps) {
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(id); }}
      onDragOver={e => { e.preventDefault(); onDragOver(id); }}
      onDrop={() => onDrop(id)}
      onDragEnd={onDragEnd}
      style={{
        opacity: dragId === id ? 0.35 : 1,
        transition: 'opacity 0.15s',
        borderRadius: 12,
        outline: dragOverId === id && dragId !== id ? '2px dashed var(--fb-accent)' : 'none',
        outlineOffset: 4,
        cursor: dragId ? 'grabbing' : 'auto',
      }}
    >
      {children}
    </div>
  );
}

// ── DashboardPage ─────────────────────────────────────────────────────────────

interface DashboardPageProps {
  initialDate?: string;
  fromWeek?: string;
}

export default function DashboardPage({ initialDate, fromWeek }: DashboardPageProps = {}) {
  const { settings, invalidate } = useSettings();
  const { t } = useT();
  const { showToast } = useToast();
  const { navigate } = useNavigate();

  const [dateStr, setDateStr]       = useState(initialDate || today());
  const [planMode, setPlanMode]     = useState((initialDate || today()) > today());

  useEffect(() => { setPlanMode(dateStr > today()); }, [dateStr]);

  const [entries, setEntries]       = useState<LogEntry[]>([]);
  const [foods, setFoods]           = useState<Food[]>([]);
  const [recipes, setRecipes]       = useState<Recipe[]>([]);
  const [frequent, setFrequent]     = useState<FrequentFood[]>([]);
  const [favorites, setFavorites]   = useState<Food[]>([]);
  const [waterTotal, setWaterTotal] = useState(0);
  const [waterEntries, setWaterEntries] = useState<WaterEntry[]>([]);
  const [supplements, setSupplements] = useState<SupplementDay[]>([]);
  const [weightKg, setWeightKg]     = useState(0);
  const [weightTrend, setWeightTrend] = useState<number[]>([]);
  const [note, setNote]             = useState('');
  const [exercises, setExercises]   = useState<Exercise[]>([]);
  const [pantryLow, setPantryLow]   = useState<{ name: string; qty: number; unit: string }[]>([]);

  const [restingKcal, setRestingKcal] = useState('');
  const [activeKcal, setActiveKcal]   = useState('');
  const [extraKcal, setExtraKcal]     = useState('');
  const [steps, setSteps]             = useState('');
  const [restingFromYest, setRestingFromYest] = useState(false);
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { current: deductionEvent, next: nextDeduction, push: pushDeduction } = useDeductionEvents();

  const [pantries, setPantries]     = useState<import('../types').PantryLocation[]>([]);
  const [logPantryId, setLogPantryId] = useState<number | undefined>(undefined);

  const [selectedFood, setSelectedFood]     = useState<Food | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeEditState | null>(null);
  const [searchKey, setSearchKey]           = useState(0);
  const [amount, setAmount]                 = useState('');
  const [usePieces, setUsePieces]           = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<number | null>(null);
  const [meal, setMeal]                     = useState<Meal>('AfternoonSnack');

  const [quickFoodOpen, setQuickFoodOpen]   = useState(false);
  const [swapOpen, setSwapOpen]             = useState(false);
  const [copyDayOpen, setCopyDayOpen]       = useState(false);
  const [waterCustomOpen, setWaterCustomOpen] = useState(false);
  const [waterCustomMl, setWaterCustomMl]   = useState('');
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);

  // ── Widget reorder (drag-and-drop) ────────────────────────────────────────
  const DEFAULT_WIDGET_ORDER = ['gamification','hero','adaptive_tdee','tasks_habits','diary','meal_suggest','lifestyle','workout','insights','secondary','collapsibles'];
  const [widgetOrder, setWidgetOrder] = useState<string[]>(DEFAULT_WIDGET_ORDER);
  const [mealSuggest, setMealSuggest] = useState<MealSuggestionsResult | null>(null);
  const [tdeeResult, setTdeeResult] = useState<TDEEResult | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = settings?.dashboard_widget_order;
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Keep saved order, append any new DEFAULT ids not yet saved, drop obsolete ones
          const merged = [...parsed.filter(id => DEFAULT_WIDGET_ORDER.includes(id)), ...DEFAULT_WIDGET_ORDER.filter(id => !parsed.includes(id))];
          setWidgetOrder(merged);
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.dashboard_widget_order]);

  function handleWidgetDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const newOrder = [...widgetOrder];
    const fromIdx = newOrder.indexOf(dragId);
    const toIdx = newOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return; }
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragId);
    setWidgetOrder(newOrder);
    api.settings.save({ dashboard_widget_order: JSON.stringify(newOrder) });
    setDragId(null);
    setDragOverId(null);
  }

  const load = useCallback(async () => {
    const [ent, fav, fds, wd, rcs, nd, freq] = await Promise.all([
      api.log.getDay(dateStr),
      api.foods.getFavorites(),
      api.foods.getAll(),
      api.water.getDay(dateStr),
      api.recipes.getAll(),
      api.notes.get(dateStr),
      api.foods.getFrequent(10),
    ]);
    setEntries(ent);
    setFavorites(fav);
    setFoods(fds);
    setWaterTotal(wd.total_ml);
    setWaterEntries(wd.entries);
    setRecipes(rcs);
    setNote(nd.note || '');
    setFrequent(freq);
    // Non-blocking: meal suggestions depend on consumed kcal and pantry state
    api.meals.getSuggestions().then(setMealSuggest).catch(() => {});
    api.goals.calculateTDEE().then(setTdeeResult).catch(() => {});
  }, [dateStr]);

  useEffect(() => {
    api.pantries.getAll().then(ps => {
      setPantries(ps);
      const def = ps.find(p => p.is_default) ?? ps[0];
      if (!def) return;
      try {
        const stored = JSON.parse(localStorage.getItem('dashPantry') || '{}');
        if (stored.date === today() && ps.some(p => p.id === stored.id)) {
          setLogPantryId(stored.id);
        } else {
          setLogPantryId(def.id);
        }
      } catch { setLogPantryId(def.id); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    api.supplements.getDay(dateStr).then(setSupplements);
    api.exercises.getDay(dateStr).then(setExercises);
    api.weight.getAll().then((ws: WeightEntry[]) => {
      if (ws.length > 0) {
        setWeightKg(ws[ws.length - 1].weight);
        setWeightTrend(ws.slice(-7).map(w => w.weight));
      }
    });
    api.dailyEnergy.get(dateStr).then((rec: DailyEnergy) => {
      if (rec.resting_kcal > 0 || rec.active_kcal > 0 || rec.extra_kcal > 0 || (rec.steps ?? 0) > 0) {
        setRestingKcal(rec.resting_kcal > 0 ? String(rec.resting_kcal) : '');
        setActiveKcal(rec.active_kcal > 0 ? String(rec.active_kcal) : '');
        setExtraKcal(rec.extra_kcal > 0 ? String(rec.extra_kcal) : '');
        setSteps((rec.steps ?? 0) > 0 ? String(rec.steps) : '');
        setRestingFromYest(false);
      } else {
        api.dailyEnergy.getPrevResting(dateStr).then(({ resting_kcal }) => {
          if (resting_kcal > 0) { setRestingKcal(String(resting_kcal)); setRestingFromYest(true); }
          else { setRestingKcal(''); setRestingFromYest(false); }
        });
        setActiveKcal(''); setExtraKcal(''); setSteps('');
      }
    });
    // Pantry low items
    if (settings.pantry_enabled !== 0) {
      api.pantry.getAll(logPantryId).then(items => {
        const agg = new Map<number, { name: string; total: number }>();
        for (const it of items) {
          const existing = agg.get(it.food_id);
          if (existing) existing.total += it.quantity_g;
          else agg.set(it.food_id, { name: it.food_name, total: it.quantity_g });
        }
        const sorted = [...agg.values()].sort((a, b) => a.total - b.total).slice(0, 4);
        setPantryLow(sorted.map(x => ({ name: x.name, qty: Math.round(x.total), unit: 'g' })));
      }).catch(() => {});
    }
  }, [load, dateStr, settings.pantry_enabled, logPantryId]);

  const plannedEntries = entries.filter(e => e.status === 'planned');
  const plannedKcalSum = Math.round(plannedEntries.reduce((s, e) => s + e.calories, 0));

  const freqMap = new Map(frequent.map(f => [f.id, f.use_count]));
  const searchItems: SearchItem[] = [
    ...foods.map(f => ({ ...f, _freq: freqMap.get(f.id) || 0, isRecipe: false as const })),
    ...recipes.map(r => ({ ...r, isRecipe: true as const, _freq: 0 })),
  ];

  async function handleSelect(item: SearchItem) {
    if (item.isRecipe) {
      const full = await api.recipes.get((item as Recipe).id);
      setSelectedRecipe({ id: full.id, name: full.name, ingredients: (full.ingredients || []).map(ing => ({ ...ing, editGrams: ing.grams })) });
      setSelectedFood(null); setAmount('');
    } else {
      const food = item as Food;
      const isBulk = food.is_bulk === 1;
      const hasPieces = !!food.piece_grams;
      const hasPackages = (food.packages?.length ?? 0) > 0;
      const defaultPieces = !isBulk && (hasPieces || hasPackages);
      setSelectedFood(food); setSelectedRecipe(null); setUsePieces(defaultPieces);
      setSelectedPackId(defaultPieces && !hasPieces && hasPackages ? food.packages![0].id : null);
      setAmount(defaultPieces ? '1' : '');
    }
  }

  function handleClear() { setSelectedFood(null); setSelectedRecipe(null); setAmount(''); setSelectedPackId(null); setSearchKey(k => k + 1); }

  const selectedPack = selectedFood?.packages?.find(p => p.id === selectedPackId) ?? null;
  const pieceSize: number | null = selectedFood?.piece_grams ?? selectedPack?.grams ?? null;
  const effectiveGrams = selectedFood
    ? (usePieces && pieceSize != null ? Math.round((evalExpr(amount) ?? 0) * pieceSize * 100) / 100 : (evalExpr(amount) ?? 0))
    : 0;

  const logStatus = planMode ? 'planned' : 'logged';

  async function handleLogFood(status: 'logged' | 'planned') {
    if (!selectedFood || !effectiveGrams) return;
    const result = await api.log.add({ food_id: selectedFood.id, grams: effectiveGrams, meal, date: dateStr, status, pantry_id: logPantryId });
    if (result.shortage > 0 && result.shortage_food) {
      showToast(t('pantry.shortage').replace('{n}', String(Math.round(result.shortage))).replace('{food}', result.shortage_food), 'warning');
    }
    if (result.events?.length) pushDeduction(result.events);
    setSelectedFood(null); setAmount(''); setSelectedPackId(null); setSearchKey(k => k + 1);
    load();
  }

  async function handleLogRecipe(status: 'logged' | 'planned') {
    if (!selectedRecipe) return;
    const shortages: string[] = [];
    const allEvents: import('../types').DeductionEvent[] = [];
    for (const ing of selectedRecipe.ingredients) {
      if (ing.editGrams > 0) {
        const result = await api.log.add({ food_id: ing.food_id, grams: ing.editGrams, meal, date: dateStr, status, pantry_id: logPantryId });
        if (result.shortage > 0 && result.shortage_food) shortages.push(`${Math.round(result.shortage)}g of ${result.shortage_food}`);
        if (result.events?.length) allEvents.push(...result.events);
      }
    }
    if (shortages.length > 0) showToast(t('pantry.shortageMulti').replace('{list}', shortages.join(', ')), 'warning');
    if (allEvents.length) pushDeduction(allEvents);
    setSelectedRecipe(null); setSearchKey(k => k + 1);
    load();
  }

  async function handleConfirmPlanned(id: number) {
    const result = await api.log.confirmPlanned({ id, pantry_id: logPantryId });
    if (result.shortage > 0 && result.shortage_food) {
      showToast(t('pantry.shortage').replace('{n}', String(Math.round(result.shortage))).replace('{food}', result.shortage_food), 'warning');
    }
    if (result.events?.length) pushDeduction(result.events);
    load();
  }

  async function handleConfirmAll() {
    const result = await api.log.confirmAllPlanned({ date: dateStr, pantry_id: logPantryId });
    if (result.shortages?.length > 0) {
      const list = result.shortages.map(s => `${s.shortage}g of ${s.food_name}`).join(', ');
      showToast(t('pantry.shortageMulti').replace('{list}', list), 'warning');
    }
    if (result.events?.length) pushDeduction(result.events);
    setConfirmAllOpen(false); load();
  }

  async function addWater(ml: number) {
    await api.water.add({ date: dateStr, ml, source: 'manual' });
    const wd = await api.water.getDay(dateStr);
    setWaterTotal(wd.total_ml); setWaterEntries(wd.entries);
  }

  async function handleWaterCustom() {
    const ml = parseFloat(waterCustomMl);
    if (!ml) return;
    await addWater(ml);
    setWaterCustomMl(''); setWaterCustomOpen(false);
  }

  async function handleTakeSuppl(id: number) {
    await api.supplements.take({ supplement_id: id, date: dateStr });
    setSupplements(await api.supplements.getDay(dateStr));
  }

  function handleNoteChange(val: string) {
    setNote(val);
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
    noteSaveTimer.current = setTimeout(() => { api.notes.save({ date: dateStr, note: val }); }, 1000);
  }

  function handleEnergySave() {
    const resting   = parseFloat(restingKcal) || 0;
    const active    = parseFloat(activeKcal)  || 0;
    const extra     = parseFloat(extraKcal)   || 0;
    const stepCount = parseInt(steps, 10)     || 0;
    api.dailyEnergy.set({ date: dateStr, resting_kcal: resting, active_kcal: active, extra_kcal: extra, steps: stepCount });
    setRestingFromYest(false);
  }

  async function handleCopyDay() {
    const md = buildDayMarkdown({
      date: dateStr, entries, settings, waterMl: waterTotal, waterGoalMl: settings.water_goal,
      restingKcal: energyResting || undefined, activeKcal: energyActive || undefined,
      extraKcal: energyExtra || undefined, note,
    });
    const ok = await copyToClipboard(md);
    showToast(ok ? t('export.copied') : t('export.copyFailed'), ok ? 'success' : 'error');
  }

  function selectPantry(id: number) {
    setLogPantryId(id);
    localStorage.setItem('dashPantry', JSON.stringify({ id, date: today() }));
  }

  async function quickLog(food: Food) {
    const smallestPack = (food.packages ?? []).reduce<number | null>(
      (min, p) => (min == null || p.grams < min ? p.grams : min), null,
    );
    const grams = (food.is_bulk !== 1 && smallestPack != null)
      ? smallestPack
      : (food.piece_grams || 100);
    const result = await api.log.add({ food_id: food.id, grams, meal: 'AfternoonSnack', date: dateStr, status: logStatus, pantry_id: logPantryId });
    showToast(t('dash.quickLogToast', { name: food.name, grams }), 'success');
    if (result.events?.length) pushDeduction(result.events);
    load();
  }

  async function logSuggestion(s: MealSuggestion, mealSlot: string) {
    const result = await api.log.add({ food_id: s.food_id, grams: s.suggestedGrams, meal: mealSlot as Meal, date: dateStr, status: logStatus, pantry_id: logPantryId });
    showToast(t('dash.quickLogToast', { name: s.name, grams: s.suggestedGrams }), 'success');
    if (result.events?.length) pushDeduction(result.events);
    load();
  }

  async function applyTdee(tdee: number) {
    await api.settings.save({ cal_rec: tdee, cal_min: Math.round(tdee * 0.9), cal_max: Math.round(tdee * 1.1), tdee_last_seen_value: tdee });
    invalidate();
    showToast(t('dash.tdee.applied'), 'success');
  }

  async function dismissTdee(tdee: number) {
    await api.settings.save({ tdee_last_seen_value: tdee });
    invalidate();
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  const loggedEntries  = entries.filter(e => e.status === 'logged');
  const caloriesIn     = Math.round(loggedEntries.reduce((s, e) => s + e.calories, 0));
  const energyResting  = parseFloat(restingKcal) || 0;
  const energyActive   = parseFloat(activeKcal)  || 0;
  const energyExtra    = parseFloat(extraKcal)   || 0;
  const stepCount      = parseInt(steps, 10)     || 0;
  const energyOut      = energyResting + energyActive + energyExtra;
  const netKcal        = caloriesIn - energyOut;

  const TG = {
    cal:     { min: settings.cal_min || 1900,     max: settings.cal_max || 2450,  rec: settings.cal_rec || 2250 },
    protein: { min: settings.protein_min || 160,  max: settings.protein_max || 215, rec: settings.protein_rec || 185 },
    carbs:   { min: settings.carbs_min || 140,    max: settings.carbs_max || 280,   rec: settings.carbs_rec || 210 },
    fat:     { min: settings.fat_min || 63,       max: settings.fat_max || 95,      rec: settings.fat_rec || 75 },
  };

  const T = {
    cal:     caloriesIn,
    protein: loggedEntries.reduce((s, e) => s + e.protein, 0),
    carbs:   loggedEntries.reduce((s, e) => s + e.carbs, 0),
    fat:     loggedEntries.reduce((s, e) => s + e.fat, 0),
  };

  const waterGoal = settings.water_goal || 2000;

  // Group entries by meal
  const mealGroups = MEAL_ORDER.map(m => {
    const items = loggedEntries.filter(e => e.meal === m);
    const cal = items.reduce((s, e) => s + e.calories, 0);
    const pro = items.reduce((s, e) => s + e.protein, 0);
    return { meal: m, label: t(MEAL_KEYS[m]) || m, items, cal, pro };
  }).filter(g => g.items.length > 0);

  const totalMeals = mealGroups.length;
  const totalFoods = loggedEntries.length;

  // Exercise summary
  const exTotalKcal = exercises.reduce((s, e) => s + (e.calories_burned || 0), 0);
  const exTotalMin  = exercises.reduce((s, e) => s + (e.duration_min || 0), 0);

  const isToday = dateStr === today();

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--fb-bg)', color: 'var(--fb-text)', fontFamily: 'var(--font-body)' }}>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header style={{
        flexShrink: 0, padding: '16px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--fb-border)',
        background: 'var(--fb-bg)',
        position: 'relative', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {fromWeek && (
            <button onClick={() => navigate('week', { weekStart: fromWeek })} style={{ ...btnIcon, marginRight: -4 }} title={t('day.back')}>←</button>
          )}
          <button onClick={() => setDateStr(addDays(dateStr, -1))} style={btnIcon}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--fb-accent)' }}>
              {isToday ? t('dash.diaryToday') : t('dash.diaryTitle')}
            </div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 400, fontStyle: 'italic', letterSpacing: -0.4, color: 'var(--fb-text)', lineHeight: 1.1 }}>
              {fmtDate(dateStr, settings.language ?? 'en')}
            </div>
            <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
          </div>
          <button onClick={() => setDateStr(addDays(dateStr, 1))} style={btnIcon}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <div style={{ width: 1, height: 22, background: 'var(--fb-border)', margin: '0 4px' }} />
          <button onClick={() => setSwapOpen(true)} style={btnGhost}>{t('dash.planBtn')}</button>
          <button onClick={() => setCopyDayOpen(true)} style={btnIcon} title={t('copyDay.title')}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3"/><rect x="8" y="2" width="8" height="7" rx="1"/></svg>
          </button>
          <button onClick={handleCopyDay} style={btnIcon} title={t('export.copyDay')}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          {pantries.length > 1 && (
            <select value={logPantryId || ''} onChange={e => selectPantry(Number(e.target.value))}
              style={{ fontSize: 11, background: 'var(--fb-card)', border: '1px solid var(--fb-border)', borderRadius: 6, padding: '4px 8px', color: 'var(--fb-text-2)', outline: 'none' }}>
              {pantries.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {/* ── SEARCH INLINE ────────────────────────────────────────── */}
          <div style={{ position: 'relative', minWidth: 360 }}>
            <FoodSearch key={searchKey} items={searchItems} onSelect={handleSelect} onClear={handleClear}
              placeholder={t('dash.searchPlaceholder')} pantryId={logPantryId} compact />

            {(selectedFood || selectedRecipe) && (
              <>
                <div onClick={handleClear} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />

                <div style={{
                  position: 'absolute', top: 'calc(100% + 10px)', right: 0,
                  width: 480, zIndex: 20,
                  background: 'var(--fb-card)', border: '1px solid var(--fb-border-strong)',
                  borderRadius: 14, padding: 16,
                  boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
                  animation: 'fb-fade-up 0.15s ease',
                }}>
                  {selectedFood && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'fb-fade-up 0.15s ease' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--fb-text)' }}>{selectedFood.name}</span>
                        <button onClick={handleClear} style={{ ...btnIcon, color: 'var(--fb-text-3)' }}>✕</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
                            onBlur={() => setAmount(v => resolveExpr(v))}
                            placeholder={usePieces ? t('common.pieces') : t('common.grams')}
                            autoFocus
                            style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border-strong)', borderRadius: 8, padding: '10px 14px', fontSize: 18, fontWeight: 600, color: 'var(--fb-text)', outline: 'none', fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums' }}
                          />
                          <MealPills selected={meal} onChange={setMeal} />
                        </div>
                        <div style={{ background: 'var(--fb-bg-2)', borderRadius: 8, border: '1px solid var(--fb-border)', padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          {effectiveGrams > 0 ? (() => {
                            const r = effectiveGrams / 100;
                            return (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                {([['kcal', Math.round(selectedFood.calories * r)], ['P', `${Math.round(selectedFood.protein * r * 10) / 10}g`], ['C', `${Math.round(selectedFood.carbs * r * 10) / 10}g`], ['F', `${Math.round(selectedFood.fat * r * 10) / 10}g`]] as [string, string | number][]).map(([l, v]) => (
                                  <div key={l}>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fb-text)', fontFamily: 'var(--font-serif)', lineHeight: 1 }}>{v}</div>
                                    <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--fb-text-3)', marginTop: 2 }}>{l}</div>
                                  </div>
                                ))}
                              </div>
                            );
                          })() : (
                            <span style={{ fontSize: 11, color: 'var(--fb-text-3)', fontStyle: 'italic' }}>
                              {t('dash.per100g').replace('{n}', String(selectedFood.calories))}
                            </span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => handleLogFood(logStatus)} disabled={!effectiveGrams}
                        style={{ ...btnPrimary, justifyContent: 'center', padding: '10px 16px', fontSize: 13, opacity: !effectiveGrams ? 0.4 : 1 }}>
                        {planMode ? t('dash.addToPlan') : t('dash.logFood')}
                      </button>
                    </div>
                  )}

                  {selectedRecipe && (() => {
                    const rt = selectedRecipe.ingredients.reduce((acc, ing) => {
                      const r = ing.editGrams / ing.grams;
                      return { cal: acc.cal + ing.calories * r, protein: acc.protein + ing.protein * r, carbs: acc.carbs + ing.carbs * r, fat: acc.fat + ing.fat * r };
                    }, { cal: 0, protein: 0, carbs: 0, fat: 0 });
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--fb-text)' }}>{selectedRecipe.name}</span>
                          <button onClick={handleClear} style={{ ...btnIcon, color: 'var(--fb-text-3)' }}>✕</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 180, overflowY: 'auto' }}>
                          {selectedRecipe.ingredients.map((ing, i) => (
                            <div key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--fb-bg-2)', borderRadius: 8, padding: '7px 10px', border: '1px solid var(--fb-border)' }}>
                              <span style={{ flex: 1, fontSize: 12, color: 'var(--fb-text)' }}>{ing.name}</span>
                              <input type="text" inputMode="decimal" value={ing.editGrams}
                                onChange={e => { const val = parseFloat(e.target.value) || 0; setSelectedRecipe(r => r ? { ...r, ingredients: r.ingredients.map((x, j) => j === i ? { ...x, editGrams: val } : x) } : r); }}
                                style={{ width: 56, background: 'var(--fb-card)', border: '1px solid var(--fb-border)', borderRadius: 6, padding: '4px 8px', fontSize: 12, textAlign: 'center', color: 'var(--fb-text)', outline: 'none' }}
                              />
                              <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>g</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--fb-text-2)' }}>
                          <span>{Math.round(rt.cal)} kcal</span>
                          <span>P {Math.round(rt.protein * 10) / 10}g</span>
                          <span>C {Math.round(rt.carbs * 10) / 10}g</span>
                          <span>F {Math.round(rt.fat * 10) / 10}g</span>
                        </div>
                        <MealPills selected={meal} onChange={setMeal} />
                        <button onClick={() => handleLogRecipe(logStatus)} style={{ ...btnPrimary, justifyContent: 'center', padding: '10px 16px', fontSize: 13 }}>
                          {planMode ? t('dash.addToPlan') : t('dash.logRecipe')}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>

          <button onClick={() => setQuickFoodOpen(true)} style={btnPrimary}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            {t('dash.addBtn')}
          </button>
          {planMode && (
            <button onClick={() => setPlanMode(false)}
              style={{ ...btnGhost, borderColor: 'var(--fb-accent)', color: 'var(--fb-accent)', background: 'var(--fb-accent-soft)' }}>
              Piano
            </button>
          )}
        </div>
      </header>

      {/* ── SCROLL AREA ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 60px' }} className="hide-scrollbar">
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {widgetOrder.map(wid => {
            const dragProps = {
              id: wid, dragId, dragOverId,
              onDragStart: setDragId,
              onDragOver: setDragOverId,
              onDrop: handleWidgetDrop,
              onDragEnd: () => { setDragId(null); setDragOverId(null); },
            };
            if (wid === 'gamification') return (
              <DragSection key={wid} {...dragProps}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <GamificationCard />
                  <SectionStreaksCard />
                </div>
              </DragSection>
            );
            if (wid === 'hero') return (
              <DragSection key={wid} {...dragProps}>
                <section className="dash-hero-grid">
                  <DailyIntakeCard
                    calories={{ actual: T.cal,     min: TG.cal.min,     max: TG.cal.max,     rec: TG.cal.rec }}
                    protein={{ actual: T.protein,  min: TG.protein.min, max: TG.protein.max, rec: TG.protein.rec }}
                    carbs={{   actual: T.carbs,    min: TG.carbs.min,   max: TG.carbs.max,   rec: TG.carbs.rec }}
                    fat={{     actual: T.fat,      min: TG.fat.min,     max: TG.fat.max,     rec: TG.fat.rec }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <EnergyBalanceCard
                      caloriesIn={caloriesIn}
                      netKcal={netKcal}
                      energyOut={energyOut}
                      stepCount={stepCount}
                      restingKcal={restingKcal}
                      activeKcal={activeKcal}
                      extraKcal={extraKcal}
                      steps={steps}
                      restingFromYest={restingFromYest}
                      onRestingChange={v => { setRestingKcal(v); setRestingFromYest(false); }}
                      onActiveChange={setActiveKcal}
                      onExtraChange={setExtraKcal}
                      onStepsChange={v => setSteps(v.replace(/[^0-9]/g, ''))}
                      onSave={handleEnergySave}
                    />
                    <WaterCard
                      waterTotal={waterTotal}
                      waterGoal={waterGoal}
                      onAdd={addWater}
                      onCustom={() => setWaterCustomOpen(true)}
                    />
                  </div>
                </section>
              </DragSection>
            );
            if (wid === 'tasks_habits') return (
              <DragSection key={wid} {...dragProps}>
                <section className="dash-secondary-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <TasksCard />
                  <HabitsCard />
                </section>
              </DragSection>
            );
            if (wid === 'diary') return (
              <DragSection key={wid} {...dragProps}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <QuickLogStrip
                    favorites={favorites}
                    frequent={frequent}
                    onQuickLog={quickLog}
                    onNavigateFoods={() => navigate('foods')}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <ReliabilityPill date={dateStr} />
                  </div>
                  <DiaryTable
                    mealGroups={mealGroups}
                    loggedEntries={loggedEntries}
                    plannedEntries={plannedEntries}
                    totalFoods={totalFoods}
                    totalMeals={totalMeals}
                    plannedKcalSum={plannedKcalSum}
                    onConfirmPlanned={handleConfirmPlanned}
                    onConfirmAll={() => setConfirmAllOpen(true)}
                    onAddToMeal={m => { setMeal(m as Meal); handleClear(); }}
                    onAddFirst={() => handleClear()}
                    onCopyDay={handleCopyDay}
                  />
                </div>
              </DragSection>
            );
            if (wid === 'adaptive_tdee') return (
              <DragSection key={wid} {...dragProps}>
                <AdaptiveTdeeCard
                  result={tdeeResult}
                  calRec={TG.cal.rec}
                  onApply={applyTdee}
                  onDismiss={dismissTdee}
                  onNavigateGoals={() => navigate('goals')}
                />
              </DragSection>
            );
            if (wid === 'meal_suggest') return (
              <DragSection key={wid} {...dragProps}>
                <MealSuggestionCard
                  data={mealSuggest}
                  onLog={logSuggestion}
                  onNavigateFoods={() => navigate('foods')}
                />
              </DragSection>
            );
            if (wid === 'lifestyle') return (
              <DragSection key={wid} {...dragProps}>
                <section className="dash-secondary-grid">
                  <SleepCard />
                  <FocusCard />
                  <MoodCard />
                </section>
              </DragSection>
            );
            if (wid === 'workout') return (
              <DragSection key={wid} {...dragProps}>
                <WorkoutCard />
              </DragSection>
            );
            if (wid === 'insights') return (
              <DragSection key={wid} {...dragProps}>
                <InsightCard />
              </DragSection>
            );
            if (wid === 'secondary') return (
              <DragSection key={wid} {...dragProps}>
                <section className="dash-secondary-grid">
                  <SupplementsWidget supplements={supplements} onTake={handleTakeSuppl} />
                  <PantryWidget enabled={settings.pantry_enabled !== 0} lowItems={pantryLow} />
                  <WeightWidget weightKg={weightKg} weightTrend={weightTrend} />
                </section>
              </DragSection>
            );
            if (wid === 'collapsibles') return (
              <DragSection key={wid} {...dragProps}>
                <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <CollapsibleSection
                    icon={<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 6.5a5 5 0 000 11M17.5 6.5a5 5 0 010 11M3 12h3m12 0h3M6.5 12h11"/></svg>}
                    title={t('dash.exerciseTitle')}
                    subtitle={exercises.length > 0 ? t('dash.exerciseSummary', { n: exercises.length, kcal: exTotalKcal, min: exTotalMin }) : t('dash.logWorkout')}
                    badge={exercises.length > 0 ? t('dash.nSessions', { n: exercises.length }) : t('dash.empty')}
                  >
                    <ExerciseSection date={dateStr} weightKg={weightKg} onCaloriesChange={() => {}} />
                  </CollapsibleSection>
                  <CollapsibleSection
                    icon={<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
                    title={t('dash.notesTitle')}
                    subtitle={note ? note.slice(0, 60) + (note.length > 60 ? '…' : '') : t('dash.notesHint')}
                    badge={note ? t('dash.hasNote') : t('dash.empty')}
                  >
                    <textarea value={note} onChange={e => handleNoteChange(e.target.value)}
                      placeholder={t('dash.notesPlaceholder')} rows={4}
                      style={{ width: '100%', background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--fb-text)', outline: 'none', fontFamily: 'var(--font-body)', resize: 'vertical', marginTop: 12 }}
                    />
                  </CollapsibleSection>
                </section>
              </DragSection>
            );
            return null;
          })}
        </div>
      </div>

      {/* ── MODALS ───────────────────────────────────────────────────────── */}
      <QuickFoodDialog isOpen={quickFoodOpen} onClose={() => setQuickFoodOpen(false)} date={dateStr} meal={meal} onLogged={load} />

      <SwapDaysModal
        isOpen={swapOpen} initialDate={dateStr}
        onClose={() => setSwapOpen(false)}
        onSwapped={n => { showToast(t('swap.toastSwapped').replace('{n}', String(n)), 'success'); load(); }}
      />

      <CopyDayModal
        isOpen={copyDayOpen} initialDate={dateStr}
        onClose={() => setCopyDayOpen(false)}
        onCopied={n => { showToast(t('copyDay.submit') + ': ' + n, 'success'); load(); }}
      />

      <Modal isOpen={waterCustomOpen} onClose={() => setWaterCustomOpen(false)} title={t('dash.addWater')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="text" inputMode="decimal" value={waterCustomMl} onChange={e => setWaterCustomMl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleWaterCustom()} autoFocus
            placeholder="es. 330"
            style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border-strong)', borderRadius: 8, padding: '10px 14px', fontSize: 15, color: 'var(--fb-text)', outline: 'none', fontFamily: 'var(--font-body)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setWaterCustomOpen(false)} style={btnGhost}>{t('common.cancel')}</button>
            <button onClick={handleWaterCustom} disabled={!waterCustomMl} style={btnPrimary}>{t('common.add')}</button>
          </div>
        </div>
      </Modal>

      <DeductionEventModal event={deductionEvent} onDone={nextDeduction} pushMore={pushDeduction} onPantryChanged={load} />

      {confirmAllOpen && (
        <ConfirmDialog
          message={t('dash.confirmAllMsg').replace('{n}', String(plannedEntries.length))}
          confirmLabel={t('dash.confirmAll')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleConfirmAll}
          onCancel={() => setConfirmAllOpen(false)}
        />
      )}
    </div>
  );
}
