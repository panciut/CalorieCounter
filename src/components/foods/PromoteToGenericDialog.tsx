import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../i18n/useT';
import { useToast } from '../Toast';
import { api } from '../../api';
import type { Food } from '../../types';

interface Props {
  food: Food;
  onClose: () => void;
  onPromoted: () => void;
}

export default function PromoteToGenericDialog({ food, onClose, onPromoted }: Props) {
  const { t } = useT();
  const { showToast } = useToast();
  const [name, setName] = useState(suggestGenericName(food.name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setBusy(true);
    setError(null);
    const r = await api.foods.promoteToGeneric({ from_id: food.id, name: name.trim() });
    setBusy(false);
    if (r.ok) {
      showToast(t('common.saved'));
      onPromoted();
    } else if (r.reason === 'name_taken') {
      setError(t('foods.promoteNameTaken'));
    } else {
      setError(r.reason || 'error');
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={t('foods.promoteTitle')}>
      <div className="space-y-3">
        <p className="text-sm text-text-sec">{t('foods.promoteHint').replace('{n}', String((food.variant_count ?? 0) + 1))}</p>

        <label className="space-y-1 block">
          <span className="text-xs text-text-sec">{t('foods.promoteNameLabel')}</span>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handle()}
            placeholder="e.g. Funghi Trifolati"
            className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-text outline-none focus:border-accent"
          />
        </label>

        {error && <p className="text-xs text-red">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            onClick={onClose}
            className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text cursor-pointer transition-colors"
          >{t('common.cancel')}</button>
          <button
            onClick={handle}
            disabled={busy || !name.trim()}
            className="text-sm bg-accent text-white rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-40 cursor-pointer transition-opacity"
          >{busy ? '…' : t('common.save')}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Strip common brand-y trailing tokens to suggest a clean generic name. */
function suggestGenericName(s: string): string {
  return s
    .replace(/\b(Coop|Lidl|Logro|Heinz|Calv[eè]|Maruzzella|Nixe|Barilla|Knorr|Pfanni|Tigullio|Findus|Saclà|Star|Mulino Bianco|Esselunga|Conad)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
