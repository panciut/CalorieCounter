import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { linearRegression } from '../lib/macroCalc';
import { MS_PER_DAY } from '../lib/dateUtil';

interface DataPoint {
  label: string;
  value: number;
  color?: string;
  /** ISO yyyy-mm-dd. When supplied on every point the x-axis becomes a true time scale. */
  date?: string;
  /** Optional moving average value for this point. Renders as an overlay line. */
  ma?: number;
}

interface LineChartCardProps {
  data: DataPoint[];
  goalValue?: number;
  height?: number;
  unit?: string;
  showTrend?: boolean;
  showMovingAverage?: boolean;
  color?: string;
  valueLabel?: string;
  maLabel?: string;
  /** When set, snap y-axis to ticks at this step (e.g. 1 → integer kg). */
  tickStep?: number;
}

function formatTick(ms: number, spanDays: number): string {
  const d = new Date(ms);
  if (spanDays <= 14)  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (spanDays <= 180) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

export default function LineChartCard({
  data,
  goalValue,
  height = 220,
  unit = '',
  showTrend = false,
  showMovingAverage = true,
  color = 'var(--accent)',
  valueLabel,
  maLabel,
  tickStep,
}: LineChartCardProps) {
  const useTimeScale = data.length > 0 && data.every(d => d.date);

  const xs = useTimeScale
    ? data.map(d => new Date(d.date!).getTime())
    : data.map((_, i) => i);
  const ys = data.map(d => d.value);
  const { slope, intercept } = linearRegression(xs, ys);

  const hasPointColors = data.some(d => d.color);
  const hasMA = showMovingAverage && data.some(d => d.ma != null);

  const chartData = data.map((d, i) => ({
    label: d.label,
    value: d.value,
    color: d.color,
    ma:    d.ma,
    ts:    useTimeScale ? new Date(d.date!).getTime() : undefined,
    trend: showTrend ? +(slope * xs[i] + intercept).toFixed(2) : undefined,
  }));

  const seriesLabels: Record<string, string> = {
    value: valueLabel ?? '',
    ma:    maLabel    ?? '',
  };

  const minTs = useTimeScale ? Math.min(...xs) : 0;
  const maxTs = useTimeScale ? Math.max(...xs) : 0;
  const spanDays = useTimeScale ? Math.max(1, (maxTs - minTs) / MS_PER_DAY) : 0;

  // Snap y-axis to fixed steps (e.g. integer kg) when requested. Includes the
  // goal value in the range so it stays on-axis.
  let yDomain: [number | 'auto', number | 'auto'] = ['auto', 'auto'];
  let yTicks: number[] | undefined;
  if (tickStep && tickStep > 0 && data.length > 0) {
    const pool = [...ys];
    if (goalValue != null && goalValue > 0) pool.push(goalValue);
    const lo = Math.floor(Math.min(...pool) / tickStep) * tickStep;
    const hi = Math.ceil (Math.max(...pool) / tickStep) * tickStep;
    yDomain = [lo, hi];
    yTicks = [];
    for (let v = lo; v <= hi + 1e-9; v += tickStep) yTicks.push(+v.toFixed(6));
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        {useTimeScale ? (
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={[minTs, maxTs]}
            tick={{ fill: 'var(--text-sec)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => formatTick(Number(v), spanDays)}
          />
        ) : (
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--text-sec)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
        )}
        <YAxis
          tick={{ fill: 'var(--text-sec)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `${v}${unit}`}
          domain={yDomain}
          ticks={yTicks}
          allowDecimals={!tickStep}
        />
        <Tooltip
          contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }}
          formatter={((v: unknown, name: unknown) => {
            const key = String(name);
            if (key === 'trend') return [null, null];
            const num = Number(v);
            if (!isFinite(num)) return [null, null];
            return [`${+num.toFixed(2)}${unit}`, seriesLabels[key] ?? ''];
          }) as never}
          labelFormatter={useTimeScale
            ? ((v: unknown) => new Date(Number(v)).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))
            : undefined}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={hasPointColors
            ? ((props: { cx?: number; cy?: number; payload?: { color?: string }; index?: number }) => {
                const { cx, cy, payload, index } = props;
                if (cx == null || cy == null) return <g key={`dot-${index}`} />;
                return <circle key={`dot-${index}`} cx={cx} cy={cy} r={3.5} fill={payload?.color ?? 'var(--accent2)'} />;
              }) as never
            : { fill: 'var(--accent2)', r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
        {showTrend && (
          <Line
            type="monotone"
            dataKey="trend"
            stroke="var(--text-sec)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            activeDot={false}
          />
        )}
        {hasMA && (
          <Line
            type="monotone"
            dataKey="ma"
            stroke="var(--red)"
            strokeWidth={2.25}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        )}
        {goalValue !== undefined && goalValue > 0 && (
          <ReferenceLine
            y={goalValue}
            stroke="var(--accent2)"
            strokeDasharray="5 4"
            strokeWidth={1.5}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
