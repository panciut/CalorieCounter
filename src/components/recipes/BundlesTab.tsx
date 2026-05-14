import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import { useToast } from '../Toast';
import { useT } from '../../i18n/useT';
import ConfirmDialog from '../ConfirmDialog';
import AddFoodRow from '../AddFoodRow';
import { today } from '../../lib/dateUtil';
import { MEAL_ORDER, type Recipe, type RecipeIngredient, type Food, type Meal, type PantryIngredientCheck, type PantryLocation } from '../../types';
import { useDeductionEvents } from '../../hooks/useDeductionEvents';
import DeductionEventModal from '../DeductionEventModal';
import { serifItalic, pillPrimary, pillGhost, EmptyState, MACRO_DOT, MacroChip } from '../../lib/fbUI';

type PantryCheckResult = { can_make: boolean; missing: PantryIngredientCheck[] };

function n(v: unknown) { return Math.round(Number(v) || 0); }
function nf(v: unknown) { return Math.round((Number(v) || 0) * 100) / 100; }

function BundlesTab() {
  const { showToast } = useToast();
  const { tMeal } = useT();
  const { current: deductionEvent, next: nextDeduction, push: pushDeduction } = useDeductionEvents();
  const [bundles, setBundles]           = useState<Recipe[]>([]);
  const [foods, setFoods]               = useState<Food[]>([]);
  const [detailId, setDetailId]         = useState<number | null>(null);
  const [detail, setDetail]             = useState<Recipe | null>(null);
  const [creating, setCreating]         = useState(false);
  const [logTarget, setLogTarget]       = useState<Recipe | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const [logMeal, setLogMeal]           = useState<Meal>('Lunch');
  const [logDate, setLogDate]           = useState(today());
  const [logScale, setLogScale]         = useState('1');
  const [canMakeFilter, setCanMakeFilter] = useState(false);
  const [canMakeMap, setCanMakeMap]       = useState<Map<number, { can_make: boolean; missing_count: number }>>(new Map());
  const [logPantryCheck, setLogPantryCheck] = useState<PantryCheckResult | null>(null);
  const [deductOnLog, setDeductOnLog]     = useState(false);
  const [pantries, setPantries]           = useState<PantryLocation[]>([]);
  const [pantryId, setPantryId]           = useState<number | undefined>(undefined);

  const loadBundles = useCallback(async (pid?: number) => {
    const [b, m] = await Promise.all([
      api.recipes.getAll(),
      api.pantry.canMakeAll('bundle', pid),
    ]);
    setBundles(b);
    setCanMakeMap(new Map(m.map(x => [x.recipe_id, x])));
  }, []);

  useEffect(() => {
    api.pantries.getAll().then(ps => {
      setPantries(ps);
      const def = ps.find(p => p.is_default) ?? ps[0];
      const pid = def?.id;
      setPantryId(pid);
      loadBundles(pid);
    });
    api.foods.getAll().then(setFoods);
  }, [loadBundles]);

  async function openDetail(id: number) {
    const r = await api.recipes.get(id);
    setDetail({ ...r, ingredients: r.ingredients?.map(i => ({ ...i, editGrams: i.grams })) });
    setDetailId(id);
  }

  async function saveDetail() {
    if (!detail?.ingredients) return;
    await api.recipes.updateIngredients({
      id: detail.id,
      ingredients: detail.ingredients.map(i => ({ food_id: i.food_id, grams: Number(i.editGrams) || i.grams })),
    });
    showToast('Bundle saved');
    setDetailId(null);
    setDetail(null);
    loadBundles();
  }

  async function openLogTarget(b: Recipe) {
    setLogTarget(b);
    setLogScale('1');
    setDeductOnLog(false);
    const check = await api.pantry.canMake(b.id, 'bundle', pantryId);
    setLogPantryCheck({ can_make: check.can_make, missing: check.missing });
  }

  function closeLogTarget() {
    setLogTarget(null);
    setLogPantryCheck(null);
    setDeductOnLog(false);
  }

  async function doLog() {
    if (!logTarget) return;
    const scale = parseFloat(logScale) || 1;
    await api.recipes.log({ recipe_id: logTarget.id, date: logDate, meal: logMeal, scale });
    if (deductOnLog) {
      try {
        const dr = await api.pantry.deductRecipe(logTarget.id, scale, 'bundle', pantryId);
        if (dr.shortages?.length > 0) {
          const list = dr.shortages.map(s => `${s.shortage}g of ${s.food_name}`).join(', ');
          showToast(`Logged — pantry short on: ${list}`, 'warning');
        } else {
          showToast('Logged & pantry updated');
        }
        if (dr.events?.length) pushDeduction(dr.events);
      } catch {
        showToast('Logged (pantry update failed)');
      }
    } else {
      showToast('Logged');
    }
    closeLogTarget();
    loadBundles();
  }

  async function doDelete() {
    if (!deleteTarget) return;
    await api.recipes.delete(deleteTarget.id);
    showToast('Bundle deleted');
    setDeleteTarget(null);
    loadBundles();
  }

  async function addMissingToShopping(bundleId: number) {
    const check = await api.pantry.canMake(bundleId, 'bundle', pantryId);
    if (!check.missing.length) { showToast('Nothing missing — pantry has everything'); return; }
    await Promise.all(check.missing.map(m => api.shopping.add({ food_id: m.food_id, quantity_g: Math.ceil(m.need_g - m.have_g), pantry_id: pantryId })));
    showToast(`Added ${check.missing.length} item${check.missing.length > 1 ? 's' : ''} to shopping list`);
  }

  const inputCls = 'w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent';
  const selCls   = 'rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent';

  const visibleBundles = canMakeFilter ? bundles.filter(b => canMakeMap.get(b.id)?.can_make) : bundles;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 28, letterSpacing: -1, color: 'var(--fb-text)', lineHeight: 1 }}>
            {visibleBundles.length}
          </span>
          <span style={{ ...serifItalic, fontSize: 14, color: 'var(--fb-text-3)' }}>
            {visibleBundles.length === 1 ? 'bundle' : 'bundles'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {pantries.length > 1 && (
            <select
              value={pantryId ?? ''}
              onChange={e => { const pid = Number(e.target.value); setPantryId(pid); loadBundles(pid); }}
              style={{ fontSize: 11, fontWeight: 600, background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 99, padding: '6px 14px', color: 'var(--fb-text-2)', outline: 'none', cursor: 'pointer' }}
            >
              {pantries.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button
            onClick={() => setCanMakeFilter(v => !v)}
            style={canMakeFilter
              ? { ...pillGhost, color: 'var(--fb-accent)', borderColor: 'var(--fb-accent)', background: 'var(--fb-accent-soft)' }
              : pillGhost}
          >
            Can make
          </button>
          <button onClick={() => setCreating(true)} style={pillPrimary}>+ New bundle</button>
        </div>
      </div>

      {visibleBundles.length === 0 ? (
        <EmptyState message={canMakeFilter ? 'No bundles you can make with current pantry.' : 'No bundles yet.'} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {visibleBundles.map(b => {
            const cm = canMakeMap.get(b.id);
            return (
              <div
                key={b.id}
                onClick={() => openDetail(b.id)}
                className="bundle-card"
                style={{
                  background: 'var(--fb-bg)',
                  border: '1px solid var(--fb-border)',
                  borderRadius: 18,
                  padding: 4,
                  cursor: 'pointer',
                  transition: 'transform .35s cubic-bezier(0.32,0.72,0,1), border-color .25s ease',
                }}
              >
                <div style={{
                  background: 'var(--fb-card)',
                  borderRadius: 14,
                  padding: 16,
                  display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ ...serifItalic, fontSize: 17, fontWeight: 400, color: 'var(--fb-text)', letterSpacing: -0.2 }}>{b.name}</span>
                        {cm && (
                          <span style={{
                            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
                            padding: '3px 9px', borderRadius: 99,
                            background: cm.can_make ? 'color-mix(in srgb, var(--fb-green) 14%, transparent)' : cm.missing_count <= 2 ? 'color-mix(in srgb, var(--fb-amber) 14%, transparent)' : 'color-mix(in srgb, var(--fb-red) 14%, transparent)',
                            color: cm.can_make ? 'var(--fb-green)' : cm.missing_count <= 2 ? 'var(--fb-amber)' : 'var(--fb-red)',
                            flexShrink: 0,
                          }}>
                            {cm.can_make ? '✓ ready' : `${cm.missing_count} missing`}
                          </span>
                        )}
                      </div>
                      {b.description && (
                        <p style={{ fontSize: 11.5, color: 'var(--fb-text-3)', margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {b.description}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => { e.stopPropagation(); openLogTarget(b); }}
                        style={{
                          padding: '6px 14px', borderRadius: 99,
                          background: 'var(--fb-accent-soft)', color: 'var(--fb-accent)',
                          border: '1px solid var(--fb-accent)',
                          fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                      >Log</button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteTarget(b); }}
                        aria-label="Delete"
                        style={{
                          width: 28, height: 28, borderRadius: 99,
                          background: 'transparent', color: 'var(--fb-text-3)',
                          border: '1px solid var(--fb-border-strong)',
                          fontSize: 11, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >✕</button>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
                    paddingTop: 8, borderTop: '1px solid var(--fb-divider)',
                  }}>
                    <MacroChip dot={MACRO_DOT.kcal}    value={`${n((b as unknown as Record<string,unknown>).total_calories ?? b.calories)}`} unit="kcal" emphasis />
                    <MacroChip dot={MACRO_DOT.protein} value={`${n((b as unknown as Record<string,unknown>).total_protein ?? b.protein)}`} unit="g P" />
                    <MacroChip dot={MACRO_DOT.carbs}   value={`${n((b as unknown as Record<string,unknown>).total_carbs ?? b.carbs)}`}     unit="g C" />
                    <MacroChip dot={MACRO_DOT.fat}     value={`${n((b as unknown as Record<string,unknown>).total_fat ?? b.fat)}`}         unit="g F" />
                    <span className="tnum" style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>{b.ingredient_count} items</span>
                    {cm && !cm.can_make && (
                      <button
                        onClick={e => { e.stopPropagation(); addMissingToShopping(b.id); }}
                        style={{
                          marginLeft: 'auto', fontSize: 10.5, fontWeight: 600,
                          padding: '4px 10px', borderRadius: 99,
                          border: '1px dashed var(--fb-border-strong)',
                          background: 'transparent', color: 'var(--fb-text-3)',
                          cursor: 'pointer',
                        }}
                      >+ shopping</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .bundle-card:hover { border-color: var(--fb-border-strong) !important; transform: translateY(-1px); }
      `}</style>

      {detailId !== null && detail && (
        <BundleDetailModal
          detail={detail}
          foods={foods}
          onClose={() => { setDetailId(null); setDetail(null); }}
          onSave={saveDetail}
          onChange={setDetail}
        />
      )}

      {creating && (
        <BundleCreateModal
          foods={foods}
          onClose={() => setCreating(false)}
          onCreate={async (data) => {
            await api.recipes.create(data);
            await api.recipes.getAll().then(setBundles);
            showToast('Bundle created');
            setCreating(false);
          }}
        />
      )}

      {logTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm mx-4 space-y-4">
            <h2 className="font-semibold text-text">Log "{logTarget.name}"</h2>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Scale (1 = full bundle)</label>
                <input type="text" inputMode="decimal" className={inputCls} value={logScale} step="0.1"
                  onChange={e => setLogScale(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Meal</label>
                <select className={`${selCls} w-full`} value={logMeal} onChange={e => setLogMeal(e.target.value as Meal)}>
                  {MEAL_ORDER.map(m => <option key={m} value={m}>{tMeal(m)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Date</label>
                <input type="date" className={inputCls} value={logDate} onChange={e => setLogDate(e.target.value)} />
              </div>
              {logPantryCheck && (
                <button
                  onClick={() => setDeductOnLog(v => !v)}
                  className={[
                    'w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg border transition-colors cursor-pointer',
                    deductOnLog
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-text-sec hover:border-accent/50',
                  ].join(' ')}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${deductOnLog ? 'border-accent bg-accent' : 'border-border'}`}>
                    {deductOnLog && <span className="text-white text-xs leading-none">✓</span>}
                  </span>
                  <span className="text-left">
                    Use from pantry
                    {!logPantryCheck.can_make && logPantryCheck.missing.length > 0 && (
                      <span className="ml-1 text-yellow"> (missing {logPantryCheck.missing.map(m => m.food_name).join(', ')})</span>
                    )}
                  </span>
                </button>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={closeLogTarget} className="px-4 py-2 rounded-xl text-sm text-text-sec border border-border hover:bg-card-hover cursor-pointer">Cancel</button>
              <button onClick={doLog} className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:opacity-90 cursor-pointer">Log</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete bundle "${deleteTarget.name}"?`}
          confirmLabel="Delete"
          dangerous
          onConfirm={doDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <DeductionEventModal
        event={deductionEvent}
        onDone={nextDeduction}
        pushMore={pushDeduction}
      />
    </div>
  );
}

function BundleDetailModal({ detail, foods, onClose, onSave, onChange }: {
  detail: Recipe;
  foods: Food[];
  onClose: () => void;
  onSave: () => void;
  onChange: (r: Recipe) => void;
}) {
  function updateGrams(idx: number, val: string) {
    const ings = [...(detail.ingredients ?? [])];
    ings[idx] = { ...ings[idx], editGrams: parseFloat(val) || 0 };
    onChange({ ...detail, ingredients: ings });
  }

  function removeIng(idx: number) {
    const ings = [...(detail.ingredients ?? [])];
    ings.splice(idx, 1);
    onChange({ ...detail, ingredients: ings });
  }

  function addIng(food: Food, g: number) {
    const newIng: RecipeIngredient = {
      id: 0, food_id: food.id, name: food.name, grams: g, editGrams: g,
      calories: food.calories * g / 100, protein: food.protein * g / 100,
      carbs: food.carbs * g / 100, fat: food.fat * g / 100, fiber: food.fiber * g / 100,
    };
    onChange({ ...detail, ingredients: [...(detail.ingredients ?? []), newIng] });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg mx-4 space-y-4 max-h-[85vh] overflow-y-auto">
        <h2 className="font-semibold text-text text-lg">{detail.name}</h2>
        <div className="space-y-2">
          {(detail.ingredients ?? []).map((ing, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-text truncate">{ing.name}</span>
              <input type="text" inputMode="decimal"
                className="w-20 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text focus:outline-none focus:border-accent text-right"
                value={ing.editGrams ?? ing.grams}
                onChange={e => updateGrams(i, e.target.value)} />
              <span className="text-xs text-text-sec">g</span>
              <button onClick={() => removeIng(i)} className="text-red text-xs hover:opacity-75 cursor-pointer">✕</button>
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-3">
          <AddFoodRow foods={foods} onAdd={addIng} />
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-text-sec border border-border hover:bg-card-hover cursor-pointer">Cancel</button>
          <button onClick={onSave} className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:opacity-90 cursor-pointer">Save</button>
        </div>
      </div>
    </div>
  );
}

function BundleCreateModal({ foods, onClose, onCreate, initial }: {
  foods: Food[];
  onClose: () => void;
  onCreate: (data: { name: string; description: string; ingredients: { food_id: number; grams: number }[] }) => Promise<void>;
  initial?: { name?: string; ingredients?: { food_id: number; name: string; grams: number }[] };
}) {
  const [name, setName]               = useState(initial?.name ?? '');
  const [desc, setDesc]               = useState('');
  const [ingredients, setIngredients] = useState<{ food_id: number; name: string; grams: number }[]>(initial?.ingredients ?? []);

  function addIng(food: Food, g: number) {
    setIngredients(prev => {
      const idx = prev.findIndex(x => x.food_id === food.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], grams: Math.round((next[idx].grams + g) * 100) / 100 };
        return next;
      }
      return [...prev, { food_id: food.id, name: food.name, grams: g }];
    });
  }

  const inputCls = 'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent';

  const foodsById = new Map(foods.map(f => [f.id, f]));
  const totals = ingredients.reduce((acc, ing) => {
    const f = foodsById.get(ing.food_id);
    if (!f) return acc;
    const r = ing.grams / 100;
    acc.cal     += f.calories * r;
    acc.protein += f.protein  * r;
    acc.carbs   += f.carbs    * r;
    acc.fat     += f.fat      * r;
    acc.fiber   += f.fiber    * r;
    return acc;
  }, { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col gap-5">
        <h2 className="font-semibold text-text text-xl">New Bundle</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Name" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <input className={inputCls} placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} />
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-text-sec bg-bg rounded-lg px-4 py-3 tabular-nums">
          <span><span className="text-text font-semibold text-sm">{Math.round(totals.cal)}</span> kcal</span>
          <span>F <span className="text-text font-medium">{Math.round(totals.fat * 100) / 100}</span>g</span>
          <span>C <span className="text-text font-medium">{Math.round(totals.carbs * 100) / 100}</span>g</span>
          <span>Fiber <span className="text-text font-medium">{Math.round(totals.fiber * 100) / 100}</span>g</span>
          <span>P <span className="text-text font-medium">{Math.round(totals.protein * 100) / 100}</span>g</span>
          <span className="ml-auto">{ingredients.length} {ingredients.length === 1 ? 'ingredient' : 'ingredients'}</span>
        </div>

        <div>
          <div className="text-xs font-semibold text-text-sec uppercase tracking-wider mb-2">Add ingredient</div>
          <AddFoodRow foods={foods} onAdd={addIng} />
        </div>

        <div>
          <div className="text-xs font-semibold text-text-sec uppercase tracking-wider mb-2">Ingredients</div>
          {ingredients.length === 0 ? (
            <p className="text-sm text-text-sec italic">No ingredients yet.</p>
          ) : (
            <div className="space-y-1 border border-border rounded-lg p-2 max-h-72 overflow-y-auto">
              {ingredients.map((ing, i) => {
                const f = foodsById.get(ing.food_id);
                const r = ing.grams / 100;
                return (
                  <div key={i} className="flex items-center gap-3 text-sm text-text px-2 py-1.5 hover:bg-card-hover rounded">
                    <span className="flex-1 truncate">{ing.name}</span>
                    <span className="text-text-sec tabular-nums w-16 text-right">{ing.grams}g</span>
                    <span className="text-text-sec tabular-nums w-16 text-right">{f ? Math.round(f.calories * r) : '—'} kcal</span>
                    <button onClick={() => setIngredients(p => p.filter((_, j) => j !== i))} className="text-red hover:opacity-75 cursor-pointer px-1">✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-text-sec border border-border hover:bg-card-hover cursor-pointer">Cancel</button>
          <button
            onClick={() => onCreate({ name, description: desc, ingredients })}
            disabled={!name || ingredients.length === 0}
            className="px-5 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >Create</button>
        </div>
      </div>
    </div>
  );
}

export default BundlesTab;
