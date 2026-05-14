import { useT } from '../../i18n/useT';
import { fbCardHero } from '../../lib/fbStyles';
import { fbBarColor } from '../../lib/fbBarColor';
import ConcentricRings from '../ConcentricRings';
import type { WidgetSize } from '../../types';

interface MacroTarget { min: number; max: number; rec: number }
interface DailyIntakeCardProps {
  calories: { actual: number } & MacroTarget;
  protein:  { actual: number } & MacroTarget;
  carbs:    { actual: number } & MacroTarget;
  fat:      { actual: number } & MacroTarget;
  size?: WidgetSize;
}

export default function DailyIntakeCard({ calories, protein, carbs, fat, size = 'L' }: DailyIntakeCardProps) {
  const { t } = useT();
  const calPct = (calories.actual / calories.rec) * 100;
  const proPct = (protein.actual / protein.rec) * 100;
  const carPct = (carbs.actual / carbs.rec) * 100;
  const fatPct = (fat.actual / fat.rec) * 100;
  const remaining = Math.max(0, calories.rec - calories.actual);
  const overMax = calories.actual > calories.max;

  const macros = [
    { label: t('dash.macroProtein'), actual: protein.actual, min: protein.min, max: protein.max, rec: protein.rec, color: 'var(--fb-red)' },
    { label: t('dash.macroCarbs'),   actual: carbs.actual,   min: carbs.min,   max: carbs.max,   rec: carbs.rec,   color: 'var(--fb-amber)' },
    { label: t('dash.macroFat'),     actual: fat.actual,     min: fat.min,     max: fat.max,     rec: fat.rec,     color: 'var(--fb-green)' },
  ];

  const rings = [
    { pct: calPct, color: 'var(--fb-orange)', label: 'kcal' },
    { pct: proPct, color: 'var(--fb-red)',    label: 'P' },
    { pct: carPct, color: 'var(--fb-amber)',  label: 'C' },
    { pct: fatPct, color: 'var(--fb-green)',  label: 'F' },
  ];

  // ── XS (158×152) ──────────────────────────────────────────────────────────
  if (size === 'XS') {
    return (
      <div style={{ ...fbCardHero, height: '100%', padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <ConcentricRings rings={rings} centerTop={`${Math.round(calPct)}%`} size={96} />
      </div>
    );
  }

  // ── S (318×152) ───────────────────────────────────────────────────────────
  if (size === 'S') {
    return (
      <div style={{ ...fbCardHero, height: '100%', padding: 12, display: 'grid', gridTemplateColumns: '92px 1fr', alignItems: 'center', gap: 10 }}>
        <ConcentricRings rings={rings} centerTop={`${Math.round(calPct)}%`} size={92} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>{t('dash.dailyIntake')}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 26, fontWeight: 400, color: 'var(--fb-text)', lineHeight: 1 }}>{calories.actual.toLocaleString('it-IT')}</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 11, color: 'var(--fb-text-2)' }}>kcal</span>
          </div>
          <div style={{ fontSize: 10, color: overMax ? 'var(--fb-red)' : 'var(--fb-green)', fontWeight: 600 }}>
            {overMax ? `+${calories.actual - calories.max} over` : `+${remaining} rem`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
            {macros.map(m => (
              <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: m.color, width: 8 }}>{m.label[0]}</span>
                <div style={{ flex: 1, height: 3, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, m.max > 0 ? (m.actual/m.max)*100 : 0)}%`, background: m.color, borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: 9, color: 'var(--fb-text-3)', minWidth: 26, textAlign: 'right' }} className="tnum">{m.actual.toFixed(0)}g</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── M (484×318) ───────────────────────────────────────────────────────────
  if (size === 'M') {
    return (
      <div style={{ ...fbCardHero, height: '100%', padding: 18, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 16, alignItems: 'center' }}>
          <ConcentricRings rings={rings} centerTop={`${Math.round(calPct)}%`} centerSub={t('dash.centerTarget')} size={150} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>{t('dash.dailyIntake')}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 54, fontWeight: 300, color: 'var(--fb-text)', lineHeight: 1 }}>{calories.actual.toLocaleString('it-IT')}</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--fb-text-2)' }}>kcal</span>
            </div>
            <div style={{ fontSize: 12, color: overMax ? 'var(--fb-red)' : 'var(--fb-green)', fontWeight: 600 }}>
              {overMax ? `+${calories.actual - calories.max} over` : `${remaining} remaining`}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--fb-text-3)' }}>{calories.min}–{calories.max} · goal {calories.rec}</div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, paddingTop: 12, borderTop: '1px solid var(--fb-divider)', minHeight: 0 }}>
          {macros.map(m => {
            const pct = Math.min(100, m.max > 0 ? (m.actual / m.max) * 100 : 0);
            const minPct = m.max > 0 ? (m.min / m.max) * 100 : 0;
            const recPct = m.max > 0 ? (m.rec / m.max) * 100 : 0;
            const color = fbBarColor(m.actual, m.min, m.max, m.rec);
            const macroPct = m.rec > 0 ? Math.round((m.actual / m.rec) * 100) : 0;
            return (
              <div key={m.label} style={{ background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--fb-text-3)', letterSpacing: 1.1, textTransform: 'uppercase' }}>
                    <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: 99, background: m.color, marginRight: 5 }} />{m.label}
                  </span>
                  <span style={{ fontSize: 9.5, color, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>{macroPct}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 24, color: 'var(--fb-text)' }}>{m.actual.toFixed(2)}</span>
                  <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--fb-text-3)' }}>g</span>
                </div>
                <div style={{ height: 6, background: 'var(--fb-bg-2)', borderRadius: 99, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${minPct}%`, width: `${100 - minPct}%`, background: 'var(--fb-border-strong, var(--fb-border))', borderRadius: 99, opacity: 0.45 }} />
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, background: color, borderRadius: 99 }} />
                  <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${recPct}%`, width: 1.5, background: 'var(--fb-text-2)', opacity: 0.6 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)' }}>
                  <span className="tnum">min {m.min}g</span>
                  <span className="tnum">rec {m.rec}g</span>
                  <span className="tnum">max {m.max}g</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── L (1024×318) ──────────────────────────────────────────────────────────
  return (
    <div style={{ ...fbCardHero, height: '100%', padding: 20, display: 'grid', gridTemplateColumns: '260px 1fr 260px', gap: 18, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>{t('dash.dailyIntake')} · oggi</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 64, fontWeight: 300, color: 'var(--fb-text)', lineHeight: 1 }}>{calories.actual.toLocaleString('it-IT')}</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 17, color: 'var(--fb-text-2)' }}>kcal</span>
          </div>
          <div style={{ fontSize: 12.5, color: overMax ? 'var(--fb-red)' : 'var(--fb-green)', fontWeight: 600, marginTop: 4 }}>
            {overMax ? `+${calories.actual - calories.max} over max` : `${remaining} remaining`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>{calories.min} – {calories.max} · goal {calories.rec}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 38, fontWeight: 400, color: 'var(--fb-accent)', lineHeight: 1, letterSpacing: -1 }} className="tnum">
              {Math.round(calPct)}%
            </span>
            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>
              {t('dash.centerTarget')}
            </span>
          </div>
          <ConcentricRings rings={rings} size={130} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {macros.map(m => {
          const pct = Math.min(100, m.max > 0 ? (m.actual / m.max) * 100 : 0);
          const minPct = m.max > 0 ? (m.min / m.max) * 100 : 0;
          const recPct = m.max > 0 ? (m.rec / m.max) * 100 : 0;
          const color = fbBarColor(m.actual, m.min, m.max, m.rec);
          const macroPct = m.rec > 0 ? Math.round((m.actual / m.rec) * 100) : 0;
          const hint = macroPct < 80 ? '↑ aumenta' : macroPct > 110 ? '↓ riduci' : '✓ on target';
          return (
            <div key={m.label} style={{ background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fb-text-3)', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 99, background: m.color, marginRight: 5 }} />{m.label}
                </span>
                <span style={{ fontSize: 10, color, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>{macroPct}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 30, color: 'var(--fb-text)' }}>{m.actual.toFixed(2)}</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--fb-text-3)' }}>g</span>
              </div>
              <div style={{ height: 7, background: 'var(--fb-bg-2)', borderRadius: 99, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${minPct}%`, width: `${100 - minPct}%`, background: 'var(--fb-border-strong, var(--fb-border))', borderRadius: 99, opacity: 0.45 }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, background: color, borderRadius: 99 }} />
                <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${recPct}%`, width: 1.5, background: 'var(--fb-text-2)', opacity: 0.6 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)' }}>
                <span className="tnum">{m.min}g</span>
                <span className="tnum" style={{ color: 'var(--fb-text-2)', fontWeight: 600 }}>{m.rec}g</span>
                <span className="tnum">{m.max}g</span>
              </div>
              <div style={{ marginTop: 'auto', fontSize: 9.5, color: 'var(--fb-text-3)', letterSpacing: 0.3 }}>{hint}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 5 }}>
            <span>Macro split</span>
            <span className="tnum">{Math.round(calPct)}% target</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {macros.map(m => {
              const macroPct = m.rec > 0 ? Math.round((m.actual / m.rec) * 100) : 0;
              return (
                <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: m.color }} />
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--fb-text-2)' }}>{m.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--fb-text)' }} className="tnum">{m.actual.toFixed(0)}g</span>
                  <span style={{ fontSize: 10, color: 'var(--fb-text-3)', minWidth: 30, textAlign: 'right' }} className="tnum">{macroPct}%</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 'auto', padding: '8px 10px', borderRadius: 8, background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', fontSize: 11, color: 'var(--fb-text-2)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--fb-text-3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>Target</div>
          <div style={{ marginTop: 2 }} className="tnum"><strong style={{ color: 'var(--fb-text)' }}>{calories.rec}</strong> kcal · range {calories.min}–{calories.max}</div>
        </div>
      </div>
    </div>
  );
}
