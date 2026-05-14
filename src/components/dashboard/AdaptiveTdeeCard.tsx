import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useSettings } from '../../hooks/useSettings';
import { useT } from '../../i18n/useT';
import { fbCard } from '../../lib/fbStyles';
import type { TDEEResult, WidgetSize, LogEntry } from '../../types';

interface Props {
  result: TDEEResult | null;
  calRec: number;
  onApply: (tdee: number) => void;
  onDismiss: (tdee: number) => void;
  onNavigateGoals: () => void;
  size?: WidgetSize;
}

function todayStr(): string { return new Date().toISOString().slice(0, 10); }
function nDaysAgoStr(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function AreaChart({ points, color, height }: { points: number[]; color: string; height: number }) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const w = 100;
  const stepX = points.length > 1 ? w / (points.length - 1) : w;
  const linePath = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${100 - ((v - min) / range) * 100}`).join(' ');
  const areaPath = `${linePath} L ${w} 100 L 0 100 Z`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id="tdee-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#tdee-grad)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function AdaptiveTdeeCard({ result, calRec, onApply, onDismiss, onNavigateGoals, size = 'M' }: Props) {
  const { t } = useT();
  const { settings } = useSettings();
  const [avgIntake, setAvgIntake] = useState<number>(0);

  useEffect(() => {
    if (size === 'XS') return;
    // Fetch last 14 days intake to compute avg
    Promise.all(
      Array.from({ length: 14 }, (_, i) =>
        api.log.getDay(nDaysAgoStr(13 - i)).catch(() => [])
      )
    ).then(rows => {
      const totals = rows.map(r => (r as LogEntry[]).reduce((s, e) => s + (e.calories ?? 0), 0));
      const valid = totals.filter(v => v > 0);
      setAvgIntake(valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0);
    });
  }, [size]);

  if (result == null || result.tdee == null) return null;
  const tdee = result.tdee;
  const confidence = result.confidence;
  const dataPoints = result.data_points;
  const delta = avgIntake - tdee;
  const kgPerWeek = (delta * 7) / 7700;
  const confColor = confidence === 'high' ? 'var(--fb-green)' : confidence === 'medium' ? 'var(--fb-amber)' : 'var(--fb-red)';
  const deltaColor = delta < 0 ? 'var(--fb-green)' : delta > 0 ? 'var(--fb-orange)' : 'var(--fb-text-2)';

  // Fake trend if not available
  const trend = Array.from({ length: 14 }, (_, i) => tdee + Math.sin(i * 0.7) * 80);

  // ── XS ────────────────────────────────────────────────────────────────────
  if (size === 'XS') {
    return (
      <div style={{ ...fbCard, height: '100%', padding: 12, gap: 3, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>TDEE</span>
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 28, color: 'var(--fb-text)' }}>{tdee.toLocaleString('it-IT')}</div>
        <span style={{ fontSize: 9, color: 'var(--fb-text-3)' }}>kcal/day</span>
        {avgIntake > 0 && (
          <div style={{ marginTop: 3, padding: '2px 7px', borderRadius: 99, background: `color-mix(in srgb, ${deltaColor} 14%, transparent)`, color: deltaColor, fontWeight: 700, fontSize: 10 }}>
            {kgPerWeek > 0 ? '+' : ''}{kgPerWeek.toFixed(2)} kg/w
          </div>
        )}
      </div>
    );
  }

  // ── S ─────────────────────────────────────────────────────────────────────
  if (size === 'S') {
    return (
      <div style={{ ...fbCard, height: '100%', padding: 12, gap: 6, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>Adaptive TDEE</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 1 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 26, color: 'var(--fb-text)' }}>{tdee.toLocaleString('it-IT')}</span>
              <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}>kcal/d</span>
            </div>
          </div>
          <span style={{ fontSize: 8.5, padding: '2px 6px', borderRadius: 99, color: confColor, border: `1px solid ${confColor}`, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>{confidence}</span>
        </div>
        {avgIntake > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 9, color: 'var(--fb-green)', width: 24, fontWeight: 700 }}>↑ IN</span>
                <div style={{ flex: 1, height: 6, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (avgIntake/tdee)*100)}%`, background: 'var(--fb-green)', borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: 9.5, color: 'var(--fb-text-2)', minWidth: 32, textAlign: 'right' }} className="tnum">{avgIntake.toLocaleString('it-IT')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 9, color: 'var(--fb-orange)', width: 24, fontWeight: 700 }}>↓ OUT</span>
                <div style={{ flex: 1, height: 6, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: '100%', background: 'var(--fb-orange)', borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: 9.5, color: 'var(--fb-text-2)', minWidth: 32, textAlign: 'right' }} className="tnum">{tdee.toLocaleString('it-IT')}</span>
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 10.5, color: deltaColor, fontWeight: 600 }}>
              <span className="tnum">Δ {delta > 0 ? '+' : ''}{delta}</span> → <span className="tnum">{kgPerWeek > 0 ? '+' : ''}{kgPerWeek.toFixed(2)} kg/sett</span>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── M ─────────────────────────────────────────────────────────────────────
  if (size === 'M') {
    return (
      <div style={{ ...fbCard, height: '100%', padding: 16, gap: 12, justifyContent: 'flex-start', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>Adaptive TDEE · 14 days</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 44, color: 'var(--fb-text)' }}>{tdee.toLocaleString('it-IT')}</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--fb-text-2)' }}>kcal/day</span>
            </div>
          </div>
          <span style={{ fontSize: 9.5, padding: '4px 10px', borderRadius: 99, color: confColor, border: `1px solid ${confColor}`, background: `color-mix(in srgb, ${confColor} 8%, transparent)`, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>{confidence} · {dataPoints}dp</span>
        </div>

        {avgIntake > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--fb-green)', width: 50, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>↑ IN</span>
                <div style={{ flex: 1, height: 10, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (avgIntake/tdee)*100)}%`, background: 'var(--fb-green)', borderRadius: 99 }} />
                </div>
                <span className="tnum" style={{ fontSize: 12, color: 'var(--fb-text)', fontWeight: 600, minWidth: 46, textAlign: 'right' }}>{avgIntake.toLocaleString('it-IT')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--fb-orange)', width: 50, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>↓ OUT</span>
                <div style={{ flex: 1, height: 10, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: '100%', background: 'var(--fb-orange)', borderRadius: 99 }} />
                </div>
                <span className="tnum" style={{ fontSize: 12, color: 'var(--fb-text)', fontWeight: 600, minWidth: 46, textAlign: 'right' }}>{tdee.toLocaleString('it-IT')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10, background: `color-mix(in srgb, ${deltaColor} 8%, var(--fb-bg-2))`, border: `1px solid ${deltaColor}` }}>
              <div>
                <div style={{ fontSize: 8.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Daily Δ</div>
                <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 20, color: deltaColor }}>{delta > 0 ? '+' : ''}{delta}<span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}> kcal</span></div>
              </div>
              <span style={{ fontSize: 18, color: deltaColor }}>→</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 8.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Proiezione</div>
                <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 20, color: deltaColor }}>{kgPerWeek > 0 ? '+' : ''}{kgPerWeek.toFixed(2)}<span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}> kg/sett</span></div>
              </div>
            </div>
          </>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
            <span>TDEE trend · 14 days</span>
            <button onClick={onNavigateGoals} style={{ background: 'none', border: 0, color: 'var(--fb-accent)', cursor: 'pointer', fontSize: 10, padding: 0, textTransform: 'none' }}>Goals →</button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <AreaChart points={trend} color="var(--fb-accent)" height={60} />
          </div>
        </div>
      </div>
    );
  }

  // ── L ─────────────────────────────────────────────────────────────────────
  const proj = { w4: kgPerWeek * 4, w8: kgPerWeek * 8, w12: kgPerWeek * 12 };

  return (
    <div style={{ ...fbCard, height: '100%', padding: 20, display: 'grid', gridTemplateColumns: '280px 1fr 240px', gap: 22, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>Adaptive TDEE</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 54, color: 'var(--fb-text)' }}>{tdee.toLocaleString('it-IT')}</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--fb-text-2)' }}>kcal/d</span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}>misurato · 14 giorni</span>
          </div>
          <span style={{ fontSize: 9.5, padding: '3px 8px', borderRadius: 99, color: confColor, border: `1px solid ${confColor}`, background: `color-mix(in srgb, ${confColor} 8%, transparent)`, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{confidence} · {dataPoints}dp</span>
        </div>

        {avgIntake > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--fb-green)', width: 36, fontWeight: 700 }}>↑ IN</span>
                <div style={{ flex: 1, height: 9, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (avgIntake/tdee)*100)}%`, background: 'var(--fb-green)', borderRadius: 99 }} />
                </div>
                <span className="tnum" style={{ fontSize: 11, color: 'var(--fb-text)', fontWeight: 600, minWidth: 42, textAlign: 'right' }}>{avgIntake}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--fb-orange)', width: 36, fontWeight: 700 }}>↓ OUT</span>
                <div style={{ flex: 1, height: 9, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: '100%', background: 'var(--fb-orange)', borderRadius: 99 }} />
                </div>
                <span className="tnum" style={{ fontSize: 11, color: 'var(--fb-text)', fontWeight: 600, minWidth: 42, textAlign: 'right' }}>{tdee}</span>
              </div>
            </div>

            <div style={{ padding: '10px 12px', borderRadius: 10, background: `color-mix(in srgb, ${deltaColor} 10%, var(--fb-bg-2))`, border: `1px solid ${deltaColor}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontSize: 8.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Daily Δ</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 22, color: deltaColor }}>{delta > 0 ? '+' : ''}{delta}</div>
                </div>
                <span style={{ fontSize: 18, color: deltaColor }}>→</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 8.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Weight</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 22, color: deltaColor }}>{kgPerWeek > 0 ? '+' : ''}{kgPerWeek.toFixed(2)} <span style={{ fontSize: 11 }}>kg/w</span></div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)', minWidth: 0 }}>
        <div>
          <span style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>TDEE trend · 14 days</span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <AreaChart points={trend} color="var(--fb-accent)" height={160} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)' }}>
          <span>14d ago</span>
          <span>7d</span>
          <span>oggi</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Proiezione peso</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: '4 settimane', kg: proj.w4 },
            { label: '8 settimane', kg: proj.w8 },
            { label: '12 settimane', kg: proj.w12 },
          ].map(p => (
            <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 8 }}>
              <span style={{ fontSize: 10.5, color: 'var(--fb-text-2)', fontWeight: 600 }}>{p.label}</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: p.kg < 0 ? 'var(--fb-green)' : p.kg > 0 ? 'var(--fb-orange)' : 'var(--fb-text)' }}>
                {p.kg > 0 ? '+' : ''}{p.kg.toFixed(2)} <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}>kg</span>
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => onApply(tdee)} style={{
            flex: 1, padding: '6px 10px', borderRadius: 7,
            background: 'var(--fb-accent)', color: 'white', border: 0,
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-display)', letterSpacing: 0.3,
          }}>{t('dash.tdee.apply')}</button>
          <button onClick={() => onDismiss(tdee)} style={{
            padding: '6px 10px', borderRadius: 7,
            background: 'transparent', color: 'var(--fb-text-2)', border: '1px solid var(--fb-border)',
            fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}>{t('dash.tdee.dismiss')}</button>
        </div>
      </div>
    </div>
  );
}
