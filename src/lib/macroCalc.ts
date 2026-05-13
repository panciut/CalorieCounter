import type { Settings, Food } from '../types';

/** Round n to `decimals` decimal places. Defaults to 1. */
export function roundTo(n: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Scale a food's per-100g nutrients to an arbitrary gram amount.
 * Returns calories, protein, carbs, fat, fiber. fiber falls back to 0 when missing.
 */
export function scaleNutrients<T extends Pick<Food, 'calories' | 'protein' | 'carbs' | 'fat'> & { fiber?: number | null }>(
  food: T,
  grams: number,
): { calories: number; protein: number; carbs: number; fat: number; fiber: number } {
  const r = grams / 100;
  return {
    calories: food.calories * r,
    protein:  food.protein  * r,
    carbs:    food.carbs    * r,
    fat:      food.fat      * r,
    fiber:    (food.fiber ?? 0) * r,
  };
}

export type BarColorClass = 'bar-green' | 'bar-yellow' | 'bar-orange' | 'bar-red';

export function getBarColor(
  actual: number,
  min: number,
  max: number,
  settings: Pick<Settings, 'tol_1' | 'tol_2' | 'tol_3'>,
): BarColorClass {
  if (actual >= min && actual <= max) return 'bar-green';
  const t1 = settings.tol_1 || 5;
  const t2 = settings.tol_2 || 10;
  const t3 = settings.tol_3 || 20;
  const dev = actual < min
    ? (min - actual) / min * 100
    : (actual - max) / max * 100;
  if (dev <= t1) return 'bar-green';
  if (dev <= t2) return 'bar-yellow';
  if (dev <= t3) return 'bar-orange';
  return 'bar-red';
}

export interface MacroRanges {
  protein_min: number; protein_max: number; protein_rec: number;
  fat_min: number;     fat_max: number;     fat_rec: number;
  carbs_min: number;   carbs_max: number;   carbs_rec: number;
  fiber_min: number;   fiber_max: number;   fiber_rec: number;
}

export function calcMacroRanges(weightKg: number, calories: number): MacroRanges {
  const protein_min = Math.round(weightKg * 1.6);
  const protein_max = Math.round(weightKg * 2.2);
  const protein_rec = Math.round(weightKg * 1.9);

  const fat_min = Math.round(Math.max(weightKg * 0.6, 45));
  const fat_max = Math.round(calories * 0.33 / 9);
  const fat_rec = Math.round(Math.max(weightKg * 0.7, calories * 0.28 / 9));

  // Carbs rec is the residual at recommended protein/fat, so the rec row sums
  // exactly to the calorie target. Min/max form a 35%–60%-of-kcal band, then
  // clamped so the rec stays inside — which also guarantees a feasible
  // (P, C, F) combination exists at the min and max corners.
  const carbs_rec = Math.max(0, Math.round((calories - protein_rec * 4 - fat_rec * 9) / 4));
  const carbs_min = Math.max(0, Math.min(Math.round(calories * 0.35 / 4), carbs_rec));
  const carbs_max = Math.max(Math.round(calories * 0.60 / 4), carbs_rec);

  return {
    protein_min, protein_max, protein_rec,
    fat_min, fat_max, fat_rec,
    carbs_min, carbs_max, carbs_rec,
    fiber_min: 25, fiber_max: 38, fiber_rec: 30,
  };
}

export function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const sumX  = xs.reduce((a, b) => a + b, 0);
  const sumY  = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}
