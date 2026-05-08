const { ipcMain } = require('electron');
const { getDb } = require('../db');

const today = () => new Date().toISOString().slice(0, 10);
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Map current local hour to a meal slot (matches the time bands used elsewhere).
function currentMealSlot() {
  const h = new Date().getHours();
  if (h >= 4 && h < 10)  return 'Breakfast';
  if (h >= 10 && h < 15) return 'Lunch';
  if (h >= 18 && h < 23) return 'Dinner';
  return 'AfternoonSnack';
}

function attachPackages(db, foods) {
  if (foods.length === 0) return foods;
  const ids = foods.map(f => f.id);
  const placeholders = ids.map(() => '?').join(',');
  const packs = db.prepare(`SELECT id, food_id, grams, price FROM food_packages WHERE food_id IN (${placeholders}) ORDER BY food_id, grams`).all(...ids);
  const byFood = new Map();
  for (const p of packs) {
    if (!byFood.has(p.food_id)) byFood.set(p.food_id, []);
    byFood.get(p.food_id).push({ id: p.id, food_id: p.food_id, grams: p.grams, price: p.price ?? null });
  }
  for (const f of foods) f.packages = byFood.get(f.id) ?? [];
  return foods;
}

/** Build the entire suggestions bundle in one query batch. */
function buildSuggestions(db) {
  const t = today();
  const cutoff14 = daysAgo(14);
  const cutoff21 = daysAgo(21);
  const cutoff30 = daysAgo(30);

  // Per-canonical lifetime stats: total log count + last logged date.
  // Rolls up brand variants via COALESCE(group_id, food_id).
  const stats = db.prepare(`
    SELECT
      COALESCE(f.group_id, f.id) AS canonical_id,
      COUNT(*) AS total_count,
      MAX(l.date) AS last_date
    FROM log l
    JOIN foods f ON f.id = l.food_id
    WHERE f.is_placeholder = 0 AND l.status = 'logged'
    GROUP BY canonical_id
  `).all();

  const canonicalIds = stats.map(s => s.canonical_id);
  const canonicalById = new Map();
  if (canonicalIds.length > 0) {
    const ph = canonicalIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM foods WHERE id IN (${ph}) AND is_placeholder = 0`).all(...canonicalIds);
    for (const r of rows) canonicalById.set(r.id, r);
  }

  const forgottenFavorites = []; // ≥3 ever, last_date < 30 days ago
  const triedFew = [];           // exactly 2 ever, last_date < 21 days ago
  const rotationGap = [];        // exactly 1 ever, last_date < 14 days ago

  for (const s of stats) {
    const food = canonicalById.get(s.canonical_id);
    if (!food) continue;
    const enriched = { ...food, last_date: s.last_date, total_count: s.total_count };
    if (s.total_count >= 3 && s.last_date < cutoff30) {
      forgottenFavorites.push(enriched);
    } else if (s.total_count === 2 && s.last_date < cutoff21) {
      triedFew.push(enriched);
    } else if (s.total_count === 1 && s.last_date < cutoff14) {
      rotationGap.push(enriched);
    }
  }
  // Sort: most-frequent first, then most-recently-eaten
  forgottenFavorites.sort((a, b) => (b.total_count - a.total_count) || (b.last_date.localeCompare(a.last_date)));
  triedFew.sort((a, b) => b.last_date.localeCompare(a.last_date));
  rotationGap.sort((a, b) => b.last_date.localeCompare(a.last_date));

  attachPackages(db, forgottenFavorites);
  attachPackages(db, triedFew);
  attachPackages(db, rotationGap);

  // Combos for the current meal slot: pairs of (canonical_a, canonical_b)
  // co-occurring in the same (date, meal) ≥3 times.
  const slot = currentMealSlot();
  const combos = db.prepare(`
    WITH paired AS (
      SELECT
        l1.date AS d, l1.meal AS m,
        MIN(COALESCE(f1.group_id, f1.id), COALESCE(f2.group_id, f2.id)) AS a,
        MAX(COALESCE(f1.group_id, f1.id), COALESCE(f2.group_id, f2.id)) AS b
      FROM log l1
      JOIN log l2 ON l1.date = l2.date AND l1.meal = l2.meal AND l1.id < l2.id
      JOIN foods f1 ON f1.id = l1.food_id
      JOIN foods f2 ON f2.id = l2.food_id
      WHERE l1.status = 'logged' AND l2.status = 'logged'
        AND l1.meal = ?
        AND f1.is_placeholder = 0 AND f2.is_placeholder = 0
        AND COALESCE(f1.group_id, f1.id) != COALESCE(f2.group_id, f2.id)
    )
    SELECT a, b, COUNT(*) AS cnt
    FROM paired
    GROUP BY a, b
    HAVING cnt >= 3
    ORDER BY cnt DESC
    LIMIT 8
  `).all(slot);

  const comboFoodIds = new Set();
  for (const c of combos) { comboFoodIds.add(c.a); comboFoodIds.add(c.b); }
  const comboFoodMap = new Map();
  if (comboFoodIds.size > 0) {
    const ids = Array.from(comboFoodIds);
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM foods WHERE id IN (${ph})`).all(...ids);
    for (const r of rows) comboFoodMap.set(r.id, r);
  }
  const comboPairs = combos.map(c => ({
    cnt: c.cnt,
    a: comboFoodMap.get(c.a),
    b: comboFoodMap.get(c.b),
  })).filter(p => p.a && p.b);

  // Pantry-aware: foods (canonical or solo) with stock > 0 in the default pantry
  // that have been logged at least once before. Variants roll up to canonical.
  const pantryRows = db.prepare(`
    SELECT DISTINCT COALESCE(f.group_id, f.id) AS canonical_id,
      SUM(p.quantity_g) AS total_g
    FROM pantry p
    JOIN foods f ON f.id = p.food_id
    WHERE p.quantity_g > 0 AND f.is_placeholder = 0
    GROUP BY canonical_id
    HAVING total_g > 0
  `).all();
  const fromPantry = [];
  for (const r of pantryRows) {
    const food = canonicalById.get(r.canonical_id) || db.prepare('SELECT * FROM foods WHERE id = ?').get(r.canonical_id);
    if (!food) continue;
    fromPantry.push({ ...food, total_in_pantry_g: Math.round(r.total_g) });
  }
  fromPantry.sort((a, b) => b.total_in_pantry_g - a.total_in_pantry_g);
  attachPackages(db, fromPantry);

  // Never tried: foods in catalog that have never been logged (placeholder rows excluded).
  const neverTried = db.prepare(`
    SELECT f.* FROM foods f
    LEFT JOIN log l ON l.food_id = f.id
    WHERE f.is_placeholder = 0
      AND f.group_id IS NULL
      AND l.id IS NULL
    ORDER BY f.id DESC
    LIMIT 24
  `).all();
  attachPackages(db, neverTried);

  return {
    slot, // current meal slot used for combo detection
    forgottenFavorites,
    triedFew,
    rotationGap,
    combos: comboPairs,
    fromPantry,
    neverTried,
  };
}

function registerSuggestionsIpc() {
  ipcMain.handle('suggestions:getBundle', () => {
    const db = getDb();
    return buildSuggestions(db);
  });
}

module.exports = registerSuggestionsIpc;
