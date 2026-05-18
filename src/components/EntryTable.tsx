import { useState, Fragment } from 'react';
import { useT } from '../i18n/useT';
import { api } from '../api';
import { useToast } from './Toast';
import { useSettings } from '../hooks/useSettings';
import Modal from './Modal';
import EmptyState from './ui/EmptyState';
import ModalFooter from './ui/ModalFooter';
import MacroChips from './ui/MacroChips';
import { MEAL_ORDER, type LogEntry, type Food, type Meal } from '../types';

const SUB_CLS = 'ml-1 text-[10px] text-text-sec/60 tabular-nums';

function r1(n: number) { return Math.round(n * 10) / 10; }

function formatSaltCell(sodium_mg: number | null | undefined, unit: 'sodium' | 'salt'): string {
  if (sodium_mg == null) return '—';
  return unit === 'salt'
    ? `${r1(sodium_mg / 400)}g`
    : `${Math.round(sodium_mg)}mg`;
}

interface EntryTableProps {
  entries: LogEntry[];
  foods: Food[];
  onRefresh: () => void;
  onConfirm?: (id: number) => void;
}

interface EditState {
  id: number;
  food_id: number;
  origGrams: number;
  gramsStr: string;
  piecesStr: string;
  meal: Meal;
  mode: 'pieces' | 'grams';
  packId: number | null;
}

function smallestPackId(food: Food | undefined): number | null {
  const pkgs = food?.packages ?? [];
  if (!pkgs.length) return null;
  return pkgs.reduce((min, p) => (min.grams <= p.grams ? min : p)).id;
}

function unitSize(food: Food | undefined, packId: number | null): { size: number; label: 'pcs' | 'packs' } {
  if (food?.piece_grams && food.piece_grams > 0) return { size: food.piece_grams, label: 'pcs' };
  if (food?.is_bulk !== 1) {
    const pkg = food?.packages?.find(p => p.id === packId) ?? food?.packages?.[0];
    if (pkg) return { size: pkg.grams, label: 'packs' };
  }
  return { size: 0, label: 'pcs' };
}

type Row =
  | { kind: 'single'; entry: LogEntry }
  | { kind: 'group'; recipeLogId: string; name: string; entries: LogEntry[] };

function buildRows(entries: LogEntry[]): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < entries.length) {
    const e = entries[i];
    if (!e.recipe_log_id) {
      rows.push({ kind: 'single', entry: e });
      i++;
      continue;
    }
    // Collect contiguous entries with the same recipe_log_id (recipes:log inserts
    // them in one transaction, so they arrive adjacent under the same meal).
    const groupEntries: LogEntry[] = [e];
    let j = i + 1;
    while (j < entries.length && entries[j].recipe_log_id === e.recipe_log_id) {
      groupEntries.push(entries[j]);
      j++;
    }
    rows.push({
      kind: 'group',
      recipeLogId: e.recipe_log_id,
      name: e.recipe_name || 'Recipe',
      entries: groupEntries,
    });
    i = j;
  }
  return rows;
}

function groupTotals(entries: LogEntry[]) {
  let cal = 0, protein = 0, carbs = 0, fat = 0, fiber = 0, grams = 0;
  let sugar = 0, satFat = 0, sodium = 0;
  let hasSugar = false, hasSatFat = false, hasSodium = false;
  for (const e of entries) {
    cal += e.calories; protein += e.protein; carbs += e.carbs; fat += e.fat;
    fiber += e.fiber || 0; grams += e.grams;
    if (e.sugar         != null) { sugar  += e.sugar;         hasSugar  = true; }
    if (e.saturated_fat != null) { satFat += e.saturated_fat; hasSatFat = true; }
    if (e.sodium_mg     != null) { sodium += e.sodium_mg;     hasSodium = true; }
  }
  return {
    cal: Math.round(cal), grams: r1(grams),
    protein: r1(protein), carbs: r1(carbs), fat: r1(fat), fiber: r1(fiber),
    sugar:  hasSugar  ? r1(sugar)  : null,
    satFat: hasSatFat ? r1(satFat) : null,
    sodium: hasSodium ? sodium     : null,
  };
}

