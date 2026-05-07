import { useEffect, useState, useMemo } from 'react';
import { useT } from '../i18n/useT';
import { useNavigate } from '../hooks/useNavigate';
import { useToast } from '../components/Toast';
import { useSettings } from '../hooks/useSettings';
import { api } from '../api';
import BarChartCard from '../components/BarChartCard';
import PageHeader from '../components/ui/PageHeader';
import { formatShortDate, formatDMY, getMondayOf, today, addDays } from '../lib/dateUtil';
import { buildHistoryMarkdown, copyToClipboard } from '../lib/exportText';
import type { WeeklySummary, GoalPlan } from '../types';

type WeekRange = 4 | 12 | 26 | 52 | 'all';

export default function HistoryPage() {
  const { t } = useT();
  const { settings } = useSettings();
  const { navigate } = useNavigate();
  const { showToast } = useToast();

  const [summaries, setSummaries]   = useState<WeeklySummary[]>([]);
  const [weekRange, setWeekRange]   = useState<WeekRange>(12);
  const [energyByWeek, setEnergyByWeek] = useState<Map<string, { avgNet: number; days: number }>>(new Map());
  const [allPlans, setAllPlans] = useState<GoalPlan[]>([]);

  useEffect(() => {
    api.log.getWeeklySummaries().then(setSummaries);
    api.goals.listPlans().then(setAllPlans);
  }, []);

  // Resolve the plan active on a given date by walking the (ascending) plans list.
  const planForDate = (date: string): GoalPlan | null => {
    let active: GoalPlan | null = null;
    for (const p of allPlans) {
      if (p.effective_from <= date) active = p;
      else break;
    }
    return active;
  };

  const sortedSummaries = useMemo(
    () => [...summaries].sort((a, b) => a.week_start.localeCompare(b.week_start)),
    [summaries],
  );

  useEffect(() => {
    if (!sortedSummaries.length) return;
    const start = sortedSummaries[0].week_start;
    api.dailyEnergy.getRange(start, today()).then(rows => {
      const byMonday = new Map<string, { totalOut: number; days: number }>();
      for (const row of rows) {
        const out = row.resting_kcal + row.active_kcal + row.extra_kcal;
        if (out === 0) continue;
        const key = getMondayOf(row.date);
        const prev = byMonday.get(key) ?? { totalOut: 0, days: 0 };
        byMonday.set(key, { totalOut: prev.totalOut + out, days: prev.days + 1 });
      }
      const result = new Map<string, { avgNet: number; days: number }>();
      for (const s of sortedSummaries) {
        const key = getMondayOf(s.week_start);
        const e = byMonday.get(key);
        if (!e) continue;
        result.set(key, { avgNet: Math.round(s.avg_calories - e.totalOut / e.days), days: e.days });
      }
      setEnergyByWeek(result);
    });
  }, [sortedSummaries.length]);

  const rangedSummaries = weekRange === 'all' ? sortedSummaries : sortedSummaries.slice(-weekRange);

  const chartData = rangedSummaries.map(s => ({
    label:     formatShortDate(getMondayOf(s.week_start)),
    value:     Math.round(s.avg_calories),
  }));

  // For the chart's goal-line, use the most-recent plan that overlaps the visible range
  // (falls back to today's settings if no plans are loaded yet).
  const lastVisibleWeek = rangedSummaries.length > 0 ? rangedSummaries[rangedSummaries.length - 1] : null;
  const lastWeekPlan = lastVisibleWeek ? planForDate(addDays(lastVisibleWeek.week_start, 6)) : null;
  const calRec = lastWeekPlan?.cal_rec ?? settings.cal_rec ?? 2000;
  const calMax = lastWeekPlan?.cal_max ?? settings.cal_max ?? 0;
  const maxBar = Math.max(...chartData.map(d => d.value), 1);
  const yMax   = Math.round(Math.max(calMax || calRec, maxBar) * 1.3);
  const yDomain: [number, number] = [0, yMax];

  // Detect goal changes inside the visible range
  const goalsChangedInRange = useMemo(() => {
    if (rangedSummaries.length === 0 || allPlans.length < 2) return false;
    const start = rangedSummaries[0].week_start;
    const end   = lastVisibleWeek ? addDays(lastVisibleWeek.week_start, 6) : start;
    return allPlans.some(p => p.effective_from > start && p.effective_from <= end);
  }, [rangedSummaries, allPlans, lastVisibleWeek]);

  const todayStr = today();
  const completeWeeks = rangedSummaries.filter(s => addDays(s.week_start, 6) < todayStr);
  const includedForStats = completeWeeks.filter(s => s.avg_calories > 0);
  const statsAvgKcal = includedForStats.length
    ? Math.round(includedForStats.reduce((s, w) => s + w.avg_calories, 0) / includedForStats.length)
    : 0;
  const totalDays = rangedSummaries.reduce((s, w) => s + w.days_logged, 0);
  // Per-week net rows tagged with the goal active that week, so the avg-net comparison
  // is per-week-correct even when goals changed mid-range.
  const netRows = completeWeeks
    .map(s => {
      const e = energyByWeek.get(getMondayOf(s.week_start));
      if (!e) return null;
      const weekPlan = planForDate(addDays(s.week_start, 6));
      const weekCalRec = weekPlan?.cal_rec ?? calRec;
      return { avgNet: e.avgNet, days: e.days, weekCalRec };
    })
    .filter(Boolean) as { avgNet: number; days: number; weekCalRec: number }[];
  const statsAvgNet = netRows.length
    ? Math.round(netRows.reduce((s, e) => s + e.avgNet, 0) / netRows.length)
    : null;
  // Color: green when avg of (avgNet - weekCalRec) ≤ 0
  const statsAvgNetVsGoal = netRows.length
    ? netRows.reduce((s, e) => s + (e.avgNet - e.weekCalRec), 0) / netRows.length
    : 0;

  const rangeBtn = (v: WeekRange) => [
    'text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors',
    v === weekRange ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-sec hover:border-accent/50',
  ].join(' ');

  async function handleCopy() {
    const [streak, weights, goalPlansList] = await Promise.all([
      api.streaks.get(),
      api.weight.getAll(),
      api.goals.listPlans(),
    ]);
    const md = buildHistoryMarkdown({
      summaries,
      settings,
      goalPlans: goalPlansList,
      weightEntries: weights.map(w => ({ date: w.date, weight: w.weight, fat_pct: w.fat_pct })),
      currentStreak: streak.current,
      bestStreak:    streak.best,
    });
    const ok = await copyToClipboard(md);
    showToast(ok ? t('export.copied') : t('export.copyFailed'), ok ? 'success' : 'error');
  }

  function handleWeekBarClick(index: number) {
    const s = rangedSummaries[index];
    if (s) navigate('week', { weekStart: getMondayOf(s.week_start) });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        eyebrow={t('eyebrow.history')}
        title={t('page.history')}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('stats')}
              className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text cursor-pointer transition-colors"
            >
              📊 {t('history.viewStats')}
            </button>
            <button onClick={handleCopy} className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text cursor-pointer transition-colors">
              📋 {t('export.copyHistory')}
            </button>
          </div>
        }
      />

      {/* Range selector */}
      <div className="flex gap-1 justify-end">
        {(['4', '12', '26', '52', 'all'] as const).map(r => {
          const v = r === 'all' ? 'all' : Number(r) as WeekRange;
          return (
            <button key={r} onClick={() => setWeekRange(v)} className={rangeBtn(v)}>
              {r === 'all' ? 'All' : `${r}w`}
            </button>
          );
        })}
      </div>

      {goalsChangedInRange && (
        <div className="rounded-lg bg-accent/5 border border-accent/30 px-3 py-2 text-xs text-accent">
          {t('history.goalsChanged')}
        </div>
      )}

      {summaries.length === 0 ? (
        <p className="text-text-sec text-center py-8">{t('history.noHistory')}</p>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card rounded-xl p-3 border border-border text-center">
              <p className="text-xs text-text-sec mb-1">{t('history.avgKcal')} / day</p>
              <p className="font-semibold text-sm text-accent">{statsAvgKcal} kcal</p>
            </div>
            <div className="bg-card rounded-xl p-3 border border-border text-center">
              <p className="text-xs text-text-sec mb-1">{t('history.avgNet')} / day</p>
              <p className={`font-semibold text-sm ${statsAvgNet == null ? 'text-text-sec' : statsAvgNetVsGoal <= 0 ? 'text-green' : 'text-accent'}`}>
                {statsAvgNet == null ? '—' : `${statsAvgNet > 0 ? '+' : ''}${statsAvgNet} kcal`}
              </p>
            </div>
            <div className="bg-card rounded-xl p-3 border border-border text-center">
              <p className="text-xs text-text-sec mb-1">{t('history.daysTotal')}</p>
              <p className="font-semibold text-sm text-text">{totalDays}</p>
            </div>
          </div>

          {/* Bar chart */}
          {rangedSummaries.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <BarChartCard
                data={chartData}
                unit="kcal"
                goalValue={calRec}
                yDomain={yDomain}
                onBarClick={handleWeekBarClick}
              />
            </div>
          )}

          {/* Table */}
          <div className="bg-card rounded-xl overflow-hidden border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-sec text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">{t('history.weekOf')}</th>
                  <th className="text-right px-4 py-3">{t('history.daysLogged')}</th>
                  <th className="text-right px-4 py-3">{t('history.avgKcal')}</th>
                  <th className="text-right px-4 py-3">{t('history.avgNet')}</th>
                  <th className="text-right px-4 py-3">{t('history.avgFat')}</th>
                  <th className="text-right px-4 py-3">{t('history.avgCarbs')}</th>
                  <th className="text-right px-4 py-3">{t('history.avgFiber')}</th>
                  <th className="text-right px-4 py-3">{t('history.avgProtein')}</th>
                </tr>
              </thead>
              <tbody>
                {[...rangedSummaries].reverse().map(s => {
                  const key = getMondayOf(s.week_start);
                  const energy = energyByWeek.get(key);
                  const weekPlan = planForDate(addDays(s.week_start, 6));
                  const weekCalRec = weekPlan?.cal_rec ?? calRec;
                  return (
                    <tr
                      key={s.week_start}
                      className="border-t border-border/50 hover:bg-bg cursor-pointer transition-colors"
                      onClick={() => navigate('week', { weekStart: key })}
                    >
                      <td className="px-4 py-3 text-text">{formatDMY(key)}</td>
                      <td className="px-4 py-3 text-right text-text-sec">{s.days_logged}</td>
                      <td className="px-4 py-3 text-right text-text tabular-nums">{Math.round(s.avg_calories)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-medium ${
                        !energy ? 'text-text-sec' : energy.avgNet <= weekCalRec ? 'text-green' : 'text-accent'
                      }`}>
                        {energy ? `${energy.avgNet > 0 ? '+' : ''}${energy.avgNet}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-text-sec tabular-nums">{Math.round(s.avg_fat)}g</td>
                      <td className="px-4 py-3 text-right text-text-sec tabular-nums">{Math.round(s.avg_carbs)}g</td>
                      <td className="px-4 py-3 text-right text-text-sec tabular-nums">{Math.round(s.avg_fiber)}g</td>
                      <td className="px-4 py-3 text-right text-text-sec tabular-nums">{Math.round(s.avg_protein)}g</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
