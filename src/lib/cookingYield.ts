// Estimate cooked yield from raw ingredients using name-based multipliers.
// Multipliers are cooked_weight / raw_weight (Italian + English keywords).

type Rule = { keywords: string[]; multiplier: number };

const RULES: Rule[] = [
  // Dry starches that absorb water
  { keywords: ['pasta', 'spaghett', 'penne', 'fusilli', 'rigatoni', 'maccheron', 'tagliatel', 'lasagn', 'linguin', 'farfall', 'orecchiett', 'noodle'], multiplier: 2.4 },
  { keywords: ['riso', 'rice', 'basmati', 'arborio', 'carnaroli', 'jasmine'], multiplier: 2.6 },
  { keywords: ['couscous', 'cous cous', 'bulgur', 'farro', 'orzo perlato', 'pearl barley'], multiplier: 2.8 },
  { keywords: ['quinoa'], multiplier: 3.0 },
  { keywords: ['lentic', 'lentil', 'ceci secch', 'fagioli secch', 'dry chickpea', 'dry bean'], multiplier: 2.5 },
  { keywords: ['avena', 'oats', 'oatmeal', 'porridge'], multiplier: 2.5 },
  { keywords: ['polenta'], multiplier: 4.0 },

  // Proteins that lose water/fat
  { keywords: ['pollo', 'chicken', 'tacchino', 'turkey'], multiplier: 0.72 },
  { keywords: ['manzo', 'beef', 'bovino', 'vitello', 'veal'], multiplier: 0.70 },
  { keywords: ['maiale', 'pork', 'suino'], multiplier: 0.72 },
  { keywords: ['salmon', 'salmone', 'tonno', 'tuna', 'merluzzo', 'cod', 'pesce', 'fish', 'trota', 'trout', 'orata', 'branzin'], multiplier: 0.78 },
  { keywords: ['gambero', 'shrimp', 'prawn', 'calamar', 'polpo', 'octopus'], multiplier: 0.80 },
  { keywords: ['bacon', 'pancetta', 'guanciale'], multiplier: 0.55 },
  { keywords: ['uovo', 'uova', 'egg'], multiplier: 0.90 },

  // Vegetables (boiled/sautéed average)
  { keywords: ['spinac', 'spinach', 'bietol', 'chard', 'kale', 'cavolo nero'], multiplier: 0.30 },
  { keywords: ['funghi', 'mushroom', 'champignon'], multiplier: 0.60 },
  { keywords: ['zucchin', 'zucchini', 'courgette', 'melanzan', 'eggplant', 'aubergine'], multiplier: 0.70 },
  { keywords: ['broccol', 'cavolfior', 'cauliflow', 'cavoletti'], multiplier: 0.85 },
  { keywords: ['carot', 'carrot', 'patat', 'potato'], multiplier: 0.92 },
  { keywords: ['pomodor', 'tomato'], multiplier: 0.85 },
  { keywords: ['cipoll', 'onion', 'porro', 'leek', 'aglio', 'garlic'], multiplier: 0.60 },
  { keywords: ['peperon', 'pepper', 'bell pepper'], multiplier: 0.80 },

  // Fats / sauces / liquids — mostly stay or evaporate slightly
  { keywords: ['olio', 'oil', 'butter', 'burro'], multiplier: 1.0 },
  { keywords: ['formaggio', 'cheese', 'parmig', 'parmesan', 'grana', 'pecorino', 'mozzarell', 'ricott'], multiplier: 0.95 },

  // Liquids absorbed/evaporated when cooking grains+water → mostly lost as steam after absorption
  { keywords: ['acqua', 'water'], multiplier: 0.0 },
  { keywords: ['brodo', 'broth', 'stock'], multiplier: 0.15 },
  { keywords: ['vino', 'wine'], multiplier: 0.10 },
  { keywords: ['latte', 'milk'], multiplier: 0.85 },
];

function multiplierFor(name: string, isLiquid?: number): number {
  const n = name.toLowerCase();
  for (const r of RULES) {
    if (r.keywords.some(k => n.includes(k))) return r.multiplier;
  }
  // Default: liquids mostly evaporate when cooking, solids ~unchanged
  if (isLiquid === 1) return 0.5;
  return 1.0;
}

export interface RawIngredient {
  name: string;
  grams: number;
  is_liquid?: number;
}

export interface YieldEstimate {
  total_g: number;
  matched_count: number; // ingredients matched by a specific rule (excluding default)
  total_count: number;
}

export function estimateCookedYield(ingredients: RawIngredient[]): YieldEstimate {
  let total = 0;
  let matched = 0;
  for (const ing of ingredients) {
    const n = ing.name.toLowerCase();
    const hit = RULES.some(r => r.keywords.some(k => n.includes(k)));
    if (hit) matched++;
    total += ing.grams * multiplierFor(ing.name, ing.is_liquid);
  }
  return { total_g: Math.round(total), matched_count: matched, total_count: ingredients.length };
}
