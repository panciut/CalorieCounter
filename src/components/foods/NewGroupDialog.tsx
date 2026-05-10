import { useMemo, useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../i18n/useT';
import { useToast } from '../Toast';
import { api } from '../../api';
import type { Food, FoodCategory } from '../../types';
import { FOOD_CATEGORIES } from '../../types';

interface Props {
  /** Foods that can become the initial variants — typically the solos list. */
  candidates: Food[];
  onClose: () => void;
  onCreated: () => void;
}

/** Create a new generic canonical from scratch. Optionally pick existing solo
 *  foods as the initial variants — their macros are averaged for the canonical.
 *  When no variants are picked, the user supplies the macros directly. */
export default function NewGroupDialog({ candidates, onClose, onCreated }: Props) {
  const { t } = useT();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<FoodCategory>('other');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());

  // Manual macros (used only when no variants are picked)
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? candidates.filter(f => f.name.toLowerCase().includes(q)) : candidates;
    return list.slice(0, 100);
  }, [candidates, search]);

  const pickedFoods = useMemo(
    () => candidates.filter(f => picked.has(f.id)),
    [candidates, picked],
  );

  function togglePick(id: number) {
    setPicked(p => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);

    let avgMacros = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    if (pickedFoods.length > 0) {
      const sum = (k: keyof typeof avgMacros) =>
        pickedFoods.reduce((s, f) => s + ((f as unknown as Record<string, number>)[k] || 0), 0);
      const n = pickedFoods.length;
      avgMacros = {
        calories: Math.round(sum('calories') / n * 100) / 100,
        protein:  Math.round(sum('protein')  / n * 100) / 100,
        carbs:    Math.round(sum('carbs')    / n * 100) / 100,
        fat:      Math.round(sum('fat')      / n * 100) / 100,
        fiber:    Math.round(sum('fiber')    / n * 100) / 100,
      };
    } else {
      avgMacros = {
        calories: parseFloat(calories) || 0,
        protein:  parseFloat(protein)  || 0,
        carbs:    parseFloat(carbs)    || 0,
        fat:      parseFloat(fat)      || 0,
        fiber:    parseFloat(fiber)    || 0,
      };
    }

    try {
      const r = await api.foods.add({
        name: name.trim(),
        calories: avgMacros.calories,
        protein:  avgMacros.protein,
        carbs:    avgMacros.carbs,
        fat:      avgMacros.fat,
        fiber:    avgMacros.fiber,
        piece_grams: null,
        is_liquid: 0,
        category,
        group_id: null,
      });
      const newId = r.id;
      for (const f of pickedFoods) {
        await api.foods.groupAs({ variant_id: f.id, canonical_id: newId, recompute: false });
      }
      if (pickedFoods.length > 0) {
        await api.foods.recomputeGroupAverages(newId);
      }
      showToast(t('common.saved'));
      onCreated();
    } catch (e) {
      const msg = (e as Error).message;
      if (/UNIQUE/i.test(msg)) setError(t('foods.promoteNameTaken'));
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={t('foods.newGroupTitle')}>
      <div className="space-y-3">
        {/* Name + category */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="space-y-1 sm:col-span-2 block">
            <span className="text-xs text-text-sec">{t('foods.promoteNameLabel')}</span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Latte, Yogurt, Tonno"
              className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-text outline-none focus:border-accent"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs text-text-sec">{t('foods.category')}</span>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as FoodCategory)}
              className="w-full bg-bg border border-border rounded-lg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
            >
              {FOOD_CATEGORIES.map(c => (
                <option key={c} value={c}>{t(`food.category.${c}`)}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Variant picker */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-sec uppercase tracking-wider">{t('foods.newGroupPickVariants')}</span>
            <span className="text-xs text-text-sec tabular-nums">{picked.size} {t('foods.selected')}</span>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('foods.searchPlaceholder')}
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-text outline-none focus:border-accent"
          />
          <div className="border border-border rounded-lg max-h-[260px] overflow-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-text-sec/70 italic">{t('foods.noCandidates')}</p>
            ) : (
              <ul className="divide-y divide-border/30">
                {filtered.map(f => (
                  <li key={f.id}>
                    <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-bg/40">
                      <input
                        type="checkbox"
                        checked={picked.has(f.id)}
                        onChange={() => togglePick(f.id)}
                        className="cursor-pointer accent-accent"
                      />
                      <span className="text-sm text-text">{f.name}</span>
                      <span className="text-[10px] text-text-sec/70 ml-auto tabular-nums">
                        {Math.round(f.calories)} kcal
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Manual macros — only when nothing is picked */}
        {picked.size === 0 && (
          <div className="space-y-1.5">
            <span className="text-xs text-text-sec uppercase tracking-wider">{t('foods.newGroupManualMacros')}</span>
            <div className="grid grid-cols-5 gap-2">
              {[
                { v: calories, set: setCalories, label: 'kcal' },
                { v: protein,  set: setProtein,  label: 'P' },
                { v: carbs,    set: setCarbs,    label: 'C' },
                { v: fat,      set: setFat,      label: 'F' },
                { v: fiber,    set: setFiber,    label: 'Fib' },
              ].map((f, i) => (
                <label key={i} className="space-y-1 block">
                  <span className="text-[10px] text-text-sec uppercase">{f.label}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={f.v}
                    onChange={e => f.set(e.target.value)}
                    placeholder="0"
                    className="w-full bg-bg border border-border rounded-lg px-2 py-1 text-sm text-text outline-none focus:border-accent text-center tabular-nums"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            onClick={onClose}
            className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text cursor-pointer transition-colors"
          >{t('common.cancel')}</button>
          <button
            onClick={handleCreate}
            disabled={busy || !name.trim()}
            className="text-sm bg-accent text-white rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-40 cursor-pointer transition-opacity"
          >
            {busy ? '…'
              : picked.size > 0
                ? t('foods.newGroupCreateWith').replace('{n}', String(picked.size))
                : t('foods.newGroupCreateEmpty')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
