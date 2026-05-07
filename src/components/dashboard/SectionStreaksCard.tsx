import { useState, useEffect } from 'react';
import { api } from '../../api';
import { cardOuter, eyebrow } from '../../lib/fbUI';
import { useNavigate } from '../../hooks/useNavigate';
import type { SectionStreak, PageName } from '../../types';

const SECTION_META: Record<string, { icon: string; label: string; page: PageName }> = {
  sleep:   { icon: '🌙', label: 'Sonno',   page: 'sleep'    },
  diet:    { icon: '🍽️', label: 'Dieta',   page: 'foods'    },
  focus:   { icon: '🧠', label: 'Focus',   page: 'focus'    },
  workout: { icon: '💪', label: 'Workout', page: 'exercise' },
};

function flameColor(streak: number, completed: boolean): string {
  if (!completed && streak === 0) return 'var(--fb-text-muted)';
  if (streak < 7)  return '#f97316';
  if (streak < 30) return '#f59e0b';
  return '#ef4444';
}

export default function SectionStreaksCard() {
  const { navigate } = useNavigate();
  const [streaks, setStreaks] = useState<SectionStreak[]>([]);

  useEffect(() => {
    api.sectionStreaks.getAll().then(setStreaks).catch(() => {});
  }, []);

  if (streaks.length === 0) return null;

  return (
    <div style={cardOuter}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ ...eyebrow, flexShrink: 0 }}>STREAK</span>

        <div style={{ display: 'flex', flex: 1, gap: 6 }}>
          {streaks.map(s => {
            const meta = SECTION_META[s.section];
            const color = flameColor(s.current_streak, s.completed_today);
            return (
              <button
                key={s.section}
                onClick={() => navigate(meta.page)}
                title={`${meta.label} — streak ${s.current_streak} giorni (max ${s.longest_streak})`}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  background: s.completed_today
                    ? 'color-mix(in srgb, var(--fb-accent) 10%, transparent)'
                    : 'var(--fb-bg-2)',
                  border: `1.5px solid ${s.completed_today ? 'var(--fb-accent)' : 'var(--fb-border)'}`,
                  borderRadius: 10, padding: '7px 4px', cursor: 'pointer',
                  transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
                }}
              >
                <span style={{
                  fontSize: 13,
                  filter: s.current_streak === 0 ? 'grayscale(1) opacity(0.35)' : undefined,
                }}>🔥</span>
                <span style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1 }}>
                  {s.current_streak}
                </span>
                <span style={{ fontSize: 11 }}>{meta.icon}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
