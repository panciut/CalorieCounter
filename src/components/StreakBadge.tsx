import { useT } from '../i18n/useT';

interface StreakBadgeProps {
  current: number;
  best: number;
  label?: string;
  emoji?: string;
}

export default function StreakBadge({ current, best, label, emoji }: StreakBadgeProps) {
  const { t } = useT();
  if (current === 0 && best === 0) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 12px', borderRadius: 99,
      border: '1px solid var(--fb-border)',
      background: 'color-mix(in srgb, var(--fb-accent) 10%, transparent)',
      fontSize: 12, whiteSpace: 'nowrap',
    }}>
      {emoji && <span>{emoji}</span>}
      <span style={{ fontWeight: 700, color: 'var(--fb-accent)' }}>{current}</span>
      <span style={{ color: 'var(--fb-text)' }}>{label ?? t('common.streakDays')}</span>
      {best > current && (
        <span style={{ color: 'var(--fb-text-3)', marginLeft: 2 }}>
          · {t('common.streakBest')} {best}
        </span>
      )}
    </span>
  );
}
