import { useState, useEffect } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { BulkRefillModal, BulkMatchModal } from '../components/BulkOffOpsModal';
import OffLocalCard from '../components/OffLocalCard';
import { copyToClipboard } from '../lib/exportText';
import { useT } from '../i18n/useT';
import PageHeader from '../components/ui/PageHeader';

// ── Shared styles ─────────────────────────────────────────────────────────────

const btn = (variant: 'default' | 'danger' = 'default') => [
  'px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer',
  variant === 'danger'
    ? 'bg-card border-border text-red hover:border-red/60'
    : 'bg-card border-border text-text hover:border-accent/60',
].join(' ');

const card = 'bg-card border border-border rounded-xl p-4 space-y-3';
const sectionTitle = 'text-base font-semibold text-text';
const desc = 'text-sm text-text-sec';

// ── AI prompt guide ───────────────────────────────────────────────────────────

const AI_PROMPT = `Generate a JSON array of foods for a calorie tracking app.
Each food object must have:
  - "name": string (food name, in English)
  - "calories": number (kcal per 100g or 100ml)
  - "protein": number (g per 100g)
  - "carbs": number (g per 100g)
  - "fat": number (g per 100g)
  - "fiber": number (g per 100g, optional, default 0)
  - "piece_grams": number or null (grams per piece, e.g. 60 for an egg, null if N/A)
  - "is_liquid": 0 or 1 (1 for drinks/liquids measured in ml, 0 otherwise)
  - "is_bulk": 0 or 1 (1 for bulk staples sold loose — rice, flour, oats, sugar; 0 for packaged items)
  - "opened_days": number or null (typical shelf life in days once opened/cooked; null if indefinite or N/A)

Rules:
- All macro values are PER 100g (or per 100ml for liquids)
- Only "name" and "calories" are strictly required; all others default to 0/null
- Return ONLY the raw JSON array, no markdown, no explanation

Example output:
[
  { "name": "Chicken Breast", "calories": 165, "protein": 31, "carbs": 0, "fat": 3.6, "fiber": 0, "piece_grams": null, "is_liquid": 0, "is_bulk": 0, "opened_days": 3 },
  { "name": "Whole Egg", "calories": 155, "protein": 13, "carbs": 1.1, "fat": 11, "fiber": 0, "piece_grams": 60, "is_liquid": 0, "is_bulk": 0, "opened_days": null },
  { "name": "Whole Milk", "calories": 61, "protein": 3.2, "carbs": 4.8, "fat": 3.3, "fiber": 0, "piece_grams": null, "is_liquid": 1, "is_bulk": 0, "opened_days": 5 },
  { "name": "Brown Rice (uncooked)", "calories": 362, "protein": 7.5, "carbs": 76, "fat": 2.7, "fiber": 3.4, "piece_grams": null, "is_liquid": 0, "is_bulk": 1, "opened_days": null }
]

Now generate foods for: [DESCRIBE YOUR FOODS HERE]`;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DataPage() {
  const { showToast } = useToast();
  const { t } = useT();

  const [importing, setImporting]         = useState(false);
  const [pasteText, setPasteText]         = useState('');
  const [pasteError, setPasteError]       = useState('');
  const [promptCopied, setPromptCopied]   = useState(false);
  const [foodsCopied, setFoodsCopied]     = useState(false);
  const [pantryCopied, setPantryCopied]   = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restorePath, setRestorePath]     = useState('');
  const [refillOpen, setRefillOpen]       = useState(false);
  const [refillRefreshMacros, setRefillRefreshMacros] = useState(false);
  const [matchOpen, setMatchOpen]         = useState(false);

  // ── Export ──────────────────────────────────────────────────────────────────

  async function handleExportData(format: 'json' | 'csv') {
    const result = await api.export.data(format);
    if (result.ok) showToast('Exported successfully');
  }

  async function handleExportFoods() {
    const result = await api.export.foods();
    if (result.ok) showToast(`Exported ${result.count} foods`);
  }

  async function handleCopyFoods() {
    const foods = await api.foods.getAll();
    const json = JSON.stringify(foods.map(({ name, calories, protein, carbs, fat, fiber, piece_grams, is_liquid, is_bulk, opened_days, barcode, favorite }) =>
      ({ name, calories, protein, carbs, fat, fiber, piece_grams, is_liquid, is_bulk, opened_days, barcode, favorite })
    ), null, 2);
    await copyToClipboard(json);
    setFoodsCopied(true);
    setTimeout(() => setFoodsCopied(false), 2000);
  }

  async function handleExportPantry() {
    const result = await api.export.pantry();
    if (result.ok) showToast(`Exported ${result.count} pantry batches`);
  }

  async function handleCopyPantry() {
    const pantry = await api.pantry.getAll();
    const json = JSON.stringify(pantry.map(({ food_name, quantity_g, expiry_date, package_grams, opened_at, opened_days }) =>
      ({ food_name, quantity_g, expiry_date, package_grams, opened_at, opened_days })
    ), null, 2);
    await copyToClipboard(json);
    setPantryCopied(true);
    setTimeout(() => setPantryCopied(false), 2000);
  }

  async function handleExportBackup() {
    const result = await api.export.backup();
    if (result.ok) showToast('Database backup saved');
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  async function handleImportFoods() {
    const filePath = await api.import.selectFile(['csv', 'json']);
    if (!filePath) return;
    setImporting(true);
    try {
      const result = await api.import.foods(filePath);
      showToast(`Imported ${result.imported} foods (${result.skipped} skipped)`);
    } finally { setImporting(false); }
  }

  async function handlePasteImport() {
    if (!pasteText.trim()) return;
    setPasteError('');
    setImporting(true);
    try {
      const result = await api.import.foodsFromText(pasteText);
      if (!result.ok) {
        setPasteError(result.error ?? 'Import failed');
      } else {
        showToast(`Imported ${result.imported} foods (${result.skipped} skipped)`);
        setPasteText('');
      }
    } finally { setImporting(false); }
  }

  async function handleImportFullJson() {
    const filePath = await api.import.selectFile(['json']);
    if (!filePath) return;
    setImporting(true);
    try {
      const result = await api.import.fullJson(filePath);
      if (result.ok) {
        const s = result.stats;
        showToast(`Imported: ${s.foods} foods, ${s.log} log, ${s.weight} weight, ${s.exercises} exercises`);
      }
    } finally { setImporting(false); }
  }

  async function handlePickRestoreFile() {
    const filePath = await api.import.selectFile(['db']);
    if (!filePath) return;
    setRestorePath(filePath);
    setConfirmRestore(true);
  }

  async function handleConfirmRestore() {
    setConfirmRestore(false);
    const result = await api.import.backup(restorePath);
    if (!result.ok) showToast(result.error ?? 'Restore failed');
  }

  async function copyPrompt() {
    await copyToClipboard(AI_PROMPT);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader eyebrow={t('eyebrow.data')} title={t('page.data')} />

      {/* ── Export ─────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-text-sec uppercase tracking-wider">{t('data.export')}</h2>

        <div className={card}>
          <p className={sectionTitle}>{t('data.exportData')}</p>
          <p className={desc}>{t('data.exportDataDesc')}</p>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => handleExportData('json')} className={btn()}>{t('data.exportJson')}</button>
            <button onClick={() => handleExportData('csv')}  className={btn()}>{t('data.exportCsv')}</button>
          </div>
        </div>

        <div className={card}>
          <p className={sectionTitle}>{t('data.exportFoods')}</p>
          <p className={desc}>{t('data.exportFoodsDesc')}</p>
          <div className="flex gap-3 flex-wrap">
            <button onClick={handleExportFoods} className={btn()}>{t('data.exportFoodsBtn')}</button>
            <button onClick={handleCopyFoods} className={btn()}>
              {foodsCopied ? t('data.copied') : t('data.copyToClipboard')}
            </button>
          </div>
        </div>

        <div className={card}>
          <p className={sectionTitle}>{t('data.exportPantry')}</p>
          <p className={desc}>{t('data.exportPantryDesc')}</p>
          <div className="flex gap-3 flex-wrap">
            <button onClick={handleExportPantry} className={btn()}>{t('data.exportPantryBtn')}</button>
            <button onClick={handleCopyPantry} className={btn()}>
              {pantryCopied ? t('data.copied') : t('data.copyToClipboard')}
            </button>
          </div>
        </div>

        <div className={card}>
          <p className={sectionTitle}>{t('data.exportBackup')}</p>
          <p className={desc}>{t('data.exportBackupDesc')}</p>
          <button onClick={handleExportBackup} className={btn()}>{t('data.exportBackupBtn')}</button>
        </div>
      </section>

      {/* ── Import ─────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-text-sec uppercase tracking-wider">{t('data.import')}</h2>

        {/* Foods — paste or file */}
        <div className={card}>
          <p className={sectionTitle}>{t('data.importFoods')}</p>
          <p className={desc}>{t('data.importFoodsDesc')}</p>

          {/* AI guide */}
          <div className="rounded-lg border border-border bg-bg p-4 space-y-3">
            <p className="text-sm font-medium text-text">{t('data.aiGenerate')}</p>
            <p className="text-sm text-text-sec">{t('data.aiGenerateDesc')}</p>
            <div className="relative">
              <pre className="text-xs text-text-sec font-mono bg-card border border-border rounded-lg p-3 whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">{AI_PROMPT}</pre>
              <button
                onClick={copyPrompt}
                className="absolute top-2 right-2 text-xs px-2 py-1 rounded border border-border bg-bg text-text-sec hover:border-accent hover:text-accent cursor-pointer transition-colors"
              >
                {promptCopied ? t('data.copied') : t('data.copy')}
              </button>
            </div>
          </div>

          {/* Format reference */}
          <details className="group">
            <summary className="text-xs text-text-sec cursor-pointer hover:text-text select-none">{t('data.formatRef')}</summary>
            <div className="mt-2 rounded-lg border border-border bg-bg p-3 space-y-2">
              <p className="text-xs text-text-sec">A plain JSON array. Only <code className="text-accent">name</code> and <code className="text-accent">calories</code> are required. All values are per 100g (or 100ml for liquids).</p>
              <pre className="text-xs font-mono text-text-sec overflow-x-auto">{`[
  {
    "name": "Chicken Breast",   // required
    "calories": 165,            // required — kcal per 100g
    "protein": 31,              // optional, default 0
    "carbs": 0,                 // optional, default 0
    "fat": 3.6,                 // optional, default 0
    "fiber": 0,                 // optional, default 0
    "piece_grams": null,        // optional — g per piece (e.g. 60 for egg)
    "is_liquid": 0,             // optional — 1 for drinks, 0 otherwise
    "is_bulk": 0,               // optional — 1 for bulk staples (rice, flour)
    "opened_days": null         // optional — shelf life in days once opened
  }
]`}</pre>
            </div>
          </details>

          {/* Paste area */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-text">{t('data.pasteOrFile')}</p>
            <textarea
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); setPasteError(''); }}
              placeholder={'[\n  { "name": "Chicken Breast", "calories": 165, "protein": 31, "carbs": 0, "fat": 3.6 },\n  ...\n]'}
              rows={7}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text font-mono placeholder:text-text-sec/40 focus:outline-none focus:border-accent resize-y"
            />
            {pasteError && <p className="text-xs text-red">{pasteError}</p>}
            <div className="flex gap-3 flex-wrap">
              <button onClick={handlePasteImport} disabled={importing || !pasteText.trim()} className={btn()}>
                {importing ? t('data.importing') : t('data.importPasted')}
              </button>
              <button onClick={handleImportFoods} disabled={importing} className={btn()}>
                {importing ? t('data.importing') : t('data.importFile')}
              </button>
            </div>
          </div>
        </div>

        {/* Full JSON export re-import */}
        <div className={card}>
          <p className={sectionTitle}>{t('data.importFullJson')}</p>
          <p className={desc}>{t('data.importFullDesc')}</p>
          <button onClick={handleImportFullJson} disabled={importing} className={btn()}>
            {importing ? t('data.importing') : t('data.importFullBtn')}
          </button>
        </div>

        {/* Restore DB */}
        <div className={card}>
          <p className={sectionTitle}>{t('data.restoreBackup')}</p>
          <p className={desc}>
            <span className="text-red font-medium">{t('data.restoreReplaces')}</span>
          </p>
          <button onClick={handlePickRestoreFile} className={btn('danger')}>
            {t('data.restoreFromBackup')}
          </button>
        </div>

        {/* Local Open Food Facts copy */}
        <OffLocalCard />

        {/* Open Food Facts bulk operations */}
        <div className={card}>
          <p className={sectionTitle}>{t('data.refillNutrition')}</p>
          <p className={desc}>{t('data.refillDesc')}</p>
          <label className="flex items-center gap-2 text-sm text-text-sec cursor-pointer">
            <input
              type="checkbox"
              checked={refillRefreshMacros}
              onChange={e => setRefillRefreshMacros(e.target.checked)}
            />
            {t('data.refillRefreshMacros')}
          </label>
          <button onClick={() => setRefillOpen(true)} className={btn()}>
            {t('data.refillNutrition')}
          </button>
        </div>

        <div className={card}>
          <p className={sectionTitle}>{t('data.matchBarcodes')}</p>
          <p className={desc}>{t('data.matchBarcodesDesc')}</p>
          <button onClick={() => setMatchOpen(true)} className={btn()}>
            {t('data.matchBarcodes')}
          </button>
        </div>
      </section>

      {confirmRestore && (
        <ConfirmDialog
          message={t('data.restoreConfirm')}
          confirmLabel={t('data.restoreAndRestart')}
          dangerous
          onConfirm={handleConfirmRestore}
          onCancel={() => setConfirmRestore(false)}
        />
      )}

      <BulkRefillModal
        isOpen={refillOpen}
        refreshMacros={refillRefreshMacros}
        onClose={() => setRefillOpen(false)}
        onDone={(s) => {
          setRefillOpen(false);
          showToast(`${t('data.refillDone')}: ✓${s.updated} · ${s.skipped} ${t('data.skipped')} · ${s.failed} ${t('data.failed')}`);
        }}
      />

      <BulkMatchModal
        isOpen={matchOpen}
        onClose={() => setMatchOpen(false)}
        onDone={(s) => {
          showToast(`${t('data.matchDone')}: ✓${s.auto} ${t('data.autoMatched')} · ✓${s.manual} · ↷${s.skipped} · —${s.none}`);
        }}
      />

      <ActionLog />
    </div>
  );
}

