import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Insight } from '../types';

export function useModuleInsights(modules: string[]): { insights: Insight[]; loading: boolean } {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.insights.get()
      .then(result => {
        const filtered = result.insights
          .filter(ins => ins.relatedModules.some(m => modules.includes(m)))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        setInsights(filtered);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // modules is intentionally not in deps (stable at call site)

  return { insights, loading };
}
