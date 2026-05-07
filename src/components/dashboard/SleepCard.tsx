import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useT } from '../../i18n/useT';
import { useNavigate } from '../../hooks/useNavigate';
import { cardOuter, eyebrow } from '../../lib/fbUI';
import type { SleepEntry } from '../../types';

function formatDuration(min: number | null): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SleepCard() {
  const { t } = useT();
  const { navigate } = useNavigate();
  const [entry, setEntry] = useState<SleepEntry | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.sleep.get(todayStr())
      .then(row => {
        setEntry(row as SleepEntry | null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const duration = formatDuration(entry?.duration_min ?? null);
  const quality  = entry?.quality ?? 0;

  return (
    <div style={cardOuter}>
      {/* Header */}
      <div style={eyebrow}>{t('sleep.eyebrow')}</div>

      {/* Duration display */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          className="tnum"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 36,
            fontWeight: 400,
            letterSpacing: -1.5,
            color: loaded ? 'var(--fb-text)' : 'var(--fb-text-3)',
            lineHeight: 1,
          }}
        >
          {loaded ? duration : '…'}
        </span>
        {entry?.bedtime && entry?.wake_time && (
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 11, color: 'var(--fb-text-3)' }}>
            {entry.bedtime} → {entry.wake_time}
          </span>
        )}
      </div>

      {/* Quality dots */}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <span
            key={n}
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: n <= quality ? 'var(--fb-accent)' : 'var(--fb-border-strong, var(--fb-border))',
              transition: 'background .3s ease',
              flexShrink: 0,
            }}
          />
        ))}
        {quality > 0 && (
          <span style={{ fontSize: 10, color: 'var(--fb-text-3)', marginLeft: 4, alignSelf: 'center' }}>
            {quality}/5
          </span>
        )}
      </div>

      {/* CTA */}
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={() => navigate('sleep')}
          style={{
            display: 'inline-flex', alignItems: 'center',
            background: 'transparent',
            border: '1px solid var(--fb-border)',
            color: 'var(--fb-text-2)',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 11.5,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            flexShrink: 0,
          }}
        >
          {t('sleep.logSleep')}
        </button>
      </div>
    </div>
  );
}
