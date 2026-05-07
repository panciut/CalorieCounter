import Modal from './Modal';
import { useT } from '../i18n/useT';
import type { ExerciseType } from '../types';
import { useExerciseImages } from '../hooks/useExerciseImages';

const CATEGORY_COLORS: Record<string, string> = {
  cardio:      'bg-blue-500/15 text-blue-400',
  strength:    'bg-orange-500/15 text-orange-400',
  flexibility: 'bg-green-500/15 text-green-400',
  other:       'bg-text-sec/15 text-text-sec',
};

interface Props {
  exercise: ExerciseType;
  onClose: () => void;
  onEdit: () => void;
}

export default function ExerciseDetailModal({ exercise, onClose, onEdit }: Props) {
  const { t } = useT();
  const { images, loading } = useExerciseImages(exercise.name);

  const muscles = exercise.muscle_groups ? exercise.muscle_groups.split(',').filter(Boolean) : [];
  const equips  = exercise.equipment ? exercise.equipment.split(',').filter(Boolean) : [];

  return (
    <Modal isOpen onClose={onClose} width="max-w-xl">
      <div className="flex flex-col gap-5 p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold text-text">{exercise.name}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${CATEGORY_COLORS[exercise.category] ?? CATEGORY_COLORS.other}`}>
                {t(`category.${exercise.category}` as Parameters<typeof t>[0])}
              </span>
              {!!exercise.is_custom && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
                  {t('exercise.library.customBadge')}
                </span>
              )}
              <span className="text-xs text-text-sec">MET {exercise.met_value}</span>
            </div>
          </div>
        </div>

        {/* Visualizer (API images) */}
        {!loading && images.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-2">
            {images.slice(0, 2).map((src, i) => (
              <img 
                key={i} 
                src={src} 
                alt={`${exercise.name} Step ${i + 1}`}
                className="w-full h-auto rounded-xl object-contain bg-white/5 border border-white/5 shadow-sm"
                loading="lazy"
              />
            ))}
          </div>
        )}

        {/* Muscle groups */}
        {muscles.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-text-sec uppercase tracking-wider">{t('exercise.library.muscleGroups')}</div>
            <div className="flex flex-wrap gap-1.5">
              {muscles.map(m => (
                <span key={m} className="text-sm px-3 py-1 rounded-full bg-bg border border-border text-text">
                  {t(`muscle.${m}` as Parameters<typeof t>[0])}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Equipment */}
        {equips.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-text-sec uppercase tracking-wider">{t('exercise.library.equipment')}</div>
            <div className="flex flex-wrap gap-1.5">
              {equips.map(eq => (
                <span key={eq} className="text-sm px-3 py-1 rounded-full bg-bg border border-border text-text-sec">
                  {t(`equip.${eq}` as Parameters<typeof t>[0])}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-text-sec uppercase tracking-wider">{t('exercise.library.instructions')}</div>
          {exercise.instructions ? (
            <p className="text-sm text-text leading-relaxed whitespace-pre-wrap bg-bg border border-border rounded-xl p-4">
              {exercise.instructions}
            </p>
          ) : (
            <p className="text-sm text-text-sec italic">{t('exercise.detail.noInstructions')}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end border-t border-border pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-text-sec border border-border hover:bg-card-hover cursor-pointer"
          >
            {t('exercise.library.cancel')}
          </button>
          <button
            onClick={onEdit}
            className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:opacity-90 cursor-pointer"
          >
            {t('common.edit')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
