import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from 'react';
import { evalExpr, resolveExpr } from '../lib/evalExpr';
import { today, daysUntil, formatDMY } from '../lib/dateUtil';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useSettings } from '../hooks/useSettings';
import { useT } from '../i18n/useT';
import FoodSearch from '../components/FoodSearch';
import type { SearchItem } from '../components/FoodSearch';
import ConfirmDialog from '../components/ConfirmDialog';
import AddFoodForm from '../components/AddFoodForm';
import {
  PageHeader, SegmentedControl, SearchField, EmptyState, IconBtn,
  eyebrow, serifItalic, cardOuter, tinyInput, pillPrimary, pillGhost, pillSoft,
} from '../lib/fbUI';
import type { Food, PantryItem, PantryAggregate, PantryLocation, ShoppingItem } from '../types';

type Tab = 'pantry' | 'shopping';

// ── Helpers ───────────────────────────────────────────────────────────────────

function compareExpiry(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

interface ExpiryStatus { color: string; bg: string; bold: boolean; }

function expiryStatus(iso: string | null, warn: number, urgent: number): ExpiryStatus {
  if (!iso) return { color: 'var(--fb-text-3)', bg: 'transparent', bold: false };
  const d = daysUntil(iso);
  if (d < 0) return { color: 'var(--fb-red)', bg: 'color-mix(in srgb, var(--fb-red) 14%, transparent)', bold: true };
  if (d <= urgent) return { color: 'var(--fb-red)', bg: 'transparent', bold: true };
  if (d <= warn) return { color: 'var(--fb-amber)', bg: 'transparent', bold: false };
  return { color: 'var(--fb-text-2)', bg: 'transparent', bold: false };
}

function expiryLabel(iso: string | null, warn: number, _urgent: number): string {
  if (!iso) return '';
  const d = daysUntil(iso);
  if (d < 0) return `Expired ${Math.abs(d)}d ago`;
  if (d === 0) return 'Expires today';
  if (d <= warn) return `Exp. in ${d}d`;
  return formatDMY(iso);
}

function openedLabel(batch: PantryItem): string | null {
  if (!batch.opened_at || !batch.opened_days) return null;
  const dueMs = new Date(batch.opened_at).getTime() + batch.opened_days * 86400_000;
  const daysLeft = Math.ceil((dueMs - Date.now()) / 86400_000);
  if (daysLeft < 0)   return `Opened, ${-daysLeft}d past`;
  if (daysLeft === 0) return 'Opened, today';
  return `Opened, ${daysLeft}d left`;
}

function openedStatus(batch: PantryItem): ExpiryStatus {
  if (!batch.opened_at || !batch.opened_days) return { color: 'var(--fb-text-3)', bg: 'transparent', bold: false };
  const dueMs = new Date(batch.opened_at).getTime() + batch.opened_days * 86400_000;
  const daysLeft = Math.ceil((dueMs - Date.now()) / 86400_000);
  if (daysLeft < 0)  return { color: 'var(--fb-red)', bg: 'color-mix(in srgb, var(--fb-red) 14%, transparent)', bold: true };
  if (daysLeft <= 1) return { color: 'var(--fb-red)', bg: 'transparent', bold: true };
  if (daysLeft <= 3) return { color: 'var(--fb-amber)', bg: 'transparent', bold: false };
  return { color: 'var(--fb-text-2)', bg: 'transparent', bold: false };
}

function seedExpiry(current: string): string { return current || today(); }

function resolveExpiry(iso: string): string {
  if (!iso) return iso;
  if (daysUntil(iso) >= 0) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear  = m === 12 ? y + 1 : y;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

type PantryUnit = 'g' | 'pcs' | `pkg-${number}`;

function formatQty(quantity_g: number, piece_grams: number | null, package_grams: number | null, count = 1): string {
  const totalG = Math.round(quantity_g * count);
  if (piece_grams && piece_grams > 0) {
    const pcs = Math.round(totalG / piece_grams);
    if (package_grams && package_grams > 0 && count === 1) {
      const pkgG = Math.round(package_grams);
      const pkgPcs = Math.round(pkgG / piece_grams);
      if (Math.abs(totalG - pkgG) < 1) return `${pcs} pcs · ${pkgG}g`;
      return `${pcs}/${pkgPcs} pcs · ${totalG}/${pkgG}g`;
    }
    return `${pcs} pcs (${totalG}g)`;
  }
  if (package_grams && package_grams > 0) {
    const pkgG = Math.round(package_grams);
    if (count > 1) return `${count} × ${pkgG}g (${totalG}g)`;
    if (Math.abs(totalG - pkgG) < 1) return `${pkgG}g`;
    return `${totalG}g / ${pkgG}g`;
  }
  return `${totalG}g`;
}

interface BatchGroup { batches: PantryItem[]; }

function groupBatches(batches: PantryItem[]): BatchGroup[] {
  const groups: BatchGroup[] = [];
  for (const batch of batches) {
    const isSealed = !batch.opened_at;
    const last = groups[groups.length - 1];
    const rep = last?.batches[0];
    const canMerge = last && isSealed && rep && !rep.opened_at &&
      rep.package_id != null && rep.package_id === batch.package_id &&
      rep.expiry_date === batch.expiry_date;
    if (canMerge) last.batches.push(batch);
    else groups.push({ batches: [batch] });
  }
  return groups;
}

function defaultUnit(food: Food): PantryUnit {
  if ((food.packages?.length ?? 0) > 0) return `pkg-${food.packages![0].id}`;
  if (food.piece_grams) return 'pcs';
  return 'g';
}

function unitToGrams(unit: PantryUnit, val: number, food: Food): number {
  if (unit === 'pcs' && food.piece_grams) return val * food.piece_grams;
  if (unit.startsWith('pkg-')) {
    const id = Number(unit.slice(4));
    const pkg = food.packages?.find(p => p.id === id);
    return pkg ? val * pkg.grams : val;
  }
  return val;
}

function unitToPackageId(unit: PantryUnit): number | null {
  return unit.startsWith('pkg-') ? Number(unit.slice(4)) : null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PantryPage() {
  const { showToast } = useToast();
  const { settings } = useSettings();
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('pantry');

  const [pantries, setPantries]             = useState<PantryLocation[]>([]);
  const [activePantryId, setActivePantryId] = useState<number | undefined>(undefined);
  const [showManageModal, setShowManageModal] = useState(false);

  const [items, setItems]               = useState<PantryItem[]>([]);
  const [foods, setFoods]               = useState<Food[]>([]);
  const [selFood, setSelFood]           = useState<Food | null>(null);
  const [qty, setQty]                   = useState('');
  const [expiry, setExpiry]             = useState('');
  const [unit, setUnit]                 = useState<PantryUnit>('g');

  const [pantryOpen, setPantryOpen]     = useState(false);
  const [shopOpen, setShopOpen]         = useState(false);

  const [discardId, setDiscardId]       = useState<number | null>(null);
  const [discardAllIds, setDiscardAllIds] = useState<number[] | null>(null);
  const [collapsedFoods, setCollapsedFoods] = useState<Set<number>>(new Set());
  const [editingBatch, setEditingBatch] = useState<{ id: number; qty: string; expiry: string; unit: PantryUnit } | null>(null);
  const [pantrySearch, setPantrySearch] = useState('');
  const qtyRef = useRef<HTMLInputElement | null>(null);

  const [shopping, setShopping]   = useState<ShoppingItem[]>([]);
  const [shopFood, setShopFood]   = useState<Food | null>(null);
  const [shopQty, setShopQty]     = useState('');

  const loadPantry = useCallback(async (pid?: number) => {
    const [p, f] = await Promise.all([api.pantry.getAll(pid), api.foods.getAll()]);
    setItems(p);
    setFoods(f);
  }, []);

  const loadShopping = useCallback(async (pid?: number) => {
    setShopping(await api.shopping.getAll(pid));
  }, []);

  const loadPantries = useCallback(async () => {
    const ps = await api.pantries.getAll();
    setPantries(ps);
    return ps;
  }, []);

  useEffect(() => {
    async function init() {
      const ps = await api.pantries.getAll();
      setPantries(ps);
      const def = ps.find(p => p.is_default) ?? ps[0];
      const pid = def?.id;
      setActivePantryId(pid);
      await Promise.all([loadPantry(pid), loadShopping(pid)]);
    }
    init();
  }, [loadPantry, loadShopping]);

  const aggregates: PantryAggregate[] = useMemo(() => {
    const map = new Map<number, PantryAggregate>();
    for (const b of items) {
      if (!map.has(b.food_id)) {
        map.set(b.food_id, { food_id: b.food_id, food_name: b.food_name, piece_grams: b.piece_grams, total_g: 0, earliest_expiry: null, batches: [], pack_breakdown: [] });
      }
      const agg = map.get(b.food_id)!;
      agg.total_g += b.quantity_g;
      agg.batches.push(b);
    }
    for (const agg of map.values()) {
      agg.batches.sort((a, b) => compareExpiry(a.expiry_date, b.expiry_date));
      agg.earliest_expiry = agg.batches[0]?.expiry_date ?? null;
      const packMap = new Map<number, number>();
      for (const b of agg.batches) {
        if (b.package_id && b.package_grams && b.package_grams > 0) {
          const count = b.quantity_g / b.package_grams;
          packMap.set(b.package_grams, (packMap.get(b.package_grams) ?? 0) + count);
        }
      }
      agg.pack_breakdown = [...packMap.entries()]
        .map(([grams, count]) => ({ grams, count: Math.round(count * 100) / 100 }))
        .sort((a, b) => a.grams - b.grams);
    }
    return [...map.values()].sort((a, b) => {
      const ec = compareExpiry(a.earliest_expiry, b.earliest_expiry);
      return ec !== 0 ? ec : a.food_name.localeCompare(b.food_name);
    });
  }, [items]);

  const foodMap = useMemo(() => new Map(foods.map(f => [f.id, f])), [foods]);
  const foodSearchItems: SearchItem[] = foods.map(f => ({ ...f, isRecipe: false as const, _freq: 0 }));

  const addGrams = selFood ? unitToGrams(unit, evalExpr(qty) ?? 0, selFood) : 0;

  function handleSelect(item: SearchItem) {
    const food = item as Food;
    setSelFood(food);
    setUnit(defaultUnit(food));
    setQty(''); setExpiry('');
    setTimeout(() => qtyRef.current?.focus(), 0);
  }

  async function handleAddBatch() {
    if (!selFood || !qty || addGrams <= 0) return;
    const pkgId = unitToPackageId(unit);
    if (pkgId !== null) {
      const pkgGrams = selFood.packages?.find(p => p.id === pkgId)?.grams ?? addGrams;
      const count = Math.round(addGrams / pkgGrams);
      for (let i = 0; i < count; i++) {
        await api.pantry.addBatch({ food_id: selFood.id, quantity_g: pkgGrams, expiry_date: expiry || null, package_id: pkgId, pantry_id: activePantryId });
      }
    } else {
      await api.pantry.addBatch({ food_id: selFood.id, quantity_g: addGrams, expiry_date: expiry || null, package_id: null, pantry_id: activePantryId });
    }
    setSelFood(null); setQty(''); setUnit('g'); setExpiry('');
    setPantryOpen(false);
    loadPantry(activePantryId);
  }

  function startEditBatch(batch: PantryItem) {
    const food = foods.find(f => f.id === batch.food_id);
    const isBulk = food?.is_bulk === 1;
    let batchUnit: PantryUnit = 'g';
    let qtyStr = String(Math.round(batch.quantity_g));
    if (!isBulk && batch.piece_grams && batch.piece_grams > 0) {
      batchUnit = 'pcs';
      qtyStr = String(Math.round((batch.quantity_g / batch.piece_grams) * 100) / 100);
    }
    setEditingBatch({ id: batch.id, qty: qtyStr, expiry: batch.expiry_date ?? '', unit: batchUnit });
  }

  async function handleSaveBatch(batch: PantryItem) {
    if (!editingBatch) return;
    const val = evalExpr(editingBatch.qty) ?? 0;
    const food = foods.find(f => f.id === batch.food_id);
    const grams = food ? unitToGrams(editingBatch.unit, val, food) : val;
    await api.pantry.set({ id: editingBatch.id, quantity_g: grams || 0, expiry_date: editingBatch.expiry || null, package_id: batch.package_id });
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
    loadPantry(activePantryId);
    setSelFood(food);
    setUnit(defaultUnit(food));
    setQty(''); setExpiry('');
    setPantryOpen(true);
    setTimeout(() => qtyRef.current?.focus(), 0);
  }

  function handleFoodFound(food: Food) {
    setSelFood(food);
    setUnit(defaultUnit(food));
    setQty(''); setExpiry('');
    setPantryOpen(true);
    showToast(`Found: ${food.name}`, 'success');
    setTimeout(() => qtyRef.current?.focus(), 0);
  }

  async function handleAddShopping() {
    if (!shopFood) return;
    await api.shopping.add({ food_id: shopFood.id, quantity_g: shopQty ? (evalExpr(shopQty) ?? 0) : 0, pantry_id: activePantryId });
    setShopFood(null); setShopQty('');
    setShopOpen(false);
    loadShopping(activePantryId);
  }

  function handleSwitchPantry(id: number) {
    setActivePantryId(id);
    loadPantry(id);
    loadShopping(id);
  }

  const warn = settings.pantry_warn_days ?? 3;
  const urgent = settings.pantry_urgent_days ?? 1;
  const unchecked = shopping.filter(s => !s.checked);
  const checked   = shopping.filter(s => s.checked);

  const q = pantrySearch.toLowerCase();
  const visible = q ? aggregates.filter(a => a.food_name.toLowerCase().includes(q)) : aggregates;
  const allCollapsed = visible.length > 0 && visible.every(agg => collapsedFoods.has(agg.food_id));

  function toggleAllBatches() {
    if (allCollapsed) setCollapsedFoods(new Set());
    else setCollapsedFoods(new Set(visible.map(a => a.food_id)));
  }

  const activePantry = pantries.find(p => p.id === activePantryId);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--fb-bg)', color: 'var(--fb-text)', fontFamily: 'var(--font-body)' }}>

      <PageHeader
        eyebrow="Inventory"
        title={activePantry?.name ?? 'Pantry'}
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {pantries.length > 1 && (
              <>
                <span style={{ width: 1, height: 22, background: 'var(--fb-border-strong)' }} />
                <select
                  value={activePantryId ?? ''}
                  onChange={e => handleSwitchPantry(Number(e.target.value))}
                  style={{
                    fontSize: 11, background: 'var(--fb-card)',
                    border: '1px solid var(--fb-border)', borderRadius: 99,
                    padding: '5px 12px', color: 'var(--fb-text-2)', outline: 'none', cursor: 'pointer',
                  }}
                >
                  {pantries.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.is_default ? ` (${t('pantry.defaultBadge')})` : ''}</option>
                  ))}
                </select>
              </>
            )}
            <button onClick={() => setShowManageModal(true)} style={pillSoft}>
              {t('pantry.managePantries')}
            </button>
          </div>
        }
        right={
          <SegmentedControl<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'pantry',   label: 'Pantry' },
              { value: 'shopping', label: 'Shopping' },
            ]}
          />
        }
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 60px' }} className="hide-scrollbar">
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {tab === 'pantry' && (
            <>
              {/* Add to Pantry */}
              <section style={{ ...cardOuter, padding: 0, overflow: 'hidden' }}>
                <button
                  onClick={() => setPantryOpen(v => !v)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '18px 22px',
                    background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={eyebrow}>Stock</span>
                    <span style={{ ...serifItalic, fontSize: 20, fontWeight: 400, color: 'var(--fb-text)', lineHeight: 1.1 }}>
                      Add to pantry
                    </span>
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, borderRadius: 99,
                    background: pantryOpen ? 'var(--fb-bg-2)' : 'var(--fb-accent)',
                    color: pantryOpen ? 'var(--fb-text-2)' : 'white',
                    fontSize: 16, lineHeight: 1,
                    transition: 'transform .5s cubic-bezier(0.32,0.72,0,1), background .3s ease',
                    transform: pantryOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                  }}>+</span>
                </button>

                {pantryOpen && (
                  <div style={{
                    padding: '20px 22px',
                    borderTop: '1px solid var(--fb-divider)',
                    display: 'flex', flexDirection: 'column', gap: 14,
                    animation: 'slideDown .5s cubic-bezier(0.32,0.72,0,1)',
                  }}>
                    {!selFood ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <FoodSearch
                          items={foodSearchItems}
                          onSelect={handleSelect}
                          onClear={() => { setSelFood(null); setQty(''); setUnit('g'); setExpiry(''); }}
                          placeholder="Search existing food…"
                          pantryId={activePantryId}
                          clearAfterSelect
                        />
                        <Divider label="or scan / create new" />
                        <AddFoodForm existingFoods={foods} onFoodFound={handleFoodFound} onAdded={handleFoodSaved} />
                      </div>
                    ) : (
                      <SelectedFoodEditor
                        food={selFood}
                        qty={qty} setQty={setQty}
                        unit={unit} setUnit={setUnit}
                        expiry={expiry} setExpiry={setExpiry}
                        addGrams={addGrams}
                        qtyRef={qtyRef}
                        onBack={() => setSelFood(null)}
                        onAdd={handleAddBatch}
                      />
                    )}
                  </div>
                )}
              </section>

              {/* Inventory list */}
              <section style={{ ...cardOuter }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <SearchField value={pantrySearch} onChange={setPantrySearch} placeholder="Search pantry…" />
                  <button onClick={toggleAllBatches} style={!allCollapsed ? pillGhost : { ...pillGhost, color: 'var(--fb-accent)', borderColor: 'var(--fb-accent)', background: 'var(--fb-accent-soft)' }}>
                    {!allCollapsed ? 'Hide batches' : 'Show batches'}
                  </button>
                </div>

                {visible.length === 0 ? (
                  <EmptyState message="Pantry is empty or no matches found." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 14, overflow: 'hidden' }}>
                    {visible.map((agg, idx) => {
                      const foodData = foodMap.get(agg.food_id);
                      const collapsed = collapsedFoods.has(agg.food_id);
                      return (
                        <div key={agg.food_id} style={{ display: 'flex', flexDirection: 'column', borderTop: idx === 0 ? 'none' : '1px solid var(--fb-divider)' }}>

                          {/* Group header */}
                          <button
                            type="button"
                            onClick={() => toggleCollapse(agg.food_id)}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                              padding: '12px 16px',
                              background: 'var(--fb-card)',
                              border: 0, cursor: 'pointer', textAlign: 'left',
                              transition: 'background .25s ease',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--fb-card) 60%, var(--fb-bg-2) 40%)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--fb-card)')}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                              {foodData?.image_url ? (
                                <div style={{ padding: 2, background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 10 }}>
                                  <img src={foodData.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', display: 'block', background: 'white' }} />
                                </div>
                              ) : (
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--fb-text-3)' }}>🍽️</div>
                              )}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                                <span style={{ ...serifItalic, fontSize: 15, color: 'var(--fb-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agg.food_name}</span>
                                <ExpiryHint iso={agg.earliest_expiry} warn={warn} urgent={urgent} />
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                              <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 18, letterSpacing: -0.5, color: 'var(--fb-text)' }}>
                                {formatQty(agg.total_g, agg.piece_grams, agg.pack_breakdown.length === 1 ? agg.pack_breakdown[0].grams : null)}
                              </span>
                              <span style={{
                                width: 24, height: 24, borderRadius: 99,
                                background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--fb-text-3)', fontSize: 9,
                                transition: 'transform .35s cubic-bezier(0.32,0.72,0,1)',
                                transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)',
                              }}>▼</span>
                            </div>
                          </button>

                          {/* Batches */}
                          {!collapsed && (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              {groupBatches(agg.batches).map(group => (
                                group.batches.map((batch, bIdx) => {
                                  const isEditing = editingBatch?.id === batch.id;
                                  return (
                                    <BatchRow
                                      key={`${batch.id}-${bIdx}`}
                                      batch={batch}
                                      foodData={foodData}
                                      warn={warn} urgent={urgent}
                                      isEditing={isEditing}
                                      editingState={editingBatch}
                                      setEditing={setEditingBatch}
                                      onStartEdit={() => startEditBatch(batch)}
                                      onSave={() => handleSaveBatch(batch)}
                                      onCancel={() => setEditingBatch(null)}
                                      onDiscard={() => setDiscardId(batch.id)}
                                    />
                                  );
                                })
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          {tab === 'shopping' && (
            <>
              <section style={{ ...cardOuter, padding: 0, overflow: 'hidden' }}>
                <button
                  onClick={() => setShopOpen(v => !v)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '18px 22px',
                    background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={eyebrow}>List</span>
                    <span style={{ ...serifItalic, fontSize: 20, fontWeight: 400, color: 'var(--fb-text)', lineHeight: 1.1 }}>
                      Add to shopping list
                    </span>
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, borderRadius: 99,
                    background: shopOpen ? 'var(--fb-bg-2)' : 'var(--fb-accent)',
                    color: shopOpen ? 'var(--fb-text-2)' : 'white',
                    fontSize: 16, lineHeight: 1,
                    transition: 'transform .5s cubic-bezier(0.32,0.72,0,1)',
                    transform: shopOpen ? 'rotate(45deg)' : 'rotate(0)',
                  }}>+</span>
                </button>

                {shopOpen && (
                  <div style={{ padding: '20px 22px', borderTop: '1px solid var(--fb-divider)', display: 'flex', flexDirection: 'column', gap: 14, animation: 'slideDown .5s cubic-bezier(0.32,0.72,0,1)' }}>
                    {!shopFood ? (
                      <FoodSearch
                        items={foodSearchItems}
                        onSelect={item => { setShopFood(item as Food); setShopQty(''); }}
                        onClear={() => { setShopFood(null); setShopQty(''); }}
                        placeholder="Search food to add…"
                        pantryId={activePantryId}
                        clearAfterSelect
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <FoodCard food={shopFood} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={eyebrow}>Amount (optional)</span>
                          <input
                            type="text" inputMode="decimal" value={shopQty}
                            onChange={e => setShopQty(e.target.value)}
                            onBlur={() => setShopQty(v => resolveExpr(v))}
                            onKeyDown={e => { if (e.key === 'Enter') { setShopQty(resolveExpr(shopQty)); handleAddShopping(); } }}
                            placeholder="e.g. 500g"
                            style={{ ...tinyInput, padding: '10px 14px', fontSize: 14 }}
                            autoFocus
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => setShopFood(null)} style={pillGhost}>Back</button>
                          <button onClick={handleAddShopping} style={pillPrimary}>
                            Add to list
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 99, background: 'rgba(255,255,255,0.2)', fontSize: 12 }}>↗</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {shopping.length === 0 ? (
                <EmptyState message="Shopping list is empty." />
              ) : (
                <section style={{ ...cardOuter, padding: 0, overflow: 'hidden' }}>
                  {unchecked.length > 0 && (
                    <div>
                      {unchecked.map(item => (
                        <ShoppingRow key={item.id} item={item} onToggle={() => api.shopping.toggle(item.id).then(() => loadShopping(activePantryId))} onDelete={() => api.shopping.delete(item.id).then(() => loadShopping(activePantryId))} />
                      ))}
                    </div>
                  )}
                  {checked.length > 0 && (
                    <>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 16px',
                        background: 'var(--fb-bg)',
                        borderTop: '1px solid var(--fb-divider)',
                        borderBottom: '1px solid var(--fb-divider)',
                      }}>
                        <span style={eyebrow}>{checked.length} completed</span>
                        <button onClick={() => api.shopping.clearChecked(activePantryId).then(() => loadShopping(activePantryId))} style={{ background: 'transparent', border: 0, color: 'var(--fb-red)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                          Clear all
                        </button>
                      </div>
                      <div>
                        {checked.map(item => (
                          <ShoppingRow key={item.id} item={item} onToggle={() => api.shopping.toggle(item.id).then(() => loadShopping(activePantryId))} onDelete={() => api.shopping.delete(item.id).then(() => loadShopping(activePantryId))} />
                        ))}
                      </div>
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {discardId !== null && (
        <ConfirmDialog message="Discard this batch? The quantity will be removed from the pantry." confirmLabel="Discard" dangerous onConfirm={handleConfirmDiscard} onCancel={() => setDiscardId(null)} />
      )}
      {discardAllIds !== null && (
        <ConfirmDialog message={`Discard all ${discardAllIds.length} packs? This cannot be undone.`} confirmLabel="Discard all" dangerous onConfirm={handleConfirmDiscardAll} onCancel={() => setDiscardAllIds(null)} />
      )}
      {showManageModal && (
        <ManagePantriesModal
          pantries={pantries}
          activePantryId={activePantryId}
          onClose={() => setShowManageModal(false)}
          onChanged={async () => {
            const ps = await loadPantries();
            const stillActive = ps.find(p => p.id === activePantryId);
            const def = ps.find(p => p.is_default) ?? ps[0];
            const pid = stillActive ? activePantryId : def?.id;
            if (pid !== activePantryId) {
              setActivePantryId(pid);
              loadPantry(pid);
              loadShopping(pid);
            }
          }}
        />
      )}

      <style>{`
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
      <span style={{ flex: 1, height: 1, background: 'var(--fb-divider)' }} />
      <span style={eyebrow}>{label}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--fb-divider)' }} />
    </div>
  );
}

function FoodCard({ food }: { food: Food }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: 12,
      background: 'var(--fb-bg)', border: '1px solid var(--fb-border)',
      borderRadius: 14,
    }}>
      {food.image_url && (
        <div style={{ padding: 2, background: 'var(--fb-card)', border: '1px solid var(--fb-border)', borderRadius: 12 }}>
          <img src={food.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', display: 'block', background: 'white' }} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ ...serifItalic, fontSize: 16, color: 'var(--fb-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {food.name}
        </span>
        <span className="tnum" style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>
          {food.calories} kcal / 100g
        </span>
      </div>
    </div>
  );
}

interface SelectedFoodEditorProps {
  food: Food;
  qty: string; setQty: (v: string) => void;
  unit: PantryUnit; setUnit: (u: PantryUnit) => void;
  expiry: string; setExpiry: (s: string) => void;
  addGrams: number;
  qtyRef: React.RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onAdd: () => void;
}

function SelectedFoodEditor({ food, qty, setQty, unit, setUnit, expiry, setExpiry, addGrams, qtyRef, onBack, onAdd }: SelectedFoodEditorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <FoodCard food={food} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,200px)', gap: 12 }} className="pantry-editor-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <span style={eyebrow}>Quantity</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            {(food.piece_grams || (food.packages?.length ?? 0) > 0) && (
              <select
                value={unit}
                onChange={e => { setUnit(e.target.value as PantryUnit); setQty(''); }}
                style={{
                  background: 'var(--fb-bg)', border: '1px solid var(--fb-border)',
                  color: 'var(--fb-text)', borderRadius: 10, padding: '8px 10px',
                  fontSize: 13, fontWeight: 600, outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="g">g</option>
                {food.piece_grams && <option value="pcs">pcs</option>}
                {food.packages?.map(pkg => (
                  <option key={pkg.id} value={`pkg-${pkg.id}`}>{pkg.grams}g pack</option>
                ))}
              </select>
            )}
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <input
                ref={qtyRef} type="text" inputMode="decimal" value={qty}
                onChange={e => setQty(e.target.value)}
                onBlur={() => setQty(resolveExpr(qty))}
                onKeyDown={e => { if (e.key === 'Enter') { setQty(resolveExpr(qty)); onAdd(); } }}
                placeholder={unit === 'pcs' ? 'pieces' : unit === 'g' ? 'grams' : 'packs'}
                style={{ ...tinyInput, padding: '10px 14px', fontSize: 14 }}
                autoFocus
              />
              {unit !== 'g' && qty && (evalExpr(qty) ?? 0) > 0 && addGrams > 0 && (
                <span className="tnum" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 600, color: 'var(--fb-text-3)', pointerEvents: 'none' }}>
                  = {Math.round(addGrams)}g
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <span style={eyebrow}>Expiry (opt.)</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="date" value={expiry}
              onFocus={() => setExpiry(seedExpiry(expiry))}
              onChange={e => setExpiry(e.target.value)}
              onBlur={e => setExpiry(resolveExpiry(e.target.value))}
              style={{ ...tinyInput, padding: '10px 12px', fontSize: 13 }}
            />
            {expiry && (
              <IconBtn label="Clear date" tone="red" onClick={() => setExpiry('')}>✕</IconBtn>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onBack} style={pillGhost}>Back</button>
        <button onClick={onAdd} disabled={!qty || addGrams <= 0} style={{ ...pillPrimary, opacity: (!qty || addGrams <= 0) ? 0.4 : 1 }}>
          Add
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 99, background: 'rgba(255,255,255,0.2)', fontSize: 12 }}>↗</span>
        </button>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .pantry-editor-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function ExpiryHint({ iso, warn, urgent }: { iso: string | null; warn: number; urgent: number }) {
  if (!iso) return null;
  const status = expiryStatus(iso, warn, urgent);
  const lbl = expiryLabel(iso, warn, urgent);
  return (
    <span className="tnum" style={{ fontSize: 10, fontWeight: status.bold ? 700 : 500, color: status.color, letterSpacing: 0.2 }}>
      {lbl}
    </span>
  );
}

interface BatchRowProps {
  batch: PantryItem;
  foodData: Food | undefined;
  warn: number; urgent: number;
  isEditing: boolean;
  editingState: { id: number; qty: string; expiry: string; unit: PantryUnit } | null;
  setEditing: React.Dispatch<React.SetStateAction<{ id: number; qty: string; expiry: string; unit: PantryUnit } | null>>;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDiscard: () => void;
}

function BatchRow({ batch, foodData, warn, urgent, isEditing, editingState, setEditing, onStartEdit, onSave, onCancel, onDiscard }: BatchRowProps) {
  const expLbl = expiryLabel(batch.expiry_date, warn, urgent);
  const expSt  = expiryStatus(batch.expiry_date, warn, urgent);
  const opnLbl = openedLabel(batch);
  const opnSt  = openedStatus(batch);

  if (isEditing && editingState) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        padding: '12px 16px',
        borderTop: '1px solid var(--fb-divider)',
        background: 'color-mix(in srgb, var(--fb-card) 50%, transparent)',
      }}>
        {batch.piece_grams && foodData?.is_bulk !== 1 && (
          <select
            value={editingState.unit}
            onChange={e => setEditing(b => b ? { ...b, unit: e.target.value as PantryUnit } : b)}
            style={{ ...tinyInput, width: 70, padding: '7px 8px', cursor: 'pointer' }}
          >
            <option value="g">g</option>
            <option value="pcs">pcs</option>
          </select>
        )}
        <input
          type="text" inputMode="decimal" value={editingState.qty}
          onChange={e => setEditing(b => b ? { ...b, qty: e.target.value } : b)}
          onBlur={() => setEditing(b => b ? { ...b, qty: resolveExpr(b.qty) } : b)}
          style={{ ...tinyInput, width: 90, textAlign: 'center', fontWeight: 600 }}
          autoFocus
        />
        <input
          type="date" value={editingState.expiry}
          onChange={e => setEditing(b => b ? { ...b, expiry: e.target.value } : b)}
          style={{ ...tinyInput, flex: 1, minWidth: 130 }}
        />
        <button onClick={onCancel} style={{ ...pillGhost, padding: '6px 14px', fontSize: 11.5 }}>Cancel</button>
        <button onClick={onSave} style={{ ...pillPrimary, padding: '6px 14px', fontSize: 11.5 }}>Save</button>
      </div>
    );
  }

  return (
    <div className="pantry-batch-row" style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
      padding: '11px 16px',
      borderTop: '1px solid var(--fb-divider)',
      transition: 'background .25s ease',
    }}>
      <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: 'var(--fb-text)', minWidth: 70 }}>
        {formatQty(batch.quantity_g, batch.piece_grams, batch.package_grams ?? (foodData?.packages?.length === 1 ? foodData.packages[0].grams : null), 1)}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        {expLbl ? (
          <span className="tnum" style={{
            fontSize: 11, fontWeight: expSt.bold ? 700 : 500,
            color: expSt.color,
            background: expSt.bg,
            padding: expSt.bg !== 'transparent' ? '3px 9px' : 0,
            borderRadius: 99,
            letterSpacing: 0.2,
          }}>{expLbl}</span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--fb-text-3)', fontStyle: 'italic' }}>No date</span>
        )}
        {opnLbl && (
          <span className="tnum" style={{
            fontSize: 11, fontWeight: opnSt.bold ? 700 : 500,
            color: opnSt.color,
            background: opnSt.bg,
            padding: opnSt.bg !== 'transparent' ? '3px 9px' : 0,
            borderRadius: 99,
          }}>{opnLbl}</span>
        )}
      </div>
      <span className="batch-actions" style={{ display: 'inline-flex', gap: 6 }}>
        <IconBtn label="Edit" onClick={onStartEdit}>✎</IconBtn>
        <IconBtn label="Discard" tone="red" onClick={onDiscard}>✕</IconBtn>
      </span>
      <style>{`
        .pantry-batch-row:hover { background: color-mix(in srgb, var(--fb-card) 40%, transparent); }
        .pantry-batch-row .batch-actions { opacity: 0; transition: opacity .25s ease; }
        .pantry-batch-row:hover .batch-actions { opacity: 1; }
        @media (max-width: 720px) {
          .pantry-batch-row .batch-actions { opacity: 1 !important; }
        }
      `}</style>
    </div>
  );
}

// ── ShoppingRow ───────────────────────────────────────────────────────────────

interface ShoppingRowProps {
  item: ShoppingItem;
  onToggle: () => void;
  onDelete: () => void;
}

function ShoppingRow({ item, onToggle, onDelete }: ShoppingRowProps) {
  return (
    <div
      onClick={onToggle}
      className="shopping-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
        borderTop: '1px solid var(--fb-divider)',
        cursor: 'pointer',
        background: item.checked ? 'color-mix(in srgb, var(--fb-bg) 40%, transparent)' : 'transparent',
        transition: 'background .25s ease',
      }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: 99, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: item.checked ? 'var(--fb-accent)' : 'transparent',
        border: '1.5px solid ' + (item.checked ? 'var(--fb-accent)' : 'var(--fb-border-strong)'),
        color: 'white', fontSize: 12, fontWeight: 700,
        transition: 'all .25s cubic-bezier(0.32,0.72,0,1)',
      }}>
        {item.checked && '✓'}
      </span>
      <span style={{
        flex: 1, minWidth: 0,
        ...serifItalic, fontSize: 14.5,
        color: item.checked ? 'var(--fb-text-3)' : 'var(--fb-text)',
        textDecoration: item.checked ? 'line-through' : 'none',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {item.food_name}
      </span>
      {item.quantity_g > 0 && (
        <span className="tnum" style={{
          fontSize: 11, fontWeight: 600,
          color: item.checked ? 'var(--fb-text-3)' : 'var(--fb-text-2)',
          padding: '2px 8px', borderRadius: 99,
          background: 'var(--fb-bg)', border: '1px solid var(--fb-border)',
        }}>
          {item.quantity_g}g
        </span>
      )}
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        aria-label="Delete"
        style={{
          width: 26, height: 26, borderRadius: 99, border: 0,
          background: 'transparent', color: 'var(--fb-text-3)',
          cursor: 'pointer', flexShrink: 0,
          fontSize: 11, lineHeight: 1,
          transition: 'all .25s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--fb-red) 18%, transparent)'; e.currentTarget.style.color = 'var(--fb-red)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fb-text-3)'; }}
      >✕</button>
    </div>
  );
}

// ── ManagePantriesModal ───────────────────────────────────────────────────────

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
    if (p.is_default) { showToast(t('pantry.cannotDeleteDefault'), 'error'); return; }
    setDeleteTarget(p);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const res = await api.pantries.delete(deleteTarget.id);
    if (!res.ok && res.reason === 'is_default') {
      showToast(t('pantry.cannotDeleteDefault'), 'error');
    }
    setDeleteTarget(null);
    onChanged();
  }

  async function handleSetDefault(id: number) {
    await api.pantries.setDefault(id);
    onChanged();
  }

  const overlay: CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 50,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--fb-card)', border: '1px solid var(--fb-border)',
          borderRadius: 18, padding: 22,
          width: '100%', maxWidth: 460,
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 20px 60px -20px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={eyebrow}>Locations</span>
            <span style={{ ...serifItalic, fontSize: 20, color: 'var(--fb-text)', lineHeight: 1.1 }}>
              {t('pantry.managePantries')}
            </span>
          </div>
          <IconBtn label="Close" onClick={onClose}>✕</IconBtn>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 14, overflow: 'hidden' }}>
          {pantries.map((p, idx) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '12px 14px', borderTop: idx === 0 ? 'none' : '1px solid var(--fb-divider)' }}>
              {renamingId === p.id ? (
                <>
                  <input
                    type="text" value={renameVal} autoFocus
                    onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(p.id); if (e.key === 'Escape') setRenamingId(null); }}
                    style={{ ...tinyInput, flex: 1 }}
                  />
                  <button onClick={() => handleRename(p.id)} style={{ ...pillPrimary, padding: '6px 14px', fontSize: 11.5 }}>Save</button>
                  <IconBtn label="Cancel" onClick={() => setRenamingId(null)}>✕</IconBtn>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, ...serifItalic, fontSize: 14, color: 'var(--fb-text)' }}>
                    {p.name}
                  </span>
                  {p.is_default && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 99, background: 'var(--fb-accent-soft)', color: 'var(--fb-accent)' }}>
                      {t('pantry.defaultBadge')}
                    </span>
                  )}
                  {!p.is_default && (
                    <button onClick={() => handleSetDefault(p.id)} style={{ ...pillSoft, padding: '4px 10px', fontSize: 10.5 }}>Set default</button>
                  )}
                  <IconBtn label="Rename" onClick={() => { setRenamingId(p.id); setRenameVal(p.name); }}>✎</IconBtn>
                  {!p.is_default && (
                    <IconBtn label="Delete" tone="red" onClick={() => handleDelete(p)}>✕</IconBtn>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text" value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder={t('pantry.pantryName')}
            style={{ ...tinyInput, flex: 1, padding: '10px 14px', fontSize: 14 }}
          />
          <button onClick={handleCreate} disabled={!newName.trim()} style={{ ...pillPrimary, opacity: !newName.trim() ? 0.4 : 1 }}>Add</button>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog message={t('pantry.deletePantryConfirm').replace('{name}', deleteTarget.name)} confirmLabel={t('pantry.deletePantry')} dangerous onConfirm={handleConfirmDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
