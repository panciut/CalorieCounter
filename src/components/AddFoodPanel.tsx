import { useState } from 'react';
import { useT } from '../i18n/useT';
import { useToast } from './Toast';
import { api } from '../api';
import BarcodeScanner from './BarcodeScanner';
import FoodNameSearch from './FoodNameSearch';
import Modal from './Modal';
import type { Food, BarcodeResult, BarcodeSearchResult } from '../types';
import { PRESETS, PresetKey, INPUT_CLASS, PRESET_LABELS } from '../lib/foodPresets';

// ── Form types & helpers ──────────────────────────────────────────────────────

interface FoodFormState {
  name: string; calories: string; protein: string; carbs: string;
  fat: string; fiber: string; piece_grams: string; is_liquid: boolean; is_bulk: boolean; barcode: string;
  opened_days: string; price_per_100g: string;
}

function emptyForm(): FoodFormState {
  return { name: '', calories: '', protein: '', carbs: '', fat: '', fiber: '', piece_grams: '', is_liquid: false, is_bulk: true, barcode: '', opened_days: '7', price_per_100g: '' };
}

function barcodeToForm(r: BarcodeResult, barcode: string): FoodFormState {
  return {
    name: r.name, calories: String(r.calories), protein: String(r.protein),
    carbs: String(r.carbs), fat: String(r.fat), fiber: String(r.fiber),
    piece_grams: '', is_liquid: r.is_liquid === 1, is_bulk: false, barcode, opened_days: '7', price_per_100g: '',
  };
}

function formToData(f: FoodFormState): Omit<Food, 'id'> {
  return {
    name: f.name.trim(),
    calories: parseFloat(f.calories) || 0,
    protein: parseFloat(f.protein) || 0,
    carbs: parseFloat(f.carbs) || 0,
    fat: parseFloat(f.fat) || 0,
    fiber: parseFloat(f.fiber) || 0,
    piece_grams: f.is_bulk ? null : (f.piece_grams !== '' ? parseFloat(f.piece_grams) : null),
    is_liquid: f.is_liquid ? 1 : 0,
    is_bulk: f.is_bulk ? 1 : 0,
    barcode: f.barcode.trim() || null,
    opened_days: f.opened_days !== '' ? parseInt(f.opened_days, 10) : null,
    price_per_100g: f.price_per_100g !== '' ? parseFloat(f.price_per_100g) : null,
  };
}

// ── AddFoodPanel ──────────────────────────────────────────────────────────────

interface AddFoodPanelProps {
  /** Called after a new food is saved to the database. */
  onSaved?: (food: Food) => void;
  /**
   * Optional list of already-known foods. When a barcode scan matches one of
   * these (by barcode field), `onFoodFound` is called instead of opening the
   * create form — useful for callers that want to route to a different flow
   * (e.g. select the existing food for a pantry stock entry).
   */
  knownFoods?: Food[];
  onFoodFound?: (food: Food) => void;
  defaultOpen?: boolean;
}

