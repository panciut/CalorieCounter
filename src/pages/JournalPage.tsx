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
import type { MoodEntry, MoodTrendPoint } from '../types';

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
  const [moodVal, setMoodVal]     = useState<number | null>(null);
  const [energyVal, setEnergyVal] = useState<number | null>(null);
  const [stressVal, setStressVal] = useState<number | null>(null);
  const [note, setNote]           = useState('');
  const [saving, setSaving]       = useState(false);

  const [trendData, setTrendData] = useState<MoodTrendPoint[]>([]);

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

  // Load 14-day trend
  useEffect(() => {
    const from = addDays(todayStr, -13);
    api.mood.range(from, todayStr)
      .then(rows => setTrendData(rows))
      .catch(() => {});
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
      showToast(t('journal.saved'));
      // Refresh trend
      const from = addDays(todayStr, -13);
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
      setMoodVal(null);
      setEnergyVal(null);
      setStressVal(null);
      setNote('');
      // Refresh trend
      const from = addDays(todayStr, -13);
      const rows = await api.mood.range(from, todayStr);
      setTrendData(rows);
    } catch {
      showToast(t('common.error') ?? 'Error');
    }
  }

  // Build chart data: fill all 14 days even if no entry
  const chartData = (() => {
    const map = new Map(trendData.map(p => [p.date, p]));
    const result = [];
    for (let i = 13; i >= 0; i--) {
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
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26, fontWeight: 600,
          color: 'var(--fb-text)', margin: '4px 0 0',
          letterSpacing: -0.5,
        }}>
          {t('journal.title')}
        </h1>
      </div>

      {/* Today's form */}
      <div style={cardOuter}>
        <div style={eyebrow}>{todayStr}</div>

        {/* Mood picker */}
        <RatingRow
          label={t('journal.mood')}
          value={moodVal}
          onChange={setMoodVal}
          renderButton={(n) => (
            <span style={{ fontSize: 20 }}>{MOOD_EMOJIS[n - 1]}</span>
          )}
        />

        {/* Energy picker */}
        <RatingRow
          label={t('journal.energy')}
          value={energyVal}
          onChange={setEnergyVal}
          renderButton={(n, selected) => (
            <span style={{
              display: 'block',
              width: 14, height: 14, borderRadius: '50%',
              background: selected ? ENERGY_COLORS[n - 1] : 'var(--fb-border-strong, var(--fb-border))',
              transition: 'background .18s cubic-bezier(0.16,1,0.3,1)',
            }} />
          )}
        />

        {/* Stress picker */}
        <RatingRow
          label={t('journal.stress')}
          value={stressVal}
          onChange={setStressVal}
          renderButton={(n, selected) => (
            <span style={{
              display: 'block',
              width: 14, height: 14, borderRadius: '50%',
              background: selected ? STRESS_COLORS[n - 1] : 'var(--fb-border-strong, var(--fb-border))',
              transition: 'background .18s cubic-bezier(0.16,1,0.3,1)',
            }} />
          )}
        />

        {/* Note */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--fb-text-2)' }}>
            {t('journal.note')}
          </label>
          <textarea
            ref={textareaRef}
            value={note}
            onChange={e => { setNote(e.target.value); autoResize(); }}
            placeholder={t('journal.notePlaceholder')}
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--fb-card)', border: '1px solid var(--fb-border)',
              color: 'var(--fb-text)', borderRadius: 10, padding: '8px 10px',
              fontSize: 13, outline: 'none', resize: 'none', overflow: 'hidden',
              fontFamily: 'var(--font-body)',
              transition: 'border-color .25s ease',
              lineHeight: 1.5,
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--fb-accent)'; }}
            onBlur={e  => { e.target.style.borderColor = 'var(--fb-border)'; }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            style={{ ...fbBtnPrimary, opacity: saving ? 0.7 : 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            {t('common.save')}
          </button>
          {existingEntry && (
            <button
              type="button"
              style={fbBtnGhost}
              onClick={handleDelete}
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>

      {/* 14-day trend */}
      <div style={cardOuter}>
        <div style={eyebrow}>{t('journal.trend14')}</div>

        {chartData.some(d => d.mood != null || d.energy != null || d.stress != null) ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--fb-border)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--fb-text-3)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={1}
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
          <div style={{ color: 'var(--fb-text-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
            {t('journal.empty')}
          </div>
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
    </div>
  );
}
