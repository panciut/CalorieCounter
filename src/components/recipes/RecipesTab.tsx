import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import { useToast } from '../Toast';
import { useT } from '../../i18n/useT';
import ConfirmDialog from '../ConfirmDialog';
import AddFoodRow from '../AddFoodRow';
import { today } from '../../lib/dateUtil';
import { MEAL_ORDER, type ActualRecipe, type ActualRecipeIngredient, type Food, type Meal, type PantryIngredientCheck, type PantryLocation } from '../../types';
import { useDeductionEvents } from '../../hooks/useDeductionEvents';
import DeductionEventModal from '../DeductionEventModal';
import { serifItalic, pillPrimary, pillGhost, EmptyState, MACRO_DOT, MacroChip } from '../../lib/fbUI';
import { estimateCookedYield } from '../../lib/cookingYield';

type PantryCheckResult = { can_make: boolean; missing: PantryIngredientCheck[] };

function n(v: unknown) { return Math.round(Number(v) || 0); }
function nf(v: unknown) { return Math.round((Number(v) || 0) * 100) / 100; }

function RecipesTab() {
  const { showToast } = useToast();
  const { tMeal } = useT();
  const { current: deductionEvent, next: nextDeduction, push: pushDeduction } = useDeductionEvents();
  const [recipes, setRecipes]           = useState<ActualRecipe[]>([]);
  const [foods, setFoods]               = useState<Food[]>([]);
  const [detailId, setDetailId]         = useState<number | null>(null);
  const [detail, setDetail]             = useState<ActualRecipe | null>(null);
  const [creating, setCreating]         = useState(false);
  const [logTarget, setLogTarget]       = useState<ActualRecipe | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActualRecipe | null>(null);
  const [logGrams, setLogGrams]         = useState('');
  const [logMeal, setLogMeal]           = useState<Meal>('Lunch');
  const [logDate, setLogDate]           = useState(today());
  const [canMakeFilter, setCanMakeFilter] = useState(false);
  const [canMakeMap, setCanMakeMap]       = useState<Map<number, { can_make: boolean; missing_count: number }>>(new Map());
  const [logPantryCheck, setLogPantryCheck] = useState<PantryCheckResult | null>(null);
  const [deductOnLog, setDeductOnLog]     = useState(false);
  const [pantries, setPantries]           = useState<PantryLocation[]>([]);
  const [pantryId, setPantryId]           = useState<number | undefined>(undefined);

  const loadRecipes = useCallback(async (pid?: number) => {
    const [r, m] = await Promise.all([
      api.actualRecipes.getAll(),
      api.pantry.canMakeAll('actual', pid),
    ]);
    setRecipes(r);
    setCanMakeMap(new Map(m.map(x => [x.recipe_id, x])));
  }, []);

  useEffect(() => {
    api.pantries.getAll().then(ps => {
      setPantries(ps);
      const def = ps.find(p => p.is_default) ?? ps[0];
      const pid = def?.id;
      setPantryId(pid);
      loadRecipes(pid);
    });
    api.foods.getAll().then(setFoods);
  }, [loadRecipes]);

  async function openDetail(id: number) {
    const r = await api.actualRecipes.get(id);
    setDetail(r);
    setDetailId(id);
  }

  async function saveDetail(updated: ActualRecipe) {
    await api.actualRecipes.update({
      id: updated.id,
      name: updated.name,
      description: updated.description ?? '',
      yield_g: updated.yield_g,
      notes: updated.notes ?? '',
      prep_time_min: updated.prep_time_min ?? 0,
      cook_time_min: updated.cook_time_min ?? 0,
      tools: updated.tools ?? '',
      procedure: updated.procedure ?? '',
    });
    if (updated.ingredients) {
      await api.actualRecipes.updateIngredients({
        id: updated.id,
        ingredients: updated.ingredients.map(i => ({ food_id: i.food_id, grams: i.grams })),
      });
    }
    showToast('Recipe saved');
    setDetailId(null);
    setDetail(null);
    loadRecipes(pantryId);
  }

  async function openLogTarget(r: ActualRecipe) {
    setLogTarget(r);
    setLogGrams(String(r.yield_g || ''));
    setDeductOnLog(false);
    const check = await api.pantry.canMake(r.id, 'actual', pantryId);
    setLogPantryCheck({ can_make: check.can_make, missing: check.missing });
  }

  async function doLog() {
    if (!logTarget) return;
    const g = parseFloat(logGrams);
    if (!g || g <= 0) return;
    const scale = logTarget.yield_g > 0 ? g / logTarget.yield_g : 1;
    await api.actualRecipes.log({ recipe_id: logTarget.id, grams_eaten: g, meal: logMeal, date: logDate });
    if (deductOnLog && logTarget.yield_g > 0) {
      const dr = await api.pantry.deductRecipe(logTarget.id, scale, 'actual', pantryId);
      if (dr.shortages?.length > 0) {
        const list = dr.shortages.map(s => `${s.shortage}g of ${s.food_name}`).join(', ');
        showToast(`Logged — pantry short on: ${list}`, 'warning');
      } else {
        showToast('Logged & pantry updated');
      }
      if (dr.events?.length) pushDeduction(dr.events);
    } else {
      showToast('Logged');
    }
    setLogTarget(null);
    setLogGrams('');
    setLogPantryCheck(null);
    loadRecipes(pantryId);
  }

  async function doDelete() {
    if (!deleteTarget) return;
    await api.actualRecipes.delete(deleteTarget.id);
    setRecipes(r => r.filter(x => x.id !== deleteTarget.id));
    showToast('Recipe deleted');
    setDeleteTarget(null);
  }

  async function addMissingToShopping(recipeId: number) {
    const check = await api.pantry.canMake(recipeId, 'actual', pantryId);
    if (!check.missing.length) { showToast('Nothing missing — pantry has everything'); return; }
    await Promise.all(check.missing.map(m => api.shopping.add({ food_id: m.food_id, quantity_g: Math.ceil(m.need_g - m.have_g), pantry_id: pantryId })));
    showToast(`Added ${check.missing.length} item${check.missing.length > 1 ? 's' : ''} to shopping list`);
  }

  const inputCls = 'w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text outline-none focus:border-accent transition-colors';
  const selCls   = 'rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent';

  const logPreview = (() => {
    if (!logTarget || !logTarget.yield_g || !logGrams) return null;
    const ratio = parseFloat(logGrams) / logTarget.yield_g;
    if (isNaN(ratio) || ratio <= 0) return null;
    return {
      cal:     n(logTarget.total_calories * ratio),
      protein: nf(logTarget.total_protein * ratio),
      carbs:   nf(logTarget.total_carbs * ratio),
      fat:     nf(logTarget.total_fat * ratio),
    };
  })();

  const visibleRecipes = canMakeFilter ? recipes.filter(r => canMakeMap.get(r.id)?.can_make) : recipes;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 28, letterSpacing: -1, color: 'var(--fb-text)', lineHeight: 1 }}>
            {visibleRecipes.length}
          </span>
          <span style={{ ...serifItalic, fontSize: 14, color: 'var(--fb-text-3)' }}>
            {visibleRecipes.length === 1 ? 'recipe' : 'recipes'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {pantries.length > 1 && (
            <select
              value={pantryId ?? ''}
              onChange={e => { const pid = Number(e.target.value); setPantryId(pid); loadRecipes(pid); }}
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
          <button onClick={() => setCreating(true)} style={pillPrimary}>
            + New recipe
          </button>
        </div>
      </div>

      {visibleRecipes.length === 0 ? (
        <EmptyState message={canMakeFilter ? 'No recipes you can make with current pantry.' : 'No recipes yet.'} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {visibleRecipes.map(r => {
            const cm = canMakeMap.get(r.id);
            return (
              <div
                key={r.id}
                onClick={() => openDetail(r.id)}
                className="recipe-card"
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
                        <span style={{ ...serifItalic, fontSize: 17, fontWeight: 400, color: 'var(--fb-text)', letterSpacing: -0.2 }}>{r.name}</span>
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
                      {r.description && (
                        <p style={{ fontSize: 11.5, color: 'var(--fb-text-3)', margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {r.description}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => { e.stopPropagation(); openLogTarget(r); }}
                        style={{
                          padding: '6px 14px', borderRadius: 99,
                          background: 'var(--fb-accent-soft)', color: 'var(--fb-accent)',
                          border: '1px solid var(--fb-accent)',
                          fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          transition: 'all .25s ease',
                        }}
                      >Log</button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteTarget(r); }}
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
                    <MacroChip dot={MACRO_DOT.kcal} value={`${n(r.total_calories)}`} unit="kcal" emphasis />
                    <MacroChip dot={MACRO_DOT.protein} value={`${n(r.total_protein)}`} unit="g P" />
                    <MacroChip dot={MACRO_DOT.carbs}   value={`${n(r.total_carbs)}`}   unit="g C" />
                    <MacroChip dot={MACRO_DOT.fat}     value={`${n(r.total_fat)}`}     unit="g F" />
                    {r.yield_g > 0 && (
                      <span className="tnum" style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>yield {r.yield_g}g</span>
                    )}
                    {(r.prep_time_min > 0 || r.cook_time_min > 0) && (
                      <span className="tnum" style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>{r.prep_time_min + r.cook_time_min} min</span>
                    )}
                    {cm && !cm.can_make && (
                      <button
                        onClick={e => { e.stopPropagation(); addMissingToShopping(r.id); }}
                        style={{
                          marginLeft: 'auto', fontSize: 10.5, fontWeight: 600,
                          padding: '4px 10px', borderRadius: 99,
                          border: '1px dashed var(--fb-border-strong)',
                          background: 'transparent', color: 'var(--fb-text-3)',
                          cursor: 'pointer',
                          transition: 'all .25s ease',
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
        .recipe-card:hover { border-color: var(--fb-border-strong) !important; transform: translateY(-1px); }
      `}</style>

      {detailId !== null && detail && (
        <RecipeDetailModal
          detail={detail}
          foods={foods}
          onClose={() => { setDetailId(null); setDetail(null); }}
          onSave={saveDetail}
        />
      )}

      {creating && (
        <RecipeCreateModal
          foods={foods}
          onClose={() => setCreating(false)}
          onCreate={async (data) => {
            await api.actualRecipes.create(data);
            showToast('Recipe created');
            setCreating(false);
            loadRecipes();
          }}
        />
      )}

      {logTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div style={{ background: 'var(--fb-card)', border: '1px solid var(--fb-border-strong)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400, margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-accent)', marginBottom: 2 }}>Log recipe</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 17, color: 'var(--fb-text)' }}>{logTarget.name}</div>
              <div style={{ fontSize: 11, color: 'var(--fb-text-3)', marginTop: 2 }}>Total yield: {logTarget.yield_g}g</div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-text-sec">How much did you eat? (g)</label>
                <input type="text" inputMode="decimal" className={inputCls} value={logGrams} placeholder="grams eaten"
                  onChange={e => setLogGrams(e.target.value)} />
              </div>
              {logPreview && (
                <div className="flex gap-3 text-xs rounded-lg bg-bg border border-border px-3 py-2">
                  <span className="text-text font-medium">{logPreview.cal} kcal</span>
                  <span className="text-text-sec">F {logPreview.fat}g</span>
                  <span className="text-text-sec">C {logPreview.carbs}g</span>
                  <span className="text-text-sec">P {logPreview.protein}g</span>
                </div>
              )}
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
              {logTarget.yield_g > 0 && logPantryCheck && (
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
                  <span>
                    Use from pantry
                    {!logPantryCheck.can_make && logPantryCheck.missing.length > 0 && (
                      <span className="ml-1 text-yellow"> (missing {logPantryCheck.missing.map(m => m.food_name).join(', ')})</span>
                    )}
                  </span>
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setLogTarget(null); setLogPantryCheck(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid var(--fb-border-strong)', color: 'var(--fb-text-2)', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-body)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={doLog} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--fb-accent)', color: 'white', border: 0, padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer' }}>Log</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete recipe "${deleteTarget.name}"?`}
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

function RecipeDetailModal({ detail: initialDetail, foods, onClose, onSave }: {
  detail: ActualRecipe;
  foods: Food[];
  onClose: () => void;
  onSave: (r: ActualRecipe) => void;
}) {
  const [detail, setDetail] = useState<ActualRecipe>(initialDetail);
  const [tab, setTab]       = useState<'ingredients' | 'procedure' | 'details'>('ingredients');

  const foodsById = new Map(foods.map(f => [f.id, f]));

  const totals = (detail.ingredients ?? []).reduce((acc, ing) => {
    acc.cal     += ing.calories;
    acc.protein += ing.protein;
    acc.carbs   += ing.carbs;
    acc.fat     += ing.fat;
    return acc;
  }, { cal: 0, protein: 0, carbs: 0, fat: 0 });

  const totalRawGrams = (detail.ingredients ?? []).reduce((s, i) => s + i.grams, 0);

  function updateIngGrams(idx: number, val: string) {
    const g = parseFloat(val) || 0;
    const ings = [...(detail.ingredients ?? [])];
    const f = foodsById.get(ings[idx].food_id);
    ings[idx] = { ...ings[idx], grams: g,
      calories: f ? f.calories * g / 100 : 0,
      protein:  f ? f.protein  * g / 100 : 0,
      carbs:    f ? f.carbs    * g / 100 : 0,
      fat:      f ? f.fat      * g / 100 : 0,
      fiber:    f ? f.fiber    * g / 100 : 0,
    };
    setDetail(d => ({ ...d, ingredients: ings }));
  }

  function removeIng(idx: number) {
    setDetail(d => ({ ...d, ingredients: (d.ingredients ?? []).filter((_, i) => i !== idx) }));
  }

  function addIng(food: Food, g: number) {
    const newIng: ActualRecipeIngredient = {
      id: 0, food_id: food.id, name: food.name, grams: g,
      calories: food.calories * g / 100, protein: food.protein * g / 100,
      carbs: food.carbs * g / 100, fat: food.fat * g / 100, fiber: food.fiber * g / 100,
    };
    setDetail(d => ({ ...d, ingredients: [...(d.ingredients ?? []), newIng] }));
  }

  const inputCls = 'w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text outline-none focus:border-accent transition-colors';
  const TABS = [
    { id: 'ingredients', label: 'Ingredients' },
    { id: 'procedure',   label: 'Procedure' },
    { id: 'details',     label: 'Details' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div style={{ background: 'var(--fb-card)', border: '1px solid var(--fb-border-strong)', borderRadius: 14, padding: 24, width: '100%', maxWidth: '42rem', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.7)', fontFamily: 'var(--font-body)' }}>
        {/* Header fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className={inputCls} value={detail.name}
            onChange={e => setDetail(d => ({ ...d, name: e.target.value }))} placeholder="Recipe name" autoFocus />
          <input className={inputCls} value={detail.description ?? ''}
            onChange={e => setDetail(d => ({ ...d, description: e.target.value }))} placeholder="Description (optional)" />
        </div>

        {/* Yield — fundamental for logging by total weight */}
        {(() => {
          const est = estimateCookedYield((detail.ingredients ?? []).map(i => {
            const f = foodsById.get(i.food_id);
            return { name: i.name, grams: i.grams, is_liquid: f?.is_liquid };
          }));
          const canEstimate = (detail.ingredients ?? []).length > 0;
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              background: detail.yield_g > 0 ? 'var(--fb-bg)' : 'color-mix(in srgb, var(--fb-amber) 10%, transparent)',
              border: `1px solid ${detail.yield_g > 0 ? 'var(--fb-border)' : 'var(--fb-amber)'}`,
              borderRadius: 12, padding: '10px 14px',
            }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: detail.yield_g > 0 ? 'var(--fb-accent)' : 'var(--fb-amber)', marginBottom: 2 }}>
                  Cooked yield {detail.yield_g > 0 ? '' : '— required'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>
                  Total cooked weight. Needed to log by grams eaten and scale ingredients.
                </div>
              </div>
              {canEstimate && (
                <button
                  type="button"
                  onClick={() => setDetail(d => ({ ...d, yield_g: est.total_g }))}
                  title={`Estimate from ${est.matched_count}/${est.total_count} recognized ingredients`}
                  style={{ fontSize: 11, fontWeight: 600, padding: '6px 12px', borderRadius: 99, border: '1px dashed var(--fb-border-strong)', background: 'transparent', color: 'var(--fb-text-2)', cursor: 'pointer' }}
                >
                  Estimate ≈ {est.total_g}g
                </button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <input type="text" inputMode="decimal"
                  className="tnum"
                  style={{ width: 80, textAlign: 'right', borderRadius: 8, border: '1px solid var(--fb-border-strong)', background: 'var(--fb-card)', padding: '6px 10px', fontSize: 14, fontWeight: 600, color: 'var(--fb-text)', outline: 'none' }}
                  value={detail.yield_g || ''}
                  placeholder="e.g. 800"
                  onChange={e => setDetail(d => ({ ...d, yield_g: parseFloat(e.target.value) || 0 }))} />
                <span style={{ fontSize: 12, color: 'var(--fb-text-3)', fontWeight: 600 }}>g</span>
              </div>
            </div>
          );
        })()}

        {/* Macro totals bar */}
        <div className="flex flex-wrap gap-4 text-xs text-text-sec bg-bg rounded-lg px-4 py-3 tabular-nums">
          <span><span className="text-text font-semibold text-sm">{Math.round(totals.cal)}</span> kcal</span>
          <span>P <span className="text-text font-medium">{Math.round(totals.protein * 100) / 100}</span>g</span>
          <span>C <span className="text-text font-medium">{Math.round(totals.carbs * 100) / 100}</span>g</span>
          <span>F <span className="text-text font-medium">{Math.round(totals.fat * 100) / 100}</span>g</span>
          {totalRawGrams > 0 && <span className="ml-auto">Raw {Math.round(totalRawGrams)}g</span>}
          <span className={(totalRawGrams > 0 ? '' : 'ml-auto')}>{(detail.ingredients ?? []).length} ingredients</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 16, padding: 3, alignSelf: 'flex-start' }}>
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '4px 14px', borderRadius: 12, fontSize: 11.5, fontWeight: 600, border: active ? '1px solid var(--fb-border-strong)' : '1px solid transparent', background: active ? 'var(--fb-card)' : 'transparent', color: active ? 'var(--fb-text)' : 'var(--fb-text-2)', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.12s' }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Ingredients tab */}
        {tab === 'ingredients' && (
          <div className="space-y-3">
            {(detail.ingredients ?? []).length > 0 && (
              <div className="space-y-1 border border-border rounded-lg p-2 max-h-52 overflow-y-auto">
                {(detail.ingredients ?? []).map((ing, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 hover:bg-card-hover rounded text-sm text-text">
                    <span className="flex-1 truncate">{ing.name}</span>
                    <input type="text" inputMode="decimal"
                      className="w-20 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text focus:outline-none focus:border-accent text-right"
                      value={ing.grams} onChange={e => updateIngGrams(i, e.target.value)} />
                    <span className="text-xs text-text-sec w-4">g</span>
                    <span className="text-xs text-text-sec w-16 text-right tabular-nums">{Math.round(ing.calories)} kcal</span>
                    <button onClick={() => removeIng(i)} className="text-red text-xs hover:opacity-75 cursor-pointer px-1">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-border pt-3">
              <div className="text-xs font-semibold text-text-sec uppercase tracking-wider mb-2">Add ingredient</div>
              <AddFoodRow foods={foods} onAdd={addIng} />
            </div>
          </div>
        )}

        {/* Procedure tab */}
        {tab === 'procedure' && (
          <textarea
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent resize-y"
            rows={12}
            placeholder={"1. ...\n2. ...\n3. ..."}
            value={detail.procedure ?? ''}
            onChange={e => setDetail(d => ({ ...d, procedure: e.target.value }))}
          />
        )}

        {/* Details tab */}
        {tab === 'details' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Prep time (min)</label>
                <input type="text" inputMode="decimal" className={inputCls} value={detail.prep_time_min || ''}
                  placeholder="e.g. 15"
                  onChange={e => setDetail(d => ({ ...d, prep_time_min: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Cook time (min)</label>
                <input type="text" inputMode="decimal" className={inputCls} value={detail.cook_time_min || ''}
                  placeholder="e.g. 30"
                  onChange={e => setDetail(d => ({ ...d, cook_time_min: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-sec">Required tools (one per line)</label>
              <textarea
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent resize-none"
                rows={4}
                placeholder={"Chef's knife\nLarge skillet\nMixing bowl"}
                value={detail.tools ?? ''}
                onChange={e => setDetail(d => ({ ...d, tools: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-sec">Notes / tips</label>
              <textarea
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent resize-none"
                rows={3}
                placeholder="Storage tips, variations, allergens…"
                value={detail.notes ?? ''}
                onChange={e => setDetail(d => ({ ...d, notes: e.target.value }))}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1 border-t border-border">
          <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', border: '1px solid var(--fb-border-strong)', color: 'var(--fb-text-2)', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-body)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onSave(detail)} style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--fb-accent)', color: 'white', border: 0, padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function RecipeCreateModal({ foods, onClose, onCreate }: {
  foods: Food[];
  onClose: () => void;
  onCreate: (data: { name: string; description: string; yield_g: number; notes: string; prep_time_min: number; cook_time_min: number; tools: string; procedure: string; ingredients: { food_id: number; grams: number }[] }) => Promise<void>;
}) {
  const [name, setName]               = useState('');
  const [desc, setDesc]               = useState('');
  const [yieldG, setYieldG]           = useState('');
  const [prepTime, setPrepTime]       = useState('');
  const [cookTime, setCookTime]       = useState('');
  const [tools, setTools]             = useState('');
  const [procedure, setProcedure]     = useState('');
  const [notes, setNotes]             = useState('');
  const [ingredients, setIngredients] = useState<{ food_id: number; name: string; grams: number }[]>([]);
  const [tab, setTab]                 = useState<'ingredients' | 'procedure' | 'details'>('ingredients');

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
    return acc;
  }, { cal: 0, protein: 0, carbs: 0, fat: 0 });

  const TABS = [
    { id: 'ingredients', label: 'Ingredients' },
    { id: 'procedure',   label: 'Procedure' },
    { id: 'details',     label: 'Details' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div style={{ background: 'var(--fb-card)', border: '1px solid var(--fb-border-strong)', borderRadius: 14, padding: 24, width: '100%', maxWidth: '48rem', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.7)', fontFamily: 'var(--font-body)' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-accent)', marginBottom: 2 }}>Create</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 20, color: 'var(--fb-text)' }}>New Recipe</div>
        </div>

        {/* Header fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Name" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <input className={inputCls} placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} />
        </div>

        {/* Yield — fundamental for logging by total weight */}
        {(() => {
          const yNum = parseFloat(yieldG) || 0;
          const est = estimateCookedYield(ingredients.map(i => {
            const f = foodsById.get(i.food_id);
            return { name: i.name, grams: i.grams, is_liquid: f?.is_liquid };
          }));
          const canEstimate = ingredients.length > 0;
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              background: yNum > 0 ? 'var(--fb-bg)' : 'color-mix(in srgb, var(--fb-amber) 10%, transparent)',
              border: `1px solid ${yNum > 0 ? 'var(--fb-border)' : 'var(--fb-amber)'}`,
              borderRadius: 12, padding: '10px 14px',
            }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: yNum > 0 ? 'var(--fb-accent)' : 'var(--fb-amber)', marginBottom: 2 }}>
                  Cooked yield {yNum > 0 ? '' : '— required'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>
                  Total cooked weight. Needed to log by grams eaten and scale ingredients.
                </div>
              </div>
              {canEstimate && (
                <button
                  type="button"
                  onClick={() => setYieldG(String(est.total_g))}
                  title={`Estimate from ${est.matched_count}/${est.total_count} recognized ingredients`}
                  style={{ fontSize: 11, fontWeight: 600, padding: '6px 12px', borderRadius: 99, border: '1px dashed var(--fb-border-strong)', background: 'transparent', color: 'var(--fb-text-2)', cursor: 'pointer' }}
                >
                  Estimate ≈ {est.total_g}g
                </button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <input type="text" inputMode="decimal"
                  className="tnum"
                  style={{ width: 80, textAlign: 'right', borderRadius: 8, border: '1px solid var(--fb-border-strong)', background: 'var(--fb-card)', padding: '6px 10px', fontSize: 14, fontWeight: 600, color: 'var(--fb-text)', outline: 'none' }}
                  placeholder="e.g. 800" value={yieldG} onChange={e => setYieldG(e.target.value)} />
                <span style={{ fontSize: 12, color: 'var(--fb-text-3)', fontWeight: 600 }}>g</span>
              </div>
            </div>
          );
        })()}

        {/* Macro totals bar */}
        <div className="flex flex-wrap gap-4 text-xs text-text-sec bg-bg rounded-lg px-4 py-3 tabular-nums">
          <span><span className="text-text font-semibold text-sm">{Math.round(totals.cal)}</span> kcal</span>
          <span>P <span className="text-text font-medium">{Math.round(totals.protein * 100) / 100}</span>g</span>
          <span>C <span className="text-text font-medium">{Math.round(totals.carbs * 100) / 100}</span>g</span>
          <span>F <span className="text-text font-medium">{Math.round(totals.fat * 100) / 100}</span>g</span>
          <span className="ml-auto">{ingredients.length} {ingredients.length === 1 ? 'ingredient' : 'ingredients'}</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 16, padding: 3, alignSelf: 'flex-start' }}>
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '4px 14px', borderRadius: 12, fontSize: 11.5, fontWeight: 600, border: active ? '1px solid var(--fb-border-strong)' : '1px solid transparent', background: active ? 'var(--fb-card)' : 'transparent', color: active ? 'var(--fb-text)' : 'var(--fb-text-2)', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.12s' }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Ingredients tab */}
        {tab === 'ingredients' && (
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-text-sec uppercase tracking-wider mb-2">Add ingredient</div>
              <AddFoodRow foods={foods} onAdd={addIng} />
            </div>
            {ingredients.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-text-sec uppercase tracking-wider mb-2">Ingredients</div>
                <div className="space-y-1 border border-border rounded-lg p-2 max-h-64 overflow-y-auto">
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
              </div>
            )}
          </div>
        )}

        {/* Procedure tab */}
        {tab === 'procedure' && (
          <textarea
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent resize-y"
            rows={12}
            placeholder={"1. ...\n2. ...\n3. ..."}
            value={procedure}
            onChange={e => setProcedure(e.target.value)}
          />
        )}

        {/* Details tab */}
        {tab === 'details' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Prep time (min)</label>
                <input type="text" inputMode="decimal" className={inputCls} placeholder="e.g. 15" value={prepTime} onChange={e => setPrepTime(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Cook time (min)</label>
                <input type="text" inputMode="decimal" className={inputCls} placeholder="e.g. 30" value={cookTime} onChange={e => setCookTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-sec">Required tools (one per line)</label>
              <textarea
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent resize-none"
                rows={4}
                placeholder={"Chef's knife\nLarge skillet\nMixing bowl"}
                value={tools}
                onChange={e => setTools(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-sec">Notes / tips</label>
              <textarea
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent resize-none"
                rows={3}
                placeholder="Storage tips, variations, allergens…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2 border-t border-border">
          <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', border: '1px solid var(--fb-border-strong)', color: 'var(--fb-text-2)', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-body)', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={() => onCreate({
              name, description: desc,
              yield_g: parseFloat(yieldG) || 0,
              notes,
              prep_time_min: parseInt(prepTime) || 0,
              cook_time_min: parseInt(cookTime) || 0,
              tools, procedure,
              ingredients,
            })}
            disabled={!name || ingredients.length === 0 || !(parseFloat(yieldG) > 0)}
            style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--fb-accent)', color: 'white', border: 0, padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer', opacity: (!name || ingredients.length === 0 || !(parseFloat(yieldG) > 0)) ? 0.4 : 1 }}
          >Create</button>
        </div>
      </div>
    </div>
  );
}

export default RecipesTab;
