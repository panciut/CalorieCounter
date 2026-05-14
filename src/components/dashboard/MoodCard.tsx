import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useT } from '../../i18n/useT';
import { useNavigate } from '../../hooks/useNavigate';
import { cardOuter, eyebrow } from '../../lib/fbUI';
import type { MoodEntry, WidgetSize } from '../../types';

function todayStr(): string { return new Date().toISOString().slice(0, 10); }
function nDaysAgoStr(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function Spark({ points, color, height = 26 }: { points: number[]; color: string; height?: number }) {
  const max = Math.max(...points, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, width: '100%' }}>
      {points.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: v > 0 ? Math.max(3, (v / max) * height) : 3,
          borderRadius: 2,
          background: v > 0 ? color : 'var(--fb-border-strong, var(--fb-border))',
          opacity: i === points.length - 1 ? 1 : 0.55,
        }} />
      ))}
    </div>
  );
}

export default function MoodCard({ size = 'M' }: { size?: WidgetSize }) {
  const { t } = useT();
  const { navigate } = useNavigate();
  const [entry, setEntry] = useState<MoodEntry | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [weekData, setWeekData] = useState<{ mood: number[]; energy: number[]; stress: number[] }>({
    mood: [], energy: [], stress: [],
  });

  useEffect(() => {
    api.mood.get(todayStr())
      .then(row => { setEntry(row as MoodEntry | null); setLoaded(true); })
      .catch(() => setLoaded(true));
    if (size === 'M' || size === 'L' || size === 'S') {
      Promise.all(
        Array.from({ length: 7 }, (_, i) =>
          api.mood.get(nDaysAgoStr(6 - i)).catch(() => null)
        )
      ).then(rows => {
        const mood = rows.map(r => (r as MoodEntry | null)?.mood ?? 0);
        const energy = rows.map(r => (r as MoodEntry | null)?.energy ?? 0);
        const stress = rows.map(r => (r as MoodEntry | null)?.stress ?? 0);
        setWeekData({ mood, energy, stress });
      });
    }
  }, [size]);

  function avg(arr: number[]): number {
    const v = arr.filter(x => x > 0);
    return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }

  const metrics = [
    { label: '😊', name: 'Mood',    val: entry?.mood ?? 0,    color: 'var(--fb-accent)', week: weekData.mood },
    { label: '⚡', name: 'Energy',  val: entry?.energy ?? 0,  color: '#10b981',          week: weekData.energy },
    { label: '😰', name: 'Stress',  val: entry?.stress ?? 0,  color: '#ef4444',          week: weekData.stress },
  ];

  // ── XS ────────────────────────────────────────────────────────────────────
  if (size === 'XS') {
    return (
      <div style={{ ...cardOuter, height: '100%', padding: 12, gap: 4, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 36 }}>😊</span>
        <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 22, color: loaded ? 'var(--fb-text)' : 'var(--fb-text-3)' }}>
          {loaded ? (entry?.mood ?? '—') : '…'}/5
        </span>
        <span style={{ fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Mood</span>
      </div>
    );
  }

  // ── S ─────────────────────────────────────────────────────────────────────
  if (size === 'S') {
    return (
      <div style={{ ...cardOuter, height: '100%', padding: 14, gap: 7, justifyContent: 'space-between' }}>
        <span style={eyebrow}>{t('journal.moodEyebrow')}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {metrics.map(m => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>{m.label}</span>
              <span style={{ fontSize: 10.5, color: 'var(--fb-text-2)', minWidth: 44 }}>{m.name}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Spark points={m.week} color={m.color} height={14} />
              </div>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: m.color }}>{m.val || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── M ─────────────────────────────────────────────────────────────────────
  if (size === 'M') {
    return (
      <div style={{ ...cardOuter, height: '100%', padding: 16, gap: 10, justifyContent: 'flex-start', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={eyebrow}>{t('journal.moodEyebrow')} · oggi</span>
          <span style={{ fontSize: 10, color: 'var(--fb-text-3)' }}>vs settimana</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {metrics.map(m => {
            const a = avg(m.week);
            const trend = m.val > 0 && a > 0 ? ((m.val - a) / a) * 100 : 0;
            const trendGood = m.name === 'Stress' ? trend < 0 : trend > 0;
            return (
              <div key={m.name} style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 16 }}>{m.label}</span>
                  {trend !== 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: trendGood ? 'var(--fb-green)' : 'var(--fb-red)' }}>
                      {trend > 0 ? '+' : ''}{trend.toFixed(0)}%
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 24, color: m.color }}>
                  {m.val || '—'}<span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>/5</span>
                </span>
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--fb-text-3)', letterSpacing: 0.5, textTransform: 'uppercase' }}>{m.name}</span>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 6, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
            <span>Last 7 days</span>
            <span>1–5 scale</span>
          </div>
          {metrics.map(m => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, width: 16 }}>{m.label}</span>
              <div style={{ flex: 1 }}>
                <Spark points={m.week} color={m.color} height={16} />
              </div>
            </div>
          ))}
        </div>

        {entry?.notes && (
          <div style={{ padding: '6px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--fb-accent) 6%, var(--fb-bg-2))', border: '1px solid var(--fb-border)', fontSize: 10.5, color: 'var(--fb-text-2)', fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
            “{entry.notes}”
          </div>
        )}
      </div>
    );
  }

  // ── L ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ ...cardOuter, height: '100%', padding: 20, display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: 22, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
        <span style={eyebrow}>{t('journal.moodEyebrow')} · oggi</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {metrics.map(m => {
            const a = avg(m.week);
            const trend = m.val > 0 && a > 0 ? ((m.val - a) / a) * 100 : 0;
            const trendGood = m.name === 'Stress' ? trend < 0 : trend > 0;
            return (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24, width: 28, textAlign: 'center' }}>{m.label}</span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--fb-text-3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>{m.name}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 30, color: m.color }}>{m.val || '—'}</span>
                    <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>/5</span>
                  </div>
                </div>
                {trend !== 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: trendGood ? 'var(--fb-green)' : 'var(--fb-red)', padding: '2px 7px', borderRadius: 99, background: trendGood ? 'color-mix(in srgb, var(--fb-green) 12%, transparent)' : 'color-mix(in srgb, var(--fb-red) 12%, transparent)' }}>
                    {trend > 0 ? '+' : ''}{trend.toFixed(0)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
          <span>Trend · 7 days</span>
          <span>1–5 scale</span>
        </div>
        {metrics.map(m => (
          <div key={m.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12 }}>{m.label}</span>
              <span style={{ fontSize: 10, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>{m.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fb-text-3)' }} className="tnum">avg {avg(m.week).toFixed(2)}</span>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <Spark points={m.week} color={m.color} height={42} />
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: 'var(--fb-text-3)', paddingTop: 2 }}>
          {['Lu','Ma','Me','Gi','Ve','Sa','Do'].map(d => <span key={d} style={{ flex: 1, textAlign: 'center' }}>{d}</span>)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Note giornaliera</div>
        <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', fontSize: 11.5, color: 'var(--fb-text-2)', fontStyle: 'italic', overflow: 'hidden' }}>
          {entry?.notes ? `"${entry.notes}"` : 'Nessuna nota oggi'}
        </div>
        <button type="button" onClick={() => navigate('journal')}
          style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px solid var(--fb-border)', color: 'var(--fb-text-2)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          {t('journal.update')}
        </button>
      </div>
    </div>
  );
}
