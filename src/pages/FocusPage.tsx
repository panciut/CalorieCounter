import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { useT } from '../i18n/useT';
import { useToast } from '../components/Toast';
import { useAchievementToast } from '../hooks/useAchievementToast';
import { useSettings } from '../hooks/useSettings';
import { PageHeader, SegmentedControl, cardOuter, eyebrow } from '../lib/fbUI';
import { fbBtnPrimary, fbBtnGhost } from '../lib/fbStyles';
import BarChartCard from '../components/BarChartCard';
import type { FocusDayStats, FocusSession, FocusWeekPoint } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMM_SS(totalSecs: number): string {
  const s = Math.max(0, totalSecs);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatDurationShort(min: number): string {
  if (min === 0) return '0 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  const [, , dd] = iso.split('-');
  return dd;
}

// ── Pomodoro Circle ───────────────────────────────────────────────────────────

interface PomodoroCircleProps {
  remaining: number;  // seconds remaining
  total: number;      // total seconds
}

function PomodoroCircle({ remaining, total }: PomodoroCircleProps) {
  const R = 80;
  const cx = 100;
  const cy = 100;
  const circumference = 2 * Math.PI * R;
  const progress = total > 0 ? remaining / total : 1;
  const dashoffset = circumference * (1 - progress);

  return (
    <svg width={200} height={200} style={{ display: 'block', margin: '0 auto' }}>
      {/* Track */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke="var(--fb-border-strong, var(--fb-border))"
        strokeWidth={8}
      />
      {/* Progress arc */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke="var(--fb-accent)"
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashoffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
      {/* Time text */}
      <text
        x={cx} y={cy + 8}
        textAnchor="middle"
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 32,
          fontStyle: 'italic',
          fill: 'var(--fb-text)',
          fontWeight: 400,
        }}
      >
        {formatMM_SS(remaining)}
      </text>
    </svg>
  );
}

// ── Timer Tab ─────────────────────────────────────────────────────────────────

type TimerState = 'IDLE' | 'RUNNING' | 'PAUSED';

interface TimerTabProps {
  onSessionComplete: () => void;
}

function TimerTab({ onSessionComplete }: TimerTabProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const showAchievements = useAchievementToast();
  const { settings } = useSettings();

  const pomoDurationMin: number = (settings as Record<string, unknown>)['pomodoro_duration'] as number ?? 25;
  const pomoDurationSec = pomoDurationMin * 60;

  const [timerState, setTimerState] = useState<TimerState>('IDLE');
  const [remaining, setRemaining]   = useState(pomoDurationSec);
  const [project, setProject]       = useState('');
  const [sessionId, setSessionId]   = useState<number | null>(null);
  const [startedAt, setStartedAt]   = useState<string | null>(null);

  // Manual log form
  const [manualOpen,      setManualOpen]     = useState(false);
  const [manualDuration,  setManualDuration] = useState('');
  const [manualDate,      setManualDate]     = useState(todayStr());
  const [manualProject,   setManualProject]  = useState('');
  const [manualNote,      setManualNote]     = useState('');

  // Day stats for summary below timer
  const [dayStats, setDayStats] = useState<FocusDayStats | null>(null);

  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalPausedMsRef = useRef<number>(0);   // cumulative ms spent paused
  const pausedStartRef   = useRef<number | null>(null); // timestamp when current pause began

  // Check for an active session on mount
  useEffect(() => {
    api.focus.getActiveSession().then(active => {
      if (active) {
        // On mount totalPausedMsRef is 0 — we have no pause history from a previous run.
        // Use wall-clock elapsed as best estimate (existing behaviour).
        const elapsed = Math.floor((Date.now() - new Date(active.started_at).getTime()) / 1000);
        const rem = Math.max(0, pomoDurationSec - elapsed);
        setSessionId(active.id);
        setStartedAt(active.started_at);
        setRemaining(rem);
        setProject(active.project ?? '');
        if (rem > 0) {
          setTimerState('RUNNING');
        } else {
          // Pomodoro already over, treat as completed
          handleAutoComplete(active.id, active.started_at);
        }
      }
    }).catch(() => {});
    loadDayStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start / restart interval when RUNNING
  useEffect(() => {
    if (timerState === 'RUNNING') {
      intervalRef.current = setInterval(() => {
        if (startedAt) {
          const rawElapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
          const pausedSec  = Math.floor(totalPausedMsRef.current / 1000);
          const elapsed    = rawElapsed - pausedSec;
          const rem = Math.max(0, pomoDurationSec - elapsed);
          setRemaining(rem);
          if (rem === 0) {
            clearInterval(intervalRef.current!);
            intervalRef.current = null;
            handleAutoComplete(sessionId!, startedAt);
          }
        }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerState, startedAt, sessionId]);

  function handleAutoComplete(id: number, sa: string) {
    const elapsedMs   = Date.now() - new Date(sa).getTime() - totalPausedMsRef.current;
    const durationMin = Math.round(elapsedMs / 60000);
    api.focus.stopSession(id, durationMin).then(() => {
      showToast(`${t('focus.completed')} +${durationMin} min`);
      resetTimer();
      loadDayStats();
      onSessionComplete?.();
      api.gamification.addPoints({ module: 'focus', reason: 'focus_completed', points: 10, context: { date: todayStr() } })
        .then(r => { if (r.new_achievements?.length) showAchievements(r.new_achievements); })
        .catch(() => {});
    }).catch(() => {});
  }

  function loadDayStats() {
    api.focus.getDayStats(todayStr()).then(stats => setDayStats(stats)).catch(() => {});
  }

  function resetTimer() {
    setTimerState('IDLE');
    setRemaining(pomoDurationSec);
    setSessionId(null);
    setStartedAt(null);
    setProject('');
    totalPausedMsRef.current = 0;
    pausedStartRef.current   = null;
  }

  async function handleStart() {
    try {
      const res = await api.focus.startSession({
        type: 'pomodoro',
        project: project || undefined,
      });
      setSessionId(res.id);
      setStartedAt(res.started_at);
      setRemaining(pomoDurationSec);
      setTimerState('RUNNING');
    } catch (e) {
      console.error('focus:startSession error', e);
    }
  }

  function handlePause() {
    pausedStartRef.current = Date.now();
    setTimerState('PAUSED');
  }

  function handleResume() {
    if (pausedStartRef.current != null) {
      totalPausedMsRef.current += Date.now() - pausedStartRef.current;
      pausedStartRef.current = null;
    }
    setTimerState('RUNNING');
  }

  async function handleStop() {
    if (sessionId == null || startedAt == null) { resetTimer(); return; }
    // If we're stopping while paused, count that pause segment too
    const extraPausedMs = pausedStartRef.current != null ? Date.now() - pausedStartRef.current : 0;
    const elapsedMs     = Date.now() - new Date(startedAt).getTime() - totalPausedMsRef.current - extraPausedMs;
    const durationMin   = Math.max(1, Math.round(elapsedMs / 60000));
    try {
      await api.focus.stopSession(sessionId, durationMin);
      showToast(`${t('focus.completed')} +${durationMin} min`);
      loadDayStats();
      onSessionComplete?.();
      api.gamification.addPoints({ module: 'focus', reason: 'focus_completed', points: 10, context: { date: todayStr() } })
        .then(r => { if (r.new_achievements?.length) showAchievements(r.new_achievements); })
        .catch(() => {});
    } catch (e) {
      console.error('focus:stopSession error', e);
    }
    resetTimer();
  }

  async function handleManualSave() {
    const dur = parseInt(manualDuration, 10);
    if (!dur || dur < 1) return;
    try {
      await api.focus.logManual({
        date: manualDate,
        duration_min: dur,
        project: manualProject || undefined,
        note: manualNote || undefined,
      });
      showToast(`+${dur} min`);
      setManualOpen(false);
      setManualDuration('');
      setManualProject('');
      setManualNote('');
      setManualDate(todayStr());
      loadDayStats();
    } catch (e) {
      console.error('focus:logManual error', e);
    }
  }

  const totalMin = dayStats?.total_min ?? 0;
  const completedSessions = dayStats?.completed_sessions ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 28px', maxWidth: 520, margin: '0 auto' }}>

      {/* Timer card */}
      <div style={{ ...cardOuter, alignItems: 'center', gap: 24 }}>
        <PomodoroCircle remaining={remaining} total={pomoDurationSec} />

        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%' }}>
          {timerState === 'IDLE' && (
            <>
              <input
                type="text"
                value={project}
                onChange={e => setProject(e.target.value)}
                placeholder="Project (optional)"
                style={{
                  width: '100%', maxWidth: 280,
                  background: 'var(--fb-bg)', border: '1px solid var(--fb-border)',
                  color: 'var(--fb-text)', borderRadius: 8, padding: '7px 12px',
                  fontSize: 13, outline: 'none', fontFamily: 'var(--font-body)',
                }}
              />
              <button
                type="button"
                style={{ ...fbBtnPrimary, fontSize: 14, padding: '10px 32px' }}
                onClick={handleStart}
              >
                ▶ {t('focus.start')}
              </button>
            </>
          )}

          {timerState === 'RUNNING' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={fbBtnGhost} onClick={handlePause}>
                ⏸ {t('focus.pause')}
              </button>
              <button type="button" style={{ ...fbBtnGhost, borderColor: 'var(--fb-red)', color: 'var(--fb-red)' }} onClick={handleStop}>
                ⏹ {t('focus.stop')}
              </button>
            </div>
          )}

          {timerState === 'PAUSED' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={fbBtnPrimary} onClick={handleResume}>
                ▶ {t('focus.resume')}
              </button>
              <button type="button" style={{ ...fbBtnGhost, borderColor: 'var(--fb-red)', color: 'var(--fb-red)' }} onClick={handleStop}>
                ⏹ {t('focus.stop')}
              </button>
            </div>
          )}

          {project && timerState !== 'IDLE' && (
            <span style={{ fontSize: 11.5, color: 'var(--fb-text-3)', fontStyle: 'italic' }}>
              {project}
            </span>
          )}
        </div>

        {/* Today summary */}
        <div style={{ display: 'flex', gap: 24, paddingTop: 8, borderTop: '1px solid var(--fb-border)', width: '100%', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--fb-text)', letterSpacing: -0.5 }}>
              {formatDurationShort(totalMin)}
            </div>
            <div style={{ ...eyebrow, marginTop: 2 }}>{t('focus.totalMin')}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--fb-text)', letterSpacing: -0.5 }}>
              {completedSessions}
            </div>
            <div style={{ ...eyebrow, marginTop: 2 }}>sessions</div>
          </div>
        </div>
      </div>

      {/* Manual log */}
      <div style={cardOuter}>
        <button
          type="button"
          onClick={() => setManualOpen(v => !v)}
          style={{
            background: 'transparent', border: 0, cursor: 'pointer',
            color: 'var(--fb-accent)', fontSize: 12.5, fontWeight: 600,
            fontFamily: 'var(--font-body)', textAlign: 'left', padding: 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <span style={{ fontSize: 14 }}>{manualOpen ? '▾' : '▸'}</span>
          {t('focus.addManual')}
        </button>

        {manualOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ ...eyebrow, marginBottom: 4 }}>Duration (min)</div>
                <input
                  type="number" min="1"
                  value={manualDuration}
                  onChange={e => setManualDuration(e.target.value)}
                  placeholder="25"
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={{ ...eyebrow, marginBottom: 4 }}>Date</div>
                <input
                  type="date"
                  value={manualDate}
                  onChange={e => setManualDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <div style={{ ...eyebrow, marginBottom: 4 }}>Project (optional)</div>
              <input
                type="text"
                value={manualProject}
                onChange={e => setManualProject(e.target.value)}
                placeholder="e.g. Work, Study…"
                style={inputStyle}
              />
            </div>
            <div>
              <div style={{ ...eyebrow, marginBottom: 4 }}>Note (optional)</div>
              <input
                type="text"
                value={manualNote}
                onChange={e => setManualNote(e.target.value)}
                placeholder="Optional note…"
                style={inputStyle}
              />
            </div>
            <button
              type="button"
              style={{ ...fbBtnPrimary, alignSelf: 'flex-end' }}
              onClick={handleManualSave}
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--fb-bg)', border: '1px solid var(--fb-border)',
  color: 'var(--fb-text)', borderRadius: 8, padding: '7px 10px',
  fontSize: 13, outline: 'none', fontFamily: 'var(--font-body)',
  boxSizing: 'border-box',
};

// ── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [weekData,     setWeekData]     = useState<FocusWeekPoint[]>([]);
  const [dayStats,     setDayStats]     = useState<FocusDayStats | null>(null);

  const loadData = useCallback((date: string) => {
    const from = nDaysAgo(13);
    const to   = todayStr();
    api.focus.getWeekStats(from, to).then(data => setWeekData(data)).catch(() => {});
    api.focus.getDayStats(date).then(stats => setDayStats(stats)).catch(() => {});
  }, []);

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate, loadData]);

  // Build 14-day bar chart data
  const chartData = Array.from({ length: 14 }, (_, i) => {
    const d = nDaysAgo(13 - i);
    const found = weekData.find(w => w.date === d);
    return {
      label: shortDate(d),
      value: found?.total_min ?? 0,
    };
  });

  async function handleDelete(id: number) {
    await api.focus.deleteSession(id);
    loadData(selectedDate);
  }

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
      {/* Chart */}
      <div style={cardOuter}>
        <div style={eyebrow}>Last 14 days · minutes</div>
        <BarChartCard
          data={chartData}
          unit=" min"
          color="var(--fb-accent)"
          height={180}
        />
      </div>

      {/* Date picker + sessions list */}
      <div style={cardOuter}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={eyebrow}>Sessions for</div>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ ...inputStyle, width: 150 }}
          />
        </div>

        {dayStats && dayStats.sessions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayStats.sessions.map(session => (
              <SessionRow key={session.id} session={session} onDelete={handleDelete} />
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--fb-text-3)', fontSize: 13, fontStyle: 'italic', padding: '8px 0' }}>
            No sessions for this date.
          </div>
        )}

        {dayStats && dayStats.total_min > 0 && (
          <div style={{ display: 'flex', gap: 16, borderTop: '1px solid var(--fb-border)', paddingTop: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--fb-text-2)' }}>
              Total: <strong style={{ color: 'var(--fb-text)' }}>{formatDurationShort(dayStats.total_min)}</strong>
            </span>
            <span style={{ fontSize: 12, color: 'var(--fb-text-2)' }}>
              Sessions: <strong style={{ color: 'var(--fb-text)' }}>{dayStats.completed_sessions}</strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionRow({ session, onDelete }: { session: FocusSession; onDelete: (id: number) => void }) {
  const typeColor = session.type === 'pomodoro' ? 'var(--fb-accent)' : 'var(--fb-text-3)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 12px', borderRadius: 8,
      background: 'var(--fb-bg)', border: '1px solid var(--fb-border)',
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
        textTransform: 'uppercase', color: typeColor,
        minWidth: 52,
      }}>
        {session.type}
      </span>
      <span style={{ fontSize: 14, fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--fb-text)', minWidth: 48 }}>
        {formatDurationShort(session.duration_min)}
      </span>
      {session.project && (
        <span style={{ fontSize: 12, color: 'var(--fb-text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.project}
        </span>
      )}
      {!session.project && <span style={{ flex: 1 }} />}
      {session.note && (
        <span style={{ fontSize: 11, color: 'var(--fb-text-3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.note}
        </span>
      )}
      <button
        type="button"
        onClick={() => onDelete(session.id)}
        title="Delete"
        style={{
          background: 'transparent', border: 0, cursor: 'pointer',
          color: 'var(--fb-text-3)', fontSize: 14, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 4, flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ── Main FocusPage ────────────────────────────────────────────────────────────

export default function FocusPage() {
  const { t } = useT();
  const [tab, setTab] = useState<'timer' | 'history'>('timer');
  const [refreshKey, setRefreshKey] = useState(0);

  function handleSessionComplete() {
    setRefreshKey(k => k + 1);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        eyebrow={t('focus.eyebrow')}
        title={t('focus.title')}
        right={
          <SegmentedControl
            value={tab}
            options={[
              { value: 'timer',   label: 'Timer' },
              { value: 'history', label: 'Storico' },
            ]}
            onChange={setTab}
            minWidth={180}
          />
        }
      />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'timer'   && <TimerTab key={refreshKey} onSessionComplete={handleSessionComplete} />}
        {tab === 'history' && <HistoryTab />}
      </div>
    </div>
  );
}
