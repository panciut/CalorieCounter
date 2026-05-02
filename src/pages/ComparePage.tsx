import { useState, useEffect, useMemo } from 'react';
import { useT } from '../i18n/useT';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../components/Toast';
import { api } from '../api';
import FoodSearch from '../components/FoodSearch';
import Tabs from '../components/ui/Tabs';
import UnmatchedFoodsList from '../components/UnmatchedFoodsList';
import PageHeader from '../components/ui/PageHeader';
import { buildCompareMarkdown, copyToClipboard } from '../lib/exportText';
import type { Food } from '../types';
import type { SearchItem } from '../components/FoodSearch';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'compare' | 'rank' | 'match';

type CompareMode = 'per100g' | 'per100kcal' | 'perPiece' | 'perPackage' | 'customG' | 'customKcal';

type RankMetric =
  | 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'
  | 'netCarbs' | 'energyDensity' | 'proteinDensity' | 'satiety'
  | 'pricePer100g' | 'pricePer100kcal' | 'pricePer10gProtein';

const MAX_FOODS = 5;

// ── Pure helpers ──────────────────────────────────────────────────────────────

function effectivePricePer100g(food: Food, selectedPkgId: number | null): number | null {
  if (selectedPkgId != null) {
    const pkg = food.packages?.find(p => p.id === selectedPkgId);
    if (pkg?.price != null && pkg.grams > 0) return (pkg.price / pkg.grams) * 100;
  }
  const priced = food.packages?.filter(p => p.price != null && p.grams > 0);
  if (priced && priced.length > 0) {
    const cheapest = priced.reduce((best, p) =>
      (p.price! / p.grams) < (best.price! / best.grams) ? p : best
    );
    return (cheapest.price! / cheapest.grams) * 100;
  }
  return food.price_per_100g ?? null;
}

interface NormalizedRow {
  food: Food;
  gramsEff: number | null;
  kcalBudget: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  netCarbs: number;
  energyDensity: number;
  proteinDensity: number;
  satiety: number;
  macroPctP: number;
  macroPctC: number;
  macroPctF: number;
  price: number | null;
  pricePer100g: number | null;
  pricePer100kcal: number | null;
  pricePer10gProtein: number | null;
  available: boolean;
}

function normalize(
  food: Food,
  mode: CompareMode,
  ctx: { customG: number; customKcal: number; pkgId: number | null; pricePer100g: number | null }
): NormalizedRow {
  const base = { food, gramsEff: null as number | null, kcalBudget: null as number | null };

  let gramsEff: number | null = null;
  let kcalBudget: number | null = null;
  let available = true;

  switch (mode) {
    case 'per100g':
      gramsEff = 100;
      break;
    case 'per100kcal':
      if (!food.calories) { available = false; break; }
      gramsEff = (100 / food.calories) * 100;
      kcalBudget = 100;
      break;
    case 'perPiece':
      if (!food.piece_grams) { available = false; break; }
      gramsEff = food.piece_grams;
      break;
    case 'perPackage': {
      let pkgGrams: number | null = null;
      if (ctx.pkgId != null) {
        pkgGrams = food.packages?.find(p => p.id === ctx.pkgId)?.grams ?? null;
      } else {
        pkgGrams = food.packages?.[0]?.grams ?? null;
      }
      if (!pkgGrams) { available = false; break; }
      gramsEff = pkgGrams;
      break;
    }
    case 'customG':
      gramsEff = ctx.customG;
      break;
    case 'customKcal':
      if (!food.calories) { available = false; break; }
      gramsEff = (ctx.customKcal / food.calories) * 100;
      kcalBudget = ctx.customKcal;
      break;
  }

  if (!available || gramsEff === null) {
    return {
      ...base, gramsEff: null, kcalBudget: null,
      calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
      netCarbs: 0, energyDensity: 0, proteinDensity: 0, satiety: 0,
      macroPctP: 0, macroPctC: 0, macroPctF: 0,
      price: null, pricePer100g: null, pricePer100kcal: null, pricePer10gProtein: null,
      available: false,
    };
  }

  const scale = gramsEff / 100;
  const calories  = food.calories  * scale;
  const protein   = food.protein   * scale;
  const carbs     = food.carbs     * scale;
  const fat       = food.fat       * scale;
  const fiber     = food.fiber     * scale;
  const netCarbs  = carbs - fiber;

  // Intensive metrics (don't depend on scale)
  const energyDensity  = food.calories / 100;
  const proteinDensity = food.calories > 0 ? (food.protein / food.calories) * 100 : 0;
  const satiety        = food.calories > 0 ? ((food.protein + food.fiber) / food.calories) * 100 : 0;

  const kcalFromMacros = food.protein * 4 + food.carbs * 4 + food.fat * 9;
  const macroPctP = kcalFromMacros > 0 ? Math.round((food.protein * 4 / kcalFromMacros) * 100) : 0;
  const macroPctF = kcalFromMacros > 0 ? Math.round((food.fat * 9 / kcalFromMacros) * 100) : 0;
  const macroPctC = 100 - macroPctP - macroPctF;

  const pp100g = ctx.pricePer100g;
  const price              = pp100g != null ? pp100g * scale : null;
  const pricePer100g       = pp100g;
  const pricePer100kcal    = (pp100g != null && food.calories > 0) ? (pp100g * 100 / food.calories) : null;
  const pricePer10gProtein = (pp100g != null && food.protein > 0) ? (pp100g * 10 / food.protein) : null;

  return {
    food, gramsEff: mode === 'per100kcal' ? null : gramsEff, kcalBudget,
    calories, protein, carbs, fat, fiber, netCarbs,
    energyDensity, proteinDensity, satiety,
    macroPctP, macroPctC, macroPctF,
    price, pricePer100g, pricePer100kcal, pricePer10gProtein,
    available: true,
  };
}

