import { useEffect, useState } from 'react';
import { useT } from '../i18n/useT';
import { useNavigate } from '../hooks/useNavigate';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../components/Toast';
import { api } from '../api';
import BarChartCard from '../components/BarChartCard';
import { fmtDate, formatShortDate, formatDMY, addDays, today } from '../lib/dateUtil';
import { buildWeekMarkdown, buildDayMarkdown, copyToClipboard } from '../lib/exportText';
import type { WeekDayDetail, DailyEnergy } from '../types';

interface WeekPageProps { weekStart?: string; }

export default function WeekPage({ weekStart }: WeekPageProps) {
  const { t } = useT();
  const { navigate } = useNavigate();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const [details, setDetails] = useState<WeekDayDetail[]>([]);
  const [energyMap, setEnergyMap] = useState<Map<string, DailyEnergy>>(new Map());
  const [overrides, setOverrides] = useState<Record<string, 'included' | 'excluded'>>(() => {
    try { return JSON.parse(localStorage.getItem('week.dayOverrides') || '{}'); }
    catch { return {}; }
  });
  const todayStr = today();

  useEffect(() => {
    if (!weekStart) return;
    api.log.getWeekDetail(weekStart).then(setDetails);
    const end = addDays(weekStart, 6);
    api.dailyEnergy.getRange(weekStart, end).then(rows => {
      setEnergyMap(new Map(rows.map(r => [r.date, r])));
    });
  }, [weekStart]);

  function toggleDay(date: string, currentlyIncluded: boolean) {
    setOverrides(prev => {
      const next = { ...prev };
      next[date] = currentlyIncluded ? 'excluded' : 'included';
      localStorage.setItem('week.dayOverrides', JSON.stringify(next));
      return next;
    });
  }

  if (!weekStart) return null;

  const weekEnd = addDays(weekStart, 6);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));

  const empty = { calories:0, protein:0, carbs:0, fat:0, fiber:0, planned_calories:0, planned_protein:0, planned_carbs:0, planned_fat:0, planned_fiber:0 };
  const detailMap = new Map(details.map(d => [d.date, d]));
  const rows = days.map(date => detailMap.get(date) ?? { date, ...empty });

  // For today and future, treat planned as if it counted (logged + planned).
  // For past days, planned is ignored.
  const projected = rows.map(d => {
    const showPlan = d.date >= todayStr;
    const proj_calories = d.calories + (showPlan ? d.planned_calories : 0);
    const isEmpty = proj_calories <= 0;
    const override = overrides[d.date];
    const included = override ? override === 'included' : !isEmpty && d.date !== todayStr;
    return {
      ...d,
      proj_calories,
      proj_protein:  d.protein  + (showPlan ? d.planned_protein  : 0),
      proj_carbs:    d.carbs    + (showPlan ? d.planned_carbs    : 0),
      proj_fat:      d.fat      + (showPlan ? d.planned_fat      : 0),
      proj_fiber:    d.fiber    + (showPlan ? d.planned_fiber    : 0),
      hasPlanned:    showPlan && d.planned_calories > 0,
      isEmpty,
      included,
    };
  });

  const includedRows = projected.filter(d => d.included);
  const count = includedRows.length || 1;
  const avg = (key: 'proj_calories'|'proj_protein'|'proj_carbs'|'proj_fat'|'proj_fiber') =>
    Math.round(includedRows.reduce((s, d) => s + d[key], 0) / count);

  const totalKcal = Math.round(includedRows.reduce((s, d) => s + d.proj_calories, 0));

  // Net: food calories minus Apple Watch energy — only past days up to today
  const daysWithEnergy = includedRows.filter(d => d.date <= todayStr && energyMap.has(d.date));
  const totalEnergyOut = daysWithEnergy.reduce((s, d) => {
    const e = energyMap.get(d.date)!;
    return s + e.resting_kcal + e.active_kcal + e.extra_kcal;
  }, 0);
  const totalFoodOnEnergyDays = daysWithEnergy.reduce((s, d) => s + d.proj_calories, 0);
  const totalNet = Math.round(totalFoodOnEnergyDays - totalEnergyOut);
  const avgNet   = daysWithEnergy.length > 0 ? Math.round(totalNet / daysWithEnergy.length) : null;

  const recWeek = (settings.cal_rec || 0) * includedRows.length;
  const maxWeek = (settings.cal_max || 0) * includedRows.length;
  const bankRec = recWeek - totalKcal;
  const bankMax = maxWeek - totalKcal;

  const chartData = projected.map(d => ({
    label: formatShortDate(d.date),
    value: Math.round(d.calories),
    planned: d.hasPlanned ? Math.round(d.planned_calories) : 0,
  }));

  async function handleCopy() {
    const md = buildWeekMarkdown(weekStart!, weekEnd, rows, settings);
    const ok = await copyToClipboard(md);
    showToast(ok ? t('export.copied') : t('export.copyFailed'), ok ? 'success' : 'error');
  }

  async function handleCopyDetailed() {
    const dayData = await Promise.all(
      days.map(date => Promise.all([
        api.log.getDay(date),
        api.water.getDay(date),
        api.notes.get(date),
      ]).then(([entries, water, noteObj]) => ({ date, entries, water, noteObj })))
    );

    const parts = dayData.map(({ date, entries, water, noteObj }) => {
      const e = energyMap.get(date);
      return buildDayMarkdown({
        date,
        entries,
        settings,
        waterMl: water.total_ml || undefined,
        waterGoalMl: settings.water_goal,
        restingKcal: e?.resting_kcal || undefined,
        activeKcal:  e?.active_kcal  || undefined,
        extraKcal:   e?.extra_kcal   || undefined,
        note: noteObj.note || undefined,
      });
    });

    const md = parts.join('\n---\n\n');
    const ok = await copyToClipboard(md);
    showToast(ok ? t('export.copied') : t('export.copyFailed'), ok ? 'success' : 'error');
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <button
        className="text-accent text-sm hover:opacity-80 transition-opacity cursor-pointer"
        onClick={() => navigate('history')}
      >
        {t('week.backToHistory')}
      </button>

      <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-accent">{t('eyebrow.week')}</div>
      <div className="flex items-center justify-between gap-3 flex-wrap -mt-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('week', { weekStart: addDays(weekStart, -7) })}
            className="text-text-sec hover:text-accent border border-border hover:border-accent/50 rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer transition-colors"
            title="Previous week"
          >‹</button>
          <h1 className="text-[22px] italic text-text text-center w-[260px] tabular-nums" style={{ fontFamily: 'var(--font-family-serif)' }}>
            {formatDMY(weekStart)} – {formatDMY(weekEnd)}
          </h1>
          <button
            onClick={() => navigate('week', { weekStart: addDays(weekStart, 7) })}
            className="text-text-sec hover:text-accent border border-border hover:border-accent/50 rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer transition-colors"
            title="Next week"
          >›</button>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCopy} className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text cursor-pointer transition-colors">
            📋 {t('export.copyWeek')}
          </button>
          <button onClick={handleCopyDetailed} className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text cursor-pointer transition-colors">
            📋 {t('export.copyWeekDetailed')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: t('week.avgPerDay'), value: `${avg('proj_calories')} kcal`, accent: true },
          { label: t('week.avgProtein'), value: `${avg('proj_protein')}g` },
          { label: t('week.avgCarbs'),   value: `${avg('proj_carbs')}g` },
          { label: t('week.avgFat'),     value: `${avg('proj_fat')}g` },
          { label: t('week.avgFiber'),   value: `${avg('proj_fiber')}g` },
        ].map(item => (
          <div key={item.label} className="bg-card rounded-xl p-3 border border-border text-center">
            <p className="text-xs text-text-sec mb-1">{item.label}</p>
            <p className={`font-semibold text-sm ${item.accent ? 'text-accent' : 'text-text'}`}>{item.value}</p>
          </div>
        ))}
        {avgNet !== null && (
          <div className="bg-card rounded-xl p-3 border border-border text-center sm:col-span-5">
            <p className="text-xs text-text-sec mb-1">Avg net / day</p>
            <p className={`font-semibold text-sm ${avgNet <= 0 ? 'text-green' : 'text-accent'}`}>
              {avgNet > 0 ? '+' : ''}{avgNet} kcal
            </p>
          </div>
        )}
      </div>

      {(recWeek > 0 || maxWeek > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-card rounded-xl p-3 border border-border text-center">
            <p className="text-xs text-text-sec mb-1">{t('week.totalKcal')}</p>
            <p className="font-semibold text-sm text-text">{totalKcal} kcal</p>
          </div>
          {recWeek > 0 && (
            <div className="bg-card rounded-xl p-3 border border-border text-center">
              <p className="text-xs text-text-sec mb-1">{t('week.bankRec')}</p>
              <p className={`font-semibold text-sm ${bankRec >= 0 ? 'text-accent' : 'text-red'}`}>
                {bankRec >= 0 ? `${bankRec} kcal` : `${Math.abs(bankRec)} kcal ${t('week.over')}`}
                <span className="text-text-sec font-normal"> / {recWeek}</span>
              </p>
            </div>
          )}
          {maxWeek > 0 && (
            <div className="bg-card rounded-xl p-3 border border-border text-center">
              <p className="text-xs text-text-sec mb-1">{t('week.bankMax')}</p>
              <p className={`font-semibold text-sm ${bankMax >= 0 ? 'text-accent' : 'text-red'}`}>
                {bankMax >= 0 ? `${bankMax} kcal` : `${Math.abs(bankMax)} kcal ${t('week.over')}`}
                <span className="text-text-sec font-normal"> / {maxWeek}</span>
              </p>
            </div>
          )}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4">
        <BarChartCard
          data={chartData}
          unit="kcal"
          onBarClick={i => navigate('day', { date: days[i], fromWeek: weekStart })}
        />
      </div>

      {projected.every(d => d.proj_calories === 0) ? (
        <p className="text-text-sec">{t('week.noEntries')}</p>
      ) : (
        <div className="bg-card rounded-xl overflow-hidden border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-sec text-xs uppercase tracking-wider">
                <th className="px-3 py-3 w-8" />
                <th className="text-left px-4 py-3">{t('week.date')}</th>
                <th className="text-right px-4 py-3">kcal</th>
                <th className="text-right px-4 py-3">net</th>
                <th className="text-right px-4 py-3">fat</th>
                <th className="text-right px-4 py-3">carbs</th>
                <th className="text-right px-4 py-3">fiber</th>
                <th className="text-right px-4 py-3">protein</th>
              </tr>
            </thead>
            <tbody>
              {projected.map(d => {
                const isToday = d.date === todayStr;
                const fmtCell = (logged: number, planned: number, unit = '') => {
                  if (!logged && !planned) return '—';
                  return (
                    <>
                      <span>{Math.round(logged)}{unit}</span>
                      {planned > 0 && <span className="text-accent"> +{Math.round(planned)}{unit}</span>}
                    </>
                  );
                };
                const dim = !d.included ? 'opacity-40' : '';
                return (
                  <tr
                    key={d.date}
                    className={`border-t border-border/50 cursor-pointer transition-colors ${isToday ? 'bg-accent/8' : 'hover:bg-bg'} ${dim}`}
                    onClick={() => navigate('day', { date: d.date, fromWeek: weekStart })}
                  >
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={d.included}
                        onChange={() => toggleDay(d.date, d.included)}
                        title={t('week.includeInAvg')}
                        className="cursor-pointer accent-accent"
                      />
                    </td>
                    <td className="px-4 py-3 text-text">
                      <span>{fmtDate(d.date)}</span>
                      {isToday && (
                        <span className="ml-2 text-xs bg-accent text-white rounded-full px-2 py-0.5">{t('week.today')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-text tabular-nums">{fmtCell(d.calories, d.hasPlanned ? d.planned_calories : 0)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(() => {
                        const e = energyMap.get(d.date);
                        if (!e || (e.resting_kcal === 0 && e.active_kcal === 0 && e.extra_kcal === 0)) return <span className="text-text-sec">—</span>;
                        const net = Math.round(d.proj_calories - e.resting_kcal - e.active_kcal - e.extra_kcal);
                        const outBreakdown = [
                          e.resting_kcal > 0 ? String(e.resting_kcal) : null,
                          e.active_kcal  > 0 ? String(e.active_kcal)  : null,
                          e.extra_kcal   > 0 ? String(e.extra_kcal)   : null,
                        ].filter(Boolean).join(' + ');
                        return (
                          <span
                            className={net <= 0 ? 'text-green' : 'text-accent'}
                            title={`out: ${outBreakdown}`}
                          >
                            {net > 0 ? '+' : ''}{net}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right text-text-sec tabular-nums">{fmtCell(d.fat,     d.hasPlanned ? d.planned_fat     : 0, 'g')}</td>
                    <td className="px-4 py-3 text-right text-text-sec tabular-nums">{fmtCell(d.carbs,   d.hasPlanned ? d.planned_carbs   : 0, 'g')}</td>
                    <td className="px-4 py-3 text-right text-text-sec tabular-nums">{fmtCell(d.fiber,   d.hasPlanned ? d.planned_fiber   : 0, 'g')}</td>
                    <td className="px-4 py-3 text-right text-text-sec tabular-nums">{fmtCell(d.protein, d.hasPlanned ? d.planned_protein : 0, 'g')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
