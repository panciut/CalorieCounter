import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../i18n/useT';
import { api } from '../../api';
import type { Meal, MealTemplateSummary, MealTemplate } from '../../types';

interface CellMenuModalProps {
  date: string;
  meal: Meal;
  /** Whether the cell currently has any entries (controls "Save as template" availability). */
  hasEntries: boolean;
  onClose: () => void;
  onChanged: () => void;
}

/** Lists single-meal templates matching the cell's slot, lets the user apply one
 *  (with optional replace), and offers a "Save this meal as template" action. */
export default function CellMenuModal({ date, meal, hasEntries, onClose, onChanged }: CellMenuModalProps) {
  const { t } = useT();
  const [summaries, setSummaries] = useState<MealTemplateSummary[]>([]);
  const [details, setDetails] = useState<Map<number, MealTemplate>>(new Map());
  const [replace, setReplace] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [saveName, setSaveName] = useState('');

  useEffect(() => {
    api.templates.getAll().then(async list => {
      setSummaries(list);
      // Fetch details for all templates so we can filter to single-meal ones
      // matching this cell's slot. Catalog is small in practice.
      const ds = await Promise.all(list.map(s => api.templates.get(s.id)));
      setDetails(new Map(ds.map(d => [d.id, d])));
    });
  }, []);

  const matching = useMemo(() => {
    return summaries.filter(s => {
      const d = details.get(s.id);
      if (!d || d.items.length === 0) return false;
      // Single-meal: every item shares the cell's meal slot
      return d.items.every(it => it.meal === meal);
    });
  }, [summaries, details, meal]);

  async function handleApply(id: number) {
    await api.templates.applyToCell({ id, date, target_meal: meal, replace });
    onChanged();
    onClose();
  }

  async function handleSave() {
    if (!saveName.trim()) return;
    setSaving(true);
    const r = await api.templates.createFromCell({ name: saveName.trim(), date, meal });
    setSaving(false);
    if (r.id != null) {
      onChanged();
      onClose();
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`${t('plan.applyMealTemplate')}`}>
      <div className="space-y-3">
        {matching.length === 0 ? (
          <p className="text-sm text-text-sec">{t('plan.noMealTemplates')}</p>
        ) : (
          <>
            <ul className="space-y-1.5 max-h-[40vh] overflow-auto">
              {matching.map(s => {
                const d = details.get(s.id);
                const kcal = d ? Math.round(d.items.reduce((acc, it) => acc + (it.calories || 0), 0)) : 0;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => handleApply(s.id)}
                      className="w-full text-left rounded-lg border border-border hover:border-accent hover:bg-accent/5 transition-colors px-3 py-2 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-text font-medium">{s.name}</span>
                        <span className="text-xs text-text-sec tabular-nums">{kcal} kcal · {s.item_count}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <label className="flex items-center gap-2 text-xs text-text-sec cursor-pointer">
              <input
                type="checkbox"
                checked={replace}
                onChange={e => setReplace(e.target.checked)}
                className="cursor-pointer accent-accent"
              />
              {t('plan.replaceExisting')}
            </label>
          </>
        )}

        <div className="border-t border-border pt-3">
          {!showSavePrompt ? (
            <button
              onClick={() => setShowSavePrompt(true)}
              disabled={!hasEntries}
              className="w-full text-sm border border-dashed border-border text-text-sec rounded-lg px-3 py-2 hover:border-accent hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >+ {t('plan.saveAsMealTemplate')}</button>
          ) : (
            <div className="space-y-2">
              <label className="text-xs text-text-sec">{t('plan.namePromptTitle')}</label>
              <input
                type="text"
                autoFocus
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="e.g. My go-to lunch"
                className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-text outline-none focus:border-accent"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowSavePrompt(false); setSaveName(''); }}
                  className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text cursor-pointer transition-colors"
                >{t('common.cancel')}</button>
                <button
                  onClick={handleSave}
                  disabled={!saveName.trim() || saving}
                  className="text-sm bg-accent text-white rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-40 cursor-pointer transition-opacity"
                >{t('common.save')}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
