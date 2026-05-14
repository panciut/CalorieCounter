import { useState } from 'react';
import { useT } from '../../i18n/useT';
import { fbCard, fbBtnIcon, fbBtnGhost, fbBtnPrimary } from '../../lib/fbStyles';
import { MEAL_ORDER, type LogEntry, type Meal } from '../../types';
import ConfirmDialog from '../ConfirmDialog';

interface MealGroup {
  meal: string;
  label: string;
  items: LogEntry[];
  cal: number;
  pro: number;
}

interface DiaryTableProps {
  mealGroups: MealGroup[];
  loggedEntries: LogEntry[];
  plannedEntries: LogEntry[];
  totalFoods: number;
  totalMeals: number;
  plannedKcalSum: number;
  onConfirmPlanned: (id: number) => void;
  onConfirmAll: () => void;
  onAddToMeal: (meal: string) => void;
  onAddFirst: () => void;
  onCopyDay: () => void;
  onDeleteEntry: (id: number) => void;
  onUpdateEntry: (id: number, food_id: number, grams: number, meal: Meal) => void;
}

const COL = 'minmax(0,1.3fr) 56px 56px 56px 56px 56px 64px';

export default function DiaryTable({
  mealGroups,
  loggedEntries,
  plannedEntries,
  totalFoods,
  totalMeals,
  plannedKcalSum,
  onConfirmPlanned,
  onConfirmAll,
  onAddToMeal,
  onAddFirst,
  onCopyDay,
  onDeleteEntry,
  onUpdateEntry,
}: DiaryTableProps) {
  const { t, tMeal } = useT();
  const card = fbCard;
  const btnIcon = fbBtnIcon;
  const btnGhost = fbBtnGhost;
  const btnPrimary = fbBtnPrimary;

  const [editing, setEditing] = useState<{ id: number; food_id: number; gramsStr: string; meal: Meal } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  function startEdit(e: LogEntry) {
    setEditing({
      id: e.id,
      food_id: e.food_id,
      gramsStr: String(Math.round(e.grams * 100) / 100),
      meal: e.meal as Meal,
    });
  }
  function saveEdit() {
    if (!editing) return;
    const g = parseFloat(editing.gramsStr);
    if (!isNaN(g) && g > 0) {
      onUpdateEntry(editing.id, editing.food_id, Math.round(g * 100) / 100, editing.meal);
    }
    setEditing(null);
  }

  const standalonePlanned = plannedEntries.filter(
    e => !mealGroups.some(g => g.items.some(i => i.id === e.id))
  );

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, fontWeight: 400, color: 'var(--fb-text)', margin: 0, letterSpacing: -0.3 }}>
            {t('dash.diary')}
          </h2>
          <span style={{ fontSize: 10.5, color: 'var(--fb-text-3)' }}>
            {t('dash.nFoodsNMeals', { foods: totalFoods, meals: totalMeals })}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {plannedEntries.length > 0 && (
            <button onClick={onConfirmAll} style={{ ...btnGhost, borderColor: 'var(--fb-accent)', color: 'var(--fb-accent)', fontSize: 11 }}>
              {t('dash.confirmN', { n: plannedEntries.length })}
            </button>
          )}
          <button onClick={onCopyDay} style={btnIcon} title={t('export.copyDay')}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: COL, gap: 8, padding: '0 8px 8px', fontSize: 9.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--fb-text-3)', borderBottom: '1px solid var(--fb-divider)' }}>
        <span>{t('dash.foodCol')}</span>
        <span style={{ textAlign: 'right' }}>{t('dash.qtyCol')}</span>
        <span style={{ textAlign: 'right' }}>kcal</span>
        <span style={{ textAlign: 'right' }}>P</span>
        <span style={{ textAlign: 'right' }}>C</span>
        <span style={{ textAlign: 'right' }}>F</span>
        <span />
      </div>

      {loggedEntries.length === 0 && plannedEntries.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: 'var(--fb-text-2)', margin: '0 0 16px' }}>
            {t('dash.noFoodsToday')}
          </p>
          <button onClick={onAddFirst} style={btnPrimary}>{t('dash.addFirst')}</button>
        </div>
      ) : (
        <>
          {mealGroups.map(g => (
            <div key={g.meal}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 8px 6px', margin: '0 -8px', borderTop: '1px solid var(--fb-divider)', background: 'var(--fb-bg-2)' }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, fontWeight: 400, color: 'var(--fb-text)', letterSpacing: -0.2 }}>
                  {g.label}
                </span>
                <span className="tnum" style={{ fontSize: 10, color: 'var(--fb-text-3)', letterSpacing: 0.4 }}>
                  {g.items[0]?.date ?? ''}
                </span>
                <span style={{ flex: 1 }} />
                <span className="tnum" style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600 }}>
                  {Math.round(g.cal)} kcal · {g.pro.toFixed(0)}g P
                </span>
                <button onClick={() => onAddToMeal(g.meal as Meal)} style={{ ...btnIcon, padding: 2 }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              </div>
              {g.items.map(e => (
                <div key={e.id}>
                  <div style={{ display: 'grid', gridTemplateColumns: COL, gap: 8, alignItems: 'center', padding: '8px', fontSize: 12, borderBottom: editing?.id === e.id ? 'none' : '1px solid var(--fb-divider)', opacity: e.status === 'planned' ? 0.65 : 1 }}>
                    <span style={{ color: 'var(--fb-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.status === 'planned' && <span style={{ fontSize: 9.5, color: 'var(--fb-accent)', marginRight: 4, letterSpacing: 0.5 }}>{t('dash.pianoStatus')}</span>}
                      {e.name}
                    </span>
                    <span className="tnum" style={{ textAlign: 'right', color: 'var(--fb-text-2)' }}>{Math.round(e.grams * 100) / 100}g</span>
                    <span className="tnum" style={{ textAlign: 'right', color: 'var(--fb-text)', fontWeight: 600 }}>{Math.round(e.calories)}</span>
                    <span className="tnum" style={{ textAlign: 'right', color: 'var(--fb-text-2)' }}>{e.protein.toFixed(2)}</span>
                    <span className="tnum" style={{ textAlign: 'right', color: 'var(--fb-text-2)' }}>{e.carbs.toFixed(2)}</span>
                    <span className="tnum" style={{ textAlign: 'right', color: 'var(--fb-text-2)' }}>{e.fat.toFixed(2)}</span>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                      {e.status === 'planned' && (
                        <button onClick={() => onConfirmPlanned(e.id)} style={{ ...btnIcon, padding: 2, color: 'var(--fb-accent)' }} title={t('common.confirm') || 'Confirm'}>
                          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </button>
                      )}
                      <button onClick={() => editing?.id === e.id ? setEditing(null) : startEdit(e)} style={{ ...btnIcon, padding: 2, color: editing?.id === e.id ? 'var(--fb-accent)' : 'var(--fb-text-3)' }} title={t('common.edit') || 'Edit'}>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={() => setPendingDelete({ id: e.id, name: e.name })} style={{ ...btnIcon, padding: 2, color: 'var(--fb-text-3)' }} title={t('common.delete') || 'Delete'}>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                      </button>
                    </div>
                  </div>
                  {editing?.id === e.id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--fb-bg-2)', borderBottom: '1px solid var(--fb-divider)', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{t('dash.qtyCol')}</span>
                      <input type="text" inputMode="decimal" autoFocus value={editing.gramsStr}
                        onChange={ev => setEditing({ ...editing, gramsStr: ev.target.value })}
                        onKeyDown={ev => { if (ev.key === 'Enter') saveEdit(); else if (ev.key === 'Escape') setEditing(null); }}
                        style={{ width: 80, background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 6, padding: '4px 6px', fontSize: 12, color: 'var(--fb-text)', textAlign: 'right', fontFamily: 'var(--font-mono)', outline: 'none' }} />
                      <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>g</span>
                      <span style={{ fontSize: 10, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginLeft: 6 }}>{t('common.meal') || 'Meal'}</span>
                      <select value={editing.meal} onChange={ev => setEditing({ ...editing, meal: ev.target.value as Meal })}
                        style={{ background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 6, padding: '4px 6px', fontSize: 12, color: 'var(--fb-text)', outline: 'none' }}>
                        {MEAL_ORDER.map(m => <option key={m} value={m}>{tMeal(m)}</option>)}
                      </select>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}>Macro ricalcolati dal cibo</span>
                      <button onClick={saveEdit} style={{ ...btnPrimary, fontSize: 11, padding: '4px 12px' }}>{t('common.save')}</button>
                      <button onClick={() => setEditing(null)} style={{ ...btnGhost, fontSize: 11, padding: '4px 10px' }}>{t('common.cancel')}</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
          {standalonePlanned.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 8px 6px', margin: '0 -8px', borderTop: '1px solid var(--fb-divider)', background: 'var(--fb-bg-2)' }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--fb-accent)' }}>{t('dash.scheduledTitle')}</span>
                <span style={{ flex: 1 }} />
                <span className="tnum" style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600 }}>{plannedKcalSum} kcal</span>
                <button onClick={onConfirmAll} style={{ ...btnIcon, padding: 2, color: 'var(--fb-accent)' }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
              </div>
              {standalonePlanned.map(e => (
                <div key={e.id} style={{ display: 'grid', gridTemplateColumns: COL, gap: 8, alignItems: 'center', padding: '8px', fontSize: 12, borderBottom: '1px solid var(--fb-divider)', opacity: 0.65 }}>
                  <span style={{ color: 'var(--fb-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                  <span className="tnum" style={{ textAlign: 'right', color: 'var(--fb-text-2)' }}>{Math.round(e.grams * 100) / 100}g</span>
                  <span className="tnum" style={{ textAlign: 'right', color: 'var(--fb-text)', fontWeight: 600 }}>{Math.round(e.calories)}</span>
                  <span className="tnum" style={{ textAlign: 'right', color: 'var(--fb-text-2)' }}>{e.protein.toFixed(2)}</span>
                  <span className="tnum" style={{ textAlign: 'right', color: 'var(--fb-text-2)' }}>{e.carbs.toFixed(2)}</span>
                  <span className="tnum" style={{ textAlign: 'right', color: 'var(--fb-text-2)' }}>{e.fat.toFixed(2)}</span>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                    <button onClick={() => onConfirmPlanned(e.id)} style={{ ...btnIcon, padding: 2, color: 'var(--fb-accent)' }} title={t('common.confirm') || 'Confirm'}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                    <button onClick={() => setPendingDelete({ id: e.id, name: e.name })} style={{ ...btnIcon, padding: 2, color: 'var(--fb-text-3)' }} title={t('common.delete') || 'Delete'}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {pendingDelete && (
        <ConfirmDialog
          message={`Eliminare "${pendingDelete.name}" dal diario?`}
          confirmLabel={t('common.delete') || 'Elimina'}
          cancelLabel={t('common.cancel') || 'Annulla'}
          dangerous
          onConfirm={() => { onDeleteEntry(pendingDelete.id); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
