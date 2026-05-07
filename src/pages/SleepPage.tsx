import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useT } from '../i18n/useT';
import { today, formatShortDate } from '../lib/dateUtil';
import { cardOuter, eyebrow, serifItalic, pillGhost } from '../lib/fbUI';
import { fbBtnPrimary } from '../lib/fbStyles';
import BarChartCard from '../components/BarChartCard';
import type { SleepEntry, SleepTrendPoint } from '../types';

const FACTORS = ['Caffeina', 'Stress', 'Alcol', 'Schermi', 'Esercizio'] as const;

function formatDuration(min: number | null): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getLast14Days(): { from: string; to: string } {
  const to = today();
  const d = new Date(to);
  d.setDate(d.getDate() - 13);
  const from = d.toISOString().slice(0, 10);
  return { from, to };
}

export default function SleepPage() {
  const { showToast } = useToast();
  const { t } = useT();

  const [entry, setEntry]         = useState<SleepEntry | null>(null);
  const [bedtime, setBedtime]     = useState('');
  const [wakeTime, setWakeTime]   = useState('');
  const [quality, setQuality]     = useState<number>(0);
  const [factors, setFactors]     = useState<string[]>([]);
  const [note, setNote]           = useState('');
  const [saving, setSaving]       = useState(false);
  const [trendData, setTrendData] = useState<SleepTrendPoint[]>([]);

  const todayStr = today();

  const loadEntry = useCallback(async () => {
    try {
      const row = await api.sleep.get(todayStr) as SleepEntry | null;
      setEntry(row);
      if (row) {
        setBedtime(row.bedtime ?? '');
        setWakeTime(row.wake_time ?? '');
        setQuality(row.quality ?? 0);
        setFactors(row.factors ? JSON.parse(row.factors) : []);
        setNote(row.note ?? '');
      }
    } catch {
      // leave state as-is on error
    }
  }, [todayStr]);

  const loadTrend = useCallback(async () => {
    try {
      const { from, to } = getLast14Days();
      const rows = await api.sleep.range(from, to) as SleepTrendPoint[];
      setTrendData(rows);
    } catch {
      // leave state as-is on error
    }
  }, []);

  useEffect(() => {
    loadEntry();
    loadTrend();
  }, [loadEntry, loadTrend]);

  function toggleFactor(f: string) {
    setFactors(prev =>
      prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.sleep.upsert({
        date: todayStr,
        bedtime: bedtime || null,
        wake_time: wakeTime || null,
        quality: quality || null,
        factors,
        note: note || null,
      } as Partial<SleepEntry> & { date: string });
      showToast(t('common.saved'), 'success');
      await loadEntry();
      await loadTrend();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry) return;
    try {
      await api.sleep.delete(todayStr);
      setEntry(null);
      setBedtime(''); setWakeTime(''); setQuality(0); setFactors([]); setNote('');
      await loadTrend();
      showToast(t('sleep.deleted'), 'success');
    } catch {
      // leave state as-is on error
    }
  }

  // Chart data: last 14 days, x = short date, y = duration in hours (decimal)
  const { from } = getLast14Days();
  const allDates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    allDates.push(d.toISOString().slice(0, 10));
  }
  const trendMap = new Map(trendData.map(r => [r.date, r]));
  const chartData = allDates.map(date => ({
    label: formatShortDate(date),
    value: trendMap.get(date)?.duration_min != null
      ? Math.round((trendMap.get(date)!.duration_min! / 60) * 10) / 10
      : 0,
  }));

  const inputCls: CSSProperties = {
    width: '100%',
    background: 'var(--fb-card)',
    border: '1px solid var(--fb-border)',
    color: 'var(--fb-text)',
    borderRadius: 10,
    padding: '7px 10px',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={eyebrow}>{t('sleep.eyebrow')}</span>
        <span style={{ ...serifItalic, fontSize: 26, fontWeight: 400, color: 'var(--fb-text)', letterSpacing: -0.5, lineHeight: 1.1 }}>
          {t('sleep.subtitle')}
        </span>
      </header>

      {/* ── Log today ──────────────────────────────────────────────────────── */}
      <section style={cardOuter}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fb-text)' }}>{t('sleep.logToday')}</span>
          {entry && (
            <button onClick={handleDelete} style={{ ...pillGhost, fontSize: 11.5, padding: '4px 12px', color: 'var(--fb-red, #ef4444)', borderColor: 'var(--fb-red, #ef4444)' }}>
              {t('common.delete')}
            </button>
          )}
        </div>

        {/* Times */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4 }}>{t('sleep.bedtime')}</label>
            <input
              type="time"
              value={bedtime}
              onChange={e => setBedtime(e.target.value)}
              style={inputCls}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4 }}>{t('sleep.wakeTime')}</label>
            <input
              type="time"
              value={wakeTime}
              onChange={e => setWakeTime(e.target.value)}
              style={inputCls}
            />
          </div>
        </div>

        {/* Duration preview */}
        {bedtime && wakeTime && (() => {
          const [bh, bm] = bedtime.split(':').map(Number);
          const [wh, wm] = wakeTime.split(':').map(Number);
          let bedMins  = bh * 60 + bm;
          let wakeMins = wh * 60 + wm;
          if (bh >= 12 && wh <= 12) wakeMins += 24 * 60;
          const diff = wakeMins - bedMins;
          if (diff > 0) {
            return (
              <div style={{ fontSize: 12, color: 'var(--fb-text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>⏱</span>
                <span>{t('sleep.duration')}: <strong style={{ color: 'var(--fb-accent)' }}>{formatDuration(diff)}</strong></span>
              </div>
            );
          }
          return null;
        })()}

        {/* Quality stars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4 }}>{t('sleep.quality')}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setQuality(quality === n ? 0 : n)}
                style={{
                  fontSize: 22,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  opacity: n <= quality ? 1 : 0.25,
                  transition: 'opacity .2s cubic-bezier(0.16,1,0.3,1), transform .2s cubic-bezier(0.16,1,0.3,1)',
                  transform: n <= quality ? 'scale(1.15)' : 'scale(1)',
                  padding: 2,
                }}
                title={`${n} / 5`}
              >★</button>
            ))}
            {quality > 0 && (
              <span style={{ fontSize: 11, color: 'var(--fb-text-3)', alignSelf: 'center', marginLeft: 4 }}>
                {quality}/5
              </span>
            )}
          </div>
        </div>

        {/* Factors */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4 }}>{t('sleep.factors')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {FACTORS.map(f => {
              const active = factors.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFactor(f)}
                  style={{
                    padding: '5px 13px',
                    borderRadius: 99,
                    border: `1px solid ${active ? 'var(--fb-accent)' : 'var(--fb-border)'}`,
                    background: active ? 'color-mix(in srgb, var(--fb-accent) 14%, transparent)' : 'transparent',
                    color: active ? 'var(--fb-accent)' : 'var(--fb-text-2)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all .2s cubic-bezier(0.16,1,0.3,1)',
                  }}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        {/* Note */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4 }}>{t('sleep.note')}</label>
          <textarea
            rows={2}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('sleep.notePlaceholder')}
            style={{ ...inputCls, resize: 'vertical' as CSSProperties['resize'], minHeight: 56, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}
          />
        </div>

        {/* Save */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{ ...fbBtnPrimary, opacity: saving ? 0.6 : 1 }}
          >
            {t('common.save')}
          </button>
        </div>
      </section>

      {/* ── Trend 14 days ──────────────────────────────────────────────────── */}
      <section style={cardOuter}>
        <div>
          <span style={eyebrow}>{t('sleep.trend14')}</span>
          <div style={{ ...serifItalic, fontSize: 15, color: 'var(--fb-text-2)', marginTop: 2 }}>
            {t('sleep.trendSubtitle')}
          </div>
        </div>

        {chartData.some(d => d.value > 0) ? (
          <BarChartCard
            data={chartData}
            height={200}
            unit="h"
            color="var(--fb-accent)"
          />
        ) : (
          <div style={{
            textAlign: 'center', padding: '32px 16px',
            color: 'var(--fb-text-3)',
            fontSize: 13,
            fontStyle: 'italic',
            border: '1px dashed var(--fb-border)',
            borderRadius: 12,
          }}>
            {t('sleep.noData')}
          </div>
        )}

        {/* Summary stats */}
        {trendData.length > 0 && (() => {
          const withData = trendData.filter(r => r.duration_min != null);
          if (withData.length === 0) return null;
          const avgMin = Math.round(withData.reduce((s, r) => s + r.duration_min!, 0) / withData.length);
          const avgQuality = withData.filter(r => r.quality != null).length > 0
            ? (withData.filter(r => r.quality != null).reduce((s, r) => s + r.quality!, 0) / withData.filter(r => r.quality != null).length).toFixed(1)
            : null;
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
              <div style={{ background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 12, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--fb-text-3)', marginBottom: 4 }}>{t('sleep.avgDuration')}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fb-text)', letterSpacing: -0.5 }}>{formatDuration(avgMin)}</div>
              </div>
              {avgQuality && (
                <div style={{ background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 12, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--fb-text-3)', marginBottom: 4 }}>{t('sleep.avgQuality')}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fb-text)', letterSpacing: -0.5 }}>{avgQuality}/5</div>
                </div>
              )}
            </div>
          );
        })()}
      </section>

    </div>
  );
}
