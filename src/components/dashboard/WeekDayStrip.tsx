import { useEffect, useState } from 'react';
import { useT } from '../../i18n/useT';
import { useNavigate } from '../../hooks/useNavigate';
import { api } from '../../api';
import { addDays, getMondayOf, today } from '../../lib/dateUtil';
import type { Meal } from '../../types';
import { MAIN_MEALS } from '../../types';

type Status = 'empty' | 'partial' | 'full';

/** Minimal week strip: 7 small pills, just the date number. Today is highlighted.
 *  Plan status colors the text: empty muted, partial accent-soft, full accent. */
export default function WeekDayStrip() {
  const { t } = useT();
  const { navigate } = useNavigate();
  const todayStr = today();
  const weekStart = getMondayOf(todayStr);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));

  const [statusByDate, setStatusByDate] = useState<Map<string, Status>>(new Map());

  useEffect(() => {
    let cancelled = false;
    Promise.all(days.map(d => api.log.getPlanned(d))).then(arr => {
      if (cancelled) return;
      const m = new Map<string, Status>();
      for (let i = 0; i < days.length; i++) {
        const planned = arr[i];
        if (!planned || planned.length === 0) {
          m.set(days[i], 'empty');
        } else {
          const haveMeal = new Set<Meal>();
          for (const e of planned) haveMeal.add(e.meal as Meal);
          const allMain = MAIN_MEALS.every(m2 => haveMeal.has(m2));
          m.set(days[i], allMain ? 'full' : 'partial');
        }
      }
      setStatusByDate(m);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  return (
    <div className="flex items-center gap-1">
      {days.map(d => {
        const status = statusByDate.get(d) ?? 'empty';
        const isToday = d === todayStr;
        const dayNum = parseInt(d.slice(8, 10), 10);
        const tone =
          status === 'full'    ? 'text-accent font-semibold' :
          status === 'partial' ? 'text-accent/70' :
          'text-text-sec/50';
        return (
          <button
            key={d}
            onClick={() => navigate('day', { date: d })}
            title={`${d} · ${t(`plan.status${status[0].toUpperCase()}${status.slice(1)}` as 'plan.statusEmpty')}`}
            className={[
              'w-7 h-7 rounded-md text-xs tabular-nums cursor-pointer transition-colors',
              isToday ? 'border border-accent text-text' : 'border border-transparent hover:border-border',
              isToday ? '' : tone,
            ].join(' ')}
          >{dayNum}</button>
        );
      })}
    </div>
  );
}
