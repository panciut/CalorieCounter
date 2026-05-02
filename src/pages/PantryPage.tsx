import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { evalExpr, resolveExpr } from '../lib/evalExpr';
import { scaleNutrients } from '../lib/macroCalc';
import {
  compareExpiry, expiryPillClass, expiryLabel,
  openedLabel, openedPillClass,
  seedExpiry, resolveExpiry,
  formatQty, formatPacked, groupBatches, defaultUnit, unitToGrams, unitToPackageId,
  type PantryUnit,
} from '../lib/pantryUtils';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useSettings } from '../hooks/useSettings';
import { usePantry } from '../hooks/usePantry';
import { useT } from '../i18n/useT';
import FoodSearch from '../components/FoodSearch';
import type { SearchItem } from '../components/FoodSearch';
import ConfirmDialog from '../components/ConfirmDialog';
import AddFoodPanel from '../components/AddFoodPanel';
import type { Food, PantryItem, PantryAggregate, PantryLocation, ShoppingItem } from '../types';

type Tab = 'pantry' | 'shopping';

// ── Main component ────────────────────────────────────────────────────────────

export default function PantryPage() {
  const { showToast } = useToast();
  const { settings } = useSettings();
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('pantry');

  // Pantry location state — comes from the shared PantryContext.
  const { activeId, setActiveId, pantries, refresh: refreshPantries } = usePantry();
  const activePantryId = activeId ?? undefined;
  const [showManageModal, setShowManageModal] = useState(false);

  // Pantry state
  const [items, setItems]               = useState<PantryItem[]>([]);
  const [foods, setFoods]               = useState<Food[]>([]);
  const [plannedMap, setPlannedMap]     = useState<Record<number, number>>({});
  const [selFood, setSelFood]           = useState<Food | null>(null);
  const [qty, setQty]                   = useState('');
  const [expiry, setExpiry]             = useState(''); // ISO date or ''
  const [unit, setUnit]                 = useState<PantryUnit>('g');
  const [pantryOpen, setPantryOpen]     = useState(true);
  const [discardId, setDiscardId]       = useState<number | null>(null);
  const [discardAllIds, setDiscardAllIds] = useState<number[] | null>(null);
  const [collapsedFoods, setCollapsedFoods] = useState<Set<number>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set()); // key = first batch id
  const [editingBatch, setEditingBatch] = useState<{ id: number; qty: string; expiry: string; unit: PantryUnit } | null>(null);
  const [pantrySearch, setPantrySearch] = useState('');
  const qtyRef = useRef<HTMLInputElement>(null);

  // Shopping state
  const [shopping, setShopping]   = useState<ShoppingItem[]>([]);
  const [shopFood, setShopFood]   = useState<Food | null>(null);
  const [shopQty, setShopQty]     = useState('');
  const [shopOpen, setShopOpen]   = useState(true);

  const loadPantry = useCallback(async (pid?: number) => {
    const [p, f, pm] = await Promise.all([
      api.pantry.getAll(pid),
      api.foods.getAll(),
      api.log.getPlannedMap(),
    ]);
    setItems(p);
    setFoods(f);
    setPlannedMap(pm ?? {});
  }, []);

  const loadShopping = useCallback(async (pid?: number) => {
    setShopping(await api.shopping.getAll(pid));
  }, []);

  // Load pantry data whenever the active pantry id (from context) changes.
  useEffect(() => {
    if (activePantryId == null) return;
    loadPantry(activePantryId);
    loadShopping(activePantryId);
  }, [activePantryId, loadPantry, loadShopping]);

  // ── Aggregation ─────────────────────────────────────────────────────────────

  const aggregates: PantryAggregate[] = useMemo(() => {
    const map = new Map<number, PantryAggregate>();
    for (const b of items) {
      if (!map.has(b.food_id)) {
        map.set(b.food_id, {
          food_id: b.food_id,
          food_name: b.food_name,
          piece_grams: b.piece_grams,
          total_g: 0,
          earliest_expiry: null,
          batches: [],
          pack_breakdown: [],
        });
      }
      const agg = map.get(b.food_id)!;
      agg.total_g += b.quantity_g;
      agg.batches.push(b);
    }
    for (const agg of map.values()) {
      agg.batches.sort((a, b) => compareExpiry(a.expiry_date, b.expiry_date));
      agg.earliest_expiry = agg.batches[0]?.expiry_date ?? null;
      // Build pack breakdown
      const packMap = new Map<number, number>(); // pack_grams → total count
      for (const b of agg.batches) {
        if (b.package_id && b.package_grams && b.package_grams > 0) {
          const count = b.quantity_g / b.package_grams;
          packMap.set(b.package_grams, (packMap.get(b.package_grams) ?? 0) + count);
        }
      }
      agg.pack_breakdown = [...packMap.entries()]
        .map(([grams, count]) => ({ grams, count: Math.round(count * 10) / 10 }))
        .sort((a, b) => a.grams - b.grams);
    }
    return [...map.values()].sort((a, b) => {
      const ec = compareExpiry(a.earliest_expiry, b.earliest_expiry);
      return ec !== 0 ? ec : a.food_name.localeCompare(b.food_name);
    });
  }, [items]);

  const foodMap = useMemo(() => new Map(foods.map(f => [f.id, f])), [foods]);

  const foodSearchItems: SearchItem[] = foods.map(f => ({ ...f, isRecipe: false as const, _freq: 0 }));

  const addGrams = selFood
    ? unitToGrams(unit, evalExpr(qty) ?? 0, selFood)
    : 0;

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleSelect(item: SearchItem) {
    const food = item as Food;
    setSelFood(food);
    setUnit(defaultUnit(food));
    setQty('');
    setExpiry('');
    setTimeout(() => qtyRef.current?.focus(), 0);
  }

  async function handleAddBatch() {
    if (!selFood || !qty || addGrams <= 0) return;
    const pkgId = unitToPackageId(unit);
    if (pkgId !== null) {
      // Package unit: create one row per pack so FEFO can track them independently
      const pkgGrams = selFood.packages?.find(p => p.id === pkgId)?.grams ?? addGrams;
      const count = Math.round(addGrams / pkgGrams);
      for (let i = 0; i < count; i++) {
        await api.pantry.addBatch({ food_id: selFood.id, quantity_g: pkgGrams, expiry_date: expiry || null, package_id: pkgId, pantry_id: activePantryId });
      }
    } else {
      await api.pantry.addBatch({ food_id: selFood.id, quantity_g: addGrams, expiry_date: expiry || null, package_id: null, pantry_id: activePantryId });
    }
    setSelFood(null); setQty(''); setUnit('g'); setExpiry('');
    loadPantry(activePantryId);
  }

  function startEditBatch(batch: PantryItem) {
    // Shape B (piece_grams set, non-bulk) starts in pcs; everything else in grams.
    const food = foods.find(f => f.id === batch.food_id);
    const isBulk = food?.is_bulk === 1;
    let batchUnit: PantryUnit = 'g';
    let qtyStr = String(Math.round(batch.quantity_g));
    if (!isBulk && batch.piece_grams && batch.piece_grams > 0) {
      batchUnit = 'pcs';
      qtyStr = String(Math.round((batch.quantity_g / batch.piece_grams) * 10) / 10);
    }
    setEditingBatch({ id: batch.id, qty: qtyStr, expiry: batch.expiry_date ?? '', unit: batchUnit });
  }

  async function handleSaveBatch(batch: PantryItem) {
    if (!editingBatch) return;
    const val = evalExpr(editingBatch.qty) ?? 0;
    // Use the batch's associated food (from the foods list, for package lookup)
    const food = foods.find(f => f.id === batch.food_id);
    const grams = food ? unitToGrams(editingBatch.unit, val, food) : val;
    await api.pantry.set({
      id: editingBatch.id,
      quantity_g: grams || 0,
      expiry_date: editingBatch.expiry || null,
      package_id: batch.package_id,
    });
    setEditingBatch(null);
    loadPantry(activePantryId);
  }

  async function handleConfirmDiscard() {
    if (discardId === null) return;
    await api.pantry.delete(discardId);
    setDiscardId(null);
    loadPantry(activePantryId);
  }

  async function handleConfirmDiscardAll() {
    if (!discardAllIds) return;
    for (const id of discardAllIds) await api.pantry.delete(id);
    setDiscardAllIds(null);
    loadPantry(activePantryId);
  }

  function toggleCollapse(food_id: number) {
    setCollapsedFoods(prev => {
      const next = new Set(prev);
      if (next.has(food_id)) next.delete(food_id); else next.add(food_id);
      return next;
    });
  }

  function handleFoodSaved(food: Food) {
    // Called by AddFoodPanel after a new food is created — refresh the foods list.
    loadPantry(activePantryId);
    // Pre-select the new food in the "Add / top up" form.
    setSelFood(food);
    setUnit(defaultUnit(food));
    setQty(''); setExpiry('');
    setTimeout(() => qtyRef.current?.focus(), 0);
  }

  function handleFoodFound(food: Food) {
    // Called by AddFoodPanel when a barcode scan matches an existing food.
    setSelFood(food);
    setUnit(defaultUnit(food));
    setQty(''); setExpiry('');
    showToast(`Found: ${food.name}`);
    setTimeout(() => qtyRef.current?.focus(), 0);
  }

  async function handleAddShopping() {
    if (!shopFood) return;
    await api.shopping.add({ food_id: shopFood.id, quantity_g: shopQty ? (evalExpr(shopQty) ?? 0) : 0, pantry_id: activePantryId });
    setShopFood(null); setShopQty('');
    loadShopping(activePantryId);
  }

  function handleSwitchPantry(id: number) {
    setActiveId(id);
    // loadPantry / loadShopping run automatically via the activePantryId effect.
  }

  // ── Styles ───────────────────────────────────────────────────────────────────

  const inputCls = "bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  const tabBtn = (v: Tab) => [
    'px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px',
    tab === v ? 'border-accent text-accent' : 'border-transparent text-text-sec hover:text-text',
  ].join(' ');

  const warn = settings.pantry_warn_days ?? 3;
  const urgent = settings.pantry_urgent_days ?? 1;

  const unchecked = shopping.filter(s => !s.checked);
  const checked   = shopping.filter(s => s.checked);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-accent">{t('eyebrow.pantry')}</div>
          <div className="text-[22px] italic leading-tight text-text" style={{ fontFamily: 'var(--font-family-serif)' }}>
            {t('page.pantry')}
          </div>
        </div>
        {pantries.length > 1 && (
          <select
            value={activePantryId ?? ''}
            onChange={e => handleSwitchPantry(Number(e.target.value))}
            className="bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-text outline-none focus:border-accent cursor-pointer"
          >
            {pantries.map(p => (
              <option key={p.id} value={p.id}>{p.name}{p.is_default ? ` (${t('pantry.defaultBadge')})` : ''}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => setShowManageModal(true)}
          className="text-sm text-text-sec hover:text-text cursor-pointer transition-colors px-2 py-1 rounded border border-border hover:border-text-sec"
        >{t('pantry.managePantries')}</button>
      </div>

      {/* Add new food (collapsed by default) — 📷 in header scans to create or find existing food */}
      <AddFoodPanel
        knownFoods={foods}
        onFoodFound={handleFoodFound}
        onSaved={handleFoodSaved}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button className={tabBtn('pantry')}   onClick={() => setTab('pantry')}>Pantry</button>
        <button className={tabBtn('shopping')} onClick={() => setTab('shopping')}>Shopping list</button>
      </div>

      {/* ── PANTRY TAB ─────────────────────────────────────────────────────── */}
      {tab === 'pantry' && (
        <div className="flex flex-col gap-4">

          {/* Collapsible add form */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setPantryOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-text hover:bg-card-hover cursor-pointer transition-colors"
            >
              <span>Add / top up</span>
              <span className="text-text-sec text-xs">{pantryOpen ? '▲' : '▼'}</span>
            </button>
            {pantryOpen && (
              <div className="px-4 pb-4 pt-3 border-t border-border flex flex-col gap-3">
                <FoodSearch
                  items={foodSearchItems}
                  onSelect={handleSelect}
                  onClear={() => { setSelFood(null); setQty(''); setUnit('g'); setExpiry(''); }}
                  placeholder="Search food…"
                  pantryId={activePantryId}
                  clearAfterSelect
                />
                {selFood && (
                  <div className="flex flex-col gap-3">
                    {/* Food info card */}
                    <div className="bg-bg border border-border rounded-xl px-4 py-3 flex flex-col gap-1.5">
                      <p className="font-semibold text-text">{selFood.name}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-text-sec tabular-nums">
                        <span><span className="text-text font-medium">{selFood.calories}</span> kcal</span>
                        <span>Fat <span className="text-text font-medium">{selFood.fat}</span>g</span>
                        <span>Carbs <span className="text-text font-medium">{selFood.carbs}</span>g</span>
                        <span>Fiber <span className="text-text font-medium">{selFood.fiber ?? 0}</span>g</span>
                        <span>Protein <span className="text-text font-medium">{selFood.protein}</span>g</span>
                        {settings.track_extra_nutrition === 1 && selFood.sugar != null && (
                          <span>{t('nutrition.sugar')} <span className="text-text font-medium">{selFood.sugar}</span>g</span>
                        )}
                        {settings.track_extra_nutrition === 1 && selFood.saturated_fat != null && (
                          <span>{t('nutrition.saturatedFat')} <span className="text-text font-medium">{selFood.saturated_fat}</span>g</span>
                        )}
                        {settings.track_extra_nutrition === 1 && selFood.sodium_mg != null && (
                          settings.extra_nutrition_unit === 'salt'
                            ? <span>{t('nutrition.salt')} <span className="text-text font-medium">{Math.round((selFood.sodium_mg / 400) * 100) / 100}</span>g</span>
                            : <span>{t('nutrition.sodium')} <span className="text-text font-medium">{Math.round(selFood.sodium_mg)}</span>mg</span>
                        )}
                        <span className="opacity-50">/ 100g</span>
                      </div>
                      {addGrams > 0 && (() => {
                        const r = addGrams / 100;
                        return (
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums border-t border-border pt-1.5 mt-0.5">
                            <span className="text-text-sec">{Math.round(addGrams * 10) / 10}g =</span>
                            <span><span className="text-text font-semibold">{Math.round(selFood.calories * r)}</span> kcal</span>
                            <span>Fat <span className="text-text font-semibold">{Math.round(selFood.fat * r * 10) / 10}</span>g</span>
                            <span>Carbs <span className="text-text font-semibold">{Math.round(selFood.carbs * r * 10) / 10}</span>g</span>
                            <span>Fiber <span className="text-text font-semibold">{Math.round((selFood.fiber ?? 0) * r * 10) / 10}</span>g</span>
                            <span>Protein <span className="text-text font-semibold">{Math.round(selFood.protein * r * 10) / 10}</span>g</span>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(selFood.piece_grams || (selFood.packages?.length ?? 0) > 0) && (
                        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                          <button
                            onClick={() => { setUnit('g'); setQty(''); }}
                            className={`px-3 py-1.5 cursor-pointer transition-colors ${unit === 'g' ? 'bg-accent/15 text-accent font-medium' : 'text-text-sec hover:text-text'}`}
                          >g</button>
                          {selFood.piece_grams && (
                            <button
                              onClick={() => { setUnit('pcs'); setQty(''); }}
                              className={`px-3 py-1.5 cursor-pointer transition-colors ${unit === 'pcs' ? 'bg-accent/15 text-accent font-medium' : 'text-text-sec hover:text-text'}`}
                            >pcs</button>
                          )}
                          {selFood.packages?.map(pkg => (
                            <button
                              key={pkg.id}
                              onClick={() => { setUnit(`pkg-${pkg.id}`); setQty(''); }}
                              className={`px-3 py-1.5 cursor-pointer transition-colors tabular-nums ${unit === `pkg-${pkg.id}` ? 'bg-accent/15 text-accent font-medium' : 'text-text-sec hover:text-text'}`}
                            >{pkg.grams}g</button>
                          ))}
                        </div>
                      )}
                      <input
                        ref={qtyRef}
                        type="text" inputMode="decimal"
                        value={qty}
                        onChange={e => setQty(e.target.value)}
                        onBlur={() => setQty(v => resolveExpr(v))}
                        placeholder={unit === 'pcs' ? 'pieces' : unit === 'g' ? 'grams' : 'packs'}
                        className={`w-28 ${inputCls}`}
                        onKeyDown={e => { if (e.key === 'Enter') { setQty(resolveExpr(qty)); handleAddBatch(); } }}
                      />
                      {unit !== 'g' && qty && (evalExpr(qty) ?? 0) > 0 && addGrams > 0 && (
                        <span className="text-xs text-text-sec">= {Math.round(addGrams)}g</span>
                      )}
                      {/* Expiry date */}
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-text-sec shrink-0">Exp:</label>
                        <input
                          type="date"
                          value={expiry}
                          onFocus={() => setExpiry(v => seedExpiry(v))}
                          onChange={e => setExpiry(e.target.value)}
                          onBlur={e => setExpiry(resolveExpiry(e.target.value))}
                          className="bg-bg border border-border rounded-lg px-2 py-1.5 text-xs text-text outline-none focus:border-accent cursor-pointer"
                        />
                        {expiry && (
                          <button onClick={() => setExpiry('')} className="text-xs text-text-sec hover:text-text cursor-pointer">✕</button>
                        )}
                      </div>
                      <button
                        onClick={handleAddBatch}
                        disabled={!qty || addGrams <= 0}
                        className="px-4 py-2 bg-accent text-white text-sm rounded-lg cursor-pointer hover:opacity-90 disabled:opacity-40 font-medium"
                      >Add</button>
                      <button
                        onClick={() => { setSelFood(null); setQty(''); setUnit('g'); setExpiry(''); }}
                        className="text-sm text-text-sec cursor-pointer hover:text-text"
                      >Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pantry search + aggregate list */}
          {aggregates.length > 0 && (
            <input
              type="text"
              value={pantrySearch}
              onChange={e => setPantrySearch(e.target.value)}
              placeholder="Search pantry…"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent"
            />
          )}
          {(() => {
            const q = pantrySearch.toLowerCase();
            const visible = q ? aggregates.filter(a => a.food_name.toLowerCase().includes(q)) : aggregates;
            return visible.length === 0 ? (
              <p className="text-sm text-text-sec text-center py-10">
                {aggregates.length === 0 ? 'Pantry is empty. Add ingredients you have at home.' : 'No matching foods in pantry.'}
              </p>
            ) : (
            <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
              {visible.map((agg, aggIdx) => {
                const collapsed = collapsedFoods.has(agg.food_id);
                const expiryLbl = expiryLabel(agg.earliest_expiry, warn);
                const expiryColor = expiryPillClass(agg.earliest_expiry, warn, urgent);
                const foodData = foodMap.get(agg.food_id);
                const totalKcal = foodData ? Math.round(scaleNutrients(foodData, agg.total_g).calories) : null;
                const plannedG = plannedMap[agg.food_id] ?? 0;
                const remainingG = agg.total_g - plannedG;
                return (
                  <div key={agg.food_id}>
                    {/* Aggregate header */}
                    <button
                      onClick={() => toggleCollapse(agg.food_id)}
                      className={[
                        'w-full flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors text-left',
                        aggIdx % 2 === 0 ? 'bg-card hover:bg-card-hover' : 'bg-card/60 hover:bg-card-hover',
                      ].join(' ')}
                    >
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-medium text-text">{agg.food_name}</span>
                        {foodData && (
                          <span className="text-xs text-text-sec/60 tabular-nums">
                            {foodData.calories} kcal · Protein {foodData.protein}g · Carbs {foodData.carbs}g · Fat {foodData.fat}g · Fiber {foodData.fiber ?? 0}g
                          </span>
                        )}
                      </div>
                      {expiryLbl && (
                        <span className={`text-xs tabular-nums shrink-0 ${expiryColor}`}>{expiryLbl}</span>
                      )}
                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-sm text-text tabular-nums font-semibold">
                          {formatQty(
                            agg.total_g,
                            agg.piece_grams,
                            agg.pack_breakdown.length === 1 ? agg.pack_breakdown[0].grams : null,
                          )}
                        </span>
                        {agg.pack_breakdown.length > 1 && (
                          <span className="text-xs text-text-sec/60 tabular-nums">
                            {agg.pack_breakdown.map(p => `${p.count}×${p.grams}g`).join(' + ')}
                          </span>
                        )}
                        {totalKcal !== null && (
                          <span className="text-xs text-text-sec/60 tabular-nums">≈ {totalKcal} kcal</span>
                        )}
                        {plannedG > 0 && (
                          <span
                            className="text-xs tabular-nums mt-0.5 flex items-center gap-1 flex-wrap justify-end"
                            title={`Planned today + future: ${Math.round(plannedG)}g${remainingG < 0 ? ` · short ${Math.round(-remainingG)}g` : ` · ${Math.round(remainingG)}g left after plan`}`}
                          >
                            <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent">📋 {formatPacked(plannedG, foodData)}</span>
                            <span className={remainingG < 0 ? 'px-1.5 py-0.5 rounded bg-red/15 text-red' : 'text-text-sec/60'}>
                              {remainingG < 0 ? `⚠ −${formatPacked(-remainingG, foodData)}` : `→ ${formatPacked(remainingG, foodData)} left`}
                            </span>
                          </span>
                        )}
                      </div>
                      {agg.batches.length > 1 && (
                        <span className="text-xs text-text-sec/50 tabular-nums shrink-0">{agg.batches.length}×</span>
                      )}
                      <span className="text-text-sec/40 text-xs w-3 text-right shrink-0">{collapsed ? '▶' : '▼'}</span>
                    </button>

                    {/* Batch rows */}
                    {!collapsed && (
                      <div className="divide-y divide-border/30">
                        {groupBatches(agg.batches).map((group, gIdx) => {
                          const rep = group.batches[0];
                          const count = group.batches.length;
                          const groupKey = rep.id;
                          const isExpanded = expandedGroups.has(groupKey);
                          const bExpiryLabel = expiryLabel(rep.expiry_date, warn);
                          const bExpiryColor = expiryPillClass(rep.expiry_date, warn, urgent);

                          // Rows to actually render: merged header, or individual batches when expanded
                          const rowsToRender: { batch: PantryItem; showIndividual: boolean }[] =
                            count > 1 && !isExpanded
                              ? [{ batch: rep, showIndividual: false }]
                              : group.batches.map(b => ({ batch: b, showIndividual: true }));

                          return rowsToRender.map(({ batch, showIndividual }, rIdx) => {
                            const isEditing = editingBatch?.id === batch.id;
                            const rowExpiryLabel = showIndividual ? expiryLabel(batch.expiry_date, warn) : bExpiryLabel;
                            const rowExpiryColor = showIndividual ? expiryPillClass(batch.expiry_date, warn, urgent) : bExpiryColor;
                            const displayCount = showIndividual ? 1 : count;
                            const rowIdx = gIdx * 10 + rIdx;
                            return (
                              <div key={`${batch.id}-${showIndividual}`} className={[
                                'flex items-center gap-3 pl-8 pr-4 py-2 transition-colors',
                                rowIdx % 2 === 0 ? 'bg-bg hover:bg-bg/80' : 'bg-bg/60 hover:bg-bg/80',
                              ].join(' ')}>
                                {isEditing ? (
                                  <>
                                    <div className="flex items-center gap-1.5 flex-wrap flex-1">
                                      {batch.piece_grams && (() => {
                                        const bFood = foods.find(f => f.id === batch.food_id);
                                        if (bFood?.is_bulk === 1) return null;
                                        return (
                                          <div className="flex rounded border border-border overflow-hidden text-xs">
                                            <button
                                              onClick={() => setEditingBatch(b => b ? { ...b, unit: 'g', qty: String(Math.round(batch.quantity_g)) } : b)}
                                              className={`px-2 py-0.5 cursor-pointer ${editingBatch.unit === 'g' ? 'bg-accent/15 text-accent' : 'text-text-sec'}`}
                                            >g</button>
                                            <button
                                              onClick={() => setEditingBatch(b => b ? { ...b, unit: 'pcs', qty: String(Math.round((batch.quantity_g / batch.piece_grams!) * 10) / 10) } : b)}
                                              className={`px-2 py-0.5 cursor-pointer ${editingBatch.unit === 'pcs' ? 'bg-accent/15 text-accent' : 'text-text-sec'}`}
                                            >pcs</button>
                                          </div>
                                        );
                                      })()}
                                      <input
                                        type="text" inputMode="decimal"
                                        value={editingBatch.qty}
                                        onChange={e => setEditingBatch(b => b ? { ...b, qty: e.target.value } : b)}
                                        onBlur={() => setEditingBatch(b => b ? { ...b, qty: resolveExpr(b.qty) } : b)}
                                        autoFocus
                                        onKeyDown={e => {
                                          if (e.key === 'Enter')  { setEditingBatch(b => b ? { ...b, qty: resolveExpr(b.qty) } : b); handleSaveBatch(batch); }
                                          if (e.key === 'Escape') setEditingBatch(null);
                                        }}
                                        className="w-20 bg-bg border border-border rounded-lg px-2 py-1 text-sm text-text text-right focus:outline-none focus:border-accent"
                                      />
                                      <input
                                        type="date"
                                        value={editingBatch.expiry}
                                        onFocus={() => setEditingBatch(b => b ? { ...b, expiry: seedExpiry(b.expiry) } : b)}
                                        onChange={e => setEditingBatch(b => b ? { ...b, expiry: e.target.value } : b)}
                                        onBlur={e => setEditingBatch(b => b ? { ...b, expiry: resolveExpiry(e.target.value) } : b)}
                                        className="bg-bg border border-border rounded-lg px-2 py-1 text-xs text-text outline-none focus:border-accent cursor-pointer"
                                      />
                                      {editingBatch.expiry && (
                                        <button onClick={() => setEditingBatch(b => b ? { ...b, expiry: '' } : b)} className="text-xs text-text-sec hover:text-text cursor-pointer">✕</button>
                                      )}
                                    </div>
                                    <button onClick={() => handleSaveBatch(batch)} className="text-xs text-accent font-medium cursor-pointer hover:opacity-75 px-1">Save</button>
                                    <button onClick={() => setEditingBatch(null)} className="text-xs text-text-sec cursor-pointer hover:text-text px-1">✕</button>
                                  </>
                                ) : (
                                  <>
                                    {/* Expand/collapse toggle — only on the merged header row */}
                                    {count > 1 && !showIndividual && (
                                      <button
                                        onClick={() => setExpandedGroups(s => { const n = new Set(s); n.has(groupKey) ? n.delete(groupKey) : n.add(groupKey); return n; })}
                                        className="text-xs text-text-sec/50 hover:text-text-sec cursor-pointer w-3 shrink-0"
                                      >{isExpanded ? '▾' : '▸'}</button>
                                    )}
                                    {/* Collapse button on each individual row in an expanded group */}
                                    {showIndividual && count > 1 && rIdx === 0 && (
                                      <button
                                        onClick={() => setExpandedGroups(s => { const n = new Set(s); n.delete(groupKey); return n; })}
                                        className="text-xs text-text-sec/50 hover:text-text-sec cursor-pointer w-3 shrink-0"
                                      >▾</button>
                                    )}
                                    {showIndividual && count > 1 && rIdx > 0 && (
                                      <span className="w-3 shrink-0" />
                                    )}
                                    <div
                                      className="flex-1 flex items-center gap-3 flex-wrap cursor-pointer"
                                      onClick={() => {
                                        if (count > 1 && !showIndividual) {
                                          setExpandedGroups(s => { const n = new Set(s); n.has(groupKey) ? n.delete(groupKey) : n.add(groupKey); return n; });
                                        }
                                      }}
                                    >
                                      <span className="text-sm font-semibold tabular-nums text-text">
                                        {(() => {
                                          // Fallback: if the batch has no pack association but the food defines
                                          // exactly one pack, use its grams for display (e.g. legacy bulk rows).
                                          let pkgG = batch.package_grams;
                                          if (pkgG == null) {
                                            const bFood = foodMap.get(batch.food_id);
                                            const pkgs = bFood?.packages ?? [];
                                            if (pkgs.length === 1) pkgG = pkgs[0].grams;
                                          }
                                          return formatQty(batch.quantity_g, batch.piece_grams, pkgG, displayCount);
                                        })()}
                                      </span>
                                      {batch.expiry_date ? (
                                        <span className={`text-xs tabular-nums ${rowExpiryColor}`}>{rowExpiryLabel}</span>
                                      ) : (
                                        <span className="text-xs text-text-sec/40">no date</span>
                                      )}
                                      {openedLabel(batch) && (
                                        <span className={`text-xs tabular-nums ${openedPillClass(batch)}`}>
                                          {openedLabel(batch)}
                                        </span>
                                      )}
                                    </div>
                                    {!showIndividual && count > 1 ? (
                                      // Merged group actions
                                      <>
                                        <button
                                          onClick={() => {
                                            // Open edit for all batches sequentially — for now expand and let user edit each
                                            setExpandedGroups(s => { const n = new Set(s); n.add(groupKey); return n; });
                                          }}
                                          className="text-xs text-text-sec hover:text-accent cursor-pointer transition-colors px-1"
                                        >Edit all</button>
                                        <button
                                          onClick={() => setDiscardAllIds(group.batches.map(b => b.id))}
                                          className="text-xs text-text-sec hover:text-red cursor-pointer transition-colors px-1"
                                          title={`Discard all ${count} packs`}
                                        >Discard all</button>
                                      </>
                                    ) : (
                                      // Single or expanded individual row actions
                                      <>
                                        <button
                                          onClick={() => startEditBatch(batch)}
                                          className="text-xs text-text-sec hover:text-accent cursor-pointer transition-colors px-1"
                                        >Edit</button>
                                        <button
                                          onClick={() => setDiscardId(batch.id)}
                                          className="text-xs text-text-sec hover:text-red cursor-pointer transition-colors px-1"
                                        >Discard</button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          });
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            );
          })()}
        </div>
      )}

      {/* ── SHOPPING TAB ───────────────────────────────────────────────────── */}
      {tab === 'shopping' && (
        <div className="flex flex-col gap-4">

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setShopOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-text hover:bg-card-hover cursor-pointer transition-colors"
            >
              <span>Add item</span>
              <span className="text-text-sec text-xs">{shopOpen ? '▲' : '▼'}</span>
            </button>
            {shopOpen && (
              <div className="px-4 pb-4 pt-3 border-t border-border flex flex-col gap-3">
                <FoodSearch
                  items={foodSearchItems}
                  onSelect={item => { setShopFood(item as Food); setShopQty(''); }}
                  onClear={() => { setShopFood(null); setShopQty(''); }}
                  placeholder="Search food…"
                  pantryId={activePantryId}
                  clearAfterSelect
                />
                {shopFood && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text flex-1">{shopFood.name}</span>
                    <input
                      type="text" inputMode="decimal"
                      value={shopQty}
                      onChange={e => setShopQty(e.target.value)}
                      onBlur={() => setShopQty(v => resolveExpr(v))}
                      placeholder="Amount (g, optional)"
                      className={`w-40 ${inputCls}`}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') { setShopQty(resolveExpr(shopQty)); handleAddShopping(); } }}
                    />
                    <button onClick={handleAddShopping} className="px-4 py-2 bg-accent text-white text-sm rounded-lg cursor-pointer hover:opacity-90 font-medium">Add</button>
                    <button onClick={() => setShopFood(null)} className="text-sm text-text-sec cursor-pointer hover:text-text">Cancel</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {shopping.length === 0 ? (
            <p className="text-sm text-text-sec text-center py-10">Shopping list is empty.</p>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {unchecked.length > 0 && (
                <div className="flex flex-col divide-y divide-border/40">
                  {unchecked.map(item => (
                    <ShoppingRow key={item.id} item={item} food={foodMap.get(item.food_id)} onToggle={() => api.shopping.toggle(item.id).then(() => loadShopping(activePantryId))} onDelete={() => api.shopping.delete(item.id).then(() => loadShopping(activePantryId))} />
                  ))}
                </div>
              )}
              {checked.length > 0 && (
                <>
                  <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-bg/30">
                    <span className="text-xs text-text-sec uppercase tracking-wider font-medium">{checked.length} checked</span>
                    <button onClick={() => api.shopping.clearChecked(activePantryId).then(() => loadShopping(activePantryId))} className="text-xs text-text-sec hover:text-red cursor-pointer transition-colors">Clear all</button>
                  </div>
                  <div className="flex flex-col divide-y divide-border/40">
                    {checked.map(item => (
                      <ShoppingRow key={item.id} item={item} food={foodMap.get(item.food_id)} onToggle={() => api.shopping.toggle(item.id).then(() => loadShopping(activePantryId))} onDelete={() => api.shopping.delete(item.id).then(() => loadShopping(activePantryId))} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {discardId !== null && (
        <ConfirmDialog
          message="Discard this batch? The quantity will be removed from the pantry."
          confirmLabel="Discard"
          dangerous
          onConfirm={handleConfirmDiscard}
          onCancel={() => setDiscardId(null)}
        />
      )}
      {discardAllIds !== null && (
        <ConfirmDialog
          message={`Discard all ${discardAllIds.length} packs? This cannot be undone.`}
          confirmLabel="Discard all"
          dangerous
          onConfirm={handleConfirmDiscardAll}
          onCancel={() => setDiscardAllIds(null)}
        />
      )}
      {showManageModal && (
        <ManagePantriesModal
          pantries={pantries}
          activePantryId={activePantryId}
          onClose={() => setShowManageModal(false)}
          onChanged={refreshPantries}
        />
      )}
    </div>
  );
}

// ── Module-level sub-components ───────────────────────────────────────────────

interface ManagePantriesModalProps {
  pantries: PantryLocation[];
  activePantryId: number | undefined;
  onClose: () => void;
  onChanged: () => void;
}

function ManagePantriesModal({ pantries, activePantryId: _activePantryId, onClose, onChanged }: ManagePantriesModalProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const [newName, setNewName]           = useState('');
  const [renamingId, setRenamingId]     = useState<number | null>(null);
  const [renameVal, setRenameVal]       = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PantryLocation | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    await api.pantries.create(newName.trim());
    setNewName('');
    onChanged();
  }

  async function handleRename(id: number) {
    if (!renameVal.trim()) return;
    await api.pantries.rename(id, renameVal.trim());
    setRenamingId(null);
    onChanged();
  }

  async function handleDelete(p: PantryLocation) {
    if (p.is_default) { showToast(t('pantry.cannotDeleteDefault')); return; }
    setDeleteTarget(p);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const res = await api.pantries.delete(deleteTarget.id);
    if (!res.ok && res.reason === 'is_default') {
      showToast(t('pantry.cannotDeleteDefault'));
    }
    setDeleteTarget(null);
    onChanged();
  }

  async function handleSetDefault(id: number) {
    await api.pantries.setDefault(id);
    onChanged();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md flex flex-col gap-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">{t('pantry.managePantries')}</h2>
          <button onClick={onClose} className="text-text-sec hover:text-text cursor-pointer text-lg">✕</button>
        </div>

        {/* Existing pantries */}
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border overflow-hidden">
          {pantries.map(p => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2.5 bg-bg">
              {renamingId === p.id ? (
                <>
                  <input
                    type="text"
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(p.id); if (e.key === 'Escape') setRenamingId(null); }}
                    className="flex-1 bg-bg border border-border rounded-lg px-2 py-1 text-sm text-text outline-none focus:border-accent"
                  />
                  <button onClick={() => handleRename(p.id)} className="text-xs text-accent font-medium cursor-pointer hover:opacity-75">Save</button>
                  <button onClick={() => setRenamingId(null)} className="text-xs text-text-sec cursor-pointer hover:text-text">✕</button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-text">{p.name}</span>
                  {p.is_default ? (
                    <span className="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full">{t('pantry.defaultBadge')}</span>
                  ) : (
                    <button onClick={() => handleSetDefault(p.id)} className="text-xs text-text-sec hover:text-accent cursor-pointer transition-colors">{t('pantry.setDefault')}</button>
                  )}
                  <button
                    onClick={() => { setRenamingId(p.id); setRenameVal(p.name); }}
                    className="text-xs text-text-sec hover:text-text cursor-pointer transition-colors"
                  >{t('pantry.renamePantry')}</button>
                  {!p.is_default && (
                    <button
                      onClick={() => handleDelete(p)}
                      className="text-xs text-text-sec hover:text-red cursor-pointer transition-colors"
                    >✕</button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new pantry */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder={t('pantry.pantryName')}
            className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg cursor-pointer hover:opacity-90 disabled:opacity-40 font-medium"
          >{t('pantry.addPantry')}</button>
        </div>
      </div>
      {deleteTarget && (
        <ConfirmDialog
          message={t('pantry.deletePantryConfirm').replace('{name}', deleteTarget.name)}
          confirmLabel={t('pantry.deletePantry')}
          dangerous
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

interface ShoppingRowProps {
  item: ShoppingItem;
  food?: Food;
  onToggle: () => void;
  onDelete: () => void;
}

function ShoppingRow({ item, food, onToggle, onDelete }: ShoppingRowProps) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 transition-colors ${item.checked ? 'bg-bg/20' : 'hover:bg-bg/40'}`}>
      <button
        onClick={onToggle}
        className={[
          'w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors shrink-0',
          item.checked ? 'border-accent bg-accent text-white' : 'border-border hover:border-accent',
        ].join(' ')}
      >
        {item.checked ? <span className="text-[10px] leading-none">✓</span> : null}
      </button>
      <span className={`flex-1 text-sm ${item.checked ? 'line-through text-text-sec' : 'text-text'}`}>
        {item.food_name}
      </span>
      {item.quantity_g > 0 && (
        <span className="text-xs text-text-sec tabular-nums">{formatPacked(item.quantity_g, food)}</span>
      )}
      <button onClick={onDelete} className="text-text-sec hover:text-red text-sm cursor-pointer transition-colors w-5 text-center">✕</button>
    </div>
  );
}

