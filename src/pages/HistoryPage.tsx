import { useEffect, useState, useMemo } from 'react';
import { useT } from '../i18n/useT';
import { useNavigate } from '../hooks/useNavigate';
import { useToast } from '../components/Toast';
import { useSettings } from '../hooks/useSettings';
import { api } from '../api';
import BarChartCard from '../components/BarChartCard';
import Tabs from '../components/ui/Tabs';
import PageHeader from '../components/ui/PageHeader';
import { MACRO_COLORS } from '../lib/macroColors';
import { formatShortDate, formatDMY, getMondayOf, today, addDays, buildDateRange, MS_PER_DAY } from '../lib/dateUtil';
import { buildHistoryMarkdown, copyToClipboard } from '../lib/exportText';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ReferenceLine,
} from 'recharts';
import type { WeeklySummary, MacroTrendPoint, CalorieTrendPoint, WeightEntry } from '../types';

type Tab = 'weekly' | 'analytics';
type WeekRange = 4 | 12 | 26 | 52 | 'all';
type AnalyticsRange = 7 | 30 | 90 | 180;

export default function HistoryPage() {
  const { t } = useT();
  const { settings } = useSettings();
  const { navigate } = useNavigate();
  const { showToast } = useToast();

  const [tab, setTab]               = useState<Tab>('weekly');
  const [summaries, setSummaries]   = useState<WeeklySummary[]>([]);
  const [weekRange, setWeekRange]   = useState<WeekRange>(12);
  const [energyByWeek, setEnergyByWeek] = useState<Map<string, { avgNet: number; days: number }>>(new Map());

  const [aRange, setARange]         = useState<AnalyticsRange>(30);
  const [macroData, setMacroData]   = useState<MacroTrendPoint[]>([]);
  const [calData, setCalData]       = useState<CalorieTrendPoint[]>([]);
  const [weightData, setWeightData] = useState<WeightEntry[]>([]);

  useEffect(() => {
    api.log.getWeeklySummaries().then(setSummaries);
  }, []);

  useEffect(() => {
    if (tab === 'analytics') {
      api.analytics.macroTrend(aRange).then(setMacroData);
      api.analytics.caloriesTrend(aRange).then(setCalData);
      api.weight.getAll().then(setWeightData);
    }
  }, [tab, aRange]);

  // Sort ASC (IPC returns DESC)
  const sortedSummaries = useMemo(
    () => [...summaries].sort((a, b) => a.week_start.localeCompare(b.week_start)),
    [summaries],
  );

  // Load energy data for weekly net column whenever the sorted list changes
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

  // Apply week range filter (slice newest N from ASC array)
  const rangedSummaries = weekRange === 'all' ? sortedSummaries : sortedSummaries.slice(-weekRange);

  // Weekly bar chart data — ASC order = left→right = oldest→newest
  const chartData = rangedSummaries.map(s => ({
    label:     formatShortDate(getMondayOf(s.week_start)),
    value:     Math.round(s.avg_calories),
  }));

  // Y-axis domain: stable scale anchored to calorie goal
  const calRec = settings.cal_rec || 2000;
  const calMax = settings.cal_max || 0;
  const maxBar = Math.max(...chartData.map(d => d.value), 1);
  const yMax   = Math.round(Math.max(calMax || calRec, maxBar) * 1.3);
  const yDomain: [number, number] = [0, yMax];

  // Summary stats for the weekly tab — exclude the current (incomplete) week
  const todayStr = today();
  const completeWeeks = rangedSummaries.filter(s => addDays(s.week_start, 6) < todayStr);
  const includedForStats = completeWeeks.filter(s => s.avg_calories > 0);
  const statsAvgKcal = includedForStats.length
    ? Math.round(includedForStats.reduce((s, w) => s + w.avg_calories, 0) / includedForStats.length)
    : 0;
  const totalDays = rangedSummaries.reduce((s, w) => s + w.days_logged, 0);
  const netRows = completeWeeks
    .map(s => energyByWeek.get(getMondayOf(s.week_start)))
    .filter(Boolean) as { avgNet: number; days: number }[];
  const statsAvgNet = netRows.length
    ? Math.round(netRows.reduce((s, e) => s + e.avgNet, 0) / netRows.length)
    : null;

  // Analytics — fill date arrays
  const dateRange = buildDateRange(aRange);
  const calMap    = new Map(calData.map(d => [d.date, d]));
  const filledCal = dateRange.map(date => {
    const p = calMap.get(date);
    return {
      date,
      label:        formatShortDate(date),
      calories_in:  p ? Math.round(p.calories_in)  : 0,
      calories_out: p ? Math.round(p.calories_out) : 0,
      net:          p ? Math.round(p.net)           : 0,
    };
  });

  const macroMap   = new Map(macroData.map(d => [d.date, d]));
  const filledMacro = dateRange.map(date => {
    const p = macroMap.get(date);
    return {
      label:   formatShortDate(date),
      fat:     p ? Math.round(p.fat)     : 0,
      carbs:   p ? Math.round(p.carbs)   : 0,
      fiber:   p ? Math.round(p.fiber)   : 0,
      protein: p ? Math.round(p.protein) : 0,
    };
  });

  const cutoff = addDays(today(), -(aRange - 1));
  const filteredWeight = weightData
    .filter(w => w.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(w => ({
      label:   formatShortDate(w.date),
      ts:      new Date(w.date).getTime(),
      weight:  w.weight,
      fat_pct: w.fat_pct,
    }));
  const hasWeightFatPct = filteredWeight.some(w => w.fat_pct != null);
  const weightMinTs = filteredWeight.length ? filteredWeight[0].ts : 0;
  const weightMaxTs = filteredWeight.length ? filteredWeight[filteredWeight.length - 1].ts : 0;
  const weightSpanDays = Math.max(1, (weightMaxTs - weightMinTs) / MS_PER_DAY);
  const weightTickFmt = (ms: number) => {
    const d = new Date(ms);
    return weightSpanDays > 180
      ? d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const xInterval = aRange === 7 ? 0 : aRange === 30 ? 4 : aRange === 90 ? 12 : 20;

  const tooltipStyle = {
    background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)',
  };

  const rangeBtn = (v: WeekRange | AnalyticsRange, current: WeekRange | AnalyticsRange) => [
    'text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors',
    v === current ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-sec hover:border-accent/50',
  ].join(' ');

  async function handleCopy() {
    const [streak, weights] = await Promise.all([api.streaks.get(), api.weight.getAll()]);
    const md = buildHistoryMarkdown({
      summaries,
      settings,
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

  function handleCalTrendClick(data: { activePayload?: { payload: { date: string } }[] }) {
    const date = data?.activePayload?.[0]?.payload?.date;
    if (date) navigate('day', { date });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        eyebrow={t('eyebrow.history')}
        title={t('page.history')}
        action={
          <button onClick={handleCopy} className="text-sm text-text-sec border border-border rounded-lg px-3 py-1.5 hover:border-accent/50 hover:text-text cursor-pointer transition-colors">
            📋 {t('export.copyHistory')}
          </button>
        }
      />

      <Tabs<Tab>
        items={[{ id: 'weekly', label: 'Weekly' }, { id: 'analytics', label: 'Analytics' }]}
        active={tab}
        onChange={setTab}
      />

      {/* ── WEEKLY TAB ────────────────────────────────────────────────────────── */}
      {tab === 'weekly' && (
        <>
          {/* Range selector */}
          <div className="flex gap-1 justify-end">
            {(['4', '12', '26', '52', 'all'] as const).map(r => {
              const v = r === 'all' ? 'all' : Number(r) as WeekRange;
              return (
                <button key={r} onClick={() => setWeekRange(v)} className={rangeBtn(v, weekRange)}>
                  {r === 'all' ? 'All' : `${r}w`}
                </button>
              );
            })}
          </div>

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
                  <p className={`font-semibold text-sm ${statsAvgNet == null ? 'text-text-sec' : statsAvgNet <= calRec ? 'text-green' : 'text-accent'}`}>
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

              {/* Table — newest at top */}
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
                            !energy ? 'text-text-sec' : energy.avgNet <= calRec ? 'text-green' : 'text-accent'
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
        </>
      )}

      {/* ── ANALYTICS TAB ─────────────────────────────────────────────────────── */}
      {tab === 'analytics' && (
        <>
          {/* Range selector */}
          <div className="flex gap-1 justify-end">
            {([7, 30, 90, 180] as AnalyticsRange[]).map(r => (
              <button key={r} onClick={() => setARange(r)} className={rangeBtn(r, aRange)}>
                {r}d
              </button>
            ))}
          </div>

          {/* Calorie trend */}
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-text-sec uppercase tracking-wider mb-4">Calorie trend</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={filledCal}
                margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                onClick={(data) => handleCalTrendClick(data as Parameters<typeof handleCalTrendClick>[0])}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} interval={xInterval} />
                <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                  formatter={((v: unknown, name: unknown) => [`${Number(v)} kcal`, String(name)]) as never}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-sec)' }} />
                {calRec > 0 && <ReferenceLine y={calRec} stroke="var(--text-sec)" strokeDasharray="5 4" strokeWidth={1} />}
                <Line type="monotone" dataKey="calories_in"  name="Food in"    stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="calories_out" name="Energy out"  stroke="var(--green)"  strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="net"          name="Net"         stroke="var(--text)"   strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Macro trend */}
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-text-sec uppercase tracking-wider mb-4">Macro trend (g/day)</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={filledMacro} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} interval={xInterval} />
                <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: 'var(--border)' }}
                  formatter={((v: unknown, n: unknown) => [`${Number(v)}g`, String(n)]) as never}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-sec)' }} />
                <Bar dataKey="fat"     name="Fat"     stackId="a" fill={MACRO_COLORS.fat}     radius={[0,0,0,0]} maxBarSize={48} />
                <Bar dataKey="carbs"   name="Carbs"   stackId="a" fill={MACRO_COLORS.carbs}   radius={[0,0,0,0]} maxBarSize={48} />
                <Bar dataKey="fiber"   name="Fiber"   stackId="a" fill={MACRO_COLORS.fiber}   radius={[0,0,0,0]} maxBarSize={48} />
                <Bar dataKey="protein" name="Protein" stackId="a" fill={MACRO_COLORS.protein} radius={[3,3,0,0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Weight trend */}
          {filteredWeight.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-text-sec uppercase tracking-wider mb-4">Weight trend</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={filteredWeight} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    scale="time"
                    domain={[weightMinTs, weightMaxTs]}
                    tick={{ fill: 'var(--text-sec)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => weightTickFmt(Number(v))}
                  />
                  <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                    formatter={((v: unknown, name: unknown) => [name === 'fat_pct' ? `${Number(v)}%` : `${Number(v)} kg`, name === 'fat_pct' ? 'Body fat' : 'Weight']) as never}
                    labelFormatter={(v: unknown) => new Date(Number(v)).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-sec)' }} />
                  <Line type="monotone" dataKey="weight"  name="Weight" stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls />
                  {hasWeightFatPct && (
                    <Line type="monotone" dataKey="fat_pct" name="Body fat" stroke="var(--text-sec)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
