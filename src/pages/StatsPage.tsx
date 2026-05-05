import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { useT } from '../i18n/useT';
import { useSettings } from '../hooks/useSettings';
import { useNavigate } from '../hooks/useNavigate';
import { api } from '../api';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import Tabs from '../components/ui/Tabs';
import Heatmap from '../components/Heatmap';
import { MACRO_COLORS } from '../lib/macroColors';
import { formatShortDate, formatDMY, addDays } from '../lib/dateUtil';
import type { StatsBundle, StatsRange, Meal } from '../types';

type StatsTab = 'overview' | 'nutrition' | 'body' | 'training' | 'activity' | 'records';

const RANGES: { v: StatsRange; label: string }[] = [
  { v: 7,   label: '7d' },
  { v: 30,  label: '30d' },
  { v: 90,  label: '90d' },
  { v: 180, label: '180d' },
  { v: 365, label: '1y' },
  { v: 'all', label: 'All' },
];

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtNum(n: number | null | undefined, suffix = ''): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toLocaleString()}${suffix}`;
}

function fmtSigned(n: number | null | undefined, suffix = ''): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString()}${suffix}`;
}

function deltaClass(n: number | null | undefined, goodDirection: 'up' | 'down' = 'down'): string {
  if (n == null || n === 0) return 'text-text-sec';
  const isGood = goodDirection === 'down' ? n < 0 : n > 0;
  return isGood ? 'text-green' : 'text-accent';
}

const tooltipStyle = {
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: 'var(--text)',
};

// ── Cards ────────────────────────────────────────────────────────────────────

function CardSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-text-sec uppercase tracking-wider">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Tab views (defined at module level to preserve mount identity) ───────────

function OverviewTab({ stats, t, navigate }: TabProps) {
  const s = stats.summary;
  return (
    <>
      {/* Hero KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label={t('stats.daysLogged')} value={s.days_with_food} detail={t('stats.inRange')} />
        <StatCard label={t('stats.currentStreak')} value={`${s.current_streak} d`} detail={`${t('stats.best')}: ${s.best_streak} d`} valueClass="text-accent" />
        <StatCard label={t('stats.avgKcalPerDay')} value={`${s.avg_kcal_per_day} kcal`} />
        <StatCard label={t('stats.avgNetPerDay')} value={s.avg_net_per_day == null ? '—' : `${fmtSigned(s.avg_net_per_day)} kcal`}
          valueClass={s.avg_net_per_day == null ? '' : (s.avg_net_per_day < 0 ? 'text-green' : 'text-accent')} />
        <StatCard label={t('stats.totalKcalLogged')} value={fmtNum(s.total_kcal_logged)} />
        <StatCard label={t('stats.totalKcalBurned')} value={fmtNum(s.total_kcal_burned)} />
      </div>

      {/* Heatmap */}
      <CardSection title={t('stats.heatmap')}>
        <Heatmap days={stats.heatmap} metric="food" onCellClick={(d) => navigate('day', { date: d })} />
        <p className="text-[11px] text-text-sec mt-2">{t('stats.heatmapHint')}</p>
      </CardSection>

      {/* Compliance bars */}
      <CardSection title={t('stats.compliance')}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(['calories', 'protein', 'carbs', 'fat', 'fiber'] as const).map(k => {
            const c = stats.compliance[k];
            const tint = k === 'calories' ? 'var(--accent)' : (MACRO_COLORS[k as keyof typeof MACRO_COLORS] || 'var(--accent)');
            return (
              <div key={k} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-text-sec capitalize">{t(`stats.macro.${k}`)}</span>
                  <span className="text-sm font-semibold tabular-nums">{c.pct}%</span>
                </div>
                <div className="h-2 bg-card-hover rounded-full overflow-hidden">
                  <div style={{ width: `${c.pct}%`, height: '100%', background: tint, transition: 'width .3s' }} />
                </div>
                <span className="text-[10px] text-text-sec">{c.hit} / {c.total} {t('stats.daysInBand')}</span>
              </div>
            );
          })}
        </div>
      </CardSection>

      {/* Calorie trend */}
      <CardSection title={t('stats.calorieTrend')}>
        <CalorieTrendChart stats={stats} navigate={navigate} t={t} />
      </CardSection>

      {/* Day-of-week pattern */}
      <CardSection title={t('stats.dayOfWeek')}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stats.dayOfWeek.map(d => ({ ...d, label: DOW_LABELS[d.dow] }))} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--border)' }} formatter={((v: unknown, n: unknown) => [`${Number(v)} ${n === 'avg_steps' ? '' : 'kcal'}`, String(n).replace('avg_', '')]) as never} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-sec)' }} />
            <Bar dataKey="avg_kcal" name="Avg kcal in" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={48} />
            <Bar dataKey="avg_burned" name="Avg burned" fill="var(--green)" radius={[3, 3, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </CardSection>
    </>
  );
}