function fmt(v: number, d = 1): string {
  return v.toFixed(d).replace(/\.0+$/, d === 0 ? '' : '.0');
}

function fmtOrDash(v: number | null, d = 1): string {
  return v == null ? '—' : fmt(v, d);
}

// ── Rank metric config ────────────────────────────────────────────────────────

const RANK_METRIC_LABELS: Record<RankMetric, string> = {
  calories:           'Calories (kcal/100g)',
  protein:            'Protein (g/100g)',
  carbs:              'Carbs (g/100g)',
  fat:                'Fat (g/100g)',
  fiber:              'Fiber (g/100g)',
  netCarbs:           'Net carbs (g/100g)',
  energyDensity:      'Energy density (kcal/g)',
  proteinDensity:     'Protein density (g/100 kcal)',
  satiety:            'Satiety (P+Fi /100 kcal)',
  pricePer100g:       'Price /100g',
  pricePer100kcal:    'Price /100 kcal',
  pricePer10gProtein: 'Price /10g protein',
};

// true = higher value is better (default sort desc), false = lower is better (sort asc)
const RANK_DIR_DEFAULT: Record<RankMetric, boolean> = {
  calories: false, protein: true, carbs: false, fat: false, fiber: true,
  netCarbs: false, energyDensity: false, proteinDensity: true, satiety: true,
  pricePer100g: false, pricePer100kcal: false, pricePer10gProtein: false,
};

function computeRankValue(food: Food, metric: RankMetric): number | null {
  switch (metric) {
    case 'calories':           return food.calories;
    case 'protein':            return food.protein;
    case 'carbs':              return food.carbs;
    case 'fat':                return food.fat;
    case 'fiber':              return food.fiber;
    case 'netCarbs':           return food.carbs - food.fiber;
    case 'energyDensity':      return food.calories / 100;
    case 'proteinDensity':     return food.calories > 0 ? (food.protein / food.calories) * 100 : null;
    case 'satiety':            return food.calories > 0 ? ((food.protein + food.fiber) / food.calories) * 100 : null;
    case 'pricePer100g': {
      const p = effectivePricePer100g(food, null);
      return p;
    }
    case 'pricePer100kcal': {
      const p = effectivePricePer100g(food, null);
      return (p != null && food.calories > 0) ? (p * 100 / food.calories) : null;
    }
    case 'pricePer10gProtein': {
      const p = effectivePricePer100g(food, null);
      return (p != null && food.protein > 0) ? (p * 10 / food.protein) : null;
    }
  }
}

