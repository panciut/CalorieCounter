import { useState, useEffect, useRef } from 'react';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { api } from '../api';
import { useT } from '../i18n/useT';
import { useToast } from '../components/Toast';
import { useAchievementToast } from '../hooks/useAchievementToast';
import { today, addDays, formatShortDate } from '../lib/dateUtil';
import { cardOuter, eyebrow } from '../lib/fbUI';
import { fbBtnPrimary, fbBtnGhost } from '../lib/fbStyles';
import type { MoodEntry, MoodTrendPoint, MoodStats } from '../types';
import StreakBadge from '../components/StreakBadge';
import WeeklySummaryCard from '../components/WeeklySummaryCard';
import ModuleInsightsCard from '../components/ModuleInsightsCard';
import EmptyState from '../components/EmptyState';

// ── Rating picker helpers ────────────────────────────────────────────────────

const MOOD_EMOJIS = ['😞', '😕', '😐', '🙂', '😊'];

// Energy colors: gray → green (values 1..5)
const ENERGY_COLORS = ['#9ca3af', '#6ee7b7', '#34d399', '#10b981', '#059669'];

// Stress colors: green → red (values 1..5)
const STRESS_COLORS = ['#10b981', '#84cc16', '#f59e0b', '#ef4444', '#dc2626'];