function NutritionTab({ stats, t, tMeal, settings }: TabProps) {
  const ms = stats.macroSplit;
  const pieData = [
    { name: t('macro.protein'), value: ms.protein_pct, color: MACRO_COLORS.protein },
    { name: t('macro.carbs'),   value: ms.carbs_pct,   color: MACRO_COLORS.carbs },
    { name: t('macro.fat'),     value: ms.fat_pct,     color: MACRO_COLORS.fat },
  ];
  const trackExtra = settings.track_extra_nutrition === 1;

  return (
    <>
      {/* Macro split + protein per kg */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardSection title={t('stats.macroSplit')}>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={36} outerRadius={64} paddingAngle={2} stroke="none">
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 flex flex-col gap-2 text-sm">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-2">
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color }} />
                  <span className="text-text-sec flex-1">{d.name}</span>
                  <span className="font-semibold tabular-nums">{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </CardSection>

        <StatCard
          label={t('stats.proteinPerKg')}
          value={ms.protein_g_per_kg_bw == null ? '—' : `${ms.protein_g_per_kg_bw} g/kg`}
          detail={ms.body_weight_kg ? `${t('stats.bodyWeight')}: ${ms.body_weight_kg} kg` : t('stats.noWeightData')}
          valueClass="text-accent"
        />
        <StatCard
          label={t('stats.avgFiber')}
          value={`${stats.summary.avg_fiber_per_day} g/day`}
          detail={`${stats.compliance.fiber.pct}% ${t('stats.daysInBand')}`}
        />
      </div>

      {/* Avg macros bar */}
      <CardSection title={t('stats.macroTrend')}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={stats.caloriesByDay.map(d => ({ ...d, label: formatShortDate(d.date) }))}
            margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false}
              interval={Math.max(0, Math.floor(stats.caloriesByDay.length / 12))} />
            <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--border)' }}
              formatter={((v: unknown, n: unknown) => [`${Number(v)}g`, String(n)]) as never} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-sec)' }} />
            <Bar dataKey="fat"     name={t('macro.fat')}     stackId="a" fill={MACRO_COLORS.fat}     maxBarSize={42} />
            <Bar dataKey="carbs"   name={t('macro.carbs')}   stackId="a" fill={MACRO_COLORS.carbs}   maxBarSize={42} />
            <Bar dataKey="fiber"   name={t('macro.fiber')}   stackId="a" fill={MACRO_COLORS.fiber}   maxBarSize={42} />
            <Bar dataKey="protein" name={t('macro.protein')} stackId="a" fill={MACRO_COLORS.protein} maxBarSize={42} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardSection>

      {/* Micros (only if any data) */}
      {trackExtra && stats.micros.length > 0 && (
        <CardSection title={t('stats.microsTrend')}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={stats.micros.map(d => ({ ...d, label: formatShortDate(d.date) }))}
              margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false}
                interval={Math.max(0, Math.floor(stats.micros.length / 12))} />
              <YAxis yAxisId="g" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="mg" orientation="right" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                formatter={((v: unknown, n: unknown) => [`${Number(v)}${n === 'sodium_mg' ? ' mg' : ' g'}`, String(n)]) as never} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-sec)' }} />
              <Line yAxisId="g"  type="monotone" dataKey="sugar"         name={t('stats.sugar')}        stroke="#e879f9" strokeWidth={2} dot={false} />
              <Line yAxisId="g"  type="monotone" dataKey="saturated_fat" name={t('stats.saturatedFat')} stroke="#fb923c" strokeWidth={2} dot={false} />
              <Line yAxisId="mg" type="monotone" dataKey="sodium_mg"     name={t('stats.sodium')}       stroke="#60a5fa" strokeWidth={2} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardSection>
      )}

      {/* Meal distribution */}
      <CardSection title={t('stats.mealDistribution')}>
        <div className="flex flex-col gap-2">
          {stats.mealDistribution.filter(m => m.kcal > 0).map(m => (
            <div key={m.meal} className="flex items-center gap-3">
              <span className="text-sm text-text w-32 shrink-0">{tMeal(m.meal as Meal)}</span>
              <div className="flex-1 h-3 bg-card-hover rounded-full overflow-hidden">
                <div style={{ width: `${m.pct}%`, height: '100%', background: 'var(--accent)' }} />
              </div>
              <span className="text-xs text-text-sec tabular-nums w-24 text-right">{m.avg_kcal} kcal/day</span>
              <span className="text-xs text-text-sec tabular-nums w-12 text-right">{m.pct}%</span>
            </div>
          ))}
          {stats.mealDistribution.every(m => m.kcal === 0) && (
            <p className="text-text-sec text-sm">{t('stats.noData')}</p>
          )}
        </div>
      </CardSection>

      {/* Top foods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CardSection title={t('stats.topFoodsByFreq')}>
          <FoodsTable rows={stats.topFoodsByFreq} sortKey="count" />
        </CardSection>
        <CardSection title={t('stats.topFoodsByKcal')}>
          <FoodsTable rows={stats.topFoodsByKcal} sortKey="kcal" />
        </CardSection>
      </div>
    </>
  );
}

function FoodsTable({ rows, sortKey }: { rows: StatsBundle['topFoodsByFreq']; sortKey: 'count' | 'kcal' }) {
  if (!rows.length) return <p className="text-text-sec text-sm">No data</p>;
  const max = Math.max(...rows.map(r => sortKey === 'count' ? r.count : r.total_kcal), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(r => {
        const v = sortKey === 'count' ? r.count : r.total_kcal;
        const pct = (v / max) * 100;
        return (
          <div key={r.food_id} className="flex items-center gap-3 text-sm">
            <span className="flex-1 truncate text-text">{r.name}</span>
            <div className="w-32 h-2 bg-card-hover rounded-full overflow-hidden">
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
            <span className="tabular-nums text-text-sec w-20 text-right">
              {sortKey === 'count' ? `${r.count}×` : `${r.total_kcal.toLocaleString()} kcal`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BodyTab({ stats, t }: TabProps) {
  const b = stats.body;
  const points = b.points.map(p => ({ ...p, label: formatShortDate(p.date), ts: new Date(p.date + 'T00:00:00').getTime() }));

  // 7-day moving average for weight
  const ma = points.map((p, i) => {
    const window = points.slice(Math.max(0, i - 6), i + 1).map(x => x.weight);
    const avg = window.reduce((s, x) => s + x, 0) / window.length;
    return { ...p, weight_ma: +avg.toFixed(2) };
  });

  const eta = b.goal_eta_days;
  const etaDate = eta != null ? formatDMY(addDays(stats.range.end_date, eta)) : null;

  const measurementKeys: ('waist' | 'chest' | 'arms' | 'thighs' | 'hips' | 'neck')[] =
    ['waist', 'chest', 'arms', 'thighs', 'hips', 'neck'];

  return (
    <>
      {/* Headline body stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label={t('stats.weightChange')}
          value={b.weight_delta == null ? '—' : `${fmtSigned(b.weight_delta)} kg`}
          detail={b.weight_first != null && b.weight_last != null ? `${b.weight_first} → ${b.weight_last} kg` : undefined}
          valueClass={deltaClass(b.weight_delta, 'down')}
        />
        <StatCard
          label={t('stats.weeklyRate')}
          value={b.weekly_rate_kg ? `${fmtSigned(+b.weekly_rate_kg.toFixed(2))} kg/wk` : '—'}
        />
        <StatCard
          label={t('stats.bodyFatChange')}
          value={b.fat_delta == null ? '—' : `${fmtSigned(+b.fat_delta.toFixed(2))}%`}
          detail={b.fat_first != null && b.fat_last != null ? `${b.fat_first}% → ${b.fat_last}%` : undefined}
          valueClass={deltaClass(b.fat_delta, 'down')}
        />
        <StatCard
          label={t('stats.leanMassChange')}
          value={b.lean_delta == null ? '—' : `${fmtSigned(+b.lean_delta.toFixed(2))} kg`}
          detail={b.lean_first != null && b.lean_last != null ? `${b.lean_first} → ${b.lean_last} kg` : undefined}
          valueClass={deltaClass(b.lean_delta, 'up')}
        />
      </div>

      {b.goal_weight && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-text-sec">
            {t('stats.goalEta', {
              goal: b.goal_weight,
              eta: eta == null ? t('stats.etaUnknown') : `${eta} ${t('stats.days')} (${etaDate})`,
            })}
          </p>
        </div>
      )}

      {/* Weight + MA chart */}
      {points.length > 0 && (
        <CardSection title={t('stats.weightTrend')}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={ma} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false}
                interval={Math.max(0, Math.floor(points.length / 12))} />
              <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                formatter={((v: unknown, n: unknown) => [`${Number(v)} kg`, String(n)]) as never} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-sec)' }} />
              {b.goal_weight && <ReferenceLine y={b.goal_weight} stroke="var(--green)" strokeDasharray="4 3" label={{ value: 'Goal', fill: 'var(--text-sec)', fontSize: 11 }} />}
              <Line type="monotone" dataKey="weight"    name={t('stats.weight')}    stroke="var(--accent)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              <Line type="monotone" dataKey="weight_ma" name={t('stats.movingAvg')} stroke="var(--text)"   strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </CardSection>
      )}

      {/* Body fat & lean mass charts */}
      {points.some(p => p.fat_pct != null) && (
        <CardSection title={t('stats.bodyComposition')}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={points} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false}
                interval={Math.max(0, Math.floor(points.length / 12))} />
              <YAxis yAxisId="pct"  tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto','auto']} />
              <YAxis yAxisId="kg" orientation="right" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto','auto']} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-sec)' }} />
              <Line yAxisId="pct" type="monotone" dataKey="fat_pct" name={t('stats.bodyFat')}  stroke="#fb923c" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              <Line yAxisId="kg"  type="monotone" dataKey="lean_kg" name={t('stats.leanMass')} stroke="#60a5fa" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </CardSection>
      )}

      {/* Measurements deltas */}
      {b.meas_first && b.meas_last && (
        <CardSection title={t('stats.measurementsDeltas')}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {measurementKeys.map(k => {
              const a = b.meas_first?.[k];
              const z = b.meas_last?.[k];
              if (a == null || z == null) return null;
              const delta = +(z - a).toFixed(1);
              return (
                <StatCard
                  key={k}
                  label={t(`meas.${k}`).replace(' (cm)', '')}
                  value={`${z} cm`}
                  detail={`${fmtSigned(delta)} cm`}
                  valueClass={deltaClass(delta, 'down')}
                />
              );
            })}
          </div>
        </CardSection>
      )}
    </>
  );
}

