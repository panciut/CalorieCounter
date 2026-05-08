import { useState, useEffect, useMemo, useRef } from 'react';
import { useT } from '../i18n/useT';
import { useToast } from '../components/Toast';
import { useSettings } from '../hooks/useSettings';
import { api } from '../api';
import BarcodeScanner from '../components/BarcodeScanner';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import FoodSearch from '../components/FoodSearch';
import type { SearchItem } from '../components/FoodSearch';
import CollapsibleSection from '../components/dashboard/CollapsibleSection';
import Tabs from '../components/ui/Tabs';
import PageHeader from '../components/ui/PageHeader';
import OffSuggestions from '../components/OffSuggestions';
import FoodMatchModal, { type Candidate } from '../components/FoodMatchModal';
import GroupWithDialog from '../components/foods/GroupWithDialog';
import { checkMacroConsistency } from '../lib/macroCheck';
import type { Food, BarcodeResult, FoodPackage, FoodCategory } from '../types';
import { FOOD_CATEGORIES } from '../types';

const INPUT_CLASS =
  'bg-bg border border-border rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-accent w-full';

// Calorie share per macro (must sum to 1.0); fiber added as g/100kcal
const PRESETS = {
  balanced:    { proteinPct: 0.25, carbsPct: 0.50, fatPct: 0.25, fiberPer100: 2.5 },
  highProtein: { proteinPct: 0.40, carbsPct: 0.20, fatPct: 0.40, fiberPer100: 1.0 },
  highCarb:    { proteinPct: 0.10, carbsPct: 0.80, fatPct: 0.10, fiberPer100: 3.0 },
  highFat:     { proteinPct: 0.20, carbsPct: 0.05, fatPct: 0.75, fiberPer100: 1.0 },
  vegetable:   { proteinPct: 0.15, carbsPct: 0.65, fatPct: 0.20, fiberPer100: 6.0 },
} as const;
type PresetKey = keyof typeof PRESETS;

interface FoodFormState {
  name: string; calories: string; protein: string; carbs: string;
  fat: string; fiber: string; piece_grams: string; is_liquid: boolean; is_bulk: boolean; barcode: string;
  opened_days: string; discard_threshold_pct: string; price_per_100g: string;
  sugar: string; saturated_fat: string;
  /** User-entered sodium-mg OR salt-g; converted to sodium_mg at save based on settings.extra_nutrition_unit. */
  sodium_or_salt: string;
  category: FoodCategory;
}

const emptyForm = (): FoodFormState => ({ name:'', calories:'', protein:'', carbs:'', fat:'', fiber:'', piece_grams:'', is_liquid: false, is_bulk: true, barcode: '', opened_days: '7', discard_threshold_pct: '5', price_per_100g: '', sugar: '', saturated_fat: '', sodium_or_salt: '', category: 'other' });
const foodToForm = (f: Food, unit: 'sodium' | 'salt'): FoodFormState => ({
  name:f.name, calories:String(f.calories), protein:String(f.protein), carbs:String(f.carbs), fat:String(f.fat), fiber:String(f.fiber),
  piece_grams:f.piece_grams!=null?String(f.piece_grams):'',
  is_liquid:f.is_liquid===1, is_bulk: f.is_bulk===1,
  barcode: f.barcode ?? '',
  opened_days: f.opened_days != null ? String(f.opened_days) : '',
  discard_threshold_pct: f.discard_threshold_pct != null ? String(f.discard_threshold_pct) : '5',
  price_per_100g: f.price_per_100g != null ? String(f.price_per_100g) : '',
  sugar: f.sugar != null ? String(f.sugar) : '',
  saturated_fat: f.saturated_fat != null ? String(f.saturated_fat) : '',
  sodium_or_salt: f.sodium_mg != null
    ? (unit === 'salt' ? String(Math.round((f.sodium_mg / 400) * 100) / 100) : String(f.sodium_mg))
    : '',
  category: f.category ?? 'other',
});
const barcodeToForm = (r: BarcodeResult, barcode: string, unit: 'sodium' | 'salt'): FoodFormState => {
  const cat = ((r as BarcodeResult & { category?: FoodCategory }).category) || 'other';
  return {
    name:r.name, calories:String(r.calories), protein:String(r.protein), carbs:String(r.carbs), fat:String(r.fat), fiber:String(r.fiber),
    piece_grams:'', is_liquid:r.is_liquid===1, is_bulk: false, barcode, opened_days: '7', discard_threshold_pct: '5', price_per_100g: '',
    sugar: r.sugar != null ? String(r.sugar) : '',
    saturated_fat: r.saturated_fat != null ? String(r.saturated_fat) : '',
    sodium_or_salt: r.sodium_mg != null
      ? (unit === 'salt' ? String(Math.round((r.sodium_mg / 400) * 100) / 100) : String(r.sodium_mg))
      : '',
    category: cat,
  };
};
const formToData = (f: FoodFormState, unit: 'sodium' | 'salt'): Omit<Food,'id'> => {
  const sodiumRaw = f.sodium_or_salt.trim();
  const sodium_mg = sodiumRaw === ''
    ? null
    : (unit === 'salt' ? parseFloat(sodiumRaw) * 400 : parseFloat(sodiumRaw));
  return ({
    name:f.name.trim(), calories:parseFloat(f.calories)||0, protein:parseFloat(f.protein)||0, carbs:parseFloat(f.carbs)||0, fat:parseFloat(f.fat)||0, fiber:parseFloat(f.fiber)||0,
    piece_grams: f.is_bulk ? null : (f.piece_grams!==''?parseFloat(f.piece_grams):null),
    is_liquid:f.is_liquid?1:0, is_bulk: f.is_bulk?1:0,
    barcode: f.barcode.trim() || null,
    opened_days: f.opened_days !== '' ? parseInt(f.opened_days, 10) : null,
    discard_threshold_pct: parseFloat(f.discard_threshold_pct) || 5,
    price_per_100g: f.price_per_100g !== '' ? parseFloat(f.price_per_100g) : null,
    sugar: f.sugar.trim() === '' ? null : parseFloat(f.sugar),
    saturated_fat: f.saturated_fat.trim() === '' ? null : parseFloat(f.saturated_fat),
    sodium_mg: sodium_mg != null && !isNaN(sodium_mg) ? sodium_mg : null,
    category: f.category,
  });
};

// ── FormFields for table edit row (multi-line) ────────────────────────────────

interface FormFieldsProps {
  form: FoodFormState;
  patch: (p: Partial<FoodFormState>) => void;
  trackExtra?: boolean;
  unit?: 'sodium' | 'salt';
}