export default function EntryTable({ entries, foods, onRefresh, onConfirm }: EntryTableProps) {
  const { t, tMeal } = useT();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const trackExtra = settings.track_extra_nutrition === 1;
  const saltUnit = (settings.extra_nutrition_unit ?? 'sodium') as 'sodium' | 'salt';
  const [editing, setEditing] = useState<EditState | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleDeleteRecipeGroup(recipeLogId: string) {
    await api.log.deleteRecipeGroup(recipeLogId);
    onRefresh();
  }
  const [saveMeal, setSaveMeal] = useState<{ meal: Meal; entries: LogEntry[] } | null>(null);
  const [bundleName, setBundleName] = useState('');
  const [bundleItems, setBundleItems] = useState<{ food_id: number; name: string; gramsStr: string }[]>([]);

  function openSaveMeal(meal: Meal, mealEntries: LogEntry[]) {
    setSaveMeal({ meal, entries: mealEntries });
    const d = mealEntries[0]?.date ?? '';
    setBundleName(`${tMeal(meal)}${d ? ' ' + d : ''}`);
    const merged = new Map<number, { name: string; grams: number }>();
    for (const e of mealEntries) {
      const cur = merged.get(e.food_id);
      merged.set(e.food_id, {
        name: e.name,
        grams: (cur?.grams ?? 0) + e.grams,
      });
    }
    setBundleItems(
      Array.from(merged.entries()).map(([food_id, v]) => ({
        food_id,
        name: v.name,
        gramsStr: String(Math.round(v.grams * 10) / 10),
      })),
    );
  }

  function closeSaveMeal() {
    setSaveMeal(null);
    setBundleName('');
    setBundleItems([]);
  }

  async function confirmSaveMeal() {
    if (!saveMeal || !bundleName.trim()) return;
    const ingredients = bundleItems
      .map(it => ({ food_id: it.food_id, grams: parseFloat(it.gramsStr) }))
      .filter(it => !isNaN(it.grams) && it.grams > 0)
      .map(it => ({ food_id: it.food_id, grams: Math.round(it.grams * 10) / 10 }));
    if (!ingredients.length) return;
    await api.recipes.create({ name: bundleName.trim(), description: '', ingredients });
    showToast(t('entry.bundleSaved'));
    closeSaveMeal();
  }

  function bundlePreview() {
    let cal = 0, protein = 0, carbs = 0, fat = 0, fiber = 0;
    for (const it of bundleItems) {
      const food = foodsById.get(it.food_id);
      if (!food) continue;
      const g = parseFloat(it.gramsStr);
      if (isNaN(g) || g <= 0) continue;
      const r = g / 100;
      cal     += food.calories * r;
      protein += food.protein  * r;
      carbs   += food.carbs    * r;
      fat     += food.fat      * r;
      fiber   += (food.fiber || 0) * r;
    }
    return {
      cal: Math.round(cal),
      protein: Math.round(protein * 10) / 10,
      carbs: Math.round(carbs * 10) / 10,
      fat: Math.round(fat * 10) / 10,
      fiber: Math.round(fiber * 10) / 10,
    };
  }

  if (!entries.length) {
    return <EmptyState message={t('dash.nothingLogged')} className="py-4" />;
  }

  const groups: Record<Meal, LogEntry[]> = Object.fromEntries(
    MEAL_ORDER.map(m => [m, [] as LogEntry[]]),
  ) as Record<Meal, LogEntry[]>;
  for (const e of entries) groups[e.meal as Meal]?.push(e);

  const foodsById = new Map(foods.map(f => [f.id, f]));

  function mealTotals(mealEntries: LogEntry[]) {
    let cal = 0, protein = 0, carbs = 0, fat = 0, fiber = 0, liquidMl = 0;
    let sugar = 0, satFat = 0, sodium = 0;
    let hasSugar = false, hasSatFat = false, hasSodium = false;
    for (const e of mealEntries) {
      cal     += e.calories;
      protein += e.protein;
      carbs   += e.carbs;
      fat     += e.fat;
      fiber   += e.fiber || 0;
      if (e.sugar         != null) { sugar  += e.sugar;         hasSugar  = true; }
      if (e.saturated_fat != null) { satFat += e.saturated_fat; hasSatFat = true; }
      if (e.sodium_mg     != null) { sodium += e.sodium_mg;     hasSodium = true; }
      if (foodsById.get(e.food_id)?.is_liquid) liquidMl += e.grams;
    }
    return {
      cal: Math.round(cal),
      protein: r1(protein), carbs: r1(carbs), fat: r1(fat), fiber: r1(fiber),
      sugar: hasSugar ? r1(sugar) : null,
      satFat: hasSatFat ? r1(satFat) : null,
      sodium: hasSodium ? sodium : null,
      liquidMl: Math.round(liquidMl),
    };
  }

  async function handleDelete(id: number) {
    await api.log.delete(id);
    onRefresh();
  }

  async function handleSave() {
    if (!editing) return;
    const parsed = parseFloat(editing.gramsStr);
    const grams = !editing.gramsStr.trim() || isNaN(parsed) || parsed <= 0
      ? editing.origGrams
      : parsed;
    await api.log.update({ id: editing.id, food_id: editing.food_id, grams, meal: editing.meal });
    setEditing(null);
    onRefresh();
  }

  function startEdit(e: LogEntry) {
    const food = foodsById.get(e.food_id);
    const packId = smallestPackId(food);
    const { size } = unitSize(food, packId);
    const hasUnits = size > 0;
    setEditing({
      id: e.id,
      food_id: e.food_id,
      origGrams: e.grams,
      gramsStr: String(Math.round(e.grams * 10) / 10),
      piecesStr: hasUnits ? String(Math.round((e.grams / size) * 100) / 100) : '',
      meal: e.meal as Meal,
      mode: hasUnits ? 'pieces' : 'grams',
      packId,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {MEAL_ORDER.filter(m => groups[m].length > 0).map(meal => (
        <div key={meal}>
          <div className="text-xs text-text-sec uppercase tracking-wider font-semibold py-1 mb-1 border-b border-border">
            {tMeal(meal)}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-sec text-xs">
                <th className="pb-1 pl-1 pr-3 font-medium">{t('th.food')}</th>
                <th className="pb-1 px-2 font-medium w-14 text-right">{t('th.g')}</th>
                <th className="pb-1 px-2 font-medium w-14 text-right">{t('th.kcal')}</th>
                <th className={`pb-1 px-2 font-medium text-right ${trackExtra ? 'w-24' : 'w-16'}`}>{t('th.fat')}</th>
                <th className={`pb-1 px-2 font-medium text-right ${trackExtra ? 'w-24' : 'w-16'}`}>{t('th.carbs')}</th>
                <th className="pb-1 px-2 font-medium w-16 text-right">{t('th.fiber')}</th>
                <th className="pb-1 px-2 font-medium w-16 text-right">{t('th.protein')}</th>
                {trackExtra && (
                  <th className="pb-1 px-2 font-medium w-16 text-right">
                    {saltUnit === 'salt' ? t('nutrition.salt') : t('nutrition.sodium')}
                  </th>
                )}
                <th className="w-20 pl-2" />
              </tr>
            </thead>
            <tbody>
              {buildRows(groups[meal]).map(row => row.kind === 'group' ? (() => {
                const isOpen = expanded.has(row.recipeLogId);
                const gt = groupTotals(row.entries);
                return (
                  <Fragment key={`g-${row.recipeLogId}`}>
                    <tr
                      className="border-t border-border/40 hover:bg-card-hover/30 bg-accent/[0.04] cursor-pointer"
                      onClick={() => toggleExpand(row.recipeLogId)}
                    >
                      <td className="py-2 pl-1 pr-3">
                        <span className="text-text-sec mr-1 inline-block w-3 select-none">{isOpen ? '▾' : '▸'}</span>
                        <span className="text-[10px] text-accent border border-accent/40 rounded px-1 py-0.5 mr-1.5">🍽 recipe</span>
                        <span className="font-medium">{row.name}</span>
                        <span className="ml-2 text-[10px] text-text-sec">{row.entries.length} ingr.</span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{gt.grams}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-medium">{gt.cal}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-text-sec whitespace-nowrap">
                        {gt.fat}g
                        {trackExtra && gt.satFat != null && (<span className={SUB_CLS}>({gt.satFat}g)</span>)}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-text-sec whitespace-nowrap">
                        {gt.carbs}g
                        {trackExtra && gt.sugar != null && (<span className={SUB_CLS}>({gt.sugar}g)</span>)}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-text-sec">{gt.fiber}g</td>
                      <td className="py-2 px-2 text-right tabular-nums text-text-sec">{gt.protein}g</td>
                      {trackExtra && (
                        <td className="py-2 px-2 text-right tabular-nums text-text-sec">
                          {formatSaltCell(gt.sodium, saltUnit)}
                        </td>
                      )}
                      <td className="py-2 pl-2 text-right">
                        <button
                          onClick={ev => { ev.stopPropagation(); handleDeleteRecipeGroup(row.recipeLogId); }}
                          aria-label={t('common.delete') || 'Delete'}
                          title="Delete whole recipe"
                          className="text-text-sec hover:text-red px-1 cursor-pointer transition-colors"
                        >✕</button>
                      </td>
                    </tr>
                    {isOpen && row.entries.map(e => (
                      <tr key={e.id} className={[
                        'border-t border-border/20 hover:bg-card-hover/30 bg-accent/[0.02]',
                        e.status === 'planned' ? 'opacity-60' : '',
                      ].join(' ')}>
                        <td className="py-1.5 pl-7 pr-3 text-text-sec">
                          <span className="text-text-sec/50 mr-1">└</span>{e.name}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-text-sec">{r1(e.grams)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-text-sec">{e.calories}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-text-sec/80 whitespace-nowrap">
                          {e.fat}g{trackExtra && e.saturated_fat != null && (<span className={SUB_CLS}>({e.saturated_fat}g)</span>)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-text-sec/80 whitespace-nowrap">
                          {e.carbs}g{trackExtra && e.sugar != null && (<span className={SUB_CLS}>({e.sugar}g)</span>)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-text-sec/80">{e.fiber || 0}g</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-text-sec/80">{e.protein}g</td>
                        {trackExtra && (
                          <td className="py-1.5 px-2 text-right tabular-nums text-text-sec/80">
                            {formatSaltCell(e.sodium_mg, saltUnit)}
                          </td>
                        )}
                        <td className="py-1.5 pl-2 text-right">
                          <button onClick={() => handleDelete(e.id)} aria-label={t('common.delete') || 'Delete'}
                            className="text-text-sec/60 hover:text-red px-1 cursor-pointer transition-colors text-xs">✕</button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })() : (() => { const e = row.entry; return (
                <Fragment key={e.id}>
                  <tr className={[
                    'border-t border-border/40 hover:bg-card-hover/30',
                    e.status === 'planned' ? 'opacity-60' : '',
                  ].join(' ')}>
                    <td className="py-1.5 pl-1 pr-3">
                      <span className={e.status === 'planned' ? 'italic text-text-sec' : ''}>{e.name}</span>
                      {e.status === 'planned' && (
                        <span className="ml-1.5 text-[10px] text-accent border border-accent/40 rounded px-1 py-0.5">plan</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{Math.round(e.grams * 10) / 10}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{e.calories}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-text-sec whitespace-nowrap">
                      {e.fat}g
                      {trackExtra && e.saturated_fat != null && (
                        <span className={SUB_CLS}>({e.saturated_fat}g)</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-text-sec whitespace-nowrap">
                      {e.carbs}g
                      {trackExtra && e.sugar != null && (
                        <span className={SUB_CLS}>({e.sugar}g)</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-text-sec">{e.fiber || 0}g</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-text-sec">{e.protein}g</td>
                    {trackExtra && (
                      <td className="py-1.5 px-2 text-right tabular-nums text-text-sec">
                        {formatSaltCell(e.sodium_mg, saltUnit)}
                      </td>
                    )}
                    <td className="py-1.5 pl-2 text-right">
                      {e.status === 'planned' && onConfirm && (
                        <button onClick={() => onConfirm(e.id)} aria-label={t('plan.confirm') || 'Confirm'}
                          className="text-accent hover:opacity-75 px-1 cursor-pointer transition-colors text-xs" title="Confirm">✓</button>
                      )}
                      <button onClick={() => startEdit(e)} aria-label={t('common.edit') || 'Edit'}
                        className="text-text-sec hover:text-text px-1 cursor-pointer transition-colors"><span style={{ display: 'inline-block', transform: 'scaleX(-1) rotate(15deg)' }}>✎</span></button>
                      <button onClick={() => handleDelete(e.id)} aria-label={t('common.delete') || 'Delete'}
                        className="text-text-sec hover:text-red px-1 cursor-pointer transition-colors">✕</button>
                    </td>
                  </tr>
                  {editing?.id === e.id && (() => {
                    const editFood = foodsById.get(editing.food_id);
                    const { size: pieceG, label: unitLabel } = unitSize(editFood, editing.packId);
                    const hasUnits = pieceG > 0;
                    const packages = editFood?.packages ?? [];
                    const showPackPicker = unitLabel === 'packs' && packages.length > 1;
                    const inputCls = "w-24 bg-card border border-border rounded px-2 py-1 text-sm text-text outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
                    return (
                      <tr className="bg-card-hover/50">
                        <td colSpan={trackExtra ? 9 : 8} className="py-2 px-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <select
                              value={editing.food_id}
                              onChange={ev => {
                                const newId = +ev.target.value;
                                const f = foodsById.get(newId);
                                const newPackId = smallestPackId(f);
                                const { size } = unitSize(f, newPackId);
                                const grams = parseFloat(editing.gramsStr) || editing.origGrams;
                                setEditing({
                                  ...editing,
                                  food_id: newId,
                                  mode: size > 0 ? 'pieces' : 'grams',
                                  piecesStr: size > 0 ? String(Math.round((grams / size) * 100) / 100) : '',
                                  packId: newPackId,
                                });
                              }}
                              className="bg-card border border-border rounded px-2 py-1 text-sm text-text outline-none focus:border-accent"
                            >
                              {foods.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>

                            {hasUnits && editing.mode === 'pieces' ? (
                              <>
                                <input
                                  type="text" inputMode="decimal"
                                  value={editing.piecesStr}
                                  step="1"
                                  onChange={ev => {
                                    const v = ev.target.value;
                                    const n = parseFloat(v);
                                    setEditing({
                                      ...editing,
                                      piecesStr: v,
                                      gramsStr: !v.trim() || isNaN(n) ? '' : String(Math.round(n * pieceG * 10) / 10),
                                    });
                                  }}
                                  className={inputCls}
                                />
                                <span className="text-xs text-text-sec">{unitLabel}</span>
                                <button
                                  type="button"
                                  onClick={() => setEditing({ ...editing, mode: 'grams' })}
                                  className="text-xs text-text-sec border border-border rounded px-2 py-1 hover:border-accent/50 hover:text-text cursor-pointer"
                                  title="Edit total weight"
                                >
                                  ⚖ {editing.gramsStr || '—'}g
                                </button>
                              </>
                            ) : (
                              <>
                                <input
                                  type="text" inputMode="decimal"
                                  value={editing.gramsStr}
                                  step="0.1"
                                  onChange={ev => {
                                    const v = ev.target.value;
                                    const n = parseFloat(v);
                                    setEditing({
                                      ...editing,
                                      gramsStr: v,
                                      piecesStr: hasUnits && !isNaN(n) ? String(Math.max(1, Math.round(n / pieceG))) : editing.piecesStr,
                                    });
                                  }}
                                  className={inputCls}
                                />
                                <span className="text-xs text-text-sec">g</span>
                                {hasUnits && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const n = parseFloat(editing.gramsStr);
                                      const pcs = !isNaN(n) ? Math.max(1, Math.round(n / pieceG)) : 1;
                                      setEditing({
                                        ...editing,
                                        mode: 'pieces',
                                        piecesStr: String(pcs),
                                        gramsStr: String(Math.round(pcs * pieceG * 10) / 10),
                                      });
                                    }}
                                    className="text-xs text-text-sec border border-border rounded px-2 py-1 hover:border-accent/50 hover:text-text cursor-pointer"
                                    title={`Switch to ${unitLabel}`}
                                  >
                                    ⇆ {unitLabel}
                                  </button>
                                )}
                              </>
                            )}

                            {showPackPicker && editing.mode === 'pieces' && (
                              <div className="flex items-center gap-1 flex-wrap text-xs">
                                {packages.map(pkg => (
                                  <button
                                    key={pkg.id}
                                    type="button"
                                    onClick={() => {
                                      const n = parseFloat(editing.piecesStr);
                                      const pcs = !isNaN(n) && n > 0 ? n : 1;
                                      setEditing({
                                        ...editing,
                                        packId: pkg.id,
                                        gramsStr: String(Math.round(pcs * pkg.grams * 10) / 10),
                                      });
                                    }}
                                    className={`px-2 py-1 rounded border cursor-pointer ${
                                      editing.packId === pkg.id
                                        ? 'border-accent text-accent bg-accent/10'
                                        : 'border-border text-text-sec hover:text-text'
                                    }`}
                                  >
                                    {Math.round(pkg.grams)}g
                                  </button>
                                ))}
                              </div>
                            )}

                            <select value={editing.meal}
                              onChange={ev => setEditing({ ...editing, meal: ev.target.value as Meal })}
                              className="bg-card border border-border rounded px-2 py-1 text-sm text-text outline-none focus:border-accent">
                              {MEAL_ORDER.map(m =>
                                <option key={m} value={m}>{tMeal(m)}</option>)}
                            </select>
                            <button onClick={handleSave}
                              className="bg-accent text-white rounded px-3 py-1 text-sm cursor-pointer hover:brightness-110">
                              {t('common.save')}
                            </button>
                            <button onClick={() => setEditing(null)}
                              className="border border-border text-text-sec rounded px-3 py-1 text-sm cursor-pointer hover:text-text">
                              {t('common.cancel')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                </Fragment>
              );})())}
            </tbody>
            <tfoot>
              {(() => {
                const tot = mealTotals(groups[meal]);
                return (
                  <tr className="border-t border-border text-xs text-text-sec">
                    <td className="pt-1.5 pl-1 pr-3 font-normal italic">Total</td>
                    <td className="pt-1.5 px-2 text-right tabular-nums">{tot.liquidMl > 0 ? `${tot.liquidMl} ml` : ''}</td>
                    <td className="pt-1.5 px-2 text-right tabular-nums font-semibold text-text">{tot.cal}</td>
                    <td className="pt-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                      {tot.fat}g
                      {trackExtra && tot.satFat != null && (
                        <span className={SUB_CLS}>({tot.satFat}g)</span>
                      )}
                    </td>
                    <td className="pt-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                      {tot.carbs}g
                      {trackExtra && tot.sugar != null && (
                        <span className={SUB_CLS}>({tot.sugar}g)</span>
                      )}
                    </td>
                    <td className="pt-1.5 px-2 text-right tabular-nums">{tot.fiber}g</td>
                    <td className="pt-1.5 px-2 text-right tabular-nums">{tot.protein}g</td>
                    {trackExtra && (
                      <td className="pt-1.5 px-2 text-right tabular-nums">
                        {formatSaltCell(tot.sodium, saltUnit)}
                      </td>
                    )}
                    <td className="pt-1.5 pl-2 text-right">
                      <button
                        onClick={() => openSaveMeal(meal, groups[meal])}
                        title={t('entry.saveAsBundle')}
                        className="text-text-sec hover:text-accent px-1 cursor-pointer transition-colors"
                      >
                        ＋📦
                      </button>
                    </td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      ))}
      {saveMeal && (() => {
        const prev = bundlePreview();
        const validCount = bundleItems.filter(it => {
          const g = parseFloat(it.gramsStr);
          return !isNaN(g) && g > 0;
        }).length;
        return (
          <Modal isOpen onClose={closeSaveMeal} title={t('entry.saveAsBundle')} width="max-w-lg">
            <div className="space-y-4">
              <input
                autoFocus
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
                placeholder={t('common.name')}
                value={bundleName}
                onChange={e => setBundleName(e.target.value)}
              />

              <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                {bundleItems.map((it, idx) => (
                  <div key={`${it.food_id}-${idx}`} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate text-text">{it.name}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={it.gramsStr}
                      onChange={e => {
                        const v = e.target.value;
                        setBundleItems(items => items.map((b, i) => i === idx ? { ...b, gramsStr: v } : b));
                      }}
                      className="w-20 bg-bg border border-border rounded px-2 py-1 text-sm text-text outline-none focus:border-accent text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-text-sec w-4">g</span>
                    <button
                      type="button"
                      onClick={() => setBundleItems(items => items.filter((_, i) => i !== idx))}
                      className="text-text-sec hover:text-red px-1 cursor-pointer"
                      aria-label={t('common.delete') || 'Remove'}
                    >✕</button>
                  </div>
                ))}
                {bundleItems.length === 0 && (
                  <p className="text-xs text-text-sec italic">—</p>
                )}
              </div>

              <MacroChips
                calories={prev.cal}
                protein={prev.protein}
                carbs={prev.carbs}
                fat={prev.fat}
                fiber={prev.fiber}
                className="border-t border-border pt-2"
              />

              <ModalFooter
                onCancel={closeSaveMeal}
                onConfirm={confirmSaveMeal}
                cancelLabel={t('common.cancel')}
                confirmLabel={t('common.save')}
                confirmDisabled={!bundleName.trim() || validCount === 0}
              />
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
