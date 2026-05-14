import { useT } from '../../i18n/useT';
import { fbCard } from '../../lib/fbStyles';

interface WeightWidgetProps {
  weightKg: number;
  weightTrend: number[];
}

function AreaChart({ points, color, height }: { points: number[]; color: string; height: number }) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const w = 100;
  const stepX = w / (points.length - 1);
  const linePath = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${100 - ((v - min) / range) * 100}`).join(' ');
  const areaPath = `${linePath} L ${w} 100 L 0 100 Z`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id="weight-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#weight-grad)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function WeightWidget({ weightKg, weightTrend }: WeightWidgetProps) {
  const { t } = useT();
  const hasData = weightKg > 0;
  const hasTrend = weightTrend.length >= 2;
  const delta = hasTrend ? weightTrend[weightTrend.length - 1] - weightTrend[0] : 0;
  const deltaPositive = delta > 0;
  const deltaColor = delta === 0 ? 'var(--fb-text-2)' : delta > 0 ? 'var(--fb-orange)' : 'var(--fb-green)';

  return (
    <div style={{ ...fbCard, height: '100%', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>⚖️ {t('dash.weightTitle')}</span>
        {hasTrend && (
          <span style={{ fontSize: 9.5, fontWeight: 700, color: deltaColor, padding: '2px 7px', borderRadius: 99, background: `color-mix(in srgb, ${deltaColor} 12%, transparent)`, letterSpacing: 0.3, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            {deltaPositive ? '↑' : '↓'} {Math.abs(delta).toFixed(2)} kg
          </span>
        )}
      </div>

      {hasData ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 42, fontWeight: 400, color: 'var(--fb-text)', letterSpacing: -1, lineHeight: 1 }}>
              {weightKg.toFixed(2)}
            </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--fb-text-2)' }}>kg</span>
          </div>
          {hasTrend && (
            <>
              <div style={{ flex: 1, minHeight: 30 }}>
                <AreaChart points={weightTrend} color="var(--fb-accent)" height={48} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)' }}>
                <span className="tnum">{weightTrend[0].toFixed(2)} kg</span>
                <span style={{ textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>{weightTrend.length}gg</span>
                <span className="tnum">{weightTrend[weightTrend.length - 1].toFixed(2)} kg</span>
              </div>
            </>
          )}
        </>
      ) : (
        <span style={{ fontSize: 11.5, color: 'var(--fb-text-3)', fontStyle: 'italic' }}>{t('dash.noWeight')}</span>
      )}
    </div>
  );
}