export default function AddFoodPanel({ onSaved, knownFoods, onFoodFound, defaultOpen = false }: AddFoodPanelProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [form, setForm] = useState<FoodFormState>(emptyForm());
  const [packs, setPacks] = useState<{ grams: string }[]>([{ grams: '' }]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeStatus, setBarcodeStatus] = useState<'found' | 'notFound' | null>(null);
  const [packFromBarcode, setPackFromBarcode] = useState<number | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTab, setScannerTab] = useState<'scan' | 'search'>('scan');

  function patch(p: Partial<FoodFormState>) { setForm(f => ({ ...f, ...p })); }
  function updatePackGrams(i: number, grams: string) { setPacks(p => p.map((x, idx) => idx === i ? { grams } : x)); }
  function removePack(i: number) { setPacks(p => p.filter((_, idx) => idx !== i)); }
  function addBlankPack() { setPacks(p => [...p, { grams: '' }]); }

  function applyBarcodeResult(r: BarcodeResult, barcode: string) {
    setForm(barcodeToForm(r, barcode));
    setBarcodeStatus('found');
    setOpen(true);
    const allBlank = packs.every(p => !p.grams);
    if (r.pack_grams && allBlank) {
      const g = Math.round(r.pack_grams);
      setPacks([{ grams: String(g) }]);
      setPackFromBarcode(g);
    } else {
      setPackFromBarcode(null);
    }
  }

  function handleNameSearchResult(r: BarcodeSearchResult) {
    setScannerOpen(false);
    setScannerTab('scan');
    applyBarcodeResult(r, r.barcode ?? '');
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
    setScannerOpen(false);
    setBarcodeInput(barcode);
    setBarcodeStatus(null);
    setPackFromBarcode(null);

    // If a known-foods list was provided, check for an existing match first.
    if (knownFoods && onFoodFound) {
      const existing = knownFoods.find(f => f.barcode && f.barcode === barcode);
      if (existing) {
        onFoodFound(existing);
        return;
      }
    }

    const r = await api.barcode.lookup(barcode);
    if (r) applyBarcodeResult(r, barcode);
    else setBarcodeStatus('notFound');
  }

  function applyPreset(key: PresetKey) {
    const kcal = parseFloat(form.calories);
    if (!kcal) { showToast(t('foods.presetNeedsKcal'), 'error'); return; }
    const p = PRESETS[key];
    patch({
      fat:     String(Math.round(kcal * p.fatPct      / 9 * 100) / 100),
      carbs:   String(Math.round(kcal * p.carbsPct    / 4 * 100) / 100),
      fiber:   String(Math.round(kcal * p.fiberPer100 / 100 * 100) / 100),
      protein: String(Math.round(kcal * p.proteinPct  / 4 * 100) / 100),
    });
  }

  async function handleAdd() {
    if (!form.name.trim() || !form.calories) return;
    const { id } = await api.foods.add(formToData(form));
    for (const p of packs) {
      const g = parseFloat(p.grams);
      if (g > 0) await api.foods.addPackage({ food_id: id, grams: g });
    }
    showToast(t('common.saved'));
    if (onSaved) {
      const allFoods = await api.foods.getAll();
      const saved = allFoods.find(f => f.id === id);
      if (saved) onSaved(saved);
    }
    setForm(emptyForm());
    setPacks([{ grams: '' }]);
    setBarcodeInput('');
    setBarcodeStatus(null);
    setPackFromBarcode(null);
  }

  const presetLabels = PRESET_LABELS;

  const macroFields: { key: keyof FoodFormState; label: string }[] = [
    { key: 'calories',    label: 'kcal'          },
    { key: 'fat',         label: t('th.fat')     },
    { key: 'carbs',       label: t('th.carbs')   },
    { key: 'fiber',       label: t('th.fiber')   },
    { key: 'protein',     label: t('th.protein') },
  ];

  return (
    <div className="bg-card border border-border rounded-xl shrink-0">
      {/* Header — always visible */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex-1 flex items-center gap-2 px-4 py-3 text-left cursor-pointer hover:bg-card-hover rounded-l-xl transition-colors"
        >
          <span className="text-xs text-text-sec select-none">{open ? '▴' : '▾'}</span>
          <span className="text-sm font-semibold text-text">{t('foods.addTitle')}</span>
          <span className="text-xs text-text-sec ml-1">{t('foods.valuesPerLabel')}</span>
        </button>
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          title={t('barcode.scanTitle')}
          className="px-4 py-3 text-text-sec hover:text-accent cursor-pointer transition-colors rounded-r-xl hover:bg-card-hover text-base leading-none"
        >
          📷
        </button>
      </div>

      {/* Form body */}
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-border pt-3">
          {/* Barcode row */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-sec shrink-0">{t('barcode.addByBarcode')}:</span>
            <input
              type="text"
              value={barcodeInput}
              onChange={e => { setBarcodeInput(e.target.value); setBarcodeStatus(null); }}
              onKeyDown={e => e.key === 'Enter' && handleBarcodeLookup()}
              placeholder={t('barcode.placeholder')}
              className="bg-bg border border-border rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-accent w-40"
            />
            <button type="button" onClick={handleBarcodeLookup}
              className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90 cursor-pointer shrink-0">
              {t('barcode.lookup')}
            </button>
            {barcodeStatus === 'found'    && <span className="text-xs text-accent">{t('barcode.found')}</span>}
            {barcodeStatus === 'notFound' && <span className="text-xs text-red">{t('barcode.notFound')}</span>}
            {/* Presets */}
            <div className="ml-auto flex gap-1 flex-wrap justify-end">
              {(Object.keys(PRESETS) as PresetKey[]).map(key => (
                <button key={key} type="button" onClick={() => applyPreset(key)}
                  className="text-xs px-2 py-1 rounded border border-border text-text-sec hover:border-accent hover:text-accent transition-colors cursor-pointer">
                  {t(presetLabels[key])}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-text-sec">{t('common.name')}</label>
            <input
              type="text"
              value={form.name}
              onChange={e => patch({ name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder={t('foods.namePlaceholder')}
              className={INPUT_CLASS}
            />
          </div>

          {/* Macros + flags */}
          <div className="flex items-end gap-2">
            {macroFields.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-0.5 flex-1 min-w-0">
                <label className="text-xs text-text-sec truncate">{label}</label>
                <input
                  type="text" inputMode="decimal"
                  value={(form as unknown as Record<string, string>)[key]}
                  onChange={e => patch({ [key]: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="0"
                  className={INPUT_CLASS}
                />
              </div>
            ))}
            <div className="flex flex-col gap-0.5 items-center shrink-0 pb-1.5">
              <label className="text-xs text-text-sec">💧</label>
              <input type="checkbox" checked={form.is_liquid} onChange={e => patch({ is_liquid: e.target.checked })} className="cursor-pointer accent-accent w-4 h-4" />
            </div>
            <div className="flex flex-col gap-0.5 items-center shrink-0 pb-1.5" title={t('foods.bulkHelp')}>
              <label className="text-xs text-text-sec">{t('foods.bulk')}</label>
              <input type="checkbox" checked={form.is_bulk} onChange={e => patch({ is_bulk: e.target.checked, piece_grams: e.target.checked ? '' : form.piece_grams })} className="cursor-pointer accent-accent w-4 h-4" />
            </div>
          </div>

          {/* Packs */}
          <div className="border-t border-border pt-2 flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-text">{t('foods.packsSection')}</span>
              <span className="text-[10px] text-text-sec">{t('foods.packsHelp')}</span>
            </div>
            {/* Pack rows — horizontal, + button on the right adds another */}
            <div className="flex items-center gap-2 flex-wrap">
              {packs.map((p, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    type="text" inputMode="decimal"
                    value={p.grams}
                    onChange={e => updatePackGrams(i, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (i === packs.length - 1 && parseFloat(p.grams) > 0) addBlankPack(); } }}
                    placeholder="0"
                    className="w-20 bg-bg border border-border rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-accent tabular-nums"
                  />
                  <span className="text-xs text-text-sec">g</span>
                  {packs.length > 1 && (
                    <button type="button" onClick={() => removePack(i)}
                      className="text-xs text-text-sec hover:text-red cursor-pointer px-1">✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addBlankPack}
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
            {packs.length > 0 && !form.is_bulk && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-sec shrink-0">{t('foods.pieceInPack')}:</label>
                <input
                  type="text" inputMode="decimal"
                  value={form.piece_grams}
                  onChange={e => patch({ piece_grams: e.target.value })}
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
              value={form.opened_days}
              onChange={e => setForm(f => ({ ...f, opened_days: e.target.value }))}
              placeholder="days"
              className="w-20 bg-bg border border-border rounded-lg px-2 py-1 text-xs text-text outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-xs text-text-sec">days</span>
            <span className="text-xs text-border mx-1">·</span>
            <label className="text-xs text-text-sec shrink-0">{t('foods.pricePer100g').replace('{cur}', '€')}</label>
            <input
              type="number" inputMode="decimal" min={0}
              value={form.price_per_100g}
              onChange={e => patch({ price_per_100g: e.target.value })}
              placeholder="0.00"
              className="w-20 bg-bg border border-border rounded-lg px-2 py-1 text-xs text-text outline-none focus:border-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          {/* Add button — bottom right */}
          <div className="flex justify-end border-t border-border pt-3">
            <button
              type="button" onClick={handleAdd}
              disabled={!form.name.trim() || !form.calories}
              className="px-5 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer">
              {t('common.add')}
            </button>
          </div>
        </div>
      )}

      {scannerOpen && (
        <Modal
          isOpen
          onClose={() => { setScannerOpen(false); setScannerTab('scan'); }}
          title={t('barcode.scanTitle')}
        >
          <div className="flex gap-1 mb-4 bg-bg rounded-lg p-1">
            <button
              type="button"
              onClick={() => setScannerTab('scan')}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 text-sm py-1.5 rounded-md transition-colors cursor-pointer',
                scannerTab === 'scan'
                  ? 'bg-card text-text font-medium shadow-sm'
                  : 'text-text-sec hover:text-text',
              ].join(' ')}
            >
              📷 Scansiona
            </button>
            <button
              type="button"
              onClick={() => setScannerTab('search')}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 text-sm py-1.5 rounded-md transition-colors cursor-pointer',
                scannerTab === 'search'
                  ? 'bg-card text-text font-medium shadow-sm'
                  : 'text-text-sec hover:text-text',
              ].join(' ')}
            >
              🔍 Cerca per nome
            </button>
          </div>

          {scannerTab === 'scan' && <BarcodeScanner onResult={handleScanResult} />}
          {scannerTab === 'search' && <FoodNameSearch onResult={handleNameSearchResult} />}
        </Modal>
      )}
    </div>
  );
}
