import { useEffect, useState } from 'react';
import { api } from '../api';
import type { GoalPlan } from '../types';

const cache = new Map<string, GoalPlan | null>();
const inflight = new Map<string, Promise<GoalPlan | null>>();
const listeners = new Set<() => void>();

export function invalidateGoalsCache() {
  cache.clear();
  inflight.clear();
  for (const fn of listeners) fn();
}

function fetchForDate(date: string): Promise<GoalPlan | null> {
  if (cache.has(date)) return Promise.resolve(cache.get(date)!);
  if (inflight.has(date)) return inflight.get(date)!;
  const p = api.goals.getForDate(date).then(plan => {
    cache.set(date, plan);
    inflight.delete(date);
    return plan;
  });
  inflight.set(date, p);
  return p;
}

export function useGoalsForDate(date: string): GoalPlan | null {
  const [plan, setPlan] = useState<GoalPlan | null>(() => cache.get(date) ?? null);

  useEffect(() => {
    let cancelled = false;
    fetchForDate(date).then(p => { if (!cancelled) setPlan(p); });
    const refresh = () => {
      if (cancelled) return;
      fetchForDate(date).then(p => { if (!cancelled) setPlan(p); });
    };
    listeners.add(refresh);
    return () => { cancelled = true; listeners.delete(refresh); };
  }, [date]);

  return plan;
}

export function useGoalsForDateRange(start: string, end: string): Record<string, GoalPlan> {
  const [map, setMap] = useState<Record<string, GoalPlan>>({});

  useEffect(() => {
    let cancelled = false;
    api.goals.getForDateRange(start, end).then(m => { if (!cancelled) setMap(m); });
    const refresh = () => {
      if (cancelled) return;
      api.goals.getForDateRange(start, end).then(m => { if (!cancelled) setMap(m); });
    };
    listeners.add(refresh);
    return () => { cancelled = true; listeners.delete(refresh); };
  }, [start, end]);

  return map;
}
