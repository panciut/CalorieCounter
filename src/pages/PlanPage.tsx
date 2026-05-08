import { useEffect, useState, useMemo, useCallback } from 'react';
import { useT } from '../i18n/useT';
import { useNavigate } from '../hooks/useNavigate';
import { api } from '../api';
import PageHeader from '../components/ui/PageHeader';
import FoodSearch, { type SearchItem } from '../components/FoodSearch';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import CellMenuModal from '../components/plan/CellMenuModal';
import { formatDMY, formatShortDate, getMondayOf, today, addDays } from '../lib/dateUtil';
import type { Food, LogEntry, Meal } from '../types';
import { MEAL_ORDER, MAIN_MEALS } from '../types';

function mealLabelKey(m: Meal): string {
  return 'meal.' + m[0].toLowerCase() + m.slice(1);
}

function isMainMeal(m: Meal): boolean {
  return (MAIN_MEALS as Meal[]).includes(m);
}

interface CellTarget { date: string; meal: Meal; }

export default function PlanPage() {
  const { t } = useT();
  const { navigate } = useNavigate();

  const [weekStart, setWeekStart] = useState<string>(getMondayOf(today()));
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [addCell, setAddCell] = useState<CellTarget | null>(null);
  const [menuCell, setMenuCell] = useState<CellTarget | null>(null);
  const [confirmClear, setConfirmClear] = useState<{ cell: CellTarget; ids: number[] } | null>(null);

  const days = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < 7; i++) arr.push(addDays(weekStart, i));
    return arr;
  }, [weekStart]);
  const weekEnd = days[6];
  const todayStr = today();

  const loadEntries = useCallback(() => {
    Promise.all(days.map(d => api.log.getDay(d)))
      .then(arr => setEntries(arr.flat()));
  }, [days]);

  useEffect(() => { loadEntries(); }, [loadEntries]);
  useEffect(() => { api.foods.getAll().then(setFoods); }, []);

  const searchItems: SearchItem[] = useMemo(
    () => foods.map(f => ({ ...f, isRecipe: false as const })),
    [foods],
  );

  // index entries by date+meal
  const cellMap = useMemo(() => {
    const m = new Map<string, LogEntry[]>();
    for (const e of entries) {
      // We render planned and logged so the user sees the full picture.
      const key = `${e.date}|${e.meal}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    return m;
  }, [entries]);

  function entriesForCell(date: string, meal: Meal): LogEntry[] {
    return cellMap.get(`${date}|${meal}`) ?? [];
  }

  function dayPlannedKcal(date: string): number {
    let kcal = 0;
    for (const e of entries) {
      if (e.date === date) kcal += e.calories;
    }
    return Math.round(kcal);
  }

  async function handleSelectFood(item: SearchItem) {
    if (!addCell) return;
    if (item.isRecipe) {
      await api.recipes.log({ recipe_id: item.id, date: addCell.date, meal: addCell.meal, scale: 1 });
    } else {
      const food = item;
      const grams = food.piece_grams ?? 100;
      await api.log.add({
        food_id: food.id,
        grams,
        meal: addCell.meal,
        date: addCell.date,
        status: 'planned',
      });
    }
    setAddCell(null);
    loadEntries();
  }

  async function handleRemoveEntry(id: number) {
    await api.log.delete(id);
    loadEntries();
  }

  async function handleClearCell(cell: CellTarget) {
    const ids = entriesForCell(cell.date, cell.meal).map(e => e.id);
    if (ids.length === 0) return;
    if (ids.length >= 2) {
      setConfirmClear({ cell, ids });
      return;
    }
    for (const id of ids) await api.log.delete(id);
    loadEntries();
  }

  async function performConfirmedClear() {
    if (!confirmClear) return;
    for (const id of confirmClear.ids) await api.log.delete(id);
    setConfirmClear(null);
    loadEntries();
  }

  // ── Drag-drop ────────────────────────────────────────────────────────────────
  // chip is the dragged log entry; drop target is a CellTarget.
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // "date|meal"

  function handleDragStart(e: React.DragEvent, entryId: number) {
    setDragId(entryId);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(entryId)); } catch {}
  }
  function handleDragEnd() { setDragId(null); setDragOver(null); }
  function handleCellDragOver(e: React.DragEvent, cell: CellTarget) {
    if (dragId == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const key = `${cell.date}|${cell.meal}`;
    if (dragOver !== key) setDragOver(key);
  }
  function handleCellDragLeave() { setDragOver(null); }
  async function handleCellDrop(e: React.DragEvent, cell: CellTarget) {
    e.preventDefault();
    const id = dragId ?? parseInt(e.dataTransfer.getData('text/plain'), 10);
    setDragId(null); setDragOver(null);
    if (!id) return;
    const ent = entries.find(x => x.id === id);
    if (!ent) return;
    if (ent.date === cell.date && ent.meal === cell.meal) return;
    // Move = update meal (and date if cross-day) on the same log row.
    // log:update covers food/grams/meal but not date — we re-create the row when date differs.
    if (ent.date === cell.date) {
      await api.log.update({ id: ent.id, food_id: ent.food_id, grams: ent.grams, meal: cell.meal });
    } else {
      // Cross-day: delete + re-add as planned (keeps macros/grams).
      await api.log.delete(ent.id);
      await api.log.add({ food_id: ent.food_id, grams: ent.grams, meal: cell.meal, date: cell.date, status: 'planned' });
    }
    loadEntries();
  }

  return (
    <div className="p-6 max-w-[1280px] mx-auto space-y-4">
      <PageHeader eyebrow={t('eyebrow.plan')} title={t('page.plan')} />

      {/* Week navigator */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="text-text-sec hover:text-accent border border-border hover:border-accent/50 rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer transition-colors"
            title={t('week.prev')}
          >‹</button>
          <h1 className="text-[20px] italic text-text text-center w-[260px] tabular-nums" style={{ fontFamily: 'var(--font-family-serif)' }}>
            {formatDMY(weekStart)} – {formatDMY(weekEnd)}
          </h1>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="text-text-sec hover:text-accent border border-border hover:border-accent/50 rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer transition-colors"
            title={t('week.next')}
          >›</button>
          <button
            onClick={() => setWeekStart(getMondayOf(today()))}
            className="text-xs text-text-sec border border-border rounded-lg px-2 py-1 hover:border-accent hover:text-accent cursor-pointer ml-1"
          >{t('plan.thisWeek')}</button>
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-xl border border-border overflow-x-auto bg-card">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-border text-text-sec text-xs uppercase tracking-wider">
              <th className="text-left px-3 py-3 w-[110px]">{t('plan.meal')}</th>
              {days.map(d => {
                const isToday = d === todayStr;
                return (
                  <th key={d} className={`px-3 py-3 text-left ${isToday ? 'bg-accent/5' : ''}`}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-text">{formatShortDate(d)}</span>
                      <span className="text-text-sec/70 text-[10px] tabular-nums">{dayPlannedKcal(d)} kcal</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {MEAL_ORDER.map(meal => {
              const main = isMainMeal(meal);
              return (
                <tr key={meal} className={main ? 'border-t border-border' : 'border-t border-border/30'}>
                  <td className={[
                    'px-3 align-top',
                    main
                      ? 'py-3 text-xs font-semibold uppercase tracking-wider text-text'
                      : 'py-1.5 text-[10px] uppercase tracking-wider text-text-sec/70',
                  ].join(' ')}>
                    {t(mealLabelKey(meal))}
                  </td>
                  {days.map(d => (
                    <PlanCell
                      key={d + meal}
                      cell={{ date: d, meal }}
                      entries={entriesForCell(d, meal)}
                      isDragOver={dragOver === `${d}|${meal}`}
                      isToday={d === todayStr}
                      isMain={main}
                      onAdd={() => setAddCell({ date: d, meal })}
                      onMenu={() => setMenuCell({ date: d, meal })}
                      onRemove={handleRemoveEntry}
                      onClear={() => handleClearCell({ date: d, meal })}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onCellDragOver={handleCellDragOver}
                      onCellDragLeave={handleCellDragLeave}
                      onCellDrop={handleCellDrop}
                      t={t}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-sec">
        {t('plan.legend')}
      </p>

      {/* Add modal */}
      {addCell && (
        <Modal isOpen onClose={() => setAddCell(null)} title={`${t('plan.add')} — ${formatShortDate(addCell.date)} · ${t(`meal.${addCell.meal}`)}`}>
          <FoodSearch
            items={searchItems}
            onSelect={handleSelectFood}
            placeholder={t('foods.searchPlaceholder')}
            showAllWhenEmpty
            clearAfterSelect
          />
          <div className="text-xs text-text-sec mt-2">{t('plan.addHint')}</div>
        </Modal>
      )}

      {/* Cell menu (apply / save template) */}
      {menuCell && (
        <CellMenuModal
          date={menuCell.date}
          meal={menuCell.meal}
          hasEntries={entriesForCell(menuCell.date, menuCell.meal).length > 0}
          onClose={() => setMenuCell(null)}
          onChanged={loadEntries}
        />
      )}

      {/* Confirm bulk clear */}
      {confirmClear && (
        <ConfirmDialog
          message={t('plan.confirmClearMsg').replace('{n}', String(confirmClear.ids.length))}
          confirmLabel={t('plan.clearCell')}
          cancelLabel={t('common.cancel')}
          dangerous
          onConfirm={performConfirmedClear}
          onCancel={() => setConfirmClear(null)}
        />
      )}

      <button
        onClick={() => navigate('week', { weekStart })}
        className="text-xs text-text-sec hover:text-accent underline cursor-pointer"
      >{t('plan.viewWeek')} →</button>
    </div>
  );
}

// ── Cell component (defined at module level — never inside the parent) ─────────

interface PlanCellProps {
  cell: CellTarget;
  entries: LogEntry[];
  isDragOver: boolean;
  isToday: boolean;
  isMain: boolean;
  onAdd: () => void;
  onMenu: () => void;
  onRemove: (id: number) => void;
  onClear: () => void;
  onDragStart: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
  onCellDragOver: (e: React.DragEvent, cell: CellTarget) => void;
  onCellDragLeave: () => void;
  onCellDrop: (e: React.DragEvent, cell: CellTarget) => void;
  t: (k: string) => string;
}

function PlanCell({ cell, entries, isDragOver, isToday, isMain, onAdd, onMenu, onRemove, onClear, onDragStart, onDragEnd, onCellDragOver, onCellDragLeave, onCellDrop, t }: PlanCellProps) {
  return (
    <td
      className={[
        'align-top min-w-[120px] transition-colors',
        isMain ? 'px-2 py-3' : 'px-2 py-1.5',
        isToday ? 'bg-accent/5' : '',
        isDragOver ? 'bg-accent/10 ring-1 ring-accent/30 ring-inset' : '',
      ].join(' ')}
      onDragOver={e => onCellDragOver(e, cell)}
      onDragLeave={onCellDragLeave}
      onDrop={e => onCellDrop(e, cell)}
    >
      <div className="flex flex-col gap-1">
        {entries.map(e => (
          <div
            key={e.id}
            draggable
            onDragStart={(ev) => onDragStart(ev, e.id)}
            onDragEnd={onDragEnd}
            className={[
              'group flex items-center gap-1.5 rounded-md px-1.5 py-0.5 cursor-grab active:cursor-grabbing border text-[11px]',
              e.status === 'planned'
                ? 'bg-accent/10 border-accent/30 text-text'
                : 'bg-bg border-border text-text',
            ].join(' ')}
            title={`${e.name} · ${Math.round(e.calories)} kcal · ${Math.round(e.grams)}g`}
          >
            <span className="truncate">{e.name}</span>
            <span className="text-text-sec text-[10px] tabular-nums shrink-0">{Math.round(e.grams)}g</span>
            <button
              type="button"
              onClick={() => onRemove(e.id)}
              className="ml-auto opacity-0 group-hover:opacity-100 text-text-sec hover:text-red text-xs cursor-pointer"
              title={t('common.delete')}
            >✕</button>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onAdd}
            className="text-text-sec/60 hover:text-accent text-xs border border-dashed border-border hover:border-accent rounded px-1.5 py-0.5 cursor-pointer transition-colors"
          >+ {t('plan.add')}</button>
          <button
            type="button"
            onClick={onMenu}
            className="text-text-sec/60 hover:text-accent text-xs px-1 cursor-pointer ml-auto"
            title={t('plan.applyMealTemplate')}
          >⋯</button>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-text-sec/60 hover:text-red text-[10px] cursor-pointer"
              title={t('plan.clearCell')}
            >×</button>
          )}
        </div>
      </div>
    </td>
  );
}