const INPUT_CLS = 'bg-bg border border-border rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-accent';

// ── Compare tab ───────────────────────────────────────────────────────────────

function CompareTab({
  allFoods,
  settings,
  t,
  seeds = [],
}: {
  allFoods: Food[];
  settings: ReturnType<typeof useSettings>['settings'];
  t: (k: string) => string;
  seeds?: Food[];
}) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Food[]>(() => seeds);
  const [mode, setMode] = useState<CompareMode>('per100g');
  const [customG, setCustomG] = useState('100');
  const [customKcal, setCustomKcal] = useState('100');
  const [pkgChoice, setPkgChoice] = useState<Record<number, number>>({}); // food_id -> package_id
  const currency = settings.currency_symbol ?? '€';

  function addFood(item: SearchItem) {
    if ('isRecipe' in item && item.isRecipe) return;
    const food = item as Food;
    if (selected.find(f => f.id === food.id)) return;
    if (selected.length >= MAX_FOODS) return;
    setSelected(prev => [...prev, food]);
  }

  function removeFood(id: number) {
    setSelected(prev => prev.filter(f => f.id !== id));
    setPkgChoice(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  const rows = useMemo<NormalizedRow[]>(() => {
    return selected.map(food => {
      const pkgId = pkgChoice[food.id] ?? null;
      const pp100g = effectivePricePer100g(food, pkgId);
      return normalize(food, mode, {
        customG: parseFloat(customG) || 100,
        customKcal: parseFloat(customKcal) || 100,
        pkgId,
        pricePer100g: pp100g,
      });
    });
  }, [selected, mode, customG, customKcal, pkgChoice]);

  const hasPrices = rows.some(r => r.pricePer100g != null);

  const modes: { key: CompareMode; label: string }[] = [
    { key: 'per100g',   label: t('compare.mode.per100g') },
    { key: 'per100kcal',label: t('compare.mode.per100kcal') },
    { key: 'perPiece',  label: t('compare.mode.perPiece') },
    { key: 'perPackage',label: t('compare.mode.perPackage') },
    { key: 'customG',   label: t('compare.mode.customG') },
    { key: 'customKcal',label: t('compare.mode.customKcal') },
  ];

  async function handleCopy() {
    const md = buildCompareMarkdown(
      rows.map(r => ({
        name: r.food.name,
        gramsEff: r.gramsEff,
        kcalBudget: r.kcalBudget,
        calories: r.calories,
        protein: r.protein,
        carbs: r.carbs,
        fat: r.fat,
        fiber: r.fiber,
        netCarbs: r.netCarbs,
        energyDensity: r.energyDensity,
        proteinDensity: r.proteinDensity,
        satiety: r.satiety,
        macroPctP: r.macroPctP,
        macroPctC: r.macroPctC,
        macroPctF: r.macroPctF,
        price: r.price,
        pricePer100g: r.pricePer100g,
        pricePer100kcal: r.pricePer100kcal,
        pricePer10gProtein: r.pricePer10gProtein,
        available: r.available,
      })),
      modes.find(m => m.key === mode)?.label ?? mode,
      currency,
    );
    const ok = await copyToClipboard(md);
    if (ok) showToast(t('common.copied') || 'Copied', 'success');
  }

  const cellCls = 'px-3 py-2 text-right tabular-nums text-sm text-text';
  const labelCls = 'px-3 py-2 text-left text-xs text-text-sec font-medium whitespace-nowrap';
  const sectionHeaderCls = 'px-3 py-1.5 text-left text-xs font-semibold text-text-sec uppercase tracking-wider bg-bg/50 border-t border-b border-border';

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {modes.map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer',
              mode === m.key
                ? 'bg-accent text-white border-accent'
                : 'text-text-sec border-border hover:border-accent/50 hover:text-text',
            ].join(' ')}
          >
            {m.label}
          </button>
        ))}
        {mode === 'customG' && (
          <input type="number" inputMode="decimal" min={1}
            value={customG} onChange={e => setCustomG(e.target.value)}
            className={`${INPUT_CLS} w-24`} />
        )}
        {mode === 'customKcal' && (
          <input type="number" inputMode="decimal" min={1}
            value={customKcal} onChange={e => setCustomKcal(e.target.value)}
            className={`${INPUT_CLS} w-24`} />
        )}
        <div className="ml-auto">
          {selected.length > 0 && (
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg text-xs border border-border text-text-sec hover:border-accent/50 hover:text-text transition-colors cursor-pointer"
            >
              📋 {t('compare.copyMarkdown')}
            </button>
          )}
        </div>
      </div>

      {/* Column headers + food picker */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[400px] border-collapse">
          <colgroup>
            <col className="w-44" />
            {selected.map(f => <col key={f.id} />)}
            {selected.length < MAX_FOODS && <col className="w-56" />}
          </colgroup>
          <thead>
            <tr className="border-b border-border">
              <th />
              {selected.map(food => (
                <th key={food.id} className="px-3 py-2 text-center align-top">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-semibold text-text leading-tight">{food.name}</span>
                      <button
                        onClick={() => removeFood(food.id)}
                        className="text-text-sec hover:text-red cursor-pointer text-xs leading-none"
                        title="Remove"
                      >✕</button>
                    </div>
                    {mode === 'perPackage' && food.packages && food.packages.length > 1 && (
                      <select
                        value={pkgChoice[food.id] ?? food.packages[0]?.id ?? ''}
                        onChange={e => setPkgChoice(prev => ({ ...prev, [food.id]: Number(e.target.value) }))}
                        className="text-xs bg-bg border border-border rounded px-1 py-0.5 text-text-sec cursor-pointer"
                      >
                        {food.packages.map(pkg => (
                          <option key={pkg.id} value={pkg.id}>{pkg.grams}g{pkg.price != null ? ` · ${currency}${pkg.price}` : ''}</option>
                        ))}
                      </select>
                    )}
                    {mode === 'perPackage' && (!food.packages || food.packages.length === 0) && (
                      <span className="text-xs text-text-sec italic">{t('compare.notAvailable')}</span>
                    )}
                  </div>
                </th>
              ))}
              {selected.length < MAX_FOODS && (
                <th className="px-3 py-2 align-top">
                  <FoodSearch
                    items={allFoods}
                    onSelect={addFood}
                    clearAfterSelect
                    showAllWhenEmpty
                    placeholder={t('compare.addFood')}
                  />
                </th>
              )}
            </tr>
          </thead>

          {selected.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={2} className="px-3 py-12 text-center text-sm text-text-sec">
                  {t('compare.emptyState')}
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {/* Nutrition block */}
              <tr><td colSpan={selected.length + 2} className={sectionHeaderCls}>Nutrition</td></tr>

              {rows.some(r => r.gramsEff != null) && (
                <tr className="border-t border-border/30">
                  <td className={labelCls}>{t('compare.effectiveGrams')}</td>
                  {rows.map(r => (
                    <td key={r.food.id} className={cellCls}>
                      {r.available && r.gramsEff != null ? `${fmt(r.gramsEff, 1)}g` : '—'}
                    </td>
                  ))}
                </tr>
              )}
              {rows.some(r => r.kcalBudget != null) && (
                <tr className="border-t border-border/30">
                  <td className={labelCls}>{t('compare.kcalBudget')}</td>
                  {rows.map(r => (
                    <td key={r.food.id} className={cellCls}>
                      {r.kcalBudget != null ? `${fmt(r.kcalBudget, 0)} kcal` : '—'}
                    </td>
                  ))}
                </tr>
              )}

              {([
                ['Calories (kcal)', (r: NormalizedRow) => fmtOrDash(r.available ? r.calories : null, 1)],
                ['Protein (g)',     (r: NormalizedRow) => fmtOrDash(r.available ? r.protein  : null)],
                ['Carbs (g)',       (r: NormalizedRow) => fmtOrDash(r.available ? r.carbs    : null)],
                ['Fat (g)',         (r: NormalizedRow) => fmtOrDash(r.available ? r.fat      : null)],
                ['Fiber (g)',       (r: NormalizedRow) => fmtOrDash(r.available ? r.fiber    : null)],
              ] as [string, (r: NormalizedRow) => string][]).map(([label, fn]) => (
                <tr key={label} className="border-t border-border/30">
                  <td className={labelCls}>{label}</td>
                  {rows.map(r => <td key={r.food.id} className={cellCls}>{fn(r)}</td>)}
                </tr>
              ))}

              {/* Derived block */}
              <tr><td colSpan={selected.length + 2} className={sectionHeaderCls}>{t('compare.energyDensity').split(' ')[0]} & {t('compare.netCarbs')}</td></tr>

              {([
                [t('compare.netCarbs'),       (r: NormalizedRow) => fmtOrDash(r.available ? r.netCarbs       : null)],
                [t('compare.energyDensity'),  (r: NormalizedRow) => fmtOrDash(r.available ? r.energyDensity  : null, 2)],
                [t('compare.proteinDensity'), (r: NormalizedRow) => fmtOrDash(r.available ? r.proteinDensity : null)],
                [t('compare.satiety'),        (r: NormalizedRow) => fmtOrDash(r.available ? r.satiety        : null)],
                [t('compare.macroSplit'),     (r: NormalizedRow) => r.available
                  ? `${r.macroPctP}% / ${r.macroPctC}% / ${r.macroPctF}%` : '—'],
              ] as [string, (r: NormalizedRow) => string][]).map(([label, fn]) => (
                <tr key={label} className="border-t border-border/30">
                  <td className={labelCls}>{label}</td>
                  {rows.map(r => <td key={r.food.id} className={cellCls}>{fn(r)}</td>)}
                </tr>
              ))}

              {/* Price block — only when at least one food has a price */}
              {hasPrices && (
                <>
                  <tr><td colSpan={selected.length + 2} className={sectionHeaderCls}>{t('compare.price.section')} ({currency})</td></tr>
                  {([
                    [t('compare.price.scaled'),      (r: NormalizedRow) => fmtOrDash(r.price, 2)],
                    [t('compare.price.per100g'),      (r: NormalizedRow) => fmtOrDash(r.pricePer100g, 2)],
                    [t('compare.price.per100kcal'),   (r: NormalizedRow) => fmtOrDash(r.pricePer100kcal, 2)],
                    [t('compare.price.per10gProtein'),(r: NormalizedRow) => fmtOrDash(r.pricePer10gProtein, 2)],
                  ] as [string, (r: NormalizedRow) => string][]).map(([label, fn]) => (
                    <tr key={label} className="border-t border-border/30">
                      <td className={labelCls}>{label}</td>
                      {rows.map(r => <td key={r.food.id} className={cellCls}>{fn(r)}</td>)}
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Rank tab ──────────────────────────────────────────────────────────────────

function RankTab({
  allFoods,
  settings,
  t,
  onCompareSelected,
}: {
  allFoods: Food[];
  settings: ReturnType<typeof useSettings>['settings'];
  t: (k: string) => string;
  onCompareSelected: (foods: Food[]) => void;
}) {
  const [metric, setMetric] = useState<RankMetric>('proteinDensity');
  const [dirDesc, setDirDesc] = useState<boolean>(RANK_DIR_DEFAULT['proteinDensity']);
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [normMode, setNormMode] = useState<'per100g' | 'per100kcal'>('per100g');
  const currency = settings.currency_symbol ?? '€';

  // When metric changes, auto-set direction
  function setMetricWithDir(m: RankMetric) {
    setMetric(m);
    setDirDesc(RANK_DIR_DEFAULT[m]);
  }

  function handleColClick(m: RankMetric) {
    if (m === metric) setDirDesc(v => !v);
    else setMetricWithDir(m);
  }

  // Scale a raw per-100g value to the current normMode
  function scaleVal(raw: number, food: Food): number {
    if (normMode === 'per100kcal') return food.calories > 0 ? (raw / food.calories) * 100 : 0;
    return raw;
  }

  const ranked = useMemo(() => {
    const withValues = allFoods.map(food => {
      let value = computeRankValue(food, metric);
      // For fixed macro metrics, scale by normMode
      if (normMode === 'per100kcal' && value != null &&
          ['calories','protein','carbs','fat','fiber','netCarbs'].includes(metric)) {
        value = food.calories > 0 ? (value / food.calories) * 100 : null;
      }
      const pp100g = effectivePricePer100g(food, null);
      return {
        food,
        value,
        pricePer100g: pp100g,
        pricePer100kcal: (pp100g != null && food.calories > 0) ? (pp100g * 100 / food.calories) : null,
      };
    });
    const filtered = search
      ? withValues.filter(r => r.food.name.toLowerCase().includes(search.toLowerCase()))
      : withValues;

    return filtered.sort((a, b) => {
      if (a.value == null && b.value == null) return 0;
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      return dirDesc ? b.value - a.value : a.value - b.value;
    });
  }, [allFoods, metric, dirDesc, search, normMode]);

  function toggleCheck(id: number) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_FOODS) next.add(id);
      return next;
    });
  }

  function handleCompareSelected() {
    const foods = ranked.filter(r => checked.has(r.food.id)).map(r => r.food);
    onCompareSelected(foods);
  }

  // Fixed columns always shown; derived metrics get an extra column
  const is100kcal = normMode === 'per100kcal';
  const FIXED_COLS: { label: string; m: RankMetric }[] = [
    { label: is100kcal ? '100 kcal' : 'kcal', m: 'calories' },
    { label: 'P',  m: 'protein' },
    { label: 'C',  m: 'carbs'   },
    { label: 'F',  m: 'fat'     },
    { label: 'Fi', m: 'fiber'   },
  ];
  const FIXED_METRIC_KEYS = new Set<RankMetric>(['calories', 'protein', 'carbs', 'fat', 'fiber', 'pricePer100g', 'pricePer100kcal']);
  const isDerived = !FIXED_METRIC_KEYS.has(metric);

  function thCls(m: RankMetric) {
    return [
      'px-3 py-2.5 text-right text-xs font-semibold select-none cursor-pointer whitespace-nowrap',
      'hover:text-accent transition-colors',
      metric === m ? 'text-accent' : 'text-text-sec',
    ].join(' ');
  }

  function dirArrow(m: RankMetric) {
    return metric === m ? (dirDesc ? ' ↓' : ' ↑') : '';
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={metric}
          onChange={e => setMetricWithDir(e.target.value as RankMetric)}
          className={`${INPUT_CLS} pr-6`}
        >
          {(Object.entries(RANK_METRIC_LABELS) as [RankMetric, string][]).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        {/* Per-100g / per-100kcal toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
          {(['per100g', 'per100kcal'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setNormMode(mode)}
              className={[
                'px-3 py-1.5 cursor-pointer transition-colors',
                normMode === mode ? 'bg-accent text-white' : 'text-text-sec hover:text-text',
              ].join(' ')}
            >
              {mode === 'per100g' ? '/100g' : '/100 kcal'}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('compare.rank.searchPlaceholder')}
          className={`${INPUT_CLS} w-44`}
        />
        {checked.size > 0 && (
          <button
            onClick={handleCompareSelected}
            className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90 transition-colors cursor-pointer"
          >
            {t('compare.rank.compareSelected').replace('{n}', String(checked.size))} ({checked.size}/{MAX_FOODS})
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-card border-b border-border">
              <th className="px-3 py-2.5 text-right text-xs text-text-sec w-10">#</th>
              <th className="px-2 py-2.5 w-8" />
              <th className="px-3 py-2.5 text-left text-xs text-text-sec">Name</th>
              {isDerived && (
                <th className={thCls(metric)} onClick={() => handleColClick(metric)}>
                  {RANK_METRIC_LABELS[metric]}{dirArrow(metric)}
                </th>
              )}
              {FIXED_COLS.map(({ label, m }) => (
                <th key={m} className={thCls(m)} onClick={() => handleColClick(m)}>
                  {label}{dirArrow(m)}
                </th>
              ))}
              <th className={thCls(is100kcal ? 'pricePer100kcal' : 'pricePer100g')} onClick={() => handleColClick(is100kcal ? 'pricePer100kcal' : 'pricePer100g')}>
                {currency}/{is100kcal ? '100kcal' : '100g'}{dirArrow(is100kcal ? 'pricePer100kcal' : 'pricePer100g')}
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map(({ food, value, pricePer100g, pricePer100kcal }, i) => (
              <tr
                key={food.id}
                className="border-t border-border/40 hover:bg-card/30 transition-colors cursor-pointer"
                onClick={() => toggleCheck(food.id)}
              >
                <td className="px-3 py-2 text-right text-xs text-text-sec tabular-nums">{i + 1}</td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={checked.has(food.id)}
                    onChange={() => toggleCheck(food.id)}
                    onClick={e => e.stopPropagation()}
                    disabled={!checked.has(food.id) && checked.size >= MAX_FOODS}
                    className="cursor-pointer accent-accent"
                  />
                </td>
                <td className="px-3 py-2 text-text font-medium">{food.name}</td>
                {isDerived && (
                  <td className="px-3 py-2 text-right tabular-nums text-accent font-semibold">
                    {value != null ? fmt(value, 2) : '—'}
                  </td>
                )}
                <td className={`px-3 py-2 text-right tabular-nums ${metric === 'calories' ? 'text-accent font-semibold' : 'text-text-sec'}`}>
                  {is100kcal ? '100' : fmt(food.calories, 1)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${metric === 'protein' ? 'text-accent font-semibold' : 'text-text-sec'}`}>
                  {fmt(scaleVal(food.protein, food), 1)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${metric === 'carbs' ? 'text-accent font-semibold' : 'text-text-sec'}`}>
                  {fmt(scaleVal(food.carbs, food), 1)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${metric === 'fat' ? 'text-accent font-semibold' : 'text-text-sec'}`}>
                  {fmt(scaleVal(food.fat, food), 1)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${metric === 'fiber' ? 'text-accent font-semibold' : 'text-text-sec'}`}>
                  {fmt(scaleVal(food.fiber, food), 1)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums text-xs ${(is100kcal ? metric === 'pricePer100kcal' : metric === 'pricePer100g') ? 'text-accent font-semibold' : 'text-text-sec'}`}>
                  {(() => { const v = is100kcal ? pricePer100kcal : pricePer100g; return v != null ? `${currency}${fmt(v, 2)}` : '—'; })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ComparePage ───────────────────────────────────────────────────────────────

export default function ComparePage() {
  const { t } = useT();
  const { settings } = useSettings();
  const [allFoods, setAllFoods] = useState<Food[]>([]);
  const [tab, setTab] = useState<Tab>('compare');
  const [compareSeeds, setCompareSeeds] = useState<Food[]>([]);

  useEffect(() => {
    api.foods.getAll().then(setAllFoods);
  }, []);

  function handleCompareSelected(foods: Food[]) {
    setCompareSeeds(foods);
    setTab('compare');
  }

  const tabItems: { id: Tab; label: string }[] = [
    { id: 'compare', label: t('compare.tabCompare') },
    { id: 'rank',    label: t('compare.tabRank') },
    { id: 'match',   label: t('compare.tabMatch') },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader eyebrow={t('eyebrow.compare')} title={t('page.compare')} />
      <Tabs items={tabItems} active={tab} onChange={setTab} />

      {tab === 'compare' && (
        <CompareTab
          key={compareSeeds.map(f => f.id).join(',') || 'empty'}
          allFoods={allFoods}
          settings={settings}
          t={t}
          seeds={compareSeeds}
        />
      )}
      {tab === 'rank' && (
        <RankTab
          allFoods={allFoods}
          settings={settings}
          t={t}
          onCompareSelected={handleCompareSelected}
        />
      )}
      {tab === 'match' && <UnmatchedFoodsList />}
    </div>
  );
}
