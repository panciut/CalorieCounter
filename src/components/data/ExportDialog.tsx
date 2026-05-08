import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../i18n/useT';
import { useToast } from '../Toast';
import { api } from '../../api';
import { today, addDays } from '../../lib/dateUtil';

type Format = 'markdown' | 'json' | 'meals_md';
type RangePreset = '30d' | '90d' | '1y' | 'all' | 'custom';

interface ExportDialogProps {
  onClose: () => void;
}

export default function ExportDialog({ onClose }: ExportDialogProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const todayStr = today();

  const [format, setFormat] = useState<Format>('markdown');
  const [preset, setPreset] = useState<RangePreset>('90d');
  const [customStart, setCustomStart] = useState<string>(addDays(todayStr, -90));
  const [customEnd,   setCustomEnd]   = useState<string>(todayStr);
  const [busy, setBusy] = useState(false);

  function rangeFor(p: RangePreset): { start?: string; end?: string } {
    if (p === 'custom') return { start: customStart, end: customEnd };
    if (p === 'all')    return {};
    const days = p === '30d' ? 30 : p === '90d' ? 90 : 365;
    return { start: addDays(todayStr, -days), end: todayStr };
  }

  async function handleExport() {
    setBusy(true);
    const { start, end } = rangeFor(preset);
    const r = await api.export.bundle({ format, start, end });
    setBusy(false);
    if (r.ok) { showToast(t('export.done')); onClose(); }
  }

  const formats: { id: Format; label: string; desc: string }[] = [
    { id: 'markdown', label: t('export.fmtMarkdown'), desc: t('export.fmtMarkdownHint') },
    { id: 'json',     label: t('export.fmtJson'),     desc: t('export.fmtJsonHint') },
    { id: 'meals_md', label: t('export.fmtMealsMd'),  desc: t('export.fmtMealsMdHint') },
  ];

  const presets: { id: RangePreset; label: string }[] = [
    { id: '30d', label: '30d' },
    { id: '90d', label: '90d' },
    { id: '1y',  label: '1y' },
    { id: 'all', label: t('export.rangeAll') },
    { id: 'custom', label: t('export.rangeCustom') },
  ];

  return (
    <Modal isOpen onClose={onClose} title={t('export.dialogTitle')}>
      <div className="space-y-4">
        {/* Format */}
        <div className="space-y-2">
          <label className="text-xs text-text-sec uppercase tracking-wider">{t('export.format')}</label>
          <div className="space-y-2">
            {formats.map(f => (
              <label key={f.id} className="flex items-start gap-2 cursor-pointer rounded-lg border border-border hover:border-accent/50 p-2 transition-colors">
                <input
                  type="radio"
                  name="fmt"
                  value={f.id}
                  checked={format === f.id}
                  onChange={() => setFormat(f.id)}
                  className="mt-0.5 cursor-pointer accent-accent"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text font-medium">{f.label}</div>
                  <div className="text-xs text-text-sec/80">{f.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Range */}
        <div className="space-y-2">
          <label className="text-xs text-text-sec uppercase tracking-wider">{t('export.range')}</label>
          <div className="flex flex-wrap gap-1.5">
            {presets.map(p => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={['text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer',
                  preset === p.id ? 'border-accent text-accent bg-accent/10' : 'border-border text-text-sec hover:border-accent/50'].join(' ')}
              >{p.label}</button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs text-text-sec">{t('export.start')}</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-2 py-1 text-sm text-text outline-none focus:border-accent"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-text-sec">{t('export.end')}</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-2 py-1 text-sm text-text outline-none focus:border-accent"
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            onClick={onClose}
            className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text cursor-pointer transition-colors"
          >{t('common.cancel')}</button>
          <button
            onClick={handleExport}
            disabled={busy}
            className="text-sm bg-accent text-white rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-40 cursor-pointer transition-opacity"
          >{busy ? '…' : t('export.go')}</button>
        </div>
      </div>
    </Modal>
  );
}
