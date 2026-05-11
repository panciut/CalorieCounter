import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { useT } from '../i18n/useT';
import { useToast } from '../components/Toast';
import { useAchievementToast } from '../hooks/useAchievementToast';
import { useSettings } from '../hooks/useSettings';
import { PageHeader, SegmentedControl, cardOuter, eyebrow } from '../lib/fbUI';
import { fbBtnPrimary, fbBtnGhost } from '../lib/fbStyles';
import BarChartCard from '../components/BarChartCard';
import StreakBadge from '../components/StreakBadge';
import WeeklySummaryCard from '../components/WeeklySummaryCard';
import ModuleInsightsCard from '../components/ModuleInsightsCard';
import { formatShortDate } from '../lib/dateUtil';
import type { FocusDayStats, FocusSession, FocusStats } from '../types';

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

// SQLite datetime('now') returns UTC without 'Z' — force UTC parsing
function toUTC(s: string): number {
  const safe = s.includes('Z') || s.includes('+') ? s : s.replace(' ', 'T') + 'Z';
  return new Date(safe).getTime();
}

// ── Pomodoro Circle ───────────────────────────────────────────────────────────

function PomodoroCircle({ remaining, total }: { remaining: number; total: number }) {
  const R = 80; const cx = 100; const cy = 100;
  const circ = 2 * Math.PI * R;
  const progress = total > 0 ? remaining / total : 1;
  return (
    <svg width={200} height={200} style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--fb-border-strong, var(--fb-border))" strokeWidth={8} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--fb-accent)" strokeWidth={8} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)}
        transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: 'stroke-dashoffset 1s linear' }} />
      <text x={cx} y={cy + 8} textAnchor="middle"
        style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontStyle: 'italic', fill: 'var(--fb-text)', fontWeight: 400 }}>
        {formatMM_SS(remaining)}
      </text>
    </svg>
  );
}

// ── Session dual-ring circle ───────────────────────────────────────────────────

function SessionCircle({ phaseRemain, phaseTotal, totalProgress, phase, idle, idleLabel }: {
  phaseRemain: number; phaseTotal: number; totalProgress: number;
  phase: 'focus' | 'break'; idle: boolean; idleLabel: string;
}) {
  const Ro = 85; const Ri = 68; const cx = 100; const cy = 100;
  const co = 2 * Math.PI * Ro;
  const ci = 2 * Math.PI * Ri;
  const phaseProgress = phaseTotal > 0 ? 1 - phaseRemain / phaseTotal : 0;
  const phaseColor = phase === 'focus' ? 'var(--fb-accent)' : '#10b981';
  return (
    <svg width={200} height={200} style={{ display: 'block', margin: '0 auto' }}>
      {/* Outer ring: total session progress */}
      <circle cx={cx} cy={cy} r={Ro} fill="none" stroke="var(--fb-border)" strokeWidth={4} />
      {!idle && totalProgress > 0 && (
        <circle cx={cx} cy={cy} r={Ro} fill="none"
          stroke="color-mix(in srgb, var(--fb-accent) 55%, transparent)"
          strokeWidth={4} strokeLinecap="round"
          strokeDasharray={co} strokeDashoffset={co * (1 - totalProgress)}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 1s linear' }} />
      )}
      {/* Inner ring: current phase */}
      <circle cx={cx} cy={cy} r={Ri} fill="none" stroke="var(--fb-border)" strokeWidth={8} />
      {!idle && (
        <circle cx={cx} cy={cy} r={Ri} fill="none" stroke={phaseColor}
          strokeWidth={8} strokeLinecap="round"
          strokeDasharray={ci} strokeDashoffset={ci * (1 - phaseProgress)}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.5s linear' }} />
      )}
      {/* Center */}
      <text x={cx} y={cy + 8} textAnchor="middle"
        style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontStyle: 'italic', fill: 'var(--fb-text)', fontWeight: 400 }}>
        {idle ? idleLabel : formatMM_SS(phaseRemain)}
      </text>
    </svg>
  );
}

