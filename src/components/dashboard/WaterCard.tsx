import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useT } from '../../i18n/useT';
import { fbCard } from '../../lib/fbStyles';
import type { WidgetSize } from '../../types';

interface WaterCardProps {
  waterTotal: number;
  waterGoal: number;
  onAdd: (ml: number) => void;
  onCustom: () => void;
  size?: WidgetSize;
}

function todayStr(): string { return new Date().toISOString().slice(0, 10); }
function nDaysAgoStr(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function Spark({ points, height = 26 }: { points: number[]; height?: number }) {
  const max = Math.max(...points, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, width: '100%' }}>
      {points.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: Math.max(3, (v / max) * height),
          borderRadius: 2,
          background: v > 0 ? 'var(--fb-blue)' : 'var(--fb-border-strong, var(--fb-border))',
          opacity: i === points.length - 1 ? 1 : 0.55,
        }} />
      ))}
    </div>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 99,
      border: '1px solid var(--fb-border)', background: 'var(--fb-bg-2)',
      color: 'var(--fb-text-2)', fontSize: 10.5, fontWeight: 500,
      cursor: 'pointer', fontFamily: 'var(--font-body)',
    }}>{children}</button>
  );
}

export default function WaterCard({ waterTotal, waterGoal, onAdd, onCustom, size = 'M' }: WaterCardProps) {
  const { t } = useT();
  const pct = Math.min(100, Math.round((waterTotal / waterGoal) * 100));
  const waterL = waterTotal / 1000;
  const goalL  = waterGoal / 1000;

  // Fetch 7-day data only when needed (M or L)
  const [weekL, setWeekL] = useState<number[]>([]);
  useEffect(() => {
    if (size !== 'M' && size !== 'L') return;
    let alive = true;
    Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        api.water.getDay(nDaysAgoStr(6 - i)).catch(() => ({ total_ml: 0 }))
      )
    ).then(rows => {
      if (alive) setWeekL(rows.map(r => (r.total_ml ?? 0) / 1000));
    });
    return () => { alive = false; };
  }, [size]);
  const weekAvg = weekL.filter(v => v > 0).length > 0
    ? weekL.filter(v => v > 0).reduce((a, b) => a + b, 0) / weekL.filter(v => v > 0).length
    : 0;

  // ── XS (158×152) ──────────────────────────────────────────────────────────
  if (size === 'XS') {
    return (
      <div style={{ ...fbCard, height: '100%', padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-blue)' }}>💧 {t('dash.water')}</span>
        <div className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 34, fontWeight: 400, color: 'var(--fb-blue)', lineHeight: 1 }}>
          {waterL.toFixed(2)}L
        </div>
        <div style={{ height: 3, width: '70%', background: 'var(--fb-bg-2)', borderRadius: 99 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--fb-blue)', borderRadius: 99 }} />
        </div>
        <span style={{ fontSize: 9, color: 'var(--fb-text-3)' }}>{pct}%</span>
      </div>
    );
  }

  // ── S (318×152) ───────────────────────────────────────────────────────────
  if (size === 'S') {
    return (
      <div style={{ ...fbCard, height: '100%', padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-blue)' }}>💧 {t('dash.water')}</span>
          <span className="tnum" style={{ fontSize: 10.5, color: 'var(--fb-text-3)' }}>{pct}%</span>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 32, fontWeight: 400, color: 'var(--fb-blue)', lineHeight: 1 }}>
              {waterL.toFixed(2)}
            </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--fb-text-2)' }}>L</span>
          </div>
          <div style={{ height: 4, background: 'var(--fb-bg-2)', borderRadius: 99, marginTop: 6 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--fb-blue)', borderRadius: 99 }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {[250, 500].map(ml => <Chip key={ml} onClick={() => onAdd(ml)}>+{ml}</Chip>)}
        </div>
      </div>
    );
  }

  // ── M (484×318) ───────────────────────────────────────────────────────────
  if (size === 'M') {
    return (
      <div style={{ ...fbCard, height: '100%', padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-blue)' }}>💧 {t('dash.water')}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 54, fontWeight: 400, color: 'var(--fb-blue)', lineHeight: 1 }}>{waterL.toFixed(2)}</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--fb-text-2)' }}>L</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>
              of {goalL.toFixed(2)}L · {Math.max(0, goalL - waterL).toFixed(2)}L to goal
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 28, color: 'var(--fb-blue)' }}>{pct}%</span>
            <span style={{ fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>completato</span>
          </div>
        </div>

        <div style={{ height: 8, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--fb-blue)', borderRadius: 99, transition: 'width .6s cubic-bezier(0.2,0.8,0.2,1)' }} />
        </div>

        {weekL.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>
              <span>Last 7 days</span>
              <span className="tnum">avg {weekAvg.toFixed(2)}L</span>
            </div>
            <Spark points={weekL} height={36} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[250, 500, 750, 1000].map(ml => <Chip key={ml} onClick={() => onAdd(ml)}>+{ml}ml</Chip>)}
          <Chip onClick={onCustom}>Custom</Chip>
        </div>
      </div>
    );
  }

  // ── L (1024×318) ──────────────────────────────────────────────────────────
  return (
    <div style={{ ...fbCard, height: '100%', padding: 20, display: 'grid', gridTemplateColumns: '260px 1fr 200px 220px', gap: 20, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-blue)' }}>💧 {t('dash.water')} · oggi</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 72, fontWeight: 400, color: 'var(--fb-blue)', lineHeight: 1 }}>{waterL.toFixed(2)}</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--fb-text-2)' }}>L</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fb-text-3)', marginTop: 2 }}>of {goalL.toFixed(2)}L</div>
          <div style={{ fontSize: 11, color: 'var(--fb-blue)', fontWeight: 600 }}>{Math.max(0, goalL - waterL).toFixed(2)}L to goal</div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', letterSpacing: 0.5, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
            <span>Progress</span>
            <span>{pct}%</span>
          </div>
          <div style={{ height: 9, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--fb-blue)', borderRadius: 99 }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>Last 7 days</span>
          <span className="tnum">avg {weekAvg.toFixed(2)}L</span>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'stretch' }}>
          <div style={{ maxWidth: 360, width: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1 }}>
              <Spark points={weekL.length ? weekL : Array(7).fill(0)} height={130} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', marginTop: 4 }}>
              {['Lu','Ma','Me','Gi','Ve','Sa','Do'].map(d => <span key={d} style={{ flex: 1, textAlign: 'center' }}>{d}</span>)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Settimana</div>
        {[
          { l: 'Tot',        v: `${weekL.reduce((a,b)=>a+b,0).toFixed(2)}L` },
          { l: 'Avg/giorno', v: `${weekAvg.toFixed(2)}L` },
          { l: 'Best',       v: `${Math.max(...weekL, 0).toFixed(2)}L` },
        ].map(s => (
          <div key={s.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--fb-text-3)' }}>{s.l}</span>
            <span className="tnum" style={{ color: 'var(--fb-text)', fontWeight: 600 }}>{s.v}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Quick add</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[250, 500, 750, 1000].map(ml => (
            <button key={ml} onClick={() => onAdd(ml)} style={{
              padding: '10px 6px', borderRadius: 10, border: '1px solid var(--fb-border)',
              background: 'var(--fb-bg-2)', color: 'var(--fb-blue)', fontWeight: 700,
              fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-display)', letterSpacing: 0.3,
            }}>+{ml}ml</button>
          ))}
        </div>
        <Chip onClick={onCustom}>Custom amount…</Chip>
      </div>
    </div>
  );
}
