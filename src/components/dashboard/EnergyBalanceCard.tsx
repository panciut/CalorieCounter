import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useT } from '../../i18n/useT';
import { fbCard } from '../../lib/fbStyles';
import type { WidgetSize } from '../../types';

interface EnergyBalanceCardProps {
  caloriesIn: number;
  netKcal: number;
  energyOut: number;
  stepCount: number;
  restingKcal: string;
  activeKcal: string;
  extraKcal: string;
  steps: string;
  restingFromYest: boolean;
  onRestingChange: (v: string) => void;
  onActiveChange: (v: string) => void;
  onExtraChange: (v: string) => void;
  onStepsChange: (v: string) => void;
  onSave: () => void;
  size?: WidgetSize;
}

function nDaysAgoStr(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function Spark({ points, height = 26, color }: { points: number[]; height?: number; color: string }) {
  const max = Math.max(...points.map(p => Math.abs(p)), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, width: '100%' }}>
      {points.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: Math.max(3, (Math.abs(v) / max) * height),
          borderRadius: 2,
          background: v !== 0 ? color : 'var(--fb-border-strong, var(--fb-border))',
          opacity: i === points.length - 1 ? 1 : 0.55,
        }} />
      ))}
    </div>
  );
}

export default function EnergyBalanceCard({
  caloriesIn, netKcal, energyOut, stepCount,
  restingKcal, activeKcal, extraKcal, steps,
  restingFromYest,
  onRestingChange, onActiveChange, onExtraChange, onStepsChange, onSave,
  size = 'M',
}: EnergyBalanceCardProps) {
  const { t } = useT();
  const total = caloriesIn + energyOut;
  const inPct = total > 0 ? (caloriesIn / total) * 100 : 50;
  const deltaColor = netKcal > 0 ? 'var(--fb-orange)' : 'var(--fb-green)';

  // Week deficit data for M/L
  const [weekDeficits, setWeekDeficits] = useState<number[]>([]);
  useEffect(() => {
    if (size !== 'M' && size !== 'L') return;
    let alive = true;
    Promise.all(
      Array.from({ length: 7 }, async (_, i) => {
        const date = nDaysAgoStr(6 - i);
        try {
          const energy = await api.dailyEnergy.get(date).catch(() => null);
          const log = await api.log.getDay(date).catch(() => ({ items: [] }));
          const kcalIn = (log?.items ?? []).reduce((sum: number, it: { calories?: number }) => sum + (it.calories ?? 0), 0);
          const kcalOut = ((energy?.resting_kcal ?? 0) + (energy?.active_kcal ?? 0) + (energy?.extra_kcal ?? 0)) as number;
          return kcalOut > 0 ? kcalIn - kcalOut : 0;
        } catch { return 0; }
      })
    ).then(rows => { if (alive) setWeekDeficits(rows); });
    return () => { alive = false; };
  }, [size]);
  const weekAvg = weekDeficits.filter(v => v !== 0).length > 0
    ? Math.round(weekDeficits.filter(v => v !== 0).reduce((a, b) => a + b, 0) / weekDeficits.filter(v => v !== 0).length)
    : 0;

  // ── XS (158×152) ──────────────────────────────────────────────────────────
  if (size === 'XS') {
    return (
      <div style={{ ...fbCard, height: '100%', padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-orange)' }}>⚡ {t('dash.balance')}</span>
        <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 44, fontWeight: 400, color: deltaColor, lineHeight: 1 }}>
          {netKcal > 0 ? '+' : ''}{netKcal}
        </span>
        <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>net kcal</span>
        <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--fb-text-2)', marginTop: 2 }}>
          <span className="tnum"><span style={{ color: 'var(--fb-green)' }}>↑</span> {caloriesIn.toLocaleString('it-IT')}</span>
          <span className="tnum"><span style={{ color: 'var(--fb-orange)' }}>↓</span> {energyOut.toLocaleString('it-IT')}</span>
        </div>
      </div>
    );
  }

  // ── S (318×152) ───────────────────────────────────────────────────────────
  if (size === 'S') {
    return (
      <div style={{ ...fbCard, height: '100%', padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-orange)' }}>⚡ {t('dash.balance')}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 42, fontWeight: 400, color: deltaColor, lineHeight: 1 }}>
            {netKcal > 0 ? '+' : ''}{netKcal}
          </span>
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--fb-text-2)' }}>{t('dash.netKcal')}</span>
        </div>
        <div style={{ width: '85%' }}>
          <div style={{ position: 'relative', height: 6, background: 'var(--fb-bg-2)', borderRadius: 99 }}>
            <div style={{ position: 'absolute', inset: 0, width: `${inPct}%`, background: 'var(--fb-green)', borderRadius: 99 }} />
            <div style={{ position: 'absolute', inset: 0, left: `${inPct}%`, right: 0, background: 'var(--fb-orange)', borderRadius: 99 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 4, fontWeight: 600 }}>
            <span style={{ color: 'var(--fb-green)' }} className="tnum">↑ {caloriesIn.toLocaleString('it-IT')}</span>
            <span style={{ color: 'var(--fb-orange)' }} className="tnum">↓ {energyOut.toLocaleString('it-IT')}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── M (484×318) ───────────────────────────────────────────────────────────
  if (size === 'M') {
    return (
      <div style={{ ...fbCard, height: '100%', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'flex-start', overflow: 'hidden' }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-orange)' }}>⚡ {t('dash.balance')}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 48, fontWeight: 400, color: deltaColor, lineHeight: 1 }}>
              {netKcal > 0 ? '+' : ''}{netKcal}
            </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--fb-text-2)' }}>{t('dash.netKcal')}</span>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            <span style={{ color: 'var(--fb-green)' }}>↑ in {caloriesIn.toLocaleString('it-IT')}</span>
            <span style={{ color: 'var(--fb-orange)' }}>↓ out {energyOut.toLocaleString('it-IT')}</span>
          </div>
          <div style={{ position: 'relative', height: 8, background: 'var(--fb-bg-2)', borderRadius: 99, marginTop: 4 }}>
            <div style={{ position: 'absolute', inset: 0, width: `${inPct}%`, background: 'var(--fb-green)', borderRadius: 99 }} />
            <div style={{ position: 'absolute', inset: 0, left: `${inPct}%`, right: 0, background: 'var(--fb-orange)', borderRadius: 99 }} />
          </div>
        </div>

        {weekDeficits.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>
              <span>Last 7 days</span>
              <span className="tnum">avg {weekAvg > 0 ? '+' : ''}{weekAvg} kcal</span>
            </div>
            <Spark points={weekDeficits.map(v => Math.abs(v))} height={24} color="var(--fb-green)" />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, paddingTop: 10, borderTop: '1px solid var(--fb-divider)', marginTop: 'auto' }}>
          <div style={{ background: 'var(--fb-bg-2)', border: '1px dashed var(--fb-border)', borderRadius: 7, padding: '6px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }} title="Calcolato automaticamente — non modificabile">
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>Resting</span>
            <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--fb-text-2)' }}>{restingKcal || '0'}</span>
            {restingFromYest && <span style={{ fontSize: 7.5, color: 'var(--fb-accent)' }}>yesterday</span>}
          </div>
          {[
            { l: 'Active', value: activeKcal, onChange: onActiveChange },
            { l: 'Extra',  value: extraKcal,  onChange: onExtraChange },
            { l: 'Steps',  value: steps,      onChange: (v: string) => onStepsChange(v.replace(/[^0-9]/g, '')) },
          ].map(inp => (
            <div key={inp.l} style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 7, padding: '4px 4px 5px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>{inp.l}</span>
              <input type="text" inputMode="decimal" value={inp.value} onChange={e => inp.onChange(e.target.value)} onBlur={onSave}
                style={{ width: '100%', background: 'transparent', border: 'none', padding: 0, fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--fb-text)', textAlign: 'center', outline: 'none' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── L (1024×318) ──────────────────────────────────────────────────────────
  return (
    <div style={{ ...fbCard, height: '100%', padding: 20, display: 'grid', gridTemplateColumns: '260px 1fr 220px 240px', gap: 20, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--fb-orange)' }}>⚡ Energy balance</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <span className="tnum" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 72, fontWeight: 400, color: deltaColor, lineHeight: 1 }}>
              {netKcal > 0 ? '+' : ''}{netKcal}
            </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--fb-text-2)' }}>net kcal</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fb-text-3)', marginTop: 4 }}>{netKcal < 0 ? 'Deficit' : netKcal > 0 ? 'Surplus' : 'Maintain'}</div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            <span style={{ color: 'var(--fb-green)' }}>↑ in {caloriesIn.toLocaleString('it-IT')}</span>
            <span style={{ color: 'var(--fb-orange)' }}>↓ out {energyOut.toLocaleString('it-IT')}</span>
          </div>
          <div style={{ position: 'relative', height: 8, background: 'var(--fb-bg-2)', borderRadius: 99, marginTop: 5 }}>
            <div style={{ position: 'absolute', inset: 0, width: `${inPct}%`, background: 'var(--fb-green)', borderRadius: 99 }} />
            <div style={{ position: 'absolute', inset: 0, left: `${inPct}%`, right: 0, background: 'var(--fb-orange)', borderRadius: 99 }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>Last 7 days</span>
          <span className="tnum">avg {weekAvg > 0 ? '+' : ''}{weekAvg} kcal</span>
        </div>
        <div style={{ flex: 1 }}>
          <Spark points={(weekDeficits.length ? weekDeficits : Array(7).fill(0)).map(v => Math.abs(v))} height={130} color="var(--fb-green)" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)' }}>
          {['Lu','Ma','Me','Gi','Ve','Sa','Do'].map(d => <span key={d}>{d}</span>)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Settimana</div>
        {[
          { l: 'Deficit tot', v: `${weekDeficits.reduce((a,b)=>a+b,0).toFixed(0)}`, c: 'var(--fb-green)' },
          { l: 'Avg/giorno',  v: `${weekAvg}`, c: 'var(--fb-text)' },
          { l: 'Proiezione',  v: `${(weekAvg * 7 / 7700).toFixed(2)} kg/sett`, c: 'var(--fb-text)' },
        ].map(s => (
          <div key={s.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--fb-text-3)' }}>{s.l}</span>
            <span className="tnum" style={{ color: s.c, fontWeight: 600 }}>{s.v}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>Resting</label>
          <div title="Calcolato automaticamente — non modificabile" style={{ width: '100%', background: 'var(--fb-bg-2)', border: '1px dashed var(--fb-border)', borderRadius: 6, padding: '6px 4px', fontSize: 12, color: 'var(--fb-text-2)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
            {restingKcal || '0'}
          </div>
          {restingFromYest && <span style={{ fontSize: 8.5, color: 'var(--fb-accent)' }}>yesterday</span>}
        </div>
        {[
          { l: 'Active',  value: activeKcal,  onChange: onActiveChange },
          { l: 'Extra',   value: extraKcal,   onChange: onExtraChange },
          { l: 'Steps',   value: steps,       onChange: (v: string) => onStepsChange(v.replace(/[^0-9]/g, '')) },
        ].map((inp, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--fb-text-3)' }}>{inp.l}</label>
            <input type="text" inputMode="decimal" value={inp.value} onChange={e => inp.onChange(e.target.value)} onBlur={onSave}
              style={{ width: '100%', background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 6, padding: '6px 4px', fontSize: 12, color: 'var(--fb-text)', textAlign: 'center', fontFamily: 'var(--font-mono)', outline: 'none' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
