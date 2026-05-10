const { ipcMain } = require('electron');
const { getDb } = require('../db');
const { VALID_CATEGORIES } = require('../lib/offCategoryMap');

const VALID_CAT = VALID_CATEGORIES;

function normCategory(c) {
  if (!c || typeof c !== 'string') return 'other';
  const lower = c.toLowerCase();
  return VALID_CAT.has(lower) ? lower : 'other';
}

function registerFoodsIpc() {
  function attachPackages(db, foods) {
    const packages = db.prepare('SELECT id, food_id, grams, price FROM food_packages ORDER BY food_id, grams ASC').all();
    const byFood = new Map();
    for (const p of packages) {
      if (!byFood.has(p.food_id)) byFood.set(p.food_id, []);
      byFood.get(p.food_id).push({ id: p.id, food_id: p.food_id, grams: p.grams, price: p.price ?? null });
    }
    for (const f of foods) f.packages = byFood.get(f.id) ?? [];
    return foods;
  }

  function attachVariantCounts(db, foods) {
    const counts = db.prepare(`
      SELECT group_id, COUNT(*) AS n
      FROM foods
      WHERE group_id IS NOT NULL AND is_placeholder = 0
      GROUP BY group_id
    `).all();
    const byParent = new Map(counts.map(r => [r.group_id, r.n]));
    for (const f of foods) {
      if (f.group_id == null) {
        const n = byParent.get(f.id) ?? 0;
        if (n > 0) f.variant_count = n;
      }
    }
    return foods;
  }

  ipcMain.handle('foods:getAll', () => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM foods WHERE is_placeholder = 0 ORDER BY name').all();
    return attachVariantCounts(db, attachPackages(db, rows));
  });

  ipcMain.handle('foods:getFavorites', () => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM foods WHERE favorite = 1 AND is_placeholder = 0 ORDER BY name').all();
    return attachVariantCounts(db, attachPackages(db, rows));
  });

  ipcMain.handle('foods:add', (_, { name, calories, protein, carbs, fat, fiber, piece_grams, is_liquid, is_bulk, barcode, opened_days, discard_threshold_pct, price_per_100g, sugar, saturated_fat, sodium_mg, category, group_id }) => {
    const bulk = is_bulk ? 1 : 0;
    const piece = bulk ? null : (piece_grams || null);
    const result = getDb().prepare(
      'INSERT INTO foods (name, calories, protein, carbs, fat, fiber, piece_grams, is_liquid, is_bulk, barcode, opened_days, discard_threshold_pct, price_per_100g, sugar, saturated_fat, sodium_mg, category, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(name, calories, protein || 0, carbs || 0, fat || 0, fiber || 0, piece, is_liquid ? 1 : 0, bulk, barcode || null, opened_days ?? null, discard_threshold_pct ?? 5, price_per_100g ?? null, sugar ?? null, saturated_fat ?? null, sodium_mg ?? null, normCategory(category), group_id ?? null);
    return { id: result.lastInsertRowid };
  });

  ipcMain.handle('foods:delete', (_, { id }) => {
    const db = getDb();
    db.prepare('DELETE FROM log WHERE food_id = ?').run(id);
    db.prepare('DELETE FROM recipe_ingredients WHERE food_id = ?').run(id);
    db.prepare('DELETE FROM foods WHERE id = ?').run(id);
    return { ok: true };
  });

  ipcMain.handle('foods:update', (_, { id, name, calories, protein, carbs, fat, fiber, piece_grams, is_liquid, is_bulk, barcode, opened_days, discard_threshold_pct, price_per_100g, sugar, saturated_fat, sodium_mg, category, group_id }) => {
    const bulk = is_bulk ? 1 : 0;
    const piece = bulk ? null : (piece_grams || null);
    getDb().prepare(
      'UPDATE foods SET name=?, calories=?, protein=?, carbs=?, fat=?, fiber=?, piece_grams=?, is_liquid=?, is_bulk=?, barcode=?, opened_days=?, discard_threshold_pct=?, price_per_100g=?, sugar=?, saturated_fat=?, sodium_mg=?, category=?, group_id=? WHERE id=?'
    ).run(name, calories, protein || 0, carbs || 0, fat || 0, fiber || 0, piece, is_liquid ? 1 : 0, bulk, barcode || null, opened_days ?? null, discard_threshold_pct ?? 5, price_per_100g ?? null, sugar ?? null, saturated_fat ?? null, sodium_mg ?? null, normCategory(category), group_id ?? null, id);
    return { ok: true };
  });

  // Frequent foods: group by canonical (COALESCE(group_id, food_id)) so variants
  // of the same food count together. Returns the canonical row.
  ipcMain.handle('foods:getFrequent', (_, { limit }) => {
    const db = getDb();
    const rows = db.prepare(`
      SELECT f.*, agg.use_count
      FROM (
        SELECT COALESCE(f.group_id, f.id) AS canonical_id, COUNT(l.id) AS use_count
        FROM log l
        JOIN foods f ON f.id = l.food_id
        WHERE f.is_placeholder = 0
        GROUP BY canonical_id
      ) AS agg
      JOIN foods f ON f.id = agg.canonical_id
      WHERE f.is_placeholder = 0
      ORDER BY agg.use_count DESC
      LIMIT ?
    `).all(limit || 10);
    return attachVariantCounts(db, attachPackages(db, rows));
  });

  ipcMain.handle('foods:toggleFavorite', (_, { id }) => {
    const db = getDb();
    db.prepare('UPDATE foods SET favorite = 1 - favorite WHERE id = ?').run(id);
    const food = db.prepare('SELECT favorite FROM foods WHERE id = ?').get(id);
    return { favorite: food.favorite };
  });

  ipcMain.handle('foods:addPackage', (_, { food_id, grams, price }) => {
    const result = getDb().prepare('INSERT INTO food_packages (food_id, grams, price) VALUES (?, ?, ?)').run(food_id, grams, price ?? null);
    return { id: result.lastInsertRowid };
  });

  ipcMain.handle('foods:updatePackage', (_, { id, grams, price }) => {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as n FROM pantry WHERE package_id = ?').get(id).n;
    if (count > 0) return { ok: false, error: 'pack_in_use', batch_count: count };
    db.prepare('UPDATE food_packages SET grams = ?, price = ? WHERE id = ?').run(grams, price ?? null, id);
    return { ok: true };
  });

  ipcMain.handle('foods:deletePackage', (_, { id }) => {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as n FROM pantry WHERE package_id = ?').get(id).n;
    if (count > 0) return { ok: false, error: 'pack_in_use', batch_count: count };
    db.prepare('DELETE FROM food_packages WHERE id = ?').run(id);
    return { ok: true };
  });

  // ── Groups ──────────────────────────────────────────────────────────────────

  // Make `variant_id` a variant of `canonical_id`. Optionally recompute canonical
  // macros as the average of all variants (default: true).
  ipcMain.handle('foods:groupAs', (_, { variant_id, canonical_id, recompute = true }) => {
    const db = getDb();
    if (variant_id === canonical_id) return { ok: false, reason: 'self_reference' };
    // Prevent chains: if canonical itself is a variant, point to its canonical.
    const canonical = db.prepare('SELECT id, group_id FROM foods WHERE id = ?').get(canonical_id);
    if (!canonical) return { ok: false, reason: 'canonical_not_found' };
    const realCanonicalId = canonical.group_id ?? canonical.id;

    return db.transaction(() => {
      db.prepare('UPDATE foods SET group_id = ? WHERE id = ?').run(realCanonicalId, variant_id);
      // Also re-parent any existing variants of the now-variant
      db.prepare('UPDATE foods SET group_id = ? WHERE group_id = ?').run(realCanonicalId, variant_id);
      if (recompute) recomputeAverages(db, realCanonicalId);
      return { ok: true, canonical_id: realCanonicalId };
    })();
  });

  ipcMain.handle('foods:ungroup', (_, { variant_id }) => {
    getDb().prepare('UPDATE foods SET group_id = NULL WHERE id = ?').run(variant_id);
    return { ok: true };
  });

  ipcMain.handle('foods:recomputeGroupAverages', (_, { canonical_id }) => {
    const db = getDb();
    const ok = recomputeAverages(db, canonical_id);
    return { ok };
  });

  // Promote a brand-canonical (e.g. "Funghi Trifolati Coop") into a clean
  // generic canonical (e.g. "Funghi Trifolati") that doesn't impersonate any
  // single brand. Creates a new food row with averaged macros + same category +
  // no barcode, then re-parents the original canonical AND all its variants
  // under it.
  ipcMain.handle('foods:promoteToGeneric', (_, { from_id, name }) => {
    const db = getDb();
    const src = db.prepare('SELECT * FROM foods WHERE id = ?').get(from_id);
    if (!src) return { ok: false, reason: 'not_found' };
    if (src.group_id != null) return { ok: false, reason: 'not_a_canonical' };
    const newName = String(name || '').trim();
    if (!newName) return { ok: false, reason: 'empty_name' };

    return db.transaction(() => {
      // Collect every food that will become a sibling: the source itself + its
      // current variants. The new generic averages over all of them.
      const siblings = db.prepare(
        'SELECT id, calories, protein, carbs, fat, fiber FROM foods WHERE id = ? OR group_id = ?'
      ).all(from_id, from_id);
      if (siblings.length === 0) return { ok: false, reason: 'no_siblings' };
      const avg = (k) => Math.round((siblings.reduce((s, v) => s + (v[k] || 0), 0) / siblings.length) * 100) / 100;

      // Insert generic — no barcode, default sizing flags, copied category.
      const ins = db.prepare(`
        INSERT INTO foods (name, calories, protein, carbs, fat, fiber, piece_grams, is_liquid, is_bulk, barcode, opened_days, discard_threshold_pct, price_per_100g, sugar, saturated_fat, sodium_mg, category, group_id)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, NULL, NULL, 5, NULL, NULL, NULL, NULL, ?, NULL)
      `);
      let result;
      try {
        result = ins.run(newName, avg('calories'), avg('protein'), avg('carbs'), avg('fat'), avg('fiber'), src.is_liquid ?? 0, src.category ?? 'other');
      } catch (e) {
        if (/UNIQUE/i.test(e.message)) return { ok: false, reason: 'name_taken' };
        throw e;
      }
      const newId = result.lastInsertRowid;

      // Re-parent: all rows that were `from_id` itself OR pointed to it are
      // now under the new generic.
      db.prepare('UPDATE foods SET group_id = ? WHERE id = ?').run(newId, from_id);
      db.prepare('UPDATE foods SET group_id = ? WHERE group_id = ?').run(newId, from_id);

      return { ok: true, id: newId };
    })();
  });

  // Find similar canonicals to a candidate {name, calories, protein, carbs, fat}.
  // Used by the on-add prompt and the Suggested Groupings section.
  ipcMain.handle('foods:findSimilar', (_, { name, calories, protein, carbs, fat, exclude_id, nameMin = 0.4, macroPctMax = 0.20, limit = 8 }) => {
    const db = getDb();
    const candidates = db.prepare(`
      SELECT * FROM foods
      WHERE is_placeholder = 0 AND group_id IS NULL ${exclude_id ? 'AND id != ?' : ''}
    `).all(...(exclude_id ? [exclude_id] : []));

    const out = [];
    for (const c of candidates) {
      const ns = nameSimilarity(name || '', c.name);
      if (ns < nameMin) continue;
      const dPct = macroDeltaPct(
        { calories: calories || 0, protein: protein || 0, carbs: carbs || 0, fat: fat || 0 },
        c,
      );
      if (dPct > macroPctMax) continue;
      out.push({ ...c, nameScore: ns, macroDeltaPct: dPct });
    }
    out.sort((a, b) => (b.nameScore - a.nameScore) || (a.macroDeltaPct - b.macroDeltaPct));
    return attachVariantCounts(db, attachPackages(db, out.slice(0, limit)));
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function recomputeAverages(db, canonicalId) {
  const variants = db.prepare(
    'SELECT calories, protein, carbs, fat, fiber FROM foods WHERE group_id = ?'
  ).all(canonicalId);
  if (variants.length === 0) return false;
  const avg = (k) => variants.reduce((s, v) => s + (v[k] || 0), 0) / variants.length;
  db.prepare(`
    UPDATE foods SET
      calories = ?, protein = ?, carbs = ?, fat = ?, fiber = ?
    WHERE id = ?
  `).run(
    Math.round(avg('calories') * 100) / 100,
    Math.round(avg('protein')  * 100) / 100,
    Math.round(avg('carbs')    * 100) / 100,
    Math.round(avg('fat')      * 100) / 100,
    Math.round(avg('fiber')    * 100) / 100,
    canonicalId,
  );
  return true;
}

const STOPWORDS = new Set([
  'and', 'with', 'the', 'for', 'from', 'into', 'sans', 'free', 'low', 'high',
  'con', 'senza', 'alla', 'allo', 'agli', 'alle', 'dal', 'del', 'della', 'delle',
  'degli', 'dei', 'gli', 'lo', 'la', 'le', 'il', 'in', 'di', 'da', 'al', 'ai',
  'per', 'una', 'uno', 'sul', 'sulla', 'sugli', 'nel', 'nella',
]);

function tokens(s) {
  return (s ?? '').toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function nameSimilarity(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function macroDeltaPct(a, b) {
  // Worst-case relative delta across the four macros.
  const fields = ['calories', 'protein', 'carbs', 'fat'];
  let worst = 0;
  for (const f of fields) {
    const av = a[f] || 0;
    const bv = b[f] || 0;
    if (av === 0 && bv === 0) continue;
    const max = Math.max(Math.abs(av), Math.abs(bv), 1);
    const d = Math.abs(av - bv) / max;
    if (d > worst) worst = d;
  }
  return worst;
}

module.exports = registerFoodsIpc;