// ── Action log viewer ─────────────────────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  'log:add':       '+ logged',
  'log:delete':    '− deleted',
  'pantry:add':    '+ stocked',
  'pantry:discard':'× discarded',
};

const KIND_COLOR: Record<string, string> = {
  'log:add':       'text-accent',
  'log:delete':    'text-text-sec',
  'pantry:add':    'text-green-500',
  'pantry:discard':'text-red',
};

function ActionLog() {
  const { t } = useT();
  const [rows, setRows] = useState<{ id: number; kind: string; food_name: string | null; grams: number | null; details: string | null; ts: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) api.actionLog.getRecent(300).then(setRows);
  }, [open]);

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-text-sec uppercase tracking-wider">{t('data.actionLog')}</h2>
      <div className={card}>
        <div className="flex items-center justify-between">
          <p className={sectionTitle}>{t('data.recentActions')}</p>
          <button onClick={() => setOpen(v => !v)} className={btn()}>
            {open ? t('data.hideLog') : t('data.showLog')}
          </button>
        </div>
        {open && (
          <div className="overflow-auto max-h-96 rounded-lg border border-border">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-card border-b border-border text-text-sec">
                  <th className="px-3 py-2 text-left">{t('data.thTime')}</th>
                  <th className="px-3 py-2 text-left">{t('data.thAction')}</th>
                  <th className="px-3 py-2 text-left">{t('data.thFood')}</th>
                  <th className="px-3 py-2 text-right">{t('data.thGrams')}</th>
                  <th className="px-3 py-2 text-left">{t('data.thDetails')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const det = r.details ? (() => { try { return JSON.parse(r.details); } catch { return {}; } })() : {};
                  return (
                    <tr key={r.id} className="border-t border-border/40 hover:bg-card/30">
                      <td className="px-3 py-1.5 tabular-nums text-text-sec whitespace-nowrap">
                        {r.ts.replace('T', ' ').slice(0, 16)}
                      </td>
                      <td className={`px-3 py-1.5 font-medium whitespace-nowrap ${KIND_COLOR[r.kind] ?? 'text-text-sec'}`}>
                        {KIND_LABEL[r.kind] ?? r.kind}
                      </td>
                      <td className="px-3 py-1.5 text-text">{r.food_name ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-text-sec">
                        {r.grams != null ? `${Math.round(r.grams)}g` : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-text-sec">
                        {det.meal ? det.meal : det.expiry_date ? `exp ${det.expiry_date}` : ''}
                        {det.date ? ` · ${det.date}` : ''}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-text-sec">{t('data.noActions')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
