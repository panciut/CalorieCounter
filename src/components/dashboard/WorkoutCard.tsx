import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useT } from '../../i18n/useT';
import { useNavigate } from '../../hooks/useNavigate';
import { cardOuter, eyebrow } from '../../lib/fbUI';
import type { WorkoutSession } from '../../types';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDuration(min: number | null): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function WorkoutCard() {
  const { t } = useT();
  const { navigate } = useNavigate();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.workouts.getDaySessions(todayStr())
      .then(rows => {
        setSessions(rows as WorkoutSession[]);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const completed = sessions.filter(s => s.ended_at != null);
  const totalDuration = completed.reduce((sum, s) => sum + (s.duration_min ?? 0), 0);
  const totalCalories = completed.reduce((sum, s) => sum + (s.calories_burned ?? 0), 0);
  const lastEffort = completed.length > 0
    ? completed[completed.length - 1].perceived_effort
    : null;

  const hasSessions = completed.length > 0;

  return (
    <div style={cardOuter}>
      {/* Header */}
      <div style={eyebrow}>{t('workouts.eyebrow')}</div>

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
          {loaded ? (hasSessions ? formatDuration(totalDuration) : '—') : '…'}
        </span>
        {hasSessions && totalCalories > 0 && (
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 11, color: 'var(--fb-text-3)' }}>
            {totalCalories} kcal
          </span>
        )}
      </div>

      {hasSessions ? (
        <>
          {/* Effort dots */}
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: lastEffort != null && i < lastEffort
                    ? 'var(--fb-accent)'
                    : 'var(--fb-border-strong, var(--fb-border))',
                  transition: 'background .3s ease',
                  flexShrink: 0,
                }}
              />
            ))}
            {lastEffort != null && (
              <span style={{ fontSize: 10, color: 'var(--fb-text-3)', marginLeft: 4, alignSelf: 'center' }}>
                {lastEffort}/10
              </span>
            )}
          </div>
          {completed.length > 1 && (
            <div style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>
              {t('workouts.sessionsToday').replace('{n}', String(completed.length))}
            </div>
          )}
        </>
      ) : (
        loaded && (
          <div style={{ fontSize: 12, color: 'var(--fb-text-3)' }}>
            {t('workouts.noSessionToday')}
          </div>
        )
      )}

      {/* CTA */}
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={() => navigate('exercise')}
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
          {t('workouts.start')}
        </button>
      </div>
    </div>
  );
}
