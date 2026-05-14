import { useState, useEffect } from 'react';
import { api } from '../../api';
import { cardOuter, eyebrow } from '../../lib/fbUI';
import { useNavigate } from '../../hooks/useNavigate';
import type { SectionStreak, PageName, WidgetSize } from '../../types';

const SECTION_META: Record<string, { icon: string; label: string; page: PageName }> = {
  sleep:   { icon: '🌙', label: 'Sleep',   page: 'sleep'    },
  diet:    { icon: '🍽️', label: 'Diet',    page: 'foods'    },
  focus:   { icon: '🧠', label: 'Focus',   page: 'focus'    },
  workout: { icon: '💪', label: 'Workout', page: 'exercise' },
};

function flameColor(streak: number, completedToday = true): string {
  if (streak === 0) return '#6b7280';
  if (!completedToday) return '#9ca3af';
  if (streak < 7)   return '#f97316';
  if (streak < 30)  return '#f59e0b';
  return '#ef4444';
}

export default function SectionStreaksCard({ size = 'M' }: { size?: WidgetSize }) {
  const { navigate } = useNavigate();
  const [streaks, setStreaks] = useState<SectionStreak[]>([]);

  useEffect(() => {
    api.sectionStreaks.getAll().then(setStreaks).catch(() => {});
  }, []);

  if (streaks.length === 0) return null;
  const best = Math.max(...streaks.map(s => s.current_streak));
  const anyKeptToday = streaks.some(s => s.completed_today);
  const flameDim = '#9ca3af';

  // ── XS ────────────────────────────────────────────────────────────────────
  if (size === 'XS') {
    return (
      <div style={{ ...cardOuter, height: '100%', padding: 12, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <span style={{ ...eyebrow, fontSize: 8.5 }}>Streak</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, opacity: anyKeptToday ? 1 : 0.5 }}>
          <span style={{ fontSize: 24, filter: anyKeptToday ? 'none' : 'grayscale(1)' }}>🔥</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 28, color: anyKeptToday ? 'var(--fb-text)' : flameDim }}>{best}</span>
        </div>
        <span style={{ fontSize: 9, color: 'var(--fb-text-3)' }}>{streaks.filter(s => s.completed_today).length}/4 kept today</span>
      </div>
    );
  }

  // ── S — 2×2 grid ─────────────────────────────────────────────────────────
  if (size === 'S') {
    return (
      <div style={{ ...cardOuter, height: '100%', padding: 12, justifyContent: 'space-between' }}>
        <span style={eyebrow}>Streaks</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 6 }}>
          {streaks.map(s => {
            const meta = SECTION_META[s.section];
            const kept = s.completed_today;
            const has = s.current_streak > 0;
            return (
              <button key={s.section} onClick={() => navigate(meta?.page ?? 'dashboard')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px',
                  background: kept ? 'color-mix(in srgb, var(--fb-accent) 10%, transparent)' : 'var(--fb-bg-2)',
                  border: `1px solid ${kept ? 'var(--fb-accent)' : 'var(--fb-border)'}`,
                  borderRadius: 8, cursor: 'pointer',
                }}>
                <span style={{ fontSize: 13, filter: kept || !has ? 'none' : 'grayscale(1)', opacity: kept || !has ? 1 : 0.7 }}>{meta?.icon}</span>
                <span style={{ flex: 1, fontSize: 10, color: 'var(--fb-text-2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{meta?.label}</span>
                <span style={{ fontSize: 11, filter: kept ? 'none' : 'grayscale(1)', opacity: kept ? 1 : 0.55 }}>🔥</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: flameColor(s.current_streak, kept) }} className="tnum">{s.current_streak}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── M — 4 streak row + history grid ──────────────────────────────────────
  if (size === 'M') {
    return (
      <div style={{ ...cardOuter, height: '100%', padding: 16, gap: 12, justifyContent: 'flex-start', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={eyebrow}>Streaks · 4 sezioni</span>
          <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>{streaks.filter(s => s.completed_today).length}/4 kept oggi</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
          {streaks.map(s => {
            const meta = SECTION_META[s.section];
            const kept = s.completed_today;
            return (
              <button key={s.section} onClick={() => navigate(meta?.page ?? 'dashboard')}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 4px',
                  background: kept ? 'color-mix(in srgb, var(--fb-accent) 8%, transparent)' : 'var(--fb-bg-2)',
                  border: `1px solid ${kept ? 'var(--fb-accent)' : 'var(--fb-border)'}`,
                  borderRadius: 10, cursor: 'pointer',
                }}>
                <span style={{ fontSize: 16, filter: kept ? 'none' : 'grayscale(0.6)', opacity: kept ? 1 : 0.85 }}>{meta?.icon}</span>
                <span style={{ fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{meta?.label}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                  <span style={{ fontSize: 12, filter: kept ? 'none' : 'grayscale(1)', opacity: kept ? 1 : 0.55 }}>🔥</span>
                  <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 20, color: flameColor(s.current_streak, kept) }}>{s.current_streak}</span>
                </div>
                <span style={{ fontSize: 8.5, color: 'var(--fb-text-3)' }}>best {s.longest_streak}</span>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 8, borderTop: '1px solid var(--fb-divider)', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
            <span>Last 14 days</span>
            <span>● done · ○ missed</span>
          </div>
          {streaks.map(s => {
            const meta = SECTION_META[s.section];
            const kept = s.completed_today;
            const days = Array.from({ length: 14 }, (_, i) => i >= 14 - s.current_streak ? 1 : 0);
            const todayIdx = 13;
            return (
              <div key={s.section} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, width: 16 }}>{meta?.icon}</span>
                <div style={{ flex: 1, display: 'flex', gap: 2 }}>
                  {days.map((d, i) => {
                    const isToday = i === todayIdx;
                    const lit = d && (!isToday || kept);
                    return (
                      <div key={i} style={{
                        flex: 1, height: 14, borderRadius: 2,
                        background: lit ? flameColor(s.current_streak, kept) : 'var(--fb-border-strong, var(--fb-border))',
                        opacity: lit ? (i >= 14 - s.current_streak ? 1 : 0.55) : (isToday && d ? 0.85 : 0.5),
                        outline: isToday && !kept && d ? '1px dashed var(--fb-border-strong)' : 'none',
                      }} />
                    );
                  })}
                </div>
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 11, color: flameColor(s.current_streak, kept) }} className="tnum">{s.current_streak}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── L ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ ...cardOuter, height: '100%', padding: 20, display: 'grid', gridTemplateColumns: '280px 1fr 260px', gap: 22, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={eyebrow}>Streaks · oggi</span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {streaks.map(s => {
            const meta = SECTION_META[s.section];
            const kept = s.completed_today;
            const has = s.current_streak > 0;
            return (
              <button key={s.section} onClick={() => navigate(meta?.page ?? 'dashboard')} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                background: kept ? 'color-mix(in srgb, var(--fb-accent) 8%, transparent)' : 'var(--fb-bg-2)',
                border: `1px solid ${kept ? 'var(--fb-accent)' : 'var(--fb-border)'}`,
                borderRadius: 10, cursor: 'pointer',
                position: 'relative',
              }} title={has && !kept ? 'Streak da mantenere oggi' : undefined}>
                <span style={{ fontSize: 18, filter: kept || !has ? 'none' : 'grayscale(0.7)', opacity: kept || !has ? 1 : 0.85 }}>{meta?.icon}</span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--fb-text)', textAlign: 'left' }}>{meta?.label}</span>
                <span style={{ fontSize: 14, filter: kept ? 'none' : 'grayscale(1)', opacity: kept ? 1 : 0.5 }}>🔥</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 22, color: flameColor(s.current_streak, kept) }}>{s.current_streak}</span>
                <span style={{ fontSize: 9, color: 'var(--fb-text-3)', minWidth: 36, textAlign: 'right' }}>
                  {has && !kept ? <span style={{ color: 'var(--fb-text-3)', fontWeight: 600 }}>da fare</span> : `best ${s.longest_streak}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Activity · last 21 days</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--fb-text-3)' }}>
            <span>missed</span>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--fb-border-strong)' }} />
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f97316' }} />
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b' }} />
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }} />
            <span>active</span>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minHeight: 0 }}>
          {streaks.map(s => {
            const meta = SECTION_META[s.section];
            const kept = s.completed_today;
            const days = Array.from({ length: 21 }, (_, i) => i >= 21 - s.current_streak ? 1 : 0);
            const todayIdx = 20;
            return (
              <div key={s.section} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: 88 }}>
                  <span style={{ fontSize: 13 }}>{meta?.icon}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fb-text-2)' }}>{meta?.label}</span>
                </div>
                <div style={{ flex: 1, display: 'flex', gap: 3 }}>
                  {days.map((d, i) => {
                    const isToday = i === todayIdx;
                    const lit = d && (!isToday || kept);
                    return (
                      <div key={i} style={{
                        flex: 1, height: 22, borderRadius: 3,
                        background: lit ? flameColor(s.current_streak, kept) : 'var(--fb-border-strong, var(--fb-border))',
                        opacity: lit ? (i >= 21 - s.current_streak ? 1 : 0.45) : (isToday && d ? 0.85 : 0.6),
                        outline: isToday && !kept && d ? '1px dashed var(--fb-border-strong)' : 'none',
                      }} />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 18, borderLeft: '1px solid var(--fb-divider)' }}>
        <div>
          <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 8 }}>Records 🏆</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {streaks.slice().sort((a, b) => b.longest_streak - a.longest_streak).map(s => {
              const meta = SECTION_META[s.section];
              return (
                <div key={s.section} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13 }}>{meta?.icon}</span>
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--fb-text-2)' }}>{meta?.label}</span>
                  <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--fb-text)' }} className="tnum">{s.longest_streak}</span>
                  <span style={{ fontSize: 9, color: 'var(--fb-text-3)' }}>days</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ paddingTop: 10, borderTop: '1px solid var(--fb-divider)' }}>
          <div style={{ fontSize: 9.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6 }}>Totale</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 7, padding: '6px 8px' }}>
              <div style={{ fontSize: 8.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>Sum oggi</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: 'var(--fb-accent)' }}>{streaks.reduce((a, b) => a + b.current_streak, 0)}</div>
            </div>
            <div style={{ background: 'var(--fb-bg-2)', border: '1px solid var(--fb-border)', borderRadius: 7, padding: '6px 8px' }}>
              <div style={{ fontSize: 8.5, color: 'var(--fb-text-3)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>All-time</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: 'var(--fb-text)' }}>{streaks.reduce((a, b) => a + b.longest_streak, 0)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
