import { useT } from '../i18n/useT';
import { useSettings } from '../hooks/useSettings';
import { useGoalsForDate } from '../hooks/useGoalsForDate';
import { applyGoalPlan } from '../lib/goalsMerge';
import MacroChart from './MacroChart';
import MacroBars from './MacroBars';
import type { BarDef } from './MacroBars';
import { getBarColor } from '../lib/macroCalc';
import type { LogEntry } from '../types';

const remColorMap: Record<string, string> = {
  'bar-green':  'text-green',
  'bar-yellow': 'text-yellow',
  'bar-orange': 'text-orange-400',
  'bar-red':    'text-red',
};

interface DayMacrosCardProps {
  entries: LogEntry[];
  date: string;
}

export default function DayMacrosCard({ entries, date }: DayMacrosCardProps) {
  const { t } = useT();
  const { settings: baseSettings } = useSettings();
  const plan = useGoalsForDate(date);
  const settings = applyGoalPlan(baseSettings, plan);

  const sumEntries = (es: LogEntry[]) => es.reduce(
    (acc, e) => ({
      cal:     acc.cal     + e.calories,
      protein: acc.protein + e.protein,
      carbs:   acc.carbs   + e.carbs,
      fat:     acc.fat     + e.fat,
      fiber:   acc.fiber   + (e.fiber || 0),
    }),
    { cal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );

  const loggedEntries  = entries.filter(e => e.status !== 'planned');
  const plannedEntries = entries.filter(e => e.status === 'planned');
  const totals  = sumEntries(loggedEntries);
  const planned = sumEntries(plannedEntries);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const cal    = round2(totals.cal);
  const pro    = round2(totals.protein);
  const carbs  = round2(totals.carbs);
  const fat    = round2(totals.fat);
  const fiber  = round2(totals.fiber);
  const plCal    = round2(planned.cal);
  const plPro    = round2(planned.protein);
  const plCarbs  = round2(planned.carbs);
  const plFat    = round2(planned.fat);
  const plFiber  = round2(planned.fiber);

  const calRec = settings.cal_rec || Math.round(((settings.cal_min||1800) + (settings.cal_max||2200)) / 2);

  const bars: BarDef[] = [
    { id:'cal',     label:t('macro.kcal'),    actual:cal,   planned:plCal,   min:settings.cal_min||1800,    max:settings.cal_max||2200,    rec:settings.cal_rec||0,     unit:'kcal' },
    { id:'fat',     label:t('macro.fat'),     actual:fat,   planned:plFat,   min:settings.fat_min||0,       max:settings.fat_max||0,       rec:settings.fat_rec||0,     unit:'g' },
    { id:'carbs',   label:t('macro.carbs'),   actual:carbs, planned:plCarbs, min:settings.carbs_min||0,     max:settings.carbs_max||0,     rec:settings.carbs_rec||0,   unit:'g' },
    { id:'fiber',   label:t('macro.fiber'),   actual:fiber, planned:plFiber, min:settings.fiber_min||0,     max:settings.fiber_max||0,     rec:settings.fiber_rec||0,   unit:'g' },
    { id:'protein', label:t('macro.protein'), actual:pro,   planned:plPro,   min:settings.protein_min||0,   max:settings.protein_max||0,   rec:settings.protein_rec||0, unit:'g' },
  ];

  const loggedRound  = Math.round(cal);
  const plannedRound = Math.round(plCal);
  const intakeSum    = loggedRound + plannedRound;
  const leftover     = calRec - intakeSum;
  const leftoverAbs  = Math.abs(leftover);
  const overall      = getBarColor(intakeSum, settings.cal_min||1800, settings.cal_max||2200, settings);

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex gap-5 items-start">
      <div className="shrink-0">
        <MacroChart
          protein={pro} carbs={carbs} fat={fat} calories={cal}
          plannedProtein={plPro} plannedCarbs={plCarbs} plannedFat={plFat} plannedCalories={plCal}
          plannedLabel={t('dash.planned')}
          entries={entries}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex items-center gap-1.5 flex-wrap text-sm tabular-nums">
          <span className="text-text font-medium">{loggedRound}</span>
          <span className="text-text-sec text-xs uppercase">logged</span>
          {plannedRound > 0 && <>
            <span className="text-text-sec">+</span>
            <span className="text-accent font-medium">{plannedRound}</span>
            <span className="text-text-sec text-xs uppercase">planned</span>
          </>}
          <span className="text-text-sec">=</span>
          <span className="text-text font-semibold">{intakeSum}</span>
          <span className="text-text-sec text-xs">{t('macro.kcal')}</span>
          <span className="text-text-sec mx-1">·</span>
          <span className={`font-semibold ${remColorMap[overall]||'text-text'}`}>{leftoverAbs}</span>
          <span className="text-text-sec text-xs">
            {leftover >= 0 ? t('dash.remaining') : t('dash.overBy')}
          </span>
          <span className="text-text-sec/70 text-xs ml-1">(target {calRec})</span>
        </div>
        <MacroBars bars={bars} settings={settings} entries={entries} />
      </div>
    </div>
  );
}
