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
    <div style={cardOuter}>
      {/* Eyebrow */}
      <span style={eyebrow}>{t('gamification.eyebrow')}</span>

      {/* Level badge + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--fb-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 20, color: '#fff', fontWeight: 700 }}>
            {status.level}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fb-text)', marginBottom: 2 }}>
            {status.level_name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>
            {totalPoints} pt{nextMin != null ? ` / ${nextMin}` : ''}
          </div>
        </div>
        {status.today_points > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: 'var(--fb-accent)',
            background: 'color-mix(in srgb, var(--fb-accent) 12%, transparent)',
            borderRadius: 99,
            padding: '3px 8px',
            flexShrink: 0,
          }}>
            +{status.today_points} {t('gamification.todayPoints').replace('{n}', '').trim() || 'oggi'}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div style={{
        height: 6,
        borderRadius: 99,
        background: 'var(--fb-border)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: 99,
          background: 'var(--fb-accent)',
          transition: 'width .6s cubic-bezier(0.16,1,0.3,1)',
        }} />
      </div>

      {/* Last achievement */}
      {lastAchievement && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px',
          borderRadius: 8,
          background: 'var(--fb-bg)',
          border: '1px solid var(--fb-border)',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{lastAchievement.icon}</span>
          <span style={{ fontSize: 12, color: 'var(--fb-text-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lastAchievement.name}
          </span>
        </div>
      )}

      {/* CTA */}
      <button
        type="button"
        onClick={() => navigate('achievements')}
        style={{
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          color: 'var(--fb-accent)',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'var(--font-body)',
          textAlign: 'left',
          padding: 0,
        }}
      >
        {t('gamification.seeAll')} →
      </button>
    </div>
  );
}
