import { useEffect, useState } from 'react';
import Modal from '../Modal';
import ConfirmDialog from '../ConfirmDialog';
import { useT } from '../../i18n/useT';
import { useToast } from '../Toast';
import { api } from '../../api';

interface ImportDialogProps {
  filePath: string;
  onClose: () => void;
  onDone: () => void;
}

type Mode = 'merge' | 'replace';
type DomainPlan = { include: boolean; mode: Mode };

export default function ImportDialog({ filePath, onClose, onDone }: ImportDialogProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [plan, setPlan]     = useState<Record<string, DomainPlan>>({});
  const [meta, setMeta]     = useState<{ schemaVersion: number | null; range: { start: string; end: string } | null }>({ schemaVersion: null, range: null });
  const [error, setError]   = useState<string | null>(null);
  const [busy, setBusy]     = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  useEffect(() => {
    api.import.plan(filePath).then(r => {
      if (!r.ok) { setError(r.error ?? 'parse_failed'); return; }
      setMeta({ schemaVersion: r.schemaVersion, range: r.range });
      setCounts(r.counts);
      const init: Record<string, DomainPlan> = {};
      for (const [k, n] of Object.entries(r.counts)) {
        init[k] = { include: n > 0, mode: 'merge' };
      }
      setPlan(init);
    });
  }, [filePath]);

  function setInclude(domain: string, include: boolean) {
    setPlan(p => ({ ...p, [domain]: { ...(p[domain] ?? { mode: 'merge' as Mode }), include } }));
  }
  function setMode(domain: string, mode: Mode) {
    setPlan(p => ({ ...p, [domain]: { ...(p[domain] ?? { include: true }), mode } }));
  }

  const hasReplace = Object.values(plan).some(p => p.include && p.mode === 'replace');
  const includedCount = Object.entries(plan).filter(([k, p]) => p.include && counts[k] > 0).length;

  async function execute() {
    setBusy(true);
    const r = await api.import.execute({ filePath, plan });
    setBusy(false);
    if (r.ok) {
      const total = Object.values(r.stats).reduce((s, n) => s + n, 0);
      showToast(`${t('import.done')}: ${total}`);
      onDone();
    }
  }

  function handleConfirm() {
    if (hasReplace) setConfirmReplace(true);
    else execute();
  }

  if (error) {
    return (
      <Modal isOpen onClose={onClose} title={t('import.dialogTitle')}>
        <p className="text-sm text-red">{t('import.parseFailed')}: {error}</p>
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="text-sm border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 cursor-pointer">{t('common.close')}</button>
        </div>
      </Modal>
    );
  }

  const domains = Object.keys(counts);

  return (
    <Modal isOpen onClose={onClose} title={t('import.dialogTitle')}>
      <div className="space-y-3">
        <div className="text-xs text-text-sec">
          {meta.schemaVersion != null && <span>schema v{meta.schemaVersion}</span>}
          {meta.range && <span> · {meta.range.start} → {meta.range.end}</span>}
        </div>

        {domains.length === 0 ? (
          <p className="text-sm text-text-sec">{t('import.empty')}</p>
        ) : (
          <ul className="space-y-1 max-h-[55vh] overflow-auto">
            {domains.map(d => {
              const n = counts[d];
              const cfg = plan[d] ?? { include: false, mode: 'merge' as Mode };
              const disabled = n === 0;
              return (
                <li key={d} className={['flex items-center gap-2 rounded-lg border border-border px-3 py-1.5', disabled ? 'opacity-50' : ''].join(' ')}>
                  <input
                    type="checkbox"
                    checked={cfg.include}
                    disabled={disabled}
                    onChange={e => setInclude(d, e.target.checked)}
                    className="cursor-pointer accent-accent"
                  />
                  <span className="flex-1 min-w-0 text-sm text-text font-mono">{d}</span>
                  <span className="text-xs text-text-sec tabular-nums w-16 text-right">{n}</span>
                  <select
                    value={cfg.mode}
                    onChange={e => setMode(d, e.target.value as Mode)}
                    disabled={disabled || !cfg.include}
                    className="text-xs bg-bg border border-border rounded px-1.5 py-0.5 text-text outline-none focus:border-accent disabled:opacity-40"
                  >
                    <option value="merge">{t('import.merge')}</option>
                    <option value="replace">{t('import.replace')}</option>
                  </select>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-text-sec">{t('import.hint')}</p>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button onClick={onClose} className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text cursor-pointer transition-colors">{t('common.cancel')}</button>
          <button
            onClick={handleConfirm}
            disabled={busy || includedCount === 0}
            className="text-sm bg-accent text-white rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-40 cursor-pointer transition-opacity"
          >{busy ? '…' : t('import.go')}</button>
        </div>
      </div>

      {confirmReplace && (
        <ConfirmDialog
          message={t('import.confirmReplaceMsg')}
          confirmLabel={t('import.go')}
          cancelLabel={t('common.cancel')}
          dangerous
          onConfirm={() => { setConfirmReplace(false); execute(); }}
          onCancel={() => setConfirmReplace(false)}
        />
      )}
    </Modal>
  );
}
