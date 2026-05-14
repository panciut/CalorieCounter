import { useState, type CSSProperties } from 'react';
import { useT } from '../i18n/useT';
import { useToast } from './Toast';
import { useSettings } from '../hooks/useSettings';
import { api } from '../api';
import BarcodeScanner from './BarcodeScanner';
import FoodNameSearch from './FoodNameSearch';
import Modal from './Modal';
import type { Food, BarcodeResult, BarcodeSearchResult } from '../types';
import { PRESETS, PresetKey, PRESET_LABELS } from '../lib/foodPresets';

interface FoodFormState {
  name: string; calories: string; protein: string; carbs: string;
  fat: string; fiber: string; piece_grams: string; is_liquid: boolean; is_bulk: boolean; barcode: string;
  opened_days: string; discard_threshold_pct: string; price_per_100g: string; image_url: string;
}

const emptyForm = (): FoodFormState => ({
  name: '', calories: '', protein: '', carbs: '', fat: '', fiber: '',
  piece_grams: '', is_liquid: false, is_bulk: true, barcode: '',
  opened_days: '7', discard_threshold_pct: '5', price_per_100g: '', image_url: '',
});

const barcodeToForm = (r: BarcodeResult, barcode: string): FoodFormState => ({
  name: r.name, calories: String(r.calories), protein: String(r.protein),
  carbs: String(r.carbs), fat: String(r.fat), fiber: String(r.fiber),
  piece_grams: '', is_liquid: r.is_liquid === 1, is_bulk: false, barcode,
  opened_days: '7', discard_threshold_pct: '5', price_per_100g: '', image_url: r.image_url ?? '',
});

const formToData = (f: FoodFormState): Omit<Food, 'id'> => ({
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
  discard_threshold_pct: parseFloat(f.discard_threshold_pct) || 5,
  price_per_100g: f.price_per_100g !== '' ? parseFloat(f.price_per_100g) : null,
  image_url: f.image_url.trim() || null,
});

interface AddFoodFormProps {
  existingFoods?: Food[];
  onAdded?: (food: Food) => void;
  onFoodFound?: (food: Food) => void;
  onImport?: () => void;
  defaultOpen?: boolean;
}

// ── Shared style tokens (Dashboard + Apple Fitness mix) ──────────────────────
const eyebrow: CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: 1.4,
  textTransform: 'uppercase', color: 'var(--fb-text-3)',
};

const serifNum: CSSProperties = {
  fontFamily: 'var(--font-serif)', fontWeight: 300, letterSpacing: -1,
  color: 'var(--fb-text)', lineHeight: 1,
};

const serifItalic: CSSProperties = {
  fontFamily: 'var(--font-serif)', fontStyle: 'italic',
};

const bezelOuter = (radius = 18): CSSProperties => ({
  background: 'var(--fb-bg)',
  border: '1px solid var(--fb-border)',
  borderRadius: radius,
  padding: 3,
});

const bezelInner = (radius = 15): CSSProperties => ({
  background: 'var(--fb-card)',
  borderRadius: radius,
  padding: '14px 16px',
});

const inlineInput: CSSProperties = {
  background: 'transparent', border: 0, outline: 'none',
  color: 'var(--fb-text)', width: '100%',
  fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit',
};

const numTile = (focused: boolean): CSSProperties => ({
  ...bezelInner(13),
  display: 'flex', flexDirection: 'column', gap: 8,
  transition: 'box-shadow .35s cubic-bezier(0.32,0.72,0,1), transform .35s cubic-bezier(0.32,0.72,0,1)',
  boxShadow: focused ? '0 0 0 1px var(--fb-accent)' : 'none',
});

