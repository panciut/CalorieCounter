import { useState, useEffect } from 'react';
import { api } from '../api';
import { useT } from '../i18n/useT';
import { cardOuter, eyebrow, serifItalic } from '../lib/fbUI';
import type { Achievement, UserLevel, PointEvent } from '../types';

const LEVELS = [
  { min: 0,    level: 1, name: 'Principiante' },
  { min: 100,  level: 2, name: 'Esploratore' },
  { min: 300,  level: 3, name: 'Abitudinario' },
  { min: 600,  level: 4, name: 'Campione' },
  { min: 1000, level: 5, name: 'LifeMaster' },
];

function LevelStatusCard({ status }: { status: UserLevel; t: (k: string) => string }) {
  const totalPoints = status.total_points ?? 0;
  const nextMin = status.next_level_min;
  const progress = nextMin != null && nextMin > 0 ? Math.min(totalPoints / nextMin, 1) : 1;
  const pct = Math.round(progress * 100);

  return (
    <div style={cardOuter}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Big level badge */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'var(--fb-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 28, color: '#fff', fontWeight: 700 }}>
            {status.level}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fb-text)', marginBottom: 2 }}>
            {status.level_name}
          </div>
          <div style={{ fontSize: 13, color: 'var(--fb-text-2)' }}>
            {totalPoints} punti totali
          </div>
        </div>
        {status.today_points > 0 && (
          <div style={{
            textAlign: 'center',
            padding: '8px 14px',
            borderRadius: 12,
            background: 'color-mix(in srgb, var(--fb-accent) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--fb-accent) 30%, transparent)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fb-accent)' }}>+{status.today_points}</div>
            <div style={{ fontSize: 10, color: 'var(--fb-text-3)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>oggi</div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {nextMin != null && (
        <>
          <div style={{
            height: 8,
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
          <div style={{ fontSize: 11, color: 'var(--fb-text-3)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{totalPoints} / {nextMin} pt</span>
            <span>{nextMin - totalPoints} punti al prossimo livello</span>
          </div>
        </>
      )}

      {/* Level ladder */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        {LEVELS.map(l => (
          <div
            key={l.level}
            style={{
              padding: '4px 10px',
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 600,
              background: status.level >= l.level
                ? 'color-mix(in srgb, var(--fb-accent) 18%, transparent)'
                : 'transparent',
              color: status.level >= l.level ? 'var(--fb-accent)' : 'var(--fb-text-3)',
              border: `1px solid ${status.level >= l.level ? 'color-mix(in srgb, var(--fb-accent) 40%, transparent)' : 'var(--fb-border)'}`,
            }}
          >
            Lv.{l.level} {l.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function AchievementCell({ a }: { a: Achievement; t: (k: string) => string }) {
  const unlocked = a.unlocked_at != null;

  return (
    <div style={{
      ...cardOuter,
      opacity: unlocked ? 1 : 0.5,
      position: 'relative',
      transition: 'opacity .2s ease',
    }}>
      {/* Icon */}
      <div style={{ fontSize: 32, textAlign: 'center', filter: unlocked ? 'none' : 'grayscale(1)' }}>
        {unlocked ? a.icon : '🔒'}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fb-text)', marginBottom: 3 }}>{a.name}</div>
        <div style={{ fontSize: 11, color: 'var(--fb-text-3)', lineHeight: 1.4 }}>{a.description}</div>
        {unlocked && a.unlocked_at && (
          <div style={{ fontSize: 10, color: 'var(--fb-accent)', marginTop: 6, fontWeight: 600 }}>
            {new Date(a.unlocked_at).toLocaleDateString()}
          </div>
        )}
        {!unlocked && (
          <div style={{ fontSize: 10, color: 'var(--fb-text-3)', marginTop: 6, fontStyle: 'italic' }}>
            Bloccato
          </div>
        )}
      </div>
    </div>
  );
}

function PointTimeline({ events }: { events: PointEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div style={cardOuter}>
      <span style={eyebrow}>PUNTI QUESTA SETTIMANA</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {events.map(e => (
          <div
            key={e.date}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 0',
              borderBottom: '1px solid var(--fb-border)',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--fb-text-2)' }}>{e.date}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fb-accent)' }}>
              +{e.total_points} pt
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AchievementsPage() {
  const { t } = useT();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [status, setStatus] = useState<UserLevel | null>(null);
  const [weekPoints, setWeekPoints] = useState<PointEvent[]>([]);

  useEffect(() => {
    api.gamification.getAchievements().then(setAchievements).catch(() => {});
    api.gamification.getStatus().then(setStatus).catch(() => {});
    api.gamification.getWeekPoints().then(setWeekPoints).catch(() => {});
  }, []);

  const unlocked = achievements.filter(a => a.unlocked_at != null);
  const locked = achievements.filter(a => a.unlocked_at == null);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={eyebrow}>{t('achievements.eyebrow')}</span>
        <span style={{ ...serifItalic, fontSize: 26, fontWeight: 400, color: 'var(--fb-text)', letterSpacing: -0.5, lineHeight: 1.1 }}>
          {t('achievements.title')}
        </span>
      </header>

      {/* Level status */}
      {status && <LevelStatusCard status={status} t={t} />}

      {/* Achievements grid */}
      {achievements.length > 0 && (
        <section>
          {unlocked.length > 0 && (
            <>
              <div style={{ ...eyebrow, marginBottom: 12 }}>SBLOCCATI ({unlocked.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
                {unlocked.map(a => <AchievementCell key={a.id} a={a} t={t} />)}
              </div>
            </>
          )}
          {locked.length > 0 && (
            <>
              <div style={{ ...eyebrow, marginBottom: 12 }}>DA SBLOCCARE ({locked.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {locked.map(a => <AchievementCell key={a.id} a={a} t={t} />)}
              </div>
            </>
          )}
        </section>
      )}

      {/* Week points timeline */}
      <PointTimeline events={weekPoints} />

    </div>
  );
}
