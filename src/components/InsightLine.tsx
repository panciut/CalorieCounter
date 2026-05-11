import type { Insight } from '../types';

const SEV_DOT: Record<string, string> = {
  strong: '#16a34a',
  notice: '#d97706',
  info:   '#9ca3af',
};

interface InsightLineProps {
  insight: Insight;
}

export function InsightLine({ insight }: InsightLineProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: 999, marginTop: 4, flexShrink: 0,
          background: SEV_DOT[insight.severity] ?? '#9ca3af',
          display: 'inline-block',
        }} />
        <span style={{ fontSize: 13, lineHeight: 1.5, flex: 1, color: 'var(--fb-text)' }}>
          {insight.text}
        </span>
      </div>
      {insight.actionHint && (
        <div style={{ fontSize: 12, opacity: 0.7, paddingLeft: 16 }}>
          💡 {insight.actionHint}
        </div>
      )}
    </div>
  );
}