function TrainingTab({ stats, t }: TabProps) {
  const tr = stats.training;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={t('stats.sessions')}    value={fmtNum(tr.sessions)} />
        <StatCard label={t('stats.totalMinutes')} value={fmtNum(tr.total_minutes, ' min')} />
        <StatCard label={t('stats.totalBurned')}  value={fmtNum(tr.total_burned, ' kcal')} />
        <StatCard
          label={t('stats.planAdherence')}
          value={tr.plan_done_pct == null ? '—' : `${tr.plan_done_pct}%`}
          detail={tr.plan_done_pct == null ? t('stats.noScheduledWorkouts') : undefined}
          valueClass="text-accent"
        />
      </div>

      {tr.by_category.length > 0 && (
        <CardSection title={t('stats.byCategory')}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {tr.by_category.map(c => (
              <div key={c.category} className="bg-bg rounded-lg p-3 border border-border">
                <p className="text-xs text-text-sec capitalize">{c.category}</p>
                <p className="text-base font-semibold mt-1">{c.sessions} {t('stats.sessionsShort')}</p>
                <p className="text-xs text-text-sec">{c.minutes} min · {c.burned} kcal</p>
              </div>
            ))}
          </div>
        </CardSection>
      )}

      {tr.by_muscle.length > 0 && (
        <CardSection title={t('stats.tonnageByMuscle')}>
          <ResponsiveContainer width="100%" height={Math.max(180, tr.by_muscle.length * 28)}>
            <BarChart data={tr.by_muscle} layout="vertical" margin={{ top: 4, right: 16, left: 60, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="muscle" type="category" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--border)' }}
                formatter={((v: unknown) => [`${Number(v).toLocaleString()} kg`, t('stats.volume')]) as never} />
              <Bar dataKey="total_volume_kg" fill="var(--accent)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardSection>
      )}

      {tr.top_exercises.length > 0 && (
        <CardSection title={t('stats.topExercises')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-sec text-xs uppercase tracking-wider border-b border-border">
                  <th className="text-left py-2 pr-3">{t('stats.exercise')}</th>
                  <th className="text-right py-2 px-3">{t('stats.sessionsShort')}</th>
                  <th className="text-right py-2 px-3">{t('stats.minutes')}</th>
                  <th className="text-right py-2 px-3">{t('stats.burnedShort')}</th>
                  <th className="text-right py-2 pl-3">{t('stats.volume')}</th>
                </tr>
              </thead>
              <tbody>
                {tr.top_exercises.map(e => (
                  <tr key={e.name} className="border-t border-border/50">
                    <td className="py-2 pr-3 truncate">{e.name}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{e.sessions}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{e.total_minutes}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{e.total_burned}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{e.total_volume_kg ? `${e.total_volume_kg.toLocaleString()} kg` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardSection>
      )}

      {tr.longest_session && (
        <CardSection title={t('stats.longestSession')}>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold text-accent tabular-nums">{tr.longest_session.duration_min} min</span>
            <span className="text-sm text-text-sec">{tr.longest_session.type}</span>
            <span className="text-xs text-text-sec ml-auto">{formatDMY(tr.longest_session.date)}</span>
          </div>
        </CardSection>
      )}
    </>
  );
}

function ActivityTab({ stats, t }: TabProps) {
  const a = stats.activity;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={t('stats.avgSteps')}       value={fmtNum(a.avg_steps)}      detail={`${t('stats.total')}: ${fmtNum(a.total_steps)}`} />
        <StatCard label={t('stats.avgDistance')}    value={`${a.avg_distance_km} km`} detail={`${t('stats.total')}: ${a.total_distance_km} km`} />
        <StatCard label={t('stats.avgActiveKcal')}  value={fmtNum(a.avg_active_kcal, ' kcal')} detail={`${t('stats.total')}: ${fmtNum(a.total_active_kcal)} kcal`} valueClass="text-accent" />
        <StatCard label={t('stats.avgRestingKcal')} value={fmtNum(a.avg_resting_kcal, ' kcal')} detail={`${t('stats.extra')}: ${a.avg_extra_kcal} kcal/day`} />
      </div>

      {a.points.length > 0 && (
        <>
          <CardSection title={t('stats.stepsTrend')}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={a.points.map(p => ({ ...p, label: formatShortDate(p.date) }))} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false}
                  interval={Math.max(0, Math.floor(a.points.length / 12))} />
                <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--border)' }}
                  formatter={((v: unknown) => [`${Number(v).toLocaleString()} ${t('stats.steps')}`, t('stats.steps')]) as never} />
                <Bar dataKey="steps" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </CardSection>

          <CardSection title={t('stats.activeKcalTrend')}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={a.points.map(p => ({ ...p, label: formatShortDate(p.date) }))} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false}
                  interval={Math.max(0, Math.floor(a.points.length / 12))} />
                <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                  formatter={((v: unknown, n: unknown) => [`${Number(v)} kcal`, String(n)]) as never} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-sec)' }} />
                <Line type="monotone" dataKey="active_kcal"  name={t('stats.activeKcal')}  stroke="var(--accent)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="resting_kcal" name={t('stats.restingKcal')} stroke="var(--text-sec)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                <Line type="monotone" dataKey="extra_kcal"   name={t('stats.extraKcal')}   stroke="var(--green)"  strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardSection>

          <CardSection title={t('stats.distanceTrend')}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={a.points.map(p => ({ ...p, label: formatShortDate(p.date) }))} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false}
                  interval={Math.max(0, Math.floor(a.points.length / 12))} />
                <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--border)' }}
                  formatter={((v: unknown) => [`${Number(v)} km`, t('stats.distance')]) as never} />
                <Bar dataKey="distance_km" fill="var(--green)" radius={[3, 3, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </CardSection>
        </>
      )}

      {a.max_steps_day && (
        <CardSection title={t('stats.peakDay')}>
          <p className="text-sm">
            <span className="text-2xl font-semibold text-accent tabular-nums">{a.max_steps_day.steps.toLocaleString()}</span>
            <span className="text-text-sec ml-2">{t('stats.stepsOn')} {formatDMY(a.max_steps_day.date)}</span>
          </p>
        </CardSection>
      )}
    </>
  );
}