export default function AddFoodForm({
  existingFoods = [],
  onAdded,
  onFoodFound,
  onImport,
  defaultOpen = false,
}: AddFoodFormProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const { settings } = useSettings();

  const [formOpen, setFormOpen] = useState(defaultOpen);
  const [addForm, setAddForm] = useState<FoodFormState>(emptyForm());
  const [addPacks, setAddPacks] = useState<{ grams: string }[]>([{ grams: '' }]);
  const [packFromBarcode, setPackFromBarcode] = useState<number | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeStatus, setBarcodeStatus] = useState<'found' | 'notFound' | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTab, setScannerTab] = useState<'scan' | 'search'>('scan');
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  function patch(p: Partial<FoodFormState>) { setAddForm(f => ({ ...f, ...p })); }
  function updateAddPackGrams(i: number, grams: string) { setAddPacks(p => p.map((x, idx) => idx === i ? { grams } : x)); }
  function removeAddPack(i: number) { setAddPacks(p => p.filter((_, idx) => idx !== i)); }
  function addBlankAddPack() { setAddPacks(p => [...p, { grams: '' }]); }

  function applyBarcodeResult(r: BarcodeResult, barcode: string) {
    setAddForm(barcodeToForm(r, barcode));
    setBarcodeStatus('found');
    setFormOpen(true);
    const allBlank = addPacks.every(p => !p.grams);
    if (r.pack_grams && allBlank) {
      const g = Math.round(r.pack_grams);
      setAddPacks([{ grams: String(g) }]);
      setPackFromBarcode(g);
    } else {
      setPackFromBarcode(null);
    }
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
    setScannerTab('scan');
    setBarcodeInput(barcode);
    setBarcodeStatus(null);
    setPackFromBarcode(null);
    if (existingFoods.length > 0 && onFoodFound) {
      const existing = existingFoods.find(f => f.barcode && f.barcode === barcode);
      if (existing) { onFoodFound(existing); return; }
    }
    const r = await api.barcode.lookup(barcode);
    if (r) applyBarcodeResult(r, barcode);
    else setBarcodeStatus('notFound');
  }

  function handleNameSearchResult(r: BarcodeSearchResult) {
    setScannerOpen(false);
    setScannerTab('scan');
    applyBarcodeResult(r, r.barcode ?? '');
  }

  function applyPreset(key: PresetKey) {
    const kcal = parseFloat(addForm.calories);
    if (!kcal) { showToast(t('foods.presetNeedsKcal'), 'error'); return; }
    const p = PRESETS[key];
    patch({
      fat:     String(Math.round(kcal * p.fatPct     / 9 * 100) / 100),
      carbs:   String(Math.round(kcal * p.carbsPct   / 4 * 100) / 100),
      fiber:   String(Math.round(kcal * p.fiberPer100 / 100 * 100) / 100),
      protein: String(Math.round(kcal * p.proteinPct / 4 * 100) / 100),
    });
  }

  async function handleAdd() {
    if (!addForm.name.trim() || !addForm.calories) return;
    const { id } = await api.foods.add(formToData(addForm));
    for (const p of addPacks) {
      const g = parseFloat(p.grams);
      if (g > 0) await api.foods.addPackage({ food_id: id, grams: g });
    }
    showToast(t('common.saved'));
    if (onAdded) {
      const allFoods = await api.foods.getAll();
      const saved = allFoods.find(f => f.id === id);
      if (saved) onAdded(saved);
    }
    setAddForm(emptyForm());
    setAddPacks([{ grams: '' }]);
    setPackFromBarcode(null);
    setBarcodeInput('');
    setBarcodeStatus(null);
    setFormOpen(false);
  }

  // 5 macro tiles — kcal acts as the "Move ring" hero (orange)
  const macroFields: { key: keyof FoodFormState; label: string; color: string; unit: string; size: 'hero' | 'std' }[] = [
    { key: 'calories', label: 'Energy',     color: 'var(--fb-orange)', unit: 'kcal', size: 'hero' },
    { key: 'protein', label: t('th.protein'), color: 'var(--fb-red)',   unit: 'g',    size: 'std' },
    { key: 'carbs',    label: t('th.carbs'),   color: 'var(--fb-amber)', unit: 'g',    size: 'std' },
    { key: 'fat',      label: t('th.fat'),     color: 'var(--fb-green)', unit: 'g',    size: 'std' },
    { key: 'fiber',    label: t('th.fiber'),   color: 'var(--fb-text-2)',unit: 'g',    size: 'std' },
  ];

  const duplicateName = existingFoods.some(
    f => f.name.toLowerCase() === addForm.name.trim().toLowerCase() && addForm.name.trim() !== ''
  );

  return (
    <>
      <section style={{
        background: 'var(--fb-card)',
        border: '1px solid var(--fb-border)',
        borderRadius: 18,
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'all .5s cubic-bezier(0.32,0.72,0,1)',
      }}>
        {/* ── Hero header ────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setFormOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '18px 22px',
            background: 'transparent', border: 0, cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={eyebrow}>{t('foods.addTitle')}</span>
            <span style={{ ...serifItalic, fontSize: 22, fontWeight: 400, color: 'var(--fb-text)', lineHeight: 1.1 }}>
              {addForm.name.trim() || (formOpen ? t('common.newProduct') : t('common.addFood'))}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{
              ...eyebrow, fontSize: 9.5,
              padding: '5px 10px', borderRadius: 99,
              background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)',
              color: 'var(--fb-text-2)',
            }}>
              {t('foods.valuesPerLabel')}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 99,
              background: formOpen ? 'var(--fb-bg-2)' : 'var(--fb-accent)',
              color: formOpen ? 'var(--fb-text-2)' : 'white',
              fontSize: 16, fontWeight: 400, lineHeight: 1,
              transition: 'transform .5s cubic-bezier(0.32,0.72,0,1), background .3s ease',
              transform: formOpen ? 'rotate(45deg)' : 'rotate(0deg)',
            }}>+</span>
          </div>
        </button>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        {formOpen && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 18,
            padding: '4px 22px 22px',
            borderTop: '1px solid var(--fb-divider)',
            paddingTop: 20,
            animation: 'slideDown .5s cubic-bezier(0.32,0.72,0,1)',
          }}>

            {/* Identify — barcode strip */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '10px 12px',
              background: 'var(--fb-bg)',
              border: '1px solid var(--fb-border)',
              borderRadius: 14,
            }}>
              <span style={{ ...eyebrow, flexShrink: 0 }}>{t('barcode.addByBarcode')}</span>
              <input
                type="text"
                value={barcodeInput}
                onChange={e => { setBarcodeInput(e.target.value); setBarcodeStatus(null); }}
                onKeyDown={e => e.key === 'Enter' && handleBarcodeLookup()}
                placeholder={t('barcode.placeholder')}
                style={{
                  ...inlineInput, flex: '1 1 160px',
                  fontSize: 13, fontFamily: 'var(--font-mono, inherit)',
                  letterSpacing: 0.3, padding: '6px 0',
                }}
              />
              {barcodeStatus === 'found' && (
                <span className="tnum" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, color: 'var(--fb-green)', padding: '4px 9px', borderRadius: 99, background: 'color-mix(in srgb, var(--fb-green) 14%, transparent)' }}>
                  {t('barcode.found')} ✓
                </span>
              )}
              {barcodeStatus === 'notFound' && (
                <span className="tnum" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, color: 'var(--fb-red)', padding: '4px 9px', borderRadius: 99, background: 'color-mix(in srgb, var(--fb-red) 14%, transparent)' }}>
                  {t('barcode.notFound')} ✕
                </span>
              )}
              <button
                type="button" onClick={handleBarcodeLookup}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'var(--fb-bg-2)', color: 'var(--fb-text)',
                  border: '1px solid var(--fb-border-strong)',
                  padding: '6px 14px', borderRadius: 99,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'all .3s ease',
                }}
              >
                {t('barcode.lookup')}
              </button>
              <button
                type="button" onClick={() => setScannerOpen(true)}
                title={t('barcode.scanTitle')}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: 99,
                  background: 'var(--fb-accent)', color: 'white', border: 0,
                  cursor: 'pointer', fontSize: 14,
                  transition: 'transform .3s cubic-bezier(0.32,0.72,0,1)',
                }}
                onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.94)')}
                onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >📷</button>
            </div>

            {/* Name + image */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              {addForm.image_url && (
                <div style={{
                  flexShrink: 0, padding: 3,
                  background: 'var(--fb-bg)',
                  border: '1px solid var(--fb-border)',
                  borderRadius: 16,
                }}>
                  <img
                    src={addForm.image_url} alt=""
                    style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: 13, display: 'block', background: 'white' }}
                  />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={eyebrow}>{t('common.name')}</span>
                <input
                  type="text" value={addForm.name}
                  onChange={e => patch({ name: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder={t('foods.namePlaceholder')}
                  style={{
                    ...inlineInput,
                    fontFamily: 'var(--font-serif)', fontStyle: 'italic',
                    fontSize: 26, fontWeight: 400, letterSpacing: -0.5,
                    color: 'var(--fb-text)',
                    borderBottom: '1px solid var(--fb-border-strong)',
                    paddingBottom: 6,
                  }}
                />
                {duplicateName && (
                  <span style={{ fontSize: 11, color: 'var(--fb-amber)', fontStyle: 'italic' }}>
                    ⚠ Esiste già un alimento con questo nome
                  </span>
                )}
              </div>
            </div>

            {/* Macro grid — Apple Fitness style tiles */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr) repeat(3, 1fr)',
              gridTemplateAreas: '"kcal kcal protein carbs fat" "kcal kcal fiber fiber fat"',
              gap: 8,
            }} className="addfood-macro-grid">
              {macroFields.map(({ key, label, color, unit, size }) => {
                const val = (addForm as unknown as Record<string, string>)[key];
                const isHero = size === 'hero';
                const isFocused = focusedKey === key;
                return (
                  <div
                    key={key}
                    style={{
                      ...bezelOuter(14),
                      gridArea: isHero ? 'kcal' : key === 'fiber' ? 'fiber' : key === 'fat' ? 'fat' : key,
                    }}
                  >
                    <div style={numTile(isFocused)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={eyebrow}>{label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
                        <input
                          type="text" inputMode="decimal"
                          value={val}
                          onChange={e => patch({ [key]: e.target.value })}
                          onFocus={() => setFocusedKey(key)}
                          onBlur={() => setFocusedKey(null)}
                          onKeyDown={e => e.key === 'Enter' && handleAdd()}
                          placeholder="0"
                          className="tnum"
                          style={{
                            ...inlineInput, ...serifNum,
                            fontSize: isHero ? 48 : 28,
                            letterSpacing: isHero ? -2 : -1,
                            minWidth: 0,
                          }}
                        />
                        <span style={{ ...serifItalic, fontSize: isHero ? 16 : 12, color: 'var(--fb-text-3)', flexShrink: 0 }}>
                          {unit}
                        </span>
                      </div>
                      {/* mini progress hint — purely decorative ring-like bar */}
                      <div style={{ height: 3, background: 'var(--fb-bg-2)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: val ? `${Math.min(100, parseFloat(val || '0') / (isHero ? 8 : 0.5))}%` : '0%',
                          background: color,
                          borderRadius: 99,
                          transition: 'width .8s cubic-bezier(0.32,0.72,0,1)',
                        }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Presets row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ ...eyebrow, marginRight: 4 }}>Preset</span>
              {(Object.keys(PRESETS) as PresetKey[]).map(key => (
                <button
                  key={key} type="button" onClick={() => applyPreset(key)}
                  style={{
                    background: 'var(--fb-bg)',
                    border: '1px solid var(--fb-border)',
                    color: 'var(--fb-text-2)',
                    padding: '5px 12px', borderRadius: 99,
                    fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    transition: 'all .3s cubic-bezier(0.32,0.72,0,1)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--fb-text)'; e.currentTarget.style.borderColor = 'var(--fb-border-strong)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--fb-text-2)'; e.currentTarget.style.borderColor = 'var(--fb-border)'; }}
                >
                  {t(PRESET_LABELS[key])}
                </button>
              ))}
            </div>

            {/* Packs + flags row */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={eyebrow}>{t('foods.packsSection')}</span>
                {packFromBarcode != null && (
                  <span className="tnum" style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--fb-accent)', padding: '3px 8px', borderRadius: 99, background: 'var(--fb-accent-soft)' }}>
                    {t('foods.packFromBarcode').replace('{g}', String(packFromBarcode))}
                  </span>
                )}
                {/* iOS-style toggles */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
                  <Toggle
                    label={`${t('foods.liquid')} 💧`}
                    checked={addForm.is_liquid}
                    onChange={v => patch({ is_liquid: v })}
                  />
                  <Toggle
                    label={`${t('foods.bulk')} ⚖️`}
                    checked={addForm.is_bulk}
                    onChange={v => patch({ is_bulk: v, piece_grams: v ? '' : addForm.piece_grams })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {addPacks.map((p, i) => (
                  <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'baseline', gap: 4,
                      padding: '6px 12px', borderRadius: 99,
                      background: 'var(--fb-bg)', border: '1px solid var(--fb-border-strong)',
                    }}>
                      <input
                        type="text" inputMode="decimal" value={p.grams}
                        onChange={e => updateAddPackGrams(i, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (i === addPacks.length - 1 && parseFloat(p.grams) > 0) addBlankAddPack(); } }}
                        placeholder="0"
                        className="tnum"
                        style={{ ...inlineInput, width: 44, fontSize: 13, fontWeight: 600, textAlign: 'right' }}
                      />
                      <span style={{ ...serifItalic, fontSize: 11, color: 'var(--fb-text-3)' }}>g</span>
                    </div>
                    {addPacks.length > 1 && (
                      <button
                        type="button" onClick={() => removeAddPack(i)}
                        style={{
                          position: 'absolute', top: -6, right: -6,
                          width: 18, height: 18, borderRadius: 99,
                          background: 'var(--fb-card)', border: '1px solid var(--fb-border-strong)',
                          color: 'var(--fb-red)', fontSize: 10, lineHeight: 1, cursor: 'pointer',
                        }}
                      >✕</button>
                    )}
                  </div>
                ))}
                <button
                  type="button" onClick={addBlankAddPack}
                  style={{
                    padding: '6px 14px', borderRadius: 99,
                    background: 'transparent', border: '1px dashed var(--fb-border-strong)',
                    color: 'var(--fb-text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    transition: 'all .3s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--fb-accent)'; e.currentTarget.style.color = 'var(--fb-accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--fb-border-strong)'; e.currentTarget.style.color = 'var(--fb-text-2)'; }}
                >+ {t('foods.addPack')}</button>
              </div>

              {!addForm.is_bulk && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  padding: '8px 12px',
                  background: 'var(--fb-bg)', border: '1px solid var(--fb-border)',
                  borderRadius: 12,
                }}>
                  <span style={{ ...eyebrow }}>{t('foods.pieceInPack')}</span>
                  <div style={{
                    display: 'inline-flex', alignItems: 'baseline', gap: 4,
                    padding: '4px 10px', borderRadius: 99,
                    background: 'var(--fb-card)', border: '1px solid var(--fb-border)',
                  }}>
                    <input
                      type="text" inputMode="decimal" value={addForm.piece_grams}
                      onChange={e => patch({ piece_grams: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && handleAdd()}
                      placeholder="0"
                      className="tnum"
                      style={{ ...inlineInput, width: 44, fontSize: 12, fontWeight: 600, textAlign: 'right' }}
                    />
                    <span style={{ ...serifItalic, fontSize: 11, color: 'var(--fb-text-3)' }}>g</span>
                  </div>
                </div>
              )}
            </div>

            {/* Shelf-life trio — mini bento */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
            }}>
              <ShelfMini
                label={t('foods.openedDays')}
                unit="d"
                value={addForm.opened_days}
                onChange={v => patch({ opened_days: v })}
              />
              <ShelfMini
                label={t('foods.discardThreshold')}
                unit="%"
                value={addForm.discard_threshold_pct}
                onChange={v => patch({ discard_threshold_pct: v })}
              />
              <ShelfMini
                label={t('foods.pricePer100g').replace('{cur}', settings.currency_symbol ?? '€')}
                unit={settings.currency_symbol ?? '€'}
                value={addForm.price_per_100g}
                onChange={v => patch({ price_per_100g: v })}
              />
            </div>

            {/* Footer CTA */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
              flexWrap: 'wrap', paddingTop: 6,
            }}>
              {onImport && (
                <button
                  type="button" onClick={onImport}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--fb-border-strong)',
                    color: 'var(--fb-text-2)',
                    padding: '10px 20px', borderRadius: 99,
                    fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    transition: 'all .3s ease',
                  }}
                >
                  {t('import.foods')}
                </button>
              )}
              <button
                type="button" onClick={handleAdd}
                disabled={!addForm.name.trim() || !addForm.calories}
                className="addfood-cta"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'var(--fb-accent)', color: 'white',
                  border: 0, padding: '8px 8px 8px 22px', borderRadius: 99,
                  fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                  opacity: (!addForm.name.trim() || !addForm.calories) ? 0.4 : 1,
                  transition: 'all .35s cubic-bezier(0.32,0.72,0,1)',
                  boxShadow: '0 4px 18px -6px rgba(217,119,6,0.5)',
                }}
              >
                {t('common.add')}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 99,
                  background: 'rgba(255,255,255,0.18)',
                  fontSize: 14, lineHeight: 1,
                  transition: 'transform .35s cubic-bezier(0.32,0.72,0,1)',
                }} className="addfood-cta-icon">↗</span>
              </button>
            </div>

          </div>
        )}
      </section>

      {/* Inline keyframes + responsive overrides */}
      <style>{`
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .addfood-cta:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 8px 28px -8px rgba(217,119,6,0.6); }
        .addfood-cta:not(:disabled):hover .addfood-cta-icon { transform: translate(2px, -2px); }
        .addfood-cta:not(:disabled):active { transform: scale(0.98); }
        @media (max-width: 720px) {
          .addfood-macro-grid {
            grid-template-columns: 1fr 1fr !important;
            grid-template-areas:
              "kcal kcal"
              "protein carbs"
              "fat fiber" !important;
          }
        }
      `}</style>

      <Modal isOpen={scannerOpen} onClose={() => { setScannerOpen(false); setScannerTab('scan'); }} title={t('barcode.scanTitle')}>
        {/* Apple-style segmented control */}
        <div style={{
          position: 'relative',
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          padding: 4,
          background: 'var(--fb-bg)',
          border: '1px solid var(--fb-border)',
          borderRadius: 99,
          marginBottom: 16,
        }}>
          <span style={{
            position: 'absolute', top: 4, bottom: 4,
            left: scannerTab === 'scan' ? 4 : 'calc(50% + 0px)',
            width: 'calc(50% - 4px)',
            background: 'var(--fb-card)',
            border: '1px solid var(--fb-border-strong)',
            borderRadius: 99,
            transition: 'left .4s cubic-bezier(0.32,0.72,0,1)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
          }} />
          {(['scan', 'search'] as const).map(tab => (
            <button
              key={tab} type="button" onClick={() => setScannerTab(tab)}
              style={{
                position: 'relative', zIndex: 1,
                background: 'transparent', border: 0, cursor: 'pointer',
                padding: '8px 14px',
                fontSize: 12.5, fontWeight: 600, letterSpacing: 0.2,
                color: scannerTab === tab ? 'var(--fb-text)' : 'var(--fb-text-2)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                transition: 'color .3s ease',
              }}
            >
              {tab === 'scan' ? <>📷 Scansiona</> : <>🔍 Cerca per nome</>}
            </button>
          ))}
        </div>

        <div style={{
          background: 'var(--fb-bg)',
          border: '1px solid var(--fb-border)',
          borderRadius: 18,
          padding: 14,
        }}>
          {scannerTab === 'scan' && <BarcodeScanner onResult={handleScanResult} />}
          {scannerTab === 'search' && <FoodNameSearch onResult={handleNameSearchResult} />}
        </div>
      </Modal>
    </>
  );
}

