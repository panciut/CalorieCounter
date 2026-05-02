import { useState, useEffect } from 'react';
import { api } from '../api';
import { useSettings } from '../hooks/useSettings';
import { useT } from '../i18n/useT';
import { formatShortDate, buildDateRange, today } from '../lib/dateUtil';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import type { CalorieTrendPoint } from '../types';
import PageHeader from '../components/ui/PageHeader';
import RangePicker from '../components/ui/RangePicker';
import StatCard from '../components/ui/StatCard';

type Range = 7 | 30 | 90;

export default function NetPage() {
  const { settings } = useSettings();
  const { t } = useT();
  const [range, setRange]   = useState<Range>(30);
  const [data, setData]     = useState<CalorieTrendPoint[]>([]);

  useEffect(() => {
    api.analytics.caloriesTrend(range).then(setData);
  }, [range]);

  // Build filled dataset (all dates, zeros for missing)
  const dateRange = buildDateRange(range);
  const dataMap   = new Map(data.map(d => [d.date, d]));
  const filled = dateRange.map(date => {
    const p = dataMap.get(date);
    return {
      date,
      label:        formatShortDate(date),
      calories_in:  p ? Math.round(p.calories_in)  : 0,
      calories_out: p ? Math.round(p.calories_out) : 0,
      resting_kcal: p ? Math.round(p.resting_kcal) : 0,
      active_kcal:  p ? Math.round(p.active_kcal)  : 0,
      extra_kcal:   p ? Math.round(p.extra_kcal)   : 0,
      steps:        p ? (p.steps ?? 0)             : 0,
      net:          p ? Math.round(p.net)           : 0,
    };
  });

  const todayStr  = today();
  const chart     = filled.filter(d => d.date < todayStr);
  const withData  = chart.filter(d => d.calories_in > 0);
  const avgIn     = withData.length ? Math.round(withData.reduce((s, d) => s + d.calories_in,  0) / withData.length) : 0;
  const avgOut    = withData.length ? Math.round(withData.reduce((s, d) => s + d.calories_out, 0) / withData.length) : 0;
  const avgNet    = withData.length ? Math.round(withData.reduce((s, d) => s + d.net,          0) / withData.length) : 0;
  const stepsRows = chart.filter(d => d.steps > 0);
  const avgSteps  = stepsRows.length ? Math.round(stepsRows.reduce((s, d) => s + d.steps, 0) / stepsRows.length) : 0;

  const calRec = settings.cal_rec || 2000;

  const xInterval = range === 7 ? 0 : range === 30 ? 4 : 12;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        eyebrow={t('eyebrow.net')}
        title={t('page.net')}
        action={<RangePicker<Range> value={range} options={[7, 30, 90]} onChange={setRange} />}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Avg food in" value={`${avgIn} kcal`} valueClass="text-accent text-lg" />
        <StatCard label="Avg energy out (Apple Watch)" value={`${avgOut > 0 ? `−${avgOut}` : '—'} kcal`} valueClass="text-green text-lg" />
        <StatCard
          label="Avg net"
          value={avgIn > 0 ? `${avgNet} kcal` : '—'}
          valueClass={`text-lg ${avgNet > 0 && avgNet <= calRec ? 'text-green' : avgNet > calRec ? 'text-red' : ''}`}
        />
        <StatCard label="Avg steps" value={avgSteps > 0 ? avgSteps.toLocaleString() : '—'} valueClass="text-lg" />
      </div>

      {/* Chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-sec)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval={xInterval}
            />
            <YAxis
              tick={{ fill: 'var(--text-sec)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }}
              formatter={((v: unknown, name: unknown) => [`${Number(v)} kcal`, String(name)]) as never}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-sec)' }} />
            {calRec > 0 && (
              <ReferenceLine y={calRec} stroke="var(--text-sec)" strokeDasharray="5 4" strokeWidth={1} />
            )}
            <Line type="monotone" dataKey="calories_in"  name="Food in"      stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="calories_out" name="Energy out (AW)"  stroke="var(--green)"  strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="net"          name="Net"           stroke="var(--text)"   strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Daily table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-sec text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-right px-4 py-3">Food in</th>
              <th className="text-right px-4 py-3">Energy out (AW)</th>
              <th className="text-right px-4 py-3">Net</th>
              <th className="text-right px-4 py-3">Steps</th>
            </tr>
          </thead>
          <tbody>
            {[...chart].reverse().map(d => (
              <tr key={d.date} className="border-t border-border/50 hover:bg-bg/50 transition-colors">
                <td className="px-4 py-2.5 text-text-sec text-xs">{d.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text">
                  {d.calories_in > 0 ? d.calories_in : <span className="text-text-sec">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-green">
                  {d.calories_out > 0
                    ? `−${[
                        d.resting_kcal > 0 ? String(d.resting_kcal) : null,
                        d.active_kcal  > 0 ? String(d.active_kcal)  : null,
                        d.extra_kcal   > 0 ? String(d.extra_kcal)   : null,
                      ].filter(Boolean).join(' + ')}`
                    : <span className="text-text-sec">—</span>}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                  d.calories_in > 0 ? (d.net <= calRec ? 'text-green' : 'text-red') : 'text-text-sec'
                }`}>
                  {d.calories_in > 0 ? d.net : '—'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-sec">
                  {d.steps > 0 ? d.steps.toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
