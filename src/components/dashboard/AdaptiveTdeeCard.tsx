import { useSettings } from '../../hooks/useSettings';
import { useT } from '../../i18n/useT';
import { fbCard, fbChipMuted } from '../../lib/fbStyles';
import type { TDEEResult } from '../../types';

interface Props {
  result: TDEEResult | null;
  calRec: number;
  onApply: (tdee: number) => void;
  onDismiss: (tdee: number) => void;
  onNavigateGoals: () => void;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  low: 'var(--fb-warn, #ff9800)',
  medium: 'var(--fb-text-2)',
  high: 'var(--fb-success, #4caf50)',
};

export default function AdaptiveTdeeCard({ result, calRec, onApply, onDismiss, onNavigateGoals }: Props) {
  const { t } = useT();
  const { settings } = useSettings();

  if (result == null || result.tdee == null) {
    if (result != null && result.data_points < 5) {
      return (
        <section style={{ ...fbCard, padding: '12px 16px' }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--fb-text-1)', fontWeight: 600 }}>
            {t('dash.tdee.title')}
          </span>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--fb-text-3)' }}>
            {t('dash.tdee.needMoreData')}
          </p>
        </section>
      );
    }
    return null;
  }

  const tdee = result.tdee;
  const drift = tdee - calRec;
  const showBanner = Math.abs(drift) >= 150
    && settings.tdee_auto_suggest !== 0
    && tdee !== settings.tdee_last_seen_value;

  return (
    <section style={{ ...fbCard, padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--fb-text-1)', fontWeight: 600 }}>
          {t('dash.tdee.title')}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--fb-text-1)' }}>
          {tdee} kcal
        </span>
        <span style={{ fontSize: 11, color: CONFIDENCE_COLOR[result.confidence] }}>
          {t(`dash.tdee.confidence.${result.confidence}`)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--fb-text-3)' }}>
          · {t('dash.tdee.days', { n: result.data_points })}
        </span>
      </div>

      {showBanner ? (
        <div style={{ background: 'var(--fb-surface-2, rgba(255,255,255,0.04))', borderRadius: 8, padding: '8px 10px', marginBottom: 4 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--fb-text-2)' }}>
            {t('dash.tdee.driftBanner', {
              calRec,
              tdee,
              sign: drift > 0 ? '+' : '',
              drift: Math.abs(drift),
            })}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onApply(tdee)}
              style={{ ...fbChipMuted, background: 'var(--fb-accent)', color: '#fff', border: 'none', fontSize: 12, padding: '4px 10px' }}
            >
              {t('dash.tdee.apply')}
            </button>
            <button
              onClick={() => onDismiss(tdee)}
              style={{ ...fbChipMuted, fontSize: 12, padding: '4px 10px' }}
            >
              {t('dash.tdee.dismiss')}
            </button>
          </div>
        </div>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--fb-success, #4caf50)' }}>
          ✓ {t('dash.tdee.inline')}
        </span>
      )}

      <div style={{ marginTop: 6 }}>
        <button
          onClick={onNavigateGoals}
          style={{ background: 'none', border: 0, color: 'var(--fb-accent)', cursor: 'pointer', fontSize: 11.5, padding: 0 }}
        >
          {t('dash.tdee.adjustInGoals')}
        </button>
      </div>
    </section>
  );
}
