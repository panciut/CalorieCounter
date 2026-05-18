import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useT } from '../i18n/useT';
import { useSettings } from '../hooks/useSettings';
import ConfirmDialog from '../components/ConfirmDialog';
import AddFoodRow from '../components/AddFoodRow';
import { today } from '../lib/dateUtil';
import { scaleNutrients } from '../lib/macroCalc';
import { MEAL_ORDER, type Recipe, type RecipeIngredient, type ActualRecipe, type ActualRecipeIngredient, type Food, type Meal, type PantryIngredientCheck } from '../types';
import { useDeductionEvents } from '../hooks/useDeductionEvents';
import { usePantry } from '../hooks/usePantry';
import DeductionEventModal from '../components/DeductionEventModal';
import Tabs from '../components/ui/Tabs';
import PageHeader from '../components/ui/PageHeader';
import PantryPicker from '../components/ui/PantryPicker';
import ModalFooter from '../components/ui/ModalFooter';

type PantryCheckResult = { can_make: boolean; missing: PantryIngredientCheck[] };

function n(v: unknown) { return Math.round(Number(v) || 0); }
function nf(v: unknown) { return Math.round((Number(v) || 0) * 10) / 10; }

function formatSalt(sodium_mg: unknown, unit: 'sodium' | 'salt'): string {
  const v = Number(sodium_mg);
  if (!v) return '0';
  return unit === 'salt'
    ? `${Math.round((v / 400) * 10) / 10}g`
    : `${Math.round(v)}mg`;
}