// ── Session Timer ─────────────────────────────────────────────────────────────

type SState = 'IDLE' | 'RUNNING' | 'PAUSED';
type SPhase = 'focus' | 'break';

function SessionTimerTab({ onSessionComplete }: { onSessionComplete: () => void }) {
  const { showToast } = useToast();
  const showAchievements = useAchievementToast();

  const [sState, setSState]         = useState<SState>('IDLE');
  const [phase, setPhase]           = useState<SPhase>('focus');
  const [phaseRemainSec, setPhaseRemainSec] = useState(0);
  const [focusMinDone, setFocusMinDone]     = useState(0);
  const [totalMin, setTotalMin]     = useState(60);
  const [blockMin, setBlockMin]     = useState(25);
  const [project, setProject]       = useState('');
  const [dayStats, setDayStats]     = useState<FocusDayStats | null>(null);

  // All transition-critical values live in refs to avoid stale closures
  const phaseRef        = useRef<SPhase>('focus');
  const phaseStartMsRef = useRef<number>(0);
  const phaseTargetMsRef= useRef<number>(0);
  const pausedMsRef     = useRef<number>(0);
  const pauseStartRef   = useRef<number | null>(null);
  const focusDoneRef    = useRef<number>(0);
  const totalMinRef     = useRef<number>(60);
  const blockMinRef     = useRef<number>(25);
  const sessionIdRef    = useRef<number | null>(null);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // onPhaseEnd stored in ref so interval always calls the latest version
  const onPhaseEndRef = useRef<() => void>(() => {});

  function getPhaseRemainSec(): number {
    const currentPauseMs = pauseStartRef.current != null ? Date.now() - pauseStartRef.current : 0;
    const elapsed = Date.now() - phaseStartMsRef.current - pausedMsRef.current - currentPauseMs;
    return Math.max(0, Math.floor((phaseTargetMsRef.current - elapsed) / 1000));
  }

  function beginPhase(p: SPhase, durationMin: number) {
    phaseRef.current       = p;
    phaseStartMsRef.current= Date.now();
    phaseTargetMsRef.current = durationMin * 60 * 1000;
    pausedMsRef.current    = 0;
    pauseStartRef.current  = null;
    setPhase(p);
    setPhaseRemainSec(durationMin * 60);
  }

  function loadDayStats() {
    api.focus.getDayStats(todayStr()).then(s => setDayStats(s)).catch(() => {});
  }

  // The phase-end handler — always accessed via ref inside interval
  function onPhaseEnd() {
    if (phaseRef.current === 'focus') {
      const blockDone = Math.round(phaseTargetMsRef.current / 60000);
      const newDone   = focusDoneRef.current + blockDone;
      focusDoneRef.current = newDone;
      setFocusMinDone(newDone);

      if (newDone >= totalMinRef.current) {
        // Session complete
        const id = sessionIdRef.current!;
        api.focus.stopSession(id, Math.max(1, newDone)).then(() => {
          const pts = 10 + Math.floor(newDone / 25) * 5;
          showToast(`Sessione completata! +${newDone} min 🎉`);
          resetSession();
          loadDayStats();
          onSessionComplete();
          api.gamification.addPoints({ module: 'focus', reason: 'session_completed', points: pts, context: { date: todayStr() } })
            .then(r => { if (r.new_achievements?.length) showAchievements(r.new_achievements); }).catch(() => {});
        }).catch(() => {});
      } else {
        // Start 5-min break
        beginPhase('break', 5);
        setSState('RUNNING'); // triggers effect restart
      }
    } else {
      // Break over → next focus block
      const remaining  = totalMinRef.current - focusDoneRef.current;
      const nextBlock  = Math.min(blockMinRef.current, remaining);
      beginPhase('focus', nextBlock);
      setSState('RUNNING'); // triggers effect restart
    }
  }
  onPhaseEndRef.current = onPhaseEnd;

  // Interval effect — depends on [sState, phase] so restarts on phase transition
  useEffect(() => {
    if (sState !== 'RUNNING') {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    intervalRef.current = setInterval(() => {
      const rem = getPhaseRemainSec();
      setPhaseRemainSec(rem);
      if (rem === 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        onPhaseEndRef.current();
      }
    }, 500);
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sState, phase]);

  async function handleStart() {
    try {
      const res = await api.focus.startSession({ type: 'session', project: project || undefined });
      sessionIdRef.current = res.id;
      focusDoneRef.current = 0;
      totalMinRef.current  = totalMin;
      blockMinRef.current  = blockMin;
      setFocusMinDone(0);
      const firstBlock = Math.min(blockMin, totalMin);
      beginPhase('focus', firstBlock);
      setSState('RUNNING');
    } catch (e) { console.error('session:start', e); }
  }

  function handlePause() {
    pauseStartRef.current = Date.now();
    setSState('PAUSED');
  }

  function handleResume() {
    if (pauseStartRef.current != null) {
      pausedMsRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    setSState('RUNNING');
  }

  async function handleStop() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    const doneSoFar = focusDoneRef.current;
    const id = sessionIdRef.current;
    if (id != null && doneSoFar >= 1) {
      await api.focus.stopSession(id, doneSoFar).catch(() => {});
      showToast(`Stop — +${doneSoFar} min salvati`);
      loadDayStats();
      onSessionComplete();
    }
    resetSession();
  }

  function resetSession() {
    setSState('IDLE');
    setPhase('focus');
    setFocusMinDone(0);
    setPhaseRemainSec(0);
    focusDoneRef.current  = 0;
    sessionIdRef.current  = null;
    phaseRef.current      = 'focus';
  }

  useEffect(() => { loadDayStats(); return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  const blocksTotal    = Math.ceil(totalMin / blockMin);
  const blocksDone     = Math.floor(focusMinDone / blockMin);
  const totalProgress  = totalMin > 0 ? Math.min(focusMinDone / totalMin, 1) : 0;
  const currentBlockSec= phaseRef.current === 'focus'
    ? Math.min(blockMin, totalMin - focusDoneRef.current) * 60
    : 5 * 60;

  const phaseColor = phase === 'focus' ? 'var(--fb-accent)' : '#10b981';
  const totalFocusMin = dayStats?.total_min ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ ...cardOuter, alignItems: 'center', gap: 18 }}>

        {/* Phase pill */}
        {sState !== 'IDLE' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px', borderRadius: 99, background: `color-mix(in srgb, ${phaseColor} 12%, transparent)`, border: `1px solid ${phaseColor}` }}>
            <span style={{ fontSize: 14 }}>{phase === 'focus' ? '🧠' : '☕'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: phaseColor, letterSpacing: '0.05em' }}>
              {phase === 'focus' ? 'FOCUS' : 'PAUSA 5 min'}
            </span>
            {sState === 'PAUSED' && <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>· in pausa</span>}
          </div>
        )}

        <SessionCircle
          phaseRemain={phaseRemainSec}
          phaseTotal={currentBlockSec}
          totalProgress={totalProgress}
          phase={phase}
          idle={sState === 'IDLE'}
          idleLabel={`${totalMin}m`}
        />

        {/* Overall progress */}
        {sState !== 'IDLE' && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fb-text-3)' }}>
              <span>Focus: <strong style={{ color: 'var(--fb-text)' }}>{focusMinDone}/{totalMin} min</strong></span>
              <span>Blocco <strong style={{ color: 'var(--fb-text)' }}>{Math.min(blocksDone + (phase === 'focus' ? 1 : blocksDone), blocksTotal)}/{blocksTotal}</strong></span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: 'var(--fb-border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, background: 'var(--fb-accent)', width: `${totalProgress * 100}%`, transition: 'width 1s linear' }} />
            </div>
          </div>
        )}

        {/* Setup (IDLE) */}
        {sState === 'IDLE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <div>
              <div style={{ ...eyebrow, marginBottom: 8 }}>Durata totale</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[30, 45, 60, 90, 120].map(m => (
                  <button key={m} type="button" onClick={() => setTotalMin(m)} style={{ padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all .15s cubic-bezier(0.16,1,0.3,1)', border: `1.5px solid ${totalMin === m ? 'var(--fb-accent)' : 'var(--fb-border)'}`, background: totalMin === m ? 'color-mix(in srgb, var(--fb-accent) 12%, transparent)' : 'transparent', color: totalMin === m ? 'var(--fb-accent)' : 'var(--fb-text-2)' }}>{m}m</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ ...eyebrow, marginBottom: 8 }}>Blocco focus</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[25, 45, 50].map(m => (
                  <button key={m} type="button" onClick={() => setBlockMin(m)} style={{ padding: '6px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all .15s cubic-bezier(0.16,1,0.3,1)', border: `1.5px solid ${blockMin === m ? 'var(--fb-accent)' : 'var(--fb-border)'}`, background: blockMin === m ? 'color-mix(in srgb, var(--fb-accent) 12%, transparent)' : 'transparent', color: blockMin === m ? 'var(--fb-accent)' : 'var(--fb-text-2)' }}>{m}m</button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--fb-text-3)', fontStyle: 'italic' }}>
              {Math.ceil(totalMin / blockMin)} blocchi × {blockMin}m + pause 5m · totale ~{totalMin + (Math.ceil(totalMin / blockMin) - 1) * 5}m
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <input type="text" value={project} onChange={e => setProject(e.target.value)} placeholder="Progetto (opzionale)"
                style={{ width: '100%', maxWidth: 280, background: 'var(--fb-bg)', border: '1px solid var(--fb-border)', color: 'var(--fb-text)', borderRadius: 8, padding: '7px 12px', fontSize: 13, outline: 'none', fontFamily: 'var(--font-body)' }} />
              <button type="button" style={{ ...fbBtnPrimary, fontSize: 14, padding: '10px 32px' }} onClick={handleStart}>
                ▶ Avvia sessione
              </button>
            </div>
          </div>
        )}

        {/* Running controls */}
        {sState === 'RUNNING' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" style={fbBtnGhost} onClick={handlePause}>⏸ {/* pause */}Pausa</button>
            <button type="button" style={{ ...fbBtnGhost, borderColor: 'var(--fb-red,#ef4444)', color: 'var(--fb-red,#ef4444)' }} onClick={handleStop}>⏹ Stop</button>
          </div>
        )}
        {sState === 'PAUSED' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" style={fbBtnPrimary} onClick={handleResume}>▶ Riprendi</button>
            <button type="button" style={{ ...fbBtnGhost, borderColor: 'var(--fb-red,#ef4444)', color: 'var(--fb-red,#ef4444)' }} onClick={handleStop}>⏹ Stop</button>
          </div>
        )}

        {/* Day summary */}
        <div style={{ display: 'flex', gap: 24, paddingTop: 8, borderTop: '1px solid var(--fb-border)', width: '100%', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--fb-text)', letterSpacing: -0.5 }}>{formatDurationShort(totalFocusMin)}</div>
            <div style={{ ...eyebrow, marginTop: 2 }}>focus oggi</div>
          </div>
        </div>
      </div>
    </div>
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
        const elapsed = Math.floor((Date.now() - toUTC(active.started_at)) / 1000);
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
          const rawElapsed = Math.floor((Date.now() - toUTC(startedAt)) / 1000);
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
    const elapsedMs   = Date.now() - toUTC(sa) - totalPausedMsRef.current;
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
    const elapsedMs     = Date.now() - toUTC(startedAt) - totalPausedMsRef.current - extraPausedMs;
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
  const { t } = useT();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [focusStats,   setFocusStats]   = useState<FocusStats | null>(null);
  const [dayStats,     setDayStats]     = useState<FocusDayStats | null>(null);

  const loadData = useCallback((date: string) => {
    const from = nDaysAgo(29);
    const to   = todayStr();
    api.focus.getStats(from, to).then(data => setFocusStats(data)).catch(() => {});
    api.focus.getDayStats(date).then(stats => setDayStats(stats)).catch(() => {});
  }, []);

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate, loadData]);

  const chartData = focusStats
    ? focusStats.days.map(d => ({
        label: formatShortDate(d.date),
        value: d.total_min,
      }))
    : [];

  async function handleDelete(id: number) {
    await api.focus.deleteSession(id);
    loadData(selectedDate);
  }

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>

      {/* ── Streak + Weekly Summary ─────────────────────────────────────── */}
      {focusStats && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <StreakBadge
              current={focusStats.current_streak}
              best={focusStats.best_streak}
              emoji="🎯"
            />
          </div>
          <WeeklySummaryCard
            title={t('focus.weekTitle')}
            metrics={[
              {
                label: t('focus.minutes'),
                thisWeek: focusStats.week_min,
                lastWeek: focusStats.last_week_min,
                format: (v: number) => {
                  const h = Math.floor(v / 60);
                  const m = v % 60;
                  if (h === 0) return `${m}m`;
                  if (m === 0) return `${h}h`;
                  return `${h}h ${m}m`;
                },
                higherIsBetter: true,
              },
              {
                label: t('focus.avgPerActiveDay'),
                thisWeek: focusStats.avg_min_per_active_day,
                lastWeek: 0,
                format: (v: number) => {
                  const h = Math.floor(v / 60);
                  const m = Math.round(v % 60);
                  if (h === 0) return `${m}m`;
                  if (m === 0) return `${h}h`;
                  return `${h}h ${m}m`;
                },
              },
            ]}
          />
        </>
      )}

      {/* ── 30-day chart ───────────────────────────────────────────────── */}
      <div style={cardOuter}>
        <div style={eyebrow}>{t('focus.chart30Title')}</div>
        <BarChartCard
          data={chartData}
          unit=" min"
          color="var(--fb-accent)"
          height={180}
        />
      </div>

      {/* ── Per-project ────────────────────────────────────────────────── */}
      {focusStats && focusStats.by_project.length > 0 && (
        <div style={cardOuter}>
          <div style={eyebrow}>{t('focus.byProjectTitle')}</div>
          <BarChartCard
            data={focusStats.by_project.map(p => ({
              label: p.project === '__none__' ? t('focus.noProject') : p.project,
              value: p.total_min,
            }))}
            unit=" min"
            color="var(--fb-accent)"
            height={180}
          />
        </div>
      )}

      {/* ── Date picker + sessions list ───────────────── */}
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

      {/* ── Correlazioni ───────────────────────────────────────────────── */}
      <ModuleInsightsCard modules={['focus']} />

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
  const [timerMode, setTimerMode] = useState<'pomodoro' | 'session'>('pomodoro');
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
        {tab === 'timer' && (
          <div style={{ padding: '0 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
              <SegmentedControl
                value={timerMode}
                options={[
                  { value: 'pomodoro', label: t('focus.modePomodoro') },
                  { value: 'session',  label: t('focus.modeSession') },
                ]}
                onChange={setTimerMode}
                minWidth={300}
              />
            </div>
            {timerMode === 'pomodoro' ? (
              <TimerTab key={`pomo-${refreshKey}`} onSessionComplete={handleSessionComplete} />
            ) : (
              <SessionTimerTab key={`sess-${refreshKey}`} onSessionComplete={handleSessionComplete} />
            )}
          </div>
        )}
        {tab === 'history' && <HistoryTab />}
      </div>
    </div>
  );
}
