import { eyebrow, cardOuter } from '../lib/fbUI';
import { useT } from '../i18n/useT';

export interface WeeklyMetric {
  label: string;
  thisWeek: number;
  lastWeek: number;
  unit?: string;
  format?: (v: number) => string;
  higherIsBetter?: boolean; // undefined = neutral, true = higher=green, false = lower=green
}

interface WeeklySummaryCardProps {
  title: string;
  metrics: WeeklyMetric[];
}

export default function WeeklySummaryCard({ title, metrics }: WeeklySummaryCardProps) {
  const { t } = useT();
  return (
    <div style={{ ...cardOuter, gap: 12 }}>
      <div style={{ ...eyebrow }}>{title}</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 10,
      }}>
        {metrics.map((m, i) => {
          const delta = m.thisWeek - m.lastWeek;
          const formatted = m.format ? m.format(m.thisWeek) : `${Math.round(m.thisWeek * 10) / 10}${m.unit ?? ''}`;
          let deltaColor = 'var(--fb-text-3)';
          if (delta !== 0 && m.higherIsBetter !== undefined) {
            const isGood = m.higherIsBetter ? delta > 0 : delta < 0;
            deltaColor = isGood ? 'var(--fb-green)' : 'var(--fb-red)';
          }
          const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '';
          const absDelta = m.format ? m.format(Math.abs(delta)) : `${Math.round(Math.abs(delta) * 10) / 10}${m.unit ?? ''}`;
          return (
            <div key={i} style={{
              background: 'var(--fb-bg)',
              border: '1px solid var(--fb-border)',
              borderRadius: 12,
              padding: '10px 14px',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fb-text)', lineHeight: 1.2 }}>
                {formatted}
              </div>
              {delta !== 0 && (
                <div style={{ fontSize: 11, color: deltaColor, fontWeight: 600 }}>
                  {arrow} {absDelta} {t('common.vsLastWeek')}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--fb-text-3)', marginTop: 2 }}>{m.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
