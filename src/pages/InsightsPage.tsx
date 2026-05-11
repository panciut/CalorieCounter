// SP1 intentional deferrals:
// - Raw scatter points not returned by backend → contrast shown as 2-bar chart (highMean vs lowMean)
// - Milestone insights not surfaced (no milestone generation in SP1)
// - dataVersion memo cache skipped (computation is cheap enough for now)
import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '../api';
import { useT } from '../i18n/useT';
import { fbCard, fbEyebrow } from '../lib/fbStyles';
import type { InsightsResult, Insight, InsightContrast } from '../types';

// ── Module label map ──────────────────────────────────────────────────────────

const MODULE_KEYS: Record<string, string> = {
  food:     'insights.module.food',
  weight:   'insights.module.weight',
  workouts: 'insights.module.workouts',
  energy:   'insights.module.energy',
  water:    'insights.module.water',
};

// ── Confidence badge ──────────────────────────────────────────────────────────

const CONF_COLORS: Record<string, string> = {
  low:    'var(--fb-text-3)',
  medium: '#d97706',
  high:   '#16a34a',
};

function ConfidenceBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const { t } = useT();
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase',
      color: CONF_COLORS[level] ?? 'var(--fb-text-3)',
      border: `1px solid ${CONF_COLORS[level] ?? 'var(--fb-border)'}`,
      borderRadius: 4, padding: '1px 5px', flexShrink: 0,
    }}>
      {t(`insights.confidence.${level}`)}
    </span>
  );
}

// ── Contrast mini-chart ────────────────────────────────────────────────────────

function ContrastChart({ contrast }: { contrast: InsightContrast }) {
  const data = [
    { name: contrast.cutoffLabel, value: contrast.highMean != null ? Number(contrast.highMean.toFixed(2)) : 0 },
    { name: 'altri', value: contrast.lowMean != null ? Number(contrast.lowMean.toFixed(2)) : 0 },
  ];
  return (
    <ResponsiveContainer width="100%" height={80}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} width={30} />
        <Tooltip formatter={(v: number) => v.toFixed(2)} />
        <Bar dataKey="value" fill="#6366f1" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Single insight row ────────────────────────────────────────────────────────

const SEV_DOT: Record<string, string> = {
  strong: '#16a34a',
  notice: '#d97706',
  info:   '#9ca3af',
};

function InsightRow({ insight }: { insight: Insight }) {
  const contrast = insight.type === 'association'
    ? (insight.evidence.contrast ?? null)
    : null;

  return (
    <div style={{
      ...fbCard,
      display: 'flex', flexDirection: 'column', gap: 8,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: 999, marginTop: 5, flexShrink: 0,
          background: SEV_DOT[insight.severity] ?? '#9ca3af', display: 'inline-block',
        }} />
        <span style={{ fontSize: 14, lineHeight: 1.5, flex: 1 }}>{insight.text}</span>
        <ConfidenceBadge level={insight.confidence} />
      </div>
      {insight.actionHint && (
        <div style={{ fontSize: 12, opacity: 0.7, paddingLeft: 16 }}>
          {insight.actionHint}
        </div>
      )}
      {contrast && (
        <div style={{ paddingLeft: 16 }}>
          <ContrastChart contrast={contrast} />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { t } = useT();
  const [data, setData]       = useState<InsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState(false);

  useEffect(() => {
    api.insights.get()
      .then(r => { setData(r); setLoading(false); })
      .catch(() => { setErr(true); setLoading(false); });
  }, []);

  // Group insights by first relatedModules entry
  const groups: Array<{ moduleKey: string; items: Insight[] }> = [];
  if (data) {
    const seen = new Map<string, Insight[]>();
    for (const ins of data.insights) {
      const mod = ins.relatedModules[0] ?? 'other';
      if (!seen.has(mod)) seen.set(mod, []);
      seen.get(mod)!.push(ins);
    }
    for (const [mod, items] of seen.entries()) {
      groups.push({ moduleKey: mod, items });
    }
  }

  const dq = data?.dataQuality;

  return (
    <div style={{
      maxWidth: 720, margin: '0 auto', padding: '32px 24px 48px',
      fontFamily: 'var(--font-body)', color: 'var(--fb-text)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ ...fbEyebrow, marginBottom: 6 }}>INSIGHT</div>
        <h1 style={{
          margin: 0, fontSize: 26, fontWeight: 700,
          fontFamily: 'var(--font-display)', color: 'var(--fb-text)',
        }}>
          {t('insights.page.title')}
        </h1>
      </div>

      {/* Data quality strip */}
      {dq && (
        <div style={{
          background: 'var(--fb-bg-2)',
          border: '1px solid var(--fb-border)',
          borderRadius: 10, padding: '10px 14px',
          fontSize: 12, color: 'var(--fb-text-2)',
          marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <span>
            {t('insights.page.dataStrip')
              .replace('{n}', String(dq.windowDays))
              .replace('{m}', String(dq.daysWithAnyData))
              .replace('{k}', String(dq.reliableFoodDays))}
          </span>
          {dq.tierUnlocked < 3 && (
            <span style={{ color: 'var(--fb-accent)', fontWeight: 500 }}>
              {t('insights.page.tierHint')}
            </span>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ opacity: 0.5, fontSize: 14 }}>
          {t('onboarding.loading')}
        </div>
      )}

      {/* Error */}
      {!loading && err && (
        <div style={{ opacity: 0.6, fontSize: 14 }}>{t('insights.card.error')}</div>
      )}

      {/* Empty state */}
      {!loading && !err && data && data.insights.length === 0 && (
        <div style={{
          ...fbCard,
          padding: 32, textAlign: 'center',
          fontSize: 15, color: 'var(--fb-text-2)', lineHeight: 1.6,
        }}>
          {t('insights.page.empty')}
        </div>
      )}

      {/* Grouped insights */}
      {!loading && !err && groups.map(({ moduleKey, items }) => {
        const labelKey = MODULE_KEYS[moduleKey] ?? 'insights.module.other';
        return (
          <div key={moduleKey} style={{ marginBottom: 28 }}>
            <div style={{
              ...fbEyebrow, marginBottom: 10,
              borderBottom: '1px solid var(--fb-divider)', paddingBottom: 6,
            }}>
              {t(labelKey)}
            </div>
            {items.map(ins => <InsightRow key={ins.id} insight={ins} />)}
          </div>
        );
      })}

      {/* Footnote */}
      {!loading && !err && data && data.insights.length > 0 && (
        <div style={{
          marginTop: 32, fontSize: 11, color: 'var(--fb-text-3)',
          lineHeight: 1.5, fontStyle: 'italic',
        }}>
          {t('insights.page.footnote')}
        </div>
      )}
    </div>
  );
}