/** Inline macro row used across recipe cards/modals so fiber + extras render consistently. */
function MacroRow({
  cal, protein, carbs, fat, fiber, sugar, satFat, sodium,
  trackExtra, saltUnit, suffix,
}: {
  cal: number; protein: number; carbs: number; fat: number; fiber: number;
  sugar?: number | null; satFat?: number | null; sodium?: number | null;
  trackExtra: boolean; saltUnit: 'sodium' | 'salt';
  suffix?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 text-xs text-text-sec flex-wrap items-center tabular-nums">
      <span><span className="text-text font-semibold">{n(cal)}</span> kcal</span>
      <span>
        F {nf(fat)}g
        {trackExtra && satFat != null && <span className="ml-0.5 text-[10px] text-text-sec/60">({nf(satFat)}g)</span>}
      </span>
      <span>
        C {nf(carbs)}g
        {trackExtra && sugar != null && <span className="ml-0.5 text-[10px] text-text-sec/60">({nf(sugar)}g)</span>}
      </span>
      <span>Fib {nf(fiber)}g</span>
      <span>P {nf(protein)}g</span>
      {trackExtra && sodium != null && (
        <span>{saltUnit === 'salt' ? 'Salt' : 'Na'} {formatSalt(sodium, saltUnit)}</span>
      )}
      {suffix}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BUNDLES TAB (original recipes)
// ─────────────────────────────────────────────────────────────

function BundlesTab() {
  const { showToast } = useToast();
  const { t, tMeal } = useT();
  const { settings } = useSettings();
  const trackExtra = settings.track_extra_nutrition === 1;
  const saltUnit = (settings.extra_nutrition_unit ?? 'sodium') as 'sodium' | 'salt';
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
  const { activeId } = usePantry();
  const pantryId = activeId ?? undefined;

  const loadBundles = useCallback(async (pid?: number) => {
    const [b, m] = await Promise.all([
      api.recipes.getAll(),
      api.pantry.canMakeAll('bundle', pid),
    ]);
    setBundles(b);
    setCanMakeMap(new Map(m.map(x => [x.recipe_id, x])));
  }, []);

  useEffect(() => {
    if (pantryId == null) return;
    loadBundles(pantryId);
  }, [pantryId, loadBundles]);

  useEffect(() => {
    api.foods.getAll().then(setFoods);
  }, []);

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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-text-sec">Fixed-portion shortcuts — log a set of foods in one tap.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <PantryPicker variant="dropdown" />
          <button
            onClick={() => setCanMakeFilter(v => !v)}
            className={[
              'text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors',
              canMakeFilter
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-text-sec hover:border-accent/50',
            ].join(' ')}
          >
            🥗 Can make
          </button>
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            + New Bundle
          </button>
        </div>
      </div>

      {visibleBundles.length === 0 ? (
        <p className="text-text-sec text-center py-12 text-sm">
          {canMakeFilter ? 'No bundles you can make with current pantry.' : 'No bundles yet.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleBundles.map(b => {
            const cm = canMakeMap.get(b.id);
            return (
            <div
              key={b.id}
              onClick={() => openDetail(b.id)}
              className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:bg-card-hover transition-colors space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-text">{b.name}</h3>
                    {cm && (
                      <span className={[
                        'text-xs px-1.5 py-0.5 rounded font-medium shrink-0',
                        cm.can_make
                          ? 'bg-green/10 text-green'
                          : cm.missing_count <= 2
                            ? 'bg-yellow/10 text-yellow'
                            : 'bg-red/10 text-red',
                      ].join(' ')}>
                        {cm.can_make ? '✓ can make' : `${cm.missing_count} missing`}
                      </span>
                    )}
                  </div>
                  {b.description && <p className="text-xs text-text-sec mt-0.5">{b.description}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); openLogTarget(b); }}
                    className="px-2.5 py-1 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors cursor-pointer"
                  >Log</button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteTarget(b); }}
                    className="px-2.5 py-1 rounded-lg bg-red/10 text-red text-xs font-medium hover:bg-red/20 transition-colors cursor-pointer"
                  >Delete</button>
                </div>
              </div>
              <MacroRow
                cal={Number((b as unknown as Record<string,unknown>).total_calories ?? b.calories)}
                fat={Number((b as unknown as Record<string,unknown>).total_fat ?? b.fat)}
                carbs={Number((b as unknown as Record<string,unknown>).total_carbs ?? b.carbs)}
                fiber={Number((b as unknown as Record<string,unknown>).total_fiber ?? b.fiber)}
                protein={Number((b as unknown as Record<string,unknown>).total_protein ?? b.protein)}
                sugar={(b as unknown as Record<string,number|null>).total_sugar ?? b.sugar}
                satFat={(b as unknown as Record<string,number|null>).total_saturated_fat ?? b.saturated_fat}
                sodium={(b as unknown as Record<string,number|null>).total_sodium_mg ?? b.sodium_mg}
                trackExtra={trackExtra}
                saltUnit={saltUnit}
                suffix={
                  <>
                    <span>{b.ingredient_count} items</span>
                    {cm && !cm.can_make && (
                      <button
                        onClick={e => { e.stopPropagation(); addMissingToShopping(b.id); }}
                        className="ml-auto text-xs px-2 py-0.5 rounded border border-border text-text-sec hover:border-accent hover:text-accent cursor-pointer transition-colors"
                      >+ shopping list</button>
                    )}
                  </>
                }
              />
            </div>
            );
          })}
        </div>
      )}

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
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4">
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
            <ModalFooter
              onCancel={closeLogTarget}
              onConfirm={doLog}
              cancelLabel="Cancel"
              confirmLabel="Log"
            />
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete bundle "${deleteTarget.name}"?`}
          confirmLabel={t("common.delete")}
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
      ...scaleNutrients(food, g),
    };
    onChange({ ...detail, ingredients: [...(detail.ingredients ?? []), newIng] });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg mx-4 space-y-4 max-h-[85vh] overflow-y-auto">
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
        <ModalFooter
          onCancel={onClose}
          onConfirm={onSave}
          cancelLabel="Cancel"
          confirmLabel="Save"
          className="pt-1"
        />
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
        next[idx] = { ...next[idx], grams: Math.round((next[idx].grams + g) * 10) / 10 };
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
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col gap-5">
        <h2 className="font-semibold text-text text-xl">New Bundle</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Name" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <input className={inputCls} placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} />
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-text-sec bg-bg rounded-lg px-4 py-3 tabular-nums">
          <span><span className="text-text font-semibold text-sm">{Math.round(totals.cal)}</span> kcal</span>
          <span>F <span className="text-text font-medium">{Math.round(totals.fat * 10) / 10}</span>g</span>
          <span>C <span className="text-text font-medium">{Math.round(totals.carbs * 10) / 10}</span>g</span>
          <span>Fiber <span className="text-text font-medium">{Math.round(totals.fiber * 10) / 10}</span>g</span>
          <span>P <span className="text-text font-medium">{Math.round(totals.protein * 10) / 10}</span>g</span>
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

        <ModalFooter
          onCancel={onClose}
          onConfirm={() => onCreate({ name, description: desc, ingredients })}
          cancelLabel="Cancel"
          confirmLabel="Create"
          confirmDisabled={!name || ingredients.length === 0}
          className="pt-2 border-t border-border"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RECIPES TAB (actual recipes with yield)
// ─────────────────────────────────────────────────────────────

function RecipesTab() {
  const { showToast } = useToast();
  const { t, tMeal } = useT();
  const { settings } = useSettings();
  const trackExtra = settings.track_extra_nutrition === 1;
  const saltUnit = (settings.extra_nutrition_unit ?? 'sodium') as 'sodium' | 'salt';
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
  const { activeId: rActiveId } = usePantry();
  const pantryId = rActiveId ?? undefined;

  const loadRecipes = useCallback(async (pid?: number) => {
    const [r, m] = await Promise.all([
      api.actualRecipes.getAll(),
      api.pantry.canMakeAll('actual', pid),
    ]);
    setRecipes(r);
    setCanMakeMap(new Map(m.map(x => [x.recipe_id, x])));
  }, []);

  useEffect(() => {
    if (pantryId == null) return;
    loadRecipes(pantryId);
  }, [pantryId, loadRecipes]);

  useEffect(() => {
    api.foods.getAll().then(setFoods);
  }, []);

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

  const inputCls = 'w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent';
  const selCls   = 'rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent';

  const logPreview = (() => {
    if (!logTarget || !logTarget.yield_g || !logGrams) return null;
    const ratio = parseFloat(logGrams) / logTarget.yield_g;
    if (isNaN(ratio) || ratio <= 0) return null;
    const scale = (v: number | null | undefined) => v == null ? null : v * ratio;
    return {
      cal:     logTarget.total_calories * ratio,
      protein: logTarget.total_protein  * ratio,
      carbs:   logTarget.total_carbs    * ratio,
      fat:     logTarget.total_fat      * ratio,
      fiber:   logTarget.total_fiber    * ratio,
      sugar:   scale(logTarget.total_sugar),
      satFat:  scale(logTarget.total_saturated_fat),
      sodium:  scale(logTarget.total_sodium_mg),
    };
  })();

  const visibleRecipes = canMakeFilter ? recipes.filter(r => canMakeMap.get(r.id)?.can_make) : recipes;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-text-sec">Full recipes with yield — log by how much you ate.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <PantryPicker variant="dropdown" />
          <button
            onClick={() => setCanMakeFilter(v => !v)}
            className={[
              'text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors',
              canMakeFilter
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-text-sec hover:border-accent/50',
            ].join(' ')}
          >
            🥗 Can make
          </button>
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            + New Recipe
          </button>
        </div>
      </div>

      {visibleRecipes.length === 0 ? (
        <p className="text-text-sec text-center py-12 text-sm">
          {canMakeFilter ? 'No recipes you can make with current pantry.' : 'No recipes yet.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleRecipes.map(r => {
            const cm = canMakeMap.get(r.id);
            return (
            <div
              key={r.id}
              onClick={() => openDetail(r.id)}
              className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:bg-card-hover transition-colors space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-text">{r.name}</h3>
                    {cm && (
                      <span className={[
                        'text-xs px-1.5 py-0.5 rounded font-medium shrink-0',
                        cm.can_make
                          ? 'bg-green/10 text-green'
                          : cm.missing_count <= 2
                            ? 'bg-yellow/10 text-yellow'
                            : 'bg-red/10 text-red',
                      ].join(' ')}>
                        {cm.can_make ? '✓ can make' : `${cm.missing_count} missing`}
                      </span>
                    )}
                  </div>
                  {r.description && <p className="text-xs text-text-sec mt-0.5">{r.description}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); openLogTarget(r); }}
                    className="px-2.5 py-1 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors cursor-pointer"
                  >Log</button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteTarget(r); }}
                    className="px-2.5 py-1 rounded-lg bg-red/10 text-red text-xs font-medium hover:bg-red/20 transition-colors cursor-pointer"
                  >Delete</button>
                </div>
              </div>
              <MacroRow
                cal={r.total_calories}
                fat={r.total_fat}
                carbs={r.total_carbs}
                fiber={r.total_fiber}
                protein={r.total_protein}
                sugar={r.total_sugar}
                satFat={r.total_saturated_fat}
                sodium={r.total_sodium_mg}
                trackExtra={trackExtra}
                saltUnit={saltUnit}
                suffix={
                  <>
                    {r.yield_g > 0 && <span>Yield {r.yield_g}g</span>}
                    {(r.prep_time_min > 0 || r.cook_time_min > 0) && (
                      <span>{r.prep_time_min + r.cook_time_min} min</span>
                    )}
                    {cm && !cm.can_make && (
                      <button
                        onClick={e => { e.stopPropagation(); addMissingToShopping(r.id); }}
                        className="ml-auto text-xs px-2 py-0.5 rounded border border-border text-text-sec hover:border-accent hover:text-accent cursor-pointer transition-colors"
                      >+ shopping list</button>
                    )}
                  </>
                }
              />
            </div>
            );
          })}
        </div>
      )}

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
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4">
            <h2 className="font-semibold text-text">Log "{logTarget.name}"</h2>
            <p className="text-xs text-text-sec">Total yield: {logTarget.yield_g}g</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-text-sec">How much did you eat? (g)</label>
                <input type="text" inputMode="decimal" className={inputCls} value={logGrams} placeholder="grams eaten"
                  onChange={e => setLogGrams(e.target.value)} />
              </div>
              {logPreview && (
                <div className="rounded-lg bg-bg border border-border px-3 py-2">
                  <MacroRow
                    cal={logPreview.cal}
                    fat={logPreview.fat}
                    carbs={logPreview.carbs}
                    fiber={logPreview.fiber}
                    protein={logPreview.protein}
                    sugar={logPreview.sugar}
                    satFat={logPreview.satFat}
                    sodium={logPreview.sodium}
                    trackExtra={trackExtra}
                    saltUnit={saltUnit}
                  />
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
            <ModalFooter
              onCancel={() => { setLogTarget(null); setLogPantryCheck(null); }}
              onConfirm={doLog}
              cancelLabel="Cancel"
              confirmLabel="Log"
            />
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete recipe "${deleteTarget.name}"?`}
          confirmLabel={t("common.delete")}
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
  const { settings } = useSettings();
  const trackExtra = settings.track_extra_nutrition === 1;
  const saltUnit = (settings.extra_nutrition_unit ?? 'sodium') as 'sodium' | 'salt';
  const [detail, setDetail] = useState<ActualRecipe>(initialDetail);
  const [tab, setTab]       = useState<'ingredients' | 'procedure' | 'details'>('ingredients');

  const foodsById = new Map(foods.map(f => [f.id, f]));

  const totals = (detail.ingredients ?? []).reduce((acc, ing) => {
    acc.cal     += ing.calories;
    acc.protein += ing.protein;
    acc.carbs   += ing.carbs;
    acc.fat     += ing.fat;
    acc.fiber   += ing.fiber ?? 0;
    if (ing.sugar         != null) acc.sugar   += ing.sugar;
    if (ing.saturated_fat != null) acc.satFat  += ing.saturated_fat;
    if (ing.sodium_mg     != null) acc.sodium  += ing.sodium_mg;
    return acc;
  }, { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, satFat: 0, sodium: 0 });

  const totalRawGrams = (detail.ingredients ?? []).reduce((s, i) => s + i.grams, 0);

  function updateIngGrams(idx: number, val: string) {
    const g = parseFloat(val) || 0;
    const ings = [...(detail.ingredients ?? [])];
    const f = foodsById.get(ings[idx].food_id);
    const scaled = f ? scaleNutrients(f, g) : { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    ings[idx] = { ...ings[idx], grams: g, ...scaled };
    setDetail(d => ({ ...d, ingredients: ings }));
  }

  function removeIng(idx: number) {
    setDetail(d => ({ ...d, ingredients: (d.ingredients ?? []).filter((_, i) => i !== idx) }));
  }

  function addIng(food: Food, g: number) {
    const newIng: ActualRecipeIngredient = {
      id: 0, food_id: food.id, name: food.name, grams: g,
      ...scaleNutrients(food, g),
    };
    setDetail(d => ({ ...d, ingredients: [...(d.ingredients ?? []), newIng] }));
  }

  const inputCls = 'w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent';
  const TABS = [
    { id: 'ingredients', label: 'Ingredients' },
    { id: 'procedure',   label: 'Procedure' },
    { id: 'details',     label: 'Details' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col gap-4">
        {/* Header fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className={inputCls} value={detail.name}
            onChange={e => setDetail(d => ({ ...d, name: e.target.value }))} placeholder="Recipe name" autoFocus />
          <input className={inputCls} value={detail.description ?? ''}
            onChange={e => setDetail(d => ({ ...d, description: e.target.value }))} placeholder="Description (optional)" />
        </div>

        {/* Macro totals bar */}
        <div className="bg-bg rounded-lg px-4 py-3">
          <MacroRow
            cal={totals.cal} fat={totals.fat} carbs={totals.carbs}
            fiber={totals.fiber} protein={totals.protein}
            sugar={trackExtra ? totals.sugar : null}
            satFat={trackExtra ? totals.satFat : null}
            sodium={trackExtra ? totals.sodium : null}
            trackExtra={trackExtra} saltUnit={saltUnit}
            suffix={
              <>
                {totalRawGrams > 0 && <span className="ml-auto">Raw {Math.round(totalRawGrams)}g</span>}
                <span className={(totalRawGrams > 0 ? '' : 'ml-auto')}>{(detail.ingredients ?? []).length} ingredients</span>
              </>
            }
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={[
                'px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px',
                tab === t.id ? 'border-accent text-accent' : 'border-transparent text-text-sec hover:text-text',
              ].join(' ')}>
              {t.label}
            </button>
          ))}
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
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Yield (g cooked)</label>
                <input type="text" inputMode="decimal" className={inputCls} value={detail.yield_g || ''}
                  placeholder="e.g. 800"
                  onChange={e => setDetail(d => ({ ...d, yield_g: parseFloat(e.target.value) || 0 }))} />
              </div>
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

        <ModalFooter
          onCancel={onClose}
          onConfirm={() => onSave(detail)}
          cancelLabel="Cancel"
          confirmLabel="Save"
          className="pt-1 border-t border-border"
        />
      </div>
    </div>
  );
}