// Per-macro accent color used for the dot beside each label
const MACRO_DOT: Record<string, string> = {
  calories:    'var(--accent)',
  fat:         'var(--macro-fat)',
  carbs:       'var(--macro-carbs)',
  fiber:       'var(--macro-fiber)',
  protein:     'var(--macro-protein)',
  piece_grams: 'var(--text-sec)',
};

function Switch({ checked, onChange, label, title }: { checked: boolean; onChange: (v: boolean) => void; label: string; title?: string }) {
  return (
    <label
      title={title}
      className="inline-flex items-center gap-2 text-xs text-text-sec cursor-pointer select-none"
    >
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-[18px] rounded-full transition-colors duration-300 shrink-0 border ${
          checked ? 'bg-accent border-accent' : 'bg-bg border-border'
        }`}
      >
        <span
          className="absolute top-[1px] w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-[left] duration-300"
          style={{ left: checked ? '15px' : '1px' }}
        />
      </span>
      {label}
    </label>
  );
}

function FormFields({ form, patch, trackExtra = false, unit = 'sodium' }: FormFieldsProps) {
  const { t } = useT();
  const FIELD_CLS = 'bg-bg border border-border rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-accent w-full text-center font-semibold tabular-nums';
  const LABEL_CLS = 'flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase text-text-sec/80';
  const macros: { key: keyof FoodFormState; label: string }[] = [
    { key: 'calories', label: 'kcal' },
    { key: 'fat',      label: t('th.fat') },
    { key: 'carbs',    label: t('th.carbs') },
    { key: 'fiber',    label: t('th.fiber') },
    { key: 'protein',  label: t('th.protein') },
    { key: 'piece_grams', label: t('foods.piecePlaceholder') },
  ];
  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={form.name}
        onChange={e => patch({ name: e.target.value })}
        placeholder={t('foods.namePlaceholder')}
        className="bg-transparent border-0 border-b border-border focus:border-accent outline-none text-text text-lg italic pb-1.5 w-full"
        style={{ fontFamily: 'var(--font-family-serif)' }}
      />
      <div className="grid grid-cols-6 gap-2">
        {macros.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1 min-w-0">
            <span className={LABEL_CLS}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: MACRO_DOT[key] }} />
              <span className="truncate">{label}</span>
            </span>
            <input type="text" inputMode="decimal" value={(form as unknown as Record<string,string>)[key]} onChange={e => patch({ [key]: e.target.value })} placeholder="0" className={FIELD_CLS} />
          </div>
        ))}
      </div>
      {trackExtra && (
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1">
            <span className={LABEL_CLS}><span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--macro-carbs)' }} />{t('nutrition.sugar')} (g)</span>
            <input type="text" inputMode="decimal" value={form.sugar} onChange={e => patch({ sugar: e.target.value })} placeholder="0" className={FIELD_CLS} />
          </div>
          <div className="flex flex-col gap-1">
            <span className={LABEL_CLS}><span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--macro-fat)' }} />{t('nutrition.saturatedFat')} (g)</span>
            <input type="text" inputMode="decimal" value={form.saturated_fat} onChange={e => patch({ saturated_fat: e.target.value })} placeholder="0" className={FIELD_CLS} />
          </div>
          <div className="flex flex-col gap-1">
            <span className={LABEL_CLS}><span className="w-1.5 h-1.5 rounded-full shrink-0 bg-text-sec/60" />
              {unit === 'salt' ? `${t('nutrition.salt')} (g)` : `${t('nutrition.sodium')} (mg)`}
            </span>
            <input type="text" inputMode="decimal" value={form.sodium_or_salt} onChange={e => patch({ sodium_or_salt: e.target.value })} placeholder="0" className={FIELD_CLS} />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        <Switch checked={form.is_liquid} onChange={v => patch({ is_liquid: v })} label={`${t('foods.liquid')} 💧`} />
        <Switch checked={form.is_bulk}   onChange={v => patch({ is_bulk: v, piece_grams: v ? '' : form.piece_grams })} label={`${t('foods.bulk')} ⚖️`} title={t('foods.bulkHelp')} />
        <label className="flex items-center gap-1.5 text-xs text-text-sec ml-auto">
          {t('foods.category')}
          <select
            value={form.category}
            onChange={e => patch({ category: e.target.value as FoodCategory })}
            className="bg-bg border border-border rounded-lg px-2 py-1 text-text text-xs outline-none focus:border-accent"
          >
            {FOOD_CATEGORIES.map(c => (
              <option key={c} value={c}>{t(`food.category.${c}`)}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

// ── FoodsPage ─────────────────────────────────────────────────────────────────

type FoodsTab = 'foods' | 'packs';

export default function FoodsPage() {
  const { t } = useT();
  const { showToast } = useToast();
  const { settings } = useSettings();
  const trackExtra = settings.track_extra_nutrition === 1;
  const unit = (settings.extra_nutrition_unit ?? 'sodium') as 'sodium' | 'salt';

  const [foods, setFoods] = useState<Food[]>([]);
  const [addForm, setAddForm] = useState<FoodFormState>(emptyForm());
  const [addPacks, setAddPacks] = useState<{ grams: string }[]>([{ grams: '' }]);
  const [packFromBarcode, setPackFromBarcode] = useState<number | null>(null);
  const [editId, setEditId] = useState<number|null>(null);
  const [editForm, setEditForm] = useState<FoodFormState>(emptyForm());
  const [newPackGrams, setNewPackGrams] = useState('');
  const [newPackPrice, setNewPackPrice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<FoodCategory | 'all'>('all');
  const [groupWithFood, setGroupWithFood] = useState<Food | null>(null);
  const [confirmUngroupId, setConfirmUngroupId] = useState<number | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeStatus, setBarcodeStatus] = useState<'found'|'notFound'|null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [formOpenSignal, setFormOpenSignal] = useState(0);
  const [detailMode, setDetailMode] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deletePackId, setDeletePackId] = useState<number | null>(null);
  const [tab, setTab] = useState<FoodsTab>('foods');
  const [packFood, setPackFood] = useState<Food | null>(null);
  const [packGramsInput, setPackGramsInput] = useState('');
  const [packUnit, setPackUnit] = useState<'g' | 'pcs'>('g');
  const [packSearchKey, setPackSearchKey] = useState(0);
  const packGramsRef = useRef<HTMLInputElement>(null);
  const [macroFailDialog, setMacroFailDialog] = useState<
    | { kind: 'add'; expected: number; actual: number }
    | { kind: 'edit'; food: Food; expected: number; actual: number }
    | null
  >(null);
  const [matchModal, setMatchModal] = useState<
    | { kind: 'add-suggestion'; candidates: Candidate[] }
    | { kind: 'edit-find'; food: Food; candidates: Candidate[] }
    | null
  >(null);


  useEffect(() => { loadFoods(); }, []);

  async function loadFoods() { setFoods(await api.foods.getAll()); }

  function patchAdd(p: Partial<FoodFormState>) { setAddForm(f=>({...f,...p})); }
  function patchEdit(p: Partial<FoodFormState>) { setEditForm(f=>({...f,...p})); }

  async function handleAdd(skipMacroCheck = false, skipDidYouMean = false) {
    if (!addForm.name.trim() || !addForm.calories) return;
    const data = formToData(addForm, unit);
    if (!skipMacroCheck) {
      const chk = checkMacroConsistency(data.calories, data.protein, data.carbs, data.fat, data.fiber);
      if (chk.level === 'fail') {
        setMacroFailDialog({ kind: 'add', expected: chk.expected, actual: chk.actual });
        return;
      }
      if (chk.level === 'warn') showToast(`${t('foods.macroWarn')} (~${Math.round(chk.expected)} kcal)`, 'error');
    }
    if (!skipDidYouMean && !data.barcode) {
      try {
        const cands = await api.openfoodfacts.findCandidates({
          name: data.name,
          calories: data.calories, protein: data.protein, carbs: data.carbs, fat: data.fat,
          nameMin: 0.2, macroPct: 0.05, requireKcalConsistent: true,
        });
        if (cands.length > 0) {
          setMatchModal({ kind: 'add-suggestion', candidates: cands });
          return;
        }
      } catch { /* network err — fall through to save */ }
    }
    // Look for similar canonicals among existing foods. If found, the new food
    // is created normally and we offer to make it a variant via GroupWithDialog.
    let similarHits: number = 0;
    try {
      const sims = await api.foods.findSimilar({
        name: data.name,
        calories: data.calories, protein: data.protein, carbs: data.carbs, fat: data.fat,
        nameMin: 0.4, macroPctMax: 0.20, limit: 1,
      });
      similarHits = sims.length;
    } catch { /* non-fatal */ }
    const { id } = await api.foods.add(data);
    for (const p of addPacks) {
      const g = parseFloat(p.grams);
      if (g > 0) await api.foods.addPackage({ food_id: id, grams: g });
    }
    setAddForm(emptyForm()); setAddPacks([{ grams: '' }]); setPackFromBarcode(null); setBarcodeInput(''); setBarcodeStatus(null); showToast(t('common.saved'));
    await loadFoods();
    if (similarHits > 0) {
      // Re-fetch the newly-saved food row so GroupWithDialog has the actual id.
      const fresh = await api.foods.getAll();
      const newFood = fresh.find(f => f.id === id);
      if (newFood) setGroupWithFood(newFood);
    }
  }

  function updateAddPackGrams(i: number, grams: string) { setAddPacks(p => p.map((x, idx) => idx === i ? { grams } : x)); }
  function removeAddPack(i: number) { setAddPacks(p => p.filter((_, idx) => idx !== i)); }
  function addBlankAddPack() { setAddPacks(p => [...p, { grams: '' }]); }

  function applyBarcodeResult(r: BarcodeResult, barcode: string) {
    setAddForm(barcodeToForm(r, barcode, unit));
    setBarcodeStatus('found');
    setFormOpenSignal(s => s + 1);
    const allBlank = addPacks.every(p => !p.grams);
    if (r.pack_grams && allBlank) {
      const g = Math.round(r.pack_grams);
      setAddPacks([{ grams: String(g) }]);
      setPackFromBarcode(g);
    } else {
      setPackFromBarcode(null);
    }
  }

  async function handleAddPack() {
    const g = parseFloat(newPackGrams);
    if (!g || g <= 0 || !editId) return;
    const price = newPackPrice !== '' ? parseFloat(newPackPrice) : null;
    await api.foods.addPackage({ food_id: editId, grams: g, price: price && price > 0 ? price : null });
    setNewPackGrams('');
    setNewPackPrice('');
    loadFoods();
  }

  async function handleDeletePack(id: number) {
    const res = await api.foods.deletePackage(id);
    setDeletePackId(null);
    if (!res.ok && res.error === 'pack_in_use') {
      showToast(t('foods.packInUse').replace('{n}', String(res.batch_count ?? 0)), 'error');
      return;
    }
    loadFoods();
  }

  async function handleBarcodeLookup() {
    if (!barcodeInput.trim()) return;
    setBarcodeStatus(null);
    setPackFromBarcode(null);
    const r = await api.barcode.lookup(barcodeInput.trim());
    if (r) applyBarcodeResult(r, barcodeInput.trim());
    else setBarcodeStatus('notFound');
  }

  async function handleScanResult(barcode: string) {
    setScannerOpen(false); setBarcodeInput(barcode); setBarcodeStatus(null); setPackFromBarcode(null);
    const r = await api.barcode.lookup(barcode);
    if (r) applyBarcodeResult(r, barcode);
    else setBarcodeStatus('notFound');
  }

  function startEdit(food: Food) { setEditId(food.id); setEditForm(foodToForm(food, unit)); }
  function cancelEdit() { setEditId(null); }

  async function handleFindOffMatch(food: Food) {
    const data = formToData(editForm, unit);
    try {
      const cands = await api.openfoodfacts.findCandidates({
        name: data.name,
        calories: data.calories, protein: data.protein, carbs: data.carbs, fat: data.fat,
        nameMin: 0.2, macroPct: 0.10, requireKcalConsistent: true,
      });
      if (cands.length === 0) {
        showToast(t('foods.noOffMatch'), 'error');
        return;
      }
      setMatchModal({ kind: 'edit-find', food, candidates: cands });
    } catch {
      showToast(t('foods.noOffMatch'), 'error');
    }
  }

  function applyOffCandidate(c: BarcodeResult) {
    // Reuse barcodeToForm so all fields (sugar/sat-fat/sodium/pack/etc) are filled.
    const next = barcodeToForm(c, c.barcode || '', unit);
    // Preserve user-edited fields the candidate doesn't override (opened_days, price, etc.)
    setEditForm(prev => ({
      ...next,
      opened_days: prev.opened_days || next.opened_days,
      discard_threshold_pct: prev.discard_threshold_pct || next.discard_threshold_pct,
      price_per_100g: prev.price_per_100g || next.price_per_100g,
    }));
  }

  async function handleSaveEdit(food: Food, skipMacroCheck = false) {
    const data = formToData(editForm, unit);
    if (!skipMacroCheck) {
      const chk = checkMacroConsistency(data.calories, data.protein, data.carbs, data.fat, data.fiber);
      if (chk.level === 'fail') {
        setMacroFailDialog({ kind: 'edit', food, expected: chk.expected, actual: chk.actual });
        return;
      }
      if (chk.level === 'warn') showToast(`${t('foods.macroWarn')} (~${Math.round(chk.expected)} kcal)`, 'error');
    }
    await api.foods.update({ ...data, id: food.id, favorite: food.favorite });
    showToast(t('common.saved')); cancelEdit(); loadFoods();
  }

  async function handleDelete(id: number) { await api.foods.delete(id); setDeleteId(null); loadFoods(); }
  async function handleToggleFavorite(id: number) { await api.foods.toggleFavorite(id); loadFoods(); }

  async function handleAddPackToFood() {
    const v = parseFloat(packGramsInput);
    if (!packFood || !v || v <= 0) return;
    const grams = packUnit === 'pcs' && packFood.piece_grams ? v * packFood.piece_grams : v;
    await api.foods.addPackage({ food_id: packFood.id, grams });
    setPackGramsInput('');
    setPackFood(null);
    setPackSearchKey(k => k + 1);
    loadFoods();
  }

  async function handleImport() {
    const filePath = await api.import.selectFile();
    if (!filePath) return;
    try {
      const { imported, skipped } = await api.import.foods(filePath);
      showToast(`${t('import.success').replace('{n}', String(imported)).replace('{s}', String(skipped))}`);
      loadFoods();
    } catch { showToast(t('import.error')); }
  }

  const filteredFoods = useMemo(()=>{
    const q = searchQuery.toLowerCase();
    let list = foods;
    if (categoryFilter !== 'all') list = list.filter(f => (f.category ?? 'other') === categoryFilter);
    if (q) list = list.filter(f => f.name.toLowerCase().includes(q));
    return list;
  },[foods, searchQuery, categoryFilter]);

  const foodSearchItems: SearchItem[] = useMemo(
    () => foods.map(f => ({ ...f, isRecipe: false as const, _freq: 0 })),
    [foods]
  );

  const packRows = useMemo(() => {
    const rows: { food: Food; pkg: FoodPackage }[] = [];
    for (const f of foods) {
      for (const p of f.packages ?? []) rows.push({ food: f, pkg: p });
    }
    const q = searchQuery.toLowerCase();
    const filtered = q ? rows.filter(r => r.food.name.toLowerCase().includes(q)) : rows;
    return filtered.sort((a, b) => a.food.name.localeCompare(b.food.name) || a.pkg.grams - b.pkg.grams);
  }, [foods, searchQuery]);

  const presetLabels: Record<PresetKey, string> = {
    balanced:    'foods.balanced',
    highProtein: 'foods.highProtein',
    highCarb:    'foods.highCarb',
    highFat:     'foods.highFat',
    vegetable:   'foods.vegetable',
  };

  function applyPreset(key: PresetKey) {
    const kcal = parseFloat(addForm.calories);
    if (!kcal) { showToast(t('foods.presetNeedsKcal'), 'error'); return; }
    const p = PRESETS[key];
    patchAdd({
      fat:    String(Math.round(kcal * p.fatPct     / 9 * 10) / 10),
      carbs:  String(Math.round(kcal * p.carbsPct   / 4 * 10) / 10),
      fiber:  String(Math.round(kcal * p.fiberPer100 / 100 * 10) / 10),
      protein:String(Math.round(kcal * p.proteinPct / 4 * 10) / 10),
    });
  }

  // Macro fields for the single-line add form
  const macroFields: { key: keyof FoodFormState; label: string }[] = [
    { key: 'calories', label: 'kcal'          },
    { key: 'fat',      label: t('th.fat')     },
    { key: 'carbs',    label: t('th.carbs')   },
    { key: 'fiber',    label: t('th.fiber')   },
    { key: 'protein',  label: t('th.protein') },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto w-full flex flex-col gap-4 h-full overflow-hidden">

      {/* ── Collapsible add form ──────────────────────────────────────────── */}
      <div className="shrink-0">
        <CollapsibleSection
          storageKey="foods.addForm.collapsed"
          title={t('foods.addTitle')}
          subtitle={t('foods.valuesPerLabel')}
          openSignal={formOpenSignal}
        >
          <div className="flex flex-col gap-3">
            {/* Barcode row */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-sec shrink-0">{t('barcode.addByBarcode')}:</span>
              <input
                type="text"
                value={barcodeInput}
                onChange={e=>{setBarcodeInput(e.target.value);setBarcodeStatus(null);}}
                onKeyDown={e=>e.key==='Enter'&&handleBarcodeLookup()}
                placeholder={t('barcode.placeholder')}
                className="bg-bg border border-border rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-accent w-40"
              />
              <button type="button" onClick={handleBarcodeLookup} className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90 cursor-pointer shrink-0">{t('barcode.lookup')}</button>
              <button type="button" onClick={()=>setScannerOpen(true)} className="px-2 py-1.5 rounded-lg border border-border text-text-sec hover:border-accent cursor-pointer shrink-0 text-sm">📷</button>
              {barcodeStatus==='found' && <span className="text-xs text-accent">{t('barcode.found')}</span>}
              {barcodeStatus==='notFound' && <span className="text-xs text-red">{t('barcode.notFound')}</span>}
              {/* Presets */}
              <div className="ml-auto flex gap-1 flex-wrap justify-end">
                {(Object.keys(PRESETS) as PresetKey[]).map(key => (
                  <button key={key} type="button"
                    onClick={() => applyPreset(key)}
                    className="text-xs px-2 py-1 rounded border border-border text-text-sec hover:border-accent hover:text-accent transition-colors cursor-pointer"
                  >{t(presetLabels[key])}</button>
                ))}
              </div>
            </div>

            {/* Name row */}
            {(() => {
              const dupMatch = addForm.name.trim()
                ? foods.find(f => f.name.toLowerCase() === addForm.name.trim().toLowerCase())
                : null;
              return (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-text-sec">{t('common.name')}</label>
                  <input
                    type="text"
                    value={addForm.name}
                    onChange={e => patchAdd({ name: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder={t('foods.namePlaceholder')}
                    className={INPUT_CLASS}
                  />
                  {dupMatch && (
                    <span className="text-xs text-yellow">⚠ "{dupMatch.name}" already exists</span>
                  )}
                  <OffSuggestions
                    query={addForm.name}
                    disabled={!!addForm.barcode.trim()}
                    onSelect={(r) => applyBarcodeResult(r, r.barcode || '')}
                  />
                </div>
              );
            })()}

            {/* Macros + flags */}
            <div className="flex items-end gap-2">
              {macroFields.map(({ key, label }) => (
                <div key={key} className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <label className="text-xs text-text-sec truncate">{label}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={(addForm as unknown as Record<string,string>)[key]}
                    onChange={e => patchAdd({ [key]: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="0"
                    className={INPUT_CLASS}
                  />
                </div>
              ))}
              <div className="flex flex-col gap-0.5 items-center shrink-0 pb-1.5">
                <label className="text-xs text-text-sec">💧</label>
                <input type="checkbox" checked={addForm.is_liquid} onChange={e => patchAdd({ is_liquid: e.target.checked })} className="cursor-pointer accent-accent w-4 h-4" />
              </div>
              <div className="flex flex-col gap-0.5 items-center shrink-0 pb-1.5" title={t('foods.bulkHelp')}>
                <label className="text-xs text-text-sec">{t('foods.bulk')}</label>
                <input type="checkbox" checked={addForm.is_bulk} onChange={e => patchAdd({ is_bulk: e.target.checked, piece_grams: e.target.checked ? '' : addForm.piece_grams })} className="cursor-pointer accent-accent w-4 h-4" />
              </div>
            </div>

            {/* Category */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-sec shrink-0">{t('foods.category')}</label>
              <select
                value={addForm.category}
                onChange={e => patchAdd({ category: e.target.value as FoodCategory })}
                className={INPUT_CLASS}
              >
                {FOOD_CATEGORIES.map(c => (
                  <option key={c} value={c}>{t(`food.category.${c}`)}</option>
                ))}
              </select>
            </div>

            {/* Extra nutrition (sugar / sat fat / sodium-or-salt) */}
            {trackExtra && (
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <label className="text-xs text-text-sec truncate">{t('nutrition.sugar')} (g)</label>
                  <input type="text" inputMode="decimal" value={addForm.sugar} onChange={e => patchAdd({ sugar: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="0" className={INPUT_CLASS} />
                </div>
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <label className="text-xs text-text-sec truncate">{t('nutrition.saturatedFat')} (g)</label>
                  <input type="text" inputMode="decimal" value={addForm.saturated_fat} onChange={e => patchAdd({ saturated_fat: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="0" className={INPUT_CLASS} />
                </div>
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <label className="text-xs text-text-sec truncate">
                    {unit === 'salt' ? `${t('nutrition.salt')} (g)` : `${t('nutrition.sodium')} (mg)`}
                  </label>
                  <input type="text" inputMode="decimal" value={addForm.sodium_or_salt} onChange={e => patchAdd({ sodium_or_salt: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="0" className={INPUT_CLASS} />
                </div>
              </div>
            )}

            {/* Packs */}
            <div className="border-t border-border pt-2 flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-text">{t('foods.packsSection')}</span>
                <span className="text-[10px] text-text-sec">{t('foods.packsHelp')}</span>
              </div>
              {/* Pack rows — horizontal, + button on the right adds another */}
              <div className="flex items-center gap-2 flex-wrap">
                {addPacks.map((p, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <input
                      type="text" inputMode="decimal"
                      value={p.grams}
                      onChange={e => updateAddPackGrams(i, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (i === addPacks.length - 1 && parseFloat(p.grams) > 0) addBlankAddPack(); } }}
                      placeholder="0"
                      className="w-20 bg-bg border border-border rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-accent tabular-nums"
                    />
                    <span className="text-xs text-text-sec">g</span>
                    {addPacks.length > 1 && (
                      <button type="button" onClick={() => removeAddPack(i)}
                        className="text-xs text-text-sec hover:text-red cursor-pointer px-1">✕</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addBlankAddPack}
                  className="px-3 py-1.5 rounded-lg border border-dashed border-border text-text-sec text-sm hover:border-accent hover:text-accent transition-colors cursor-pointer">
                  + {t('foods.addPack')}
                </button>
              </div>
              {packFromBarcode != null && (
                <p className="text-[10px] text-accent">
                  {t('foods.packFromBarcode').replace('{g}', String(packFromBarcode))} ✓
                </p>
              )}
              {/* piece_grams (Shape B) — only when a pack exists */}
              {addPacks.length > 0 && !addForm.is_bulk && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-text-sec shrink-0">{t('foods.pieceInPack')}:</label>
                  <input
                    type="text" inputMode="decimal"
                    value={addForm.piece_grams}
                    onChange={e => patchAdd({ piece_grams: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="g"
                    className="w-20 bg-bg border border-border rounded-lg px-2 py-1 text-xs text-text outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-text-sec">{t('foods.pieceHelp')}</span>
                </div>
              )}
            </div>

            {/* Shelf life + price */}
            <div className="border-t border-border pt-2 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-text shrink-0">{t('foods.shelfPriceSection')}</span>
              <label className="text-xs text-text-sec shrink-0">{t('foods.openedDays')}</label>
              <input
                type="number" inputMode="numeric" min={1}
                value={addForm.opened_days}
                onChange={e => patchAdd({ opened_days: e.target.value })}
                placeholder="days"
                className="w-20 bg-bg border border-border rounded-lg px-2 py-1 text-xs text-text outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xs text-border mx-1">·</span>
              <label className="text-xs text-text-sec shrink-0">{t('foods.discardThreshold')}</label>
              <input
                type="number" inputMode="numeric" min={1} max={100}
                value={addForm.discard_threshold_pct}
                onChange={e => patchAdd({ discard_threshold_pct: e.target.value })}
                placeholder="5"
                className="w-16 bg-bg border border-border rounded-lg px-2 py-1 text-xs text-text outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xs text-border mx-1">·</span>
              <label className="text-xs text-text-sec shrink-0">{t('foods.pricePer100g').replace('{cur}', settings.currency_symbol ?? '€')}</label>
              <input
                type="number" inputMode="decimal" min={0}
                value={addForm.price_per_100g}
                onChange={e => patchAdd({ price_per_100g: e.target.value })}
                placeholder="0.00"
                className="w-20 bg-bg border border-border rounded-lg px-2 py-1 text-xs text-text outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            {/* Actions — bottom right */}
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <button type="button" onClick={handleImport} className="px-3 py-2 rounded-lg border border-border text-text-sec text-sm hover:border-accent hover:text-accent transition-colors cursor-pointer">{t('import.foods')}</button>
              <button type="button" onClick={() => handleAdd()} disabled={!addForm.name.trim()||!addForm.calories} className="px-5 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer">{t('common.add')}</button>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* ── Page eyebrow + serif title ────────────────────────────────────── */}
      <PageHeader eyebrow={t('foods.eyebrow')} title={t('foods.title')} className="shrink-0" />

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <Tabs<FoodsTab>
        items={[
          { id: 'foods', label: t('foods.tabFoods') },
          { id: 'packs', label: t('foods.tabPacks') },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ── Foods tab ─────────────────────────────────────────────────────── */}
      {tab === 'foods' && <div className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex items-center gap-3 shrink-0">
          <h2 className="text-sm font-semibold text-text-sec uppercase tracking-wider shrink-0">{t('foods.title')}</h2>
          <input
            type="text"
            value={searchQuery}
            onChange={e=>setSearchQuery(e.target.value)}
            placeholder={t('foods.searchPlaceholder')}
            className="bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent flex-1"
          />
          <button
            type="button"
            onClick={() => setDetailMode(v => !v)}
            className={['text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer shrink-0', detailMode ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-sec hover:border-accent hover:text-accent'].join(' ')}
          >{t('foods.detailMode')}</button>
        </div>

        {/* Category filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {(['all', ...FOOD_CATEGORIES] as const).map(c => {
            const active = categoryFilter === c;
            const label = c === 'all' ? t('foods.allCategories') : t(`food.category.${c}`);
            return (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={['text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer', active ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-sec hover:border-accent/50 hover:text-text'].join(' ')}
              >{label}</button>
            );
          })}
        </div>

        {filteredFoods.length === 0 ? (
          <p className="text-text-sec text-sm py-4">{t('foods.noFoods')}</p>
        ) : (
          <div className="overflow-auto flex-1 rounded-xl border border-border">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="sticky top-0 bg-card">
                <tr className="text-text-sec text-xs uppercase tracking-wider border-b border-border">
                  <th className="px-2 py-3 w-8"></th>
                  <th className="px-3 py-3 text-left">{t('th.food')}</th>
                  <th className="px-3 py-3 text-left text-xs">{t('foods.category')}</th>
                  <th className="px-3 py-3 text-right"><span className="inline-flex items-center justify-end gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: MACRO_DOT.calories }} />{t('th.kcal')}</span></th>
                  <th className="px-3 py-3 text-right"><span className="inline-flex items-center justify-end gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: MACRO_DOT.fat }} />{t('th.fat')}</span></th>
                  <th className="px-3 py-3 text-right"><span className="inline-flex items-center justify-end gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: MACRO_DOT.carbs }} />{t('th.carbs')}</span></th>
                  <th className="px-3 py-3 text-right"><span className="inline-flex items-center justify-end gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: MACRO_DOT.fiber }} />{t('th.fiber')}</span></th>
                  <th className="px-3 py-3 text-right"><span className="inline-flex items-center justify-end gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: MACRO_DOT.protein }} />{t('th.protein')}</span></th>
                  <th className="px-3 py-3 text-right">{t('th.piece')}</th>
                  <th className="px-2 py-3 text-center">{t('th.liquid')}</th>
                  {detailMode && <th className="px-3 py-3 text-left">{t('th.barcode')}</th>}
                  {detailMode && <th className="px-3 py-3 text-right">{t('foods.openedDays')}</th>}
                  {detailMode && <th className="px-3 py-3 text-right">{t('foods.discardThreshold')}</th>}
                  {detailMode && <th className="px-3 py-3 text-right">{t('foods.pricePer100g').replace('{cur}', settings.currency_symbol ?? '€')}</th>}
                  <th className="px-2 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filteredFoods.map(food => (
                  editId === food.id ? (
                    <tr key={food.id} className="bg-bg border-t border-border">
                      <td className="px-2 py-2">
                        <button type="button" onClick={()=>handleToggleFavorite(food.id)} className="text-base cursor-pointer">{food.favorite===1?'⭐':'☆'}</button>
                      </td>
                      <td colSpan={detailMode ? 10 : 9} className="px-3 py-2">
                        <FormFields form={editForm} patch={patchEdit} trackExtra={trackExtra} unit={unit} />
                        {detailMode && (
                          <div className="flex flex-wrap gap-3 mt-2">
                            <div className="flex flex-col gap-0.5">
                              <label className="text-xs text-text-sec">{t('th.barcode')}</label>
                              <input
                                type="text"
                                value={editForm.barcode}
                                onChange={e => patchEdit({ barcode: e.target.value })}
                                placeholder="e.g. 8001234567890"
                                className="bg-bg border border-border rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-accent w-48"
                              />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <label className="text-xs text-text-sec">{t('foods.openedDays')}</label>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                value={editForm.opened_days}
                                onChange={e => patchEdit({ opened_days: e.target.value })}
                                placeholder="days"
                                className="bg-bg border border-border rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-accent w-24 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <label className="text-xs text-text-sec">{t('foods.discardThreshold')}</label>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={100}
                                value={editForm.discard_threshold_pct}
                                onChange={e => patchEdit({ discard_threshold_pct: e.target.value })}
                                placeholder="5"
                                className="bg-bg border border-border rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-accent w-20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <label className="text-xs text-text-sec">{t('foods.pricePer100g').replace('{cur}', settings.currency_symbol ?? '€')}</label>
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                value={editForm.price_per_100g}
                                onChange={e => patchEdit({ price_per_100g: e.target.value })}
                                placeholder="0.00"
                                className="bg-bg border border-border rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-accent w-24 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          </div>
                        )}
                        {/* Pack sizes — live add/remove */}
                        <div className="border-t border-border pt-2 mt-2">
                          <p className="text-[10px] text-text-sec mb-1">{t('foods.packsHelp')}</p>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-text-sec">{t('foods.packs')}:</label>
                          {(food.packages ?? []).map(pkg => (
                            <EditablePackRow
                              key={pkg.id}
                              pkg={pkg}
                              currency={settings.currency_symbol ?? '€'}
                              onSaved={loadFoods}
                              onDelete={() => setDeletePackId(pkg.id)}
                              showError={(msg) => showToast(msg, 'error')}
                              tLocked={t('foods.packInUse')}
                            />
                          ))}
                          <div className="flex items-center gap-2">
                            <input
                              type="text" inputMode="decimal"
                              value={newPackGrams}
                              onChange={e => setNewPackGrams(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleAddPack()}
                              placeholder="+ g"
                              className="w-20 text-xs bg-bg border border-dashed border-border rounded px-2 py-1 focus:border-accent outline-none"
                            />
                            <input
                              type="text" inputMode="decimal"
                              value={newPackPrice}
                              onChange={e => setNewPackPrice(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleAddPack()}
                              placeholder={`${settings.currency_symbol ?? '€'} opt.`}
                              className="w-24 text-xs bg-bg border border-dashed border-border rounded px-2 py-1 focus:border-accent outline-none"
                            />
                            <button type="button" onClick={handleAddPack}
                              className="text-xs px-2 py-1 rounded border border-dashed border-border text-text-sec hover:border-accent hover:text-accent cursor-pointer">
                              + {t('foods.addPack')}
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="flex flex-col gap-1 pt-1">
                          <button type="button" onClick={()=>handleSaveEdit(food)} className="text-xs px-2 py-1 rounded bg-accent text-white hover:opacity-90 cursor-pointer">{t('common.save')}</button>
                          {!editForm.barcode.trim() && (
                            <button
                              type="button"
                              onClick={() => handleFindOffMatch(food)}
                              className="text-xs px-2 py-1 rounded border border-border text-text-sec hover:border-accent hover:text-accent cursor-pointer"
                              title={t('foods.findOffMatch')}
                            >🔎 {t('foods.findOffMatch')}</button>
                          )}
                          <button type="button" onClick={cancelEdit} className="text-xs px-2 py-1 rounded border border-border text-text-sec cursor-pointer">{t('common.cancel')}</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={food.id} className="border-t border-border/50 hover:bg-card/30 transition-colors">
                      <td className="px-2 py-2.5">
                        <button type="button" onClick={()=>handleToggleFavorite(food.id)} className="text-base cursor-pointer hover:scale-110 transition-transform">{food.favorite===1?'⭐':'☆'}</button>
                      </td>
                      <td className="px-3 py-2.5 text-text font-medium">
                        <div className="flex flex-col">
                          <span>{food.name}</span>
                          {food.group_id != null && (
                            <span className="text-[10px] text-text-sec/70">↳ {t('foods.partOf')} #{food.group_id}</span>
                          )}
                          {food.variant_count != null && food.variant_count > 0 && (
                            <span className="text-[10px] text-accent/80">{food.variant_count} {t('foods.variants')}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-text-sec text-xs">{t(`food.category.${food.category ?? 'other'}`)}</td>
                      <td className="px-3 py-2.5 text-right text-text tabular-nums">{food.calories}</td>
                      <td className="px-3 py-2.5 text-right text-text-sec tabular-nums">{food.fat}</td>
                      <td className="px-3 py-2.5 text-right text-text-sec tabular-nums">{food.carbs}</td>
                      <td className="px-3 py-2.5 text-right text-text-sec tabular-nums">{food.fiber}</td>
                      <td className="px-3 py-2.5 text-right text-text-sec tabular-nums">{food.protein}</td>
                      <td className="px-3 py-2.5 text-right text-text-sec tabular-nums">{food.piece_grams!=null?`${food.piece_grams}g`:'—'}</td>
                      <td className="px-2 py-2.5 text-center">{food.is_liquid===1?'💧':''}</td>
                      {detailMode && <td className="px-3 py-2.5 text-text-sec tabular-nums text-xs">{food.barcode ?? '—'}</td>}
                      {detailMode && <td className="px-3 py-2.5 text-right text-text-sec tabular-nums text-xs">{food.opened_days != null ? `${food.opened_days}d` : '—'}</td>}
                      {detailMode && <td className="px-3 py-2.5 text-right text-text-sec tabular-nums text-xs">{food.discard_threshold_pct != null ? `${food.discard_threshold_pct}%` : '—'}</td>}
                      {detailMode && <td className="px-3 py-2.5 text-right text-text-sec tabular-nums text-xs">{food.price_per_100g != null ? `${settings.currency_symbol ?? '€'}${food.price_per_100g}` : '—'}</td>}
                      <td className="px-2 py-2.5">
                        <div className="flex gap-1 justify-end items-center">
                          {food.group_id != null ? (
                            <button
                              type="button"
                              onClick={() => setConfirmUngroupId(food.id)}
                              className="text-[10px] uppercase tracking-wider text-text-sec hover:text-accent border border-border hover:border-accent rounded px-1.5 py-0.5 cursor-pointer transition-colors"
                              title={t('foods.ungroup')}
                            >{t('foods.ungroup')}</button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setGroupWithFood(food)}
                              className="text-[10px] uppercase tracking-wider text-text-sec hover:text-accent border border-border hover:border-accent rounded px-1.5 py-0.5 cursor-pointer transition-colors"
                              title={t('foods.groupWith')}
                            >🔗</button>
                          )}
                          <button type="button" onClick={()=>startEdit(food)} className="text-text-sec hover:text-text px-1 cursor-pointer"><span style={{ display: 'inline-block', transform: 'scaleX(-1) rotate(15deg)' }}>✎</span></button>
                          <button type="button" onClick={() => setDeleteId(food.id)} className="text-text-sec hover:text-red px-1 cursor-pointer transition-colors">✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* ── Packs tab ─────────────────────────────────────────────────────── */}
      {tab === 'packs' && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          {/* Add pack to existing food */}
          <div className="bg-card border border-border rounded-xl px-4 py-3 flex flex-col gap-2 shrink-0">
            <label className="text-xs text-text-sec">{t('foods.addPackToFood')}</label>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <FoodSearch
                  key={packSearchKey}
                  items={foodSearchItems}
                  onSelect={item => {
                    const food = foods.find(f => f.id === item.id) ?? null;
                    setPackFood(food);
                    setPackUnit(food?.piece_grams ? 'pcs' : 'g');
                    setPackGramsInput('');
                    setTimeout(() => packGramsRef.current?.focus(), 0);
                  }}
                  onClear={() => setPackFood(null)}
                  placeholder={t('foods.searchPlaceholder')}
                />
              </div>
              {packFood && (
                <>
                  {packFood.piece_grams && (
                    <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => { setPackUnit('g'); setPackGramsInput(''); }}
                        className={`px-3 py-1.5 cursor-pointer transition-colors ${packUnit === 'g' ? 'bg-accent/15 text-accent font-medium' : 'text-text-sec hover:text-text'}`}
                      >g</button>
                      <button
                        type="button"
                        onClick={() => { setPackUnit('pcs'); setPackGramsInput(''); packGramsRef.current?.focus(); }}
                        className={`px-3 py-1.5 cursor-pointer transition-colors ${packUnit === 'pcs' ? 'bg-accent/15 text-accent font-medium' : 'text-text-sec hover:text-text'}`}
                      >pcs</button>
                    </div>
                  )}
                  <input
                    ref={packGramsRef}
                    type="text" inputMode="decimal"
                    value={packGramsInput}
                    onChange={e => setPackGramsInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddPackToFood()}
                    placeholder={packUnit === 'pcs' ? 'pieces' : 'grams'}
                    className="w-24 bg-bg border border-border rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-accent"
                  />
                  {packUnit === 'pcs' && packFood.piece_grams && packGramsInput && parseFloat(packGramsInput) > 0 && (
                    <span className="text-xs text-text-sec">= {Math.round(parseFloat(packGramsInput) * packFood.piece_grams)}g</span>
                  )}
                  <button
                    type="button"
                    onClick={handleAddPackToFood}
                    disabled={!parseFloat(packGramsInput)}
                    className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer"
                  >{t('common.add')}</button>
                </>
              )}
            </div>
          </div>

          {/* Pack list */}
          <div className="flex items-center gap-3 shrink-0">
            <h2 className="text-sm font-semibold text-text-sec uppercase tracking-wider shrink-0">{t('foods.tabPacks')}</h2>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('foods.searchPlaceholder')}
              className="bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent flex-1"
            />
          </div>
          {packRows.length === 0 ? (
            <p className="text-text-sec text-sm py-4">{t('foods.noPacks')}</p>
          ) : (
            <div className="overflow-auto flex-1 rounded-xl border border-border">
              <table className="w-full text-sm min-w-[400px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-text-sec text-xs uppercase tracking-wider border-b border-border">
                    <th className="px-3 py-3 text-left">{t('th.food')}</th>
                    <th className="px-3 py-3 text-right">{t('foods.packSize')}</th>
                    <th className="px-2 py-3 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {packRows.map(({ food, pkg }) => (
                    <tr key={pkg.id} className="border-t border-border/50 hover:bg-card/30 transition-colors">
                      <td className="px-3 py-2.5 text-text font-medium">{food.name}</td>
                      <td className="px-3 py-2.5 text-right text-text tabular-nums">{pkg.grams}g</td>
                      <td className="px-2 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setDeletePackId(pkg.id)}
                          className="text-text-sec hover:text-red px-1 cursor-pointer transition-colors"
                        >✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={scannerOpen} onClose={()=>setScannerOpen(false)} title={t('barcode.scanTitle')}>
        <BarcodeScanner onResult={handleScanResult} />
      </Modal>

      {deleteId !== null && (
        <ConfirmDialog
          message={t('foods.confirmDelete')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          dangerous
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {groupWithFood && (
        <GroupWithDialog
          food={groupWithFood}
          onClose={() => setGroupWithFood(null)}
          onGrouped={() => { setGroupWithFood(null); loadFoods(); showToast(t('common.saved')); }}
        />
      )}

      {confirmUngroupId !== null && (
        <ConfirmDialog
          message={t('foods.confirmUngroupMsg')}
          confirmLabel={t('foods.ungroup')}
          cancelLabel={t('common.cancel')}
          onConfirm={async () => {
            await api.foods.ungroup(confirmUngroupId);
            setConfirmUngroupId(null);
            loadFoods();
            showToast(t('common.saved'));
          }}
          onCancel={() => setConfirmUngroupId(null)}
        />
      )}

      {deletePackId !== null && (
        <ConfirmDialog
          message={t('foods.confirmDeletePack')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          dangerous
          onConfirm={() => handleDeletePack(deletePackId)}
          onCancel={() => setDeletePackId(null)}
        />
      )}

      {macroFailDialog && (
        <ConfirmDialog
          message={
            `${t('foods.macroFailWarn')}\n` +
            `${t('foods.macroExpected')}: ~${Math.round(macroFailDialog.expected)} kcal\n` +
            `${t('foods.macroActual')}: ${Math.round(macroFailDialog.actual)} kcal`
          }
          confirmLabel={t('foods.saveAnyway')}
          dangerous
          onConfirm={() => {
            const dlg = macroFailDialog;
            setMacroFailDialog(null);
            if (dlg.kind === 'add') handleAdd(true);
            else handleSaveEdit(dlg.food, true);
          }}
          onCancel={() => setMacroFailDialog(null)}
        />
      )}

      {matchModal && (
        <FoodMatchModal
          isOpen
          current={(() => {
            const f = matchModal.kind === 'add-suggestion' ? addForm : editForm;
            return {
              name: f.name,
              calories: parseFloat(f.calories) || 0,
              protein: parseFloat(f.protein) || 0,
              carbs: parseFloat(f.carbs) || 0,
              fat: parseFloat(f.fat) || 0,
            };
          })()}
          candidates={matchModal.candidates}
          onApply={(c) => {
            if (matchModal.kind === 'add-suggestion') {
              applyBarcodeResult(c, c.barcode || '');
            } else {
              applyOffCandidate(c);
            }
            setMatchModal(null);
          }}
          onSaveAsIs={matchModal.kind === 'add-suggestion'
            ? () => { setMatchModal(null); handleAdd(true, true); }
            : undefined}
          onClose={() => setMatchModal(null)}
        />
      )}
    </div>
  );
}

// ── EditablePackRow ───────────────────────────────────────────────────────────

interface EditablePackRowProps {
  pkg: FoodPackage;
  currency: string;
  onSaved: () => void;
  onDelete: () => void;
  showError: (msg: string) => void;
  tLocked: string;
}

function EditablePackRow({ pkg, currency, onSaved, onDelete, showError, tLocked }: EditablePackRowProps) {
  const [grams, setGrams] = useState(String(pkg.grams));
  const [price, setPrice] = useState(pkg.price != null ? String(pkg.price) : '');

  useEffect(() => { setGrams(String(pkg.grams)); }, [pkg.grams]);
  useEffect(() => { setPrice(pkg.price != null ? String(pkg.price) : ''); }, [pkg.price]);

  async function commit() {
    const g = parseFloat(grams);
    const p = price !== '' ? parseFloat(price) : null;
    if (!g || g <= 0) { setGrams(String(pkg.grams)); return; }
    const samePrice = (p ?? null) === (pkg.price ?? null);
    if (g === pkg.grams && samePrice) return;
    const res = await api.foods.updatePackage({ id: pkg.id, grams: g, price: p });
    if (!res.ok && res.error === 'pack_in_use') {
      showError(tLocked.replace('{n}', String(res.batch_count ?? 0)));
      setGrams(String(pkg.grams));
      setPrice(pkg.price != null ? String(pkg.price) : '');
      return;
    }
    onSaved();
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text" inputMode="decimal"
        value={grams}
        onChange={e => setGrams(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-20 text-xs bg-bg border border-border rounded px-2 py-1 text-text outline-none focus:border-accent tabular-nums"
      />
      <span className="text-xs text-text-sec">g</span>
      <input
        type="text" inputMode="decimal"
        value={price}
        onChange={e => setPrice(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder={`${currency} opt.`}
        className="w-24 text-xs bg-bg border border-border rounded px-2 py-1 text-text outline-none focus:border-accent"
      />
      <button type="button" onClick={onDelete} className="text-xs text-text-sec hover:text-red cursor-pointer px-1">✕</button>
    </div>
  );
}