// ── iOS-style toggle ─────────────────────────────────────────────────────────
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      fontSize: 11.5, color: 'var(--fb-text-2)', fontWeight: 500,
      cursor: 'pointer', userSelect: 'none',
    }}>
      <span
        role="switch" aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative', width: 32, height: 18, borderRadius: 99,
          background: checked ? 'var(--fb-accent)' : 'var(--fb-bg-2)',
          border: '1px solid ' + (checked ? 'var(--fb-accent)' : 'var(--fb-border-strong)'),
          transition: 'background .3s cubic-bezier(0.32,0.72,0,1)',
          flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 1, left: checked ? 15 : 1,
          width: 14, height: 14, borderRadius: '50%',
          background: 'white',
          transition: 'left .3s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </span>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: 'none' }} />
    </label>
  );
}

// ── Mini shelf-life tile ─────────────────────────────────────────────────────
function ShelfMini({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{
      background: 'var(--fb-bg)', border: '1px solid var(--fb-border)',
      borderRadius: 12, padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
    }}>
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--fb-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <input
          type="text" inputMode="decimal" value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="—"
          className="tnum"
          style={{
            background: 'transparent', border: 0, outline: 'none',
            fontFamily: 'var(--font-serif)', fontWeight: 300,
            fontSize: 22, letterSpacing: -0.8, color: 'var(--fb-text)',
            width: '100%', minWidth: 0, padding: 0,
          }}
        />
        <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 11, color: 'var(--fb-text-3)', flexShrink: 0 }}>
          {unit}
        </span>
      </div>
    </div>
  );
}
