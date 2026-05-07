import { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import { useT } from '../../i18n/useT';
import { useNavigate } from '../../hooks/useNavigate';
import { cardOuter, eyebrow } from '../../lib/fbUI';
import { fbBtnGhost } from '../../lib/fbStyles';
import type { FocusSession, FocusWeekPoint } from '../../types';

function formatDurationShort(min: number): string {
  if (min === 0) return '0 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Simple inline bar sparkline (7 bars)
function MiniBarSparkline({ points }: { points: number[] }) {
  const max = Math.max(...points, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 24 }}>
      {points.map((v, i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: Math.max(2, Math.round((v / max) * 24)),
            borderRadius: 2,
            background: v > 0 ? 'var(--fb-accent)' : 'var(--fb-border-strong, var(--fb-border))',
            opacity: v > 0 ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
}

export default function FocusCard() {
  const { t } = useT();
  const { navigate } = useNavigate();

  const [totalMin,       setTotalMin]       = useState(0);
  const [sparkPoints,    setSparkPoints]    = useState<number[]>(Array(7).fill(0));
  const [activeSession,  setActiveSession]  = useState<FocusSession | null>(null);
  const [elapsed,        setElapsed]        = useState(0);
  const [loaded,         setLoaded]         = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Load today's total + 7-day sparkline + active session
    Promise.all([
      api.focus.getDayStats(todayStr()),
      api.focus.getWeekStats(nDaysAgo(6), todayStr()),
      api.focus.getActiveSession(),
    ]).then(([dayStats, weekStats, active]) => {
      setTotalMin(dayStats.total_min);

      const points = Array.from({ length: 7 }, (_, i) => {
        const d = nDaysAgo(6 - i);
        const found = (weekStats as FocusWeekPoint[]).find(w => w.date === d);
        return found?.total_min ?? 0;
      });
      setSparkPoints(points);

      setActiveSession(active);
      setLoaded(true);

      if (active) {
        const startMs = new Date(active.started_at).getTime();
        setElapsed(Date.now() - startMs);
      }
    }).catch(() => setLoaded(true));

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Tick elapsed time when active session
  useEffect(() => {
    if (activeSession) {
      const startMs = new Date(activeSession.started_at).getTime();
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - startMs);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeSession]);

  async function handleStop() {
    if (!activeSession) return;
    const durationMin = Math.max(1, Math.round(elapsed / 60000));
    await api.focus.stopSession(activeSession.id, durationMin);
    setActiveSession(null);
    setElapsed(0);
    // Refresh total
    api.focus.getDayStats(todayStr()).then(s => setTotalMin(s.total_min)).catch(() => {});
  }

  return (
    <div style={cardOuter}>
      {/* Header */}
      <div style={eyebrow}>{t('focus.eyebrow')}</div>

      {activeSession ? (
        // Active session view
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              className="tnum"
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 36,
                fontWeight: 400,
                letterSpacing: -1.5,
                color: 'var(--fb-accent)',
                lineHeight: 1,
              }}
            >
              {formatElapsed(elapsed)}
            </span>
          </div>
          {activeSession.project && (
            <span style={{ fontSize: 11.5, color: 'var(--fb-text-3)', fontStyle: 'italic' }}>
              {activeSession.project}
            </span>
          )}
          <div style={{ marginTop: 4 }}>
            <button
              type="button"
              onClick={handleStop}
              style={{
                ...fbBtnGhost,
                borderColor: 'var(--fb-red)',
                color: 'var(--fb-red)',
                fontSize: 11.5,
              }}
            >
              ⏹ {t('focus.stop')}
            </button>
          </div>
        </>
      ) : (
        // No active session
        <>
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
              {loaded ? formatDurationShort(totalMin) : '…'}
            </span>
          </div>

          {/* 7-day sparkline */}
          <MiniBarSparkline points={sparkPoints} />

          {/* CTA */}
          <div style={{ marginTop: 4 }}>
            <button
              type="button"
              onClick={() => navigate('focus')}
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
              {t('focus.startPomodoro')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
