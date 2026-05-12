import { useState, useEffect } from 'react';
import { useT } from '../i18n/useT';
import { api } from '../api';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import { addDays } from '../lib/dateUtil';

interface CopyDayModalProps {
  isOpen: boolean;
  initialDate: string;
  onClose: () => void;
  onCopied: (copied: number) => void;
}

export default function CopyDayModal({ isOpen, initialDate, onClose, onCopied }: CopyDayModalProps) {
  const { t } = useT();
  const [from, setFrom] = useState(initialDate);
  const [to, setTo] = useState(addDays(initialDate, 1));
  const [fromCount, setFromCount] = useState(0);
  const [toCount, setToCount] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFrom(initialDate);
    setTo(addDays(initialDate, 1));
  }, [isOpen, initialDate]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    async function fetchCounts() {
      const [a, b] = await Promise.all([
        from ? api.log.getDay(from) : Promise.resolve([]),
        to   ? api.log.getDay(to)   : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setFromCount(a.filter(e => e.status === 'logged').length);
      setToCount(b.length);
    }
    fetchCounts();
    return () => { cancelled = true; };
  }, [isOpen, from, to]);

  const sameDate = !!from && !!to && from === to;
  const canCopy  = !!from && !!to && !sameDate && fromCount > 0;

  const inputCls = 'w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent';

  async function handleConfirm() {
    const { copied } = await api.log.copyDay({ from, to });
    setConfirmOpen(false);
    onCopied(copied);
    onClose();
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={t('copyDay.title')}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-sec">{t('copyDay.from')}</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-sec">{t('copyDay.to')}</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="text-xs bg-bg rounded-lg px-3 py-2 text-text-sec text-center">
            {sameDate
              ? <span className="text-yellow">{t('swap.sameDate')}</span>
              : fromCount === 0
                ? <span style={{ color: 'var(--fb-text-3)' }}>{t('copyDay.noSource')}</span>
                : <span>
                    <span className="text-text font-medium">{fromCount}</span> {t('copyDay.entriesCount')}
                    {toCount > 0 && <span style={{ color: '#d97706' }}> · {t('copyDay.destHasData')}</span>}
                  </span>
            }
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-text-sec border border-border rounded-lg cursor-pointer hover:text-text">
              {t('common.cancel')}
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={!canCopy}
              className="px-4 py-2 text-sm bg-accent text-white rounded-lg cursor-pointer hover:opacity-90 disabled:opacity-40 font-medium"
            >
              {t('copyDay.submit')}
            </button>
          </div>
        </div>
      </Modal>

      {confirmOpen && (
        <ConfirmDialog
          message={t('copyDay.confirmMsg')
            .replace('{n}', String(fromCount))
            .replace('{from}', from)
            .replace('{to}', to)
            .replace('{dest}', String(toCount))}
          confirmLabel={t('copyDay.submit')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}
