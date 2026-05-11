import { cardOuter, eyebrow } from '../lib/fbUI';
import { useT } from '../i18n/useT';
import { useModuleInsights } from '../hooks/useModuleInsights';
import { InsightLine } from './InsightLine';

interface ModuleInsightsCardProps {
  modules: string[];
}

export default function ModuleInsightsCard({ modules }: ModuleInsightsCardProps) {
  const { t } = useT();
  const { insights, loading } = useModuleInsights(modules);

  if (!loading && insights.length === 0) return null;

  return (
    <div style={{ ...cardOuter, gap: 10 }}>
      <div style={{ ...eyebrow }}>{t('common.correlations')}</div>
      {loading && (
        <div style={{ fontSize: 12, opacity: 0.5 }}>…</div>
      )}
      {!loading && insights.map(ins => (
        <InsightLine key={ins.id} insight={ins} />
      ))}
    </div>
  );
}
