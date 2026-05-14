import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { useT } from '../i18n/useT';
import { useAchievementToast } from '../hooks/useAchievementToast';
import { today, addDays, formatShortDate } from '../lib/dateUtil';
import { cardOuter, eyebrow, serifItalic, pillGhost } from '../lib/fbUI';
import { fbBtnPrimary } from '../lib/fbStyles';
import BarChartCard from '../components/BarChartCard';
import StreakBadge from '../components/StreakBadge';
import WeeklySummaryCard from '../components/WeeklySummaryCard';
import ModuleInsightsCard from '../components/ModuleInsightsCard';
import type { SleepEntry, SleepStats } from '../types';

const FACTORS = ['Caffeina', 'Stress', 'Alcol', 'Schermi', 'Esercizio'] as const;

function formatDuration(min: number | null): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function SleepPage() {
  const { showToast } = useToast();
  const { t } = useT();
  const showAchievements = useAchievementToast();

  const [entry, setEntry]         = useState<SleepEntry | null>(null);
  const [editing, setEditing]     = useState(false);
  const [bedtime, setBedtime]     = useState('');
  const [wakeTime, setWakeTime]   = useState('');
  const [quality, setQuality]     = useState<number>(0);
  const [factors, setFactors]     = useState<string[]>([]);
  const [note, setNote]           = useState('');
  const [saving, setSaving]       = useState(false);
  const [sleepStats, setSleepStats] = useState<SleepStats | null>(null);
  const [sleepStreak, setSleepStreak] = useState<{ current: number; best: number }>({ current: 0, best: 0 });

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

  const isEditMode = editing || !entry;

  const loadStats = useCallback(async () => {
    try {
      const from = addDays(today(), -29);
      const to = today();
      const stats = await api.sleep.getStats(from, to);
      setSleepStats(stats);
    } catch {
      // ignore
    }
  }, []);

  const loadStreaks = useCallback(async () => {
    try {
      const streaks = await api.sectionStreaks.getAll();
      const sec = streaks.find(s => s.section === 'sleep');
      if (sec) setSleepStreak({ current: sec.current_streak, best: sec.longest_streak });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadEntry();
    loadStats();
    loadStreaks();
  }, [loadEntry, loadStats, loadStreaks]);

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
      setEditing(false);
      await loadEntry();
      await loadStats();
      api.gamification.addPoints({ module: 'sleep', reason: 'sleep_logged', points: 10, context: { date: todayStr } })
        .then(r => { if (r.new_achievements?.length) showAchievements(r.new_achievements); })
        .catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!entry) return;
    try {
      await api.sleep.delete(todayStr);
      setEntry(null);
      setEditing(false);
      setBedtime(''); setWakeTime(''); setQuality(0); setFactors([]); setNote('');
      await loadStats();
      showToast(t('sleep.deleted'), 'success');
    } catch {
      // leave state as-is on error
    }
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...serifItalic, fontSize: 26, fontWeight: 400, color: 'var(--fb-text)', letterSpacing: -0.5, lineHeight: 1.1 }}>
            {t('sleep.subtitle')}
          </span>
          <StreakBadge current={sleepStreak.current} best={sleepStreak.best} emoji="😴" />
        </div>
      </header>

      {/* ── Log today ──────────────────────────────────────────────────────── */}
      <section style={cardOuter}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fb-text)' }}>{t('sleep.logToday')}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {entry && !isEditMode && (
              <button onClick={() => setEditing(true)} style={{ ...pillGhost, fontSize: 11.5, padding: '4px 12px' }}>
                {t('common.edit')}
              </button>
            )}
            {entry && (
              <button onClick={handleDelete} style={{ ...pillGhost, fontSize: 11.5, padding: '4px 12px', color: 'var(--fb-red, #ef4444)', borderColor: 'var(--fb-red, #ef4444)' }}>
                {t('common.delete')}
              </button>
            )}
          </div>
        </div>

        {/* ── VIEW MODE ── */}
        {!isEditMode && entry && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Times + duration */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {entry.bedtime && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: 'var(--fb-text-3)', textTransform: 'uppercase', marginBottom: 2 }}>{t('sleep.bedtime')}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fb-text)' }}>{entry.bedtime}</div>
                </div>
              )}
              {entry.wake_time && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: 'var(--fb-text-3)', textTransform: 'uppercase', marginBottom: 2 }}>{t('sleep.wakeTime')}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fb-text)' }}>{entry.wake_time}</div>
                </div>
              )}
              {entry.duration_min != null && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: 'var(--fb-text-3)', textTransform: 'uppercase', marginBottom: 2 }}>{t('sleep.duration')}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fb-accent)' }}>{formatDuration(entry.duration_min)}</div>
                </div>
              )}
            </div>
            {/* Quality */}
            {(entry.quality ?? 0) > 0 && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {[1,2,3,4,5].map(n => (
                  <span key={n} style={{ fontSize: 18, opacity: n <= (entry.quality ?? 0) ? 1 : 0.2 }}>★</span>
                ))}
                <span style={{ fontSize: 11, color: 'var(--fb-text-3)', marginLeft: 4 }}>{entry.quality}/5</span>
              </div>
            )}
            {/* Factors */}
            {entry.factors && JSON.parse(entry.factors).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(JSON.parse(entry.factors) as string[]).map(f => (
                  <span key={f} style={{ padding: '3px 10px', borderRadius: 99, background: 'color-mix(in srgb, var(--fb-accent) 12%, transparent)', color: 'var(--fb-accent)', fontSize: 11.5, fontWeight: 600 }}>{f}</span>
                ))}
              </div>
            )}
            {/* Note */}
            {entry.note && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--fb-text-2)', fontStyle: 'italic', lineHeight: 1.5 }}>{entry.note}</p>
            )}
          </div>
        )}

        {/* ── EDIT MODE ── */}
        {isEditMode && (
          <>
            {/* Times */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4 }}>{t('sleep.bedtime')}</label>
                <input type="time" value={bedtime} onChange={e => setBedtime(e.target.value)} style={inputCls} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4 }}>{t('sleep.wakeTime')}</label>
                <input type="time" value={wakeTime} onChange={e => setWakeTime(e.target.value)} style={inputCls} />
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
              if (diff > 0) return (
                <div style={{ fontSize: 12, color: 'var(--fb-text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>⏱</span>
                  <span>{t('sleep.duration')}: <strong style={{ color: 'var(--fb-accent)' }}>{formatDuration(diff)}</strong></span>
                </div>
              );
              return null;
            })()}

            {/* Quality stars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4 }}>{t('sleep.quality')}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => setQuality(quality === n ? 0 : n)}
                    style={{ fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', opacity: n <= quality ? 1 : 0.25, transition: 'opacity .2s, transform .2s', transform: n <= quality ? 'scale(1.15)' : 'scale(1)', padding: 2 }}
                    title={`${n} / 5`}>★</button>
                ))}
                {quality > 0 && <span style={{ fontSize: 11, color: 'var(--fb-text-3)', alignSelf: 'center', marginLeft: 4 }}>{quality}/5</span>}
              </div>
            </div>

            {/* Factors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4 }}>{t('sleep.factors')}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {FACTORS.map(f => {
                  const active = factors.includes(f);
                  return (
                    <button key={f} type="button" onClick={() => toggleFactor(f)} style={{ padding: '5px 13px', borderRadius: 99, border: `1px solid ${active ? 'var(--fb-accent)' : 'var(--fb-border)'}`, background: active ? 'color-mix(in srgb, var(--fb-accent) 14%, transparent)' : 'transparent', color: active ? 'var(--fb-accent)' : 'var(--fb-text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .2s cubic-bezier(0.16,1,0.3,1)' }}>{f}</button>
                  );
                })}
              </div>
            </div>

            {/* Note */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--fb-text-2)', fontWeight: 600, letterSpacing: 0.4 }}>{t('sleep.note')}</label>
              <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder={t('sleep.notePlaceholder')}
                style={{ ...inputCls, resize: 'vertical' as CSSProperties['resize'], minHeight: 56, fontFamily: 'var(--font-body)', lineHeight: 1.5 }} />
            </div>

            {/* Save / Cancel */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {entry && (
                <button type="button" onClick={() => setEditing(false)} style={{ ...pillGhost, fontSize: 12, padding: '6px 16px' }}>
                  {t('common.cancel')}
                </button>
              )}
              <button type="button" onClick={handleSave} disabled={saving} style={{ ...fbBtnPrimary, opacity: saving ? 0.6 : 1 }}>
                {t('common.save')}
              </button>
            </div>
          </>
        )}
      </section>

      {/* ── Trend 30 days ──────────────────────────────────────────────────── */}
      <section style={cardOuter}>
        <div>
          <span style={eyebrow}>{t('sleep.trend30')}</span>
          <div style={{ ...serifItalic, fontSize: 15, color: 'var(--fb-text-2)', marginTop: 2 }}>
            {t('sleep.trendSubtitle')}
          </div>
        </div>

        {sleepStats && sleepStats.days.some(d => d.duration_min != null) ? (
          <BarChartCard
            data={sleepStats.days.map(d => ({
              label: formatShortDate(d.date),
              value: d.duration_min != null ? Math.round((d.duration_min / 60) * 100) / 100 : 0,
            }))}
            height={200}
            unit="h"
            goalValue={8}
            color="var(--fb-accent)"
          />
        ) : (
          <div style={{
            textAlign: 'center', padding: '32px 16px',
            color: 'var(--fb-text-3)', fontSize: 13, fontStyle: 'italic',
            border: '1px dashed var(--fb-border)', borderRadius: 12,
          }}>
            {t('sleep.noData')}
          </div>
        )}

        {/* Summary stats */}
        {sleepStats && sleepStats.avg_duration_min != null && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
            <div style={{ background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--fb-text-3)', marginBottom: 4 }}>{t('sleep.avgDuration')}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fb-text)', letterSpacing: -0.5 }}>{formatDuration(sleepStats.avg_duration_min)}</div>
            </div>
            {sleepStats.avg_quality != null && (
              <div style={{ background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 12, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--fb-text-3)', marginBottom: 4 }}>{t('sleep.avgQuality')}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fb-text)', letterSpacing: -0.5 }}>{sleepStats.avg_quality.toFixed(2)}/5</div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Weekly Summary ───────────────────────────────────────────────────── */}
      {sleepStats && (
        <WeeklySummaryCard
          title={t('sleep.weekTitle')}
          metrics={[
            {
              label: t('sleep.avgDuration'),
              thisWeek: sleepStats.week_avg_min != null ? Math.round((sleepStats.week_avg_min / 60) * 100) / 100 : 0,
              lastWeek: sleepStats.last_week_avg_min != null ? Math.round((sleepStats.last_week_avg_min / 60) * 100) / 100 : 0,
              unit: 'h',
              higherIsBetter: true,
            },
            {
              label: t('sleep.nightsLogged'),
              thisWeek: sleepStats.days.filter(d => {
                const cutoff = addDays(today(), -6);
                return d.date >= cutoff && d.duration_min != null;
              }).length,
              lastWeek: sleepStats.days.filter(d => {
                const from = addDays(today(), -13);
                const to = addDays(today(), -7);
                return d.date >= from && d.date <= to && d.duration_min != null;
              }).length,
              higherIsBetter: true,
            },
            {
              label: t('sleep.debt7d'),
              thisWeek: Math.round(sleepStats.debt_min_7d / 60 * 100) / 100,
              lastWeek: 0,
              unit: 'h',
              higherIsBetter: false,
            },
          ]}
        />
      )}

      {/* ── Fattori più frequenti ─────────────────────────────────────────── */}
      {sleepStats && sleepStats.factor_counts.length > 0 && (
        <section style={cardOuter}>
          <span style={eyebrow}>{t('sleep.factorsTitle')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {sleepStats.factor_counts.slice(0, 6).map(fc => {
              const max = sleepStats.factor_counts[0].count;
              const pct = max > 0 ? (fc.count / max) * 100 : 0;
              return (
                <div key={fc.factor} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--fb-text-2)', width: 80, flexShrink: 0 }}>{fc.factor}</span>
                  <div style={{ flex: 1, background: 'var(--fb-border)', borderRadius: 99, height: 6 }}>
                    <div style={{ width: `${pct}%`, background: 'var(--fb-accent)', borderRadius: 99, height: 6 }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--fb-text-3)', width: 24, textAlign: 'right' }}>{fc.count}</span>
                </div>
              );
            })}
          </div>
          {sleepStats.best_night && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fb-text-2)' }}>
              🌙 {t('sleep.bestNight')}: <strong>{sleepStats.best_night.date}</strong> · {formatDuration(sleepStats.best_night.duration_min)}
            </div>
          )}
        </section>
      )}

      {/* ── Correlazioni ─────────────────────────────────────────────────── */}
      <ModuleInsightsCard modules={['sleep']} />

    </div>
  );
}
