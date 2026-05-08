import { useEffect, useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../i18n/useT';
import { api } from '../../api';
import type { Food, SimilarFood } from '../../types';

interface GroupWithDialogProps {
  food: Food;
  onClose: () => void;
  onGrouped: () => void;
}

export default function GroupWithDialog({ food, onClose, onGrouped }: GroupWithDialogProps) {
  const { t } = useT();
  const [candidates, setCandidates] = useState<SimilarFood[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.foods.findSimilar({
      name: food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      exclude_id: food.id,
      nameMin: 0.3,
      macroPctMax: 0.30,
      limit: 10,
    }).then(rows => {
      setCandidates(rows);
      setLoading(false);
    });
  }, [food.id]);

  async function pick(canonical: Food) {
    await api.foods.groupAs({ variant_id: food.id, canonical_id: canonical.id, recompute: true });
    onGrouped();
  }

  return (
    <Modal isOpen onClose={onClose} title={t('foods.groupWith')}>
      <div className="space-y-3">
        <p className="text-sm text-text-sec">
          <span className="font-medium text-text">{food.name}</span> {t('foods.willBeVariantOf')}
        </p>
        {loading ? (
          <p className="text-sm text-text-sec">…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-text-sec">{t('foods.noCandidates')}</p>
        ) : (
          <ul className="space-y-1.5 max-h-[50vh] overflow-auto">
            {candidates.map(c => (
              <li key={c.id}>
                <button
                  onClick={() => pick(c)}
                  className="w-full text-left rounded-lg border border-border hover:border-accent hover:bg-accent/5 transition-colors px-3 py-2 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-text font-medium">{c.name}</span>
                    <span className="text-xs text-text-sec tabular-nums">{c.calories} kcal</span>
                  </div>
                  <div className="text-xs text-text-sec tabular-nums">
                    P {c.protein} · C {c.carbs} · F {c.fat}
                    <span className="ml-2 text-accent">{t('foods.match')}: {Math.round((1 - c.macroDeltaPct) * 100)}%</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text cursor-pointer transition-colors"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
