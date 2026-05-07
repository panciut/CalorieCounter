import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useT } from '../../i18n/useT';
import { cardOuter, eyebrow } from '../../lib/fbUI';
import { useNavigate } from '../../hooks/useNavigate';
import type { UserLevel } from '../../types';

export default function GamificationCard() {
  const { t } = useT();
  const { navigate } = useNavigate();
  const [status, setStatus] = useState<UserLevel | null>(null);

  useEffect(() => {
    api.gamification.getStatus().then(s => setStatus(s)).catch(() => {});
  }, []);

  if (!status) return null;

  const totalPoints = status.total_points ?? 0;
  const nextMin = status.next_level_min;
  const progress = nextMin != null && nextMin > 0 ? Math.min(totalPoints / nextMin, 1) : 1;
  const pct = Math.round(progress * 100);
  const lastAchievement = status.recent_achievements?.[0];

  return (
    <div
      style={{ ...cardOuter, cursor: 'pointer' }}
      onClick={() => navigate('achievements')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Level badge */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--fb-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: '#fff', fontWeight: 700 }}>
            {status.level}
          </span>
        </div>

        {/* Name + progress */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fb-text)' }}>
              {status.level_name}
            </span>
            <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>
              {totalPoints}{nextMin != null ? `/${nextMin}` : ''} pt
            </span>
            {status.today_points > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: 'var(--fb-accent)',
                background: 'color-mix(in srgb, var(--fb-accent) 12%, transparent)',
                borderRadius: 99, padding: '2px 6px', marginLeft: 'auto', flexShrink: 0,
              }}>
                +{status.today_points} oggi
              </span>
            )}
          </div>
          <div style={{ height: 5, borderRadius: 99, background: 'var(--fb-border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`, borderRadius: 99,
              background: 'var(--fb-accent)',
              transition: 'width .6s cubic-bezier(0.16,1,0.3,1)',
            }} />
          </div>
        </div>

        {/* Last achievement inline */}
        {lastAchievement && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--fb-bg)', border: '1px solid var(--fb-border)',
            borderRadius: 8, padding: '4px 8px', flexShrink: 0,
          }}>
            <span style={{ fontSize: 14 }}>{lastAchievement.icon}</span>
            <span style={{ fontSize: 11, color: 'var(--fb-text-2)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lastAchievement.name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