function RecipeCreateModal({ foods, onClose, onCreate }: {
  foods: Food[];
  onClose: () => void;
  onCreate: (data: { name: string; description: string; yield_g: number; notes: string; prep_time_min: number; cook_time_min: number; tools: string; procedure: string; ingredients: { food_id: number; grams: number }[] }) => Promise<void>;
}) {
  const { settings } = useSettings();
  const trackExtra = settings.track_extra_nutrition === 1;
  const saltUnit = (settings.extra_nutrition_unit ?? 'sodium') as 'sodium' | 'salt';
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
        next[idx] = { ...next[idx], grams: Math.round((next[idx].grams + g) * 10) / 10 };
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
    acc.fiber   += (f.fiber ?? 0) * r;
    if (f.sugar         != null) acc.sugar  += f.sugar         * r;
    if (f.saturated_fat != null) acc.satFat += f.saturated_fat * r;
    if (f.sodium_mg     != null) acc.sodium += f.sodium_mg     * r;
    return acc;
  }, { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, satFat: 0, sodium: 0 });

  const TABS = [
    { id: 'ingredients', label: 'Ingredients' },
    { id: 'procedure',   label: 'Procedure' },
    { id: 'details',     label: 'Details' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col gap-5">
        <h2 className="font-semibold text-text text-xl">New Recipe</h2>

        {/* Header fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Name" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <input className={inputCls} placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} />
        </div>

        {/* Macro totals bar */}
        <div className="bg-bg rounded-lg px-4 py-3">
          <MacroRow
            cal={totals.cal} fat={totals.fat} carbs={totals.carbs}
            fiber={totals.fiber} protein={totals.protein}
            sugar={trackExtra ? totals.sugar : null}
            satFat={trackExtra ? totals.satFat : null}
            sodium={trackExtra ? totals.sodium : null}
            trackExtra={trackExtra} saltUnit={saltUnit}
            suffix={<span className="ml-auto">{ingredients.length} {ingredients.length === 1 ? 'ingredient' : 'ingredients'}</span>}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={[
                'px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px',
                tab === t.id ? 'border-accent text-accent' : 'border-transparent text-text-sec hover:text-text',
              ].join(' ')}>
              {t.label}
            </button>
          ))}
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
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-text-sec">Yield (g cooked)</label>
                <input type="text" inputMode="decimal" className={inputCls} placeholder="e.g. 800" value={yieldG} onChange={e => setYieldG(e.target.value)} />
              </div>
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

        <ModalFooter
          onCancel={onClose}
          onConfirm={() => onCreate({
            name, description: desc,
            yield_g: parseFloat(yieldG) || 0,
            notes,
            prep_time_min: parseInt(prepTime) || 0,
            cook_time_min: parseInt(cookTime) || 0,
            tools, procedure,
            ingredients,
          })}
          cancelLabel="Cancel"
          confirmLabel="Create"
          confirmDisabled={!name || ingredients.length === 0}
          className="pt-2 border-t border-border"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE ROOT
// ─────────────────────────────────────────────────────────────

type Tab = 'recipes' | 'bundles';

export default function RecipesPage() {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState<Tab>('recipes');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader eyebrow={t('eyebrow.recipes')} title={t('page.recipes')} />

      <Tabs<Tab>
        items={[{ id: 'recipes', label: 'Recipes' }, { id: 'bundles', label: 'Bundles' }]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'recipes' ? <RecipesTab /> : <BundlesTab />}
    </div>
  );
}