function RecordsTab({ stats, t, navigate }: TabProps) {
  const r = stats.records;

  function recordCard(label: string, line1: string, sub?: string, date?: string) {
    return (
      <div
        className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-accent/50 transition-colors"
        onClick={() => date && navigate('day', { date })}
      >
        <p className="text-xs text-text-sec uppercase tracking-wider">{label}</p>
        <p className="text-xl font-semibold mt-1.5 text-accent tabular-nums">{line1}</p>
        {sub && <p className="text-xs text-text-sec mt-1">{sub}</p>}
        {date && <p className="text-[10px] text-text-sec/70 mt-2">{formatDMY(date)}</p>}
      </div>
    );
  }

  return (
    <>
      <p className="text-xs text-text-sec uppercase tracking-wider">{t('stats.allTime')}</p>

      {/* All-time totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label={t('stats.daysLogged')}        value={fmtNum(r.days_logged_alltime)} />
        <StatCard label={t('stats.totalKcalTracked')}  value={fmtNum(r.total_kcal_tracked)} />
        <StatCard label={t('stats.totalWorkouts')}     value={fmtNum(r.total_workouts)} />
        <StatCard label={t('stats.totalSteps')}        value={fmtNum(r.total_steps)} />
        <StatCard label={t('stats.totalDistance')}     value={`${r.total_distance_km.toLocaleString()} km`} />
        <StatCard label={t('stats.totalWater')}        value={`${(r.total_water_ml / 1000).toFixed(1)} L`} />
      </div>

      {/* Records */}
      <p className="text-xs text-text-sec uppercase tracking-wider mt-4">{t('stats.personalRecords')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {r.heaviest_set && recordCard(
          t('stats.heaviestSet'),
          `${r.heaviest_set.weight_kg} kg × ${r.heaviest_set.reps}`,
          r.heaviest_set.type, r.heaviest_set.date,
        )}
        {r.longest_run && recordCard(
          t('stats.longestCardio'),
          `${r.longest_run.duration_min} min`,
          r.longest_run.type, r.longest_run.date,
        )}
        {r.longest_session && recordCard(
          t('stats.longestSession'),
          `${r.longest_session.duration_min} min`,
          `${r.longest_session.type} · ${Math.round(r.longest_session.calories_burned)} kcal`,
          r.longest_session.date,
        )}
        {r.most_steps_day && recordCard(
          t('stats.mostSteps'),
          r.most_steps_day.steps.toLocaleString(),
          undefined, r.most_steps_day.date,
        )}
        {r.most_burned_day && recordCard(
          t('stats.mostBurnedDay'),
          `${r.most_burned_day.kcal.toLocaleString()} kcal`,
          undefined, r.most_burned_day.date,
        )}
        {r.biggest_kcal_day && recordCard(
          t('stats.biggestKcalDay'),
          `${r.biggest_kcal_day.kcal.toLocaleString()} kcal`,
          undefined, r.biggest_kcal_day.date,
        )}
        {r.smallest_kcal_day && recordCard(
          t('stats.smallestKcalDay'),
          `${r.smallest_kcal_day.kcal.toLocaleString()} kcal`,
          undefined, r.smallest_kcal_day.date,
        )}
        {r.most_water_day && recordCard(
          t('stats.mostWater'),
          `${r.most_water_day.ml.toLocaleString()} ml`,
          undefined, r.most_water_day.date,
        )}
        {r.biggest_weight_drop && recordCard(
          t('stats.biggestDrop'),
          `−${r.biggest_weight_drop.drop_kg} kg`,
          `${formatDMY(r.biggest_weight_drop.from.date)} → ${formatDMY(r.biggest_weight_drop.to.date)}`,
          r.biggest_weight_drop.to.date,
        )}
        {r.best_streak > 0 && recordCard(
          t('stats.longestStreak'),
          `${r.best_streak} ${t('stats.days')}`,
          undefined, undefined,
        )}
      </div>
    </>
  );
}

// Shared chart used in Overview tab (defined outside to avoid identity churn)
function CalorieTrendChart({ stats, navigate, t }: { stats: StatsBundle; navigate: TabProps['navigate']; t: TabProps['t'] }) {
  const data = stats.caloriesByDay.map(d => ({ ...d, label: formatShortDate(d.date) }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart
        data={data}
        margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
        onClick={((o: unknown) => {
          const payload = (o as { activePayload?: { payload: { date: string } }[] })?.activePayload?.[0]?.payload;
          if (payload?.date) navigate('day', { date: payload.date });
        }) as never}
        style={{ cursor: 'pointer' }}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false}
          interval={Math.max(0, Math.floor(data.length / 12))} />
        <YAxis tick={{ fill: 'var(--text-sec)', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
          formatter={((v: unknown, n: unknown) => [`${Number(v)} kcal`, String(n)]) as never} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--text-sec)' }} />
        <Line type="monotone" dataKey="kcal" name={t('stats.foodIn')} stroke="var(--accent)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Page wrapper ─────────────────────────────────────────────────────────────

interface TabProps {
  stats: StatsBundle;
  t: ReturnType<typeof useT>['t'];
  tMeal: ReturnType<typeof useT>['tMeal'];
  navigate: ReturnType<typeof useNavigate>['navigate'];
  settings: ReturnType<typeof useSettings>['settings'];
}

export default function StatsPage() {
  const { t, tMeal } = useT();
  const { settings } = useSettings();
  const { navigate } = useNavigate();

  const [tab, setTab] = useState<StatsTab>('overview');
  const [range, setRange] = useState<StatsRange>(90);
  const [stats, setStats] = useState<StatsBundle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.analytics.stats(range).then(s => {
      setStats(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [range]);

  const tabs = useMemo(() => [
    { id: 'overview' as StatsTab,   label: t('stats.tab.overview') },
    { id: 'nutrition' as StatsTab,  label: t('stats.tab.nutrition') },
    { id: 'body' as StatsTab,       label: t('stats.tab.body') },
    { id: 'training' as StatsTab,   label: t('stats.tab.training') },
    { id: 'activity' as StatsTab,   label: t('stats.tab.activity') },
    { id: 'records' as StatsTab,    label: t('stats.tab.records') },
  ], [t]);

  const rangeBtn = (v: StatsRange) => [
    'text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-colors',
    v === range ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-sec hover:border-accent/50',
  ].join(' ');

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        eyebrow={t('eyebrow.stats')}
        title={t('page.stats')}
        subtitle={stats ? t('stats.subtitle', { start: formatDMY(stats.range.start_date), end: formatDMY(stats.range.end_date) }) : undefined}
        action={
          <div className="flex gap-1 flex-wrap">
            {RANGES.map(r => (
              <button key={String(r.v)} onClick={() => setRange(r.v)} className={rangeBtn(r.v)}>
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <Tabs<StatsTab> items={tabs} active={tab} onChange={setTab} scrollable />

      {loading && !stats && (
        <p className="text-text-sec text-center py-12">{t('stats.loading')}</p>
      )}

      {stats && (
        <div className="space-y-4">
          {tab === 'overview'  && <OverviewTab  stats={stats} t={t} tMeal={tMeal} navigate={navigate} settings={settings} />}
          {tab === 'nutrition' && <NutritionTab stats={stats} t={t} tMeal={tMeal} navigate={navigate} settings={settings} />}
          {tab === 'body'      && <BodyTab      stats={stats} t={t} tMeal={tMeal} navigate={navigate} settings={settings} />}
          {tab === 'training'  && <TrainingTab  stats={stats} t={t} tMeal={tMeal} navigate={navigate} settings={settings} />}
          {tab === 'activity'  && <ActivityTab  stats={stats} t={t} tMeal={tMeal} navigate={navigate} settings={settings} />}
          {tab === 'records'   && <RecordsTab   stats={stats} t={t} tMeal={tMeal} navigate={navigate} settings={settings} />}
        </div>
      )}
    </div>
  );
}
