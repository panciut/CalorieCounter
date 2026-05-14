export const PRESETS = {
  balanced:    { proteinPct: 0.25, carbsPct: 0.50, fatPct: 0.25, fiberPer100: 2.5 },
  highProtein: { proteinPct: 0.40, carbsPct: 0.20, fatPct: 0.40, fiberPer100: 1.0 },
  highCarb:    { proteinPct: 0.10, carbsPct: 0.80, fatPct: 0.10, fiberPer100: 3.0 },
  highFat:     { proteinPct: 0.20, carbsPct: 0.05, fatPct: 0.75, fiberPer100: 1.0 },
  vegetable:   { proteinPct: 0.15, carbsPct: 0.65, fatPct: 0.20, fiberPer100: 6.0 },
} as const;

export type PresetKey = keyof typeof PRESETS;

export function macrosFromPreset(kcal: number, preset: typeof PRESETS[PresetKey]) {
  return {
    fat:     Math.round(kcal * preset.fatPct     / 9 * 100) / 100,
    carbs:   Math.round(kcal * preset.carbsPct   / 4 * 100) / 100,
    protein: Math.round(kcal * preset.proteinPct / 4 * 100) / 100,
    fiber:   Math.round(kcal * preset.fiberPer100 / 100 * 100) / 100,
  };
}

export const INPUT_CLASS = 'bg-bg border border-border rounded-lg px-2 py-1.5 text-text text-sm outline-none focus:border-accent w-full';

export const PRESET_LABELS: Record<PresetKey, string> = {
  balanced: 'foods.balanced',
  highProtein: 'foods.highProtein',
  highCarb: 'foods.highCarb',
  highFat: 'foods.highFat',
  vegetable: 'foods.vegetable',
};