function RatingRow({
  label,
  value,
  onChange,
  renderButton,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  renderButton: (n: number, selected: boolean) => React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fb-text-2)', fontFamily: 'var(--font-body)' }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            style={{
              width: 40, height: 40, borderRadius: 10,
              border: value === n ? '2px solid var(--fb-accent)' : '1px solid var(--fb-border)',
              background: value === n ? 'var(--fb-accent-soft)' : 'var(--fb-card)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'border-color .18s cubic-bezier(0.16,1,0.3,1), background .18s cubic-bezier(0.16,1,0.3,1)',
              flexShrink: 0,
            }}
          >
            {renderButton(n, value === n)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function JournalPage() {
  const { t } = useT();
  const { showToast } = useToast();
  const showAchievements = useAchievementToast();

  const todayStr = today();

  const [existingEntry, setExistingEntry] = useState<MoodEntry | null>(null);
  const [editing, setEditing]     = useState(false);
  const [moodVal, setMoodVal]     = useState<number | null>(null);
  const [energyVal, setEnergyVal] = useState<number | null>(null);
  const [stressVal, setStressVal] = useState<number | null>(null);
  const [note, setNote]           = useState('');
  const [saving, setSaving]       = useState(false);

  const isEditMode = editing || !existingEntry;

  const [trendData, setTrendData] = useState<MoodTrendPoint[]>([]);
  const [moodStats, setMoodStats] = useState<MoodStats | null>(null);
  const [dailyNote, setDailyNote] = useState('');
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load today's entry
  useEffect(() => {
    api.mood.get(todayStr)
      .then(entry => {
        if (entry) {
          setExistingEntry(entry);
          setMoodVal(entry.mood);
          setEnergyVal(entry.energy);
          setStressVal(entry.stress);
          setNote(entry.note ?? '');
        }
      })
      .catch(() => {});
  }, [todayStr]);

  // Load 30-day trend
  useEffect(() => {
    const from = addDays(todayStr, -29);
    api.mood.range(from, todayStr)
      .then(rows => setTrendData(rows))
      .catch(() => {});
  }, [todayStr]);

  // Load 30-day mood stats and daily note
  useEffect(() => {
    api.mood.getStats(addDays(todayStr, -29), todayStr)
      .then(stats => setMoodStats(stats))
      .catch(() => {});
    api.notes.get(todayStr)
      .then(n => {
        setDailyNote(n?.note ?? '');
        setNoteLoaded(true);
      })
      .catch(() => setNoteLoaded(true));
  }, [todayStr]);

  function autoResize() {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
  }

  async function handleSave() {
    if (moodVal == null && energyVal == null && stressVal == null && !note.trim()) return;
    setSaving(true);
    try {
      const entry = await api.mood.upsert({
        date: todayStr,
        ...(moodVal != null   ? { mood: moodVal }     : {}),
        ...(energyVal != null ? { energy: energyVal } : {}),
        ...(stressVal != null ? { stress: stressVal } : {}),
        note: note.trim() || undefined,
      });
      setExistingEntry(entry);
      setEditing(false);
      showToast(t('journal.saved'));
      // Refresh trend
      const from = addDays(todayStr, -29);
      const rows = await api.mood.range(from, todayStr);
      setTrendData(rows);
      api.gamification.addPoints({ module: 'journal', reason: 'journal_logged', points: 5 })
        .then(r => { if (r.new_achievements?.length) showAchievements(r.new_achievements); })
        .catch(() => {});
    } catch {
      showToast(t('common.error') ?? 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await api.mood.delete(todayStr);
      setExistingEntry(null);
      setEditing(false);
      setMoodVal(null);
      setEnergyVal(null);
      setStressVal(null);
      setNote('');
      // Refresh trend
      const from = addDays(todayStr, -29);
      const rows = await api.mood.range(from, todayStr);
      setTrendData(rows);
    } catch {
      showToast(t('common.error') ?? 'Error');
    }
  }

  async function handleNoteSave() {
    setNoteSaving(true);
    try {
      await api.notes.save({ date: todayStr, note: dailyNote });
      showToast(t('common.saved'), 'success');
    } catch {
      showToast(t('common.error') ?? 'Error');
    } finally {
      setNoteSaving(false);
    }
  }

  // Build chart data: fill all 30 days even if no entry
  const chartData = (() => {
    const map = new Map(trendData.map(p => [p.date, p]));
    const result = [];
    for (let i = 29; i >= 0; i--) {
      const d = addDays(todayStr, -i);
      const p = map.get(d);
      result.push({
        date: d,
        label: formatShortDate(d),
        mood:   p?.mood   ?? null,
        energy: p?.energy ?? null,
        stress: p?.stress ?? null,
      });
    }
    return result;
  })();

  return (
    <div style={{
      maxWidth: 680,
      margin: '0 auto',
      padding: '28px 24px',
      fontFamily: 'var(--font-body)',
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      {/* Header */}
      <div>
        <div style={eyebrow}>{t('journal.eyebrow')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26, fontWeight: 600,
            color: 'var(--fb-text)', margin: '4px 0 0',
            letterSpacing: -0.5,
          }}>
            {t('journal.title')}
          </h1>
          {moodStats && (
            <StreakBadge
              current={moodStats.logged_streak}
              best={moodStats.best_logged_streak}
              emoji="📓"
              label={t('journal.logStreak')}
            />
          )}
        </div>
      </div>

      {/* Today's entry */}
      <div style={cardOuter}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={eyebrow}>{todayStr}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {existingEntry && !isEditMode && (
              <button type="button" onClick={() => setEditing(true)}
                style={{ background: 'transparent', border: '1px solid var(--fb-border)', color: 'var(--fb-text-2)', borderRadius: 6, padding: '3px 10px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                {t('common.edit')}
              </button>
            )}
            {existingEntry && (
              <button type="button" onClick={handleDelete}
                style={{ background: 'transparent', border: '1px solid var(--fb-red, #ef4444)', color: 'var(--fb-red, #ef4444)', borderRadius: 6, padding: '3px 10px', fontSize: 11.5, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                {t('common.delete')}
              </button>
            )}
          </div>
        </div>

        {/* ── VIEW MODE ── */}
        {!isEditMode && existingEntry && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {existingEntry.mood != null && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: 'var(--fb-text-3)', textTransform: 'uppercase', marginBottom: 4 }}>{t('journal.mood')}</div>
                  <span style={{ fontSize: 28 }}>{MOOD_EMOJIS[existingEntry.mood - 1]}</span>
                </div>
              )}
              {existingEntry.energy != null && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: 'var(--fb-text-3)', textTransform: 'uppercase', marginBottom: 4 }}>{t('journal.energy')}</div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[1,2,3,4,5].map(n => (
                      <span key={n} style={{ width: 10, height: 10, borderRadius: '50%', display: 'block', background: n <= (existingEntry.energy ?? 0) ? ENERGY_COLORS[existingEntry.energy! - 1] : 'var(--fb-border)' }} />
                    ))}
                    <span style={{ fontSize: 11, color: 'var(--fb-text-3)', marginLeft: 2 }}>{existingEntry.energy}/5</span>
                  </div>
                </div>
              )}
              {existingEntry.stress != null && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: 'var(--fb-text-3)', textTransform: 'uppercase', marginBottom: 4 }}>{t('journal.stress')}</div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[1,2,3,4,5].map(n => (
                      <span key={n} style={{ width: 10, height: 10, borderRadius: '50%', display: 'block', background: n <= (existingEntry.stress ?? 0) ? STRESS_COLORS[existingEntry.stress! - 1] : 'var(--fb-border)' }} />
                    ))}
                    <span style={{ fontSize: 11, color: 'var(--fb-text-3)', marginLeft: 2 }}>{existingEntry.stress}/5</span>
                  </div>
                </div>
              )}
            </div>
            {existingEntry.note && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--fb-text-2)', fontStyle: 'italic', lineHeight: 1.6 }}>{existingEntry.note}</p>
            )}
          </div>
        )}

        {/* ── EDIT MODE ── */}
        {isEditMode && (
          <>
            <RatingRow label={t('journal.mood')} value={moodVal} onChange={setMoodVal}
              renderButton={(n) => <span style={{ fontSize: 20 }}>{MOOD_EMOJIS[n - 1]}</span>} />

            <RatingRow label={t('journal.energy')} value={energyVal} onChange={setEnergyVal}
              renderButton={(n, selected) => (
                <span style={{ display: 'block', width: 14, height: 14, borderRadius: '50%', background: selected ? ENERGY_COLORS[n - 1] : 'var(--fb-border-strong, var(--fb-border))', transition: 'background .18s' }} />
              )} />

            <RatingRow label={t('journal.stress')} value={stressVal} onChange={setStressVal}
              renderButton={(n, selected) => (
                <span style={{ display: 'block', width: 14, height: 14, borderRadius: '50%', background: selected ? STRESS_COLORS[n - 1] : 'var(--fb-border-strong, var(--fb-border))', transition: 'background .18s' }} />
              )} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--fb-text-2)' }}>{t('journal.note')}</label>
              <textarea ref={textareaRef} value={note} onChange={e => { setNote(e.target.value); autoResize(); }}
                placeholder={t('journal.notePlaceholder')} rows={3}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--fb-card)', border: '1px solid var(--fb-border)', color: 'var(--fb-text)', borderRadius: 10, padding: '8px 10px', fontSize: 13, outline: 'none', resize: 'none', overflow: 'hidden', fontFamily: 'var(--font-body)', transition: 'border-color .25s ease', lineHeight: 1.5 }}
                onFocus={e => { e.target.style.borderColor = 'var(--fb-accent)'; }}
                onBlur={e  => { e.target.style.borderColor = 'var(--fb-border)'; }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={{ ...fbBtnPrimary, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
                {t('common.save')}
              </button>
              {existingEntry && (
                <button type="button" style={fbBtnGhost} onClick={() => setEditing(false)}>
                  {t('common.cancel')}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 30-day trend */}
      <div style={cardOuter}>
        <div style={eyebrow}>{t('journal.trend30')}</div>

        {chartData.some(d => d.mood != null || d.energy != null || d.stress != null) ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--fb-border)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--fb-text-3)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                domain={[1, 5]}
                ticks={[1, 2, 3, 4, 5]}
                tick={{ fill: 'var(--fb-text-3)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--fb-card)', border: '1px solid var(--fb-border)',
                  borderRadius: 8, color: 'var(--fb-text)', fontSize: 12,
                }}
              />
              <Line
                type="monotone" dataKey="mood"
                stroke="var(--fb-accent)" strokeWidth={2}
                dot={{ r: 3, fill: 'var(--fb-accent)', strokeWidth: 0 }}
                connectNulls name={t('journal.mood')}
              />
              <Line
                type="monotone" dataKey="energy"
                stroke="#10b981" strokeWidth={2}
                dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                connectNulls name={t('journal.energy')}
              />
              <Line
                type="monotone" dataKey="stress"
                stroke="#ef4444" strokeWidth={2}
                dot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }}
                connectNulls name={t('journal.stress')}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            compact
            icon="📈"
            title={t('journal.empty')}
            description={t('journal.emptyDesc')}
          />
        )}

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { color: 'var(--fb-accent)', label: t('journal.mood') },
            { color: '#10b981',          label: t('journal.energy') },
            { color: '#ef4444',          label: t('journal.stress') },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, display: 'block' }} />
              <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Weekly Summary ──────────────────────────────────────────────── */}
      {moodStats && (
        <WeeklySummaryCard
          title={t('journal.weekTitle')}
          metrics={[
            {
              label: t('journal.avgMood'),
              thisWeek: moodStats.week_avg_mood ?? 0,
              lastWeek: moodStats.last_week_avg_mood ?? 0,
              format: (v: number) => v.toFixed(2),
              higherIsBetter: true,
            },
            {
              label: t('journal.daysLogged'),
              thisWeek: moodStats.days.filter(d => {
                const cutoff = addDays(todayStr, -6);
                return d.date >= cutoff && (d.mood != null || d.energy != null || d.stress != null);
              }).length,
              lastWeek: moodStats.days.filter(d => {
                const from = addDays(todayStr, -13);
                const to = addDays(todayStr, -7);
                return d.date >= from && d.date <= to && (d.mood != null || d.energy != null || d.stress != null);
              }).length,
              higherIsBetter: true,
            },
          ]}
        />
      )}

      {/* ── Avg stats + best/worst ──────────────────────────────────────── */}
      {moodStats && (moodStats.avg_energy != null || moodStats.avg_stress != null || moodStats.best_day || moodStats.worst_day) && (
        <div style={{ ...cardOuter, gap: 10 }}>
          <div style={eyebrow}>{t('journal.overviewTitle')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {moodStats.avg_energy != null && (
              <div style={{ background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 12, padding: '10px 14px', flex: 1, minWidth: 100 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--fb-text-3)', marginBottom: 4 }}>{t('journal.energy')}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>{moodStats.avg_energy.toFixed(2)}/5</div>
              </div>
            )}
            {moodStats.avg_stress != null && (
              <div style={{ background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 12, padding: '10px 14px', flex: 1, minWidth: 100 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--fb-text-3)', marginBottom: 4 }}>{t('journal.stress')}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{moodStats.avg_stress.toFixed(2)}/5</div>
              </div>
            )}
            {moodStats.best_day && (
              <div style={{ background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 12, padding: '10px 14px', flex: 1, minWidth: 100 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--fb-text-3)', marginBottom: 4 }}>{t('journal.bestDay')}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fb-text)' }}>{moodStats.best_day.date}</div>
                <div style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>😊 {moodStats.best_day.mood}/5</div>
              </div>
            )}
            {moodStats.worst_day && (
              <div style={{ background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', borderRadius: 12, padding: '10px 14px', flex: 1, minWidth: 100 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--fb-text-3)', marginBottom: 4 }}>{t('journal.worstDay')}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fb-text)' }}>{moodStats.worst_day.date}</div>
                <div style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>😞 {moodStats.worst_day.mood}/5</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Nota del giorno ─────────────────────────────────────────────── */}
      {noteLoaded && (
        <div style={cardOuter}>
          <div style={eyebrow}>{t('journal.dailyNote')}</div>
          <textarea
            value={dailyNote}
            onChange={e => setDailyNote(e.target.value)}
            placeholder={t('journal.dailyNotePlaceholder')}
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--fb-card)', border: '1px solid var(--fb-border)',
              color: 'var(--fb-text)', borderRadius: 10, padding: '8px 10px',
              fontSize: 13, outline: 'none', resize: 'vertical' as const,
              fontFamily: 'var(--font-body)', lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              style={{ ...fbBtnPrimary, opacity: noteSaving ? 0.7 : 1 }}
              onClick={handleNoteSave}
              disabled={noteSaving}
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {/* ── Correlazioni ─────────────────────────────────────────────────── */}
      <ModuleInsightsCard modules={['journal']} />
    </div>
  );
}
