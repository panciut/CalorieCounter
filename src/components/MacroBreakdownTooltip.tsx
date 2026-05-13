import { useRef, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MEAL_ORDER, type LogEntry } from '../types';

export function entryValue(e: LogEntry, id: string): number {
  if (id === 'cal')     return e.calories;
  if (id === 'protein') return e.protein;
  if (id === 'carbs')   return e.carbs;
  if (id === 'fat')     return e.fat;
  if (id === 'fiber')   return e.fiber || 0;
  return 0;
}

interface Props {
  id: string;
  label: string;
  actual: number;
  planned?: number;
  unit: string;
  entries: LogEntry[];
  anchorRect: DOMRect;
  placement?: 'above' | 'side';
}

export default function MacroBreakdownTooltip({ id, label, actual, planned = 0, unit, entries, anchorRect, placement = 'above' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const th = el.offsetHeight;
    const tw = el.offsetWidth;

    let top: number, left: number;
    if (placement === 'side') {
      // Try right first, fall back to left
      const rightLeft = anchorRect.right + 12;
      const leftLeft  = anchorRect.left - tw - 12;
      left = rightLeft + tw < window.innerWidth - 8 ? rightLeft : leftLeft;
      top  = Math.min(
        anchorRect.top + anchorRect.height / 2 - th / 2,
        window.innerHeight - th - 8,
      );
    } else {
      top  = anchorRect.top - th - 8;
      left = anchorRect.left + anchorRect.width / 2 - tw / 2;
      left = Math.min(left, window.innerWidth - tw - 8);
    }
    setPos({ top: Math.max(8, top), left: Math.max(8, left) });
  }, [anchorRect, placement]);

  const logged  = entries.filter(e => e.status !== 'planned');
  const plannedEntries = entries.filter(e => e.status === 'planned');

  const byMeal = MEAL_ORDER.map(meal => ({
    meal,
    logSum:  logged.filter(e => e.meal === meal).reduce((acc, e) => acc + entryValue(e, id), 0),
    planSum: plannedEntries.filter(e => e.meal === meal).reduce((acc, e) => acc + entryValue(e, id), 0),
  })).filter(m => m.logSum > 0 || m.planSum > 0);

  const byFood = [
    ...logged.map(e => ({ name: e.name, value: entryValue(e, id), isPlanned: false })),
    ...plannedEntries.map(e => ({ name: e.name, value: entryValue(e, id), isPlanned: true })),
  ]
    .filter(f => f.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const fmt = (n: number) => `${Math.round(n * 10) / 10}${unit}`;

  const kcalPerG = id === 'protein' || id === 'carbs' ? 4 : id === 'fat' ? 9 : 0;
  const actualKcal  = kcalPerG ? Math.round(actual  * kcalPerG) : 0;
  const plannedKcal = kcalPerG ? Math.round(planned * kcalPerG) : 0;

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 200 }}
      className="bg-card border border-border rounded-xl shadow-lg p-3 w-64 pointer-events-none text-xs"
    >
      <div className="font-semibold text-text mb-2">
        {label} — {fmt(actual)}
        {kcalPerG > 0 && <span className="text-text-sec font-normal ml-1">· {actualKcal} kcal</span>}
        {planned > 0 && (
          <span className="text-accent ml-1">
            +{fmt(planned)}
            {kcalPerG > 0 && <span className="text-accent/70"> · {plannedKcal} kcal</span>}
            {' '}planned
          </span>
        )}
      </div>

      {byMeal.length > 0 && (
        <div className="mb-2">
          <div className="text-text-sec uppercase tracking-wider text-[10px] mb-1">By meal</div>
          <div className="flex flex-col gap-0.5">
            {byMeal.map(({ meal, logSum, planSum }) => (
              <div key={meal} className="flex justify-between gap-2">
                <span className="text-text-sec">{meal}</span>
                <span className="tabular-nums">
                  {logSum > 0  && <span className="text-text">{fmt(logSum)}</span>}
                  {planSum > 0 && <span className="text-accent ml-1">+{fmt(planSum)}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {byFood.length > 0 && (
        <div>
          <div className="text-text-sec uppercase tracking-wider text-[10px] mb-1">By food</div>
          <div className="flex flex-col gap-0.5">
            {byFood.map((f, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className={`truncate ${f.isPlanned ? 'text-accent/70 italic' : 'text-text-sec'}`}>{f.name}</span>
                <span className={`tabular-nums shrink-0 ${f.isPlanned ? 'text-accent' : 'text-text'}`}>{fmt(f.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
