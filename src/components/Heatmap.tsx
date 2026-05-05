import type { StatsHeatmapDay } from '../types';
import { useMemo } from 'react';

interface HeatmapProps {
  /** Up to 365 daily cells, oldest → newest. */
  days: StatsHeatmapDay[];
  /** Color cells by which signal? Default 'food'. */
  metric?: 'food' | 'completeness';
  /** Optional click handler — passes the ISO date of the clicked cell. */
  onCellClick?: (date: string) => void;
  /** Show month labels above the grid. Default true. */
  showMonths?: boolean;
}

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * GitHub-style yearly contribution grid.
 * - Columns are weeks (oldest left → newest right).
 * - Rows are days of the week (Sun on top, Sat on bottom).
 * - Color intensity scales with `kcal` (food metric) or completeness signals.
 */
export default function Heatmap({ days, metric = 'food', onCellClick, showMonths = true }: HeatmapProps) {
  const { weeks, monthLabels } = useMemo(() => {
    if (!days.length) return { weeks: [] as (StatsHeatmapDay | null)[][], monthLabels: [] as { col: number; label: string }[] };

    // Pad the grid so the first column starts on Sunday.
    const first = days[0];
    const firstDow = new Date(first.date + 'T00:00:00').getDay(); // 0..6 Sun..Sat
    const padded: (StatsHeatmapDay | null)[] = [
      ...Array.from({ length: firstDow }, () => null as StatsHeatmapDay | null),
      ...days,
    ];
    // Pad end so total cells is a multiple of 7.
    while (padded.length % 7 !== 0) padded.push(null);

    const cols = padded.length / 7;
    const w: (StatsHeatmapDay | null)[][] = [];
    for (let c = 0; c < cols; c++) {
      const col: (StatsHeatmapDay | null)[] = [];
      for (let r = 0; r < 7; r++) col.push(padded[c * 7 + r]);
      w.push(col);
    }

    const labels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    for (let c = 0; c < cols; c++) {
      const cell = w[c].find(Boolean);
      if (!cell) continue;
      const m = new Date(cell.date + 'T00:00:00').getMonth();
      if (m !== lastMonth) {
        labels.push({ col: c, label: MONTH_NAMES_SHORT[m] });
        lastMonth = m;
      }
    }
    return { weeks: w, monthLabels: labels };
  }, [days]);

  // Compute scale for kcal-based intensity using the upper quartile of non-zero days.
  const maxKcal = useMemo(() => {
    const vals = days.map(d => d.kcal).filter(v => v > 0).sort((a, b) => a - b);
    if (!vals.length) return 1;
    const idx = Math.floor(vals.length * 0.95);
    return Math.max(vals[idx] ?? vals[vals.length - 1], 800);
  }, [days]);

  function cellColor(d: StatsHeatmapDay | null): string {
    if (!d) return 'transparent';
    if (metric === 'completeness') {
      const score = (d.has_food + d.has_energy + d.has_weight + d.has_exercise);
      if (score === 0) return 'var(--card-hover)';
      if (score === 1) return 'color-mix(in oklab, var(--accent) 25%, var(--card-hover))';
      if (score === 2) return 'color-mix(in oklab, var(--accent) 50%, var(--card-hover))';
      if (score === 3) return 'color-mix(in oklab, var(--accent) 75%, var(--card-hover))';
      return 'var(--accent)';
    }
    // food/kcal metric
    if (d.kcal <= 0) return 'var(--card-hover)';
    const t = Math.min(1, d.kcal / maxKcal);
    const pct = Math.max(15, Math.round(t * 100));
    return `color-mix(in oklab, var(--accent) ${pct}%, var(--card-hover))`;
  }

  function tooltip(d: StatsHeatmapDay | null): string {
    if (!d) return '';
    const dt = new Date(d.date + 'T00:00:00');
    const fmt = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const bits: string[] = [fmt];
    if (d.kcal > 0) bits.push(`${d.kcal} kcal`);
    const sigs: string[] = [];
    if (d.has_food)     sigs.push('🍽');
    if (d.has_energy)   sigs.push('⚡');
    if (d.has_weight)   sigs.push('⚖');
    if (d.has_exercise) sigs.push('🏋');
    if (sigs.length) bits.push(sigs.join(' '));
    return bits.join('  ·  ');
  }

  if (!weeks.length) return null;

  const cellSize = 11;
  const gap = 2;
  const cols = weeks.length;
  const gridWidth = cols * (cellSize + gap);
  const dowLabelWidth = 22;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: dowLabelWidth + gridWidth }}>
        {showMonths && (
          <div className="flex" style={{ paddingLeft: dowLabelWidth, marginBottom: 4, position: 'relative', height: 12 }}>
            {monthLabels.map((m, i) => (
              <span
                key={i}
                className="text-[10px] text-text-sec"
                style={{ position: 'absolute', left: m.col * (cellSize + gap) }}
              >
                {m.label}
              </span>
            ))}
          </div>
        )}
        <div className="flex">
          {/* DOW labels */}
          <div className="flex flex-col" style={{ width: dowLabelWidth, gap }}>
            {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((l, i) => (
              <div key={i} className="text-[9px] text-text-sec/70" style={{ height: cellSize, lineHeight: `${cellSize}px` }}>
                {l}
              </div>
            ))}
          </div>
          {/* Grid */}
          <div className="flex" style={{ gap }}>
            {weeks.map((col, ci) => (
              <div key={ci} className="flex flex-col" style={{ gap }}>
                {col.map((d, ri) => (
                  <div
                    key={ri}
                    title={tooltip(d)}
                    onClick={() => d && onCellClick?.(d.date)}
                    style={{
                      width: cellSize, height: cellSize,
                      background: cellColor(d),
                      borderRadius: 2,
                      cursor: d && onCellClick ? 'pointer' : 'default',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1 mt-2 text-[10px] text-text-sec justify-end pr-1">
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
            <div key={i} style={{
              width: cellSize, height: cellSize, borderRadius: 2,
              background: t === 0 ? 'var(--card-hover)' : `color-mix(in oklab, var(--accent) ${Math.round(t * 100)}%, var(--card-hover))`,
            }}/>
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
