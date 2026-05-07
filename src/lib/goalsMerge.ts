import type { GoalPlan, Settings } from '../types';

const GOAL_FIELDS = [
  'cal_min', 'cal_rec', 'cal_max',
  'protein_min', 'protein_rec', 'protein_max',
  'carbs_min', 'carbs_rec', 'carbs_max',
  'fat_min', 'fat_rec', 'fat_max',
  'fiber_min', 'fiber_rec', 'fiber_max',
  'weight_goal', 'water_goal',
  'tol_1', 'tol_2', 'tol_3',
] as const satisfies readonly (keyof Settings & keyof GoalPlan)[];

/** Returns a Settings-shaped object with goal-related fields taken from the plan
 *  when present, falling back to the base Settings otherwise. */
export function applyGoalPlan(base: Settings, plan: GoalPlan | null | undefined): Settings {
  if (!plan) return base;
  const out = { ...base };
  for (const f of GOAL_FIELDS) {
    const v = plan[f];
    if (v !== null && v !== undefined) (out[f] as number) = v;
  }
  return out;
}
